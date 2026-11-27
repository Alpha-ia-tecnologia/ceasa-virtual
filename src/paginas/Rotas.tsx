import { useEffect, useState } from 'react';
import { api, usarDados, usarSessao, dataBr, diaDaSemana, numero } from '../api';
import { Abas, Aviso, Cabecalho, Estado, Indicador, Painel, Vazio, usarAcao } from '../componentes/ui';
import { Mapa, LegendaMapa, CORES_ROTA, usarTrajetos, type PontoMapa } from '../componentes/Mapa';
import { ControlesSimulacao, usarSimulacao } from '../componentes/Simulacao';
import { MODAIS, TIPOS_VIA, kg, pct, pode, reais, type Modal } from '../../compartilhado/dominio';

export function Rotas() {
  const { sessao } = usarSessao();
  const { dados: datas, recarregar: recarregarDatas } = usarDados<any[]>('/rotas/datas');
  const { dados: t } = usarDados<any>('/territorio');
  const [data, setData] = useState('');
  const [aba, setAba] = useState<'rotas' | 'cenarios'>('rotas');
  const [foco, setFoco] = useState<number | null>(null);
  const [resultado, setResultado] = useState<any>(null);
  const { dados, erro, carregando, recarregar } = usarDados<any>(data ? `/rotas?data=${data}` : null);
  const { ocupado, erro: erroAcao, executar } = usarAcao();
  const planeja = pode(sessao.usuario.perfil, 'rotas.planejar');
  useEffect(() => { if (!data && datas?.length) setData((datas.find((d) => d.sem_rota > 0) ?? datas[0]).data); }, [datas, data]);
  useEffect(() => { setFoco(null); setResultado(null); }, [data]);

  const infoData = datas?.find((d) => d.data === data);
  const rotas: any[] = dados?.rotas ?? [];
  const visiveis = foco ? rotas.filter((r) => r.id === foco) : rotas;
  const trajetos = usarTrajetos(rotas.map((r) => r.id));
  const rotaFoco = foco ? rotas.find((r) => r.id === foco) ?? null : null;
  const simulacao = usarSimulacao(rotaFoco, rotaFoco ? trajetos[rotaFoco.id] : null);
  const pontos: PontoMapa[] = t
    ? [
        ...t.escolas.map((e: any) => ({ id: `e${e.id}`, tipo: 'escola' as const, lat: e.lat, lng: e.lng, rotulo: e.nome })),
        ...t.agricultores.flatMap((a: any) => a.areas.map((ar: any) => ({ id: `a${ar.id}`, tipo: 'area' as const, lat: ar.lat, lng: ar.lng, rotulo: `${ar.nome} — ${TIPOS_VIA[ar.tipo_via as keyof typeof TIPOS_VIA].rotulo}` }))),
      ]
    : [];
  const planejar = () => executar(async () => { setResultado(await api('/rotas/planejar', { corpo: { data } })); await Promise.all([recarregar(), recarregarDatas()]); });
  const c = dados?.comparativo;

  return (
    <>
      <Cabecalho titulo="Rotas" acoes={planeja && aba === 'rotas' && data && <button className="botao" onClick={planejar} disabled={ocupado}>{infoData?.sem_rota ? `Planejar rotas de ${dataBr(data)}` : 'Replanejar o que ainda não saiu'}</button>}>
        Coleta nas plantações e entrega nas escolas, respeitando a janela de cada escola, a validade dos lotes e a capacidade de cada meio de transporte, da entrega a pé ao carro leve.
      </Cabecalho>
      <Abas ativa={aba} onMudar={setAba} abas={[{ id: 'rotas', rotulo: 'Rotas por data' }, { id: 'cenarios', rotulo: 'Simulação de cenários' }]} />
      {aba === 'cenarios' ? <Cenarios podePlanejar={planeja} /> : (
        <div className="pilha">
          <div className="opcoes">
            {(datas ?? []).map((d) => (
              <button key={d.data} className={`opcao ${d.data === data ? 'ligada' : ''}`} onClick={() => setData(d.data)}>
                {diaDaSemana(d.data)}, {dataBr(d.data).slice(0, 5)} — {d.pedidos} pedidos{d.sem_rota > 0 ? `, ${d.sem_rota} sem rota` : ''}
              </button>
            ))}
          </div>
          {datas && !datas.length && <Painel><Vazio titulo="Ainda não há pedidos">As rotas são planejadas depois que o cardápio aprovado gera pedidos.</Vazio></Painel>}
          {erroAcao && <Aviso tipo="erro">{erroAcao}</Aviso>}
          {resultado && (
            <Aviso tipo={resultado.viavel ? 'ok' : 'atencao'}>
              {resultado.resumo.viagens} viagens planejadas para {resultado.resumo.cargas} pedidos ({kg(resultado.resumo.kg)}).
              {resultado.nao_atendidas.length > 0 && ` ${resultado.nao_atendidas.length} carga(s) ficaram sem rota: ${resultado.nao_atendidas.map((n: any) => `pedido ${n.carga_id} (${n.motivo})`).join('; ')}.`}
            </Aviso>
          )}
          <Estado carregando={carregando} erro={erro}>
            {dados && (rotas.length ? (
              <>
                {c && (
                  <Painel titulo="Custo de referência do frete nesta data">
                    <div className="grade g4">
                      <Indicador valor={reais(c.custo_referencia)} rotulo="Frete local, custo de referência" nota={`${numero(c.km_ida_volta)} km de ida e volta em ${c.viagens} viagens`} />
                      <Indicador valor={reais(c.custo_convencional)} rotulo="Cenário-base: transporte convencional" nota={`${numero(c.km_convencional)} km num único veículo saindo da sede`} />
                      <Indicador valor={`${c.diferenca > 0 ? '+' : ''}${reais(c.diferenca)}`} rotulo="Diferença" nota="Indicador informativo, sem meta de redução" />
                      <Indicador valor={c.kg ? reais(c.custo_referencia / c.kg) : '—'} rotulo="Custo de referência por kg" nota="Subsídio ao gestor; não substitui o frete definido por ele" />
                    </div>
                  </Painel>
                )}
                <div className="grade g-lado">
                  <Painel className="fixo" titulo={foco ? 'Rota selecionada' : 'Todas as rotas da data'} acoes={foco && <button className="botao texto" onClick={() => setFoco(null)}>Ver todas</button>}>
                    {t && <Mapa centro={t.municipio} raioKm={t.municipio.raio_km} pontos={pontos} veiculo={simulacao.veiculo} rotas={visiveis.map((r) => ({ id: r.id, cor: CORES_ROTA[rotas.indexOf(r) % CORES_ROTA.length], paradas: r.paradas, rotulo: r.prestador, trajeto: trajetos[r.id] }))} />}
                    {rotaFoco && <ControlesSimulacao s={simulacao} />}
                    <LegendaMapa rotas trajetos={visiveis.map((r) => trajetos[r.id])} />
                  </Painel>
                  <div className="pilha" style={{ gap: 10 }}>
                    {rotas.map((r, i) => (
                      <button key={r.id} className="painel" style={{ textAlign: 'left', cursor: 'pointer', borderColor: foco === r.id ? 'var(--verde)' : undefined, borderWidth: foco === r.id ? 2 : 1, padding: '14px 16px' }} onClick={() => setFoco(foco === r.id ? null : r.id)} aria-pressed={foco === r.id}>
                        <div className="linha-flex" style={{ gap: 8 }}>
                          <i style={{ width: 12, height: 12, borderRadius: 3, background: CORES_ROTA[i % CORES_ROTA.length], flex: 'none' }} />
                          <strong style={{ flex: 1 }}>{r.prestador}</strong>
                          <span className={`selo ${r.status === 'concluida' ? 'ok' : r.status === 'em_curso' ? 'atencao' : ''}`}>{r.status === 'concluida' ? 'Concluída' : r.status === 'em_curso' ? 'Em curso' : 'Planejada'}</span>
                        </div>
                        <div className="pequeno suave" style={{ marginTop: 4 }}>
                          {MODAIS[r.modal as Modal].rotulo}, viagem {r.viagem}. Das {r.inicio} às {r.fim}. {kg(r.carga_kg)}, {numero(r.km_ida_volta)} km de ida e volta. Custo de referência: {reais(r.custo_referencia)}.
                        </div>
                        {foco === r.id && trajetos[r.id]?.km != null && (
                          <div className="pequeno suave" style={{ marginTop: 4 }}>
                            Pelas estradas do mapa, o percurso até a última parada tem {numero(trajetos[r.id]!.km!)} km. O custo de referência usa a estimativa do planejamento.
                          </div>
                        )}
                        {foco === r.id && (
                          <ol style={{ margin: '10px 0 0', paddingLeft: 20, fontSize: '0.9rem' }}>
                            {r.paradas.map((p: any, n: number) => (
                              <li key={n} style={{ padding: '2px 0' }}>
                                <strong>{p.chegada}</strong> {p.tipo === 'coleta' ? 'Coleta em' : 'Entrega em'} {p.nome}, {kg(p.kg)}
                                {p.espera_min > 0 && <span className="suave"> (espera de {p.espera_min} min pela janela)</span>}
                              </li>
                            ))}
                          </ol>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : <Painel><Vazio titulo="Nenhuma rota planejada nesta data">{planeja ? 'Use o botão acima para planejar.' : 'O controle interno planeja as rotas.'}</Vazio></Painel>)}
          </Estado>
        </div>
      )}
    </>
  );
}

function Cenarios({ podePlanejar }: { podePlanejar: boolean }) {
  const [r, setR] = useState<any>(null);
  const [quantidade, setQuantidade] = useState(20);
  const { ocupado, erro, executar } = usarAcao();
  return (
    <div className="pilha">
      <Painel titulo="Bateria de cenários sintéticos">
        <p style={{ maxWidth: '75ch' }}>Sorteia cargas entre as áreas de plantação e as escolas cadastradas e roteiriza cada cenário com os prestadores do município, sem acionar ninguém. O critério proposto para o mês 6 é ter rotas viáveis em todos os cenários de teste.</p>
        <div className="linha-flex" style={{ marginTop: 14 }}>
          <label className="linha-flex">Cenários <input className="entrada curta" type="number" min="5" max="60" value={quantidade} onChange={(e) => setQuantidade(Number(e.target.value))} /></label>
          <button className="botao" disabled={ocupado || !podePlanejar} onClick={() => executar(async () => setR(await api('/rotas/cenarios', { corpo: { quantidade } })))}>Simular cenários</button>
          {!podePlanejar && <span className="pequeno suave">Disponível para o controle interno e o operador.</span>}
        </div>
        {erro && <div style={{ marginTop: 12 }}><Aviso tipo="erro">{erro}</Aviso></div>}
      </Painel>
      {r && (
        <Painel titulo={`${r.viaveis} de ${r.quantidade} cenários com rotas viáveis (${pct(r.taxa)})`}>
          <div className="tabela-rolagem">
            <table>
              <thead><tr><th>Cenário</th><th className="dir">Cargas</th><th className="dir">Peso</th><th className="dir">Viagens</th><th className="dir">Km (ida e volta)</th><th className="dir">Custo de referência</th><th className="dir">Cenário-base</th><th>Meios usados</th><th>Resultado</th></tr></thead>
              <tbody>
                {r.cenarios.map((c: any) => (
                  <tr key={c.numero}>
                    <td>{c.numero}</td><td className="dir">{c.cargas}</td><td className="dir">{kg(c.kg)}</td><td className="dir">{c.viagens}</td><td className="dir">{numero(c.km_ida_volta)}</td><td className="dir">{reais(c.custo_referencia)}</td><td className="dir">{reais(c.custo_convencional)}</td>
                    <td className="pequeno">{c.modais.map((m: Modal) => MODAIS[m].rotulo).join(', ')}</td>
                    <td>{c.viavel ? <span className="selo ok">Viável</span> : <span className="selo erro" title={c.nao_atendidas.map((n: any) => n.motivo).join('; ')}>{c.nao_atendidas.length} sem rota</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      )}
    </div>
  );
}
