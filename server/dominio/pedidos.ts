import { todos, um, inserir, exec, tx, ErroNegocio } from '../db.ts';
import { municipio, somarDias, isoInstante, arred } from '../util.ts';
import { registrar, type Autor } from '../trilha.ts';
import { provedorLocal } from '../integracoes/geo.ts';
import { buscarCardapio, entregaDoDia, lotesDisponiveis, precosVigentes } from './cardapio.ts';
import { mapaAlimentos } from './nutricao.ts';

// Geração de pedidos a partir da lista de necessidades do cardápio aprovado [RF-CON-03].
// Distribui entre os agricultores por disponibilidade e distância até a escola, usando primeiro o lote que vence antes.

export function necessidades(cardapioId: number) {
  return todos<any>(
    `SELECT n.escola_id, e.nome AS escola, n.alimento_id, a.nome AS alimento, a.agricola, n.dia, n.quantidade_kg
     FROM necessidades n JOIN escolas e ON e.id = n.escola_id JOIN alimentos a ON a.id = n.alimento_id
     WHERE n.cardapio_id = ? ORDER BY e.nome, a.nome, n.dia`,
    cardapioId,
  );
}

export function gerarPedidos(municipioId: number, cardapioId: number, autor: Autor) {
  const c = buscarCardapio(municipioId, cardapioId);
  if (c.tipo !== 'proposta' || c.status !== 'aprovado') throw new ErroNegocio('Só um cardápio aprovado pela nutricionista gera pedidos.');
  if (um('SELECT 1 FROM pedidos WHERE cardapio_id = ?', cardapioId)) throw new ErroNegocio('Os pedidos deste cardápio já foram gerados.');

  const mun = municipio(municipioId);
  const geo = provedorLocal(mun.params.fator_tortuosidade);
  const alimentos = mapaAlimentos();
  const precos = precosVigentes(municipioId);
  const lotes = lotesDisponiveis(municipioId);
  const areas = new Map(todos<any>('SELECT a.* FROM areas a JOIN agricultores g ON g.id = a.agricultor_id WHERE g.municipio_id = ?', municipioId).map((a) => [a.id, a]));
  const escolas = new Map(todos<any>('SELECT * FROM escolas WHERE municipio_id = ?', municipioId).map((e) => [e.id, e]));

  // necessidade por escola, alimento e bloco de entrega
  type Bloco = { escola_id: number; alimento_id: number; entrega: number; kg: number; ultimoDia: number };
  const blocos = new Map<string, Bloco>();
  for (const n of necessidades(cardapioId)) {
    if (!n.agricola) continue;
    const entrega = entregaDoDia(n.dia, mun.params.dias_entrega);
    const chave = `${n.escola_id}|${n.alimento_id}|${entrega}`;
    const b = blocos.get(chave) ?? { escola_id: n.escola_id, alimento_id: n.alimento_id, entrega, kg: 0, ultimoDia: n.dia };
    b.kg += n.quantidade_kg;
    b.ultimoDia = Math.max(b.ultimoDia, n.dia);
    blocos.set(chave, b);
  }

  const semPreco = new Set<string>();
  const descoberto: { escola: string; alimento: string; kg: number }[] = [];
  type Linha = { oferta_id: number; alimento_id: number; kg: number; preco_kg: number; frete_kg: number };
  const pedidos = new Map<string, { agricultor_id: number; area_id: number; escola_id: number; data_entrega: string; coleta_inicio: string; coleta_fim: string; linhas: Linha[] }>();

  for (const b of [...blocos.values()].sort((x, y) => x.entrega - y.entrega || y.kg - x.kg)) {
    const escola = escolas.get(b.escola_id);
    const dataEntrega = somarDias(c.semana, b.entrega - 1);
    const dataUltimoUso = somarDias(c.semana, b.ultimoDia - 1);
    const candidatos = lotes
      .filter((l) => l.alimento_id === b.alimento_id && l.saldo > 0.01 && l.data_colheita <= dataEntrega && l.data_limite >= dataUltimoUso)
      .map((l) => ({ l, km: geo.distanciaKm(areas.get(l.area_id), escola) }))
      .sort((x, y) => x.km - y.km || x.l.data_limite.localeCompare(y.l.data_limite));
    let falta = b.kg;
    if (candidatos.length && !precos.has(b.alimento_id)) {
      semPreco.add(alimentos.get(b.alimento_id)!.nome);
      continue;
    }
    const preco = precos.get(b.alimento_id);
    for (const { l } of candidatos) {
      if (falta < 0.05) break;
      const kg = arred(Math.min(l.saldo, falta), 2);
      l.saldo -= kg;
      falta -= kg;
      const chave = `${l.agricultor_id}|${l.area_id}|${b.escola_id}|${dataEntrega}`;
      const p = pedidos.get(chave) ?? { agricultor_id: l.agricultor_id, area_id: l.area_id, escola_id: b.escola_id, data_entrega: dataEntrega, coleta_inicio: l.coleta_inicio, coleta_fim: l.coleta_fim, linhas: [] };
      p.coleta_inicio = p.coleta_inicio > l.coleta_inicio ? p.coleta_inicio : l.coleta_inicio;
      p.coleta_fim = p.coleta_fim < l.coleta_fim ? p.coleta_fim : l.coleta_fim;
      p.linhas.push({ oferta_id: l.id, alimento_id: b.alimento_id, kg, preco_kg: preco!.preco_kg, frete_kg: preco!.frete_kg });
      pedidos.set(chave, p);
    }
    if (falta >= 0.5) descoberto.push({ escola: escola.nome, alimento: alimentos.get(b.alimento_id)!.nome, kg: arred(falta, 1) });
  }

  // O preço é definido pelo gestor; sem ele o pedido não é gerado [RF-CON-02].
  if (semPreco.size)
    throw new ErroNegocio(`Falta o preço de referência definido pelo gestor para: ${[...semPreco].join(', ')}. Registre os preços antes de gerar os pedidos.`);
  if (!pedidos.size) throw new ErroNegocio('Não há oferta da agricultura familiar que atenda este cardápio nas datas de entrega.');

  return tx(() => {
    const ids: number[] = [];
    for (const p of pedidos.values()) {
      const id = inserir('pedidos', {
        municipio_id: municipioId, cardapio_id: cardapioId, agricultor_id: p.agricultor_id, area_id: p.area_id, escola_id: p.escola_id,
        data_entrega: p.data_entrega, coleta_inicio: p.coleta_inicio, coleta_fim: p.coleta_fim, status: 'gerado', criado_em: isoInstante(),
      });
      for (const l of p.linhas) {
        inserir('pedido_itens', { pedido_id: id, oferta_id: l.oferta_id, alimento_id: l.alimento_id, quantidade_kg: l.kg, preco_kg: l.preco_kg, frete_kg: l.frete_kg });
        exec('UPDATE ofertas SET comprometido_kg = comprometido_kg + ? WHERE id = ?', l.kg, l.oferta_id);
      }
      ids.push(id);
    }
    const valor = [...pedidos.values()].reduce((s, p) => s + p.linhas.reduce((t, l) => t + l.kg * (l.preco_kg + l.frete_kg), 0), 0);
    registrar(autor, municipioId, 'Pedidos gerados a partir do cardápio aprovado', 'cardapio', cardapioId, { pedidos: ids.length, valor: arred(valor), sem_oferta_local: descoberto.length });
    return { pedidos: ids, valor: arred(valor), descoberto };
  });
}

