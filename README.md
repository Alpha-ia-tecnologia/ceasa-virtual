# CEASA VIRTUAL — MVP da plataforma

**O mapa social da Agricultura Familiar.** Tecnologia para conectar a agricultura familiar às necessidades de abastecimento.

Este repositório é o MVP da plataforma, construído a partir da *Especificação de Requisitos Funcionais v1.1* (12/11/2026) e do *Manual de identidade visual* (proposta 03). Ele cobre o escopo **F1** da especificação — a prova de conceito da Fase 1 — e roda inteiro em **ambiente de simulação**: município, pessoas, documentos, preços e entregas são sintéticos; nenhum pagamento, prestador ou instituição real é acionado.

## Como rodar

Requer Node.js 22.13 ou mais novo (usa o SQLite embutido do Node; não há banco para instalar).

```bash
npm install
npm run dev        # http://localhost:3000
```

Na primeira execução o sandbox é carregado sozinho (cerca de um segundo e meio). A tela de entrada tem acesso rápido por perfil; a senha de todos os usuários do sandbox é `semente2026`.

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor e interface em desenvolvimento, na mesma porta |
| `npm run build` e `npm start` | Build de produção e servidor servindo a pasta `dist` |
| `npm run seed` | Apaga tudo e recarrega os dados sintéticos |
| `npm test` | Testes do fluxo de ponta a ponta, em banco em memória |
| `npm run typecheck` | Verificação de tipos |

Variáveis: `PORT` (padrão 3000), `CEASA_DADOS` (pasta do banco e das fotos; padrão `./dados`), `CEASA_SANDBOX=0` (desliga o acesso rápido, a simulação de posição e a recarga do sandbox).

Os mapas precisam de internet: o navegador baixa a base cartográfica (OpenFreeMap e Esri) e o servidor consulta o traçado das rotas (`CEASA_ROTEADOR`, padrão `https://routing.openstreetmap.de`; `CEASA_MAPAS_OFFLINE=1` desliga a consulta e usa linhas aproximadas). São serviços públicos gratuitos com limite de uso: servem para demonstração, não para operação.

## Roteiro de demonstração

O sandbox traz dois municípios do mesmo consórcio, com a semana corrente em todas as fases do percurso:

- **Vale das Sementes** opera há oito semanas e cresceu aos poucos (de 4 para 10 agricultores); a projeção da cota passa do piso. O histórico tem revisões de preço lançadas pelo prefeito e pela Secretaria de Educação, duas versões do cardápio-base e divergências decididas de três formas (aceite parcial, recusa e nova evidência).
- **Serra do Buriti** entrou há quatro semanas, em piloto, e está em risco de fechar o ano abaixo do piso. Nesta semana, uma prestadora trocou de banco sem cadastrar a conta nova, e um pagamento dela falhou.

A tela de entrada traz um usuário de cada perfil do Vale das Sementes. Os de Serra do Buriti estão em *Todos os usuários do sandbox* (e-mails `@serra.test`). Para percorrer o fluxo da Figura 1 ao vivo:

1. **Nutricionista** — *Cardápios* → gerar as alternativas da próxima semana. Compare demanda planejada, oferta do dia e combinado; ajuste uma per capita (a adequação é recalculada) e aprove.
2. **Entidade executora / controle interno** — no cardápio aprovado, *Gerar pedidos aos agricultores*; em *Rotas*, planejar a data de entrega, escolher uma rota para ver as paradas numeradas pelas estradas e usar *Simular o percurso*. O botão *Satélite* troca a base do mapa.
3. **Agricultor**, **Prestador** e **Direção da escola** (telas de celular) — fotografar a carga na plantação, registrar a chegada com a quilometragem, conferir e fotografar o recebimento. No sandbox, a opção *Usar imagem de exemplo* dispensa a câmera. O **Operador** também pode simular essas etapas na página do pedido, inclusive com problemas (foto reaproveitada, quantidade menor, registro fora do raio).
4. **Controle interno** — em *Entregas e evidências → Divergências*, decidir uma divergência; em *Pagamentos*, pagar uma entrega validada e ver os três comprovantes (agricultor, prestador, ISS retido). Em Serra do Buriti (`controle@serra.test`), o pagamento que falhou só sai depois de corrigir a conta da prestadora em *Mapa e cadastros → Prestadores de frete* e reprocessar.
5. **Prefeito ou Secretaria de Educação** — *Painel do gestor* (cota de 45% e projeção) e *Preços e edital* (lançar um preço fica registrado em nome de quem lançou). O alerta de risco da cota aparece com `prefeito@serra.test`.
6. **Secretaria de Agricultura** — *Recomendações de plantio*: lacunas do cardápio, sugestões por agricultor a partir da escuta e simulação do efeito.
7. **Operador** — troca de município no topo (isolamento de dados) e visão do consórcio; *Trilha de auditoria → Verificar a integridade*.

