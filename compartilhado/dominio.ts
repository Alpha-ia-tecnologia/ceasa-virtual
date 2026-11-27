// Vocabulário de domínio compartilhado entre servidor e interface.
// Referências entre colchetes apontam para a Especificação de Requisitos Funcionais v1.1.

export const PERFIS = {
  operador: 'Operador CEASA VIRTUAL',
  prefeito: 'Prefeito (gestor municipal)',
  sec_educacao: 'Secretaria de Educação',
  sec_agricultura: 'Secretaria de Agricultura',
  nutricionista: 'Nutricionista RT',
  controle: 'Entidade executora / controle interno',
  agricultor: 'Agricultor familiar',
  prestador: 'Prestador de frete local',
  diretor: 'Direção da escola',
} as const;
export type Perfil = keyof typeof PERFIS;

export const PERFIS_CAMPO: Perfil[] = ['agricultor', 'prestador', 'diretor'];

/** Quem pode executar cada ação. A leitura do município é liberada a todos os perfis de gestão. */
export const PERMISSOES = {
  'cadastros.editar': ['operador', 'controle', 'sec_agricultura', 'sec_educacao'],
  'nutricao.editar': ['operador', 'nutricionista'],
  'ofertas.registrar': ['operador', 'sec_agricultura', 'agricultor'],
  'escuta.registrar': ['operador', 'sec_agricultura', 'agricultor'],
  'cardapio.elaborar': ['nutricionista'],
  'cardapio.gerar': ['nutricionista', 'operador'],
  'precos.definir': ['prefeito', 'sec_educacao'],
  'pedidos.gerar': ['controle', 'sec_educacao', 'operador'],
  'rotas.planejar': ['controle', 'operador'],
  'divergencia.resolver': ['controle'],
  'pagamentos.executar': ['controle', 'prefeito'],
  'parametros.editar': ['operador', 'controle'],
  'sandbox.operar': ['operador'],
  'dados.sensiveis': ['operador', 'controle', 'sec_agricultura'],
} as const satisfies Record<string, readonly Perfil[]>;
export type Acao = keyof typeof PERMISSOES;

export function pode(perfil: Perfil | undefined, acao: Acao): boolean {
  return !!perfil && (PERMISSOES[acao] as readonly Perfil[]).includes(perfil);
}

/** Modais do frete local [RF-CAD-05, RF-LOG-02]. Velocidade e alcance são parâmetros de simulação. */
export const MODAIS = {
  a_pe: { rotulo: 'A pé', kmh: 4.5, alcance_km: 4, capacidade_kg: 12 },
  bicicleta: { rotulo: 'Bicicleta cargueira', kmh: 12, alcance_km: 12, capacidade_kg: 60 },
  carroca: { rotulo: 'Carroça ou tração animal', kmh: 7, alcance_km: 14, capacidade_kg: 300 },
  cavalo: { rotulo: 'Cavalo', kmh: 8, alcance_km: 16, capacidade_kg: 80 },
  moto: { rotulo: 'Moto', kmh: 35, alcance_km: 60, capacidade_kg: 40 },
  carro_leve: { rotulo: 'Carro leve', kmh: 40, alcance_km: 120, capacidade_kg: 450 },
} as const;
export type Modal = keyof typeof MODAIS;

/** Tipos de via e índices informados pelo cliente [C18, RF-LOG-04]; parametrizáveis por município. */
export const TIPOS_VIA = {
  chao: { rotulo: 'Estrada de chão', indice: 0.88 },
  mista_chao: { rotulo: 'Mista, com mais chão', indice: 0.83 },
  mista_asfalto: { rotulo: 'Mista, com mais asfalto', indice: 0.8 },
  asfalto: { rotulo: 'Asfaltada', indice: 0.76 },
} as const;
export type TipoVia = keyof typeof TIPOS_VIA;

export const GRUPOS = {
  cereal: 'Cereais e massas',
  tuberculo: 'Raízes e tubérculos',
  leguminosa: 'Leguminosas',
  proteina: 'Carnes, ovos e pescado',
  hortalica: 'Hortaliças',
  fruta: 'Frutas',
  laticinio: 'Leite e derivados',
  complemento: 'Temperos, farinhas, óleos e açúcares',
} as const;
export type Grupo = keyof typeof GRUPOS;

