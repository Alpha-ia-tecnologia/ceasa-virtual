import type { Grupo, Modal, Perfil } from '../../compartilhado/dominio.ts';

// DADOS SINTÉTICOS DO SANDBOX [RF-ADM-05].
// Composição nutricional: valores aproximados por 100 g, no estado em que o alimento é comprado (cru),
// inspirados na Tabela TACO. NÃO substituem a tabela oficial — a importação da TACO [RF-NUT-01] sobrescreve estes números.
// Preços, produtividade, ciclo e safra são ilustrativos.

const CHUVAS = [1, 1, 1, 0.9, 0.8, 0.6, 0.4, 0.3, 0.3, 0.4, 0.6, 0.8];
const SECA = [0.3, 0.3, 0.4, 0.5, 0.7, 0.9, 1, 1, 1, 0.9, 0.7, 0.5];
const IRRIGADO = [0.7, 0.7, 0.7, 0.8, 0.9, 1, 1, 1, 1, 0.9, 0.8, 0.7];
const ANO_TODO = [0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 0.8];

type Linha = [
  codigo: string, nome: string, grupo: Grupo, kcal: number | null, ptn: number | null, cho: number | null, lip: number | null,
  fibra: number | null, calcio: number | null, ferro: number | null, vit_c: number | null,
  agricola: 0 | 1, validade_dias: number | null, armazenamento: 'seco' | 'ambiente' | 'refrigerado',
  percapita_g: number, preco_medio: number, produtividade_kg_ha: number | null, ciclo_dias: number | null, precisa_agua: 0 | 1, safra: number[],
];

