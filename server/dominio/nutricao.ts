import { todos, json } from '../db.ts';
import type { Grupo } from '../../compartilhado/dominio.ts';

export type Alimento = {
  id: number; codigo: string; nome: string; grupo: Grupo;
  kcal: number | null; ptn: number | null; cho: number | null; lip: number | null;
  fibra: number | null; calcio: number | null; ferro: number | null; vit_c: number | null;
  referenciado_fnde: number; agricola: number; produto_agricola: string | null;
  validade_dias: number | null; armazenamento: string | null; percapita_padrao_g: number | null;
  preco_medio: number | null; produtividade_kg_ha: number | null; ciclo_dias: number | null;
  precisa_agua: number; safra: number[];
};
export type Referencia = {
  id: string; rotulo: string; modalidade: string; periodo: string; ordem: number;
  kcal: number; calcio: number; ferro: number; vit_c: number; fator: number;
};

export function listarAlimentos(): Alimento[] {
  return todos<any>('SELECT * FROM alimentos ORDER BY nome').map((a) => ({ ...a, safra: json<number[]>(a.safra, []) }));
}
export const mapaAlimentos = () => new Map(listarAlimentos().map((a) => [a.id, a]));
export const listarReferencias = () => todos<Referencia>('SELECT * FROM referencias ORDER BY ordem');

/** Faixas de macronutrientes como fração da energia de referência. Valores a conferir com a resolução vigente do FNDE. */
export const FAIXA_MACRO = { ptn: [0.1, 0.15], cho: [0.55, 0.65], lip: [0.15, 0.3] } as const;
const KCAL_G = { ptn: 4, cho: 4, lip: 9 } as const;
/** Peso de cada componente no índice de adequação. */
export const PESOS_ADEQUACAO = { energia: 0.4, macro: 0.12, micro: 0.08 } as const;
export const TOLERANCIA_ENERGIA = 0.1;

export type Nutrientes = { kcal: number; ptn: number; cho: number; lip: number; fibra: number; calcio: number; ferro: number; vit_c: number };
export const ZERO: Nutrientes = { kcal: 0, ptn: 0, cho: 0, lip: 0, fibra: 0, calcio: 0, ferro: 0, vit_c: 0 };

export function nutrientesDe(al: Alimento, gramas: number): Nutrientes {
  const f = gramas / 100;
  return {
    kcal: (al.kcal ?? 0) * f, ptn: (al.ptn ?? 0) * f, cho: (al.cho ?? 0) * f, lip: (al.lip ?? 0) * f,
    fibra: (al.fibra ?? 0) * f, calcio: (al.calcio ?? 0) * f, ferro: (al.ferro ?? 0) * f, vit_c: (al.vit_c ?? 0) * f,
  };
}
export function somar(a: Nutrientes, b: Nutrientes): Nutrientes {
  const r = { ...a };
  for (const k of Object.keys(r) as (keyof Nutrientes)[]) r[k] += b[k];
  return r;
}

function pontuarFaixa(valor: number, min: number, max: number) {
  if (valor >= min && valor <= max) return 1;
  if (valor < min) return Math.max(0, valor / min);
  return Math.max(0, 1 - (valor - max) / max);
}

/** Índice de adequação de uma refeição frente à referência de uma faixa etária [RF-CAR-02]. */
export function adequacao(n: Nutrientes, ref: Referencia) {
  const energia = pontuarFaixa(n.kcal, ref.kcal * (1 - TOLERANCIA_ENERGIA), ref.kcal * (1 + TOLERANCIA_ENERGIA));
  const macro = (k: 'ptn' | 'cho' | 'lip') =>
    pontuarFaixa(n[k], (ref.kcal * FAIXA_MACRO[k][0]) / KCAL_G[k], (ref.kcal * FAIXA_MACRO[k][1]) / KCAL_G[k]);
  const micro = (k: 'calcio' | 'ferro' | 'vit_c') => (ref[k] ? Math.min(1, n[k] / ref[k]) : 1);
  const partes = { energia, ptn: macro('ptn'), cho: macro('cho'), lip: macro('lip'), calcio: micro('calcio'), ferro: micro('ferro'), vit_c: micro('vit_c') };
  const indice =
    PESOS_ADEQUACAO.energia * energia +
    PESOS_ADEQUACAO.macro * (partes.ptn + partes.cho + partes.lip) +
    PESOS_ADEQUACAO.micro * (partes.calcio + partes.ferro + partes.vit_c);
  return { indice, partes };
}

/**
 * Índice de cobertura da base [RF-NUT-05]: parcela dos ingredientes referenciados pelo FNDE que têm
 * composição nutricional completa, perecibilidade registrada e, quando agrícolas, o produto correspondente mapeado.
 * A fórmula segue o projeto de pesquisa; a decisão 1 da especificação ainda precisa confirmá-la.
 */
export function cobertura() {
  const ref = listarAlimentos().filter((a) => a.referenciado_fnde);
  const pendencias = ref
    .map((a) => {
      const falta: string[] = [];
      if ([a.kcal, a.ptn, a.cho, a.lip].some((v) => v === null)) falta.push('composição nutricional');
      if (a.validade_dias === null) falta.push('perecibilidade');
      if (a.agricola && !a.produto_agricola) falta.push('produto agrícola correspondente');
      return { id: a.id, nome: a.nome, falta };
    })
    .filter((p) => p.falta.length);
  const total = ref.length;
  const cobertos = total - pendencias.length;
  return { total, cobertos, indice: total ? cobertos / total : 0, meta: 0.95, pendencias };
}

/** Lê um CSV simples (separador ; ou ,) com cabeçalho. Usado na importação da TACO [RF-NUT-01]. */
export function lerCsv(texto: string): Record<string, string>[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length < 2) return [];
  const sep = linhas[0].includes(';') ? ';' : ',';
  const cab = linhas[0].split(sep).map((c) => c.trim().toLowerCase());
  return linhas.slice(1).map((l) => {
    const cel = l.split(sep);
    return Object.fromEntries(cab.map((c, i) => [c, (cel[i] ?? '').trim()]));
  });
}
