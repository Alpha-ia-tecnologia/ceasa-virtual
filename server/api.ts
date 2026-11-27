import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { todos, um, inserir, atualizar, exec, tx, json, ErroNegocio, DIR_EVIDENCIAS } from './db.ts';
import { municipio, hoje, somarDias, segundaDe, isoInstante, arred, PARAMS_PADRAO, type Params } from './util.ts';
import { registrar, verificarTrilha } from './trilha.ts';
import { autenticar, ctx, exigir, abrirSessao, fecharSessao, conferirSenha, SANDBOX } from './auth.ts';
import { pode, PERFIS_CAMPO, MODAIS, TIPOS_VIA, TIPOS_AGRICULTOR, GRUPOS, type Perfil } from '../compartilhado/dominio.ts';
import { listarAlimentos, listarReferencias, cobertura, lerCsv, FAIXA_MACRO, PESOS_ADEQUACAO } from './dominio/nutricao.ts';
import { salvarBase, gerarPropostas, ajustarItens, aprovar, buscarCardapio, itensDoCardapio, carregarContexto, avaliar, cardapioBase } from './dominio/cardapio.ts';
import { gerarPedidos, necessidades, listarPedidos, detalharPedido } from './dominio/pedidos.ts';
import { planejarRotas, listarRotas, comparativoDaData, bateriaCenarios } from './dominio/rotas.ts';
import { registrarEvidencia, resolverDivergencia, filaDeDivergencias, pendencias } from './dominio/auditoria.ts';
import { pagar, pagarLote, listarLiquidacoes } from './dominio/pagamentos.ts';
import { recomendar, simularRecomendacoes, proximaSemana } from './dominio/recomendacoes.ts';
import { painel, consolidado } from './dominio/painel.ts';
import { avancarPedido } from './dominio/sandbox.ts';
import { popular, SENHA_SANDBOX } from './seed/seed.ts';
import { montarEdital } from './dominio/edital.ts';
import { tracarTrajeto } from './integracoes/trajetos.ts';

export const api = express.Router();
api.use(express.json({ limit: '9mb' }));

const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
const texto = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const obrigatorio = (v: unknown, campo: string) => {
  const t = texto(v);
  if (!t) throw new ErroNegocio(`Preencha o campo "${campo}".`);
  return t;
};
const coordenada = (lat: unknown, lng: unknown) => {
  const a = Number(lat), b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) throw new ErroNegocio('Marque a localização no mapa.');
  return { lat: a, lng: b };
};

// ---------- acesso ----------
api.post('/entrar', (req, res) => {
  const u = um<any>('SELECT * FROM usuarios WHERE email = ? AND ativo = 1', texto(req.body?.email).toLowerCase());
  if (!u || !conferirSenha(String(req.body?.senha ?? ''), u.senha_hash)) throw new ErroNegocio('E-mail ou senha incorretos.', 401);
  abrirSessao(res, u);
  registrar({ id: u.id, nome: u.nome, perfil: u.perfil }, u.municipio_id, 'Entrada na plataforma', 'usuario', u.id, {}, 'admin');
  res.json({ ok: true });
});
api.get('/sandbox/perfis', (_req, res) => {
  if (!SANDBOX) return res.json({ sandbox: false, usuarios: [] });
  res.json({ sandbox: true, senha: SENHA_SANDBOX, usuarios: todos('SELECT u.id, u.nome, u.email, u.perfil, m.nome AS municipio FROM usuarios u LEFT JOIN municipios m ON m.id = u.municipio_id WHERE u.ativo = 1 ORDER BY u.id') });
});
api.post('/sandbox/entrar', (req, res) => {
  if (!SANDBOX) throw new ErroNegocio('O acesso rápido só existe no ambiente de simulação.', 403);
  const u = um<any>('SELECT * FROM usuarios WHERE id = ? AND ativo = 1', num(req.body?.usuario_id));
  if (!u) throw new ErroNegocio('Usuário não encontrado.', 404);
  abrirSessao(res, u);
  res.json({ ok: true });
});
api.post('/sair', (req, res) => {
  fecharSessao(req, res);
  res.json({ ok: true });
});

api.use(autenticar);

api.get('/eu', (_req, res) => {
  const c = ctx(res);
  const mun = municipio(c.municipioId);
  let vinculo: any = null;
  if (c.perfil === 'agricultor') vinculo = um('SELECT id, nome FROM agricultores WHERE id = ?', c.usuario.vinculo_id);
  if (c.perfil === 'prestador') vinculo = um('SELECT id, nome, modal, agricultor_id FROM prestadores WHERE id = ?', c.usuario.vinculo_id);
  if (c.perfil === 'diretor') vinculo = um('SELECT id, nome FROM escolas WHERE id = ?', c.usuario.vinculo_id);
  // o agricultor que entrega a própria produção também vê as suas corridas
  const prestadorProprio = c.perfil === 'agricultor' ? um<any>('SELECT id, modal FROM prestadores WHERE agricultor_id = ?', c.usuario.vinculo_id) : null;
  res.json({
    usuario: c.usuario, vinculo, prestador_proprio: prestadorProprio, sandbox: SANDBOX, hoje: hoje(),
    municipio: { id: mun.id, nome: mun.nome, uf: mun.uf, lat: mun.lat, lng: mun.lng, raio_km: mun.raio_km, modo_piloto: !!mun.modo_piloto, exercicio: mun.exercicio },
    municipios: c.perfil === 'operador' ? todos('SELECT id, nome FROM municipios ORDER BY nome') : [],
  });
});
api.post('/municipio-ativo', (req, res) => {
  const c = ctx(res);
  if (c.perfil !== 'operador') throw new ErroNegocio('Só o operador troca de município.', 403);
  const m = municipio(Number(req.body?.municipio_id));
  exec('UPDATE sessoes SET municipio_id = ? WHERE token = ?', m.id, c.token);
  res.json({ ok: true });
});