export const ALIMENTOS: Linha[] = [
  ['C001', 'Arroz tipo 1', 'cereal', 358, 7.2, 78.8, 0.3, 1.6, 4, 0.7, 0, 0, 180, 'seco', 35, 5.2, null, null, 0, ANO_TODO],
  ['C002', 'Macarrão de trigo', 'cereal', 371, 10, 77.9, 1.3, 2.9, 17, 0.9, 0, 0, 180, 'seco', 35, 6.0, null, null, 0, ANO_TODO],
  ['C003', 'Flocos de milho para cuscuz', 'cereal', 351, 7.2, 79.1, 1.5, 5.5, 1, 2.3, 0, 0, 180, 'seco', 40, 5.5, null, null, 0, ANO_TODO],
  ['C004', 'Milho verde', 'cereal', 138, 6.6, 28.6, 0.6, 3.9, 2, 0.4, 0, 1, 4, 'ambiente', 70, 4.0, 6000, 90, 1, CHUVAS],
  ['T001', 'Macaxeira', 'tuberculo', 151, 1.1, 36.2, 0.3, 1.9, 15, 0.3, 16.5, 1, 4, 'ambiente', 80, 4.0, 12000, 270, 0, ANO_TODO],
  ['T002', 'Batata-doce', 'tuberculo', 118, 1.3, 28.2, 0.1, 2.6, 21, 0.4, 16.5, 1, 14, 'ambiente', 80, 4.5, 10000, 120, 0, SECA],
  ['T003', 'Inhame', 'tuberculo', 97, 2.1, 23.2, 0.2, 1.7, 12, 0.4, 5.6, 1, 20, 'ambiente', 80, 6.0, 9000, 210, 0, SECA],
  ['T004', 'Farinha de mandioca', 'complemento', 365, 1.2, 89.2, 0.3, 6.5, 76, 1.2, 0, 1, 120, 'seco', 20, 8.0, 3000, 365, 0, ANO_TODO],
  ['L001', 'Feijão carioca', 'leguminosa', 329, 20, 61.2, 1.3, 18.4, 123, 8, 0, 1, 180, 'seco', 20, 8.5, 900, 90, 0, CHUVAS],
  ['L002', 'Feijão-fradinho', 'leguminosa', 339, 20.2, 61.2, 2.4, 23.6, 78, 5.1, 0, 1, 180, 'seco', 20, 9.0, 800, 75, 0, CHUVAS],
  ['P001', 'Frango (peito)', 'proteina', 119, 21.5, 0, 3, 0, 7, 0.4, 0, 0, 3, 'refrigerado', 35, 16, null, null, 0, ANO_TODO],
  ['P002', 'Frango caipira', 'proteina', 226, 16.4, 0, 17.3, 0, 6, 0.6, 0, 1, 2, 'refrigerado', 40, 19, null, null, 0, ANO_TODO],
  ['P003', 'Ovo de galinha', 'proteina', 143, 13, 1.6, 8.9, 0, 42, 1.6, 0, 1, 21, 'ambiente', 45, 14, null, null, 0, ANO_TODO],
  ['P004', 'Carne bovina moída', 'proteina', 137, 19.4, 0, 5.9, 0, 3, 1.8, 0, 0, 3, 'refrigerado', 35, 28, null, null, 0, ANO_TODO],
  ['P005', 'Peixe (filé)', 'proteina', 107, 16.7, 0, 4, 0, 16, 0.2, 0, 1, 2, 'refrigerado', 40, 22, null, null, 0, ANO_TODO],
  ['H001', 'Abóbora (jerimum)', 'hortalica', 39, 1.7, 8.4, 0.5, 2.2, 18, 0.4, 5.1, 1, 30, 'ambiente', 40, 3.5, 12000, 100, 0, SECA],
  ['H002', 'Alface', 'hortalica', 11, 1.3, 1.7, 0.2, 1.8, 38, 0.4, 15.6, 1, 4, 'refrigerado', 20, 9.0, 15000, 45, 1, IRRIGADO],
  ['H003', 'Couve-manteiga', 'hortalica', 27, 2.9, 4.3, 0.5, 3.1, 131, 0.5, 96.7, 1, 4, 'refrigerado', 20, 9.0, 14000, 60, 1, IRRIGADO],
  ['H004', 'Tomate', 'hortalica', 15, 1.1, 3.1, 0.2, 1.2, 7, 0.2, 21.2, 1, 7, 'ambiente', 30, 6.5, 30000, 100, 1, IRRIGADO],
  ['H005', 'Cenoura', 'hortalica', 34, 1.3, 7.7, 0.2, 3.2, 23, 0.2, 5.1, 1, 15, 'refrigerado', 25, 5.5, 20000, 100, 1, IRRIGADO],
  ['H006', 'Quiabo', 'hortalica', 30, 1.9, 6.4, 0.3, 4.6, 112, 0.4, 5.6, 1, 5, 'ambiente', 30, 7.0, 10000, 70, 0, CHUVAS],
  ['H007', 'Maxixe', 'hortalica', 14, 1.4, 2.7, 0.1, 2.2, 21, 0.4, 9.6, 1, 6, 'ambiente', 30, 6.0, 8000, 60, 0, CHUVAS],
  ['H008', 'Pepino', 'hortalica', 10, 0.9, 2, 0, 1.1, 10, 0.1, 5, 1, 7, 'ambiente', 30, 4.5, 20000, 60, 1, IRRIGADO],
  ['H009', 'Repolho', 'hortalica', 17, 0.9, 3.9, 0.1, 1.9, 35, 0.2, 18.7, 1, 14, 'refrigerado', 25, 4.5, 30000, 100, 1, IRRIGADO],
  ['H010', 'Cheiro-verde', 'complemento', 20, 1.9, 3.4, 0.4, 3.6, 80, 0.6, 31.8, 1, 4, 'refrigerado', 5, 15, 8000, 50, 1, IRRIGADO],
  ['H011', 'Cebola', 'hortalica', 39, 1.7, 8.9, 0.1, 2.2, 14, 0.2, 4.7, 0, 30, 'ambiente', 8, 5.0, null, null, 0, ANO_TODO],
  ['H012', 'Pimentão verde', 'hortalica', 21, 1.1, 4.9, 0.2, 2.6, 9, 0.4, 100.2, 1, 7, 'ambiente', 10, 8.0, 15000, 90, 1, IRRIGADO],
  ['H013', 'Vinagreira', 'hortalica', null, null, null, null, null, null, null, null, 1, 3, 'refrigerado', 20, 8.0, 9000, 60, 0, CHUVAS],
  ['F001', 'Banana-prata', 'fruta', 98, 1.3, 26, 0.1, 2, 8, 0.4, 21.6, 1, 6, 'ambiente', 70, 4.5, 14000, 365, 0, ANO_TODO],
  ['F002', 'Mamão formosa', 'fruta', 45, 0.8, 11.6, 0.1, 1.8, 25, 0.2, 78.5, 1, 6, 'ambiente', 100, 4.0, 40000, 270, 1, ANO_TODO],
  ['F003', 'Laranja-pera', 'fruta', 37, 1, 8.9, 0.1, 0.8, 22, 0.1, 53.7, 1, 14, 'ambiente', 120, 3.5, 20000, 365, 0, SECA],
  ['F004', 'Melancia', 'fruta', 33, 0.9, 8.1, 0, 0.1, 8, 0.2, 6.1, 1, 10, 'ambiente', 150, 2.5, 25000, 85, 0, SECA],
  ['F005', 'Abacaxi', 'fruta', 48, 0.9, 12.3, 0.1, 1, 22, 0.3, 34.6, 1, 8, 'ambiente', 100, 4.0, 30000, 450, 0, SECA],
  ['F006', 'Goiaba', 'fruta', 54, 1.1, 13, 0.4, 6.2, 4, 0.2, 80.6, 1, 5, 'ambiente', 80, 5.0, 15000, 365, 0, CHUVAS],
  ['F007', 'Manga', 'fruta', 51, 0.9, 12.8, 0.2, 2.1, 8, 0.1, 7.9, 1, 7, 'ambiente', 100, 4.0, 12000, 365, 0, SECA],
  ['F008', 'Acerola', 'fruta', 33, 0.9, 8, 0.2, 1.5, 13, 0.2, 941.4, 1, 3, 'refrigerado', 50, 8.0, 10000, 365, 0, CHUVAS],
  ['F009', 'Juçara (polpa)', 'fruta', 58, 0.8, 6.2, 3.9, 2.6, 35, 0.4, 0, 1, null, 'refrigerado', 80, 14, null, null, 0, CHUVAS],
  ['D001', 'Leite em pó integral', 'laticinio', 497, 25.4, 39.2, 26.9, 0, 890, 0.5, 0, 0, 180, 'seco', 15, 32, null, null, 0, ANO_TODO],
  ['X001', 'Óleo de soja', 'complemento', 884, 0, 0, 100, 0, 0, 0, 0, 0, 365, 'seco', 4, 9.0, null, null, 0, ANO_TODO],
  ['X002', 'Açúcar cristal', 'complemento', 387, 0.3, 99.6, 0, 0, 8, 0.2, 0, 0, 365, 'seco', 5, 4.5, null, null, 0, ANO_TODO],
  ['X003', 'Sal', 'complemento', 0, 0, 0, 0, 0, 0, 0, 0, 0, 365, 'seco', 1, 2.5, null, null, 0, ANO_TODO],
  ['X004', 'Alho', 'complemento', 113, 7, 23.9, 0.2, 4.3, 14, 0.8, 31.1, 0, 60, 'ambiente', 1, 28, null, null, 0, ANO_TODO],
];

