import { todos, inserir, exec, tx, json, ErroNegocio } from '../db.ts';
import { municipio, minutos, hhmm, arred, diaSemana, semente, type Params } from '../util.ts';
import { registrar, type Autor } from '../trilha.ts';
import { provedorLocal, type Ponto, type ProvedorGeo } from '../integracoes/geo.ts';
import { MODAIS, type Modal, type TipoVia } from '../../compartilhado/dominio.ts';

// Roteirização de coleta nos sítios e entrega nas escolas [RF-LOG-01..06].
// Heurística construtiva para o problema de roteirização com janelas de tempo (VRPTW) com coleta e entrega:
// cada viagem recolhe nas plantações e depois entrega nas escolas, respeitando janelas, capacidade e alcance do modal.
// Cargas maiores que a capacidade do veículo são fracionadas em várias viagens [RF-LOG-02].

export type Carga = {
  id: number; kg: number; agricultor_id: number | null; refrigerado: boolean;
  origem: Ponto & { id: number; nome: string; janela: [number, number]; tipo_via: TipoVia };
  destino: Ponto & { id: number; nome: string; janela: [number, number] };
};
export type Veiculo = { id: number; nome: string; modal: Modal; capacidade_kg: number; caixa_termica: boolean; agricultor_id: number | null; base: Ponto };
export type Parada = {
  tipo: 'coleta' | 'entrega'; ref_id: number; nome: string; lat: number; lng: number;
  chegada: string; saida: string; espera_min: number; kg: number; cargas: number[]; tipo_via?: TipoVia;
};
export type Viagem = {
  veiculo_id: number; veiculo: string; modal: Modal; numero: number; inicio: string; fim: string;
  km_ida: number; km_ida_volta: number; carga_kg: number; custo_referencia: number;
  paradas: Parada[]; cargas: { carga_id: number; kg: number; custo_referencia: number }[];
};

const INICIO_JORNADA = minutos('05:00');
const FIM_JORNADA = minutos('18:00');
const SERVICO_MIN = 10; // tempo parado em cada coleta ou entrega
const FRACAO_MINIMA_KG = 5;
const LIMITE_SEM_CAIXA_MIN = 90; // itens refrigerados sem caixa térmica precisam chegar neste tempo

type ItemViagem = { carga: Carga; kg: number };
type Sim = { ok: true; paradas: Parada[]; inicio: number; fim: number; kmIda: number; kmDesloc: number; pos: Ponto; segmentos: { km: number; via: TipoVia }[] } | { ok: false; motivo: string };

