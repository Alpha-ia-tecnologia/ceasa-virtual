import { todos } from '../db.ts';
import { municipio, hoje, arred } from '../util.ts';
import { TIPOS_VIA, MODAIS, type TipoVia } from '../../compartilhado/dominio.ts';

// Minuta de edital de credenciamento com precificação que embute a logística [RF-CON-01].
// Modelo parametrizável: o texto é um ponto de partida e depende de validação jurídica do município.
// Os preços constam como definidos pelo gestor responsável; a plataforma só registra quem lançou cada valor.

export function montarEdital(municipioId: number) {
  const mun = municipio(municipioId);
  const precos = todos<any>(
    `SELECT a.nome AS alimento, p.preco_kg, p.frete_kg, p.servidor_nome, p.criado_em, p.fundamento
     FROM precos p JOIN alimentos a ON a.id = p.alimento_id WHERE p.municipio_id = ? AND p.vigente = 1 ORDER BY a.nome`,
    municipioId,
  ).map((p) => ({ ...p, total_kg: arred(p.preco_kg + p.frete_kg) }));
  const escolas = todos<any>('SELECT nome, endereco FROM escolas WHERE municipio_id = ? ORDER BY nome', municipioId);
  const iss = `${(mun.params.aliquota_iss * 100).toLocaleString('pt-BR')}%`;
  const vias = (Object.keys(TIPOS_VIA) as TipoVia[]).map((k) => `${TIPOS_VIA[k].rotulo.toLowerCase()} ${mun.params.indices_via[k].toLocaleString('pt-BR')}`).join('; ');
  return {
    titulo: `Minuta de edital de credenciamento — agricultura familiar e frete local`,
    municipio: mun.nome, entidade: mun.entidade_executora, exercicio: mun.exercicio, gerado_em: hoje(),
    aviso: 'Minuta gerada a partir de modelo parametrizável, para discussão. Não tem valor jurídico antes da validação pela procuradoria do município.',
    clausulas: [
      { titulo: '1. Objeto', texto: `Credenciamento de agricultores familiares, individuais ou organizados em grupos formais e informais, para o fornecimento de gêneros alimentícios à alimentação escolar do município de ${mun.nome}, e de prestadores de frete local para a coleta nas áreas de produção e a entrega nas unidades escolares.` },
      { titulo: '2. Fundamento', texto: 'Lei nº 11.947/2009 (alimentação escolar), Lei nº 14.133/2021 (licitações e contratos), Lei nº 15.226/2025 (percentual mínimo de aquisição da agricultura familiar) e Lei Complementar nº 123/2006, art. 47, conforme citadas nos documentos de referência do projeto.' },
      { titulo: '3. Quem pode se credenciar', texto: 'Agricultores familiares com Cadastro Nacional da Agricultura Familiar (CAF) válido, com residência e área de plantação no município, e conta corrente de titularidade própria. Prestadores de frete local com inscrição municipal, nos modais: ' + Object.values(MODAIS).map((m) => m.rotulo.toLowerCase()).join(', ') + '. O agricultor pode se credenciar também como prestador para entregar a própria produção.' },
      { titulo: '4. Preço do alimento e do frete', texto: 'O preço de cada gênero e o valor do respectivo frete local são definidos pelo gestor público responsável e constam do Anexo I, com a identificação do servidor que lançou cada valor. O valor pago por quilo entregue é a soma do preço do alimento com o frete. A responsabilidade pelos preços é da Prefeitura e de suas secretarias.' },
      { titulo: '5. Subsídio para o cálculo do frete', texto: `Como subsídio ao gestor, a plataforma calcula um custo de referência do frete pela distância de ida e volta entre a área de plantação e a escola, multiplicada pelo índice do tipo de via (${vias}). O custo de referência é informativo e não substitui o valor definido pelo gestor.` },
      { titulo: '6. Pedidos e entregas', texto: `Os pedidos são gerados a partir do cardápio aprovado pela nutricionista responsável técnica e distribuídos entre os credenciados por disponibilidade e distância. As entregas ocorrem nas ${escolas.length} unidades do Anexo II, dentro da janela de recebimento de cada escola.` },
      { titulo: '7. Comprovação da entrega', texto: 'A entrega é comprovada por registro fotográfico com localização, data e hora em dois pontos: na origem, pelo agricultor, no local da plantação, no momento em que a carga é entregue ao prestador; e no destino, pela escola e pelo prestador, com a quilometragem de chegada e a conferência de quantidade e qualidade de cada item.' },
      { titulo: '8. Pagamento', texto: `Somente a entrega validada gera pagamento. O valor do alimento é pago diretamente em conta corrente de titularidade do agricultor; o valor do frete é pago ao prestador, com retenção do ISS à alíquota de ${iss} sobre o serviço de frete.` },
      { titulo: '9. Divergências', texto: 'Diferença de quantidade, problema de qualidade ou evidência inconsistente suspende o pagamento correspondente até a análise do controle interno, que pode aceitar total ou parcialmente, recusar ou pedir nova evidência, com registro do motivo.' },
    ],
    anexo_precos: precos,
    anexo_escolas: escolas,
  };
}
