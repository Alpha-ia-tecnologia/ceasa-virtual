import { rmSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { recriarEsquema, inserir, todos, um, exec, tx, DIR_EVIDENCIAS } from '../db.ts';
import { hoje, segundaDe, somarDias, simularInstante, semente, arred, isoInstante, PARAMS_PADRAO } from '../util.ts';
import { registrar, SISTEMA, type Autor } from '../trilha.ts';
import { deslocar } from '../integracoes/geo.ts';
import { hashSenha } from '../auth.ts';
import { MODAIS, type Perfil } from '../../compartilhado/dominio.ts';
import { salvarBase, gerarPropostas, aprovar, type ItemCardapio } from '../dominio/cardapio.ts';
import { gerarPedidos } from '../dominio/pedidos.ts';
import { planejarRotas } from '../dominio/rotas.ts';
import { resolverDivergencia } from '../dominio/auditoria.ts';
import { pagar, pagarLote } from '../dominio/pagamentos.ts';
import { avancarPedido, type Variante } from '../dominio/sandbox.ts';
import { ALIMENTOS, REFERENCIAS, CARDAPIO_BASE, TERRITORIO_PRINCIPAL as T, TERRITORIO_SECUNDARIO as T2, type Territorio } from './dados.ts';

// Carga sintética do sandbox [RF-ADM-05]. Tudo aqui é fictício: município, pessoas, documentos, preços e entregas.
// As semanas passadas são produzidas pelos mesmos serviços usados na operação, o que também exercita o fluxo de ponta a ponta.

export const SENHA_SANDBOX = 'semente2026';

/**
 * Agricultores que já tinham aderido em cada semana de operação, da mais antiga à corrente.
 * O Vale das Sementes opera há oito semanas e cresceu aos poucos; Serra do Buriti entrou no consórcio depois, em piloto.
 */
const RAMPA_VALE = [4, 5, 6, 7, 8, 9, 10, 10];
const RAMPA_SERRA = [2, 3, 4, 4];

type Produtor = { id: number; area: number; produtos: readonly (readonly [string, number])[] };
type Municipio = { id: number; produtores: Produtor[]; gestor: (perfil: Perfil) => Autor; contador: number; contasEncerradas: number[] };
type Numeracao = { doc: number; docPrestador: number; agencia: string; conta: number; contaPrestador: number; iss: number; issProprio: number; caf: (i: number) => string };

const instante = (data: string, hora: number, minuto = 0) => {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(a, m - 1, d, hora, minuto, 0);
};

export function popular() {
  const inicio = Date.now();
  recriarEsquema();
  if (process.env.CEASA_DB !== ':memory:') {
    rmSync(DIR_EVIDENCIAS, { recursive: true, force: true });
    mkdirSync(DIR_EVIDENCIAS, { recursive: true });
  }
  const rnd = semente(13112026);
  const entre = (a: number, b: number) => a + rnd() * (b - a);
  const semanaAtual = segundaDe(hoje());
  const exercicio = Number(hoje().slice(0, 4));
  /** Põe o relógio do sandbox N dias antes (ou depois) da segunda-feira da semana corrente. */
  const relogio = (dias: number, hora: number, minuto = 0) => simularInstante(instante(somarDias(semanaAtual, dias), hora, minuto));

  tx(() => {
    const senha = hashSenha(SENHA_SANDBOX);
    const usuario = (nome: string, email: string, perfil: Perfil, municipio_id: number | null, vinculo_id: number | null = null) =>
      inserir('usuarios', { nome, email, senha_hash: senha, perfil, municipio_id, vinculo_id });
    const operador: Autor = { id: usuario('Equipe CEASA VIRTUAL', 'operador@ceasa.test', 'operador', null), nome: 'Equipe CEASA VIRTUAL', perfil: 'operador' };

    // ---------- base nutricional, com histórico de versões [RF-NUT-01] ----------
    relogio(-70, 9);
    const regionais = ['H013', 'F009'];
    const v1 = inserir('taco_versoes', { rotulo: 'Carga inicial do sandbox', fonte: 'Valores aproximados para demonstração', importado_em: isoInstante(), importado_por: operador.nome, total: ALIMENTOS.length - regionais.length });
    registrar(operador, null, 'Tabela de composição importada', 'taco_versao', v1, { novos: ALIMENTOS.length - regionais.length, atualizados: 0 }, 'admin');
    relogio(-63, 9);
    const versao = inserir('taco_versoes', { rotulo: 'Revisão com produtos regionais', fonte: 'Valores aproximados para demonstração; substituir pela importação oficial da TACO', importado_em: isoInstante(), importado_por: operador.nome, total: ALIMENTOS.length });
    registrar(operador, null, 'Tabela de composição importada', 'taco_versao', versao, { novos: regionais.length, atualizados: ALIMENTOS.length - regionais.length }, 'admin');
    const idAlimento = new Map<string, number>();
    for (const a of ALIMENTOS) {
      const [codigo, nome, grupo, kcal, ptn, cho, lip, fibra, calcio, ferro, vit_c, agricola, validade_dias, armazenamento, percapita_padrao_g, preco_medio, produtividade_kg_ha, ciclo_dias, precisa_agua, safra] = a;
      idAlimento.set(codigo, inserir('alimentos', {
        codigo, nome, grupo, kcal, ptn, cho, lip, fibra, calcio, ferro, vit_c, referenciado_fnde: 1, agricola, produto_agricola: agricola ? nome : null,
        validade_dias, armazenamento, percapita_padrao_g, preco_medio, produtividade_kg_ha, ciclo_dias, precisa_agua, safra, versao_id: versao,
      }));
    }
    const alimento = (codigo: string) => idAlimento.get(codigo)!;
    const nomeAlimento = new Map(ALIMENTOS.map((a) => [a[0], a[1]]));
    REFERENCIAS.forEach((r, i) => inserir('referencias', { ...r, periodo: 'Parcial', ordem: i, fator: arred(r.kcal / 329, 4) }));

    // ---------- municípios e cadastros [RF-CAD-01..05] ----------
    const consorcio = inserir('consorcios', { nome: 'Consórcio Intermunicipal do Sandbox' });
    const janelas = (j: readonly [string, string]) => [1, 2, 3, 4, 5].map((dia) => ({ dia, inicio: j[0], fim: j[1] }));

    const criarMunicipio = (t: Territorio, modoPiloto: 0 | 1, dominio: string, num: Numeracao): Municipio => {
      const mun = inserir('municipios', { nome: t.nome, uf: t.uf, cnpj: t.cnpj, entidade_executora: t.entidade, repasse_fnde_anual: t.repasse, exercicio, lat: t.lat, lng: t.lng, raio_km: t.raio_km, modo_piloto: modoPiloto, consorcio_id: consorcio, params: {} });
      const gestores = new Map<Perfil, Autor>();
      for (const [nome, email, perfil] of t.gestores) gestores.set(perfil, { id: usuario(nome, email, perfil, mun), nome, perfil });
      const centro = { lat: t.lat, lng: t.lng };
      const ponto = (povoado: number, n = 0, l = 0) => deslocar(centro, t.povoados[povoado].norte + n, t.povoados[povoado].leste + l);

      t.escolas.forEach((e, i) => {
        const id = inserir('escolas', { municipio_id: mun, nome: e.nome, endereco: `${t.povoados[e.povoado].nome}, ${t.nome}`, ...ponto(e.povoado, e.n, e.l), diretor: e.diretor, janelas: janelas(e.janela), cap_refrigerado_kg: e.refr, cap_seco_kg: e.seco, alunos: e.alunos });
        usuario(e.diretor, `diretor${i + 1}@${dominio}`, 'diretor', mun, id);
      });

      const produtores: Produtor[] = [];
      t.agricultores.forEach((a, i) => {
        const doc = `000.000.${num.doc + i}-00`;
        const conta = `${num.conta + i}-${i % 9}`;
        const res = ponto(a.povoado, entre(-500, 500), entre(-500, 500));
        const e = a.escuta;
        const id = inserir('agricultores', {
          municipio_id: mun, nome: a.nome, tipo: a.tipo, documento: doc, caf: num.caf(i),
          res_lat: res.lat, res_lng: res.lng, banco: 'Banco do Sandbox', agencia: num.agencia, conta,
          titular_documento: a.contaDeTerceiro ? '000.000.999-00' : doc,
          produtos: a.produtos.map(([c]) => alimento(c)),
          escuta: e && { quer: e.quer.map(alimento), sabe: e.sabe.map(alimento), gostaria: e.gostaria.map(alimento), lucrativo: e.lucrativo.map(alimento), area_ha: e.area_ha, agua: e.agua, mao_de_obra: e.mao },
          criado_em: isoInstante(),
        });
        const pa = ponto(a.povoado, entre(-900, 900), entre(-900, 900));
        const apelido = (a.nome.split(' — ')[1] ?? a.nome).split(' ').slice(0, 2).join(' ');
        const area = inserir('areas', { agricultor_id: id, nome: `Roça de ${apelido}`, ...pa, hectares: a.ha, tipo_via: t.povoados[a.povoado].via });
        produtores.push({ id, area, produtos: a.produtos });
        usuario(a.nome, `agricultor${i + 1}@${dominio}`, 'agricultor', mun, id);
        if (a.entrega) {
          inserir('prestadores', { municipio_id: mun, nome: `${a.nome} (entrega a própria produção)`, documento: doc, modal: a.entrega, capacidade_kg: MODAIS[a.entrega].capacidade_kg, caixa_termica: 0, area_atuacao: t.povoados[a.povoado].nome, inscricao_municipal: `ISS-${num.issProprio + i}`, banco: 'Banco do Sandbox', agencia: num.agencia, conta, agricultor_id: id, base_lat: pa.lat, base_lng: pa.lng });
        }
      });

      const contasEncerradas: number[] = [];
      t.prestadores.forEach((p, i) => {
        const b = ponto(p.povoado, entre(-400, 400), entre(-400, 400));
        const id = inserir('prestadores', {
          municipio_id: mun, nome: p.nome, documento: `000.000.${num.docPrestador + i}-00`, modal: p.modal, capacidade_kg: p.cap, caixa_termica: p.termica, area_atuacao: p.area, inscricao_municipal: `ISS-${num.iss + i}`,
          banco: 'Banco do Sandbox', agencia: num.agencia, conta: `${num.contaPrestador + i}-${i % 9}`, base_lat: b.lat, base_lng: b.lng,
        });
        if (p.contaEncerrada) contasEncerradas.push(id);
        usuario(p.nome.split(' — ')[0], `prestador${i + 1}@${dominio}`, 'prestador', mun, id);
      });

      return { id: mun, produtores, gestor: (perfil) => gestores.get(perfil)!, contador: 0, contasEncerradas };
    };

    const vale = criarMunicipio(T, 1, 'vale.test', { doc: 101, docPrestador: 301, agencia: '0001', conta: 20000, contaPrestador: 30000, iss: 100, issProprio: 500, caf: (i) => `SB-CAF-${exercicio}-${String(i + 1).padStart(4, '0')}` });
    const serra = criarMunicipio(T2, 1, 'serra.test', { doc: 201, docPrestador: 401, agencia: '0002', conta: 40000, contaPrestador: 50000, iss: 900, issProprio: 700, caf: (i) => `SB-CAF-${exercicio}-9${i}` });
    // validade e preço médio só existem para alimentos de origem agrícola
    const validade = new Map(ALIMENTOS.map((a) => [a[0], a[12] ?? 5]));
    const precoMedio = new Map(ALIMENTOS.map((a) => [a[0], a[15]]));

    // ---------- preços definidos pelo gestor [RF-CON-02] ----------
    const lancarPrecos = (m: Municipio, autor: Autor, fator: number) => {
      const itens = ALIMENTOS.filter((a) => a[11] && a[3] !== null && a[12] !== null);
      for (const a of itens)
        inserir('precos', { municipio_id: m.id, alimento_id: alimento(a[0]), preco_kg: arred(a[15] * fator, 2), frete_kg: arred((0.3 + rnd() * 0.25 + (a[13] === 'refrigerado' ? 0.15 : 0)) * fator, 2), fundamento: 'Pesquisa de preços local (valores sintéticos do sandbox)', servidor_id: autor.id, servidor_nome: autor.nome, criado_em: isoInstante(), vigente: 1 });
      registrar(autor, m.id, 'Preços de referência lançados pelo gestor', 'preco', null, { itens: itens.length }, 'admin');
    };
    /** Revisão de um preço, como faria o gestor pela tela de Preços: o anterior fica no histórico como substituído. */
    const revisarPreco = (m: Municipio, autor: Autor, codigo: string, fator: number, fundamento: string) => {
      const atual = um<any>('SELECT * FROM precos WHERE municipio_id = ? AND alimento_id = ? AND vigente = 1', m.id, alimento(codigo));
      exec('UPDATE precos SET vigente = 0 WHERE id = ?', atual.id);
      const preco = arred(atual.preco_kg * fator, 2);
      const id = inserir('precos', { municipio_id: m.id, alimento_id: atual.alimento_id, preco_kg: preco, frete_kg: atual.frete_kg, fundamento, servidor_id: autor.id, servidor_nome: autor.nome, criado_em: isoInstante(), vigente: 1 });
      registrar(autor, m.id, 'Preço de referência lançado pelo gestor', 'preco', id, { alimento: nomeAlimento.get(codigo), preco_kg: preco, frete_kg: atual.frete_kg, fundamento }, 'admin');
    };

    relogio(-63, 11);
    lancarPrecos(vale, vale.gestor('sec_educacao'), 1);

    // ---------- cardápio-base, com uma versão anterior no histórico [RF-CAR-06] ----------
    const itensBase: ItemCardapio[] = CARDAPIO_BASE.map(([dia, preparacao, papel, codigo, percapita_g]) => ({ dia, preparacao, papel: papel as ItemCardapio['papel'], alimento_id: alimento(codigo), percapita_g }));
    relogio(-63, 15);
    // primeira versão: sem a macaxeira da quinta e com frango na sexta; a nutricionista ajustou ao costume local na semana seguinte
    const versaoInicial = itensBase
      .filter((i) => !(i.dia === 4 && i.alimento_id === alimento('T001')))
      .map((i) => (i.dia === 5 && i.papel === 'proteina' ? { ...i, preparacao: 'Frango ao molho', alimento_id: alimento('P001'), percapita_g: 35 } : i));
    salvarBase(vale.id, 'Cardápio-base — primeira versão', versaoInicial, vale.gestor('nutricionista'));
    relogio(-56, 10);
    salvarBase(vale.id, 'Cardápio-base — costume local', itensBase, vale.gestor('nutricionista'));

    // ---------- ofertas, cardápios, pedidos, entregas e pagamentos ----------
    const campo: Autor = { id: null, nome: 'Simulação de campo (sandbox)', perfil: 'sistema' };
    const criarOfertas = (m: Municipio, semana: string, ativos: number) => {
      for (const p of m.produtores.slice(0, ativos))
        for (const [codigo, kgSemana] of p.produtos) {
          const v = validade.get(codigo)!;
          const total = kgSemana * entre(0.85, 1.15);
          const lotes: [string, number][] = v <= 5 ? [[semana, total * 0.6], [somarDias(semana, 3), total * 0.4]] : [[somarDias(semana, v > 30 ? -2 : -1), total]];
          for (const [colheita, kg] of lotes)
            inserir('ofertas', { municipio_id: m.id, agricultor_id: p.id, area_id: p.area, alimento_id: alimento(codigo), quantidade_kg: arred(kg, 0), data_colheita: colheita, data_limite: somarDias(colheita, v), preco_kg: arred(precoMedio.get(codigo)! * entre(0.9, 1.05), 2), coleta_inicio: '05:30', coleta_fim: '10:30', criado_em: isoInstante() });
        }
    };

    const diasEntrega = PARAMS_PADRAO.dias_entrega;
    const rodarSemana = (m: Municipio, semana: string, atual: boolean, ativos: number) => {
      const nutri = m.gestor('nutricionista');
      const controle = m.gestor('controle');
      simularInstante(instante(somarDias(semana, -3), 10));
      criarOfertas(m, semana, ativos);
      const propostas = gerarPropostas(m.id, semana, nutri);
      simularInstante(instante(somarDias(semana, -3), 15));
      // a nutricionista aprova a alternativa que preserva o cardápio-base e troca só o que falta
      const escolhida = um<any>(`SELECT id FROM cardapios WHERE id IN (${propostas.join(',')}) AND modo = 'combinado'`).id as number;
      aprovar(m.id, escolhida, nutri);
      gerarPedidos(m.id, escolhida, controle);
      diasEntrega.forEach((dia, k) => {
        const data = somarDias(semana, dia - 1);
        simularInstante(instante(somarDias(data, -1), 16));
        planejarRotas(m.id, data, controle);
        simularInstante(instante(data, 12));
        const parcial = atual && k === diasEntrega.length - 1;
        const pedidos = todos<any>("SELECT id FROM pedidos WHERE municipio_id = ? AND data_entrega = ? AND status = 'roteirizado' ORDER BY id", m.id, data);
        const variantes = new Map<number, Variante>();
        pedidos.forEach((p, n) => {
          let etapas = 3;
          let variante: Variante = 'normal';
          if (parcial) {
            const caso = n % 10; // deixa a semana corrente com entregas em todas as fases do percurso
            etapas = [0, 1, 2, 3, 3, 3, 3, 3, 3, 3][caso];
            variante = caso === 3 ? 'foto_repetida' : caso === 4 ? 'qualidade' : 'normal';
          } else {
            // semanas encerradas: alguns problemas de campo, cada um com a decisão que o controle tomaria
            const c = m.contador++;
            variante = c % 89 === 41 ? 'fora_do_raio' : c % 53 === 17 ? 'foto_repetida' : c % 59 === 29 ? 'qualidade' : n % 17 === 5 ? 'quantidade_menor' : 'normal';
          }
          variantes.set(p.id, variante);
          for (let e = 0; e < etapas; e++) avancarPedido(m.id, p.id, campo, e === 2 ? variante : 'normal');
        });
        if (parcial) return;
        // semanas encerradas: o controle resolve as divergências e paga
        simularInstante(instante(data, 15));
        for (const d of todos<any>("SELECT id FROM pedidos WHERE municipio_id = ? AND data_entrega = ? AND status = 'divergencia'", m.id, data)) {
          const v = variantes.get(d.id);
          if (v === 'fora_do_raio') {
            resolverDivergencia(m.id, d.id, { decisao: 'recusar', motivo: 'O recebimento foi registrado longe da escola e a entrega não pôde ser comprovada' }, controle);
            continue;
          }
          if (v === 'foto_repetida') {
            resolverDivergencia(m.id, d.id, { decisao: 'nova_evidencia', ponto: 'destino', papel: 'escola', motivo: 'A foto do recebimento repetia a da coleta; a escola deve refazer o registro' }, controle);
            simularInstante(instante(data, 16));
            avancarPedido(m.id, d.id, campo);
            simularInstante(instante(data, 15));
            continue;
          }
          const recebido = JSON.parse(um<any>("SELECT itens FROM evidencias WHERE pedido_id = ? AND papel = 'escola' AND substituida = 0", d.id).itens) as { pedido_item_id: number; kg: number; qualidade?: string }[];
          const qualidade = v === 'qualidade';
          resolverDivergencia(m.id, d.id, {
            decisao: 'aceitar',
            motivo: qualidade ? 'Item com problema de qualidade descontado; os demais foram aceitos' : 'Aceita a quantidade conferida pela escola',
            itens: recebido.map((i) => ({ pedido_item_id: i.pedido_item_id, aceito_kg: qualidade && i.qualidade !== 'conforme' ? 0 : i.kg })),
          }, controle);
        }
        if (!atual) pagarLote(m.id, controle);
        else {
          const prontas = todos<any>("SELECT l.id FROM liquidacoes l JOIN pedidos p ON p.id = l.pedido_id WHERE l.municipio_id = ? AND l.status = 'pendente' AND p.data_entrega = ? ORDER BY l.id", m.id, data);
          prontas.slice(0, Math.max(0, prontas.length - 4)).forEach((l) => pagar(m.id, l.id, controle));
        }
      });
    };

    const inicioSerra = RAMPA_VALE.length - RAMPA_SERRA.length;
    RAMPA_VALE.forEach((ativosVale, k) => {
      const w = k - (RAMPA_VALE.length - 1); // semanas antes da corrente (0 = corrente)
      const semana = somarDias(semanaAtual, 7 * w);
      // revisões de preço ao longo da operação, cada uma em nome de quem lançou [RF-CON-02, RF-ADM-04]
      if (w === -4) {
        relogio(7 * w - 4, 11);
        const prefeito = vale.gestor('prefeito');
        revisarPreco(vale, prefeito, 'H004', 1.15, 'Alta sazonal do tomate: cotação com três feirantes da sede');
        revisarPreco(vale, prefeito, 'P002', 1.08, 'Reajuste do custo da ração, conforme pesquisa em dois mercados locais');
        revisarPreco(vale, prefeito, 'F003', 0.92, 'Safra cheia na região: média de três cotações caiu');
        revisarPreco(vale, prefeito, 'T001', 1.05, 'Atualização pelo preço praticado no PAA municipal');
      }
      if (w === -2) {
        relogio(7 * w - 4, 10);
        revisarPreco(vale, vale.gestor('sec_educacao'), 'H002', 1.1, 'Perdas na horta com o calor; nova cotação com dois produtores');
      }
      // Serra do Buriti entra no consórcio: preços e cardápio-base antes da primeira semana do piloto
      if (k === inicioSerra) {
        relogio(7 * w - 6, 9);
        lancarPrecos(serra, serra.gestor('sec_educacao'), 1.06);
        relogio(7 * w - 5, 14);
        salvarBase(serra.id, 'Cardápio-base — Serra do Buriti', itensBase, serra.gestor('nutricionista'));
      }
      if (w === -1) {
        relogio(7 * w - 4, 15);
        revisarPreco(serra, serra.gestor('prefeito'), 'H004', 1.1, 'Seca reduziu a oferta local; cotação com três feirantes');
      }
      // na semana corrente, uma prestadora troca de banco e o cadastro fica sem a conta nova: os pagamentos dela falham
      if (w === 0)
        for (const id of serra.contasEncerradas) {
          relogio(-1, 17);
          exec('UPDATE prestadores SET conta = NULL WHERE id = ?', id);
          registrar(serra.gestor('sec_agricultura'), serra.id, 'Cadastro de prestador alterado', 'prestador', id, { observacao: 'Prestadora informou troca de banco; a conta nova ainda não foi cadastrada' }, 'admin');
        }
      rodarSemana(vale, semana, w === 0, ativosVale);
      if (k >= inicioSerra) rodarSemana(serra, semana, w === 0, RAMPA_SERRA[k - inicioSerra]);
    });
    simularInstante(null);
    // a próxima semana fica pronta para a nutricionista gerar as propostas
    criarOfertas(vale, somarDias(semanaAtual, 7), vale.produtores.length);
    criarOfertas(serra, somarDias(semanaAtual, 7), serra.produtores.length);

    // compras da agricultura familiar anteriores à plataforma, declaradas pelo município, até o mês em que a operação começou
    const previas = (m: Municipio, repasse: number, semanas: number, faixa: [number, number], julho?: number) => {
      const desde = somarDias(semanaAtual, -7 * (semanas - 1));
      const mesInicio = desde.startsWith(String(exercicio)) ? Number(desde.slice(5, 7)) : 1;
      for (let mes = 2; mes < mesInicio; mes++)
        inserir('aquisicoes_previas', { municipio_id: m.id, mes: `${exercicio}-${String(mes).padStart(2, '0')}`, valor: arred(repasse * (julho && mes === 7 ? julho : entre(faixa[0], faixa[1])), 2) });
    };
    previas(vale, T.repasse, RAMPA_VALE.length, [0.012, 0.02], 0.005);
    // Serra do Buriti comprava pouco da agricultura familiar antes de entrar: o painel mostra o risco de fechar abaixo do piso
    previas(serra, T2.repasse, RAMPA_SERRA.length, [0.015, 0.022]);

    registrar(SISTEMA, null, 'Sandbox carregado com dados sintéticos', null, null, { semana_atual: semanaAtual }, 'admin');
  });
  simularInstante(null);

  const conta = (t: string) => um<any>(`SELECT COUNT(*) AS n FROM ${t}`).n as number;
  return { ms: Date.now() - inicio, municipios: conta('municipios'), agricultores: conta('agricultores'), ofertas: conta('ofertas'), pedidos: conta('pedidos'), rotas: conta('rotas'), evidencias: conta('evidencias'), liquidacoes: conta('liquidacoes'), trilha: conta('trilha') };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  console.log('Carregando o sandbox…');
  console.log(popular());
}
