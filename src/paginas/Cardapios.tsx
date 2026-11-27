import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { api, usarDados, usarSessao, dataBr, numero, somarDias } from '../api';
import { Aviso, Cabecalho, Estado, Indicador, Modal, Painel, Vazio, usarAcao } from '../componentes/ui';
import { DIAS_SEMANA, MODOS_CARDAPIO, PAPEIS, kg, pct, pode, reais, type ModoCardapio, type Papel } from '../../compartilhado/dominio';

type Item = { dia: number; preparacao: string; papel: Papel; alimento_id: number; percapita_g: number; substituiu_alimento_id?: number | null };

const SELO_STATUS: Record<string, [string, string]> = { rascunho: ['Aguardando a nutricionista', 'atencao'], aprovado: ['Aprovado', 'ok'], arquivado: ['Não escolhido', ''] };

export function Cardapios() {
  const { sessao } = usarSessao();
  const navegar = useNavigate();
  const { dados, erro, carregando, recarregar } = usarDados<any>('/cardapios');
  const { dados: alimentos } = usarDados<any[]>('/alimentos');
  const [semana, setSemana] = useState('');
  const [editarBase, setEditarBase] = useState(false);
  const { ocupado, erro: erroAcao, executar } = usarAcao();
  const perfil = sessao.usuario.perfil;
  const semanas = dados ? [dados.proxima_semana, somarDias(dados.proxima_semana, 7), dados.semana_atual] : [];
  const escolhida = semana || semanas[0];
  const porSemana = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of dados?.propostas ?? []) m.set(p.semana, [...(m.get(p.semana) ?? []), p]);
    return [...m.entries()];
  }, [dados]);

  const gerar = () => executar(async () => {
    const r = await api<{ ids: number[] }>('/cardapios/gerar', { corpo: { semana: escolhida } });
    await recarregar();
    navegar(`/cardapios/${r.ids[0]}`);
  });

  return (
    <>
      <Cabecalho titulo="Cardápios">
        A nutricionista elabora o cardápio-base conforme o costume local. A cada semana, a plataforma combina esse cardápio com a oferta dos agricultores e apresenta três alternativas para ela ajustar e aprovar.
      </Cabecalho>
      <Estado carregando={carregando} erro={erro}>
        {dados && (
          <div className="pilha">
            <Painel titulo="Cardápio-base" acoes={pode(perfil, 'cardapio.elaborar') && <button className="botao secundario" onClick={() => setEditarBase(true)}>{dados.base ? 'Editar cardápio-base' : 'Elaborar cardápio-base'}</button>}>
              {dados.base ? (
                <>
                  <Semana itens={dados.base.itens} alimentos={alimentos ?? []} />
                  <p className="pequeno suave" style={{ marginTop: 10 }}>{dados.base.titulo}, por {dados.base.criado_por}, em {dataBr(dados.base.criado_em)}. Per capita escrita para alunos de 6 a 10 anos; as demais faixas são calculadas em proporção. {dados.versoes_base.length} versão(ões) no histórico.</p>
                </>
              ) : <Vazio titulo="Ainda não há cardápio-base">A nutricionista responsável técnica elabora o cardápio-base; sem ele não há propostas.</Vazio>}
            </Painel>

            {pode(perfil, 'cardapio.gerar') && dados.base && (
              <Painel titulo="Gerar as alternativas de uma semana">
                <div className="linha-flex">
                  <select className="entrada" style={{ width: 'auto' }} value={escolhida} onChange={(e) => setSemana(e.target.value)} aria-label="Semana do cardápio">
                    {semanas.map((s) => <option key={s} value={s}>Semana de {dataBr(s)}{s === dados.semana_atual ? ' (atual)' : ''}</option>)}
                  </select>
                  <button className="botao" onClick={gerar} disabled={ocupado}>Gerar alternativas</button>
                  <span className="pequeno suave">Ordem: adequação {pct(dados.pesos.adequacao)}, agricultura familiar {pct(dados.pesos.af)}, custo {pct(dados.pesos.custo)}, aproveitamento de safra {pct(dados.pesos.safra)}.</span>
                </div>
                {erroAcao && <div style={{ marginTop: 12 }}><Aviso tipo="erro">{erroAcao}</Aviso></div>}
              </Painel>
            )}

            {porSemana.length === 0 && <Painel><Vazio titulo="Nenhuma alternativa gerada ainda" /></Painel>}
            {porSemana.map(([s, lista]) => (
              <Painel key={s} titulo={`Semana de ${dataBr(s)}`}>
                <div className="grade g3">
                  {lista.filter((p: any) => p.geracao === (lista.find((x: any) => x.status === 'aprovado') ?? lista.reduce((a: any, b: any) => (a.id > b.id ? a : b))).geracao).map((p: any) => (
                    <Link key={p.id} to={`/cardapios/${p.id}`} className={`painel alternativa ${p.status === 'aprovado' ? 'escolhida' : ''}`} style={{ textDecoration: 'none', color: 'inherit', opacity: p.status === 'arquivado' ? 0.7 : 1 }}>
                      <h3>{MODOS_CARDAPIO[p.modo as ModoCardapio].rotulo}</h3>
                      <span className={`selo ${SELO_STATUS[p.status][1]}`}>{SELO_STATUS[p.status][0]}</span>
                      {p.metricas && (
                        <div className="metricas">
                          <div><span>Adequação</span><b>{pct(p.metricas.adequacao, 1)}</b></div>
                          <div><span>Agricultura familiar</span><b>{pct(p.metricas.pct_af)}</b></div>
                          <div><span>Custo da semana</span><b>{reais(p.metricas.custo)}</b></div>
                          <div><span>Safra aproveitada</span><b>{kg(p.metricas.safra_kg)}</b></div>
                        </div>
                      )}
                      {p.pedidos > 0 && <p className="pequeno suave" style={{ marginTop: 10 }}>{p.pedidos} pedidos gerados</p>}
                    </Link>
                  ))}
                </div>
              </Painel>
            ))}
          </div>
        )}
      </Estado>
      {editarBase && dados && <EditorBase base={dados.base} alimentos={alimentos ?? []} semana={dados.proxima_semana} onFechar={(s) => (setEditarBase(false), s && recarregar())} />}
    </>
  );
}

