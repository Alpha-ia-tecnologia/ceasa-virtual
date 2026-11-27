import { todos, um, inserir, exec, tx, json, ErroNegocio } from '../db.ts';
import { municipio, somarDias, diffDias, isoInstante, arred, type Municipio } from '../util.ts';
import { registrar, type Autor } from '../trilha.ts';
import { PAPEIS, MODOS_CARDAPIO, type Papel, type ModoCardapio, type Grupo } from '../../compartilhado/dominio.ts';
import { mapaAlimentos, listarReferencias, nutrientesDe, somar, adequacao, ZERO, type Alimento, type Referencia, type Nutrientes } from './nutricao.ts';

// Motor do Cardápio Dinâmico [RF-CAR-01..09].
// Protótipo da Fase 1: heurística determinística de alocação e substituição, não um modelo treinado.
// O histórico de cardápios gerados, aprovados e executados fica guardado para treinar o modelo depois [RF-CAR-09].

export type ItemCardapio = {
  dia: number; preparacao: string; papel: Papel; alimento_id: number; percapita_g: number; substituiu_alimento_id?: number | null;
};
export type Lote = {
  id: number; agricultor_id: number; area_id: number; alimento_id: number; saldo: number;
  data_colheita: string; data_limite: string; coleta_inicio: string; coleta_fim: string;
};
export type Contexto = {
  mun: Municipio; semana: string; alimentos: Map<number, Alimento>; refs: Referencia[];
  alunos: Record<string, number>; totalAlunos: number; equivalentes: number;
  lotes: Lote[]; precos: Map<number, { preco_kg: number; frete_kg: number }>;
};

export const FAIXA_BASE = 'fund_6_10'; // a per capita do cardápio é escrita para esta faixa e escalada pelo fator das demais

export function equivalentesDe(alunos: Record<string, number>, refs: Referencia[]) {
  return refs.reduce((s, r) => s + (alunos[r.id] ?? 0) * r.fator, 0);
}

export function lotesDisponiveis(municipioId: number): Lote[] {
  return todos<any>(
    `SELECT id, agricultor_id, area_id, alimento_id, quantidade_kg - comprometido_kg AS saldo, data_colheita, data_limite, coleta_inicio, coleta_fim
     FROM ofertas WHERE municipio_id = ? AND status = 'ativa' AND quantidade_kg - comprometido_kg > 0.01 ORDER BY data_limite, id`,
    municipioId,
  );
}

export function precosVigentes(municipioId: number) {
  return new Map(
    todos<any>('SELECT alimento_id, preco_kg, frete_kg FROM precos WHERE municipio_id = ? AND vigente = 1', municipioId).map((p) => [
      p.alimento_id as number,
      { preco_kg: p.preco_kg as number, frete_kg: p.frete_kg as number },
    ]),
  );
}

export function carregarContexto(municipioId: number, semana: string): Contexto {
  const refs = listarReferencias();
  const alunos: Record<string, number> = {};
  for (const e of todos<any>('SELECT alunos FROM escolas WHERE municipio_id = ?', municipioId))
    for (const [f, n] of Object.entries(json<Record<string, number>>(e.alunos, {}))) alunos[f] = (alunos[f] ?? 0) + Number(n);
  return {
    mun: municipio(municipioId), semana, alimentos: mapaAlimentos(), refs, alunos,
    totalAlunos: Object.values(alunos).reduce((s, n) => s + n, 0),
    equivalentes: equivalentesDe(alunos, refs),
    lotes: lotesDisponiveis(municipioId), precos: precosVigentes(municipioId),
  };
}

/** Dia (1 a 5) em que chega à escola o alimento servido em `dia`. */
export function entregaDoDia(dia: number, diasEntrega: number[]) {
  const ordenados = [...diasEntrega].sort((a, b) => a - b);
  return ordenados.filter((d) => d <= dia).pop() ?? ordenados[0];
}

const loteServe = (l: Lote, dataEntrega: string, dataUso: string) => l.data_colheita <= dataEntrega && l.data_limite >= dataUso;

export type Avaliacao = ReturnType<typeof avaliar>;

