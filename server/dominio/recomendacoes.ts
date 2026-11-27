import { todos, json, ErroNegocio } from '../db.ts';
import { hoje, segundaDe, somarDias, arred } from '../util.ts';
import { carregarContexto, cardapioBase, itensDoCardapio, avaliar, montar, type Lote } from './cardapio.ts';

// Recomendações e apoio ao agricultor [RF-REC-01, 02, 03, 05].
// Fecha o ciclo demanda–oferta: aponta o que falta para o cardápio e sugere o plantio a quem
// declarou, na escuta, que quer e sabe produzir. Na Fase 1 tudo roda em simulação; nada é publicado ao agricultor.

export type Escuta = {
  quer?: number[]; sabe?: number[]; gostaria?: number[]; lucrativo?: number[];
  area_ha?: number; agua?: 'sim' | 'sazonal' | 'nao'; mao_de_obra?: number; observacao?: string;
};

const SEMANAS_POR_CICLO = 10; // horizonte usado para converter kg/semana em área de plantio

export const proximaSemana = () => somarDias(segundaDe(hoje()), 7);

/** Itens do cardápio que a oferta local não cobre [RF-REC-01]. */
export function lacunas(municipioId: number) {
  const base = cardapioBase(municipioId);
  if (!base) return { semana: proximaSemana(), itens: [] as any[] };
  const semana = proximaSemana();
  const ctx = carregarContexto(municipioId, semana);
  const av = avaliar(itensDoCardapio(base.id), ctx);
  // histórico: em quantas das últimas semanas aprovadas o item faltou
  const historico = todos<any>("SELECT metricas FROM cardapios WHERE municipio_id = ? AND tipo = 'proposta' AND status = 'aprovado' ORDER BY semana DESC LIMIT 6", municipioId).map((c) => json<any>(c.metricas, {}).lacunas ?? []);
  const itens = av.lacunas.map((l) => {
    const al = ctx.alimentos.get(l.alimento_id)!;
    const preco = ctx.precos.get(l.alimento_id)?.preco_kg ?? al.preco_medio ?? 0;
    return {
      ...l, grupo: al.grupo, semanas_com_falta: historico.filter((h: any[]) => h.some((x) => x.alimento_id === l.alimento_id)).length,
      semanas_avaliadas: historico.length, valor_semanal: arred(l.falta_kg * preco), dias_servidos: l.dias.length,
    };
  });
  return { semana, itens };
}

/** Sugestões de plantio por agricultor, considerando a escuta e a rentabilidade estimada [RF-REC-02]. */
export function recomendar(municipioId: number) {
  const { semana, itens } = lacunas(municipioId);
  const ctx = carregarContexto(municipioId, semana);
  const agricultores = todos<any>('SELECT id, nome, produtos, escuta FROM agricultores WHERE municipio_id = ?', municipioId).map((a) => ({
    ...a, produtos: json<number[]>(a.produtos, []), escuta: json<Escuta | null>(a.escuta, null),
  }));
  const areaUsada = new Map<number, number>();
  const recomendacoes: any[] = [];
  const semCandidato: string[] = [];

  for (const l of itens) {
    const al = ctx.alimentos.get(l.alimento_id)!;
    if (!al.produtividade_kg_ha) continue;
    const preco = ctx.precos.get(al.id)?.preco_kg ?? al.preco_medio ?? 0;
    const candidatos = agricultores
      .map((a) => {
        const e = a.escuta;
        if (!e) return null;
        if (al.precisa_agua && e.agua === 'nao') return null;
        const motivos: string[] = [];
        let pontos = 0;
        if (e.quer?.includes(al.id)) (pontos += 3), motivos.push('quer plantar');
        if (e.sabe?.includes(al.id)) (pontos += 2), motivos.push('sabe plantar');
        if (e.gostaria?.includes(al.id)) (pontos += 1), motivos.push('gostaria de plantar');
        if (e.lucrativo?.includes(al.id)) (pontos += 1), motivos.push('considera lucrativo');
        if (a.produtos.includes(al.id)) (pontos += 1), motivos.push('já produz');
        if (al.precisa_agua && e.agua === 'sazonal') pontos -= 1;
        const areaLivre = Math.max(0, (e.area_ha ?? 0) - (areaUsada.get(a.id) ?? 0));
        if (pontos <= 0 || areaLivre <= 0.01) return null;
        return { a, pontos, motivos, areaLivre };
      })
      .filter(Boolean)
      .sort((x, y) => y!.pontos - x!.pontos)
      .slice(0, 3) as { a: any; pontos: number; motivos: string[]; areaLivre: number }[];
    if (!candidatos.length) {
      semCandidato.push(al.nome);
      continue;
    }
    const totalPontos = candidatos.reduce((s, c) => s + c.pontos, 0);
    for (const c of candidatos) {
      const maxPelaArea = (c.areaLivre * al.produtividade_kg_ha) / SEMANAS_POR_CICLO;
      const kgSemana = arred(Math.min((l.falta_kg * c.pontos) / totalPontos, maxPelaArea), 1);
      if (kgSemana < 1) continue;
      const area = arred((kgSemana * SEMANAS_POR_CICLO) / al.produtividade_kg_ha, 4);
      areaUsada.set(c.a.id, (areaUsada.get(c.a.id) ?? 0) + area);
      const colheita = somarDias(hoje(), 7 + (al.ciclo_dias ?? 60));
      const mesColheita = Number(colheita.slice(5, 7)) - 1;
      recomendacoes.push({
        agricultor_id: c.a.id, agricultor: c.a.nome, alimento_id: al.id, alimento: al.nome, kg_semana: kgSemana, area_ha: area,
        plantar_ate: somarDias(hoje(), 7), colher_a_partir: colheita, na_safra: (al.safra[mesColheita] ?? 0.5) >= 0.5,
        receita_semanal: arred(kgSemana * preco), receita_ha_ciclo: arred(al.produtividade_kg_ha * preco), motivos: c.motivos, validade_dias: al.validade_dias ?? 7,
      });
    }
  }
  return { semana, lacunas: itens, recomendacoes, sem_candidato: semCandidato, agricultores_sem_escuta: agricultores.filter((a) => !a.escuta).map((a) => a.nome) };
}

