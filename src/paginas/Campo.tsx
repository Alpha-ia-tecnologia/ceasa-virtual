import { useState } from 'react';
import { ArrowLeft, Banknote, Ear, LogOut, PackageCheck, Route as IconeRota, Sprout } from 'lucide-react';
import { usarDados, usarSessao, dataBr, diaDaSemana, somarDias } from '../api';
import { Aviso, Estado, SeloPedido, Vazio } from '../componentes/ui';
import { FormEvidencia } from '../componentes/Evidencia';
import { FormEscuta } from '../componentes/Escuta';
import { NovaOferta } from './Ofertas';
import { Mapa, usarTrajetos } from '../componentes/Mapa';
import { ControlesSimulacao, usarSimulacao } from '../componentes/Simulacao';
import { MODAIS, PERFIS, STATUS_LIQUIDACAO, kg, reais, type Modal } from '../../compartilhado/dominio';

// Telas de quem está no campo: agricultor, prestador de frete e direção da escola.
// Pensadas para o celular: uma tarefa por vez, botões grandes e palavras do dia a dia.

type Acao = { pedidoId: number; ponto: 'origem' | 'destino'; papel: 'agricultor' | 'prestador' | 'escola'; titulo: string };
type Aba = 'entregas' | 'ofertas' | 'escuta' | 'pagamentos';