/** Perfis de campo só enxergam o que é seu. */
function escopo(res: Response) {
  const c = ctx(res);
  const v = c.usuario.vinculo_id ?? -1;
  return {
    agricultor_id: c.perfil === 'agricultor' ? v : undefined,
    prestador_id: c.perfil === 'prestador' ? v : undefined,
    escola_id: c.perfil === 'diretor' ? v : undefined,
  };
}
function somenteGestao(res: Response) {
  const c = ctx(res);
  if (PERFIS_CAMPO.includes(c.perfil)) throw new ErroNegocio('Esta área é da equipe de gestão do município.', 403);
  return c;
}

// ---------- território e cadastros [RF-CAD-01..05] ----------
api.get('/territorio', (_req, res) => {
  const c = ctx(res);
  const mun = municipio(c.municipioId);
  const sensivel = pode(c.perfil, 'dados.sensiveis');
  const meuId = c.perfil === 'agricultor' ? c.usuario.vinculo_id : null;
  const mascara = (a: any) => (sensivel || a.id === meuId ? a : { ...a, documento: '•••', caf: '•••', banco: '•••', agencia: '•••', conta: '•••', titular_documento: '•••', res_lat: null, res_lng: null });
  const areas = todos<any>('SELECT a.* FROM areas a JOIN agricultores g ON g.id = a.agricultor_id WHERE g.municipio_id = ? ORDER BY a.id', c.municipioId);
  res.json({
    municipio: { id: mun.id, nome: mun.nome, uf: mun.uf, cnpj: mun.cnpj, entidade_executora: mun.entidade_executora, repasse_fnde_anual: mun.repasse_fnde_anual, exercicio: mun.exercicio, lat: mun.lat, lng: mun.lng, raio_km: mun.raio_km },
    escolas: todos<any>('SELECT * FROM escolas WHERE municipio_id = ? ORDER BY nome', c.municipioId).map((e) => ({ ...e, janelas: json(e.janelas, []), alunos: json(e.alunos, {}) })),
    agricultores: todos<any>('SELECT * FROM agricultores WHERE municipio_id = ? ORDER BY nome', c.municipioId).map((a) =>
      mascara({ ...a, produtos: json(a.produtos, []), escuta: json(a.escuta, null), titular_ok: (a.titular_documento ?? '').replace(/\D/g, '') === (a.documento ?? '').replace(/\D/g, ''), areas: areas.filter((x) => x.agricultor_id === a.id) }),
    ),
    prestadores: todos<any>('SELECT * FROM prestadores WHERE municipio_id = ? ORDER BY nome', c.municipioId).map((p) => (sensivel ? p : { ...p, documento: '•••', banco: '•••', agencia: '•••', conta: '•••' })),
  });
});

api.put('/municipio', (req, res) => {
  const c = exigir(res, 'cadastros.editar');
  const b = req.body ?? {};
  const dados = { nome: obrigatorio(b.nome, 'Nome'), cnpj: texto(b.cnpj, 20), entidade_executora: texto(b.entidade_executora), repasse_fnde_anual: Math.max(0, Number(b.repasse_fnde_anual) || 0) };
  atualizar('municipios', c.municipioId, dados);
  registrar(c.autor, c.municipioId, 'Cadastro do município alterado', 'municipio', c.municipioId, dados, 'admin');
  res.json({ ok: true });
});

function dadosEscola(b: any) {
  const janelas = (Array.isArray(b.janelas) ? b.janelas : []).filter((j: any) => j.dia >= 1 && j.dia <= 5 && /^\d\d:\d\d$/.test(j.inicio) && /^\d\d:\d\d$/.test(j.fim) && j.inicio < j.fim);
  if (!janelas.length) throw new ErroNegocio('Informe pelo menos uma janela de recebimento (dia e horário).');
  const alunos = Object.fromEntries(Object.entries(b.alunos ?? {}).map(([k, v]) => [k, Math.max(0, Math.round(Number(v) || 0))]).filter(([, v]) => (v as number) > 0));
  return { nome: obrigatorio(b.nome, 'Nome da escola'), endereco: texto(b.endereco), ...coordenada(b.lat, b.lng), diretor: texto(b.diretor), janelas, cap_refrigerado_kg: Number(b.cap_refrigerado_kg) || 0, cap_seco_kg: Number(b.cap_seco_kg) || 0, alunos };
}
api.post('/escolas', (req, res) => {
  const c = exigir(res, 'cadastros.editar');
  const id = inserir('escolas', { municipio_id: c.municipioId, ...dadosEscola(req.body) });
  registrar(c.autor, c.municipioId, 'Escola cadastrada', 'escola', id, { nome: req.body.nome }, 'admin');
  res.json({ id });
});
api.put('/escolas/:id', (req, res) => {
  const c = exigir(res, 'cadastros.editar');
  const id = Number(req.params.id);
  if (!um('SELECT 1 FROM escolas WHERE id = ? AND municipio_id = ?', id, c.municipioId)) throw new ErroNegocio('Escola não encontrada.', 404);
  atualizar('escolas', id, dadosEscola(req.body));
  registrar(c.autor, c.municipioId, 'Cadastro de escola alterado', 'escola', id, { nome: req.body.nome }, 'admin');
  res.json({ id });
});

