import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { api, usarDados, usarSessao, dataBr, dataHoraBr, diaDaSemana, numero } from '../api';
import { Abas, Aviso, Cabecalho, Campo, Estado, Painel, Percurso, SeloPedido, Vazio, usarAcao } from '../componentes/ui';
import { MODAIS, NOTA_SELO, STATUS_LIQUIDACAO, kg, pode, reais, type Modal } from '../../compartilhado/dominio';

type Aba = 'andamento' | 'divergencias' | 'todas';

export function Entregas() {
  const [params, setParams] = useSearchParams();
  const aba = (params.get('aba') as Aba) || 'andamento';
  const navegar = useNavigate();
  const { dados, erro, carregando } = usarDados<any[]>('/pedidos');
  const filtros: Record<Aba, (p: any) => boolean> = { andamento: (p) => ['gerado', 'roteirizado', 'coletado', 'validado'].includes(p.status), divergencias: (p) => p.status === 'divergencia', todas: () => true };
  const lista = (dados ?? []).filter(filtros[aba]);
  const conta = (a: Aba) => (dados ?? []).filter(filtros[a]).length;

  return (
    <>
      <Cabecalho titulo="Entregas e evidências">
        Cada pedido é o que um agricultor entrega a uma escola numa data. A entrega só é validada com a foto na plantação e a conferência na escola; divergências bloqueiam o pagamento até a decisão do controle interno.
      </Cabecalho>
      <Abas ativa={aba} onMudar={(a) => setParams(a === 'andamento' ? {} : { aba: a })} abas={[{ id: 'andamento', rotulo: 'Em andamento', conta: conta('andamento') }, { id: 'divergencias', rotulo: 'Divergências', conta: conta('divergencias') }, { id: 'todas', rotulo: 'Todas' }]} />
      <Estado carregando={carregando} erro={erro}>
        {dados && (lista.length ? (
          <div className="tabela-rolagem">
            <table>
              <thead><tr><th>Pedido</th><th>Entrega</th><th>Agricultor</th><th>Escola</th><th>Prestador</th><th className="dir">Peso</th><th className="dir">Valor</th><th>Situação</th></tr></thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className="clicavel" onClick={() => navegar(`/entregas/${p.id}`)}>
                    <td><Link to={`/entregas/${p.id}`} onClick={(e) => e.stopPropagation()}>{p.id}</Link></td><td>{diaDaSemana(p.data_entrega)}, {dataBr(p.data_entrega)}</td><td>{p.agricultor}</td><td>{p.escola}</td>
                    <td className="pequeno">{p.prestador ?? <span className="suave">Sem rota</span>}</td><td className="dir">{kg(p.kg)}</td><td className="dir">{reais(p.valor)}</td><td><SeloPedido status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Painel><Vazio titulo={aba === 'divergencias' ? 'Nenhuma divergência em aberto' : 'Nenhuma entrega aqui'}>{aba === 'andamento' && 'Os pedidos aparecem quando um cardápio aprovado gera compras.'}</Vazio></Painel>)}
      </Estado>
    </>
  );
}

const ETAPAS_EVIDENCIA = [
  { ponto: 'origem', papel: 'agricultor', rotulo: 'Coleta na plantação', quem: 'agricultor' },
  { ponto: 'destino', papel: 'prestador', rotulo: 'Chegada à escola', quem: 'prestador de frete' },
  { ponto: 'destino', papel: 'escola', rotulo: 'Recebimento na escola', quem: 'direção da escola' },
] as const;

export function EntregaDetalhe() {
  const { id } = useParams();
  const { sessao } = usarSessao();
  const { dados: p, erro, carregando, recarregar } = usarDados<any>(`/pedidos/${id}`);
  const [variante, setVariante] = useState('normal');
  const { ocupado, erro: erroAcao, executar } = usarAcao();
  const perfil = sessao.usuario.perfil;
  const simulavel = sessao.sandbox && pode(perfil, 'sandbox.operar') && p && ['roteirizado', 'coletado'].includes(p.status);
  const ev = (ponto: string, papel: string) => p?.evidencias.find((e: any) => e.ponto === ponto && e.papel === papel && !e.substituida);
  const qtd = (lista: any[] | undefined, itemId: number) => lista?.find((x) => x.pedido_item_id === itemId)?.kg;
  const v = p?.validacao;

  return (
    <Estado carregando={carregando} erro={erro}>
      {p && (
        <>
          <Cabecalho titulo={`Pedido ${p.id}`}>
            {p.agricultor} entrega a {p.escola} em {diaDaSemana(p.data_entrega)}, {dataBr(p.data_entrega)}. <Link to="/entregas">Voltar às entregas</Link>
          </Cabecalho>
          <div className="pilha">
            <Painel>
              <div className="linha-flex" style={{ marginBottom: 16 }}><SeloPedido status={p.status} />{v?.selo ? <span className="selo cheio liso">Selo de qualidade e segurança</span> : null}</div>
              <Percurso status={p.status} />
            </Painel>
            {erroAcao && <Aviso tipo="erro">{erroAcao}</Aviso>}
            {simulavel && (
              <Painel titulo="Simulação de campo">
                <p className="suave" style={{ maxWidth: '75ch' }}>Registra a próxima evidência com imagem sintética, posição e horário planejados. Na operação real, cada etapa é feita pelo agricultor, pelo prestador e pela escola nos seus aparelhos.</p>
                <div className="linha-flex" style={{ marginTop: 12 }}>
                  <select className="entrada" style={{ width: 'auto' }} value={variante} onChange={(e) => setVariante(e.target.value)} aria-label="Situação a simular no recebimento">
                    <option value="normal">Entrega sem problemas</option><option value="quantidade_menor">Escola recebe menos que o pedido</option><option value="qualidade">Item chega com problema de qualidade</option><option value="foto_repetida">Foto reaproveitada da coleta</option><option value="fora_do_raio">Registro longe da escola</option>
                  </select>
                  <button className="botao" disabled={ocupado} onClick={() => executar(async () => { await api(`/sandbox/avancar/${p.id}`, { corpo: { variante } }); await recarregar(); })}>
                    Simular: {p.pendencias.origem ? 'coleta na plantação' : p.pendencias.destino_prestador ? 'chegada do prestador' : 'recebimento na escola'}
                  </button>
                </div>
              </Painel>
            )}
            {p.status === 'gerado' && <Aviso>Este pedido ainda não tem rota. <Link to="/rotas">Planejar as rotas de {dataBr(p.data_entrega)}</Link>.</Aviso>}

            <div className="grade g-lado">
              <Painel titulo="Itens">
                <div className="tabela-rolagem">
                  <table>
                    <thead><tr><th>Alimento</th><th className="dir">Pedido</th><th className="dir">Saiu da plantação</th><th className="dir">Chegou à escola</th><th className="dir">Aceito</th><th className="dir">Pago por kg</th></tr></thead>
                    <tbody>
                      {p.itens.map((i: any) => (
                        <tr key={i.id}>
                          <td><strong>{i.alimento}</strong>{i.armazenamento === 'refrigerado' && <div className="pequeno suave">Refrigerado</div>}</td>
                          <td className="dir">{kg(i.quantidade_kg)}</td><td className="dir">{numero(qtd(ev('origem', 'agricultor')?.itens, i.id))}</td><td className="dir">{numero(qtd(ev('destino', 'escola')?.itens, i.id))}</td>
                          <td className="dir">{i.aceito_kg == null ? '—' : <strong>{kg(i.aceito_kg)}</strong>}</td><td className="dir" title={`Alimento ${reais(i.preco_kg)} + frete ${reais(i.frete_kg)}`}>{reais(i.preco_kg + i.frete_kg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="pequeno suave" style={{ marginTop: 10 }}>Coleta das {p.coleta_inicio} às {p.coleta_fim} em {p.area}. Valor do pedido: {reais(p.valor)}.</p>
              </Painel>
              <Painel titulo="Transporte">
                {p.rotas.length ? p.rotas.map((r: any) => (
                  <p key={r.id} style={{ marginBottom: 8 }}><strong>{r.prestador}</strong><br /><span className="pequeno suave">{MODAIS[r.modal as Modal].rotulo}, viagem {r.viagem}, das {r.inicio} às {r.fim}. Leva {kg(r.kg)}. Custo de referência: {reais(r.custo_referencia)}.{r.prestador_agricultor_id === p.agricultor_id ? ' O agricultor entrega a própria produção.' : ''}</span></p>
                )) : <p className="suave">Sem rota definida.</p>}
                {p.liquidacao && (
                  <>
                    <h3 style={{ margin: '14px 0 8px' }}>Pagamento dividido <span className={`selo ${p.liquidacao.status === 'paga' ? 'ok' : p.liquidacao.status === 'pendente' ? 'atencao' : 'erro'}`}>{STATUS_LIQUIDACAO[p.liquidacao.status as keyof typeof STATUS_LIQUIDACAO]}</span></h3>
                    <div className="barra" style={{ height: 14 }} role="img" aria-label="Divisão do pagamento entre agricultor, prestador e ISS">
                      <i style={{ flex: p.liquidacao.valor_alimento }} /><i className="cultivo" style={{ flex: p.liquidacao.liquido_prestador }} /><i className="ocre" style={{ flex: p.liquidacao.iss }} />
                    </div>
                    <div className="legenda">
                      <span><i style={{ background: 'var(--verde)' }} />Agricultor: {reais(p.liquidacao.valor_alimento)}</span>
                      <span><i style={{ background: 'var(--cultivo)' }} />Prestador: {reais(p.liquidacao.liquido_prestador)}</span>
                      <span><i style={{ background: 'var(--ocre)' }} />ISS retido: {reais(p.liquidacao.iss)}</span>
                    </div>
                    {p.liquidacao.motivo && <p className="pequeno" style={{ marginTop: 8, color: 'var(--perigo)' }}>{p.liquidacao.motivo}</p>}
                  </>
                )}
              </Painel>
            </div>

            <Painel titulo="Evidências">
              <div className="grade g3">
                {ETAPAS_EVIDENCIA.map((etapa) => {
                  const e = ev(etapa.ponto, etapa.papel);
                  return (
                    <div key={etapa.papel}>
                      <h3 style={{ marginBottom: 8 }}>{etapa.rotulo}</h3>
                      {e ? (
                        <div className="evid">
                          <a href={`/api/evidencias/${e.id}/foto`} target="_blank" rel="noreferrer"><img src={`/api/evidencias/${e.id}/foto`} alt={`Foto: ${etapa.rotulo}`} loading="lazy" /></a>
                          <div className="pequeno">
                            <strong>{e.autor_nome}</strong><br />{dataHoraBr(e.registrado_em)}<br />
                            <span className="suave num">{e.lat?.toFixed(5)}, {e.lng?.toFixed(5)}</span>
                            {e.km != null && <><br />Quilometragem: {numero(e.km)} km</>}
                            {e.observacao && <><br />“{e.observacao}”</>}
                            {e.simulada ? <><br /><span className="selo liso atencao">Posição e horário simulados</span></> : null}
                          </div>
                        </div>
                      ) : <p className="suave">Aguardando registro pelo {etapa.quem}.</p>}
                    </div>
                  );
                })}
              </div>
              {p.evidencias.some((e: any) => e.substituida) && <p className="pequeno suave" style={{ marginTop: 12 }}>{p.evidencias.filter((e: any) => e.substituida).length} evidência(s) anterior(es) foram substituídas a pedido do controle interno e continuam guardadas.</p>}
            </Painel>

            {v && (
              <div className="grade g2">
                <Painel titulo={v.resultado === 'validada' ? 'Entrega validada' : 'Divergência na validação'}>
                  <Checagem ok={v.visao.ok} titulo="Conferência da carga" detalhe={v.visao.ok ? 'Quantidades compatíveis com o pedido e sem apontamento de qualidade' : v.visao.itens.filter((i: any) => !i.compativel || i.deterioracao).map((i: any) => `${i.alimento}: pedido ${i.pedido_kg} kg, saiu ${i.origem_kg} kg, chegou ${i.recebido_kg} kg${i.deterioracao ? ', com problema de qualidade' : ''}`).join('; ')} />
                  <Checagem ok={v.integridade.foto_inedita.ok} titulo="Foto inédita" detalhe={v.integridade.foto_inedita.detalhe} />
                  <Checagem ok={v.integridade.posicao.ok} titulo="Posição dentro do raio" detalhe={v.integridade.posicao.detalhe} />
                  <Checagem ok={v.integridade.horario.ok} titulo="Horário dentro da janela" detalhe={v.integridade.horario.detalhe} />
                  <p className="pequeno suave" style={{ marginTop: 10 }}>Nesta fase a análise da imagem por visão computacional é simulada: a conferência usa as quantidades declaradas na origem e no destino e a avaliação de quem recebeu.</p>
                  {v.resolucao && <div style={{ marginTop: 12 }}><Aviso tipo="neutro"><strong>{v.resolucao}</strong><br />Por {v.resolvido_por}, em {dataHoraBr(v.resolvido_em)}.</Aviso></div>}
                </Painel>
                <Painel titulo={`Checklist ambiental e sanitário: ${numero(v.pontuacao, 0)} de 100`}>
                  {v.esg.itens.map((c: any) => <Checagem key={c.id} ok={c.ok} titulo={c.rotulo} detalhe={`${c.peso} pontos`} />)}
                  <p className="pequeno suave" style={{ marginTop: 10 }}>O selo de qualidade e segurança exige entrega validada e pelo menos {NOTA_SELO} pontos.</p>
                </Painel>
              </div>
            )}

            {p.status === 'divergencia' && (pode(perfil, 'divergencia.resolver') ? <Resolver p={p} onResolver={recarregar} /> : <Aviso>A decisão sobre esta divergência cabe ao controle interno. O pagamento fica bloqueado até lá.</Aviso>)}

            {p.trilha.length > 0 && (
              <Painel titulo="Trilha deste pedido">
                <div className="tabela-rolagem">
                  <table>
                    <thead><tr><th>Quando</th><th>Quem</th><th>O que aconteceu</th><th>Registro</th></tr></thead>
                    <tbody>{p.trilha.map((t: any) => <tr key={t.seq}><td>{dataHoraBr(t.em)}</td><td>{t.usuario_nome}</td><td>{t.acao}</td><td className="hash" title={t.hash}>#{t.seq} {t.hash.slice(0, 12)}…</td></tr>)}</tbody>
                  </table>
                </div>
              </Painel>
            )}
          </div>
        </>
      )}
    </Estado>
  );
}

function Checagem({ ok, titulo, detalhe }: { ok: boolean; titulo: string; detalhe?: string }) {
  return (
    <div className={`checagem ${ok ? 'ok' : 'falha'}`}>
      {ok ? <CheckCircle2 size={18} aria-label="Conforme" /> : <XCircle size={18} aria-label="Não conforme" />}
      <div><strong>{titulo}</strong>{detalhe && <div className="pequeno suave">{detalhe}</div>}</div>
    </div>
  );
}

/** Decisão do controle interno sobre a divergência [RF-AUD-05]. */
function Resolver({ p, onResolver }: { p: any; onResolver: () => void }) {
  const recebido = p.evidencias.find((e: any) => e.papel === 'escola' && !e.substituida)?.itens ?? [];
  const [decisao, setDecisao] = useState<'aceitar' | 'recusar' | 'nova_evidencia'>('aceitar');
  const [motivo, setMotivo] = useState('');
  const [refazer, setRefazer] = useState('destino/escola');
  const [itens, setItens] = useState<any[]>(p.itens.map((i: any) => {
    const r = recebido.find((x: any) => x.pedido_item_id === i.id);
    return { pedido_item_id: i.id, aceito_kg: Math.min(i.quantidade_kg, r?.qualidade === 'nao_conforme' ? 0 : r?.kg ?? 0) };
  }));
  const { ocupado, erro, executar } = usarAcao();
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    const [ponto, papel] = refazer.split('/');
    executar(async () => { await api(`/pedidos/${p.id}/resolver`, { corpo: { decisao, motivo, itens, ponto, papel } }); onResolver(); });
  };
  return (
    <Painel titulo="Decidir a divergência">
      <form className="pilha" style={{ gap: 14 }} onSubmit={enviar}>
        <div className="opcoes" role="radiogroup" aria-label="Decisão">
          {([['aceitar', 'Aceitar, total ou em parte'], ['nova_evidencia', 'Pedir nova evidência'], ['recusar', 'Recusar a entrega']] as const).map(([k, r]) => (
            <button type="button" key={k} role="radio" aria-checked={decisao === k} className={`opcao ${decisao === k ? 'ligada' : ''}`} onClick={() => setDecisao(k)}>{r}</button>
          ))}
        </div>
        {decisao === 'aceitar' && (
          <div className="tabela-rolagem">
            <table>
              <thead><tr><th>Alimento</th><th className="dir">Pedido</th><th className="dir">Chegou</th><th>Qualidade apontada</th><th className="dir">Aceitar (kg)</th></tr></thead>
              <tbody>
                {p.itens.map((i: any) => {
                  const r = recebido.find((x: any) => x.pedido_item_id === i.id);
                  const a = itens.find((x) => x.pedido_item_id === i.id);
                  return (
                    <tr key={i.id}>
                      <td>{i.alimento}</td><td className="dir">{kg(i.quantidade_kg)}</td><td className="dir">{numero(r?.kg)}</td>
                      <td>{{ conforme: 'Em bom estado', parcial: 'Parte com problema', nao_conforme: 'Sem condição de uso' }[r?.qualidade as 'conforme'] ?? '—'}</td>
                      <td className="dir"><input className="entrada curta" type="number" min="0" max={i.quantidade_kg} step="any" value={a.aceito_kg} onChange={(e) => setItens(itens.map((x) => (x.pedido_item_id === i.id ? { ...x, aceito_kg: e.target.value } : x)))} aria-label={`Quilos aceitos de ${i.alimento}`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {decisao === 'nova_evidencia' && (
          <Campo rotulo="Qual registro deve ser refeito">
            <select value={refazer} onChange={(e) => setRefazer(e.target.value)}><option value="destino/escola">Recebimento na escola</option><option value="destino/prestador">Chegada do prestador</option><option value="origem/agricultor">Coleta na plantação</option></select>
          </Campo>
        )}
        {decisao === 'recusar' && <Aviso>A recusa total encerra o pedido sem pagamento e devolve a quantidade ao saldo da oferta.</Aviso>}
        <Campo rotulo="Motivo da decisão" ajuda="Fica registrado na trilha de auditoria com o seu nome."><textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} required /></Campo>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div><button className="botao" disabled={ocupado}>Registrar decisão</button></div>
      </form>
    </Painel>
  );
}
