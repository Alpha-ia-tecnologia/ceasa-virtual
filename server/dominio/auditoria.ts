import { createHash } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { todos, um, inserir, exec, tx, json, ErroNegocio, DIR_EVIDENCIAS } from '../db.ts';
import { municipio, isoInstante, minutos, hhmm, diaSemana, arred } from '../util.ts';
import { registrar, type Autor } from '../trilha.ts';
import { linhaRetaKm, deslocar, type Ponto } from '../integracoes/geo.ts';
import { analisarFotos } from '../integracoes/visao.ts';
import { CHECKLIST_ESG, NOTA_SELO } from '../../compartilhado/dominio.ts';
import { criarLiquidacao } from './pagamentos.ts';

// Recebimento e auditoria [RF-AUD-01..06]: evidência na origem (plantação) e no destino (escola),
// verificação de integridade, checklist ambiental e sanitário, e tratamento de divergências.

export type Ponto2 = 'origem' | 'destino';
export type PapelEvidencia = 'agricultor' | 'prestador' | 'escola';
export type EntradaEvidencia = {
  ponto: Ponto2; papel: PapelEvidencia; foto?: string; lat?: number; lng?: number; km?: number;
  itens?: { pedido_item_id: number; kg: number; qualidade?: 'conforme' | 'parcial' | 'nao_conforme' }[];
  checklist?: Record<string, boolean>; observacao?: string;
  /** Só no sandbox: usa a posição e o horário planejados em vez dos do aparelho. */
  simulacao?: { posicao?: 'planejada' | 'fora_do_raio'; horario?: 'planejado' | 'agora' };
  /** Uso interno do gerador de carga sintética. */
  fotoInterna?: { bytes: Buffer; tipo: string };
};

const ASSINATURAS: [string, string, number[]][] = [
  ['image/jpeg', 'jpg', [0xff, 0xd8, 0xff]],
  ['image/png', 'png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/webp', 'webp', [0x52, 0x49, 0x46, 0x46]],
];
const LIMITE_FOTO = 6 * 1024 * 1024;

function decodificarFoto(dataUrl: string | undefined) {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(dataUrl ?? '');
  if (!m) throw new ErroNegocio('A foto é obrigatória. Tire ou escolha uma foto da carga.');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > LIMITE_FOTO) throw new ErroNegocio('A foto é grande demais. Envie uma imagem de até 6 MB.');
  const tipo = ASSINATURAS.find(([, , sig]) => sig.every((b, i) => bytes[i] === b));
  if (!tipo) throw new ErroNegocio('Formato de foto não aceito. Use JPG, PNG ou WebP.');
  return { bytes, tipo: tipo[0], ext: tipo[1] };
}

function guardarFoto(bytes: Buffer, ext: string) {
  const hash = createHash('sha256').update(bytes).digest('hex');
  const arquivo = `${hash.slice(0, 40)}.${ext}`;
  const destino = path.join(DIR_EVIDENCIAS, arquivo);
  if (process.env.CEASA_DB !== ':memory:' && !existsSync(destino)) writeFileSync(destino, bytes);
  return { hash, arquivo };
}

const ativas = (pedidoId: number) => todos<any>('SELECT * FROM evidencias WHERE pedido_id = ? AND substituida = 0 ORDER BY id', pedidoId);

/** O que ainda falta registrar para a entrega poder ser validada. */
export function pendencias(pedidoId: number) {
  const ev = ativas(pedidoId);
  const tem = (ponto: string, papel: string) => ev.some((e) => e.ponto === ponto && e.papel === papel);
  return { origem: !tem('origem', 'agricultor'), destino_prestador: !tem('destino', 'prestador'), destino_escola: !tem('destino', 'escola') };
}