const SELECT_PEDIDO = `
  SELECT p.*, g.nome AS agricultor, e.nome AS escola, ar.nome AS area, ar.lat AS area_lat, ar.lng AS area_lng, ar.tipo_via,
         e.lat AS escola_lat, e.lng AS escola_lng,
         (SELECT COALESCE(SUM(quantidade_kg), 0) FROM pedido_itens WHERE pedido_id = p.id) AS kg,
         (SELECT COALESCE(SUM(quantidade_kg * (preco_kg + frete_kg)), 0) FROM pedido_itens WHERE pedido_id = p.id) AS valor,
         (SELECT r.prestador_id FROM rota_pedidos rp JOIN rotas r ON r.id = rp.rota_id WHERE rp.pedido_id = p.id ORDER BY r.id LIMIT 1) AS prestador_id,
         (SELECT pr.nome FROM rota_pedidos rp JOIN rotas r ON r.id = rp.rota_id JOIN prestadores pr ON pr.id = r.prestador_id WHERE rp.pedido_id = p.id ORDER BY r.id LIMIT 1) AS prestador
  FROM pedidos p JOIN agricultores g ON g.id = p.agricultor_id JOIN escolas e ON e.id = p.escola_id JOIN areas ar ON ar.id = p.area_id`;

export type FiltroPedidos = { status?: string; data?: string; agricultor_id?: number; escola_id?: number; prestador_id?: number; desde?: string };

