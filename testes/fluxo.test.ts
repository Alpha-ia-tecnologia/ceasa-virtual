// Testes do fluxo de ponta a ponta sobre um banco em memória.
// Rodar com: npm test
process.env.CEASA_DB = ':memory:';

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const { db, todos, um } = await import('../server/db.ts');
const { popular } = await import('../server/seed/seed.ts');
const { verificarTrilha } = await import('../server/trilha.ts');
const { cobertura } = await import('../server/dominio/nutricao.ts');
const { gerarPropostas, aprovar, buscarCardapio } = await import('../server/dominio/cardapio.ts');
const { gerarPedidos } = await import('../server/dominio/pedidos.ts');
const { planejarRotas, roteirizar, bateriaCenarios } = await import('../server/dominio/rotas.ts');
const { resolverDivergencia } = await import('../server/dominio/auditoria.ts');
const { pagar } = await import('../server/dominio/pagamentos.ts');
const { avancarPedido } = await import('../server/dominio/sandbox.ts');
const { painel } = await import('../server/dominio/painel.ts');
const { recomendar, simularRecomendacoes, proximaSemana } = await import('../server/dominio/recomendacoes.ts');
const { PARAMS_PADRAO } = await import('../server/util.ts');

const MUN = 1;
const nutri = { id: 5, nome: 'Nutricionista de teste', perfil: 'nutricionista' as const };
const controle = { id: 6, nome: 'Controle de teste', perfil: 'controle' as const };

before(() => {
  popular();
});

test('a carga do sandbox percorre o fluxo inteiro e deixa a trilha íntegra', () => {
  const status = Object.fromEntries(todos<any>('SELECT status, COUNT(*) AS n FROM pedidos GROUP BY status').map((s) => [s.status, s.n]));
  assert.ok(status.pago > 100, 'semanas passadas devem estar pagas');
  assert.equal(status.gerado ?? 0, 0, 'todo pedido da carga recebe rota');
  assert.deepEqual(verificarTrilha().integra, true);
});

test('a trilha de auditoria não aceita alteração nem exclusão [RF-AUD-06]', () => {
  assert.throws(() => db.exec("UPDATE trilha SET acao = 'adulterado' WHERE seq = 1"), /imutável/);
  assert.throws(() => db.exec('DELETE FROM trilha WHERE seq = 1'), /imutável/);
});

test('a cobertura da base passa de 95% e aponta o que falta [RF-NUT-05]', () => {
  const c = cobertura();
  assert.ok(c.indice > 0.95);
  assert.ok(c.pendencias.length > 0);
});

test('as três alternativas ficam acima de 85% de adequação e só a aprovada gera pedidos [RF-CAR]', () => {
  const semana = proximaSemana();
  const ids = gerarPropostas(MUN, semana, nutri);
  assert.equal(ids.length, 3);
  for (const id of ids) {
    const m = JSON.parse(buscarCardapio(MUN, id).metricas).metricas;
    assert.ok(m.adequacao > 0.85, `adequação ${m.adequacao}`);
    assert.ok(m.adequacao_calorica > 0.85);
  }
  assert.throws(() => gerarPedidos(MUN, ids[0], controle), /aprovado pela nutricionista/);
  const combinado = um<any>(`SELECT id FROM cardapios WHERE id IN (${ids.join(',')}) AND modo = 'combinado'`).id;
  aprovar(MUN, combinado, nutri);
  assert.equal(um<any>(`SELECT COUNT(*) AS n FROM cardapios WHERE id IN (${ids.join(',')}) AND status = 'arquivado'`).n, 2);
  const r = gerarPedidos(MUN, combinado, controle);
  assert.ok(r.pedidos.length > 10);
  assert.throws(() => gerarPedidos(MUN, combinado, controle), /já foram gerados/);
  // nenhuma oferta fica comprometida além do que tem
  assert.equal(um<any>('SELECT COUNT(*) AS n FROM ofertas WHERE comprometido_kg > quantidade_kg + 0.01').n, 0);
});

