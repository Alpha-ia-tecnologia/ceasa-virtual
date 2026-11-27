import { createHash } from 'node:crypto';
import { um, todos, inserir } from './db.ts';
import { isoInstante } from './util.ts';
import type { Perfil } from '../compartilhado/dominio.ts';

// Trilha de auditoria [RF-AUD-06] e log administrativo [RF-ADM-04].
// Cada registro guarda o hash do anterior; qualquer alteração posterior quebra a cadeia.

export type Autor = { id: number | null; nome: string; perfil: Perfil | 'sistema' };
export const SISTEMA: Autor = { id: null, nome: 'Sistema', perfil: 'sistema' };

const GENESE = '0'.repeat(64);

function calcular(anterior: string, r: Record<string, unknown>) {
  return createHash('sha256').update(anterior).update(JSON.stringify(r)).digest('hex');
}

export function registrar(
  autor: Autor,
  municipioId: number | null,
  acao: string,
  entidade: string | null,
  entidadeId: number | null,
  detalhe: Record<string, unknown> = {},
  categoria: 'operacao' | 'admin' = 'operacao',
) {
  const ultimo = um<{ hash: string }>('SELECT hash FROM trilha ORDER BY seq DESC LIMIT 1');
  const anterior = ultimo?.hash ?? GENESE;
  const corpo = {
    municipio_id: municipioId, em: isoInstante(), usuario_id: autor.id, usuario_nome: autor.nome, perfil: autor.perfil,
    categoria, acao, entidade, entidade_id: entidadeId, detalhe: JSON.stringify(detalhe),
  };
  inserir('trilha', { ...corpo, hash_anterior: anterior, hash: calcular(anterior, corpo) });
}

/** Recalcula a cadeia inteira e aponta o primeiro registro adulterado, se houver. */
export function verificarTrilha(): { integra: boolean; registros: number; falha_em: number | null } {
  const linhas = todos<any>('SELECT * FROM trilha ORDER BY seq');
  let anterior = GENESE;
  for (const l of linhas) {
    const { seq, hash, hash_anterior, ...corpo } = l;
    if (hash_anterior !== anterior || calcular(anterior, corpo) !== hash) return { integra: false, registros: linhas.length, falha_em: seq };
    anterior = hash;
  }
  return { integra: true, registros: linhas.length, falha_em: null };
}