function planejado(pedido: any, ponto: Ponto2) {
  const rotas = todos<any>('SELECT r.paradas FROM rota_pedidos rp JOIN rotas r ON r.id = rp.rota_id WHERE rp.pedido_id = ? ORDER BY r.id', pedido.id);
  for (const r of rotas)
    for (const p of json<any[]>(r.paradas, []))
      // no destino, o registro acontece depois da espera pela abertura da janela da escola
      if (p.cargas?.includes(pedido.id) && p.tipo === (ponto === 'origem' ? 'coleta' : 'entrega')) return ponto === 'origem' ? p.saida : hhmm(minutos(p.chegada) + (p.espera_min ?? 0) + 3);
  return ponto === 'origem' ? pedido.coleta_inicio : '07:30';
}

export function registrarEvidencia(municipioId: number, pedidoId: number, e: EntradaEvidencia, autor: Autor) {
  const pedido = um<any>(
    `SELECT p.*, ar.lat AS alat, ar.lng AS alng, es.lat AS elat, es.lng AS elng FROM pedidos p
     JOIN areas ar ON ar.id = p.area_id JOIN escolas es ON es.id = p.escola_id WHERE p.id = ? AND p.municipio_id = ?`,
    pedidoId, municipioId,
  );
  if (!pedido) throw new ErroNegocio('Pedido não encontrado.', 404);
  const combinacao = `${e.ponto}/${e.papel}`;
  if (!['origem/agricultor', 'destino/prestador', 'destino/escola'].includes(combinacao)) throw new ErroNegocio('Registro de evidência inválido.');
  if (e.ponto === 'origem' && pedido.status !== 'roteirizado') throw new ErroNegocio('A coleta só pode ser registrada quando o pedido tem rota definida e ainda não saiu da plantação.');
  if (e.ponto === 'destino' && pedido.status !== 'coletado') throw new ErroNegocio('A chegada só pode ser registrada depois da coleta na plantação.');
  if (ativas(pedidoId).some((x) => x.ponto === e.ponto && x.papel === e.papel)) throw new ErroNegocio('Esta etapa já tem evidência registrada.');

  const itensPedido = todos<any>('SELECT id, quantidade_kg FROM pedido_itens WHERE pedido_id = ?', pedidoId);
  const itens = (e.itens ?? []).filter((i) => itensPedido.some((p) => p.id === i.pedido_item_id)).map((i) => ({ pedido_item_id: i.pedido_item_id, kg: Math.max(0, Number(i.kg) || 0), qualidade: i.qualidade ?? 'conforme' }));
  if (e.papel !== 'prestador' && itens.length !== itensPedido.length) throw new ErroNegocio('Informe a quantidade de cada item.');
  if (e.papel === 'prestador' && !(Number(e.km) >= 0)) throw new ErroNegocio('Informe a quilometragem na chegada.');

  const foto = e.fotoInterna ? { bytes: e.fotoInterna.bytes, tipo: e.fotoInterna.tipo, ext: 'svg' } : decodificarFoto(e.foto);
  const local: Ponto = e.ponto === 'origem' ? { lat: pedido.alat, lng: pedido.alng } : { lat: pedido.elat, lng: pedido.elng };
  let pos: Ponto | null = e.lat != null && e.lng != null ? { lat: Number(e.lat), lng: Number(e.lng) } : null;
  let quando = isoInstante();
  const sim = e.simulacao;
  if (sim) {
    const fora = sim.posicao === 'fora_do_raio';
    pos = deslocar(local, fora ? 900 : 12 + (pedidoId % 5) * 9, fora ? 600 : 8 + (pedidoId % 7) * 6);
    if (sim.horario !== 'agora') quando = `${pedido.data_entrega}T${planejado(pedido, e.ponto)}:00`;
  }
  if (!pos) throw new ErroNegocio('Não foi possível obter a localização. Ative o GPS do aparelho e tente de novo.');

  return tx(() => {
    const { hash, arquivo } = guardarFoto(foto.bytes, foto.ext);
    const id = inserir('evidencias', {
      pedido_id: pedidoId, ponto: e.ponto, papel: e.papel, autor_id: autor.id, autor_nome: autor.nome, foto_arquivo: arquivo, foto_tipo: foto.tipo,
      foto_hash: hash, lat: pos!.lat, lng: pos!.lng, registrado_em: quando, km: e.km ?? null, itens, checklist: e.checklist ?? null,
      observacao: e.observacao?.slice(0, 500) ?? null, simulada: sim ? 1 : 0,
    });
    registrar(autor, municipioId, e.ponto === 'origem' ? 'Coleta registrada na plantação' : e.papel === 'escola' ? 'Recebimento registrado pela escola' : 'Chegada registrada pelo prestador', 'pedido', pedidoId, { evidencia: id, foto_hash: hash, lat: arred(pos!.lat, 6), lng: arred(pos!.lng, 6), registrado_em: quando });
    if (e.ponto === 'origem') {
      exec("UPDATE pedidos SET status = 'coletado' WHERE id = ?", pedidoId);
      exec("UPDATE rotas SET status = 'em_curso' WHERE status = 'planejada' AND id IN (SELECT rota_id FROM rota_pedidos WHERE pedido_id = ?)", pedidoId);
    }
    const falta = pendencias(pedidoId);
    const validacao = !falta.origem && !falta.destino_prestador && !falta.destino_escola ? validarEntrega(municipioId, pedidoId) : null;
    return { id, validacao };
  });
}