function simular(v: Veiculo, itens: ItemViagem[], livreEm: number, pos: Ponto, geo: ProvedorGeo): Sim {
  const m = MODAIS[v.modal];
  const carga = itens.reduce((s, i) => s + i.kg, 0);
  if (carga > v.capacidade_kg + 1e-6) return { ok: false, motivo: 'capacidade do veículo' };
  const tempo = (km: number) => (km / m.kmh) * 60;

  const coletas = new Map<number, { p: Carga['origem']; itens: ItemViagem[] }>();
  const entregas = new Map<number, { p: Carga['destino']; itens: ItemViagem[] }>();
  for (const i of itens) {
    coletas.set(i.carga.origem.id, { p: i.carga.origem, itens: [...(coletas.get(i.carga.origem.id)?.itens ?? []), i] });
    entregas.set(i.carga.destino.id, { p: i.carga.destino, itens: [...(entregas.get(i.carga.destino.id)?.itens ?? []), i] });
  }
  // coletas pelo vizinho mais próximo; entregas pela janela que fecha primeiro
  const ordemColeta: { p: Carga['origem']; itens: ItemViagem[] }[] = [];
  const restantes = [...coletas.values()];
  let ref = pos;
  while (restantes.length) {
    restantes.sort((a, b) => geo.distanciaKm(ref, a.p) - geo.distanciaKm(ref, b.p));
    const prox = restantes.shift()!;
    ordemColeta.push(prox);
    ref = prox.p;
  }
  const ordemEntrega = [...entregas.values()].sort((a, b) => a.p.janela[1] - b.p.janela[1] || geo.distanciaKm(ref, a.p) - geo.distanciaKm(ref, b.p));

  const kmAtePrimeira = geo.distanciaKm(pos, ordemColeta[0].p);
  let t = Math.max(livreEm, ordemColeta[0].p.janela[0] - tempo(kmAtePrimeira));
  const inicio = t;
  let atual: Ponto = pos;
  let kmIda = 0;
  let primeiraColetaEm = 0;
  const paradas: Parada[] = [];
  const segmentos: { km: number; via: TipoVia }[] = [];

  for (const [n, c] of ordemColeta.entries()) {
    const km = geo.distanciaKm(atual, c.p);
    t += tempo(km);
    if (n > 0) (kmIda += km), segmentos.push({ km, via: c.p.tipo_via });
    const chegada = t;
    t = Math.max(t, c.p.janela[0]);
    if (t > c.p.janela[1]) return { ok: false, motivo: 'janela de coleta do agricultor' };
    if (n === 0) primeiraColetaEm = t;
    t += SERVICO_MIN;
    paradas.push({ tipo: 'coleta', ref_id: c.p.id, nome: c.p.nome, lat: c.p.lat, lng: c.p.lng, chegada: hhmm(chegada), saida: hhmm(t), espera_min: Math.round(t - SERVICO_MIN - chegada), kg: arred(c.itens.reduce((s, i) => s + i.kg, 0), 1), cargas: c.itens.map((i) => i.carga.id), tipo_via: c.p.tipo_via });
    atual = c.p;
  }
  let viaAnterior: TipoVia | null = ordemColeta[ordemColeta.length - 1].p.tipo_via;
  for (const e of ordemEntrega) {
    const km = geo.distanciaKm(atual, e.p);
    t += tempo(km);
    kmIda += km;
    segmentos.push({ km, via: viaAnterior ?? 'asfalto' }); // trecho que sai da zona rural herda a via da plantação; entre escolas, asfalto
    viaAnterior = null;
    const chegada = t;
    t = Math.max(t, e.p.janela[0]);
    if (t > e.p.janela[1]) return { ok: false, motivo: 'janela de recebimento da escola' };
    t += SERVICO_MIN;
    paradas.push({ tipo: 'entrega', ref_id: e.p.id, nome: e.p.nome, lat: e.p.lat, lng: e.p.lng, chegada: hhmm(chegada), saida: hhmm(t), espera_min: Math.round(t - SERVICO_MIN - chegada), kg: arred(e.itens.reduce((s, i) => s + i.kg, 0), 1), cargas: e.itens.map((i) => i.carga.id) });
    atual = e.p;
  }
  if (kmIda > m.alcance_km) return { ok: false, motivo: `alcance do modal (${m.rotulo.toLowerCase()})` };
  if (t > FIM_JORNADA) return { ok: false, motivo: 'fim da jornada' };
  if (!v.caixa_termica && itens.some((i) => i.carga.refrigerado) && t - primeiraColetaEm > LIMITE_SEM_CAIXA_MIN)
    return { ok: false, motivo: 'item refrigerado sem caixa térmica' };
  return { ok: true, paradas, inicio, fim: t, kmIda, kmDesloc: kmAtePrimeira, pos: atual, segmentos };
}

export type ResultadoRotas = ReturnType<typeof roteirizar>;

