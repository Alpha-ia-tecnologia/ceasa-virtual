import { todos, um, inserir, exec, tx, json, ErroNegocio } from '../db.ts';
import { municipio, isoInstante, arred } from '../util.ts';
import { registrar, type Autor } from '../trilha.ts';
import { arranjoSandbox, type Comprovante } from '../integracoes/pagamento.ts';

// Split-payment e retenção de ISS [RF-PAG-01..05]: cada entrega validada se liquida em três partes —
// alimento ao agricultor, frete ao prestador e ISS retido ao município.

const soDigitos = (s: string | null) => (s ?? '').replace(/\D/g, '');

/** Cria a liquidação desmembrada de uma entrega validada. Chamado pela auditoria. */
export function criarLiquidacao(municipioId: number, pedidoId: number) {
  if (um('SELECT 1 FROM liquidacoes WHERE pedido_id = ?', pedidoId)) return;
  const mun = municipio(municipioId);
  const itens = todos<any>('SELECT aceito_kg, preco_kg, frete_kg FROM pedido_itens WHERE pedido_id = ?', pedidoId);
  const alimento = arred(itens.reduce((s, i) => s + (i.aceito_kg ?? 0) * i.preco_kg, 0));
  const frete = arred(itens.reduce((s, i) => s + (i.aceito_kg ?? 0) * i.frete_kg, 0));
  if (alimento + frete <= 0) return;
  const iss = arred(frete * mun.params.aliquota_iss); // ISS incide sobre o serviço de frete [RF-PAG-02]
  const ag = um<any>('SELECT g.documento, g.titular_documento, g.conta FROM pedidos p JOIN agricultores g ON g.id = p.agricultor_id WHERE p.id = ?', pedidoId);
  const rota = um<any>('SELECT r.prestador_id FROM rota_pedidos rp JOIN rotas r ON r.id = rp.rota_id WHERE rp.pedido_id = ? ORDER BY r.id LIMIT 1', pedidoId);
  // o pagamento ao agricultor só sai para conta de sua titularidade [RF-PAG-03]
  const titularOk = !!ag.conta && soDigitos(ag.titular_documento) === soDigitos(ag.documento);
  inserir('liquidacoes', {
    municipio_id: municipioId, pedido_id: pedidoId, prestador_id: rota?.prestador_id ?? null, valor_alimento: alimento, valor_frete: frete, iss,
    liquido_prestador: arred(frete - iss), status: titularOk ? 'pendente' : 'bloqueada',
    motivo: titularOk ? null : 'A conta informada não está em nome do próprio agricultor', criado_em: isoInstante(),
  });
}