/** Calcula adequação, custo, participação da agricultura familiar e aproveitamento de safra de um cardápio. */
export function avaliar(itens: ItemCardapio[], ctx: Contexto) {
  const dias = ctx.mun.params.dias_entrega;
  const saldo = new Map(ctx.lotes.map((l) => [l.id, l.saldo]));
  const porAlimento = new Map<number, Lote[]>();
  for (const l of ctx.lotes) porAlimento.set(l.alimento_id, [...(porAlimento.get(l.alimento_id) ?? []), l]);
  const uso = new Map<number, number>();

  const avaliados = [...itens]
    .sort((a, b) => a.dia - b.dia)
    .map((it) => {
      const al = ctx.alimentos.get(it.alimento_id);
      if (!al) throw new ErroNegocio(`Alimento ${it.alimento_id} não existe na base nutricional.`);
      const kg = (it.percapita_g * ctx.equivalentes) / 1000;
      const dataUso = somarDias(ctx.semana, it.dia - 1);
      const dataEntrega = somarDias(ctx.semana, entregaDoDia(it.dia, dias) - 1);
      let falta = kg;
      for (const l of porAlimento.get(al.id) ?? []) {
        if (falta <= 0.001) break;
        const s = saldo.get(l.id)!;
        if (s <= 0 || !loteServe(l, dataEntrega, dataUso)) continue;
        const usa = Math.min(s, falta);
        saldo.set(l.id, s - usa);
        uso.set(l.id, (uso.get(l.id) ?? 0) + usa);
        falta -= usa;
      }
      const afKg = kg - Math.max(0, falta);
      const preco = ctx.precos.get(al.id);
      const pKg = preco?.preco_kg ?? al.preco_medio ?? 0;
      const custoAf = afKg * (pKg + (preco?.frete_kg ?? 0));
      return {
        ...it, alimento: al.nome, grupo: al.grupo, agricola: !!al.agricola, kg: arred(kg, 1), af_kg: arred(afKg, 1),
        custo_af: custoAf, custo: custoAf + Math.max(0, falta) * pKg, sem_preco: !preco,
        substituiu: it.substituiu_alimento_id ? (ctx.alimentos.get(it.substituiu_alimento_id)?.nome ?? null) : null,
      };
    });

  const porDia = [1, 2, 3, 4, 5].map((dia) => {
    const n = avaliados.filter((i) => i.dia === dia).reduce<Nutrientes>((s, i) => somar(s, nutrientesDe(ctx.alimentos.get(i.alimento_id)!, i.percapita_g)), ZERO);
    let indice = 0, energia = 0, peso = 0;
    let partes: Record<string, number> = {};
    for (const r of ctx.refs) {
      const alunos = ctx.alunos[r.id] ?? 0;
      if (!alunos) continue;
      const nf = Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v * r.fator])) as Nutrientes;
      const a = adequacao(nf, r);
      indice += a.indice * alunos;
      energia += a.partes.energia * alunos;
      for (const [k, v] of Object.entries(a.partes)) partes[k] = (partes[k] ?? 0) + v * alunos;
      peso += alunos;
    }
    if (!peso) {
      const base = ctx.refs.find((r) => r.id === FAIXA_BASE) ?? ctx.refs[0];
      const a = adequacao(n, base);
      indice = a.indice; energia = a.partes.energia; partes = a.partes; peso = 1;
    }
    for (const k of Object.keys(partes)) partes[k] = arred(partes[k] / peso, 3);
    return { dia, nutrientes: Object.fromEntries(Object.entries(n).map(([k, v]) => [k, arred(v, 1)])) as Nutrientes, adequacao: indice / peso, energia: energia / peso, partes };
  });

  const custo = avaliados.reduce((s, i) => s + i.custo, 0);
  const custoAf = avaliados.reduce((s, i) => s + i.custo_af, 0);
  const fimSemana = somarDias(ctx.semana, 4);
  const aproveitaveis = ctx.lotes.filter((l) => l.data_colheita <= fimSemana && l.data_limite >= ctx.semana);
  const urgentes = aproveitaveis.filter((l) => diffDias(l.data_limite, ctx.semana) <= 6);
  const kgUsado = [...uso.values()].reduce((s, v) => s + v, 0);
  const kgAproveitavel = aproveitaveis.reduce((s, l) => s + l.saldo, 0);
  const kgUrgente = urgentes.reduce((s, l) => s + l.saldo, 0);
  const kgUrgenteUsado = urgentes.reduce((s, l) => s + (uso.get(l.id) ?? 0), 0);

  const lacunas = new Map<number, { alimento_id: number; alimento: string; falta_kg: number; dias: number[] }>();
  for (const i of avaliados) {
    const falta = i.kg - i.af_kg;
    if (!i.agricola || falta < 0.5) continue;
    const l = lacunas.get(i.alimento_id) ?? { alimento_id: i.alimento_id, alimento: i.alimento, falta_kg: 0, dias: [] };
    l.falta_kg = arred(l.falta_kg + falta, 1);
    l.dias.push(i.dia);
    lacunas.set(i.alimento_id, l);
  }

  return {
    itens: avaliados.map((i) => ({ ...i, custo: arred(i.custo), custo_af: arred(i.custo_af) })),
    dias: porDia.map((d) => ({ ...d, adequacao: arred(d.adequacao, 4), energia: arred(d.energia, 4) })),
    lacunas: [...lacunas.values()].sort((a, b) => b.falta_kg - a.falta_kg),
    metricas: {
      adequacao: arred(porDia.reduce((s, d) => s + d.adequacao, 0) / 5, 4),
      adequacao_calorica: arred(porDia.reduce((s, d) => s + d.energia, 0) / 5, 4),
      custo: arred(custo),
      custo_aluno_dia: ctx.totalAlunos ? arred(custo / (ctx.totalAlunos * 5), 3) : 0,
      valor_af: arred(custoAf),
      pct_af: custo ? arred(custoAf / custo, 4) : 0,
      contribuicao_cota: ctx.mun.repasse_fnde_anual ? arred(custoAf / ctx.mun.repasse_fnde_anual, 5) : 0,
      safra_kg: arred(kgUsado, 1),
      aproveitamento: kgAproveitavel ? arred(kgUsado / kgAproveitavel, 4) : 0,
      urgente_kg: arred(kgUrgenteUsado, 1),
      urgente_total_kg: arred(kgUrgente, 1),
      substituicoes: avaliados.filter((i) => i.substituiu_alimento_id).length,
    },
  };
}