export function roteirizar(cargas: Carga[], veiculos: Veiculo[], params: Params, sede: Ponto) {
  const geo = provedorLocal(params.fator_tortuosidade);
  type Trecho = { itens: ItemViagem[]; sim: Extract<Sim, { ok: true }>; livreEm: number; pos: Ponto };
  const estado = new Map<number, Trecho[]>(veiculos.map((v) => [v.id, []]));
  const restante = new Map(cargas.map((c) => [c.id, c.kg]));
  const naoAtendidas: { carga_id: number; kg: number; motivo: string }[] = [];
  const fila = [...cargas].sort((a, b) => a.destino.janela[1] - b.destino.janela[1] || a.origem.janela[1] - b.origem.janela[1] || b.kg - a.kg);

  while (fila.length) {
    const c = fila[0];
    const falta = restante.get(c.id)!;
    let melhor: { v: Veiculo; estender: boolean; kg: number; sim: Extract<Sim, { ok: true }>; livreEm: number; pos: Ponto; custo: number } | null = null;
    const motivos = new Set<string>();
    for (const v of veiculos) {
      if (v.agricultor_id && v.agricultor_id !== c.agricultor_id) continue; // o agricultor-entregador leva só a própria produção
      const trechos = estado.get(v.id)!;
      const ultimo = trechos[trechos.length - 1];
      const opcoes = [
        ultimo && { estender: true, itens: ultimo.itens, livreEm: ultimo.livreEm, pos: ultimo.pos, anterior: ultimo.sim.kmIda + ultimo.sim.kmDesloc },
        { estender: false, itens: [] as ItemViagem[], livreEm: ultimo ? ultimo.sim.fim : INICIO_JORNADA, pos: ultimo ? ultimo.sim.pos : v.base, anterior: 0 },
      ].filter(Boolean) as { estender: boolean; itens: ItemViagem[]; livreEm: number; pos: Ponto; anterior: number }[];
      for (const o of opcoes) {
        const livre = v.capacidade_kg - o.itens.reduce((s, i) => s + i.kg, 0);
        const kg = Math.min(falta, livre);
        if (kg < Math.min(falta, FRACAO_MINIMA_KG)) {
          motivos.add('capacidade do veículo');
          continue;
        }
        const sim = simular(v, [...o.itens, { carga: c, kg }], o.livreEm, o.pos, geo);
        if (!sim.ok) {
          motivos.add(sim.motivo);
          continue;
        }
        const custo =
          (sim.kmIda + sim.kmDesloc - o.anterior) * params.frete_km[v.modal] +
          (kg < falta ? 0.5 : 0) + (sim.fim - o.livreEm) / 600 - (v.agricultor_id === c.agricultor_id && v.agricultor_id ? 2 : 0);
        if (!melhor || custo < melhor.custo) melhor = { v, estender: o.estender, kg, sim, livreEm: o.livreEm, pos: o.pos, custo };
      }
    }
    if (!melhor) {
      naoAtendidas.push({ carga_id: c.id, kg: arred(falta, 1), motivo: [...motivos][0] ?? 'nenhum prestador disponível' });
      fila.shift();
      continue;
    }
    const trechos = estado.get(melhor.v.id)!;
    const item = { carga: c, kg: melhor.kg };
    if (melhor.estender) {
      const u = trechos[trechos.length - 1];
      u.itens = [...u.itens, item];
      u.sim = melhor.sim;
    } else trechos.push({ itens: [item], sim: melhor.sim, livreEm: melhor.livreEm, pos: melhor.pos });
    restante.set(c.id, falta - melhor.kg);
    if (falta - melhor.kg < 0.01) fila.shift();
  }

  const viagens: Viagem[] = [];
  for (const v of veiculos)
    for (const [n, t] of estado.get(v.id)!.entries()) {
      // custo de referência: distância de ida e volta × índice do tipo de via × valor-base do modal [RF-LOG-04]
      const custo = t.sim.segmentos.reduce((s, g) => s + 2 * g.km * params.indices_via[g.via] * params.frete_km[v.modal], 0);
      const pesos = t.itens.map((i) => i.kg * Math.max(0.1, geo.distanciaKm(i.carga.origem, i.carga.destino)));
      const somaPesos = pesos.reduce((s, p) => s + p, 0) || 1;
      viagens.push({
        veiculo_id: v.id, veiculo: v.nome, modal: v.modal, numero: n + 1, inicio: hhmm(t.sim.inicio), fim: hhmm(t.sim.fim),
        km_ida: arred(t.sim.kmIda, 2), km_ida_volta: arred(t.sim.kmIda * 2, 2), carga_kg: arred(t.itens.reduce((s, i) => s + i.kg, 0), 1),
        custo_referencia: arred(custo), paradas: t.sim.paradas,
        cargas: t.itens.map((i, k) => ({ carga_id: i.carga.id, kg: arred(i.kg, 2), custo_referencia: arred((custo * pesos[k]) / somaPesos) })),
      });
    }

  // cenário-base: um veículo convencional sai da sede, recolhe tudo e entrega tudo [RF-LOG-05] — só indicador
  const pontosUnicos = <T extends Ponto & { id: number }>(ps: T[]) => [...new Map(ps.map((p) => [p.id, p])).values()];
  const atendidas = cargas.filter((c) => !naoAtendidas.some((n) => n.carga_id === c.id && n.kg >= c.kg - 0.01));
  let kmBase = 0;
  let onde: Ponto = sede;
  for (const grupo of [pontosUnicos(atendidas.map((c) => c.origem)), pontosUnicos(atendidas.map((c) => c.destino))]) {
    const faltam = [...grupo];
    while (faltam.length) {
      faltam.sort((a, b) => geo.distanciaKm(onde, a) - geo.distanciaKm(onde, b));
      const p = faltam.shift()!;
      kmBase += geo.distanciaKm(onde, p);
      onde = p;
    }
  }
  if (atendidas.length) kmBase += geo.distanciaKm(onde, sede);
  const custoRef = viagens.reduce((s, v) => s + v.custo_referencia, 0);
  const custoBase = kmBase * params.custo_km_convencional;

  return {
    viagens, nao_atendidas: naoAtendidas, viavel: naoAtendidas.length === 0,
    resumo: {
      cargas: cargas.length, kg: arred(cargas.reduce((s, c) => s + c.kg, 0), 1), viagens: viagens.length,
      km_ida_volta: arred(viagens.reduce((s, v) => s + v.km_ida_volta, 0), 1), custo_referencia: arred(custoRef),
      km_convencional: arred(kmBase, 1), custo_convencional: arred(custoBase), diferenca: arred(custoRef - custoBase),
    },
  };
}