export function listarPedidos(municipioId: number, f: FiltroPedidos = {}) {
  const cond = ['p.municipio_id = ?'];
  const par: unknown[] = [municipioId];
  if (f.status) (cond.push('p.status = ?'), par.push(f.status));
  if (f.data) (cond.push('p.data_entrega = ?'), par.push(f.data));
  if (f.desde) (cond.push('p.data_entrega >= ?'), par.push(f.desde));
  if (f.agricultor_id) (cond.push('p.agricultor_id = ?'), par.push(f.agricultor_id));
  if (f.escola_id) (cond.push('p.escola_id = ?'), par.push(f.escola_id));
  if (f.prestador_id)
    (cond.push('EXISTS (SELECT 1 FROM rota_pedidos rp JOIN rotas r ON r.id = rp.rota_id WHERE rp.pedido_id = p.id AND r.prestador_id = ?)'), par.push(f.prestador_id));
  return todos<any>(`${SELECT_PEDIDO} WHERE ${cond.join(' AND ')} ORDER BY p.data_entrega DESC, p.id DESC LIMIT 400`, ...par).map((p) => ({ ...p, kg: arred(p.kg, 1), valor: arred(p.valor) }));
}

export function detalharPedido(municipioId: number, id: number) {
  const p = um<any>(`${SELECT_PEDIDO} WHERE p.id = ? AND p.municipio_id = ?`, id, municipioId);
  if (!p) throw new ErroNegocio('Pedido não encontrado.', 404);
  const itens = todos<any>('SELECT i.*, a.nome AS alimento, a.armazenamento FROM pedido_itens i JOIN alimentos a ON a.id = i.alimento_id WHERE i.pedido_id = ? ORDER BY a.nome', id);
  const evidencias = todos<any>('SELECT id, ponto, papel, autor_nome, foto_hash, lat, lng, registrado_em, km, itens, checklist, observacao, simulada, substituida FROM evidencias WHERE pedido_id = ? ORDER BY id', id).map((e) => ({
    ...e, itens: JSON.parse(e.itens), checklist: e.checklist ? JSON.parse(e.checklist) : null,
  }));
  const validacao = um<any>('SELECT * FROM validacoes WHERE pedido_id = ? ORDER BY id DESC LIMIT 1', id);
  const liquidacao = um<any>('SELECT * FROM liquidacoes WHERE pedido_id = ?', id);
  const rotas = todos<any>('SELECT r.id, r.viagem, r.inicio, r.fim, r.prestador_id, pr.nome AS prestador, pr.modal, pr.agricultor_id AS prestador_agricultor_id, rp.kg, rp.custo_referencia FROM rota_pedidos rp JOIN rotas r ON r.id = rp.rota_id JOIN prestadores pr ON pr.id = r.prestador_id WHERE rp.pedido_id = ? ORDER BY r.id', id);
  return {
    ...p, kg: arred(p.kg, 1), valor: arred(p.valor), itens, evidencias, rotas,
    validacao: validacao && { ...validacao, visao: JSON.parse(validacao.visao), integridade: JSON.parse(validacao.integridade), esg: JSON.parse(validacao.esg) },
    liquidacao: liquidacao && { ...liquidacao, comprovantes: liquidacao.comprovantes ? JSON.parse(liquidacao.comprovantes) : [] },
  };
}