// ---------- geração das propostas ----------

const compativel = (papel: Papel, grupo: Grupo) => (PAPEIS[papel].grupos as readonly Grupo[]).includes(grupo);
const mult5 = (g: number) => Math.max(5, Math.round(g / 5) * 5);

/** Ajusta a per capita da base energética e da leguminosa para aproximar a energia do dia da referência. */
function calibrarEnergia(itens: ItemCardapio[], ctx: Contexto): ItemCardapio[] {
  const ref = ctx.refs.find((r) => r.id === FAIXA_BASE) ?? ctx.refs[0];
  const saida = itens.map((i) => ({ ...i }));
  for (const dia of [1, 2, 3, 4, 5]) {
    const doDia = saida.filter((i) => i.dia === dia);
    const kcalDe = (i: ItemCardapio) => ((ctx.alimentos.get(i.alimento_id)?.kcal ?? 0) * i.percapita_g) / 100;
    const total = doDia.reduce((s, i) => s + kcalDe(i), 0);
    const ajustaveis = doDia.filter((i) => i.papel === 'base' || i.papel === 'leguminosa');
    const kcalAjustavel = ajustaveis.reduce((s, i) => s + kcalDe(i), 0);
    if (!kcalAjustavel) continue;
    const fator = Math.min(1.6, Math.max(0.6, (ref.kcal - (total - kcalAjustavel)) / kcalAjustavel));
    for (const i of ajustaveis) i.percapita_g = mult5(i.percapita_g * fator);
  }
  return saida;
}

/** Saldo utilizável de cada alimento para um dia, descontando o que já foi reservado nesta montagem. */
function criarReserva(ctx: Contexto) {
  const reservado = new Map<number, number>();
  const dias = ctx.mun.params.dias_entrega;
  const lotesDoDia = (alimentoId: number, dia: number) => {
    const uso = somarDias(ctx.semana, dia - 1);
    const entrega = somarDias(ctx.semana, entregaDoDia(dia, dias) - 1);
    return ctx.lotes.filter((l) => l.alimento_id === alimentoId && loteServe(l, entrega, uso));
  };
  return {
    saldo(alimentoId: number, dia: number) {
      return lotesDoDia(alimentoId, dia).reduce((s, l) => s + l.saldo, 0) - (reservado.get(alimentoId) ?? 0);
    },
    urgencia(alimentoId: number, dia: number) {
      const ls = lotesDoDia(alimentoId, dia);
      if (!ls.length) return 0;
      const diasAteVencer = Math.min(...ls.map((l) => diffDias(l.data_limite, somarDias(ctx.semana, dia - 1))));
      return 1 / (1 + Math.max(0, diasAteVencer));
    },
    reservar(alimentoId: number, kg: number) {
      reservado.set(alimentoId, (reservado.get(alimentoId) ?? 0) + kg);
    },
  };
}