// ---------- ligação com os cadastros ----------

export function veiculosDoMunicipio(municipioId: number): Veiculo[] {
  return todos<any>('SELECT * FROM prestadores WHERE municipio_id = ?', municipioId).map((p) => ({
    id: p.id, nome: p.nome, modal: p.modal, capacidade_kg: p.capacidade_kg, caixa_termica: !!p.caixa_termica, agricultor_id: p.agricultor_id, base: { lat: p.base_lat, lng: p.base_lng },
  }));
}

function janelaDaEscola(janelasJson: string, data: string): [number, number] | null {
  const j = json<{ dia: number; inicio: string; fim: string }[]>(janelasJson, []).find((x) => x.dia === diaSemana(data));
  return j ? [minutos(j.inicio), minutos(j.fim)] : null;
}

/** Planeja as rotas de uma data de entrega e grava o resultado. Replanejar substitui rotas ainda não iniciadas. */
export function planejarRotas(municipioId: number, data: string, autor: Autor) {
  const mun = municipio(municipioId);
  return tx(() => {
    // desfaz rotas planejadas cuja coleta ainda não começou
    const antigas = todos<any>(
      `SELECT r.id FROM rotas r WHERE r.municipio_id = ? AND r.data = ? AND r.status = 'planejada'
       AND NOT EXISTS (SELECT 1 FROM rota_pedidos rp JOIN pedidos p ON p.id = rp.pedido_id WHERE rp.rota_id = r.id AND p.status NOT IN ('gerado', 'roteirizado'))`,
      municipioId, data,
    );
    for (const r of antigas) {
      exec("UPDATE pedidos SET status = 'gerado' WHERE status = 'roteirizado' AND id IN (SELECT pedido_id FROM rota_pedidos WHERE rota_id = ?)", r.id);
      exec('DELETE FROM rotas WHERE id = ?', r.id);
    }
    const pedidos = todos<any>(
      `SELECT p.id, p.agricultor_id, p.coleta_inicio, p.coleta_fim, ar.id AS area_id, ar.nome AS area, ar.lat AS alat, ar.lng AS alng, ar.tipo_via,
              e.id AS escola_id, e.nome AS escola, e.lat AS elat, e.lng AS elng, e.janelas,
              (SELECT SUM(quantidade_kg) FROM pedido_itens WHERE pedido_id = p.id) AS kg,
              (SELECT COUNT(*) FROM pedido_itens i JOIN alimentos a ON a.id = i.alimento_id WHERE i.pedido_id = p.id AND a.armazenamento = 'refrigerado') AS refrigerados
       FROM pedidos p JOIN areas ar ON ar.id = p.area_id JOIN escolas e ON e.id = p.escola_id
       WHERE p.municipio_id = ? AND p.data_entrega = ? AND p.status = 'gerado'`,
      municipioId, data,
    );
    if (!pedidos.length) throw new ErroNegocio('Não há pedidos aguardando rota nesta data.');
    const semJanela: { carga_id: number; kg: number; motivo: string }[] = [];
    const cargas: Carga[] = [];
    for (const p of pedidos) {
      const janela = janelaDaEscola(p.janelas, data);
      if (!janela) {
        semJanela.push({ carga_id: p.id, kg: p.kg, motivo: 'a escola não tem janela de recebimento neste dia' });
        continue;
      }
      const ini = minutos(p.coleta_inicio);
      cargas.push({
        id: p.id, kg: p.kg, agricultor_id: p.agricultor_id, refrigerado: p.refrigerados > 0,
        origem: { id: p.area_id, nome: p.area, lat: p.alat, lng: p.alng, tipo_via: p.tipo_via, janela: [ini, Math.max(minutos(p.coleta_fim), ini + 30)] },
        destino: { id: p.escola_id, nome: p.escola, lat: p.elat, lng: p.elng, janela },
      });
    }
    const r = roteirizar(cargas, veiculosDoMunicipio(municipioId), mun.params, mun);
    r.nao_atendidas.push(...semJanela);
    const incompletos = new Set(r.nao_atendidas.map((n) => n.carga_id));
    for (const v of r.viagens) {
      const id = inserir('rotas', {
        municipio_id: municipioId, data, prestador_id: v.veiculo_id, viagem: v.numero, inicio: v.inicio, fim: v.fim, km_ida: v.km_ida,
        km_ida_volta: v.km_ida_volta, carga_kg: v.carga_kg, custo_referencia: v.custo_referencia, paradas: v.paradas, status: 'planejada',
      });
      for (const c of v.cargas) inserir('rota_pedidos', { rota_id: id, pedido_id: c.carga_id, kg: c.kg, custo_referencia: c.custo_referencia });
    }
    for (const c of cargas) if (!incompletos.has(c.id)) exec("UPDATE pedidos SET status = 'roteirizado' WHERE id = ?", c.id);
    registrar(autor, municipioId, 'Rotas planejadas', 'rota', null, { data, ...r.resumo, nao_atendidas: r.nao_atendidas.length });
    return { ...r, viavel: r.nao_atendidas.length === 0 };
  });
}