// Referências por refeição (cerca de 20% das necessidades diárias, período parcial). Valores do sandbox,
// a conferir com a resolução vigente do FNDE antes do uso real [RF-NUT-02].
export const REFERENCIAS = [
  { id: 'pre_escola', rotulo: 'Pré-escola (4 a 5 anos)', modalidade: 'Educação infantil', kcal: 270, calcio: 200, ferro: 2.0, vit_c: 5 },
  { id: 'fund_6_10', rotulo: 'Fundamental (6 a 10 anos)', modalidade: 'Ensino fundamental', kcal: 329, calcio: 210, ferro: 1.8, vit_c: 7 },
  { id: 'fund_11_15', rotulo: 'Fundamental (11 a 15 anos)', modalidade: 'Ensino fundamental', kcal: 473, calcio: 260, ferro: 2.1, vit_c: 12 },
  { id: 'medio_16_18', rotulo: 'Médio (16 a 18 anos)', modalidade: 'Ensino médio', kcal: 543, calcio: 260, ferro: 2.6, vit_c: 14 },
  { id: 'eja', rotulo: 'EJA (19 a 60 anos)', modalidade: 'Educação de jovens e adultos', kcal: 468, calcio: 200, ferro: 2.6, vit_c: 17 },
];

/** Cardápio-base elaborado pela nutricionista conforme o costume local: [dia, preparação, papel, código, per capita em g]. */
export const CARDAPIO_BASE: [number, string, string, string, number][] = [
  [1, 'Arroz', 'base', 'C001', 35], [1, 'Feijão', 'leguminosa', 'L001', 20], [1, 'Frango ao molho', 'proteina', 'P001', 35],
  [1, 'Abóbora refogada', 'hortalica', 'H001', 40], [1, 'Tempero verde', 'complemento', 'H010', 3], [1, 'Óleo', 'complemento', 'X001', 3], [1, 'Banana', 'fruta', 'F001', 70],
  [2, 'Macarrão', 'base', 'C002', 35], [2, 'Feijão', 'leguminosa', 'L001', 15], [2, 'Carne moída', 'proteina', 'P004', 35],
  [2, 'Molho de tomate', 'hortalica', 'H004', 30], [2, 'Cenoura ralada', 'hortalica', 'H005', 25], [2, 'Óleo', 'complemento', 'X001', 3], [2, 'Laranja', 'fruta', 'F003', 120],
  [3, 'Arroz', 'base', 'C001', 30], [3, 'Feijão-fradinho', 'leguminosa', 'L002', 20], [3, 'Ovo mexido', 'proteina', 'P003', 45],
  [3, 'Couve refogada', 'hortalica', 'H003', 20], [3, 'Vinagrete', 'hortalica', 'H004', 20], [3, 'Óleo', 'complemento', 'X001', 3], [3, 'Mamão', 'fruta', 'F002', 100],
  [4, 'Cuscuz', 'base', 'C003', 40], [4, 'Macaxeira cozida', 'base', 'T001', 30], [4, 'Frango desfiado', 'proteina', 'P001', 35],
  [4, 'Quiabo refogado', 'hortalica', 'H006', 30], [4, 'Abóbora', 'hortalica', 'H001', 30], [4, 'Óleo', 'complemento', 'X001', 3], [4, 'Melancia', 'fruta', 'F004', 150],
  [5, 'Arroz', 'base', 'C001', 35], [5, 'Feijão', 'leguminosa', 'L001', 20], [5, 'Peixe ao molho', 'proteina', 'P005', 40],
  [5, 'Salada de alface', 'hortalica', 'H002', 20], [5, 'Tomate', 'hortalica', 'H004', 20], [5, 'Farinha', 'complemento', 'T004', 10], [5, 'Óleo', 'complemento', 'X001', 3], [5, 'Banana', 'fruta', 'F001', 50],
];

