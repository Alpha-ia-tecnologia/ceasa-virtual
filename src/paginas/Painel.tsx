import { Link } from 'react-router-dom';
import { usarDados, usarSessao, dataBr, numero } from '../api';
import { Aviso, Cabecalho, Estado, Indicador, Painel, Percurso } from '../componentes/ui';
import { Mapa, LegendaMapa, type PontoMapa } from '../componentes/Mapa';
import { pct, reais } from '../../compartilhado/dominio';

export function PainelGestor() {
  const { sessao } = usarSessao();
  const { dados: p, erro, carregando } = usarDados<any>('/painel');
  const { dados: t } = usarDados<any>('/territorio');
  const { dados: consorcio } = usarDados<any>(sessao.usuario.perfil === 'operador' ? '/consorcio' : null);

  const pontos: PontoMapa[] = t
    ? [
        ...t.escolas.map((e: any) => ({ id: `e${e.id}`, tipo: 'escola' as const, lat: e.lat, lng: e.lng, rotulo: e.nome })),
        ...t.agricultores.flatMap((a: any) => a.areas.map((ar: any) => ({ id: `a${ar.id}`, tipo: 'area' as const, lat: ar.lat, lng: ar.lng, rotulo: `${ar.nome} — ${a.nome}` }))),
        ...t.prestadores.filter((x: any) => !x.agricultor_id).map((x: any) => ({ id: `p${x.id}`, tipo: 'prestador' as const, lat: x.base_lat, lng: x.base_lng, rotulo: x.nome })),
      ]
    : [];

  return (
    <>
      <Cabecalho titulo="Painel do gestor">
        Compras da agricultura familiar no exercício de {sessao.municipio.exercicio} e andamento das entregas em {sessao.municipio.nome}.
      </Cabecalho>
      <Estado carregando={carregando} erro={erro}>
        {p && (
          <div className="pilha">
            <Cota c={p.cota} />
            <div className="grade g-lado">
              <div className="pilha">
                <Painel titulo="Entregas no percurso" acoes={<Link className="botao texto" to="/entregas">Ver entregas</Link>}>
                  <Percurso contagem={p.funil} />
                  {(p.pendencias.divergencias > 0 || p.pendencias.bloqueadas > 0 || p.pendencias.sem_rota > 0) && (
                    <div className="pilha" style={{ gap: 8, marginTop: 16 }}>
                      {p.pendencias.divergencias > 0 && <Aviso tipo="erro"><Link to="/entregas?aba=divergencias">{p.pendencias.divergencias} entrega(s) com divergência</Link> aguardam decisão do controle interno; o pagamento fica bloqueado até lá.</Aviso>}
                      {p.pendencias.bloqueadas > 0 && <Aviso><Link to="/pagamentos">{p.pendencias.bloqueadas} pagamento(s) bloqueado(s)</Link> porque a conta não está em nome do agricultor.</Aviso>}
                      {p.pendencias.sem_rota > 0 && <Aviso><Link to="/rotas">{p.pendencias.sem_rota} pedido(s) sem rota</Link>. Planeje as rotas da data de entrega.</Aviso>}
                    </div>
                  )}
                </Painel>
                <Painel titulo="Indicadores da operação">
                  <div className="grade g3">
                    <Indicador valor={p.indicadores.adequacao_media == null ? '—' : pct(p.indicadores.adequacao_media)} rotulo="Adequação nutricional média" nota="Cardápios aprovados" />
                    <Indicador valor={p.indicadores.entregas_no_prazo == null ? '—' : pct(p.indicadores.entregas_no_prazo)} rotulo="Entregas no prazo" nota={`${p.indicadores.entregas_validadas} validadas`} />
                    <Indicador valor={p.indicadores.perdas == null ? '—' : pct(p.indicadores.perdas, 1)} rotulo="Perdas" nota="Pedido e não aceito" />
                    <Indicador valor={p.indicadores.frete_por_kg == null ? '—' : reais(p.indicadores.frete_por_kg)} rotulo="Frete por kg entregue" />
                    <Indicador valor={p.indicadores.agricultores_ativos} rotulo="Agricultores ativos" nota="Com pedido nos últimos 30 dias" />
                    <Indicador valor={reais(p.indicadores.renda_local)} rotulo="Renda paga no território" nota={`ISS retido: ${reais(p.indicadores.iss_retido)}`} />
                  </div>
                </Painel>
                <Painel titulo="Compras pela plataforma, por semana">
                  <Semanas serie={p.serie} />
                </Painel>
              </div>
              <Painel titulo="Território" acoes={<Link className="botao texto" to="/territorio">Abrir cadastros</Link>}>
                {t && <Mapa centro={t.municipio} raioKm={t.municipio.raio_km} pontos={pontos} altura={420} />}
                <LegendaMapa />
                {t && <p className="pequeno suave" style={{ marginTop: 10 }}>{t.escolas.length} escolas, {t.agricultores.length} agricultores e {t.prestadores.length} prestadores de frete cadastrados.</p>}
              </Painel>
            </div>
            {consorcio?.municipios?.length > 1 && (
              <Painel titulo={consorcio.nome}>
                <div className="tabela-rolagem">
                  <table>
                    <thead><tr><th>Município</th><th className="dir">Repasse</th><th className="dir">Adquirido</th><th className="dir">Hoje</th><th className="dir">Projeção</th><th>Situação</th><th className="dir">Agricultores ativos</th></tr></thead>
                    <tbody>
                      {consorcio.municipios.map((m: any) => (
                        <tr key={m.id}>
                          <td>{m.nome}{m.modo_piloto && <span className="selo liso" style={{ marginLeft: 8 }}>Piloto</span>}</td>
                          <td className="dir">{reais(m.repasse)}</td><td className="dir">{reais(m.adquirido)}</td><td className="dir">{pct(m.pct, 1)}</td><td className="dir">{pct(m.pct_projetado, 1)}</td>
                          <td><span className={`selo ${m.em_risco ? 'erro' : 'ok'}`}>{m.em_risco ? 'Em risco' : 'No caminho'}</span></td>
                          <td className="dir">{m.agricultores_ativos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="pequeno suave" style={{ marginTop: 8 }}>Visão consolidada do consórcio; os dados de cada município ficam isolados.</p>
              </Painel>
            )}
          </div>
        )}
      </Estado>
    </>
  );
}

function Cota({ c }: { c: any }) {
  const escala = Math.max(0.6, c.pct_projetado * 1.08, c.piso * 1.25);
  const larg = (v: number) => `${Math.min(100, (v / c.repasse / escala) * 100)}%`;
  return (
    <section className="painel verde">
      <div className="grade g-lado" style={{ alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Agricultura familiar sobre o repasse do FNDE</h2>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', margin: '6px 0 2px' }}>
            <b className="num" style={{ fontSize: '3.2rem', lineHeight: 1 }}>{pct(c.pct, 1)}</b>
            <span style={{ fontSize: '1.05rem' }}>adquirido de {reais(c.repasse)}; o piso é {pct(c.piso)}</span>
          </div>
          <div className="cota">
            <div className="marca" style={{ left: `${(c.piso / escala) * 100}%` }}><span>Piso de {pct(c.piso)}</span></div>
            <div className="barra" role="img" aria-label={`Adquirido ${pct(c.pct, 1)}; projeção ${pct(c.pct_projetado, 1)}; piso ${pct(c.piso)}`}>
              <i style={{ width: larg(c.previo) }} />
              <i className="cultivo" style={{ width: larg(c.plataforma) }} />
              <i className="proj" style={{ width: larg(Math.max(0, c.projetado - c.adquirido)) }} />
            </div>
          </div>
          <div className="legenda">
            <span><i style={{ background: '#fff' }} />Antes da plataforma: {reais(c.previo)}</span>
            <span><i style={{ background: '#A9D27C' }} />Pela plataforma: {reais(c.plataforma)}</span>
            <span><i style={{ background: 'repeating-linear-gradient(135deg, rgba(255,255,255,.6) 0 3px, transparent 3px 6px)' }} />Projeção até {dataBr(c.fim_letivo)}</span>
          </div>
        </div>
        <div className="pilha" style={{ gap: 10 }}>
          <div style={{ background: c.em_risco ? '#F7E4DF' : 'rgba(255,255,255,.12)', color: c.em_risco ? '#7d2b20' : '#fff', borderRadius: 10, padding: '14px 16px' }}>
            <strong style={{ fontSize: '1.1rem' }}>{c.em_risco ? 'Risco de fechar o ano abaixo do piso' : 'No ritmo atual, o município cumpre o piso'}</strong>
            <p style={{ marginTop: 4 }}>Projeção de <strong>{pct(c.pct_projetado, 1)}</strong> em {dataBr(c.fim_letivo)}, com {reais(c.ritmo_semanal)} por semana nas {c.semanas_restantes} semanas letivas restantes.</p>
          </div>
          <p className="suave pequeno">Faltam {reais(c.falta)} para o piso. Há {reais(c.em_andamento)} em pedidos ainda não validados. A projeção é uma estimativa linear do ritmo das últimas semanas.</p>
        </div>
      </div>
    </section>
  );
}

function Semanas({ serie }: { serie: { semana: string; valor: number }[] }) {
  const max = Math.max(1, ...serie.map((s) => s.valor));
  const L = 640, A = 150, larg = L / serie.length;
  return (
    <svg viewBox={`0 0 ${L} ${A + 34}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Valor comprado da agricultura familiar pela plataforma em cada semana">
      <line x1="0" x2={L} y1={A} y2={A} stroke="#DCDFD2" />
      {serie.map((s, i) => {
        const h = (s.valor / max) * (A - 22);
        return (
          <g key={s.semana}>
            <title>{`Semana de ${dataBr(s.semana)}: ${reais(s.valor)}`}</title>
            <rect x={i * larg + larg * 0.2} y={A - h} width={larg * 0.6} height={Math.max(h, 0)} rx="4" fill="#145C43" />
            {s.valor > 0 && <text x={i * larg + larg / 2} y={A - h - 6} textAnchor="middle" fontSize="12" fontWeight="600" fill="#24372D">{numero(s.valor / 1000, 1)} mil</text>}
            <text x={i * larg + larg / 2} y={A + 18} textAnchor="middle" fontSize="12" fill="#56665B">{dataBr(s.semana).slice(0, 5)}</text>
          </g>
        );
      })}
    </svg>
  );
}