export function Campo() {
  const { sessao, sair } = usarSessao();
  const perfil = sessao.usuario.perfil;
  const [aba, setAba] = useState<Aba>('entregas');
  const [acao, setAcao] = useState<Acao | null>(null);
  const [resultado, setResultado] = useState<any>(null);
  const pedidos = usarDados<any[]>(`/pedidos?desde=${somarDias(sessao.hoje, -6)}`);
  const abas: { id: Aba; rotulo: string; Icone: typeof Sprout }[] =
    perfil === 'agricultor'
      ? [{ id: 'entregas', rotulo: 'Entregas', Icone: PackageCheck }, { id: 'ofertas', rotulo: 'Ofertas', Icone: Sprout }, { id: 'escuta', rotulo: 'O que plantar', Icone: Ear }, { id: 'pagamentos', rotulo: 'Pagamentos', Icone: Banknote }]
      : perfil === 'prestador'
        ? [{ id: 'entregas', rotulo: 'Corridas', Icone: IconeRota }, { id: 'pagamentos', rotulo: 'Pagamentos', Icone: Banknote }]
        : [{ id: 'entregas', rotulo: 'Recebimentos', Icone: PackageCheck }];

  const concluir = (r: any) => {
    setResultado(r);
    setAcao(null);
    pedidos.recarregar();
  };

  return (
    <div className="campo-casca">
      <header className="campo-topo">
        <img src="/marca/logo-compacta.png" alt="CEASA VIRTUAL" />
        <div style={{ flex: 1, lineHeight: 1.25, minWidth: 0 }}>
          <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sessao.vinculo?.nome ?? sessao.usuario.nome}</strong>
          <span className="pequeno suave">{PERFIS[perfil]}</span>
        </div>
        <button className="botao texto" onClick={sair} aria-label="Sair"><LogOut size={20} /></button>
      </header>

      <main className="campo-conteudo">
        {acao ? (
          <Registrar acao={acao} onVoltar={() => setAcao(null)} onConcluir={concluir} />
        ) : (
          <>
            {sessao.sandbox && aba === 'entregas' && <span className="chip-sim" style={{ alignSelf: 'flex-start' }}>Ambiente de simulação</span>}
            {resultado && aba === 'entregas' && (
              <Aviso tipo={resultado.validacao?.resultado === 'divergencia' ? 'atencao' : 'ok'}>
                {!resultado.validacao ? 'Registro feito. Obrigado!' : resultado.validacao.resultado === 'validada' ? 'Entrega conferida e validada. O pagamento foi liberado para a prefeitura executar.' : `Registro feito. A entrega ficou em análise pelo controle da prefeitura: ${resultado.validacao.motivos.join('; ')}.`}
              </Aviso>
            )}
            {aba === 'entregas' && <Tarefas perfil={perfil} pedidos={pedidos} onAcao={(a) => (setResultado(null), setAcao(a))} />}
            {aba === 'ofertas' && <MinhasOfertas />}
            {aba === 'escuta' && <MinhaEscuta />}
            {aba === 'pagamentos' && <MeusPagamentos perfil={perfil} />}
          </>
        )}
      </main>

      {!acao && abas.length > 1 && (
        <nav className="campo-nav" aria-label="Seções">
          {abas.map(({ id, rotulo, Icone }) => (
            <button key={id} className={aba === id ? 'ativa' : ''} onClick={() => setAba(id)} aria-current={aba === id ? 'page' : undefined}>
              <Icone size={22} aria-hidden /> {rotulo}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function Tarefas({ perfil, pedidos, onAcao }: { perfil: string; pedidos: ReturnType<typeof usarDados<any[]>>; onAcao: (a: Acao) => void }) {
  const { sessao } = usarSessao();
  const rotas = usarDados<any>(perfil === 'prestador' || sessao.prestador_proprio ? `/rotas?desde=${somarDias(sessao.hoje, -1)}` : null);

  const acaoDe = (p: any): Acao | null => {
    const pend = p.pendencias;
    if (perfil === 'agricultor') {
      if (p.status === 'roteirizado' && pend.origem) return { pedidoId: p.id, ponto: 'origem', papel: 'agricultor', titulo: 'Fotografar a carga' };
      if (p.status === 'coletado' && p.entrego_eu && pend.destino_prestador) return { pedidoId: p.id, ponto: 'destino', papel: 'prestador', titulo: 'Registrar a chegada na escola' };
    }
    if (perfil === 'prestador' && p.status === 'coletado' && pend.destino_prestador) return { pedidoId: p.id, ponto: 'destino', papel: 'prestador', titulo: 'Registrar a chegada na escola' };
    if (perfil === 'diretor' && p.status === 'coletado' && pend.destino_escola) return { pedidoId: p.id, ponto: 'destino', papel: 'escola', titulo: 'Conferir e fotografar' };
    return null;
  };
  const espera = (p: any) => {
    if (p.status === 'gerado') return 'A prefeitura ainda vai definir quem busca.';
    if (p.status === 'roteirizado') return perfil === 'agricultor' ? '' : 'Aguardando o agricultor registrar a saída da carga.';
    if (p.status === 'coletado') return perfil === 'diretor' ? '' : p.pendencias.destino_escola ? 'Aguardando a escola conferir.' : 'Aguardando o registro da chegada.';
    return '';
  };
  const lista = [...(pedidos.dados ?? [])].sort((a, b) => Number(!!acaoDe(b)) - Number(!!acaoDe(a)) || a.data_entrega.localeCompare(b.data_entrega));
  const abertas = lista.filter((p) => ['gerado', 'roteirizado', 'coletado', 'divergencia'].includes(p.status));
  const fechadas = lista.filter((p) => !abertas.includes(p)).slice(0, 8);
  const outroLado = (p: any) => (perfil === 'agricultor' ? `Para ${p.escola}` : perfil === 'diretor' ? `De ${p.agricultor}` : `${p.agricultor} → ${p.escola}`);

  return (
    <Estado carregando={pedidos.carregando} erro={pedidos.erro}>
      <h1>{perfil === 'diretor' ? 'Entregas para a escola' : perfil === 'prestador' ? 'Suas corridas' : 'Suas entregas'}</h1>
      {(rotas.dados?.rotas ?? []).filter((r: any) => r.status !== 'concluida').map((r: any) => (
        <div className="tarefa" key={r.id}>
          <h3>Corrida de {diaDaSemana(r.data)}, {dataBr(r.data)}</h3>
          <p className="suave">{MODAIS[r.modal as Modal].rotulo}. Saída às {r.inicio}, término previsto às {r.fim}. {kg(r.carga_kg)}.</p>
          <ol style={{ margin: 0, paddingLeft: 22 }}>
            {r.paradas.map((p: any, i: number) => <li key={i} style={{ padding: '3px 0' }}><strong>{p.chegada}</strong> {p.tipo === 'coleta' ? 'Buscar em' : 'Entregar em'} {p.nome} ({kg(p.kg)})</li>)}
          </ol>
          <MapaCorrida rota={r} />
        </div>
      ))}
      {abertas.length === 0 && <div className="tarefa"><Vazio titulo="Nada pendente por agora">{perfil === 'agricultor' ? 'Quando a prefeitura fizer um pedido, ele aparece aqui.' : 'Novas entregas aparecem aqui.'}</Vazio></div>}
      {abertas.map((p) => {
        const a = acaoDe(p);
        return (
          <div className={`tarefa ${a ? 'urgente' : ''}`} key={p.id}>
            <div className="linha-flex"><h3 style={{ flex: 1 }}>{outroLado(p)}</h3><SeloPedido status={p.status} /></div>
            <p>{diaDaSemana(p.data_entrega)}, {dataBr(p.data_entrega)}. {kg(p.kg)}{p.valor != null ? `, ${reais(p.valor)}` : ''}.{perfil === 'agricultor' && p.prestador && !p.entrego_eu ? ` Quem busca: ${p.prestador}.` : ''}{p.entrego_eu ? ' Você mesmo faz a entrega.' : ''}</p>
            {a ? <button className="botao grande" onClick={() => onAcao(a)}>{a.titulo}</button> : espera(p) && <p className="suave pequeno">{espera(p)}</p>}
            {p.status === 'divergencia' && <p className="pequeno" style={{ color: 'var(--perigo)' }}>A prefeitura está analisando uma diferença nesta entrega.</p>}
          </div>
        );
      })}
      {fechadas.length > 0 && (
        <>
          <h2 style={{ marginTop: 8 }}>Concluídas</h2>
          {fechadas.map((p) => (
            <div className="tarefa" key={p.id} style={{ padding: 12 }}>
              <div className="linha-flex"><span style={{ flex: 1 }}><strong>{outroLado(p)}</strong><br /><span className="pequeno suave">{dataBr(p.data_entrega)}, {kg(p.kg)}</span></span><SeloPedido status={p.status} /></div>
            </div>
          ))}
        </>
      )}
    </Estado>
  );
}

function Registrar({ acao, onVoltar, onConcluir }: { acao: Acao; onVoltar: () => void; onConcluir: (r: any) => void }) {
  const { dados: p, erro, carregando } = usarDados<any>(`/pedidos/${acao.pedidoId}`);
  return (
    <>
      <button className="botao texto" style={{ alignSelf: 'flex-start' }} onClick={onVoltar}><ArrowLeft size={18} aria-hidden /> Voltar</button>
      <Estado carregando={carregando} erro={erro}>
        {p && (
          <div className="tarefa">
            <h1 style={{ fontSize: '1.3rem' }}>{acao.titulo}</h1>
            <p className="suave">{p.agricultor} → {p.escola}, {dataBr(p.data_entrega)}</p>
            <FormEvidencia pedido={p} ponto={acao.ponto} papel={acao.papel} onConcluir={onConcluir} />
          </div>
        )}
      </Estado>
    </>
  );
}

function MinhasOfertas() {
  const { sessao } = usarSessao();
  const { dados, erro, carregando, recarregar } = usarDados<any[]>('/ofertas');
  const [nova, setNova] = useState(false);
  return (
    <>
      <h1>O que você tem para entregar</h1>
      <button className="botao grande" onClick={() => setNova(true)}><Sprout size={22} aria-hidden /> Registrar o que vou colher</button>
      <Estado carregando={carregando} erro={erro}>
        {dados && !dados.length && <div className="tarefa"><Vazio titulo="Nenhuma oferta em aberto">Conte o que vai colher e quando. É assim que a escola fica sabendo.</Vazio></div>}
        {(dados ?? []).map((o) => (
          <div className="tarefa" key={o.id}>
            <div className="linha-flex"><h3 style={{ flex: 1 }}>{o.alimento}</h3><strong>{kg(o.quantidade_kg)}</strong></div>
            <p className="suave">Colheita em {dataBr(o.data_colheita)}. Bom para consumo até {dataBr(o.data_limite)}.</p>
            <div className="barra"><i style={{ width: `${(o.comprometido_kg / o.quantidade_kg) * 100}%` }} /></div>
            <p className="pequeno">{o.comprometido_kg > 0 ? `${kg(o.comprometido_kg)} já pedidos pela prefeitura; ` : ''}{kg(o.saldo_kg)} ainda sem pedido.</p>
          </div>
        ))}
      </Estado>
      {nova && <NovaOferta agricultorFixo={sessao.vinculo!.id} onFechar={(s) => (setNova(false), s && recarregar())} />}
    </>
  );
}

function MinhaEscuta() {
  const { sessao } = usarSessao();
  const { dados: t, erro, carregando, recarregar } = usarDados<any>('/territorio');
  const { dados: alimentos } = usarDados<any[]>('/alimentos');
  const eu = t?.agricultores.find((a: any) => a.id === sessao.vinculo?.id);
  return (
    <>
      <h1>O que você quer plantar</h1>
      <p className="suave">Sua resposta ajuda a prefeitura a planejar a compra e a sugerir o que plantar. Você pode mudar quando quiser.</p>
      <Estado carregando={carregando} erro={erro}>
        {eu && alimentos && <div className="tarefa"><FormEscuta agricultorId={eu.id} escuta={eu.escuta} alimentos={alimentos} onSalvar={recarregar} /></div>}
      </Estado>
    </>
  );
}

function MeusPagamentos({ perfil }: { perfil: string }) {
  const { dados, erro, carregando } = usarDados<any[]>('/liquidacoes');
  const meu = (l: any) => (perfil === 'prestador' ? l.liquido_prestador : l.valor_alimento);
  const recebido = (dados ?? []).filter((l) => l.status === 'paga').reduce((s, l) => s + meu(l), 0);
  const aReceber = (dados ?? []).filter((l) => l.status === 'pendente').reduce((s, l) => s + meu(l), 0);
  return (
    <>
      <h1>Seus pagamentos</h1>
      <Estado carregando={carregando} erro={erro}>
        {dados && (
          <>
            <div className="tarefa">
              <div className="grade g2">
                <div className="indicador"><b>{reais(recebido)}</b><span>Já recebido</span></div>
                <div className="indicador"><b>{reais(aReceber)}</b><span>Entregas validadas, a receber</span></div>
              </div>
              <p className="pequeno suave">{perfil === 'prestador' ? 'Valor do frete já com o ISS descontado.' : 'O pagamento é feito direto na sua conta, depois que a entrega é validada.'}</p>
            </div>
            {dados.some((l) => l.status === 'bloqueada') && <Aviso tipo="erro">Há pagamento bloqueado: a conta cadastrada não está no seu nome. Procure a Secretaria de Agricultura para corrigir o cadastro.</Aviso>}
            {!dados.length && <div className="tarefa"><Vazio titulo="Nenhum pagamento ainda" /></div>}
            {dados.slice(0, 30).map((l) => (
              <div className="tarefa" key={l.id} style={{ padding: 12 }}>
                <div className="linha-flex">
                  <span style={{ flex: 1 }}><strong>{reais(meu(l))}</strong><br /><span className="pequeno suave">{l.escola}, {dataBr(l.data_entrega)}</span></span>
                  <span className={`selo ${l.status === 'paga' ? 'ok' : l.status === 'pendente' ? 'atencao' : 'erro'}`}>{l.status === 'pendente' ? 'A receber' : STATUS_LIQUIDACAO[l.status as keyof typeof STATUS_LIQUIDACAO]}</span>
                </div>
              </div>
            ))}
          </>
        )}
      </Estado>
    </>
  );
}

/** Mapa da corrida pelas estradas, com a simulação do percurso no horário planejado. */
function MapaCorrida({ rota }: { rota: any }) {
  const trajeto = usarTrajetos([rota.id])[rota.id];
  const s = usarSimulacao(rota, trajeto);
  return (
    <div style={{ marginTop: 12 }}>
      <Mapa altura={260} rotas={[{ id: rota.id, cor: '#145C43', paradas: rota.paradas, trajeto }]} veiculo={s.veiculo} />
      <ControlesSimulacao s={s} />
    </div>
  );
}
