import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export const DIR_DADOS = process.env.CEASA_DADOS ?? path.resolve('dados');
export const DIR_EVIDENCIAS = path.join(DIR_DADOS, 'evidencias');
const emMemoria = process.env.CEASA_DB === ':memory:';
if (!emMemoria) mkdirSync(DIR_EVIDENCIAS, { recursive: true });

export const db = new DatabaseSync(emMemoria ? ':memory:' : path.join(DIR_DADOS, 'ceasa.sqlite'));
db.exec('PRAGMA foreign_keys = ON;');

const TABELAS = [
  'consorcios', 'municipios', 'usuarios', 'sessoes', 'escolas', 'agricultores', 'areas', 'prestadores',
  'taco_versoes', 'alimentos', 'referencias', 'ofertas', 'precos', 'cardapios', 'cardapio_itens',
  'necessidades', 'pedidos', 'pedido_itens', 'rotas', 'rota_pedidos', 'evidencias', 'validacoes',
  'liquidacoes', 'aquisicoes_previas', 'trilha',
];

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS consorcios (id INTEGER PRIMARY KEY, nome TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS municipios (
  id INTEGER PRIMARY KEY, nome TEXT NOT NULL, uf TEXT, cnpj TEXT, entidade_executora TEXT,
  repasse_fnde_anual REAL NOT NULL DEFAULT 0, exercicio INTEGER NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL, raio_km REAL NOT NULL DEFAULT 12,
  modo_piloto INTEGER NOT NULL DEFAULT 0, consorcio_id INTEGER REFERENCES consorcios(id),
  params TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY, municipio_id INTEGER REFERENCES municipios(id), nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE, senha_hash TEXT NOT NULL, perfil TEXT NOT NULL,
  vinculo_id INTEGER, ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  municipio_id INTEGER, expira_em TEXT NOT NULL
);

-- [RF-CAD-02]
CREATE TABLE IF NOT EXISTS escolas (
  id INTEGER PRIMARY KEY, municipio_id INTEGER NOT NULL REFERENCES municipios(id), nome TEXT NOT NULL,
  endereco TEXT, lat REAL NOT NULL, lng REAL NOT NULL, diretor TEXT,
  janelas TEXT NOT NULL DEFAULT '[]', cap_refrigerado_kg REAL DEFAULT 0, cap_seco_kg REAL DEFAULT 0,
  alunos TEXT NOT NULL DEFAULT '{}'
);
-- [RF-CAD-03]
CREATE TABLE IF NOT EXISTS agricultores (
  id INTEGER PRIMARY KEY, municipio_id INTEGER NOT NULL REFERENCES municipios(id), nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'individual', documento TEXT, caf TEXT,
  res_lat REAL, res_lng REAL, banco TEXT, agencia TEXT, conta TEXT, titular_documento TEXT,
  produtos TEXT NOT NULL DEFAULT '[]', escuta TEXT, criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS areas (
  id INTEGER PRIMARY KEY, agricultor_id INTEGER NOT NULL REFERENCES agricultores(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, hectares REAL DEFAULT 0,
  tipo_via TEXT NOT NULL DEFAULT 'chao'
);
-- [RF-CAD-05]
CREATE TABLE IF NOT EXISTS prestadores (
  id INTEGER PRIMARY KEY, municipio_id INTEGER NOT NULL REFERENCES municipios(id), nome TEXT NOT NULL,
  documento TEXT, modal TEXT NOT NULL, capacidade_kg REAL NOT NULL, caixa_termica INTEGER NOT NULL DEFAULT 0,
  area_atuacao TEXT, inscricao_municipal TEXT, banco TEXT, agencia TEXT, conta TEXT,
  agricultor_id INTEGER REFERENCES agricultores(id), base_lat REAL NOT NULL, base_lng REAL NOT NULL
);

-- [RF-NUT-01..06]
CREATE TABLE IF NOT EXISTS taco_versoes (
  id INTEGER PRIMARY KEY, rotulo TEXT NOT NULL, fonte TEXT, importado_em TEXT NOT NULL,
  importado_por TEXT, total INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS alimentos (
  id INTEGER PRIMARY KEY, codigo TEXT UNIQUE, nome TEXT NOT NULL, grupo TEXT NOT NULL,
  kcal REAL, ptn REAL, cho REAL, lip REAL, fibra REAL, calcio REAL, ferro REAL, vit_c REAL,
  referenciado_fnde INTEGER NOT NULL DEFAULT 1, agricola INTEGER NOT NULL DEFAULT 0, produto_agricola TEXT,
  validade_dias INTEGER, armazenamento TEXT, percapita_padrao_g REAL, preco_medio REAL,
  produtividade_kg_ha REAL, ciclo_dias INTEGER, precisa_agua INTEGER DEFAULT 0,
  safra TEXT NOT NULL DEFAULT '[]', versao_id INTEGER REFERENCES taco_versoes(id)
);
CREATE TABLE IF NOT EXISTS referencias (
  id TEXT PRIMARY KEY, rotulo TEXT NOT NULL, modalidade TEXT, periodo TEXT, ordem INTEGER,
  kcal REAL NOT NULL, calcio REAL, ferro REAL, vit_c REAL, fator REAL NOT NULL
);

-- [RF-OFE-01, 03, 04]
CREATE TABLE IF NOT EXISTS ofertas (
  id INTEGER PRIMARY KEY, municipio_id INTEGER NOT NULL REFERENCES municipios(id),
  agricultor_id INTEGER NOT NULL REFERENCES agricultores(id), area_id INTEGER NOT NULL REFERENCES areas(id),
  alimento_id INTEGER NOT NULL REFERENCES alimentos(id), quantidade_kg REAL NOT NULL,
  comprometido_kg REAL NOT NULL DEFAULT 0, data_colheita TEXT NOT NULL, data_limite TEXT NOT NULL,
  preco_kg REAL, coleta_inicio TEXT NOT NULL DEFAULT '06:00', coleta_fim TEXT NOT NULL DEFAULT '09:00',
  status TEXT NOT NULL DEFAULT 'ativa', criado_em TEXT NOT NULL
);

-- [RF-CON-02] preço definido pelo gestor, com o servidor que lançou
CREATE TABLE IF NOT EXISTS precos (
  id INTEGER PRIMARY KEY, municipio_id INTEGER NOT NULL REFERENCES municipios(id),
  alimento_id INTEGER NOT NULL REFERENCES alimentos(id), preco_kg REAL NOT NULL, frete_kg REAL NOT NULL,
  fundamento TEXT, servidor_id INTEGER, servidor_nome TEXT NOT NULL, criado_em TEXT NOT NULL,
  vigente INTEGER NOT NULL DEFAULT 1
);

-- [RF-CAR-01..09]
CREATE TABLE IF NOT EXISTS cardapios (
  id INTEGER PRIMARY KEY, municipio_id INTEGER NOT NULL REFERENCES municipios(id), semana TEXT,
  titulo TEXT NOT NULL, tipo TEXT NOT NULL, modo TEXT, status TEXT NOT NULL DEFAULT 'rascunho',
  geracao TEXT, metricas TEXT, justificativa TEXT, criado_por TEXT, criado_em TEXT NOT NULL,
  aprovado_por TEXT, aprovado_em TEXT
);
CREATE TABLE IF NOT EXISTS cardapio_itens (
  id INTEGER PRIMARY KEY, cardapio_id INTEGER NOT NULL REFERENCES cardapios(id) ON DELETE CASCADE,
  dia INTEGER NOT NULL, preparacao TEXT NOT NULL, papel TEXT NOT NULL,
  alimento_id INTEGER NOT NULL REFERENCES alimentos(id), percapita_g REAL NOT NULL,
  substituiu_alimento_id INTEGER
);
CREATE TABLE IF NOT EXISTS necessidades (
  id INTEGER PRIMARY KEY, cardapio_id INTEGER NOT NULL REFERENCES cardapios(id) ON DELETE CASCADE,
  escola_id INTEGER NOT NULL, alimento_id INTEGER NOT NULL, dia INTEGER NOT NULL, quantidade_kg REAL NOT NULL
);

-- [RF-CON-03] um pedido = o que um agricultor entrega a uma escola numa data
CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY, municipio_id INTEGER NOT NULL REFERENCES municipios(id),
  cardapio_id INTEGER REFERENCES cardapios(id), agricultor_id INTEGER NOT NULL REFERENCES agricultores(id),
  area_id INTEGER NOT NULL REFERENCES areas(id), escola_id INTEGER NOT NULL REFERENCES escolas(id),
  data_entrega TEXT NOT NULL, coleta_inicio TEXT NOT NULL, coleta_fim TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'gerado', criado_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS pedido_itens (
  id INTEGER PRIMARY KEY, pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  oferta_id INTEGER REFERENCES ofertas(id), alimento_id INTEGER NOT NULL REFERENCES alimentos(id),
  quantidade_kg REAL NOT NULL, preco_kg REAL NOT NULL, frete_kg REAL NOT NULL, aceito_kg REAL
);

-- [RF-LOG-01..06]
CREATE TABLE IF NOT EXISTS rotas (
  id INTEGER PRIMARY KEY, municipio_id INTEGER NOT NULL REFERENCES municipios(id), data TEXT NOT NULL,
  prestador_id INTEGER NOT NULL REFERENCES prestadores(id), viagem INTEGER NOT NULL DEFAULT 1,
  inicio TEXT, fim TEXT, km_ida REAL, km_ida_volta REAL, carga_kg REAL, custo_referencia REAL,
  paradas TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'planejada'
);
CREATE TABLE IF NOT EXISTS rota_pedidos (
  rota_id INTEGER NOT NULL REFERENCES rotas(id) ON DELETE CASCADE, pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
  kg REAL NOT NULL, custo_referencia REAL NOT NULL DEFAULT 0, PRIMARY KEY (rota_id, pedido_id)
);

-- [RF-AUD-01..05]
CREATE TABLE IF NOT EXISTS evidencias (
  id INTEGER PRIMARY KEY, pedido_id INTEGER NOT NULL REFERENCES pedidos(id), ponto TEXT NOT NULL,
  papel TEXT NOT NULL, autor_id INTEGER, autor_nome TEXT, foto_arquivo TEXT NOT NULL, foto_tipo TEXT NOT NULL,
  foto_hash TEXT NOT NULL, lat REAL, lng REAL, registrado_em TEXT NOT NULL, km REAL,
  itens TEXT NOT NULL DEFAULT '[]', checklist TEXT, observacao TEXT, simulada INTEGER NOT NULL DEFAULT 0,
  substituida INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS validacoes (
  id INTEGER PRIMARY KEY, pedido_id INTEGER NOT NULL REFERENCES pedidos(id), resultado TEXT NOT NULL,
  visao TEXT NOT NULL, integridade TEXT NOT NULL, esg TEXT NOT NULL, pontuacao REAL NOT NULL,
  selo INTEGER NOT NULL DEFAULT 0, no_prazo INTEGER NOT NULL DEFAULT 1, motivo TEXT,
  resolucao TEXT, resolvido_por TEXT, resolvido_em TEXT, criado_em TEXT NOT NULL
);

-- [RF-PAG-01..05]
CREATE TABLE IF NOT EXISTS liquidacoes (
  id INTEGER PRIMARY KEY, municipio_id INTEGER NOT NULL REFERENCES municipios(id),
  pedido_id INTEGER NOT NULL UNIQUE REFERENCES pedidos(id), prestador_id INTEGER,
  valor_alimento REAL NOT NULL, valor_frete REAL NOT NULL, iss REAL NOT NULL, liquido_prestador REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente', motivo TEXT, lote TEXT, comprovantes TEXT,
  criado_em TEXT NOT NULL, pago_em TEXT
);

-- compras da agricultura familiar feitas antes da adoção da plataforma, declaradas pelo município
CREATE TABLE IF NOT EXISTS aquisicoes_previas (
  municipio_id INTEGER NOT NULL REFERENCES municipios(id), mes TEXT NOT NULL, valor REAL NOT NULL,
  PRIMARY KEY (municipio_id, mes)
);

-- [RF-AUD-06, RF-ADM-04] trilha encadeada por hash; atualizações e exclusões são rejeitadas
CREATE TABLE IF NOT EXISTS trilha (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, municipio_id INTEGER, em TEXT NOT NULL, usuario_id INTEGER,
  usuario_nome TEXT NOT NULL, perfil TEXT NOT NULL, categoria TEXT NOT NULL, acao TEXT NOT NULL,
  entidade TEXT, entidade_id INTEGER, detalhe TEXT NOT NULL DEFAULT '{}',
  hash_anterior TEXT NOT NULL, hash TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS trilha_sem_alteracao BEFORE UPDATE ON trilha
  BEGIN SELECT RAISE(ABORT, 'A trilha de auditoria é imutável'); END;
CREATE TRIGGER IF NOT EXISTS trilha_sem_exclusao BEFORE DELETE ON trilha
  BEGIN SELECT RAISE(ABORT, 'A trilha de auditoria é imutável'); END;

-- traçados pela malha viária real; é só cache, por isso sobrevive ao reinício do sandbox
CREATE TABLE IF NOT EXISTS trajetos_cache (chave TEXT PRIMARY KEY, dados TEXT NOT NULL, criado_em TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS ix_ofertas_mun ON ofertas(municipio_id, status, alimento_id);
CREATE INDEX IF NOT EXISTS ix_pedidos_mun ON pedidos(municipio_id, data_entrega, status);
CREATE INDEX IF NOT EXISTS ix_itens_pedido ON pedido_itens(pedido_id);
CREATE INDEX IF NOT EXISTS ix_evid_pedido ON evidencias(pedido_id);
CREATE INDEX IF NOT EXISTS ix_evid_hash ON evidencias(foto_hash);
CREATE INDEX IF NOT EXISTS ix_trilha_mun ON trilha(municipio_id, seq);
`;

export function criarEsquema() {
  db.exec(ESQUEMA);
}

/** Apaga tudo e recria o esquema. Usado só pelo sandbox [RF-ADM-05]. */
export function recriarEsquema() {
  db.exec('PRAGMA foreign_keys = OFF;');
  for (const t of [...TABELAS].reverse()) db.exec(`DROP TABLE IF EXISTS ${t};`);
  db.exec('PRAGMA foreign_keys = ON;');
  criarEsquema();
}

criarEsquema();

type Valor = string | number | bigint | null | Uint8Array;
const norm = (v: unknown): Valor =>
  v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v !== null && typeof v === 'object' && !(v instanceof Uint8Array) ? JSON.stringify(v) : (v as Valor);

export function todos<T = any>(sql: string, ...p: unknown[]): T[] {
  return db.prepare(sql).all(...p.map(norm)) as T[];
}
export function um<T = any>(sql: string, ...p: unknown[]): T | undefined {
  return db.prepare(sql).get(...p.map(norm)) as T | undefined;
}
export function exec(sql: string, ...p: unknown[]) {
  return db.prepare(sql).run(...p.map(norm));
}
export function inserir(tabela: string, obj: Record<string, unknown>): number {
  const cols = Object.keys(obj);
  const r = db.prepare(`INSERT INTO ${tabela} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => norm(obj[c])));
  return Number(r.lastInsertRowid);
}
export function atualizar(tabela: string, id: number, obj: Record<string, unknown>) {
  const cols = Object.keys(obj);
  if (!cols.length) return;
  db.prepare(`UPDATE ${tabela} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => norm(obj[c])), id);
}

let nivelTx = 0;
/** Executa em transação; chamadas aninhadas participam da transação externa. */
export function tx<T>(fn: () => T): T {
  if (nivelTx > 0) return fn();
  db.exec('BEGIN');
  nivelTx++;
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    nivelTx--;
  }
}

export function json<T>(texto: string | null | undefined, padrao: T): T {
  if (!texto) return padrao;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return padrao;
  }
}

/** Erro de regra de negócio, devolvido ao cliente com a mensagem em linguagem simples. */
export class ErroNegocio extends Error {
  status: number;
  constructor(mensagem: string, status = 400) {
    super(mensagem);
    this.status = status;
  }
}