export type Povoado = { nome: string; norte: number; leste: number; via: 'chao' | 'mista_chao' | 'mista_asfalto' | 'asfalto' };

type Escuta = { quer: readonly string[]; sabe: readonly string[]; gostaria: readonly string[]; lucrativo: readonly string[]; area_ha: number; agua: 'sim' | 'sazonal' | 'nao'; mao: number };

/** Um município do sandbox. Posições em metros (norte, leste) a partir do povoado. */
export type Territorio = {
  nome: string; uf: string; cnpj: string; entidade: string; lat: number; lng: number; raio_km: number; repasse: number;
  /** Equipe de gestão, na ordem em que os usuários são criados. */
  gestores: readonly (readonly [nome: string, email: string, perfil: Perfil])[];
  povoados: readonly Povoado[];
  escolas: readonly { nome: string; povoado: number; n: number; l: number; diretor: string; alunos: Readonly<Record<string, number>>; janela: readonly [string, string]; refr: number; seco: number }[];
  // produtos: [código, kg por semana]; escuta: códigos
  agricultores: readonly { nome: string; tipo: string; povoado: number; ha: number; produtos: readonly (readonly [string, number])[]; escuta: Escuta | null; entrega?: Modal; contaDeTerceiro?: boolean }[];
  /** contaEncerrada: a conta deixa de valer na semana corrente, para o sandbox mostrar pagamentos que falham e podem ser reprocessados. */
  prestadores: readonly { nome: string; modal: Modal; cap: number; termica: 0 | 1; povoado: number; area: string; contaEncerrada?: boolean }[];
};