/** Validação automática da entrega quando as três evidências estão registradas. */
export function validarEntrega(municipioId: number, pedidoId: number) {
  const mun = municipio(municipioId);
  const pedido = um<any>(
    `SELECT p.*, ar.lat AS alat, ar.lng AS alng, es.lat AS elat, es.lng AS elng, es.janelas FROM pedidos p
     JOIN areas ar ON ar.id = p.area_id JOIN escolas es ON es.id = p.escola_id WHERE p.id = ?`,
    pedidoId,
  );
  const ev = ativas(pedidoId).map((e) => ({ ...e, itens: json<any[]>(e.itens, []) }));
  const origem = ev.find((e) => e.ponto === 'origem')!;
  const escola = ev.find((e) => e.ponto === 'destino' && e.papel === 'escola')!;
  const prestador = ev.find((e) => e.ponto === 'destino' && e.papel === 'prestador')!;
  const itens = todos<any>('SELECT i.id, i.quantidade_kg, a.nome AS alimento FROM pedido_itens i JOIN alimentos a ON a.id = i.alimento_id WHERE i.pedido_id = ?', pedidoId);

  // 1. conferência da carga [RF-AUD-02] — na Fase 1 a análise da imagem é simulada (ver integracoes/visao.ts)
  const visao = analisarFotos(
    itens.map((i) => ({
      alimento: i.alimento, pedido_kg: i.quantidade_kg,
      origem_kg: origem.itens.find((x: any) => x.pedido_item_id === i.id)?.kg ?? 0,
      recebido_kg: escola.itens.find((x: any) => x.pedido_item_id === i.id)?.kg ?? 0,
      qualidade: escola.itens.find((x: any) => x.pedido_item_id === i.id)?.qualidade ?? 'conforme',
    })),
    mun.params.tolerancia_volume,
  );

  // 2. integridade da evidência [RF-AUD-03]
  const raio = mun.params.raio_evidencia_m;
  const metros = (e: any, p: Ponto) => Math.round(linhaRetaKm({ lat: e.lat, lng: e.lng }, p) * 1000);
  const distancias = {
    origem: metros(origem, { lat: pedido.alat, lng: pedido.alng }),
    escola: metros(escola, { lat: pedido.elat, lng: pedido.elng }),
    prestador: metros(prestador, { lat: pedido.elat, lng: pedido.elng }),
  };
  const repetidas = ev.filter((e) => um('SELECT 1 FROM evidencias WHERE foto_hash = ? AND id <> ? AND substituida = 0', e.foto_hash, e.id)).map((e) => `${e.ponto}/${e.papel}`);
  const janela = json<{ dia: number; inicio: string; fim: string }[]>(pedido.janelas, []).find((j) => j.dia === diaSemana(pedido.data_entrega));
  const [dataReceb, horaReceb] = escola.registrado_em.split('T');
  const tol = mun.params.tolerancia_horario_min;
  const minReceb = minutos(horaReceb);
  const dentroDaJanela = !!janela && dataReceb === pedido.data_entrega && minReceb >= minutos(janela.inicio) - tol && minReceb <= minutos(janela.fim) + tol;
  const ordemCerta = origem.registrado_em <= escola.registrado_em;
  const integridade = {
    foto_inedita: { ok: repetidas.length === 0, detalhe: repetidas.length ? `Foto já usada em outro registro (${repetidas.join(', ')})` : 'Nenhuma foto repetida' },
    posicao: { ok: Object.values(distancias).every((d) => d <= raio), detalhe: `Plantação: ${distancias.origem} m; escola: ${distancias.escola} m; prestador: ${distancias.prestador} m (limite de ${raio} m)` },
    horario: { ok: dentroDaJanela && ordemCerta, detalhe: !janela ? 'A escola não tem janela de recebimento neste dia' : `Recebido em ${dataReceb.split('-').reverse().join('/')} às ${horaReceb.slice(0, 5)}; janela ${janela.inicio}–${janela.fim}` },
    ok: false,
  };
  integridade.ok = integridade.foto_inedita.ok && integridade.posicao.ok && integridade.horario.ok;

  // 3. checklist ambiental e sanitário [RF-AUD-04]
  const marcado = json<Record<string, boolean>>(escola.checklist, {});
  const esgItens = CHECKLIST_ESG.map((c) => ({ ...c, ok: !!marcado[c.id] }));
  const pontuacao = esgItens.reduce((s, c) => s + (c.ok ? c.peso : 0), 0);

  const validada = visao.ok && integridade.ok;
  const motivos = [
    ...visao.itens.filter((i) => !i.compativel).map((i) => `${i.alimento}: quantidade diferente do pedido`),
    ...visao.itens.filter((i) => i.deterioracao).map((i) => `${i.alimento}: qualidade apontada como ${i.qualidade === 'parcial' ? 'parcialmente conforme' : 'não conforme'}`),
    ...(['foto_inedita', 'posicao', 'horario'] as const).filter((k) => !integridade[k].ok).map((k) => integridade[k].detalhe),
  ];
  const noPrazo = !!janela && dataReceb === pedido.data_entrega && minReceb <= minutos(janela.fim) + tol;

  const id = inserir('validacoes', {
    pedido_id: pedidoId, resultado: validada ? 'validada' : 'divergencia', visao, integridade, esg: { itens: esgItens }, pontuacao,
    selo: validada && pontuacao >= NOTA_SELO ? 1 : 0, no_prazo: noPrazo ? 1 : 0, motivo: motivos.join('; ') || null, criado_em: isoInstante(),
  });
  if (validada) {
    for (const i of itens) exec('UPDATE pedido_itens SET aceito_kg = ? WHERE id = ?', Math.min(i.quantidade_kg, escola.itens.find((x: any) => x.pedido_item_id === i.id)?.kg ?? 0), i.id);
    concluir(municipioId, pedidoId);
  } else exec("UPDATE pedidos SET status = 'divergencia' WHERE id = ?", pedidoId);
  registrar({ id: null, nome: 'Validação automática', perfil: 'sistema' }, municipioId, validada ? 'Entrega validada' : 'Divergência aberta na entrega', 'pedido', pedidoId, { validacao: id, pontuacao, motivos });
  return { id, resultado: validada ? 'validada' : 'divergencia', motivos, pontuacao };
}