test('sem preço definido pelo gestor não há pedido [RF-CON-02]', () => {
  const semana = proximaSemana();
  const outra = new Date(`${semana}T12:00:00`);
  outra.setDate(outra.getDate() + 7);
  const s2 = outra.toISOString().slice(0, 10);
  // repete as ofertas para a semana seguinte e retira um preço
  db.exec(`INSERT INTO ofertas (municipio_id, agricultor_id, area_id, alimento_id, quantidade_kg, data_colheita, data_limite, preco_kg, coleta_inicio, coleta_fim, criado_em)
           SELECT municipio_id, agricultor_id, area_id, alimento_id, quantidade_kg, date(data_colheita, '+7 days'), date(data_limite, '+7 days'), preco_kg, coleta_inicio, coleta_fim, criado_em FROM ofertas WHERE municipio_id = 1 AND data_colheita >= date('${semana}', '-2 days')`);
  const ids = gerarPropostas(MUN, s2, nutri);
  const demanda = um<any>(`SELECT id FROM cardapios WHERE id IN (${ids.join(',')}) AND modo = 'demand'`).id;
  aprovar(MUN, demanda, nutri);
  db.exec("UPDATE precos SET vigente = 0 WHERE alimento_id = (SELECT id FROM alimentos WHERE codigo = 'F001')");
  assert.throws(() => gerarPedidos(MUN, demanda, controle), /Falta o preço de referência.*Banana/);
  db.exec("UPDATE precos SET vigente = 1 WHERE alimento_id = (SELECT id FROM alimentos WHERE codigo = 'F001')");
});

test('entrega validada libera o pagamento dividido; divergência bloqueia [RF-AUD, RF-PAG]', () => {
  const data = um<any>("SELECT data_entrega FROM pedidos WHERE status = 'gerado' ORDER BY data_entrega LIMIT 1").data_entrega;
  const plano = planejarRotas(MUN, data, controle);
  assert.equal(plano.nao_atendidas.length, 0);
  const [a, b] = todos<any>("SELECT p.id FROM pedidos p JOIN agricultores g ON g.id = p.agricultor_id WHERE p.status = 'roteirizado' AND p.data_entrega = ? AND g.titular_documento = g.documento ORDER BY p.id LIMIT 2", data);

  // entrega sem problemas
  avancarPedido(MUN, a.id, controle);
  avancarPedido(MUN, a.id, controle);
  const fim = avancarPedido(MUN, a.id, controle);
  assert.equal(fim.validacao?.resultado, 'validada');
  const l = um<any>('SELECT * FROM liquidacoes WHERE pedido_id = ?', a.id);
  assert.equal(l.status, 'pendente');
  assert.ok(Math.abs(l.iss - l.valor_frete * PARAMS_PADRAO.aliquota_iss) < 0.011, 'ISS incide sobre o frete');
  assert.ok(Math.abs(l.valor_frete - l.iss - l.liquido_prestador) < 0.011);
  assert.equal(pagar(MUN, l.id, controle).pago, true);
  assert.equal(um<any>('SELECT status FROM pedidos WHERE id = ?', a.id).status, 'pago');
  assert.throws(() => pagar(MUN, l.id, controle), /já foi paga/);

  // foto reaproveitada: divergência, sem liquidação até a decisão
  avancarPedido(MUN, b.id, controle);
  avancarPedido(MUN, b.id, controle);
  const div = avancarPedido(MUN, b.id, controle, 'foto_repetida');
  assert.equal(div.validacao?.resultado, 'divergencia');
  assert.equal(um('SELECT 1 FROM liquidacoes WHERE pedido_id = ?', b.id), undefined);
  assert.throws(() => resolverDivergencia(MUN, b.id, { decisao: 'recusar', motivo: ' ' }, controle), /motivo/);
  resolverDivergencia(MUN, b.id, { decisao: 'nova_evidencia', ponto: 'destino', papel: 'escola', motivo: 'Refazer a foto' }, controle);
  assert.equal(avancarPedido(MUN, b.id, controle).validacao?.resultado, 'validada');
  assert.equal(verificarTrilha().integra, true);
});

test('conta que não está em nome do agricultor bloqueia o pagamento [RF-PAG-03]', () => {
  const bloqueadas = todos<any>("SELECT l.id, g.documento, g.titular_documento FROM liquidacoes l JOIN pedidos p ON p.id = l.pedido_id JOIN agricultores g ON g.id = p.agricultor_id WHERE l.status = 'bloqueada'");
  assert.ok(bloqueadas.length > 0);
  for (const b of bloqueadas) assert.notEqual(b.documento, b.titular_documento);
  assert.throws(() => pagar(MUN, bloqueadas[0].id, controle), /bloqueado/);
});