/** Papel do item na refeição; define quais grupos podem substituí-lo. */
export const PAPEIS = {
  base: { rotulo: 'Base energética', grupos: ['cereal', 'tuberculo'] },
  leguminosa: { rotulo: 'Leguminosa', grupos: ['leguminosa'] },
  proteina: { rotulo: 'Proteína', grupos: ['proteina'] },
  hortalica: { rotulo: 'Hortaliça', grupos: ['hortalica'] },
  fruta: { rotulo: 'Fruta', grupos: ['fruta'] },
  complemento: { rotulo: 'Complemento', grupos: ['complemento', 'laticinio'] },
} as const satisfies Record<string, { rotulo: string; grupos: readonly Grupo[] }>;
export type Papel = keyof typeof PAPEIS;

export const MODOS_CARDAPIO = {
  demand: { rotulo: 'Demanda planejada', descricao: 'Segue o cardápio-base da nutricionista e compra da agricultura familiar o que houver.' },
  supply: { rotulo: 'Oferta do dia', descricao: 'Monta as refeições a partir do que os agricultores registraram.' },
  combinado: { rotulo: 'Combinado', descricao: 'Mantém o cardápio-base e troca por equivalentes locais só o que falta.' },
} as const;
export type ModoCardapio = keyof typeof MODOS_CARDAPIO;

export const STATUS_PEDIDO = {
  gerado: 'Aguardando rota',
  roteirizado: 'Aguardando coleta',
  coletado: 'A caminho da escola',
  validado: 'Entrega validada',
  divergencia: 'Divergência em análise',
  pago: 'Pago',
  recusado: 'Recusado',
} as const;
export type StatusPedido = keyof typeof STATUS_PEDIDO;

/** Etapas do percurso de uma entrega, na ordem em que acontecem [Figura 1]. */
export const PERCURSO: { status: StatusPedido; rotulo: string }[] = [
  { status: 'gerado', rotulo: 'Pedido' },
  { status: 'roteirizado', rotulo: 'Rota' },
  { status: 'coletado', rotulo: 'Coleta' },
  { status: 'validado', rotulo: 'Entrega validada' },
  { status: 'pago', rotulo: 'Pagamento' },
];

export const STATUS_LIQUIDACAO = {
  pendente: 'Pronta para pagar',
  bloqueada: 'Bloqueada',
  paga: 'Paga',
  falhou: 'Falhou — reprocessar',
} as const;

/** Checklist ambiental e sanitário da entrega [RF-AUD-04]. Pesos somam 100. */
export const CHECKLIST_ESG = [
  { id: 'acondicionamento', rotulo: 'Alimentos em caixas ou sacos limpos e adequados', peso: 25 },
  { id: 'integridade', rotulo: 'Sem sinais de deterioração, pragas ou sujeira', peso: 25 },
  { id: 'protecao', rotulo: 'Carga protegida de sol e chuva no transporte', peso: 15 },
  { id: 'temperatura', rotulo: 'Itens refrigerados chegaram em caixa térmica', peso: 15 },
  { id: 'origem', rotulo: 'Origem identificada (agricultor e área de plantio)', peso: 10 },
  { id: 'residuos', rotulo: 'Embalagens reutilizáveis ou retornáveis', peso: 10 },
] as const;
export const NOTA_SELO = 80;

export const TIPOS_AGRICULTOR = {
  individual: 'Individual',
  grupo_formal: 'Grupo formal (associação ou cooperativa)',
  grupo_informal: 'Grupo informal',
} as const;

export const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'] as const;

export const AGUA = { sim: 'Tem água o ano todo', sazonal: 'Só no período de chuva', nao: 'Não tem água para irrigar' } as const;

export const PISO_AF = 0.45; // Lei 15.226/2025, conforme a especificação

export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const kg = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 })} kg`;
export const pct = (v: number, casas = 0) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