function concluir(municipioId: number, pedidoId: number) {
  exec("UPDATE pedidos SET status = 'validado' WHERE id = ?", pedidoId);
  exec(
    `UPDATE rotas SET status = 'concluida' WHERE id IN (SELECT rota_id FROM rota_pedidos WHERE pedido_id = ?)
     AND NOT EXISTS (SELECT 1 FROM rota_pedidos rp JOIN pedidos p ON p.id = rp.pedido_id WHERE rp.rota_id = rotas.id AND p.status IN ('gerado', 'roteirizado', 'coletado'))`,
    pedidoId,
  );
  criarLiquidacao(municipioId, pedidoId);
}

export type Resolucao = {
  decisao: 'aceitar' | 'recusar' | 'nova_evidencia'; motivo: string;
  itens?: { pedido_item_id: number; aceito_kg: number }[]; ponto?: Ponto2; papel?: PapelEvidencia;
};

/** Tratamento de divergência pelo controle interno [RF-AUD-05]. O pagamento fica bloqueado até a resolução. */
export function resolverDivergencia(municipioId: number, pedidoId: number, r: Resolucao, autor: Autor) {
  const pedido = um<any>('SELECT * FROM pedidos WHERE id = ? AND municipio_id = ?', pedidoId, municipioId);
  if (!pedido) throw new ErroNegocio('Pedido não encontrado.', 404);
  if (pedido.status !== 'divergencia') throw new ErroNegocio('Este pedido não tem divergência em aberto.');
  if (!r.motivo?.trim()) throw new ErroNegocio('Descreva o motivo da decisão.');
  const validacao = um<any>('SELECT id FROM validacoes WHERE pedido_id = ? ORDER BY id DESC LIMIT 1', pedidoId);
  const itens = todos<any>('SELECT * FROM pedido_itens WHERE pedido_id = ?', pedidoId);
  return tx(() => {
    let resolucao: string;
    if (r.decisao === 'aceitar') {
      for (const i of itens) {
        const kg = r.itens?.find((x) => x.pedido_item_id === i.id)?.aceito_kg ?? 0;
        exec('UPDATE pedido_itens SET aceito_kg = ? WHERE id = ?', Math.max(0, Math.min(i.quantidade_kg, Number(kg) || 0)), i.id);
      }
      const aceito = todos<any>('SELECT quantidade_kg, aceito_kg FROM pedido_itens WHERE pedido_id = ?', pedidoId);
      resolucao = aceito.every((i) => i.aceito_kg >= i.quantidade_kg - 0.01) ? 'Aceite total' : 'Aceite parcial';
      concluir(municipioId, pedidoId);
    } else if (r.decisao === 'recusar') {
      resolucao = 'Recusa total';
      for (const i of itens) {
        exec('UPDATE pedido_itens SET aceito_kg = 0 WHERE id = ?', i.id);
        if (i.oferta_id) exec('UPDATE ofertas SET comprometido_kg = MAX(0, comprometido_kg - ?) WHERE id = ?', i.quantidade_kg, i.oferta_id);
      }
      exec("UPDATE pedidos SET status = 'recusado' WHERE id = ?", pedidoId);
    } else {
      if (!r.ponto || !r.papel) throw new ErroNegocio('Indique qual evidência deve ser refeita.');
      exec('UPDATE evidencias SET substituida = 1 WHERE pedido_id = ? AND ponto = ? AND papel = ? AND substituida = 0', pedidoId, r.ponto, r.papel);
      resolucao = `Nova evidência pedida (${r.ponto === 'origem' ? 'coleta na plantação' : r.papel === 'escola' ? 'recebimento na escola' : 'chegada do prestador'})`;
      exec('UPDATE pedidos SET status = ? WHERE id = ?', r.ponto === 'origem' ? 'roteirizado' : 'coletado', pedidoId);
    }
    exec('UPDATE validacoes SET resolucao = ?, resolvido_por = ?, resolvido_em = ? WHERE id = ?', `${resolucao}: ${r.motivo.trim()}`, autor.nome, isoInstante(), validacao?.id ?? 0);
    registrar(autor, municipioId, `Divergência resolvida — ${resolucao.toLowerCase()}`, 'pedido', pedidoId, { motivo: r.motivo.trim() });
    return { resolucao };
  });
}

export function filaDeDivergencias(municipioId: number) {
  return todos<any>(
    `SELECT p.id, p.data_entrega, g.nome AS agricultor, e.nome AS escola, v.motivo, v.criado_em
     FROM pedidos p JOIN agricultores g ON g.id = p.agricultor_id JOIN escolas e ON e.id = p.escola_id
     JOIN validacoes v ON v.id = (SELECT MAX(id) FROM validacoes WHERE pedido_id = p.id)
     WHERE p.municipio_id = ? AND p.status = 'divergencia' ORDER BY p.data_entrega`,
    municipioId,
  );
}