/** Escolhe, entre os alimentos ofertados, o melhor para ocupar o lugar de `it` no dia. */
function candidatoLocal(it: ItemCardapio, ctx: Contexto, reserva: ReturnType<typeof criarReserva>, usadosNoDia: Set<number>, vezes: Map<number, number>, manterEnergia: boolean) {
  const original = ctx.alimentos.get(it.alimento_id)!;
  let melhor: { al: Alimento; percapita: number; nota: number } | null = null;
  for (const al of ctx.alimentos.values()) {
    if (!al.agricola || !compativel(it.papel, al.grupo) || usadosNoDia.has(al.id) || !al.kcal) continue;
    let percapita = al.percapita_padrao_g ?? it.percapita_g;
    if (manterEnergia && original.kcal) {
      const equivalente = (it.percapita_g * original.kcal) / al.kcal;
      percapita = Math.min(percapita * 2, Math.max(percapita * 0.5, equivalente));
    }
    percapita = mult5(percapita);
    const precisa = (percapita * ctx.equivalentes) / 1000;
    const saldo = reserva.saldo(al.id, it.dia);
    if (saldo < precisa) continue;
    const nota = 2 * reserva.urgencia(al.id, it.dia) + Math.min(1, saldo / (precisa * 4)) - 0.6 * (vezes.get(al.id) ?? 0) + (al.id === original.id ? 0.5 : 0);
    if (!melhor || nota > melhor.nota) melhor = { al, percapita, nota };
  }
  return melhor;
}

export function montar(base: ItemCardapio[], ctx: Contexto, modo: ModoCardapio): ItemCardapio[] {
  if (modo === 'demand') return base.map((i) => ({ ...i, substituiu_alimento_id: null }));
  const reserva = criarReserva(ctx);
  const vezes = new Map<number, number>();
  const saida: ItemCardapio[] = [];
  for (const dia of [1, 2, 3, 4, 5]) {
    const doDia = base.filter((i) => i.dia === dia);
    const usados = new Set<number>(modo === 'combinado' ? doDia.map((i) => i.alimento_id) : []);
    for (const it of doDia) {
      const al = ctx.alimentos.get(it.alimento_id)!;
      const precisa = (it.percapita_g * ctx.equivalentes) / 1000;
      const cobertoPelaBase = !!al.agricola && reserva.saldo(al.id, dia) >= precisa;
      // combinado: só mexe no que a oferta local não cobre; oferta do dia: reavalia todos os itens que não são complemento
      const trocar = it.papel !== 'complemento' && (modo === 'supply' || (!!al.agricola && !cobertoPelaBase));
      usados.delete(it.alimento_id);
      const cand = trocar ? candidatoLocal(it, ctx, reserva, usados, vezes, modo === 'combinado') : null;
      if (cand && cand.al.id !== it.alimento_id) {
        reserva.reservar(cand.al.id, (cand.percapita * ctx.equivalentes) / 1000);
        usados.add(cand.al.id);
        vezes.set(cand.al.id, (vezes.get(cand.al.id) ?? 0) + 1);
        saida.push({ dia, papel: it.papel, preparacao: cand.al.nome, alimento_id: cand.al.id, percapita_g: cand.percapita, substituiu_alimento_id: it.alimento_id });
      } else {
        if (al.agricola) reserva.reservar(al.id, Math.min(precisa, Math.max(0, reserva.saldo(al.id, dia))));
        usados.add(it.alimento_id);
        vezes.set(it.alimento_id, (vezes.get(it.alimento_id) ?? 0) + 1);
        saida.push({ ...it, substituiu_alimento_id: null });
      }
    }
  }
  return calibrarEnergia(saida, ctx);
}

function justificar(modo: ModoCardapio, av: Avaliacao, ctx: Contexto) {
  const m = av.metricas;
  const p = (v: number) => `${Math.round(v * 100)}%`;
  const trocas = av.itens.filter((i) => i.substituiu).slice(0, 3).map((i) => `${i.substituiu} por ${i.alimento}`);
  const partes: string[] = [MODOS_CARDAPIO[modo].descricao];
  if (trocas.length) partes.push(`Trocas: ${trocas.join('; ')}${m.substituicoes > 3 ? ` e mais ${m.substituicoes - 3}` : ''}.`);
  partes.push(`Adequação nutricional de ${p(m.adequacao)}; ${p(m.pct_af)} do valor vem da agricultura familiar.`);
  if (m.urgente_total_kg > 0) partes.push(`Usa ${Math.round(m.urgente_kg)} dos ${Math.round(m.urgente_total_kg)} kg que vencem nesta semana.`);
  if (av.lacunas.length) partes.push(`Sem oferta local suficiente de: ${av.lacunas.slice(0, 4).map((l) => l.alimento).join(', ')}.`);
  return partes.join(' ');
}