function dadosAgricultor(b: any) {
  if (!(b.tipo in TIPOS_AGRICULTOR)) throw new ErroNegocio('Escolha o tipo de agricultor.');
  const res = b.res_lat != null && b.res_lat !== '' ? coordenada(b.res_lat, b.res_lng) : null;
  return {
    nome: obrigatorio(b.nome, 'Nome'), tipo: b.tipo, documento: obrigatorio(b.documento, 'CPF ou CNPJ'), caf: texto(b.caf, 40),
    res_lat: res?.lat ?? null, res_lng: res?.lng ?? null, banco: texto(b.banco, 60), agencia: texto(b.agencia, 20), conta: texto(b.conta, 30),
    titular_documento: texto(b.titular_documento, 20) || texto(b.documento, 20), produtos: (Array.isArray(b.produtos) ? b.produtos : []).map(Number).filter(Boolean),
  };
}
function gravarAreas(agricultorId: number, areas: any[]) {
  if (!Array.isArray(areas) || !areas.length) throw new ErroNegocio('Cadastre pelo menos uma área de plantação, com a localização.');
  for (const a of areas) {
    if (!(a.tipo_via in TIPOS_VIA)) throw new ErroNegocio('Escolha o tipo de via de acesso da área.');
    const d = { nome: obrigatorio(a.nome, 'Nome da área'), ...coordenada(a.lat, a.lng), hectares: Number(a.hectares) || 0, tipo_via: a.tipo_via };
    if (a.id && um('SELECT 1 FROM areas WHERE id = ? AND agricultor_id = ?', a.id, agricultorId)) atualizar('areas', a.id, d);
    else inserir('areas', { agricultor_id: agricultorId, ...d });
  }
}
api.post('/agricultores', (req, res) => {
  const c = exigir(res, 'cadastros.editar');
  const id = tx(() => {
    const novo = inserir('agricultores', { municipio_id: c.municipioId, ...dadosAgricultor(req.body), criado_em: isoInstante() });
    gravarAreas(novo, req.body.areas);
    registrar(c.autor, c.municipioId, 'Agricultor cadastrado', 'agricultor', novo, { nome: req.body.nome }, 'admin');
    return novo;
  });
  res.json({ id });
});
api.put('/agricultores/:id', (req, res) => {
  const c = exigir(res, 'cadastros.editar');
  const id = Number(req.params.id);
  if (!um('SELECT 1 FROM agricultores WHERE id = ? AND municipio_id = ?', id, c.municipioId)) throw new ErroNegocio('Agricultor não encontrado.', 404);
  tx(() => {
    atualizar('agricultores', id, dadosAgricultor(req.body));
    gravarAreas(id, req.body.areas);
    registrar(c.autor, c.municipioId, 'Cadastro de agricultor alterado', 'agricultor', id, { nome: req.body.nome }, 'admin');
  });
  res.json({ id });
});
// escuta do agricultor [RF-REC-05]
api.put('/agricultores/:id/escuta', (req, res) => {
  const c = exigir(res, 'escuta.registrar');
  const id = Number(req.params.id);
  if (c.perfil === 'agricultor' && c.usuario.vinculo_id !== id) throw new ErroNegocio('Você só pode registrar a sua própria escuta.', 403);
  if (!um('SELECT 1 FROM agricultores WHERE id = ? AND municipio_id = ?', id, c.municipioId)) throw new ErroNegocio('Agricultor não encontrado.', 404);
  const b = req.body ?? {};
  const lista = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter(Boolean) : []);
  const escuta = { quer: lista(b.quer), sabe: lista(b.sabe), gostaria: lista(b.gostaria), lucrativo: lista(b.lucrativo), area_ha: Math.max(0, Number(b.area_ha) || 0), agua: ['sim', 'sazonal', 'nao'].includes(b.agua) ? b.agua : 'sazonal', mao_de_obra: Math.max(0, Math.round(Number(b.mao_de_obra) || 0)), observacao: texto(b.observacao, 500), registrado_em: isoInstante(), registrado_por: c.autor.nome };
  exec('UPDATE agricultores SET escuta = ? WHERE id = ?', escuta, id);
  registrar(c.autor, c.municipioId, 'Escuta do agricultor registrada', 'agricultor', id, { quer: escuta.quer.length, sabe: escuta.sabe.length });
  res.json({ ok: true });
});

function dadosPrestador(b: any, municipioId: number) {
  if (!(b.modal in MODAIS)) throw new ErroNegocio('Escolha o meio de transporte.');
  const agricultorId = num(b.agricultor_id) ?? null;
  if (agricultorId && !um('SELECT 1 FROM agricultores WHERE id = ? AND municipio_id = ?', agricultorId, municipioId)) throw new ErroNegocio('Agricultor vinculado não encontrado.');
  const base = coordenada(b.base_lat, b.base_lng);
  return {
    nome: obrigatorio(b.nome, 'Nome'), documento: obrigatorio(b.documento, 'Documento'), modal: b.modal, capacidade_kg: Math.max(1, Number(b.capacidade_kg) || MODAIS[b.modal as keyof typeof MODAIS].capacidade_kg),
    caixa_termica: b.caixa_termica ? 1 : 0, area_atuacao: texto(b.area_atuacao), inscricao_municipal: texto(b.inscricao_municipal, 40), banco: texto(b.banco, 60), agencia: texto(b.agencia, 20), conta: texto(b.conta, 30),
    agricultor_id: agricultorId, base_lat: base.lat, base_lng: base.lng,
  };
}
api.post('/prestadores', (req, res) => {
  const c = exigir(res, 'cadastros.editar');
  const id = inserir('prestadores', { municipio_id: c.municipioId, ...dadosPrestador(req.body, c.municipioId) });
  registrar(c.autor, c.municipioId, 'Prestador de frete cadastrado', 'prestador', id, { nome: req.body.nome, modal: req.body.modal }, 'admin');
  res.json({ id });
});
api.put('/prestadores/:id', (req, res) => {
  const c = exigir(res, 'cadastros.editar');
  const id = Number(req.params.id);
  if (!um('SELECT 1 FROM prestadores WHERE id = ? AND municipio_id = ?', id, c.municipioId)) throw new ErroNegocio('Prestador não encontrado.', 404);
  atualizar('prestadores', id, dadosPrestador(req.body, c.municipioId));
  registrar(c.autor, c.municipioId, 'Cadastro de prestador alterado', 'prestador', id, { nome: req.body.nome }, 'admin');
  res.json({ id });
});