## Perfis

Gestão (computador): operador CEASA VIRTUAL, prefeito, Secretaria de Educação, Secretaria de Agricultura, nutricionista RT, entidade executora / controle interno. Campo (celular): agricultor familiar, prestador de frete local, direção da escola. As permissões estão em `compartilhado/dominio.ts`; perfis de campo só enxergam as próprias entregas, e CPF, CAF e dados bancários são mascarados para quem não precisa deles.

Ficaram fora, por estarem marcados como *a validar* na especificação: Secretário de Assistência Social, Associação de Pais e Mestres e órgão de controle externo.

## O que está implementado (escopo F1)

| Módulo | Requisitos | Situação |
| --- | --- | --- |
| Cadastros | RF-CAD-01, 02, 03, 05 | Escolas, agricultores (com áreas de plantação e via de acesso) e prestadores com marcação no mapa. O cadastro do município tem API (`PUT /api/municipio`), mas ainda não tem tela de edição. |
| Base nutricional | RF-NUT-01 a 06 | Importação de tabela de composição por CSV com histórico de versões, índice de cobertura com pendências, perecibilidade por gênero. Referências do PNAE e histórico de safras entram pela carga do sandbox, sem tela de importação. |
| Oferta agrícola | RF-OFE-01, 03, 04, 05 | Registro de oferta (gestão e agricultor), saldo disponível e comprometido, data-limite pela perecibilidade, calendário sazonal. |
| Cardápio Dinâmico | RF-CAR-01 a 07, 09 | Cardápio-base da nutricionista, três alternativas por semana (demanda, oferta, combinado) ordenadas por adequação, custo, agricultura familiar e safra, ajuste com recálculo, aprovação e lista de necessidades por escola. Histórico de versões e de propostas guardado. |
| Recomendações | RF-REC-01, 02, 03, 05 | Lacunas, escuta do agricultor, recomendações por agricultor e simulação do efeito. Nada é publicado ao agricultor (F2). |
| Contratação | RF-CON-01, 02, 03 | Preço definido pelo gestor com servidor, data e fundamento; custo de referência só como subsídio; minuta de edital parametrizada; pedidos por disponibilidade e distância. |
| Roteirização | RF-LOG-01 a 06 | Heurística de coleta e entrega com janelas de tempo, seis modais, fracionamento de carga, agricultor que entrega a própria produção, custo de referência (ida e volta × índice da via), cenário-base convencional como indicador e bateria de cenários sintéticos. |
| Recebimento e auditoria | RF-AUD-01 a 06 | Evidência na origem e no destino com foto, posição e hora; verificação de integridade (foto repetida por hash, raio, janela); checklist ESG e selo; divergências com decisão do controle; trilha encadeada por hash, com bloqueio de alteração e exclusão no banco. |
| Pagamento | RF-PAG-01 a 05 | Liquidação em três partes, ISS sobre o frete, bloqueio por titularidade da conta e por entrega não validada, pagamento por entrega ou em lote. |
| Painel | RF-GES-01, 02, 05 | Cota sobre o repasse do FNDE com projeção e alerta de risco, indicadores operacionais, tudo integrado num único painel. |
| Comercial | RF-COM-01, 05 | Dados isolados por município e visão consolidada do consórcio. Modo piloto é só um indicador no cadastro; não há condições comerciais. |
| Administração | RF-ADM-01, 03, 04, 05 | Sessão por perfil e município, parâmetros por município, log administrativo na trilha, sandbox com carga sintética. |

## O que é simulado ou simplificado

Vale ler antes de mostrar a alguém de fora:

