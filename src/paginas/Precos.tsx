import { useState } from 'react';
import { Printer } from 'lucide-react';
import { api, usarDados, usarSessao, dataBr, dataHoraBr } from '../api';
import { Abas, Aviso, Cabecalho, Campo, Estado, Modal, Painel, usarAcao } from '../componentes/ui';
import { pode, reais } from '../../compartilhado/dominio';

export function Precos() {
  const { sessao } = usarSessao();
  const { dados, erro, carregando, recarregar } = usarDados<any>('/precos');
  const [aba, setAba] = useState<'precos' | 'historico' | 'edital'>('precos');
  const [edicao, setEdicao] = useState<any>(null);
  const define = pode(sessao.usuario.perfil, 'precos.definir');

  return (
    <>
      <Cabecalho titulo="Preços e edital" acoes={aba === 'edital' && <button className="botao secundario" onClick={() => window.print()}><Printer size={18} aria-hidden /> Imprimir ou salvar em PDF</button>}>
        O preço do alimento e do frete é definido pelo gestor público. A plataforma registra quem lançou cada valor e mostra o custo de referência do frete apenas como subsídio.
      </Cabecalho>
      <div className="nao-imprimir">
        <Abas ativa={aba} onMudar={setAba} abas={[{ id: 'precos', rotulo: 'Preços vigentes' }, { id: 'historico', rotulo: 'Histórico de lançamentos' }, { id: 'edital', rotulo: 'Minuta de edital' }]} />
      </div>
      <Estado carregando={carregando} erro={erro}>
        {dados && aba === 'precos' && (
          <div className="pilha">
            {!define && <Aviso tipo="neutro">Só o prefeito e a Secretaria de Educação lançam preços. A responsabilidade pelos valores é da prefeitura e de suas secretarias.</Aviso>}
            <div className="tabela-rolagem">
              <table>
                <thead><tr><th>Alimento</th><th className="dir">Alimento</th><th className="dir">Frete</th><th className="dir">Pago por kg</th><th className="dir">Frete de referência</th><th>Lançado por</th><th>Fundamento</th><th /></tr></thead>
                <tbody>
                  {dados.itens.map((p: any) => (
                    <tr key={p.alimento_id}>
                      <td><strong>{p.alimento}</strong></td>
                      <td className="dir">{p.preco_kg == null ? <span className="selo atencao">Sem preço</span> : reais(p.preco_kg)}</td>
                      <td className="dir">{p.frete_kg == null ? '—' : reais(p.frete_kg)}</td>
                      <td className="dir"><strong>{p.preco_kg == null ? '—' : reais(p.preco_kg + p.frete_kg)}</strong></td>
                      <td className="dir suave" title="Média do custo de referência nas rotas já planejadas: distância de ida e volta × índice do tipo de via">{p.frete_referencia_kg == null ? '—' : reais(p.frete_referencia_kg)}</td>
                      <td className="pequeno">{p.servidor_nome ?? '—'}{p.criado_em && <div className="suave">{dataBr(p.criado_em)}</div>}</td>
                      <td className="pequeno">{p.fundamento ?? '—'}</td>
                      <td className="dir">{define && <button className="botao texto" onClick={() => setEdicao(p)}>{p.preco_kg == null ? 'Definir' : 'Alterar'}</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="pequeno suave">O frete de referência é um subsídio calculado pela plataforma e nunca substitui o valor do gestor. Alimento sem preço não entra em pedido.</p>
          </div>
        )}
        {dados && aba === 'historico' && (
          <div className="tabela-rolagem">
            <table>
              <thead><tr><th>Quando</th><th>Alimento</th><th className="dir">Alimento</th><th className="dir">Frete</th><th>Servidor que lançou</th><th>Fundamento</th><th>Situação</th></tr></thead>
              <tbody>
                {dados.historico.map((p: any) => (
                  <tr key={p.id}><td>{dataHoraBr(p.criado_em)}</td><td>{p.alimento}</td><td className="dir">{reais(p.preco_kg)}</td><td className="dir">{reais(p.frete_kg)}</td><td>{p.servidor_nome}</td><td className="pequeno">{p.fundamento}</td><td><span className={`selo ${p.vigente ? 'ok' : ''}`}>{p.vigente ? 'Vigente' : 'Substituído'}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {aba === 'edital' && <Edital />}
      </Estado>
      {edicao && <DefinirPreco p={edicao} onFechar={(s) => (setEdicao(null), s && recarregar())} />}
    </>
  );
}

function DefinirPreco({ p, onFechar }: { p: any; onFechar: (salvou?: boolean) => void }) {
  const { sessao } = usarSessao();
  const [f, setF] = useState({ preco_kg: p.preco_kg ?? '', frete_kg: p.frete_kg ?? '', fundamento: '' });
  const { ocupado, erro, executar } = usarAcao();
  return (
    <Modal titulo={`Preço de referência — ${p.alimento}`} onFechar={() => onFechar()}>
      <form onSubmit={(e) => { e.preventDefault(); executar(async () => { await api('/precos', { corpo: { alimento_id: p.alimento_id, ...f } }); onFechar(true); }); }}>
        <div className="form">
          <Campo rotulo="Preço do alimento (R$ por kg)"><input type="number" min="0.01" step="0.01" value={f.preco_kg} onChange={(e) => setF({ ...f, preco_kg: e.target.value })} required /></Campo>
          <Campo rotulo="Frete (R$ por kg)" ajuda={p.frete_referencia_kg != null ? `Subsídio: o custo de referência nas rotas planejadas foi de ${reais(p.frete_referencia_kg)} por kg.` : 'Ainda não há rotas planejadas para calcular o custo de referência.'}><input type="number" min="0" step="0.01" value={f.frete_kg} onChange={(e) => setF({ ...f, frete_kg: e.target.value })} required /></Campo>
          <Campo rotulo="Fundamento do preço" largo ajuda="Ex.: pesquisa de preços local, ata do conselho, tabela de referência."><textarea value={f.fundamento} onChange={(e) => setF({ ...f, fundamento: e.target.value })} required /></Campo>
        </div>
        <div style={{ marginTop: 14 }}><Aviso tipo="neutro">O lançamento fica registrado em nome de {sessao.usuario.nome}, com data e hora.</Aviso></div>
        {erro && <div style={{ marginTop: 14 }}><Aviso tipo="erro">{erro}</Aviso></div>}
        <div className="modal-pe"><button type="button" className="botao secundario" onClick={() => onFechar()}>Cancelar</button><button className="botao" disabled={ocupado}>Lançar preço</button></div>
      </form>
    </Modal>
  );
}

function Edital() {
  const { dados: e, erro, carregando } = usarDados<any>('/edital');
  return (
    <Estado carregando={carregando} erro={erro}>
      {e && (
        <Painel>
          <article className="edital">
            <div className="nao-imprimir" style={{ marginBottom: 16 }}><Aviso>{e.aviso}</Aviso></div>
            <img src="/marca/logo-compacta.png" alt="CEASA VIRTUAL" style={{ width: 180 }} />
            <h2 style={{ marginTop: 16, fontSize: '1.4rem' }}>{e.titulo}</h2>
            <p className="suave">{e.municipio} — {e.entidade}. Exercício de {e.exercicio}. Minuta gerada em {dataBr(e.gerado_em)}.</p>
            {e.clausulas.map((c: any) => <section key={c.titulo}><h3>{c.titulo}</h3><p>{c.texto}</p></section>)}
            <h3>Anexo I — Preços definidos pelo gestor</h3>
            <div className="tabela-rolagem" style={{ marginTop: 8 }}>
              <table>
                <thead><tr><th>Gênero</th><th className="dir">Alimento (R$/kg)</th><th className="dir">Frete (R$/kg)</th><th className="dir">Total (R$/kg)</th><th>Servidor responsável</th><th>Data</th></tr></thead>
                <tbody>{e.anexo_precos.map((p: any) => <tr key={p.alimento}><td>{p.alimento}</td><td className="dir">{reais(p.preco_kg)}</td><td className="dir">{reais(p.frete_kg)}</td><td className="dir">{reais(p.total_kg)}</td><td>{p.servidor_nome}</td><td>{dataBr(p.criado_em)}</td></tr>)}</tbody>
              </table>
            </div>
            <h3>Anexo II — Unidades de entrega</h3>
            <ul>{e.anexo_escolas.map((x: any) => <li key={x.nome}>{x.nome} — {x.endereco}</li>)}</ul>
          </article>
        </Painel>
      )}
    </Estado>
  );
}
