import { TIPOS_VIA, MODAIS, type Modal, type TipoVia } from '../compartilhado/dominio.ts';
import { um, json, ErroNegocio } from './db.ts';

// ---------- relógio (o sandbox pode simular outro instante ao gerar carga) ----------
let instanteSimulado: Date | null = null;
export function simularInstante(d: Date | null) {
  instanteSimulado = d;
}
export function agora(): Date {
  return instanteSimulado ? new Date(instanteSimulado) : new Date();
}
const p2 = (n: number) => String(n).padStart(2, '0');
export function isoData(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
export function isoInstante(d: Date = agora()): string {
  return `${isoData(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}
export const hoje = () => isoData(agora());

// ---------- datas ISO (AAAA-MM-DD), sem fuso ----------
const utc = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
};
export function somarDias(iso: string, n: number): string {
  return new Date(utc(iso) + n * 86400000).toISOString().slice(0, 10);
}
export const diffDias = (a: string, b: string) => Math.round((utc(a) - utc(b)) / 86400000);
/** 1 = segunda … 7 = domingo */
export const diaSemana = (iso: string) => ((new Date(utc(iso)).getUTCDay() + 6) % 7) + 1;
export const segundaDe = (iso: string) => somarDias(iso, 1 - diaSemana(iso));
export const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
export const hhmm = (min: number) => `${p2(Math.floor(min / 60))}:${p2(Math.round(min % 60))}`;
export const arred = (v: number, casas = 2) => {
  const f = 10 ** casas;
  return Math.round((v + Number.EPSILON) * f) / f;
};

// ---------- parâmetros do município [RF-ADM-03] ----------
export type Params = {
  aliquota_iss: number;
  indices_via: Record<TipoVia, number>;
  frete_km: Record<Modal, number>;
  custo_km_convencional: number;
  fator_tortuosidade: number;
  raio_evidencia_m: number;
  tolerancia_volume: number;
  tolerancia_horario_min: number;
  dias_entrega: number[];
  repasse_modo: 'por_entrega' | 'agrupado';
  fim_ano_letivo: string; // MM-DD
  pesos_ranking: { adequacao: number; af: number; custo: number; safra: number };
  limite_venda_agricultor: number | null;
};

export const PARAMS_PADRAO: Params = {
  aliquota_iss: 0.05,
  indices_via: Object.fromEntries(Object.entries(TIPOS_VIA).map(([k, v]) => [k, v.indice])) as Record<TipoVia, number>,
  // valor-base por km de cada modal; 1,00 mantém o custo igual a km × índice da via, como na tabela do cliente
  frete_km: Object.fromEntries(Object.keys(MODAIS).map((k) => [k, 1])) as Record<Modal, number>,
  custo_km_convencional: 4.5,
  fator_tortuosidade: 1.3,
  raio_evidencia_m: 300,
  tolerancia_volume: 0.05,
  tolerancia_horario_min: 30,
  dias_entrega: [1, 4],
  repasse_modo: 'por_entrega',
  fim_ano_letivo: '12-18',
  pesos_ranking: { adequacao: 0.4, af: 0.25, custo: 0.2, safra: 0.15 },
  limite_venda_agricultor: null,
};

export type Municipio = {
  id: number; nome: string; uf: string; cnpj: string; entidade_executora: string; repasse_fnde_anual: number;
  exercicio: number; lat: number; lng: number; raio_km: number; modo_piloto: number; consorcio_id: number | null; params: Params;
};

export function municipio(id: number): Municipio {
  const m = um<any>('SELECT * FROM municipios WHERE id = ?', id);
  if (!m) throw new ErroNegocio('Município não encontrado.', 404);
  const salvo = json<Partial<Params>>(m.params, {});
  return {
    ...m,
    params: {
      ...PARAMS_PADRAO,
      ...salvo,
      indices_via: { ...PARAMS_PADRAO.indices_via, ...salvo.indices_via },
      frete_km: { ...PARAMS_PADRAO.frete_km, ...salvo.frete_km },
      pesos_ranking: { ...PARAMS_PADRAO.pesos_ranking, ...salvo.pesos_ranking },
    },
  };
}

// ---------- gerador determinístico para dados sintéticos ----------
export function semente(s: number) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