// ---------- base nutricional [RF-NUT-01..06] ----------
api.get('/alimentos', (_req, res) => res.json(listarAlimentos()));
api.get('/nutricao', (_req, res) =>
  res.json({ cobertura: cobertura(), referencias: listarReferencias(), versoes: todos('SELECT * FROM taco_versoes ORDER BY id DESC'), criterios: { faixa_macro: FAIXA_MACRO, pesos: PESOS_ADEQUACAO } }),
);
const CAMPOS_NUM = ['kcal', 'ptn', 'cho', 'lip', 'fibra', 'calcio', 'ferro', 'vit_c', 'validade_dias', 'percapita_padrao_g'] as const;
api.put('/alimentos/:id', (req, res) => {
  const c = exigir(res, 'nutricao.editar');
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const dados: Record<string, unknown> = {};
  for (const k of CAMPOS_NUM) if (k in b) dados[k] = b[k] === '' || b[k] === null ? null : Math.max(0, Number(b[k]));
  if ('produto_agricola' in b) dados.produto_agricola = texto(b.produto_agricola) || null;
  if ('armazenamento' in b && ['seco', 'ambiente', 'refrigerado'].includes(b.armazenamento)) dados.armazenamento = b.armazenamento;
  if ('agricola' in b) dados.agricola = b.agricola ? 1 : 0;
  atualizar('alimentos', id, dados);
  registrar(c.autor, null, 'Base nutricional alterada', 'alimento', id, dados, 'admin');
  res.json({ ok: true });
});
// importação da TACO por CSV: codigo;nome;grupo;kcal;ptn;cho;lip;fibra;calcio;ferro;vit_c
api.post('/nutricao/importar', (req, res) => {
  const c = exigir(res, 'nutricao.editar');
  const linhas = lerCsv(String(req.body?.csv ?? ''));
  if (!linhas.length) throw new ErroNegocio('O arquivo não tem linhas. Use o cabeçalho: codigo;nome;grupo;kcal;ptn;cho;lip;fibra;calcio;ferro;vit_c');
  const n = (v: string) => (v === '' || v === undefined ? null : Number(v.replace(',', '.')));
  const resultado = tx(() => {
    const versao = inserir('taco_versoes', { rotulo: obrigatorio(req.body?.rotulo, 'Nome da versão'), fonte: texto(req.body?.fonte), importado_em: isoInstante(), importado_por: c.autor.nome, total: linhas.length });
    let novos = 0, atualizados = 0;
    for (const l of linhas) {
      if (!l.codigo || !l.nome) throw new ErroNegocio('Toda linha precisa de código e nome.');
      const dados = { nome: l.nome, kcal: n(l.kcal), ptn: n(l.ptn), cho: n(l.cho), lip: n(l.lip), fibra: n(l.fibra), calcio: n(l.calcio), ferro: n(l.ferro), vit_c: n(l.vit_c), versao_id: versao };
      const existente = um<any>('SELECT id FROM alimentos WHERE codigo = ?', l.codigo);
      if (existente) (atualizar('alimentos', existente.id, dados), atualizados++);
      else {
        if (!(l.grupo in GRUPOS)) throw new ErroNegocio(`Grupo inválido para "${l.nome}". Use: ${Object.keys(GRUPOS).join(', ')}.`);
        inserir('alimentos', { codigo: l.codigo, grupo: l.grupo, ...dados, referenciado_fnde: 1, agricola: 0, safra: [] });
        novos++;
      }
    }
    registrar(c.autor, null, 'Tabela de composição importada', 'taco_versao', versao, { novos, atualizados }, 'admin');
    return { versao, novos, atualizados };
  });
  res.json(resultado);
});

// ---------- oferta agrícola [RF-OFE-01, 03, 04, 05] ----------
api.get('/ofertas', (req, res) => {
  const c = ctx(res);
  const e = escopo(res);
  if (c.perfil === 'prestador' || c.perfil === 'diretor') throw new ErroNegocio('Esta área não está disponível para o seu perfil.', 403);
  const cond = ['o.municipio_id = ?'];
  const par: unknown[] = [c.municipioId];
  if (e.agricultor_id) (cond.push('o.agricultor_id = ?'), par.push(e.agricultor_id));
  if (!req.query.todas) (cond.push('o.data_limite >= ?'), par.push(hoje()));
  res.json(todos(
    `SELECT o.*, a.nome AS alimento, a.grupo, g.nome AS agricultor, ar.nome AS area, ROUND(o.quantidade_kg - o.comprometido_kg, 1) AS saldo_kg
     FROM ofertas o JOIN alimentos a ON a.id = o.alimento_id JOIN agricultores g ON g.id = o.agricultor_id JOIN areas ar ON ar.id = o.area_id
     WHERE ${cond.join(' AND ')} ORDER BY o.data_limite, a.nome LIMIT 500`,
    ...par,
  ));
});
api.get('/ofertas/consolidado', (_req, res) => {
  const c = somenteGestao(res);
  const mes = Number(hoje().slice(5, 7)) - 1;
  const alimentos = listarAlimentos();
  const produzidos = new Set(todos<any>('SELECT produtos FROM agricultores WHERE municipio_id = ?', c.municipioId).flatMap((a) => json<number[]>(a.produtos, [])));
  res.json({
    por_alimento: todos(
      `SELECT a.id AS alimento_id, a.nome AS alimento, a.grupo, COUNT(*) AS lotes, COUNT(DISTINCT o.agricultor_id) AS agricultores,
              ROUND(SUM(o.quantidade_kg), 1) AS total_kg, ROUND(SUM(o.comprometido_kg), 1) AS comprometido_kg,
              ROUND(SUM(o.quantidade_kg - o.comprometido_kg), 1) AS saldo_kg, MIN(o.data_limite) AS proxima_data_limite
       FROM ofertas o JOIN alimentos a ON a.id = o.alimento_id
       WHERE o.municipio_id = ? AND o.status = 'ativa' AND o.data_limite >= ? GROUP BY a.id ORDER BY a.nome`,
      c.municipioId, hoje(),
    ),
    // calendário sazonal dos produtos cultivados no município, a partir do histórico de safras [RF-OFE-05]
    calendario: alimentos.filter((a) => produzidos.has(a.id) && a.safra.length === 12).map((a) => ({ alimento_id: a.id, alimento: a.nome, grupo: a.grupo, meses: a.safra, agora: a.safra[mes] })),
    mes_atual: mes,
  });
});
api.post('/ofertas', (req, res) => {
  const c = exigir(res, 'ofertas.registrar');
  const b = req.body ?? {};
  const agricultorId = c.perfil === 'agricultor' ? c.usuario.vinculo_id! : Number(b.agricultor_id);
  const area = um<any>('SELECT a.id FROM areas a JOIN agricultores g ON g.id = a.agricultor_id WHERE a.id = ? AND g.id = ? AND g.municipio_id = ?', Number(b.area_id), agricultorId, c.municipioId);
  if (!area) throw new ErroNegocio('Escolha de qual área de plantação sai o produto.');
  const al = listarAlimentos().find((a) => a.id === Number(b.alimento_id));
  if (!al || !al.agricola) throw new ErroNegocio('Escolha o produto.');
  const kg = Number(b.quantidade_kg);
  if (!(kg > 0)) throw new ErroNegocio('Informe a quantidade em kg.');
  if (!/^\d{4}-\d\d-\d\d$/.test(b.data_colheita ?? '')) throw new ErroNegocio('Informe a data da colheita.');
  const ini = /^\d\d:\d\d$/.test(b.coleta_inicio ?? '') ? b.coleta_inicio : '06:00';
  const fim = /^\d\d:\d\d$/.test(b.coleta_fim ?? '') && b.coleta_fim > ini ? b.coleta_fim : '09:00';
  // data-limite de consumo a partir da colheita e da perecibilidade do gênero [RF-OFE-04]
  const id = inserir('ofertas', { municipio_id: c.municipioId, agricultor_id: agricultorId, area_id: area.id, alimento_id: al.id, quantidade_kg: kg, data_colheita: b.data_colheita, data_limite: somarDias(b.data_colheita, al.validade_dias ?? 5), preco_kg: num(b.preco_kg) ?? null, coleta_inicio: ini, coleta_fim: fim, criado_em: isoInstante() });
  registrar(c.autor, c.municipioId, 'Oferta registrada', 'oferta', id, { alimento: al.nome, kg, colheita: b.data_colheita });
  res.json({ id, data_limite: somarDias(b.data_colheita, al.validade_dias ?? 5) });
});