function executar(l: any, lote: string | null, autor: Autor) {
  const pedido = um<any>('SELECT p.status, g.nome, g.documento, g.banco, g.agencia, g.conta FROM pedidos p JOIN agricultores g ON g.id = p.agricultor_id WHERE p.id = ?', l.pedido_id);
  // nenhum pagamento sem entrega validada [RF-PAG-05]
  if (pedido.status !== 'validado') throw new ErroNegocio(`O pedido ${l.pedido_id} não tem entrega validada; o pagamento continua bloqueado.`);
  const contratado = um<any>('SELECT SUM(quantidade_kg * (preco_kg + frete_kg)) AS v FROM pedido_itens WHERE pedido_id = ?', l.pedido_id).v ?? 0;
  // em centavos inteiros: alimento e frete são arredondados separadamente, o que pode somar 1 centavo a mais
  if (Math.round((l.valor_alimento + l.valor_frete) * 100) > Math.round(contratado * 100) + 1) throw new ErroNegocio(`A liquidação do pedido ${l.pedido_id} excede o valor contratado.`);
  const prestador = l.prestador_id ? um<any>('SELECT nome, documento, banco, agencia, conta FROM prestadores WHERE id = ?', l.prestador_id) : null;
  const comprovantes: (Comprovante & { parte: string })[] = [
    { parte: 'agricultor', ...arranjoSandbox.transferir({ favorecido: pedido.nome, documento: pedido.documento, banco: pedido.banco, agencia: pedido.agencia, conta: pedido.conta, valor: l.valor_alimento, descricao: `Alimentos — pedido ${l.pedido_id}` }) },
  ];
  if (l.valor_frete > 0 && prestador)
    comprovantes.push({ parte: 'prestador', ...arranjoSandbox.transferir({ ...prestador, favorecido: prestador.nome, valor: l.liquido_prestador, descricao: `Frete líquido de ISS — pedido ${l.pedido_id}` }) });
  if (l.iss > 0) comprovantes.push({ parte: 'iss', id: `RET-${l.id}`, favorecido: 'Tesouro municipal (ISS retido)', valor: l.iss, descricao: `Retenção de ISS sobre o frete — pedido ${l.pedido_id}`, ok: true, ambiente: 'sandbox' });
  const falha = comprovantes.find((c) => !c.ok);
  exec('UPDATE liquidacoes SET status = ?, motivo = ?, lote = ?, comprovantes = ?, pago_em = ? WHERE id = ?', falha ? 'falhou' : 'paga', falha ? `${falha.favorecido}: ${falha.erro}` : null, lote, comprovantes, falha ? null : isoInstante(), l.id);
  if (!falha) exec("UPDATE pedidos SET status = 'pago' WHERE id = ?", l.pedido_id);
  registrar(autor, l.municipio_id, falha ? 'Pagamento falhou' : 'Pagamento dividido executado (sandbox)', 'pedido', l.pedido_id, { liquidacao: l.id, alimento: l.valor_alimento, frete_liquido: l.liquido_prestador, iss: l.iss, lote });
  return !falha;
}

export function pagar(municipioId: number, liquidacaoId: number, autor: Autor) {
  const l = um<any>('SELECT * FROM liquidacoes WHERE id = ? AND municipio_id = ?', liquidacaoId, municipioId);
  if (!l) throw new ErroNegocio('Liquidação não encontrada.', 404);
  if (l.status === 'bloqueada') throw new ErroNegocio(`Pagamento bloqueado: ${l.motivo}.`);
  if (!['pendente', 'falhou'].includes(l.status)) throw new ErroNegocio('Esta liquidação já foi paga.');
  return tx(() => ({ pago: executar(l, null, autor) }));
}

/** Agrupa os repasses pendentes num lote do período [RF-PAG-04]. */
export function pagarLote(municipioId: number, autor: Autor) {
  const pendentes = todos<any>("SELECT * FROM liquidacoes WHERE municipio_id = ? AND status = 'pendente' ORDER BY id", municipioId);
  if (!pendentes.length) throw new ErroNegocio('Não há liquidações prontas para pagar.');
  const lote = `LOTE-${isoInstante().replace(/\D/g, '').slice(0, 12)}`;
  return tx(() => {
    const pagos = pendentes.filter((l) => executar(l, lote, autor)).length;
    return { lote, pagos, falhas: pendentes.length - pagos };
  });
}

export function listarLiquidacoes(municipioId: number, f: { agricultor_id?: number; prestador_id?: number } = {}) {
  const cond = ['l.municipio_id = ?'];
  const par: unknown[] = [municipioId];
  if (f.agricultor_id) (cond.push('p.agricultor_id = ?'), par.push(f.agricultor_id));
  if (f.prestador_id) (cond.push('l.prestador_id = ?'), par.push(f.prestador_id));
  return todos<any>(
    `SELECT l.*, p.data_entrega, g.nome AS agricultor, e.nome AS escola, pr.nome AS prestador
     FROM liquidacoes l JOIN pedidos p ON p.id = l.pedido_id JOIN agricultores g ON g.id = p.agricultor_id
     JOIN escolas e ON e.id = p.escola_id LEFT JOIN prestadores pr ON pr.id = l.prestador_id
     WHERE ${cond.join(' AND ')} ORDER BY CASE l.status WHEN 'pendente' THEN 0 WHEN 'falhou' THEN 1 WHEN 'bloqueada' THEN 2 ELSE 3 END, l.id DESC LIMIT 400`,
    ...par,
  ).map((l) => ({ ...l, comprovantes: json<any[]>(l.comprovantes, []) }));
}