/** Simula o efeito de adotar as recomendações antes de divulgá-las [RF-REC-03]. */
export function simularRecomendacoes(municipioId: number, selecao?: { agricultor_id: number; alimento_id: number }[]) {
  const base = cardapioBase(municipioId);
  if (!base) throw new ErroNegocio('Ainda não há cardápio-base para simular.');
  const r = recomendar(municipioId);
  const escolhidas = selecao?.length ? r.recomendacoes.filter((x) => selecao.some((s) => s.agricultor_id === x.agricultor_id && s.alimento_id === x.alimento_id)) : r.recomendacoes;
  const itensBase = itensDoCardapio(base.id);
  const antesCtx = carregarContexto(municipioId, r.semana);
  const depoisCtx = carregarContexto(municipioId, r.semana);
  const hipoteticos: Lote[] = escolhidas.map((x, i) => ({
    id: -1 - i, agricultor_id: x.agricultor_id, area_id: 0, alimento_id: x.alimento_id, saldo: x.kg_semana, data_colheita: somarDias(r.semana, -1),
    data_limite: somarDias(r.semana, 4 + x.validade_dias), coleta_inicio: '06:00', coleta_fim: '09:00',
  }));
  depoisCtx.lotes = [...depoisCtx.lotes, ...hipoteticos];
  // cardápio-base fiel mostra o efeito na compra; a alternativa combinada mostra o efeito nas trocas e na adequação
  const fiel = [avaliar(itensBase, antesCtx), avaliar(itensBase, depoisCtx)];
  const combinado = [avaliar(montar(itensBase, antesCtx, 'combinado'), antesCtx), avaliar(montar(itensBase, depoisCtx, 'combinado'), depoisCtx)];
  const par = (antes: number, depois: number) => ({ antes, depois, variacao: arred(depois - antes, 4) });
  const falta = (av: (typeof fiel)[number]) => arred(av.lacunas.reduce((s, l) => s + l.falta_kg, 0), 1);
  return {
    semana: r.semana, recomendacoes: escolhidas.length, kg_semana: arred(escolhidas.reduce((s, x) => s + x.kg_semana, 0), 1),
    pct_af: par(fiel[0].metricas.pct_af, fiel[1].metricas.pct_af), valor_af: par(fiel[0].metricas.valor_af, fiel[1].metricas.valor_af),
    custo: par(fiel[0].metricas.custo, fiel[1].metricas.custo), falta_kg: par(falta(fiel[0]), falta(fiel[1])),
    adequacao: par(combinado[0].metricas.adequacao, combinado[1].metricas.adequacao),
    substituicoes: par(combinado[0].metricas.substituicoes, combinado[1].metricas.substituicoes),
  };
}