// ---------- cardápio dinâmico [RF-CAR-01..09] ----------
api.get('/cardapios', (_req, res) => {
  const c = somenteGestao(res);
  const base = cardapioBase(c.municipioId);
  const lista = todos<any>("SELECT id, semana, titulo, modo, status, geracao, metricas, justificativa, criado_por, criado_em, aprovado_por, aprovado_em, (SELECT COUNT(*) FROM pedidos WHERE cardapio_id = cardapios.id) AS pedidos FROM cardapios WHERE municipio_id = ? AND tipo = 'proposta' ORDER BY semana DESC, id LIMIT 120", c.municipioId)
    .map((x) => {
      const m = json<any>(x.metricas, {});
      return { ...x, metricas: m.metricas ?? null, nota: m.nota ?? null, lacunas: (m.lacunas ?? []).length };
    });
  res.json({
    base: base && { id: base.id, titulo: base.titulo, criado_por: base.criado_por, criado_em: base.criado_em, itens: itensDoCardapio(base.id) },
    versoes_base: todos("SELECT id, titulo, criado_por, criado_em, status FROM cardapios WHERE municipio_id = ? AND tipo = 'base' ORDER BY id DESC LIMIT 20", c.municipioId),
    propostas: lista, semana_atual: segundaDe(hoje()), proxima_semana: proximaSemana(), pesos: municipio(c.municipioId).params.pesos_ranking,
  });
});
api.get('/cardapios/:id', (req, res) => {
  const c = somenteGestao(res);
  const card = buscarCardapio(c.municipioId, Number(req.params.id));
  const itens = itensDoCardapio(card.id);
  // rascunhos são reavaliados com a oferta atual; aprovados mostram o retrato do momento da aprovação
  const salvo = json<any>(card.metricas, null);
  const semana = card.semana ?? proximaSemana();
  const avaliacao = card.tipo === 'proposta' && card.status !== 'rascunho' && salvo ? salvo : avaliar(itens, carregarContexto(c.municipioId, semana));
  res.json({ ...card, metricas: undefined, semana_avaliada: semana, itens, avaliacao: { ...avaliacao, nota: salvo?.nota ?? null }, pedidos: um<any>('SELECT COUNT(*) AS n FROM pedidos WHERE cardapio_id = ?', card.id).n });
});
api.post('/cardapios/base', (req, res) => {
  const c = exigir(res, 'cardapio.elaborar');
  res.json({ id: salvarBase(c.municipioId, texto(req.body?.titulo), req.body?.itens, c.autor) });
});
api.post('/cardapios/avaliar', (req, res) => {
  const c = somenteGestao(res);
  const semana = /^\d{4}-\d\d-\d\d$/.test(req.body?.semana ?? '') ? req.body.semana : proximaSemana();
  res.json(avaliar(req.body?.itens ?? [], carregarContexto(c.municipioId, semana)));
});
api.post('/cardapios/gerar', (req, res) => {
  const c = exigir(res, 'cardapio.gerar');
  const semana = req.body?.semana;
  if (!/^\d{4}-\d\d-\d\d$/.test(semana ?? '') || segundaDe(semana) !== semana) throw new ErroNegocio('Escolha a segunda-feira da semana do cardápio.');
  res.json({ ids: gerarPropostas(c.municipioId, semana, c.autor) });
});
api.put('/cardapios/:id/itens', (req, res) => {
  const c = exigir(res, 'cardapio.elaborar');
  res.json(ajustarItens(c.municipioId, Number(req.params.id), req.body?.itens, c.autor));
});
api.post('/cardapios/:id/aprovar', (req, res) => {
  const c = exigir(res, 'cardapio.elaborar');
  res.json(aprovar(c.municipioId, Number(req.params.id), c.autor).metricas);
});
api.get('/cardapios/:id/necessidades', (req, res) => {
  const c = somenteGestao(res);
  buscarCardapio(c.municipioId, Number(req.params.id));
  res.json(necessidades(Number(req.params.id)));
});
api.post('/cardapios/:id/pedidos', (req, res) => {
  const c = exigir(res, 'pedidos.gerar');
  res.json(gerarPedidos(c.municipioId, Number(req.params.id), c.autor));
});

// ---------- recomendações [RF-REC-01..03] ----------
api.get('/recomendacoes', (_req, res) => res.json(recomendar(somenteGestao(res).municipioId)));
api.post('/recomendacoes/simular', (req, res) => res.json(simularRecomendacoes(somenteGestao(res).municipioId, req.body?.selecao)));