export function listarRotas(municipioId: number, f: { data?: string; prestador_id?: number; desde?: string }) {
  const cond = ['r.municipio_id = ?'];
  const par: unknown[] = [municipioId];
  if (f.data) (cond.push('r.data = ?'), par.push(f.data));
  if (f.desde) (cond.push('r.data >= ?'), par.push(f.desde));
  if (f.prestador_id) (cond.push('r.prestador_id = ?'), par.push(f.prestador_id));
  return todos<any>(
    `SELECT r.*, pr.nome AS prestador, pr.modal, pr.agricultor_id FROM rotas r JOIN prestadores pr ON pr.id = r.prestador_id
     WHERE ${cond.join(' AND ')} ORDER BY r.data DESC, r.inicio, r.id LIMIT 300`,
    ...par,
  ).map((r) => ({
    ...r, paradas: json<Parada[]>(r.paradas, []),
    pedidos: todos<any>('SELECT rp.pedido_id, rp.kg, rp.custo_referencia, p.status FROM rota_pedidos rp JOIN pedidos p ON p.id = rp.pedido_id WHERE rp.rota_id = ?', r.id),
  }));
}

/** Resumo do cenário-base da data, recalculado a partir dos pedidos roteirizados. */
export function comparativoDaData(municipioId: number, data: string) {
  const rotas = listarRotas(municipioId, { data });
  const mun = municipio(municipioId);
  const geo = provedorLocal(mun.params.fator_tortuosidade);
  const coletas = new Map<number, Ponto>();
  const entregas = new Map<number, Ponto>();
  for (const r of rotas) for (const p of r.paradas) (p.tipo === 'coleta' ? coletas : entregas).set(p.ref_id, p);
  let km = 0;
  let onde: Ponto = mun;
  for (const grupo of [[...coletas.values()], [...entregas.values()]]) {
    while (grupo.length) {
      grupo.sort((a, b) => geo.distanciaKm(onde, a) - geo.distanciaKm(onde, b));
      const p = grupo.shift()!;
      km += geo.distanciaKm(onde, p);
      onde = p;
    }
  }
  if (rotas.length) km += geo.distanciaKm(onde, mun);
  const custoRef = rotas.reduce((s, r) => s + r.custo_referencia, 0);
  return {
    viagens: rotas.length, km_ida_volta: arred(rotas.reduce((s, r) => s + r.km_ida_volta, 0), 1), kg: arred(rotas.reduce((s, r) => s + r.carga_kg, 0), 1),
    custo_referencia: arred(custoRef), km_convencional: arred(km, 1), custo_convencional: arred(km * mun.params.custo_km_convencional),
    diferenca: arred(custoRef - km * mun.params.custo_km_convencional),
  };
}

