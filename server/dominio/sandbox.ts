import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { um, todos, ErroNegocio, DIR_EVIDENCIAS } from '../db.ts';
import type { Autor } from '../trilha.ts';
import { registrarEvidencia, pendencias, type EntradaEvidencia } from './auditoria.ts';
import { CHECKLIST_ESG } from '../../compartilhado/dominio.ts';

// Apoio ao ambiente de simulação [RF-ADM-05, RF-LOG-06]: avança uma entrega etapa por etapa com
// evidências sintéticas, sem depender de aparelhos em campo. As imagens são ilustrações, não registros reais.

export function fotoSintetica(titulo: string, linhas: string[]) {
  const esc = (s: string) => s.replace(/[<&>]/g, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
<rect width="640" height="420" fill="#F5F2E9"/><rect x="24" y="24" width="592" height="372" rx="18" fill="#fff" stroke="#145C43" stroke-width="2" stroke-dasharray="8 6"/>
<circle cx="80" cy="84" r="22" fill="#E2AA3B"/><text x="116" y="80" font-family="Arial" font-size="20" font-weight="700" fill="#145C43">${esc(titulo)}</text>
<text x="116" y="104" font-family="Arial" font-size="13" fill="#24372D">Imagem sintética do sandbox — não é registro real</text>
${linhas.map((l, i) => `<text x="56" y="${160 + i * 28}" font-family="Arial" font-size="16" fill="#24372D">${esc(l)}</text>`).join('')}
<text x="56" y="372" font-family="Arial" font-size="11" fill="#71A541">${randomBytes(12).toString('hex')}</text></svg>`;
  return { bytes: Buffer.from(svg), tipo: 'image/svg+xml' };
}

const fotosDaColeta = new Map<number, Buffer>();

export type Variante = 'normal' | 'foto_repetida' | 'fora_do_raio' | 'quantidade_menor' | 'qualidade';

/** Registra a próxima evidência que falta no pedido. Devolve a etapa executada. */
export function avancarPedido(municipioId: number, pedidoId: number, autor: Autor, variante: Variante = 'normal') {
  const p = um<any>('SELECT p.*, g.nome AS agricultor, e.nome AS escola FROM pedidos p JOIN agricultores g ON g.id = p.agricultor_id JOIN escolas e ON e.id = p.escola_id WHERE p.id = ? AND p.municipio_id = ?', pedidoId, municipioId);
  if (!p) throw new ErroNegocio('Pedido não encontrado.', 404);
  if (p.status === 'gerado') throw new ErroNegocio('Planeje a rota deste pedido antes de simular a coleta.');
  if (!['roteirizado', 'coletado'].includes(p.status)) throw new ErroNegocio('Não há etapa de campo pendente neste pedido.');
  const itens = todos<any>('SELECT i.id, i.quantidade_kg, a.nome FROM pedido_itens i JOIN alimentos a ON a.id = i.alimento_id WHERE i.pedido_id = ? ORDER BY i.id', pedidoId);
  const falta = pendencias(pedidoId);
  const descricao = itens.map((i) => `${i.nome}: ${i.quantidade_kg} kg`).slice(0, 6);
  const base = { simulacao: { posicao: 'planejada', horario: 'planejado' } } as const;

  if (falta.origem) {
    const foto = fotoSintetica(`Carga na plantação — pedido ${pedidoId}`, [p.agricultor, ...descricao]);
    fotosDaColeta.set(pedidoId, foto.bytes);
    registrarEvidencia(municipioId, pedidoId, { ...base, ponto: 'origem', papel: 'agricultor', itens: itens.map((i) => ({ pedido_item_id: i.id, kg: i.quantidade_kg })), fotoInterna: foto }, autor);
    return { etapa: 'coleta' };
  }
  if (falta.destino_prestador) {
    const km = um<any>('SELECT r.km_ida FROM rota_pedidos rp JOIN rotas r ON r.id = rp.rota_id WHERE rp.pedido_id = ? ORDER BY r.id LIMIT 1', pedidoId)?.km_ida ?? 0;
    registrarEvidencia(municipioId, pedidoId, { ...base, ponto: 'destino', papel: 'prestador', km: Math.round(1200 + pedidoId * 3 + km), fotoInterna: fotoSintetica(`Chegada à escola — pedido ${pedidoId}`, [p.escola, `Percurso de ida: ${km} km`]) }, autor);
    return { etapa: 'chegada' };
  }
  const repetida = variante === 'foto_repetida' ? um<any>("SELECT foto_arquivo, foto_tipo FROM evidencias WHERE pedido_id = ? AND ponto = 'origem' AND substituida = 0", pedidoId) : null;
  const entrada: EntradaEvidencia = {
    ponto: 'destino', papel: 'escola',
    simulacao: { posicao: variante === 'fora_do_raio' ? 'fora_do_raio' : 'planejada', horario: 'planejado' },
    itens: itens.map((i, n) => ({
      pedido_item_id: i.id, kg: variante === 'quantidade_menor' && n === 0 ? Math.round(i.quantidade_kg * 0.7 * 10) / 10 : i.quantidade_kg,
      qualidade: variante === 'qualidade' && n === 0 ? 'parcial' : 'conforme',
    })),
    checklist: Object.fromEntries(CHECKLIST_ESG.map((c, n) => [c.id, variante === 'qualidade' ? c.id !== 'integridade' : !(pedidoId % 6 === 0 && n === 5)])),
    fotoInterna: fotoSintetica(`Recebimento na escola — pedido ${pedidoId}`, [p.escola, ...descricao]),
  };
  if (repetida) {
    // reaproveita os mesmos bytes da foto da coleta para exercitar a detecção de foto repetida
    const arquivo = path.join(DIR_EVIDENCIAS, repetida.foto_arquivo);
    const bytes = fotosDaColeta.get(pedidoId) ?? (existsSync(arquivo) ? readFileSync(arquivo) : null);
    if (bytes) entrada.fotoInterna = { bytes, tipo: repetida.foto_tipo };
  }
  const r = registrarEvidencia(municipioId, pedidoId, entrada, autor);
  return { etapa: 'recebimento', validacao: r.validacao };
}