// ---------- preços e edital [RF-CON-01, 02] ----------
api.get('/precos', (_req, res) => {
  const c = somenteGestao(res);
  const vigentes = new Map(todos<any>('SELECT * FROM precos WHERE municipio_id = ? AND vigente = 1', c.municipioId).map((p) => [p.alimento_id, p]));
  // subsídio: custo de referência do frete por kg, calculado nas rotas já planejadas [RF-LOG-04]. Nunca substitui o valor do gestor.
  const subsidio = new Map(todos<any>(
    `SELECT i.alimento_id, SUM(rp.custo_referencia * i.quantidade_kg / t.kg) AS custo, SUM(rp.kg * i.quantidade_kg / t.kg) AS kg
     FROM rota_pedidos rp JOIN pedidos p ON p.id = rp.pedido_id JOIN pedido_itens i ON i.pedido_id = p.id
     JOIN (SELECT pedido_id, SUM(quantidade_kg) AS kg FROM pedido_itens GROUP BY pedido_id) t ON t.pedido_id = p.id
     WHERE p.municipio_id = ? GROUP BY i.alimento_id`,
    c.municipioId,
  ).map((s) => [s.alimento_id, s.kg ? arred(s.custo / s.kg, 3) : null]));
  res.json({
    itens: listarAlimentos().filter((a) => a.agricola).map((a) => {
      const p = vigentes.get(a.id);
      return { alimento_id: a.id, alimento: a.nome, grupo: a.grupo, preco_kg: p?.preco_kg ?? null, frete_kg: p?.frete_kg ?? null, fundamento: p?.fundamento ?? null, servidor_nome: p?.servidor_nome ?? null, criado_em: p?.criado_em ?? null, frete_referencia_kg: subsidio.get(a.id) ?? null };
    }),
    historico: todos('SELECT p.*, a.nome AS alimento FROM precos p JOIN alimentos a ON a.id = p.alimento_id WHERE p.municipio_id = ? ORDER BY p.id DESC LIMIT 60', c.municipioId),
  });
});
api.post('/precos', (req, res) => {
  const c = exigir(res, 'precos.definir');
  const b = req.body ?? {};
  const al = listarAlimentos().find((a) => a.id === Number(b.alimento_id));
  if (!al) throw new ErroNegocio('Alimento não encontrado.');
  const preco = Number(b.preco_kg), frete = Number(b.frete_kg);
  if (!(preco > 0) || !(frete >= 0)) throw new ErroNegocio('Informe o preço do alimento e o valor do frete por kg.');
  const fundamento = obrigatorio(b.fundamento, 'Fundamento do preço');
  tx(() => {
    exec('UPDATE precos SET vigente = 0 WHERE municipio_id = ? AND alimento_id = ? AND vigente = 1', c.municipioId, al.id);
    const id = inserir('precos', { municipio_id: c.municipioId, alimento_id: al.id, preco_kg: preco, frete_kg: frete, fundamento, servidor_id: c.usuario.id, servidor_nome: c.usuario.nome, criado_em: isoInstante(), vigente: 1 });
    // o servidor que lançou cada preço fica no log administrativo [RF-ADM-04]
    registrar(c.autor, c.municipioId, 'Preço de referência lançado pelo gestor', 'preco', id, { alimento: al.nome, preco_kg: preco, frete_kg: frete, fundamento }, 'admin');
  });
  res.json({ ok: true });
});
api.get('/edital', (_req, res) => res.json(montarEdital(somenteGestao(res).municipioId)));

// ---------- pedidos e evidências [RF-CON-03, RF-AUD-01..05] ----------
api.get('/pedidos', (req, res) => {
  const c = ctx(res);
  const e = escopo(res);
  const proprio = c.perfil === 'agricultor' ? um<any>('SELECT id FROM prestadores WHERE agricultor_id = ?', c.usuario.vinculo_id) : null;
  const lista = listarPedidos(c.municipioId, { ...e, status: texto(req.query.status) || undefined, data: texto(req.query.data) || undefined, desde: texto(req.query.desde) || undefined });
  res.json(PERFIS_CAMPO.includes(c.perfil) ? lista.map((p) => ({ ...p, valor: c.perfil === 'agricultor' ? p.valor : undefined, pendencias: pendencias(p.id), entrego_eu: !!proprio && p.prestador_id === proprio.id })) : lista);
});
function pedidoPermitido(res: Response, id: number) {
  const c = ctx(res);
  const p = detalharPedido(c.municipioId, id);
  const e = escopo(res);
  const meuPrestador = c.perfil === 'agricultor' ? um<any>('SELECT id FROM prestadores WHERE agricultor_id = ?', c.usuario.vinculo_id)?.id : null;
  if ((e.agricultor_id && p.agricultor_id !== e.agricultor_id) || (e.escola_id && p.escola_id !== e.escola_id) || (e.prestador_id && !p.rotas.some((r: any) => r.prestador_id === e.prestador_id)))
    throw new ErroNegocio('Este pedido não é seu.', 403);
  return { c, p, meuPrestador };
}
api.get('/pedidos/:id', (req, res) => {
  const { c, p } = pedidoPermitido(res, Number(req.params.id));
  const trilha = PERFIS_CAMPO.includes(c.perfil) ? [] : todos("SELECT seq, em, usuario_nome, perfil, acao, detalhe, hash FROM trilha WHERE entidade = 'pedido' AND entidade_id = ? ORDER BY seq", p.id);
  res.json({ ...p, pendencias: pendencias(p.id), trilha, liquidacao: c.perfil === 'diretor' || c.perfil === 'prestador' ? null : p.liquidacao });
});
api.post('/pedidos/:id/evidencias', (req, res) => {
  const { c, p, meuPrestador } = pedidoPermitido(res, Number(req.params.id));
  const b = req.body ?? {};
  const papel = b.papel as string;
  const entregaPropria = !!meuPrestador && p.rotas.some((r: any) => r.prestador_id === meuPrestador);
  const permitido =
    (papel === 'agricultor' && c.perfil === 'agricultor') ||
    (papel === 'prestador' && (c.perfil === 'prestador' || (c.perfil === 'agricultor' && entregaPropria))) || // quem faz a própria entrega registra os dois pontos
    (papel === 'escola' && c.perfil === 'diretor');
  if (!permitido) throw new ErroNegocio('Seu perfil não registra esta etapa da entrega.', 403);
  if (b.simulacao && !SANDBOX) throw new ErroNegocio('A simulação de posição só existe no ambiente de simulação.', 403);
  res.json(registrarEvidencia(c.municipioId, p.id, { ponto: b.ponto, papel: b.papel, foto: b.foto, lat: b.lat, lng: b.lng, km: num(b.km), itens: b.itens, checklist: b.checklist, observacao: b.observacao, simulacao: b.simulacao }, c.autor));
});
api.post('/pedidos/:id/resolver', (req, res) => {
  const c = exigir(res, 'divergencia.resolver');
  res.json(resolverDivergencia(c.municipioId, Number(req.params.id), req.body, c.autor));
});
api.get('/evidencias/:id/foto', (req, res) => {
  const ev = um<any>('SELECT e.foto_arquivo, e.foto_tipo, e.pedido_id FROM evidencias e JOIN pedidos p ON p.id = e.pedido_id WHERE e.id = ? AND p.municipio_id = ?', Number(req.params.id), ctx(res).municipioId);
  if (!ev) throw new ErroNegocio('Foto não encontrada.', 404);
  pedidoPermitido(res, ev.pedido_id);
  const arquivo = path.join(DIR_EVIDENCIAS, path.basename(ev.foto_arquivo));
  if (!existsSync(arquivo)) throw new ErroNegocio('Arquivo da foto não está mais disponível.', 404);
  res.setHeader('Content-Type', ev.foto_tipo);
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(arquivo);
});
api.get('/divergencias', (_req, res) => res.json(filaDeDivergencias(somenteGestao(res).municipioId)));