export const TERRITORIO_PRINCIPAL = {
  nome: 'Vale das Sementes', uf: 'SB', cnpj: '00.000.000/0001-00', entidade: 'Secretaria Municipal de Educação',
  // Coordenadas sobre uma base cartográfica real (interior do Maranhão); o município, os povoados e as pessoas são fictícios.
  lat: -4.44911, lng: -45.24203, raio_km: 12, repasse: 148000,
  gestores: [
    ['Prefeito Otávio Sapucaia', 'prefeito@vale.test', 'prefeito'],
    ['Secretária Lúcia Mangaba', 'educacao@vale.test', 'sec_educacao'],
    ['Secretário Davi Umbu', 'agricultura@vale.test', 'sec_agricultura'],
    ['Nutricionista Clara Pitanga', 'nutricionista@vale.test', 'nutricionista'],
    ['Controle interno — Íris Cajá', 'controle@vale.test', 'controle'],
  ],
  povoados: [
    { nome: 'Sede', norte: 0, leste: 0, via: 'asfalto' },
    { nome: "Olho d'Água", norte: 4780, leste: -3030, via: 'chao' },
    { nome: 'Vila Juçara', norte: -6090, leste: 4590, via: 'mista_chao' },
    { nome: 'Boa Esperança', norte: 5950, leste: 5020, via: 'chao' },
    { nome: 'Santa Rosa', norte: -9670, leste: -3060, via: 'mista_asfalto' },
    { nome: 'Lagoa Nova', norte: 2050, leste: 7430, via: 'asfalto' },
    { nome: 'Beira-Rio', norte: -3210, leste: -7800, via: 'chao' },
  ],
  escolas: [
    { nome: 'Escola Municipal Sementes do Saber', povoado: 0, n: 300, l: -400, diretor: 'Diretora Helena Ipê', alunos: { fund_6_10: 180, fund_11_15: 140 }, janela: ['07:00', '10:00'], refr: 120, seco: 400 },
    { nome: 'Escola Municipal Caminho das Águas', povoado: 0, n: -700, l: 600, diretor: 'Diretor Paulo Jatobá', alunos: { fund_6_10: 150, fund_11_15: 110, eja: 40 }, janela: ['07:00', '10:30'], refr: 100, seco: 350 },
    { nome: 'Centro de Educação Infantil Girassol', povoado: 0, n: 500, l: 900, diretor: 'Diretora Marta Sucupira', alunos: { pre_escola: 120 }, janela: ['06:30', '09:30'], refr: 60, seco: 150 },
    { nome: 'Escola Municipal Raízes do Campo', povoado: 1, n: -200, l: 200, diretor: 'Diretora Rosa Angico', alunos: { pre_escola: 25, fund_6_10: 70, fund_11_15: 35 }, janela: ['07:00', '11:00'], refr: 40, seco: 120 },
    { nome: 'Escola Municipal Vila Juçara', povoado: 2, n: 200, l: -200, diretor: 'Diretor Elias Cedro', alunos: { pre_escola: 20, fund_6_10: 60, fund_11_15: 30 }, janela: ['07:30', '11:00'], refr: 40, seco: 100 },
    { nome: 'Escola Municipal Beira-Rio', povoado: 6, n: 100, l: 300, diretor: 'Diretora Ana Jenipapo', alunos: { fund_6_10: 45, fund_11_15: 20 }, janela: ['08:00', '11:30'], refr: 20, seco: 80 },
  ],
  // produtos: [código, kg por semana]; escuta: códigos
  agricultores: [
    { nome: 'Raimunda Aroeira', tipo: 'individual', povoado: 1, ha: 3.5, produtos: [['F001', 150], ['F002', 110], ['T001', 60], ['H010', 6]], escuta: { quer: ['H004', 'F002'], sabe: ['F001', 'F002', 'T001', 'H004'], gostaria: ['F005'], lucrativo: ['F002'], area_ha: 1.2, agua: 'sazonal', mao: 3 }, entrega: 'carroca' },
    { nome: 'João Buriti', tipo: 'individual', povoado: 1, ha: 5, produtos: [['H001', 110], ['H006', 40], ['H007', 30], ['L002', 30], ['F004', 190]], escuta: { quer: ['L001'], sabe: ['L001', 'L002', 'H001', 'F004'], gostaria: ['T002'], lucrativo: ['F004'], area_ha: 2, agua: 'nao', mao: 2 } },
    { nome: 'Associação Boa Esperança', tipo: 'grupo_formal', povoado: 3, ha: 14, produtos: [['L001', 45], ['T004', 14], ['T001', 50], ['C004', 60], ['T002', 80]], escuta: { quer: ['L001', 'T001'], sabe: ['L001', 'L002', 'T001', 'T004', 'C004'], gostaria: ['H001'], lucrativo: ['T004'], area_ha: 4, agua: 'sazonal', mao: 12 } },
    { nome: 'Maria Juçara', tipo: 'individual', povoado: 2, ha: 1.2, produtos: [['H002', 14], ['H003', 28], ['H010', 5], ['H004', 30], ['H012', 12]], escuta: { quer: ['H005', 'H004'], sabe: ['H002', 'H003', 'H004', 'H005', 'H010'], gostaria: ['H009'], lucrativo: ['H004'], area_ha: 0.4, agua: 'sim', mao: 2 } },
    { nome: 'Antônio Babaçu', tipo: 'individual', povoado: 2, ha: 4, produtos: [['P003', 60], ['P002', 30], ['F003', 90]], escuta: { quer: ['F003'], sabe: ['F003', 'F007'], gostaria: [], lucrativo: ['P003'], area_ha: 1, agua: 'sazonal', mao: 2 } },
    { nome: 'Grupo Mulheres da Horta', tipo: 'grupo_informal', povoado: 4, ha: 2, produtos: [['H003', 16], ['H002', 16], ['H008', 40], ['H009', 50], ['H004', 25]], escuta: { quer: ['H005', 'H002'], sabe: ['H002', 'H003', 'H008', 'H009', 'H004'], gostaria: ['H005'], lucrativo: ['H004', 'H002'], area_ha: 0.6, agua: 'sim', mao: 7 } },
    { nome: 'Francisca Carnaúba', tipo: 'individual', povoado: 4, ha: 3, produtos: [['F001', 80], ['F006', 60], ['F008', 25], ['F007', 70]], escuta: { quer: ['F001'], sabe: ['F001', 'F006', 'F007'], gostaria: ['F003'], lucrativo: ['F008'], area_ha: 0.8, agua: 'sazonal', mao: 2 } },
    { nome: 'José Tucum', tipo: 'individual', povoado: 5, ha: 6, produtos: [['F004', 160], ['H001', 70], ['T002', 60], ['F002', 60]], escuta: { quer: ['F004', 'F003'], sabe: ['F004', 'H001', 'T002', 'F003'], gostaria: ['L001'], lucrativo: ['F004'], area_ha: 2.5, agua: 'nao', mao: 3 }, entrega: 'moto' },
    { nome: 'Pedro Bacaba', tipo: 'individual', povoado: 6, ha: 2, produtos: [['P005', 40], ['T001', 40], ['T003', 50]], escuta: null, contaDeTerceiro: true },
    { nome: 'Luzia Pequi', tipo: 'individual', povoado: 6, ha: 4, produtos: [['F005', 90], ['F003', 70], ['H006', 25], ['L002', 25]], escuta: { quer: ['F005'], sabe: ['F005', 'F003', 'H006', 'L002'], gostaria: ['H004'], lucrativo: ['F005'], area_ha: 1.5, agua: 'sazonal', mao: 2 } },
  ],
  prestadores: [
    { nome: 'Carlos Sabiá — frete leve', modal: 'carro_leve', cap: 450, termica: 1, povoado: 0, area: 'Todo o município' },
    { nome: 'Dona Tereza Bem-te-vi — frete leve', modal: 'carro_leve', cap: 400, termica: 0, povoado: 4, area: 'Santa Rosa, Beira-Rio e sede' },
    { nome: 'Mototáxi do Zeca Curió', modal: 'moto', cap: 40, termica: 1, povoado: 0, area: 'Sede e povoados próximos' },
    { nome: 'Mototáxi da Nalva Rolinha', modal: 'moto', cap: 40, termica: 0, povoado: 2, area: 'Vila Juçara e Lagoa Nova' },
    { nome: 'Bicicleta cargueira do Tico Canário', modal: 'bicicleta', cap: 60, termica: 0, povoado: 0, area: 'Sede' },
    { nome: 'Carroça do Seu Bento Juriti', modal: 'carroca', cap: 300, termica: 0, povoado: 3, area: "Boa Esperança e Olho d'Água" },
    { nome: 'Lia Andorinha — entrega a pé', modal: 'a_pe', cap: 12, termica: 0, povoado: 1, area: "Olho d'Água" },
  ],
} as const satisfies Territorio;