test('a roteirização fraciona cargas maiores que o veículo e respeita janelas [RF-LOG-01, 02]', () => {
  const base = { lat: -4.5, lng: -45 };
  const carga = {
    id: 1, kg: 100, agricultor_id: null, refrigerado: false,
    origem: { id: 1, nome: 'Roça', lat: -4.49, lng: -45.01, janela: [330, 600] as [number, number], tipo_via: 'chao' as const },
    destino: { id: 1, nome: 'Escola', lat: -4.5, lng: -45, janela: [420, 660] as [number, number] },
  };
  const moto = { id: 1, nome: 'Moto', modal: 'moto' as const, capacidade_kg: 40, caixa_termica: false, agricultor_id: null, base };
  const r = roteirizar([carga], [moto], PARAMS_PADRAO, base);
  assert.equal(r.viavel, true);
  assert.equal(r.viagens.length, 3, '100 kg numa moto de 40 kg viram três viagens');
  assert.equal(r.viagens.reduce((s, v) => s + v.carga_kg, 0), 100);
  for (const v of r.viagens) assert.ok(v.paradas.every((p) => p.tipo === 'coleta' || p.chegada <= '11:00'));
  // custo de referência: ida e volta × índice da via × valor-base
  const v = r.viagens[0];
  assert.ok(Math.abs(v.custo_referencia - v.km_ida_volta * PARAMS_PADRAO.indices_via.chao) < 0.02);
  // janela impossível: a escola fecha antes da coleta abrir
  const impossivel = roteirizar([{ ...carga, destino: { ...carga.destino, janela: [300, 320] } }], [moto], PARAMS_PADRAO, base);
  assert.equal(impossivel.viavel, false);
  assert.match(impossivel.nao_atendidas[0].motivo, /janela/);
  // a pé não alcança 12 km
  const longe = roteirizar([{ ...carga, kg: 5, origem: { ...carga.origem, lat: -4.4 }, destino: { ...carga.destino, janela: [420, 1020] } }], [{ ...moto, modal: 'a_pe', capacidade_kg: 12 }], PARAMS_PADRAO, base);
  assert.match(longe.nao_atendidas[0].motivo, /alcance/);
});

test('a bateria de cenários sintéticos é viável em 100% [marco do mês 6]', () => {
  const b = bateriaCenarios(MUN, 30);
  assert.equal(b.viaveis, b.quantidade);
});

test('recomendações respeitam a escuta e a simulação mostra o efeito [RF-REC]', () => {
  const r = recomendar(MUN);
  assert.ok(r.agricultores_sem_escuta.includes('Pedro Bacaba'));
  assert.ok(r.recomendacoes.every((x: any) => x.agricultor !== 'Pedro Bacaba' && x.motivos.length > 0));
  if (r.recomendacoes.length) {
    const s = simularRecomendacoes(MUN);
    assert.ok(s.falta_kg.depois <= s.falta_kg.antes);
    assert.ok(s.pct_af.depois >= s.pct_af.antes);
  }
});

test('o painel calcula a cota sobre o repasse e projeta até o fim do ano letivo [RF-GES-01]', () => {
  const p = painel(MUN);
  assert.ok(Math.abs(p.cota.pct - p.cota.adquirido / p.cota.repasse) < 0.0001);
  assert.ok(p.cota.projetado >= p.cota.adquirido);
  assert.equal(p.cota.em_risco, p.cota.projetado < p.cota.meta);
  // isolamento entre municípios [RF-COM-01]: cada painel conta só as entregas do seu município
  const validadas = (m: number) => um<any>("SELECT COUNT(*) AS n FROM pedidos WHERE municipio_id = ? AND status IN ('validado', 'pago')", m).n;
  assert.ok(validadas(2) > 0, 'o segundo município também opera no sandbox');
  assert.equal(painel(1).indicadores.entregas_validadas, validadas(1));
  assert.equal(painel(2).indicadores.entregas_validadas, validadas(2));
});

test('sem acesso ao serviço de rotas, o traçado cai para a linha aproximada sem quebrar o mapa', async () => {
  const { tracarTrajeto } = await import('../server/integracoes/trajetos.ts');
  const rota = um<any>('SELECT paradas FROM rotas LIMIT 1');
  const paradas = JSON.parse(rota.paradas);
  const t = await tracarTrajeto(paradas, 'moto');
  assert.equal(t.fonte, 'aproximado');
  assert.equal(t.km, null);
  assert.equal(t.geometria.length, paradas.length);
  assert.deepEqual(t.marcos, paradas.map((_: unknown, i: number) => i));
});