// ---------- roteirização [RF-LOG-01..06] ----------
/** Prestador cujas rotas o perfil de campo pode ver; undefined para a gestão, que vê todas. */
function prestadorDoEscopo(res: Response) {
  const c = ctx(res);
  if (c.perfil === 'diretor') throw new ErroNegocio('Esta área não está disponível para o seu perfil.', 403);
  if (c.perfil === 'agricultor') return um<any>('SELECT id FROM prestadores WHERE agricultor_id = ?', c.usuario.vinculo_id)?.id ?? -1;
  return escopo(res).prestador_id;
}
api.get('/rotas', (req, res) => {
  const c = ctx(res);
  const prestadorId = prestadorDoEscopo(res);
  const data = texto(req.query.data) || undefined;
  res.json({ rotas: listarRotas(c.municipioId, { data, prestador_id: prestadorId, desde: data ? undefined : texto(req.query.desde) || somarDias(hoje(), -3) }), comparativo: data && !prestadorId ? comparativoDaData(c.municipioId, data) : null });
});
// traçado da rota pelas estradas reais, para o mapa e a simulação do percurso
api.get('/rotas/:id/trajeto', async (req, res) => {
  const c = ctx(res);
  const prestadorId = prestadorDoEscopo(res);
  const r = um<any>(
    `SELECT r.*, pr.modal, pr.base_lat, pr.base_lng FROM rotas r JOIN prestadores pr ON pr.id = r.prestador_id WHERE r.id = ? AND r.municipio_id = ?`,
    num(req.params.id), c.municipioId,
  );
  if (!r || (prestadorId && r.prestador_id !== prestadorId)) throw new ErroNegocio('Rota não encontrada.', 404);
  const paradas = json<any[]>(r.paradas, []);
  // a primeira viagem sai da base do prestador; as seguintes, da última entrega da viagem anterior
  const anterior = r.viagem > 1 ? um<any>('SELECT paradas FROM rotas WHERE prestador_id = ? AND data = ? AND viagem = ?', r.prestador_id, r.data, r.viagem - 1) : null;
  const ultima = anterior && json<any[]>(anterior.paradas, []).at(-1);
  const saida = ultima ? { lat: ultima.lat, lng: ultima.lng, rotulo: `Saída: ${ultima.nome}` } : r.base_lat != null ? { lat: r.base_lat, lng: r.base_lng, rotulo: 'Saída: base do prestador' } : null;
  const trajeto = await tracarTrajeto([...(saida ? [saida] : []), ...paradas], r.modal);
  res.json({ ...trajeto, saida });
});
api.get('/rotas/datas', (_req, res) => {
  const c = somenteGestao(res);
  res.json(todos(
    `SELECT data_entrega AS data, COUNT(*) AS pedidos, SUM(status = 'gerado') AS sem_rota, ROUND(SUM((SELECT SUM(quantidade_kg) FROM pedido_itens WHERE pedido_id = pedidos.id)), 0) AS kg
     FROM pedidos WHERE municipio_id = ? GROUP BY data_entrega ORDER BY data_entrega DESC LIMIT 12`,
    c.municipioId,
  ));
});
api.post('/rotas/planejar', (req, res) => {
  const c = exigir(res, 'rotas.planejar');
  if (!/^\d{4}-\d\d-\d\d$/.test(req.body?.data ?? '')) throw new ErroNegocio('Escolha a data de entrega.');
  res.json(planejarRotas(c.municipioId, req.body.data, c.autor));
});
api.post('/rotas/cenarios', (req, res) => {
  const c = exigir(res, 'rotas.planejar');
  const r = bateriaCenarios(c.municipioId, Math.min(60, Math.max(5, Number(req.body?.quantidade) || 20)), Number(req.body?.semente) || 2026);
  registrar(c.autor, c.municipioId, 'Bateria de cenários de roteirização simulada', 'rota', null, { cenarios: r.quantidade, viaveis: r.viaveis });
  res.json(r);
});

// ---------- pagamentos [RF-PAG-01..05] ----------
api.get('/liquidacoes', (_req, res) => {
  const c = ctx(res);
  if (c.perfil === 'diretor') throw new ErroNegocio('Esta área não está disponível para o seu perfil.', 403);
  const e = escopo(res);
  const lista = listarLiquidacoes(c.municipioId, e);
  // cada perfil de campo vê só a sua parte do pagamento
  res.json(c.perfil === 'prestador' ? lista.map((l) => ({ id: l.id, pedido_id: l.pedido_id, data_entrega: l.data_entrega, escola: l.escola, agricultor: l.agricultor, valor_frete: l.valor_frete, iss: l.iss, liquido_prestador: l.liquido_prestador, status: l.status, pago_em: l.pago_em })) : lista);
});
api.post('/liquidacoes/lote', (_req, res) => {
  const c = exigir(res, 'pagamentos.executar');
  res.json(pagarLote(c.municipioId, c.autor));
});
api.post('/liquidacoes/:id/pagar', (req, res) => {
  const c = exigir(res, 'pagamentos.executar');
  res.json(pagar(c.municipioId, Number(req.params.id), c.autor));
});