export function itensDoCardapio(cardapioId: number): ItemCardapio[] {
  return todos<ItemCardapio>('SELECT dia, preparacao, papel, alimento_id, percapita_g, substituiu_alimento_id FROM cardapio_itens WHERE cardapio_id = ? ORDER BY dia, id', cardapioId);
}

function gravarItens(cardapioId: number, itens: ItemCardapio[]) {
  exec('DELETE FROM cardapio_itens WHERE cardapio_id = ?', cardapioId);
  for (const i of itens)
    inserir('cardapio_itens', {
      cardapio_id: cardapioId, dia: i.dia, preparacao: i.preparacao, papel: i.papel, alimento_id: i.alimento_id,
      percapita_g: i.percapita_g, substituiu_alimento_id: i.substituiu_alimento_id ?? null,
    });
}

export function cardapioBase(municipioId: number) {
  return um<any>("SELECT * FROM cardapios WHERE municipio_id = ? AND tipo = 'base' AND status = 'aprovado' ORDER BY id DESC LIMIT 1", municipioId);
}

function validarItens(itens: ItemCardapio[]) {
  if (!Array.isArray(itens) || !itens.length) throw new ErroNegocio('O cardápio precisa de pelo menos um item.');
  for (const i of itens) {
    if (!(i.dia >= 1 && i.dia <= 5)) throw new ErroNegocio('Cada item precisa de um dia entre segunda e sexta.');
    if (!(i.papel in PAPEIS)) throw new ErroNegocio('Item com papel inválido na refeição.');
    if (!(Number(i.percapita_g) > 0 && Number(i.percapita_g) <= 500)) throw new ErroNegocio('A per capita deve ficar entre 1 e 500 g.');
  }
}

/** A nutricionista elabora o cardápio-base conforme o costume local [RF-CAR-06]. Cada versão fica no histórico. */
export function salvarBase(municipioId: number, titulo: string, itens: ItemCardapio[], autor: Autor) {
  validarItens(itens);
  return tx(() => {
    exec("UPDATE cardapios SET status = 'arquivado' WHERE municipio_id = ? AND tipo = 'base' AND status = 'aprovado'", municipioId);
    const id = inserir('cardapios', {
      municipio_id: municipioId, titulo: titulo || 'Cardápio-base', tipo: 'base', status: 'aprovado',
      criado_por: autor.nome, criado_em: isoInstante(), aprovado_por: autor.nome, aprovado_em: isoInstante(),
    });
    gravarItens(id, itens);
    registrar(autor, municipioId, 'Cardápio-base elaborado', 'cardapio', id, { itens: itens.length });
    return id;
  });
}

/** Gera as três alternativas da semana, ordenadas pela nota composta [RF-CAR-01, RF-CAR-05]. */
export function gerarPropostas(municipioId: number, semana: string, autor: Autor) {
  const base = cardapioBase(municipioId);
  if (!base) throw new ErroNegocio('A nutricionista precisa elaborar o cardápio-base antes de gerar propostas.');
  if (um("SELECT 1 FROM cardapios WHERE municipio_id = ? AND semana = ? AND tipo = 'proposta' AND status = 'aprovado'", municipioId, semana))
    throw new ErroNegocio('Já existe um cardápio aprovado para esta semana.');
  const ctx = carregarContexto(municipioId, semana);
  if (!ctx.totalAlunos) throw new ErroNegocio('Cadastre as escolas e o número de alunos antes de gerar o cardápio.');
  const itensBase = itensDoCardapio(base.id);
  const alternativas = (Object.keys(MODOS_CARDAPIO) as ModoCardapio[]).map((modo) => {
    const itens = montar(itensBase, ctx, modo);
    return { modo, itens, av: avaliar(itens, ctx) };
  });
  const menorCusto = Math.min(...alternativas.map((a) => a.av.metricas.custo));
  const w = ctx.mun.params.pesos_ranking;
  const geracao = `${semana}#${isoInstante()}`;
  return tx(() => {
    exec("UPDATE cardapios SET status = 'arquivado' WHERE municipio_id = ? AND semana = ? AND tipo = 'proposta' AND status = 'rascunho'", municipioId, semana);
    const ids = alternativas
      .map((a) => {
        const m = a.av.metricas;
        const nota = w.adequacao * m.adequacao + w.af * m.pct_af + w.custo * (m.custo ? menorCusto / m.custo : 0) + w.safra * m.aproveitamento;
        return { ...a, nota: arred(nota, 4) };
      })
      .sort((a, b) => b.nota - a.nota)
      .map((a) => {
        const id = inserir('cardapios', {
          municipio_id: municipioId, semana, titulo: `${MODOS_CARDAPIO[a.modo].rotulo} — semana de ${semana.split('-').reverse().join('/')}`,
          tipo: 'proposta', modo: a.modo, status: 'rascunho', geracao,
          metricas: { ...a.av, nota: a.nota }, justificativa: justificar(a.modo, a.av, ctx), criado_por: autor.nome, criado_em: isoInstante(),
        });
        gravarItens(id, a.itens);
        return id;
      });
    registrar(autor, municipioId, 'Propostas de cardápio geradas', 'cardapio', ids[0], { semana, cardapio_base: base.id, propostas: ids });
    return ids;
  });
}

