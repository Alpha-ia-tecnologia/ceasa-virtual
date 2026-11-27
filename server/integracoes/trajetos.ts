// Traçado das rotas sobre a malha viária real (OpenStreetMap, via um servidor OSRM público).
// Serve para desenhar o mapa e para a simulação do percurso. O planejamento e o custo de referência
// continuam usando o provedor local (geo.ts), que é determinístico e funciona sem internet [RF-LOG-03].
// Sem conexão, devolve um traçado aproximado em linha, e a interface avisa.

import { createHash } from 'node:crypto';
import { um, exec } from '../db.ts';
import type { Modal } from '../../compartilhado/dominio.ts';
import type { Ponto } from './geo.ts';

type LatLng = [number, number];
export type Trajeto = {
  fonte: 'malha_viaria' | 'aproximado';
  km: number | null;
  geometria: LatLng[];
  /** Índice, na geometria, de cada ponto pedido (já ajustado à estrada mais próxima). */
  marcos: number[];
  /** Trecho fora da malha mapeada: do ponto cadastrado até a estrada mais próxima (vicinal, carreador, quintal). */
  acessos: [LatLng, LatLng][];
};

// Perfis do servidor de rotas por meio de transporte. Carroça usa o perfil de bicicleta (evita rodovias,
// aceita estradas de terra); cavalo e entrega a pé usam o perfil de pedestre.
const PERFIL: Record<Modal, 'car' | 'bike' | 'foot'> = { a_pe: 'foot', bicicleta: 'bike', carroca: 'bike', cavalo: 'foot', moto: 'car', carro_leve: 'car' };
const SERVIDOR = (process.env.CEASA_ROTEADOR ?? 'https://routing.openstreetmap.de').replace(/\/$/, '');
const OFFLINE = process.env.CEASA_MAPAS_OFFLINE === '1' || process.env.CEASA_DB === ':memory:';
const ACESSO_MIN_M = 40;

const emAndamento = new Map<string, Promise<Trajeto>>();
let falhouEm = 0;
let fila: Promise<unknown> = Promise.resolve();

/** Uma requisição por vez ao servidor público, para respeitar a política de uso. */
function enfileirar<T>(f: () => Promise<T>): Promise<T> {
  const p = fila.then(f, f);
  fila = p.catch(() => undefined);
  return p;
}

function aproximado(pontos: Ponto[]): Trajeto {
  return { fonte: 'aproximado', km: null, geometria: pontos.map((p) => [p.lat, p.lng]), marcos: pontos.map((_, i) => i), acessos: [] };
}

const d2 = (a: LatLng, b: LatLng) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

export async function tracarTrajeto(pontos: Ponto[], modal: Modal): Promise<Trajeto> {
  if (pontos.length < 2 || OFFLINE) return aproximado(pontos);
  const perfil = PERFIL[modal] ?? 'car';
  const coords = pontos.map((p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const chave = createHash('sha1').update(`${perfil}|${coords}`).digest('hex');
  const salvo = um<{ dados: string }>('SELECT dados FROM trajetos_cache WHERE chave = ?', chave);
  if (salvo) return JSON.parse(salvo.dados);
  if (Date.now() - falhouEm < 60_000) return aproximado(pontos); // não insiste logo depois de uma falha
  if (emAndamento.has(chave)) return emAndamento.get(chave)!;

  const tarefa = enfileirar(async () => {
    const url = `${SERVIDOR}/routed-${perfil}/route/v1/driving/${coords}?overview=full&geometries=geojson&continue_straight=false`;
    const r = await fetch(url, { headers: { 'User-Agent': 'ceasa-virtual-sandbox/0.1 (ambiente de simulacao)' }, signal: AbortSignal.timeout(12_000) });
    if (!r.ok) throw new Error(`roteador respondeu ${r.status}`);
    const d: any = await r.json();
    if (d.code !== 'Ok' || !d.routes?.[0]) throw new Error(`roteador: ${d.code}`);
    const geometria: LatLng[] = d.routes[0].geometry.coordinates.map(([lng, lat]: number[]) => [lat, lng]);
    const marcos: number[] = [];
    const acessos: [LatLng, LatLng][] = [];
    let desde = 0;
    d.waypoints.forEach((w: any, i: number) => {
      const alvo: LatLng = [w.location[1], w.location[0]];
      let melhor = desde;
      for (let k = desde; k < geometria.length; k++) if (d2(geometria[k], alvo) < d2(geometria[melhor], alvo)) melhor = k;
      marcos.push(melhor);
      desde = melhor;
      if (w.distance > ACESSO_MIN_M) acessos.push([[pontos[i].lat, pontos[i].lng], alvo]);
    });
    const t: Trajeto = { fonte: 'malha_viaria', km: Math.round(d.routes[0].distance / 100) / 10, geometria, marcos, acessos };
    exec('INSERT OR REPLACE INTO trajetos_cache (chave, dados, criado_em) VALUES (?, ?, ?)', chave, JSON.stringify(t), new Date().toISOString());
    return t;
  })
    .catch((e) => {
      falhouEm = Date.now();
      console.warn(`[mapas] traçado pela malha viária indisponível (${(e as Error).message}); usando linha aproximada`);
      return aproximado(pontos);
    })
    .finally(() => emAndamento.delete(chave));
  emAndamento.set(chave, tarefa);
  return tarefa;
}