/** Município menor, que entrou no consórcio há poucas semanas, em piloto. */
export const TERRITORIO_SECUNDARIO = {
  nome: 'Serra do Buriti', uf: 'SB', cnpj: '00.000.000/0002-00', entidade: 'Secretaria Municipal de Educação',
  lat: -4.61192, lng: -44.98004, raio_km: 9, repasse: 32000,
  gestores: [
    ['Prefeita Joana Carcará', 'prefeito@serra.test', 'prefeito'],
    ['Secretário Ivo Araticum', 'educacao@serra.test', 'sec_educacao'],
    ['Secretária Neide Guará', 'agricultura@serra.test', 'sec_agricultura'],
    ['Nutricionista Bia Ingá', 'nutricionista@serra.test', 'nutricionista'],
    ['Controle interno — Caio Araçá', 'controle@serra.test', 'controle'],
  ],
  povoados: [
    { nome: 'Sede', norte: 0, leste: 0, via: 'asfalto' },
    { nome: 'Cajueiro', norte: 5000, leste: 2000, via: 'chao' },
    { nome: 'Palmeiral', norte: -3500, leste: 4500, via: 'mista_chao' },
    { nome: 'Brejo Verde', norte: 4200, leste: -3000, via: 'chao' },
  ],
  escolas: [
    { nome: 'Escola Municipal Alto da Serra', povoado: 0, n: 200, l: 300, diretor: 'Diretora Socorro Oiti', alunos: { pre_escola: 30, fund_6_10: 90, fund_11_15: 40 }, janela: ['07:00', '10:30'], refr: 40, seco: 150 },
    { nome: 'Escola Municipal Brejo Verde', povoado: 3, n: 0, l: 0, diretor: 'Diretor Severino Baru', alunos: { fund_6_10: 70 }, janela: ['07:30', '11:00'], refr: 30, seco: 100 },
  ],
  agricultores: [
    { nome: 'Sítio Cajueiro — Rita Murici', tipo: 'individual', povoado: 1, ha: 3, produtos: [['F001', 45], ['T001', 25], ['F002', 30]], escuta: { quer: ['F003'], sabe: ['F001', 'T001', 'F002', 'F003'], gostaria: ['F005'], lucrativo: ['F001'], area_ha: 1, agua: 'sazonal', mao: 2 } },
    { nome: 'Sítio Palmeiral — Abel Tucumã', tipo: 'individual', povoado: 2, ha: 4, produtos: [['H001', 30], ['L002', 12], ['F004', 40]], escuta: { quer: ['L001'], sabe: ['H001', 'L002', 'L001', 'F004'], gostaria: ['T002'], lucrativo: ['F004'], area_ha: 1.5, agua: 'nao', mao: 2 }, entrega: 'moto' },
    { nome: 'Cooperativa Serra Viva', tipo: 'grupo_formal', povoado: 0, ha: 10, produtos: [['L001', 15], ['T004', 5], ['P003', 20], ['C004', 20]], escuta: { quer: ['P002'], sabe: ['L001', 'T004', 'P003', 'C004'], gostaria: ['P002'], lucrativo: ['P003'], area_ha: 3, agua: 'sazonal', mao: 9 } },
    { nome: 'Horta Comunitária Brejo Verde', tipo: 'grupo_informal', povoado: 3, ha: 1, produtos: [['H003', 6], ['H004', 10], ['H010', 2], ['H002', 5], ['H005', 8]], escuta: { quer: ['H012'], sabe: ['H002', 'H003', 'H004', 'H005', 'H010'], gostaria: ['H012'], lucrativo: ['H004'], area_ha: 0.3, agua: 'sim', mao: 5 } },
  ],
  prestadores: [
    { nome: 'Mototáxi do Nonato Xexéu', modal: 'moto', cap: 40, termica: 0, povoado: 0, area: 'Todo o município' },
    { nome: 'Frete do Gil Seriema', modal: 'carro_leve', cap: 400, termica: 1, povoado: 0, area: 'Todo o município' },
    { nome: 'Bicicleta cargueira da Dalva Sanhaçu', modal: 'bicicleta', cap: 60, termica: 0, povoado: 0, area: 'Sede', contaEncerrada: true },
  ],
} as const satisfies Territorio;