/** Bateria de cenários sintéticos em modo simulação, sem acionar prestadores [RF-LOG-06]. */
export function bateriaCenarios(municipioId: number, quantidade = 20, sementeInicial = 2026) {
  const mun = municipio(municipioId);
  const veiculos = veiculosDoMunicipio(municipioId);
  const areas = todos<any>('SELECT a.*, g.id AS agricultor_id FROM areas a JOIN agricultores g ON g.id = a.agricultor_id WHERE g.municipio_id = ?', municipioId);
  const escolas = todos<any>('SELECT * FROM escolas WHERE municipio_id = ?', municipioId);
  if (!areas.length || !escolas.length || !veiculos.length) throw new ErroNegocio('Cadastre escolas, áreas de plantio e prestadores antes de simular.');
  const cenarios = [];
  for (let n = 0; n < quantidade; n++) {
    const rnd = semente(sementeInicial + n * 7919);
    const dia = 1 + Math.floor(rnd() * 5);
    const total = 4 + Math.floor(rnd() * 11);
    const cargas: Carga[] = [];
    for (let i = 0; i < total; i++) {
      const a = areas[Math.floor(rnd() * areas.length)];
      const e = escolas[Math.floor(rnd() * escolas.length)];
      const j = json<{ dia: number; inicio: string; fim: string }[]>(e.janelas, []).find((x) => x.dia === dia);
      if (!j) continue;
      const ini = minutos('05:30') + Math.floor(rnd() * 4) * 30;
      cargas.push({
        id: i + 1, kg: arred(8 + rnd() * rnd() * 130, 1), agricultor_id: a.agricultor_id, refrigerado: rnd() < 0.15,
        origem: { id: a.id, nome: a.nome, lat: a.lat, lng: a.lng, tipo_via: a.tipo_via, janela: [ini, ini + 150] },
        destino: { id: e.id, nome: e.nome, lat: e.lat, lng: e.lng, janela: [minutos(j.inicio), minutos(j.fim)] },
      });
    }
    const r = roteirizar(cargas, veiculos, mun.params, mun);
    cenarios.push({ numero: n + 1, viavel: r.viavel, ...r.resumo, nao_atendidas: r.nao_atendidas, modais: [...new Set(r.viagens.map((v) => v.modal))] });
  }
  const viaveis = cenarios.filter((c) => c.viavel).length;
  return { quantidade, viaveis, taxa: viaveis / quantidade, cenarios };
}