- **Motor do cardápio.** É uma heurística determinística de alocação e substituição (`server/dominio/cardapio.ts`), não um modelo treinado. A especificação chama de IA; aqui ela é o protótipo da Fase 1.
- **Visão computacional (RF-AUD-02).** Nenhuma imagem é analisada. A conferência usa as quantidades declaradas na origem e no destino e a avaliação de quem recebeu (`server/integracoes/visao.ts`).
- **Pagamentos (RF-PAG-03).** Mock em sandbox (`server/integracoes/pagamento.ts`); os comprovantes são fictícios.
- **Mapas e distâncias (RF-LOG-03).** O mapa é real: base vetorial do OpenStreetMap (OpenFreeMap) nas cores da marca, sem nomes de lugares, e imagem de satélite da Esri. O município, as pessoas e os pontos são fictícios, mas foram posicionados sobre uma cidade e povoados reais do interior do Maranhão, então as rotas passam por estradas que existem. O traçado de cada rota vem de um servidor OSRM público (`routing.openstreetmap.de`), com perfil de carro, bicicleta ou pedestre conforme o meio de transporte, e fica em cache no banco (`server/integracoes/trajetos.ts`). O trecho entre o ponto cadastrado e a estrada mais próxima aparece pontilhado. O planejamento e o custo de referência **continuam** usando linha reta × fator de tortuosidade (`server/integracoes/geo.ts`), que é determinístico e funciona sem internet; a rota selecionada mostra também a distância pelas estradas, para comparação. Sem conexão com o serviço de rotas, o mapa desenha a linha aproximada (tracejada) e avisa na legenda.
- **Simulação do percurso.** Em *Rotas*, ao escolher uma rota, *Simular o percurso* faz o veículo andar pelo traçado nas estradas, no horário planejado (saída, chegada a cada parada, espera pela janela da escola). O prestador vê o mesmo mapa e a mesma simulação na tela da corrida.
- **Dados nutricionais.** Valores aproximados para demonstração. Antes de uso real, importar a TACO oficial e conferir as referências com a resolução vigente do FNDE. A per capita é tratada como peso de compra, sem fator de correção ou cocção.
- **Índice de adequação.** Pesa energia (40%), macronutrientes (36%) e cálcio, ferro e vitamina C (24%); é uma proposta de cálculo, a validar com a nutricionista.
- **Entregas.** Duas por semana por padrão (segunda e quinta, parametrizável). Um pedido tem um conjunto de evidências mesmo quando a carga é fracionada em várias viagens.
- **Parâmetros de valor.** O valor-base por km de cada modal começa em R$ 1,00 (custo = km × índice da via, como na tabela do cliente). O custo por km do transporte convencional (R$ 4,50) e a alíquota de ISS (5%) são ilustrativos.

## Fora deste MVP

- Requisitos F2: Contrata+Brasil, canal de áudio e vídeo, credenciamento, validade de documentos, cadastro assistido, verificação territorial e bancária automática, aceite de pedido, contratos e saldos, acompanhamento em tempo real, dossiê exportável, comparativo planejado × servido, frequência, foto do prato, capacitação, empenho e liquidação orçamentária, documentos fiscais, cobrança B2G, consentimento LGPD.
- Requisitos não funcionais (desempenho, disponibilidade, segurança da infraestrutura) e teste de carga do mês 9.
- Validação de dígitos de CPF e CNPJ, login gov.br, recuperação de senha e gestão de usuários pela interface.
- As 10 decisões e os 28 requisitos *a validar* da seção 6 e os cinco áudios pendentes da seção 5.2 seguem em aberto. Onde o MVP precisou escolher, escolheu a proposta escrita na especificação (por exemplo: custo comparado ao convencional só como indicador — decisão 8).

## Arquitetura

```
compartilhado/dominio.ts   vocabulário, permissões e constantes usados pelo servidor e pela interface
server/
  index.ts                 Express + Vite (dev) ou arquivos estáticos (produção)
  api.ts                   rotas HTTP, validação de entrada e escopo por perfil
  auth.ts, trilha.ts       sessão por cookie, trilha encadeada por hash
  db.ts                    esquema SQLite (node:sqlite) e utilitários
  dominio/                 nutrição, cardápio, pedidos, rotas, auditoria, pagamentos, recomendações, painel, edital
  integracoes/             pontos de troca: geografia, traçado pelas estradas, visão computacional, arranjo de pagamento
  seed/                    dados sintéticos e gerador de carga (usa os mesmos serviços da operação)
src/                       interface React (Vite): telas de gestão em src/paginas, telas de campo em Campo.tsx
public/marca/              artes da marca extraídas do manual de identidade
testes/                    testes de fluxo com node:test
```

O banco fica em `dados/ceasa.sqlite` e as fotos em `dados/evidencias/` (ambos fora do controle de versão). Os traçados das rotas ficam em cache na tabela `trajetos_cache`, que sobrevive à recarga do sandbox.

## Identidade visual

A interface segue o manual: verde território `#145C43` como cor de ação, verde cultivo `#71A541` e ocre colheita `#E2AA3B` como acentos, branco semente `#F5F2E9` de fundo, grafite terra `#24372D` no texto e Open Sans (arquivos oficiais, servidos localmente). A logo entra sempre como arquivo — compacta no cabeçalho, completa e reversa na entrada — sem redesenho do nome. As artes em `public/marca/` foram extraídas do PDF do manual; quando os arquivos vetoriais existirem, basta substituí-las.

## Antes de usar com dados reais

Este MVP não está pronto para produção. No mínimo: desligar o sandbox (`CEASA_SANDBOX=0`), servir por HTTPS (`CEASA_HTTPS=1` marca o cookie como seguro), criar usuários com senhas próprias, trocar as três integrações simuladas, contratar ou hospedar a base cartográfica e o serviço de rotas (os públicos gratuitos têm limite de uso), definir retenção e base legal para CPF, conta bancária e localização (LGPD) e migrar o SQLite de arquivo único para um banco com cópia de segurança.