// ---------- painel, trilha e administração ----------
api.get('/painel', (_req, res) => res.json(painel(somenteGestao(res).municipioId)));
api.get('/consorcio', (_req, res) => {
  const c = ctx(res);
  if (c.perfil !== 'operador') throw new ErroNegocio('A visão consolidada é do operador.', 403);
  const mun = municipio(c.municipioId);
  res.json(mun.consorcio_id ? { nome: um<any>('SELECT nome FROM consorcios WHERE id = ?', mun.consorcio_id).nome, municipios: consolidado(mun.consorcio_id) } : { nome: null, municipios: [] });
});
api.get('/trilha', (req, res) => {
  const c = somenteGestao(res);
  const cond = ['(municipio_id = ? OR municipio_id IS NULL)'];
  const par: unknown[] = [c.municipioId];
  if (req.query.categoria) (cond.push('categoria = ?'), par.push(texto(req.query.categoria)));
  if (req.query.busca) (cond.push('(acao LIKE ? OR usuario_nome LIKE ?)'), par.push(`%${texto(req.query.busca)}%`, `%${texto(req.query.busca)}%`));
  res.json({ registros: todos(`SELECT seq, em, usuario_nome, perfil, categoria, acao, entidade, entidade_id, detalhe, hash FROM trilha WHERE ${cond.join(' AND ')} ORDER BY seq DESC LIMIT 200`, ...par), total: um<any>(`SELECT COUNT(*) AS n FROM trilha WHERE ${cond.join(' AND ')}`, ...par).n });
});
api.get('/trilha/verificar', (_req, res) => {
  somenteGestao(res);
  res.json(verificarTrilha());
});
api.get('/parametros', (_req, res) => {
  const c = somenteGestao(res);
  const mun = municipio(c.municipioId);
  res.json({ params: mun.params, padrao: PARAMS_PADRAO, modo_piloto: !!mun.modo_piloto, usuarios: pode(c.perfil, 'parametros.editar') ? todos('SELECT id, nome, email, perfil FROM usuarios WHERE municipio_id = ? ORDER BY perfil, nome', c.municipioId) : [] });
});
api.put('/parametros', (req, res) => {
  const c = exigir(res, 'parametros.editar');
  const b = (req.body ?? {}) as Partial<Params>;
  const atual = municipio(c.municipioId).params;
  const entre = (v: unknown, min: number, max: number, padrao: number) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : padrao);
  const novo: Params = {
    ...atual,
    aliquota_iss: entre(b.aliquota_iss, 0, 0.1, atual.aliquota_iss),
    indices_via: Object.fromEntries(Object.keys(TIPOS_VIA).map((k) => [k, entre((b.indices_via as any)?.[k], 0.1, 5, (atual.indices_via as any)[k])])) as Params['indices_via'],
    frete_km: Object.fromEntries(Object.keys(MODAIS).map((k) => [k, entre((b.frete_km as any)?.[k], 0, 50, (atual.frete_km as any)[k])])) as Params['frete_km'],
    custo_km_convencional: entre(b.custo_km_convencional, 0, 100, atual.custo_km_convencional),
    fator_tortuosidade: entre(b.fator_tortuosidade, 1, 3, atual.fator_tortuosidade),
    raio_evidencia_m: entre(b.raio_evidencia_m, 20, 5000, atual.raio_evidencia_m),
    tolerancia_volume: entre(b.tolerancia_volume, 0, 0.5, atual.tolerancia_volume),
    tolerancia_horario_min: entre(b.tolerancia_horario_min, 0, 240, atual.tolerancia_horario_min),
    dias_entrega: Array.isArray(b.dias_entrega) && b.dias_entrega.length ? [...new Set(b.dias_entrega.map(Number).filter((d) => d >= 1 && d <= 5))].sort() : atual.dias_entrega,
    repasse_modo: b.repasse_modo === 'agrupado' ? 'agrupado' : b.repasse_modo === 'por_entrega' ? 'por_entrega' : atual.repasse_modo,
  };
  if (!novo.dias_entrega.includes(1)) novo.dias_entrega = [1, ...novo.dias_entrega];
  const alterados = Object.fromEntries(Object.entries(novo).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((atual as any)[k])));
  exec('UPDATE municipios SET params = ? WHERE id = ?', novo, c.municipioId);
  registrar(c.autor, c.municipioId, 'Parâmetros do município alterados', 'municipio', c.municipioId, alterados, 'admin');
  res.json({ params: novo });
});

// ---------- sandbox [RF-ADM-05] ----------
api.post('/sandbox/reiniciar', (_req, res) => {
  exigir(res, 'sandbox.operar');
  if (!SANDBOX) throw new ErroNegocio('Disponível só no ambiente de simulação.', 403);
  res.json(popular());
});
api.post('/sandbox/avancar/:id', (req, res) => {
  const c = exigir(res, 'sandbox.operar');
  if (!SANDBOX) throw new ErroNegocio('Disponível só no ambiente de simulação.', 403);
  res.json(avancarPedido(c.municipioId, Number(req.params.id), { ...c.autor, nome: `${c.autor.nome} (simulação de campo)` }, req.body?.variante ?? 'normal'));
});

api.use((_req, res) => res.status(404).json({ erro: 'Recurso não encontrado.' }));
// eslint-disable-next-line @typescript-eslint/no-unused-vars
api.use((erro: any, _req: Request, res: Response, _next: NextFunction) => {
  if (erro instanceof ErroNegocio) return res.status(erro.status).json({ erro: erro.message });
  if (erro?.type === 'entity.too.large') return res.status(413).json({ erro: 'O envio é grande demais. Reduza o tamanho da foto.' });
  console.error(erro);
  res.status(500).json({ erro: 'Algo deu errado no servidor. Tente de novo; se continuar, avise o suporte.' });
});

export type { Perfil };
