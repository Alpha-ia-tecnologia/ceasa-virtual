import { todos, um, json } from '../db.ts';
import { municipio, hoje, somarDias, segundaDe, diffDias, arred } from '../util.ts';
import { PISO_AF } from '../../compartilhado/dominio.ts';

// Painel do gestor e compliance da cota [RF-GES-01, 02, 05].

export function painel(municipioId: number) {
  const mun = municipio(municipioId);
  const ano = String(mun.exercicio);
  const previas = todos<any>('SELECT mes, valor FROM aquisicoes_previas WHERE municipio_id = ? AND mes LIKE ? ORDER BY mes', municipioId, `${ano}-%`);
  const valorPrevio = previas.reduce((s, p) => s + p.valor, 0);

  // adquirido = entregas validadas (alimento + frete embutido no preço)
  const liq = todos<any>(
    `SELECT l.valor_alimento, l.valor_frete, l.iss, l.liquido_prestador, l.status, p.data_entrega
     FROM liquidacoes l JOIN pedidos p ON p.id = l.pedido_id WHERE l.municipio_id = ? AND p.data_entrega LIKE ?`,
    municipioId, `${ano}-%`,
  );
  const valorPlataforma = liq.reduce((s, l) => s + l.valor_alimento + l.valor_frete, 0);
  const adquirido = valorPrevio + valorPlataforma;
  const emAndamento = um<any>(
    `SELECT COALESCE(SUM(i.quantidade_kg * (i.preco_kg + i.frete_kg)), 0) AS v FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
     WHERE p.municipio_id = ? AND p.data_entrega LIKE ? AND p.status IN ('gerado', 'roteirizado', 'coletado', 'divergencia')`,
    municipioId, `${ano}-%`,
  ).v as number;

  // série semanal e projeção até o fim do ano letivo
  const porSemana = new Map<string, number>();
  for (const l of liq) porSemana.set(segundaDe(l.data_entrega), (porSemana.get(segundaDe(l.data_entrega)) ?? 0) + l.valor_alimento + l.valor_frete);
  const semanaAtual = segundaDe(hoje());
  const serie = [];
  for (let s = somarDias(semanaAtual, -49); s <= semanaAtual; s = somarDias(s, 7)) serie.push({ semana: s, valor: arred(porSemana.get(s) ?? 0) });
  const recentes = serie.slice(-5, -1).filter((s) => s.valor > 0);
  const mesesPrevios = previas.length || 1;
  const ritmoSemanal = recentes.length ? recentes.reduce((s, x) => s + x.valor, 0) / recentes.length : valorPrevio / mesesPrevios / 4.33;
  const fimLetivo = `${ano}-${mun.params.fim_ano_letivo}`;
  const semanasRestantes = Math.max(0, Math.floor(diffDias(fimLetivo, hoje()) / 7));
  const projetado = adquirido + emAndamento + ritmoSemanal * semanasRestantes;
  const repasse = mun.repasse_fnde_anual || 1;
  const meta = repasse * PISO_AF;

  // indicadores operacionais
  const itens = um<any>(
    `SELECT COALESCE(SUM(i.quantidade_kg), 0) AS pedido, COALESCE(SUM(i.aceito_kg), 0) AS aceito, COALESCE(SUM(i.aceito_kg * i.frete_kg), 0) AS frete
     FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id WHERE p.municipio_id = ? AND p.status IN ('validado', 'pago', 'recusado')`,
    municipioId,
  );
  const val = um<any>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(v.no_prazo), 0) AS prazo, COALESCE(SUM(v.selo), 0) AS selos, COALESCE(AVG(v.pontuacao), 0) AS esg
     FROM validacoes v JOIN pedidos p ON p.id = v.pedido_id
     WHERE p.municipio_id = ? AND v.id = (SELECT MAX(id) FROM validacoes WHERE pedido_id = p.id) AND p.status IN ('validado', 'pago')`,
    municipioId,
  );
  const cardapios = todos<any>("SELECT metricas FROM cardapios WHERE municipio_id = ? AND tipo = 'proposta' AND status = 'aprovado'", municipioId).map((c) => json<any>(c.metricas, {}).metricas?.adequacao).filter((v) => typeof v === 'number');
  const ativos = um<any>('SELECT COUNT(DISTINCT agricultor_id) AS n FROM pedidos WHERE municipio_id = ? AND data_entrega >= ?', municipioId, somarDias(hoje(), -30)).n;
  const pagas = liq.filter((l) => l.status === 'paga');
  const funil = Object.fromEntries(todos<any>('SELECT status, COUNT(*) AS n FROM pedidos WHERE municipio_id = ? GROUP BY status', municipioId).map((f) => [f.status, f.n]));

  return {
    municipio: { id: mun.id, nome: mun.nome, exercicio: mun.exercicio, modo_piloto: !!mun.modo_piloto },
    cota: {
      repasse: mun.repasse_fnde_anual, piso: PISO_AF, meta: arred(meta), adquirido: arred(adquirido), previo: arred(valorPrevio), plataforma: arred(valorPlataforma),
      em_andamento: arred(emAndamento), pct: arred(adquirido / repasse, 4), falta: arred(Math.max(0, meta - adquirido)),
      projetado: arred(projetado), pct_projetado: arred(projetado / repasse, 4), ritmo_semanal: arred(ritmoSemanal), semanas_restantes: semanasRestantes,
      fim_letivo: fimLetivo, em_risco: projetado < meta,
    },
    indicadores: {
      frete_por_kg: itens.aceito ? arred(itens.frete / itens.aceito, 3) : null,
      entregas_no_prazo: val.total ? arred(val.prazo / val.total, 4) : null,
      perdas: itens.pedido ? arred(1 - itens.aceito / itens.pedido, 4) : null,
      adequacao_media: cardapios.length ? arred(cardapios.reduce((s: number, v: number) => s + v, 0) / cardapios.length, 4) : null,
      agricultores_ativos: ativos,
      renda_local: arred(pagas.reduce((s, l) => s + l.valor_alimento + l.liquido_prestador, 0)),
      iss_retido: arred(pagas.reduce((s, l) => s + l.iss, 0)),
      entregas_validadas: val.total, selos: val.selos, nota_esg: arred(val.esg, 1),
    },
    serie, funil,
    pendencias: {
      divergencias: funil.divergencia ?? 0,
      a_pagar: um<any>("SELECT COUNT(*) AS n FROM liquidacoes WHERE municipio_id = ? AND status IN ('pendente', 'falhou')", municipioId).n,
      bloqueadas: um<any>("SELECT COUNT(*) AS n FROM liquidacoes WHERE municipio_id = ? AND status = 'bloqueada'", municipioId).n,
      sem_rota: funil.gerado ?? 0,
    },
  };
}

/** Visão consolidada dos municípios de um consórcio [RF-COM-01]. */
export function consolidado(consorcioId: number) {
  return todos<any>('SELECT id FROM municipios WHERE consorcio_id = ? ORDER BY nome', consorcioId).map((m) => {
    const p = painel(m.id);
    return { ...p.municipio, repasse: p.cota.repasse, adquirido: p.cota.adquirido, pct: p.cota.pct, pct_projetado: p.cota.pct_projetado, em_risco: p.cota.em_risco, agricultores_ativos: p.indicadores.agricultores_ativos, renda_local: p.indicadores.renda_local };
  });
}