/** Grade de segunda a sexta. Com `onMudar`, vira editor. */
function Semana({ itens, alimentos, avaliacao, onMudar }: { itens: Item[]; alimentos: any[]; avaliacao?: any; onMudar?: (itens: Item[]) => void }) {
  const nome = (id: number) => alimentos.find((a) => a.id === id)?.nome ?? '—';
  const idx = (it: Item) => itens.indexOf(it);
  const mudar = (i: number, parte: Partial<Item>) => onMudar?.(itens.map((x, n) => (n === i ? { ...x, ...parte } : x)));
  return (
    <div className="semana">
      {DIAS_SEMANA.map((rotulo, d) => {
        const dia = d + 1;
        const av = avaliacao?.dias?.find((x: any) => x.dia === dia);
        return (
          <div className="dia" key={dia}>
            <h4>
              {rotulo}
              {av && <span className={`selo ${av.adequacao >= 0.85 ? 'ok' : 'atencao'}`} title={`${numero(av.nutrientes.kcal, 0)} kcal, ${numero(av.nutrientes.ptn)} g de proteína`}>{pct(av.adequacao)}</span>}
            </h4>
            {itens.filter((i) => i.dia === dia).map((it) => {
              const i = idx(it);
              const det = avaliacao?.itens?.find((x: any) => x.dia === dia && x.alimento_id === it.alimento_id && x.preparacao === it.preparacao);
              if (onMudar)
                return (
                  <div className="item-cardapio" key={i} style={{ gap: 5 }}>
                    <input className="entrada" style={{ minHeight: 32, padding: '4px 8px' }} value={it.preparacao} onChange={(e) => mudar(i, { preparacao: e.target.value })} aria-label="Preparação" placeholder="Preparação" />
                    <select className="entrada" style={{ minHeight: 32, padding: '4px 6px' }} value={it.alimento_id} onChange={(e) => mudar(i, { alimento_id: Number(e.target.value) })} aria-label="Alimento">
                      {alimentos.filter((a) => a.kcal != null).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                    </select>
                    <div className="linha-flex" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <select className="entrada" style={{ minHeight: 32, padding: '4px 6px' }} value={it.papel} onChange={(e) => mudar(i, { papel: e.target.value as Papel })} aria-label="Papel na refeição">
                        {Object.entries(PAPEIS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
                      </select>
                      <input className="entrada curta" style={{ width: 62 }} type="number" min="1" max="500" value={it.percapita_g} onChange={(e) => mudar(i, { percapita_g: Number(e.target.value) })} aria-label="Per capita em gramas" />
                      <span className="pequeno">g</span>
                      <button type="button" className="botao texto" onClick={() => onMudar(itens.filter((_, n) => n !== i))} aria-label={`Remover ${it.preparacao || 'item'}`}><Trash2 size={16} /></button>
                    </div>
                  </div>
                );
              const parcela = det && det.kg > 0 ? det.af_kg / det.kg : null;
              return (
                <div className="item-cardapio" key={i}>
                  <b>{it.preparacao}</b>
                  <span className="meta">
                    {parcela != null && <i className={`fonte ${parcela >= 0.99 ? 'af' : parcela > 0.01 ? 'parcial' : ''}`} title={parcela >= 0.99 ? 'Coberto pela agricultura familiar' : parcela > 0.01 ? `${numero(parcela * 100, 0)}% coberto pela agricultura familiar` : det.agricola ? 'Sem oferta local nas datas' : 'Compra convencional'} />}
                    {nome(it.alimento_id)}, {it.percapita_g} g
                  </span>
                  {det?.substituiu && <span className="meta">No lugar de {det.substituiu}</span>}
                </div>
              );
            })}
            {onMudar && (
              <button type="button" className="botao texto" style={{ marginTop: 6 }} onClick={() => onMudar([...itens, { dia, preparacao: '', papel: 'hortalica', alimento_id: alimentos.find((a) => a.grupo === 'hortalica' && a.kcal != null)?.id ?? alimentos[0]?.id, percapita_g: 30 }])}>
                <Plus size={16} aria-hidden /> Item
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const LegendaFonte = () => (
  <div className="legenda">
    <span><i className="fonte af" style={{ borderRadius: '50%' }} />Agricultura familiar</span>
    <span><i className="fonte parcial" style={{ borderRadius: '50%' }} />Coberto em parte</span>
    <span><i className="fonte" style={{ borderRadius: '50%' }} />Compra convencional ou sem oferta local</span>
  </div>
);

/** Recalcula a adequação enquanto a nutricionista ajusta [RF-CAR-06]. */
function usarAvaliacao(itens: Item[], semana: string, ativo: boolean) {
  const [av, setAv] = useState<any>(null);
  useEffect(() => {
    if (!ativo || !itens.length) return;
    const t = setTimeout(() => api('/cardapios/avaliar', { corpo: { itens, semana } }).then(setAv).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [itens, semana, ativo]);
  return av;
}

function EditorBase({ base, alimentos, semana, onFechar }: { base: any; alimentos: any[]; semana: string; onFechar: (salvou?: boolean) => void }) {
  const [titulo, setTitulo] = useState(base?.titulo ?? 'Cardápio-base — costume local');
  const [itens, setItens] = useState<Item[]>(base?.itens ?? []);
  const av = usarAvaliacao(itens, semana, true);
  const { ocupado, erro, executar } = usarAcao();
  return (
    <Modal titulo="Cardápio-base" onFechar={() => onFechar()} largo>
      <div className="pilha" style={{ gap: 14 }}>
        <label className="campo"><span>Nome desta versão</span><input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
        {av && <Aviso tipo={av.metricas.adequacao >= 0.85 ? 'ok' : 'atencao'}>Adequação nutricional de {pct(av.metricas.adequacao, 1)} (calórica: {pct(av.metricas.adequacao_calorica, 1)}), recalculada a cada ajuste.</Aviso>}
        <Semana itens={itens} alimentos={alimentos} avaliacao={av} onMudar={setItens} />
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
      </div>
      <div className="modal-pe">
        <button className="botao secundario" onClick={() => onFechar()}>Cancelar</button>
        <button className="botao" disabled={ocupado} onClick={() => executar(async () => { await api('/cardapios/base', { corpo: { titulo, itens } }); onFechar(true); })}>Salvar nova versão</button>
      </div>
    </Modal>
  );
}

export function CardapioDetalhe() {
  const { id } = useParams();
  const { sessao } = usarSessao();
  const navegar = useNavigate();
  const { dados: c, erro, carregando, recarregar } = usarDados<any>(`/cardapios/${id}`);
  const { dados: alimentos } = usarDados<any[]>('/alimentos');
  const { dados: irmaos } = usarDados<any>('/cardapios');
  const [editando, setEditando] = useState(false);
  const [itens, setItens] = useState<Item[]>([]);
  const [resultado, setResultado] = useState<any>(null);
  const [verNecessidades, setVerNecessidades] = useState(false);
  const { ocupado, erro: erroAcao, executar } = usarAcao();
  const perfil = sessao.usuario.perfil;
  useEffect(() => { if (c) (setItens(c.itens), setEditando(false), setResultado(null)); }, [c]);
  const previa = usarAvaliacao(itens, c?.semana ?? '', editando);
  const av = editando && previa ? previa : c?.avaliacao;
  const rascunho = c?.status === 'rascunho';
  const alternativas = (irmaos?.propostas ?? []).filter((p: any) => p.geracao === c?.geracao);

  return (
    <Estado carregando={carregando} erro={erro}>
      {c && av && (
        <>
          <Cabecalho
            titulo={c.titulo}
            acoes={
              <>
                {rascunho && pode(perfil, 'cardapio.elaborar') && !editando && <button className="botao secundario" onClick={() => setEditando(true)}>Ajustar itens</button>}
                {editando && <button className="botao secundario" onClick={() => (setItens(c.itens), setEditando(false))}>Descartar ajustes</button>}
                {editando && <button className="botao" disabled={ocupado} onClick={() => executar(async () => { await api(`/cardapios/${c.id}/itens`, { metodo: 'PUT', corpo: { itens } }); await recarregar(); })}>Salvar ajustes</button>}
                {rascunho && pode(perfil, 'cardapio.elaborar') && !editando && <button className="botao" disabled={ocupado} onClick={() => executar(async () => { await api(`/cardapios/${c.id}/aprovar`, { metodo: 'POST' }); await recarregar(); })}>Aprovar cardápio</button>}
                {c.status === 'aprovado' && c.pedidos === 0 && pode(perfil, 'pedidos.gerar') && <button className="botao" disabled={ocupado} onClick={() => executar(async () => { setResultado(await api(`/cardapios/${c.id}/pedidos`, { metodo: 'POST' })); await recarregar(); })}>Gerar pedidos aos agricultores</button>}
              </>
            }
          >
            <span className={`selo ${SELO_STATUS[c.status]?.[1] ?? ''}`}>{SELO_STATUS[c.status]?.[0] ?? c.status}</span>{' '}
            {c.aprovado_por ? `Aprovado por ${c.aprovado_por} em ${dataBr(c.aprovado_em)}.` : `Gerado em ${dataBr(c.criado_em)}.`}{' '}
            <Link to="/cardapios">Voltar aos cardápios</Link>
          </Cabecalho>
          <div className="pilha">
            {erroAcao && <Aviso tipo="erro">{erroAcao}</Aviso>}
            {resultado && (
              <Aviso tipo="ok">
                {resultado.pedidos.length} pedidos gerados, no valor de {reais(resultado.valor)}. <Link to="/rotas">Planejar as rotas</Link>.
                {resultado.descoberto.length > 0 && ` ${resultado.descoberto.length} necessidade(s) ficaram sem oferta local e seguem para compra convencional.`}
              </Aviso>
            )}
            {rascunho && !pode(perfil, 'cardapio.elaborar') && <Aviso tipo="neutro">Só a nutricionista responsável técnica ajusta e aprova o cardápio. Sem aprovação, não há compra.</Aviso>}
            {c.status === 'aprovado' && c.pedidos > 0 && <Aviso tipo="neutro">{c.pedidos} pedidos já foram gerados a partir deste cardápio. <Link to="/entregas">Acompanhar as entregas</Link>.</Aviso>}
            {alternativas.length > 1 && (
              <div className="linha-flex">
                <span className="pequeno suave">Alternativas desta geração:</span>
                {alternativas.map((p: any) => (
                  <button key={p.id} className={`opcao ${p.id === c.id ? 'ligada' : ''}`} onClick={() => navegar(`/cardapios/${p.id}`)}>
                    {MODOS_CARDAPIO[p.modo as ModoCardapio].rotulo}, {pct(p.metricas?.adequacao ?? 0)}
                  </button>
                ))}
              </div>
            )}
            <Painel>
              <div className="grade g4">
                <Indicador valor={pct(av.metricas.adequacao, 1)} rotulo="Adequação nutricional" nota={`Calórica: ${pct(av.metricas.adequacao_calorica, 1)}. Meta da Fase 1: acima de 85%`} />
                <Indicador valor={pct(av.metricas.pct_af)} rotulo="Do valor vem da agricultura familiar" nota={`${reais(av.metricas.valor_af)}, ou ${pct(av.metricas.contribuicao_cota, 2)} do repasse anual`} />
                <Indicador valor={reais(av.metricas.custo)} rotulo="Custo da semana" nota={`${reais(av.metricas.custo_aluno_dia)} por aluno por dia`} />
                <Indicador valor={kg(av.metricas.safra_kg)} rotulo="De safra local aproveitada" nota={av.metricas.urgente_total_kg > 0 ? `${kg(av.metricas.urgente_kg)} de ${kg(av.metricas.urgente_total_kg)} que vencem na semana` : undefined} />
              </div>
              {c.justificativa && !editando && <p style={{ marginTop: 16, maxWidth: '80ch' }}>{c.justificativa}</p>}
            </Painel>
            <Painel titulo={editando ? 'Ajuste os itens; a adequação é recalculada a cada mudança' : 'Refeições da semana'}>
              <Semana itens={itens} alimentos={alimentos ?? []} avaliacao={av} onMudar={editando ? setItens : undefined} />
              {!editando && <LegendaFonte />}
            </Painel>
            <div className="grade g2">
              <Painel titulo="O que falta na oferta local">
                {av.lacunas.length ? (
                  <div className="tabela-rolagem">
                    <table>
                      <thead><tr><th>Alimento</th><th className="dir">Falta na semana</th><th>Dias</th></tr></thead>
                      <tbody>{av.lacunas.map((l: any) => <tr key={l.alimento_id}><td>{l.alimento}</td><td className="dir">{kg(l.falta_kg)}</td><td>{l.dias.map((d: number) => DIAS_SEMANA[d - 1].slice(0, 3)).join(', ')}</td></tr>)}</tbody>
                    </table>
                  </div>
                ) : <p className="suave">A oferta local cobre todos os itens agrícolas deste cardápio.</p>}
                {av.lacunas.length > 0 && <p className="pequeno" style={{ marginTop: 10 }}><Link to="/recomendacoes">Ver recomendações de plantio para fechar essas lacunas</Link></p>}
              </Painel>
              <Painel titulo="Nutrientes por dia" >
                <div className="tabela-rolagem">
                  <table>
                    <thead><tr><th>Dia</th><th className="dir">kcal</th><th className="dir">Prot.</th><th className="dir">Carb.</th><th className="dir">Lip.</th><th className="dir">Cálcio</th><th className="dir">Ferro</th><th className="dir">Vit. C</th></tr></thead>
                    <tbody>{av.dias.map((d: any) => <tr key={d.dia}><td>{DIAS_SEMANA[d.dia - 1]}</td><td className="dir">{numero(d.nutrientes.kcal, 0)}</td><td className="dir">{numero(d.nutrientes.ptn)} g</td><td className="dir">{numero(d.nutrientes.cho)} g</td><td className="dir">{numero(d.nutrientes.lip)} g</td><td className="dir">{numero(d.nutrientes.calcio, 0)} mg</td><td className="dir">{numero(d.nutrientes.ferro)} mg</td><td className="dir">{numero(d.nutrientes.vit_c, 0)} mg</td></tr>)}</tbody>
                  </table>
                </div>
                <p className="pequeno suave" style={{ marginTop: 10 }}>Por refeição, para a faixa de 6 a 10 anos. O índice pesa energia (40%), macronutrientes (36%) e cálcio, ferro e vitamina C (24%).</p>
              </Painel>
            </div>
            {c.status === 'aprovado' && (
              <Painel titulo="Lista de necessidades por escola" acoes={<button className="botao texto" onClick={() => setVerNecessidades((v) => !v)}>{verNecessidades ? 'Ocultar' : 'Mostrar'}</button>}>
                {verNecessidades ? <Necessidades id={c.id} /> : <p className="suave">Per capita × alunos × dias, por escola e alimento.</p>}
              </Painel>
            )}
          </div>
        </>
      )}
    </Estado>
  );
}

function Necessidades({ id }: { id: number }) {
  const { dados, erro, carregando } = usarDados<any[]>(`/cardapios/${id}/necessidades`);
  const { escolas, linhas } = useMemo(() => {
    const escolas = [...new Set((dados ?? []).map((n) => n.escola))];
    const m = new Map<string, { alimento: string; agricola: boolean; por: Record<string, number>; total: number }>();
    for (const n of dados ?? []) {
      const l: { alimento: string; agricola: boolean; por: Record<string, number>; total: number } = m.get(n.alimento) ?? { alimento: n.alimento, agricola: !!n.agricola, por: {}, total: 0 };
      l.por[n.escola] = (l.por[n.escola] ?? 0) + n.quantidade_kg;
      l.total += n.quantidade_kg;
      m.set(n.alimento, l);
    }
    return { escolas, linhas: [...m.values()].sort((a, b) => b.total - a.total) };
  }, [dados]);
  return (
    <Estado carregando={carregando} erro={erro}>
      <div className="tabela-rolagem">
        <table>
          <thead><tr><th>Alimento (kg na semana)</th>{escolas.map((e) => <th key={e} className="dir" title={e}>{e.replace(/Escola Municipal |Centro de Educação Infantil /, '')}</th>)}<th className="dir">Total</th></tr></thead>
          <tbody>{linhas.map((l) => <tr key={l.alimento}><td>{l.alimento}</td>{escolas.map((e) => <td key={e} className="dir">{numero(l.por[e] ?? 0)}</td>)}<td className="dir"><strong>{numero(l.total)}</strong></td></tr>)}</tbody>
        </table>
      </div>
    </Estado>
  );
}