export function buscarCardapio(municipioId: number, id: number) {
  const c = um<any>('SELECT * FROM cardapios WHERE id = ? AND municipio_id = ?', id, municipioId);
  if (!c) throw new ErroNegocio('Cardápio não encontrado.', 404);
  return c;
}

/** Ajustes da nutricionista; a adequação é recalculada a cada alteração [RF-CAR-06]. */
export function ajustarItens(municipioId: number, id: number, itens: ItemCardapio[], autor: Autor) {
  const c = buscarCardapio(municipioId, id);
  if (c.tipo !== 'proposta' || c.status !== 'rascunho') throw new ErroNegocio('Só propostas ainda não aprovadas podem ser ajustadas.');
  validarItens(itens);
  const ctx = carregarContexto(municipioId, c.semana);
  const av = avaliar(itens, ctx);
  tx(() => {
    gravarItens(id, itens);
    exec('UPDATE cardapios SET metricas = ? WHERE id = ?', { ...av, nota: json<any>(c.metricas, {}).nota ?? null, ajustado: true }, id);
    registrar(autor, municipioId, 'Cardápio ajustado pela nutricionista', 'cardapio', id, { adequacao: av.metricas.adequacao });
  });
  return av;
}

/** Só cardápio aprovado gera compra [RF-CAR-06]; a aprovação grava a lista de necessidades por escola [RF-CAR-07]. */
export function aprovar(municipioId: number, id: number, autor: Autor) {
  const c = buscarCardapio(municipioId, id);
  if (c.tipo !== 'proposta' || c.status !== 'rascunho') throw new ErroNegocio('Este cardápio não está aguardando aprovação.');
  const ctx = carregarContexto(municipioId, c.semana);
  const itens = itensDoCardapio(id);
  const av = avaliar(itens, ctx);
  const escolas = todos<any>('SELECT id, alunos FROM escolas WHERE municipio_id = ?', municipioId);
  tx(() => {
    exec("UPDATE cardapios SET status = 'arquivado' WHERE municipio_id = ? AND semana = ? AND tipo = 'proposta' AND status = 'rascunho' AND id <> ?", municipioId, c.semana, id);
    exec("UPDATE cardapios SET status = 'aprovado', aprovado_por = ?, aprovado_em = ?, metricas = ? WHERE id = ?", autor.nome, isoInstante(), { ...av, nota: json<any>(c.metricas, {}).nota ?? null }, id);
    exec('DELETE FROM necessidades WHERE cardapio_id = ?', id);
    for (const e of escolas) {
      const eq = equivalentesDe(json<Record<string, number>>(e.alunos, {}), ctx.refs);
      if (!eq) continue;
      for (const i of itens)
        inserir('necessidades', { cardapio_id: id, escola_id: e.id, alimento_id: i.alimento_id, dia: i.dia, quantidade_kg: arred((i.percapita_g * eq) / 1000, 2) });
    }
    registrar(autor, municipioId, 'Cardápio aprovado', 'cardapio', id, { semana: c.semana, modo: c.modo, adequacao: av.metricas.adequacao, pct_af: av.metricas.pct_af });
  });
  return av;
}
