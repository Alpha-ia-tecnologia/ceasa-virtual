import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, usarDados, usarSessao, dataBr, dataHoraBr } from '../api';
import { Aviso, Cabecalho, Estado, Indicador, Modal, Painel, Vazio, usarAcao } from '../componentes/ui';
import { STATUS_LIQUIDACAO, pode, reais } from '../../compartilhado/dominio';

const TOM: Record<string, string> = { pendente: 'atencao', bloqueada: 'erro', paga: 'ok', falhou: 'erro' };

export function Pagamentos() {
  const { sessao } = usarSessao();
  const { dados, erro, carregando, recarregar } = usarDados<any[]>('/liquidacoes');
  const [detalhe, setDetalhe] = useState<any>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const { ocupado, erro: erroAcao, executar } = usarAcao();
  const paga = pode(sessao.usuario.perfil, 'pagamentos.executar');
  const soma = (st: string[], f: (l: any) => number) => (dados ?? []).filter((l) => st.includes(l.status)).reduce((s, l) => s + f(l), 0);
  const total = (l: any) => l.valor_alimento + l.valor_frete;
  const prontas = (dados ?? []).filter((l) => l.status === 'pendente');

  const pagar = (id: number) => executar(async () => { await api(`/liquidacoes/${id}/pagar`, { metodo: 'POST' }); setAviso(null); await recarregar(); });
  const lote = () => executar(async () => { const r = await api<any>('/liquidacoes/lote', { metodo: 'POST' }); setAviso(`Lote ${r.lote}: ${r.pagos} pagamento(s) executado(s)${r.falhas ? ` e ${r.falhas} com falha` : ''}.`); await recarregar(); });

  return (
    <>
      <Cabecalho titulo="Pagamentos" acoes={paga && prontas.length > 1 && <button className="botao" onClick={lote} disabled={ocupado}>Pagar as {prontas.length} prontas em um lote</button>}>
        Cada entrega validada é paga em três partes: o alimento vai para a conta do agricultor, o frete para o prestador e o ISS do frete fica retido para o município. Sem entrega validada, não há pagamento.
      </Cabecalho>
      <Estado carregando={carregando} erro={erro}>
        {dados && (
          <div className="pilha">
            {sessao.sandbox && <Aviso tipo="neutro">No ambiente de simulação os pagamentos são fictícios: nenhuma instituição financeira é acionada e nenhum recurso é movimentado.</Aviso>}
            {erroAcao && <Aviso tipo="erro">{erroAcao}</Aviso>}
            {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
            <Painel>
              <div className="grade g4">
                <Indicador valor={reais(soma(['pendente', 'falhou'], total))} rotulo="Pronto para pagar" nota={`${prontas.length} entrega(s) validada(s)`} />
                <Indicador valor={reais(soma(['paga'], (l) => l.valor_alimento))} rotulo="Pago a agricultores" />
                <Indicador valor={reais(soma(['paga'], (l) => l.liquido_prestador))} rotulo="Pago a prestadores de frete" nota={`ISS retido: ${reais(soma(['paga'], (l) => l.iss))}`} />
                <Indicador valor={reais(soma(['bloqueada'], total))} rotulo="Bloqueado" nota="Conta que não está em nome do agricultor" />
              </div>
            </Painel>
            {dados.length ? (
              <div className="tabela-rolagem">
                <table>
                  <thead><tr><th>Entrega</th><th>Agricultor</th><th className="dir">Alimento</th><th>Prestador</th><th className="dir">Frete líquido</th><th className="dir">ISS retido</th><th className="dir">Total</th><th>Situação</th><th /></tr></thead>
                  <tbody>
                    {dados.map((l) => (
                      <tr key={l.id}>
                        <td><Link to={`/entregas/${l.pedido_id}`}>Pedido {l.pedido_id}</Link><div className="pequeno suave">{dataBr(l.data_entrega)}, {l.escola}</div></td>
                        <td>{l.agricultor}</td><td className="dir">{reais(l.valor_alimento)}</td><td>{l.prestador ?? '—'}</td><td className="dir">{reais(l.liquido_prestador)}</td><td className="dir">{reais(l.iss)}</td><td className="dir"><strong>{reais(total(l))}</strong></td>
                        <td><span className={`selo ${TOM[l.status]}`} title={l.motivo ?? undefined}>{STATUS_LIQUIDACAO[l.status as keyof typeof STATUS_LIQUIDACAO]}</span>{l.motivo && <div className="pequeno suave" style={{ maxWidth: 220 }}>{l.motivo}</div>}</td>
                        <td className="dir">
                          {paga && ['pendente', 'falhou'].includes(l.status) && <button className="botao texto" disabled={ocupado} onClick={() => pagar(l.id)}>{l.status === 'falhou' ? 'Reprocessar' : 'Pagar'}</button>}
                          {l.status === 'paga' && <button className="botao texto" onClick={() => setDetalhe(l)}>Comprovantes</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Painel><Vazio titulo="Nenhuma liquidação ainda">As liquidações aparecem quando as entregas são validadas.</Vazio></Painel>}
          </div>
        )}
      </Estado>
      {detalhe && (
        <Modal titulo={`Comprovantes — pedido ${detalhe.pedido_id}`} onFechar={() => setDetalhe(null)}>
          <p className="suave">Pago em {dataHoraBr(detalhe.pago_em)}{detalhe.lote ? `, no ${detalhe.lote}` : ''}.</p>
          <div className="tabela-rolagem" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Favorecido</th><th>Referente a</th><th className="dir">Valor</th><th>Identificador</th></tr></thead>
              <tbody>{detalhe.comprovantes.map((c: any) => <tr key={c.id}><td>{c.favorecido}</td><td className="pequeno">{c.descricao}</td><td className="dir">{reais(c.valor)}</td><td className="hash">{c.id}</td></tr>)}</tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}
