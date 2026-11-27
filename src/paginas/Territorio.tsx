import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, usarDados, usarSessao, numero } from '../api';
import { Abas, Aviso, Cabecalho, Campo, Estado, Modal, Opcoes, Painel, usarAcao } from '../componentes/ui';
import { Mapa, LegendaMapa, type PontoMapa } from '../componentes/Mapa';
import { DIAS_SEMANA, MODAIS, TIPOS_AGRICULTOR, TIPOS_VIA, pode, type Modal as TipoModal } from '../../compartilhado/dominio';

type Aba = 'mapa' | 'escolas' | 'agricultores' | 'prestadores';

export function Territorio() {
  const { sessao } = usarSessao();
  const { dados: t, erro, carregando, recarregar } = usarDados<any>('/territorio');
  const { dados: alimentos } = usarDados<any[]>('/alimentos');
  const { dados: nutricao } = usarDados<any>('/nutricao');
  const [aba, setAba] = useState<Aba>('mapa');
  const [edicao, setEdicao] = useState<{ tipo: Aba; item: any } | null>(null);
  const [foco, setFoco] = useState<PontoMapa | null>(null);
  const editar = pode(sessao.usuario.perfil, 'cadastros.editar');

  const pontos: PontoMapa[] = t
    ? [
        ...t.escolas.map((e: any) => ({ id: `e${e.id}`, tipo: 'escola' as const, lat: e.lat, lng: e.lng, rotulo: e.nome })),
        ...t.agricultores.flatMap((a: any) => a.areas.map((ar: any) => ({ id: `a${ar.id}`, tipo: 'area' as const, lat: ar.lat, lng: ar.lng, rotulo: `${ar.nome} — ${a.nome} (${TIPOS_VIA[ar.tipo_via as keyof typeof TIPOS_VIA].rotulo.toLowerCase()})` }))),
        ...t.prestadores.filter((p: any) => !p.agricultor_id).map((p: any) => ({ id: `p${p.id}`, tipo: 'prestador' as const, lat: p.base_lat, lng: p.base_lng, rotulo: `${p.nome} — ${MODAIS[p.modal as TipoModal].rotulo}` })),
      ]
    : [];
  const fechar = (salvou?: boolean) => {
    setEdicao(null);
    if (salvou) recarregar();
  };
  const totalAlunos = (e: any) => Object.values(e.alunos as Record<string, number>).reduce((s, n) => s + n, 0);

  return (
    <>
      <Cabecalho
        titulo="Mapa e cadastros"
        acoes={editar && aba !== 'mapa' && (
          <button className="botao" onClick={() => setEdicao({ tipo: aba, item: null })}>
            <Plus size={18} aria-hidden /> Cadastrar {aba === 'escolas' ? 'escola' : aba === 'agricultores' ? 'agricultor' : 'prestador'}
          </button>
        )}
      >
        Quem produz, quem transporta e quem recebe em {sessao.municipio.nome}. A localização de cada ponto alimenta as rotas e a conferência das entregas.
      </Cabecalho>
      <Estado carregando={carregando} erro={erro}>
        {t && (
          <>
            <Abas ativa={aba} onMudar={setAba} abas={[{ id: 'mapa', rotulo: 'Mapa' }, { id: 'escolas', rotulo: 'Escolas', conta: t.escolas.length }, { id: 'agricultores', rotulo: 'Agricultores', conta: t.agricultores.length }, { id: 'prestadores', rotulo: 'Prestadores de frete', conta: t.prestadores.length }]} />
            {aba === 'mapa' && (
              <div className="grade g-lado">
                <Painel>
                  <Mapa centro={t.municipio} raioKm={t.municipio.raio_km} pontos={pontos.map((p) => ({ ...p, destaque: p.id === foco?.id }))} onPonto={setFoco} />
                  <LegendaMapa />
                </Painel>
                <div className="pilha">
                  <Painel titulo={t.municipio.nome}>
                    <dl className="pilha" style={{ gap: 8, margin: 0 }}>
                      <Linha rotulo="Entidade executora" valor={t.municipio.entidade_executora} />
                      <Linha rotulo="CNPJ" valor={t.municipio.cnpj} />
                      <Linha rotulo={`Repasse do FNDE em ${t.municipio.exercicio}`} valor={t.municipio.repasse_fnde_anual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
                      <Linha rotulo="Alunos atendidos" valor={numero(t.escolas.reduce((s: number, e: any) => s + totalAlunos(e), 0), 0)} />
                    </dl>
                  </Painel>
                  <Painel titulo="Ponto selecionado">
                    {foco ? <p>{foco.rotulo}</p> : <p className="suave">Toque num ponto do mapa para ver o que é.</p>}
                  </Painel>
                  {sessao.sandbox && <Aviso tipo="neutro">O território, as pessoas e os documentos deste ambiente são sintéticos. O mapa não representa propriedades reais.</Aviso>}
                </div>
              </div>
            )}
            {aba === 'escolas' && (
              <div className="tabela-rolagem">
                <table>
                  <thead><tr><th>Escola</th><th>Responsável pelo recebimento</th><th>Janela de recebimento</th><th className="dir">Alunos</th><th className="dir">Refrigerado</th><th className="dir">Seco</th></tr></thead>
                  <tbody>
                    {t.escolas.map((e: any) => (
                      <tr key={e.id} className={editar ? 'clicavel' : ''} onClick={() => editar && setEdicao({ tipo: 'escolas', item: e })}>
                        <td><strong>{e.nome}</strong><div className="pequeno suave">{e.endereco}</div></td>
                        <td>{e.diretor}</td>
                        <td>{e.janelas.length ? `${e.janelas[0].inicio}–${e.janelas[0].fim}, ${e.janelas.length} dia(s)` : '—'}</td>
                        <td className="dir">{numero(totalAlunos(e), 0)}</td><td className="dir">{e.cap_refrigerado_kg} kg</td><td className="dir">{e.cap_seco_kg} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {aba === 'agricultores' && (
              <div className="tabela-rolagem">
                <table>
                  <thead><tr><th>Agricultor</th><th>Documento e CAF</th><th>Áreas de plantação</th><th>Produtos</th><th>Conta para pagamento</th><th>Escuta</th></tr></thead>
                  <tbody>
                    {t.agricultores.map((a: any) => (
                      <tr key={a.id} className={editar ? 'clicavel' : ''} onClick={() => editar && setEdicao({ tipo: 'agricultores', item: a })}>
                        <td><strong>{a.nome}</strong><div className="pequeno suave">{TIPOS_AGRICULTOR[a.tipo as keyof typeof TIPOS_AGRICULTOR]}</div></td>
                        <td className="num">{a.documento}<div className="pequeno suave">{a.caf}</div></td>
                        <td>{a.areas.map((ar: any) => <div key={ar.id}>{ar.nome} <span className="pequeno suave">({numero(ar.hectares)} ha, {TIPOS_VIA[ar.tipo_via as keyof typeof TIPOS_VIA].rotulo.toLowerCase()})</span></div>)}</td>
                        <td className="pequeno">{a.produtos.map((id: number) => alimentos?.find((x) => x.id === id)?.nome).filter(Boolean).join(', ') || '—'}</td>
                        <td>{a.conta === '•••' ? <span className="suave">Restrito</span> : a.titular_ok ? <span className="selo ok">Em nome do agricultor</span> : <span className="selo erro">Conta de terceiro</span>}</td>
                        <td>{a.escuta ? <span className="selo ok">Registrada</span> : <span className="selo atencao">Pendente</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {aba === 'prestadores' && (
              <div className="tabela-rolagem">
                <table>
                  <thead><tr><th>Prestador</th><th>Meio de transporte</th><th className="dir">Capacidade</th><th>Caixa térmica</th><th>Área de atuação</th><th>Inscrição municipal</th></tr></thead>
                  <tbody>
                    {t.prestadores.map((p: any) => (
                      <tr key={p.id} className={editar ? 'clicavel' : ''} onClick={() => editar && setEdicao({ tipo: 'prestadores', item: p })}>
                        <td><strong>{p.nome}</strong>{p.agricultor_id && <div className="pequeno suave">Agricultor que entrega a própria produção</div>}</td>
                        <td>{MODAIS[p.modal as TipoModal].rotulo}</td><td className="dir">{p.capacidade_kg} kg</td><td>{p.caixa_termica ? 'Sim' : 'Não'}</td><td>{p.area_atuacao}</td><td>{p.inscricao_municipal}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Estado>
      {edicao?.tipo === 'escolas' && <FormEscola item={edicao.item} t={t} faixas={nutricao?.referencias ?? []} pontos={pontos} onFechar={fechar} />}
      {edicao?.tipo === 'agricultores' && <FormAgricultor item={edicao.item} t={t} alimentos={alimentos ?? []} pontos={pontos} onFechar={fechar} />}
      {edicao?.tipo === 'prestadores' && <FormPrestador item={edicao.item} t={t} pontos={pontos} onFechar={fechar} />}
    </>
  );
}

const Linha = ({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) => (
  <div><dt className="pequeno suave">{rotulo}</dt><dd style={{ margin: 0, fontWeight: 600 }}>{valor}</dd></div>
);

/** Marca um ponto no mapa; serve para pontos rurais sem endereço [RF-LOG-03]. */
function Local({ t, pontos, lat, lng, onMudar, rotulo }: { t: any; pontos: PontoMapa[]; lat: number | null; lng: number | null; onMudar: (lat: number, lng: number) => void; rotulo: string }) {
  const marcado: PontoMapa[] = lat != null && lng != null ? [{ id: 'novo', tipo: 'marcado', lat, lng, rotulo: 'Local marcado' }] : [];
  return (
    <div className="campo largo">
      <span>{rotulo}</span>
      <Mapa centro={t.municipio} raioKm={t.municipio.raio_km} pontos={[...pontos, ...marcado]} onMarcar={(a, b) => onMudar(Number(a.toFixed(6)), Number(b.toFixed(6)))} altura={320} />
      <small>{lat != null && lng != null ? `Marcado em ${lat.toFixed(5)}, ${lng.toFixed(5)}. Toque no mapa para mudar.` : 'Toque no mapa para marcar o local.'}</small>
    </div>
  );
}

function Rodape({ ocupado, erro, onFechar }: { ocupado: boolean; erro: string | null; onFechar: () => void }) {
  return (
    <>
      {erro && <div style={{ marginTop: 14 }}><Aviso tipo="erro">{erro}</Aviso></div>}
      <div className="modal-pe">
        <button type="button" className="botao secundario" onClick={onFechar}>Cancelar</button>
        <button className="botao" disabled={ocupado}>Salvar cadastro</button>
      </div>
    </>
  );
}

function FormEscola({ item, t, faixas, pontos, onFechar }: { item: any; t: any; faixas: any[]; pontos: PontoMapa[]; onFechar: (salvou?: boolean) => void }) {
  const [f, setF] = useState<any>(item ?? { nome: '', endereco: '', diretor: '', lat: null, lng: null, cap_refrigerado_kg: 0, cap_seco_kg: 0, alunos: {}, janelas: [] });
  const [dias, setDias] = useState<number[]>(item ? item.janelas.map((j: any) => j.dia) : [1, 2, 3, 4, 5]);
  const [hora, setHora] = useState({ inicio: item?.janelas[0]?.inicio ?? '07:00', fim: item?.janelas[0]?.fim ?? '10:00' });
  const { ocupado, erro, executar } = usarAcao();
  const mudar = (k: string, v: unknown) => setF((x: any) => ({ ...x, [k]: v }));
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    executar(async () => {
      await api(item ? `/escolas/${item.id}` : '/escolas', { metodo: item ? 'PUT' : 'POST', corpo: { ...f, janelas: dias.map((dia) => ({ dia, ...hora })) } });
      onFechar(true);
    });
  };
  return (
    <Modal titulo={item ? 'Editar escola' : 'Cadastrar escola'} onFechar={() => onFechar()} largo>
      <form onSubmit={salvar}>
        <div className="form">
          <Campo rotulo="Nome da escola" largo><input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} required /></Campo>
          <Campo rotulo="Endereço ou povoado"><input value={f.endereco ?? ''} onChange={(e) => mudar('endereco', e.target.value)} /></Campo>
          <Campo rotulo="Responsável pelo recebimento" ajuda="Diretor ou diretora; a merendeira pode apoiar a conferência."><input value={f.diretor ?? ''} onChange={(e) => mudar('diretor', e.target.value)} /></Campo>
          <div className="campo largo">
            <span>Dias em que a escola recebe</span>
            <Opcoes opcoes={DIAS_SEMANA.map((d, i) => ({ id: i + 1, rotulo: d }))} valor={dias} onMudar={setDias} />
          </div>
          <Campo rotulo="Recebe a partir de"><input type="time" value={hora.inicio} onChange={(e) => setHora({ ...hora, inicio: e.target.value })} required /></Campo>
          <Campo rotulo="Recebe até"><input type="time" value={hora.fim} onChange={(e) => setHora({ ...hora, fim: e.target.value })} required /></Campo>
          <Campo rotulo="Armazenamento refrigerado (kg)"><input type="number" min="0" value={f.cap_refrigerado_kg} onChange={(e) => mudar('cap_refrigerado_kg', e.target.value)} /></Campo>
          <Campo rotulo="Armazenamento seco (kg)"><input type="number" min="0" value={f.cap_seco_kg} onChange={(e) => mudar('cap_seco_kg', e.target.value)} /></Campo>
          {faixas.map((r) => (
            <Campo key={r.id} rotulo={`Alunos — ${r.rotulo}`}><input type="number" min="0" value={f.alunos[r.id] ?? ''} onChange={(e) => mudar('alunos', { ...f.alunos, [r.id]: e.target.value })} /></Campo>
          ))}
          <Local t={t} pontos={pontos} lat={f.lat} lng={f.lng} onMudar={(lat, lng) => setF((x: any) => ({ ...x, lat, lng }))} rotulo="Localização da escola" />
        </div>
        <Rodape ocupado={ocupado} erro={erro} onFechar={() => onFechar()} />
      </form>
    </Modal>
  );
}

function FormAgricultor({ item, t, alimentos, pontos, onFechar }: { item: any; t: any; alimentos: any[]; pontos: PontoMapa[]; onFechar: (salvou?: boolean) => void }) {
  const [f, setF] = useState<any>(item ?? { nome: '', tipo: 'individual', documento: '', caf: '', banco: '', agencia: '', conta: '', titular_documento: '', produtos: [], res_lat: null, res_lng: null, areas: [{ nome: '', hectares: '', tipo_via: 'chao', lat: null, lng: null }] });
  const { ocupado, erro, executar } = usarAcao();
  const mudar = (k: string, v: unknown) => setF((x: any) => ({ ...x, [k]: v }));
  const mudarArea = (i: number, k: string, v: unknown) => setF((x: any) => ({ ...x, areas: x.areas.map((a: any, n: number) => (n === i ? { ...a, [k]: v } : a)) }));
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    executar(async () => {
      await api(item ? `/agricultores/${item.id}` : '/agricultores', { metodo: item ? 'PUT' : 'POST', corpo: f });
      onFechar(true);
    });
  };
  return (
    <Modal titulo={item ? 'Editar agricultor' : 'Cadastrar agricultor'} onFechar={() => onFechar()} largo>
      <form onSubmit={salvar}>
        <div className="form">
          <Campo rotulo="Nome da família ou do grupo"><input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} required /></Campo>
          <Campo rotulo="Tipo">
            <select value={f.tipo} onChange={(e) => mudar('tipo', e.target.value)}>{Object.entries(TIPOS_AGRICULTOR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </Campo>
          <Campo rotulo="CPF ou CNPJ"><input value={f.documento ?? ''} onChange={(e) => mudar('documento', e.target.value)} required /></Campo>
          <Campo rotulo="CAF"><input value={f.caf ?? ''} onChange={(e) => mudar('caf', e.target.value)} /></Campo>
          <Campo rotulo="Banco"><input value={f.banco ?? ''} onChange={(e) => mudar('banco', e.target.value)} /></Campo>
          <Campo rotulo="Agência"><input value={f.agencia ?? ''} onChange={(e) => mudar('agencia', e.target.value)} /></Campo>
          <Campo rotulo="Conta corrente"><input value={f.conta ?? ''} onChange={(e) => mudar('conta', e.target.value)} /></Campo>
          <Campo rotulo="CPF ou CNPJ do titular da conta" ajuda="O pagamento só sai para conta em nome do próprio agricultor."><input value={f.titular_documento ?? ''} onChange={(e) => mudar('titular_documento', e.target.value)} /></Campo>
          <div className="campo largo">
            <span>Produtos cultivados</span>
            <Opcoes opcoes={alimentos.filter((a) => a.agricola).map((a) => ({ id: a.id as number, rotulo: a.nome }))} valor={f.produtos} onMudar={(v) => mudar('produtos', v)} />
          </div>
          {f.areas.map((a: any, i: number) => (
            <div key={a.id ?? `n${i}`} className="largo painel" style={{ background: 'var(--semente)' }}>
              <div className="form">
                <Campo rotulo={`Área de plantação ${i + 1}`}><input value={a.nome} onChange={(e) => mudarArea(i, 'nome', e.target.value)} placeholder="Ex.: Roça do Olho d'Água" required /></Campo>
                <Campo rotulo="Tamanho (hectares)"><input type="number" min="0" step="any" value={a.hectares} onChange={(e) => mudarArea(i, 'hectares', e.target.value)} /></Campo>
                <Campo rotulo="Via de acesso" largo ajuda="Entra no cálculo do custo de referência do frete.">
                  <select value={a.tipo_via} onChange={(e) => mudarArea(i, 'tipo_via', e.target.value)}>{Object.entries(TIPOS_VIA).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select>
                </Campo>
                <Local t={t} pontos={pontos} lat={a.lat} lng={a.lng} onMudar={(lat, lng) => setF((x: any) => ({ ...x, areas: x.areas.map((y: any, n: number) => (n === i ? { ...y, lat, lng } : y)) }))} rotulo="Onde fica a plantação" />
              </div>
            </div>
          ))}
          <div className="largo">
            <button type="button" className="botao secundario" onClick={() => mudar('areas', [...f.areas, { nome: '', hectares: '', tipo_via: 'chao', lat: null, lng: null }])}><Plus size={16} aria-hidden /> Adicionar outra área</button>
          </div>
          <Local t={t} pontos={pontos} lat={f.res_lat} lng={f.res_lng} onMudar={(lat, lng) => setF((x: any) => ({ ...x, res_lat: lat, res_lng: lng }))} rotulo="Residência (opcional nesta fase)" />
        </div>
        <Rodape ocupado={ocupado} erro={erro} onFechar={() => onFechar()} />
      </form>
    </Modal>
  );
}

function FormPrestador({ item, t, pontos, onFechar }: { item: any; t: any; pontos: PontoMapa[]; onFechar: (salvou?: boolean) => void }) {
  const [f, setF] = useState<any>(item ?? { nome: '', documento: '', modal: 'moto', capacidade_kg: MODAIS.moto.capacidade_kg, caixa_termica: 0, area_atuacao: '', inscricao_municipal: '', banco: '', agencia: '', conta: '', agricultor_id: '', base_lat: null, base_lng: null });
  const { ocupado, erro, executar } = usarAcao();
  const mudar = (k: string, v: unknown) => setF((x: any) => ({ ...x, [k]: v }));
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    executar(async () => {
      await api(item ? `/prestadores/${item.id}` : '/prestadores', { metodo: item ? 'PUT' : 'POST', corpo: f });
      onFechar(true);
    });
  };
  return (
    <Modal titulo={item ? 'Editar prestador de frete' : 'Cadastrar prestador de frete'} onFechar={() => onFechar()} largo>
      <form onSubmit={salvar}>
        <div className="form">
          <Campo rotulo="Nome"><input value={f.nome} onChange={(e) => mudar('nome', e.target.value)} required /></Campo>
          <Campo rotulo="Documento"><input value={f.documento ?? ''} onChange={(e) => mudar('documento', e.target.value)} required /></Campo>
          <Campo rotulo="Meio de transporte">
            <select value={f.modal} onChange={(e) => setF((x: any) => ({ ...x, modal: e.target.value, capacidade_kg: MODAIS[e.target.value as TipoModal].capacidade_kg }))}>
              {Object.entries(MODAIS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Capacidade de carga (kg)"><input type="number" min="1" value={f.capacidade_kg} onChange={(e) => mudar('capacidade_kg', e.target.value)} required /></Campo>
          <Campo rotulo="Área de atuação"><input value={f.area_atuacao ?? ''} onChange={(e) => mudar('area_atuacao', e.target.value)} /></Campo>
          <Campo rotulo="Inscrição municipal"><input value={f.inscricao_municipal ?? ''} onChange={(e) => mudar('inscricao_municipal', e.target.value)} /></Campo>
          <Campo rotulo="Banco"><input value={f.banco ?? ''} onChange={(e) => mudar('banco', e.target.value)} /></Campo>
          <Campo rotulo="Agência"><input value={f.agencia ?? ''} onChange={(e) => mudar('agencia', e.target.value)} /></Campo>
          <Campo rotulo="Conta para recebimento"><input value={f.conta ?? ''} onChange={(e) => mudar('conta', e.target.value)} /></Campo>
          <Campo rotulo="É um agricultor que entrega a própria produção?">
            <select value={f.agricultor_id ?? ''} onChange={(e) => mudar('agricultor_id', e.target.value)}>
              <option value="">Não</option>
              {t.agricultores.map((a: any) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </Campo>
          <label className="marcar largo"><input type="checkbox" checked={!!f.caixa_termica} onChange={(e) => mudar('caixa_termica', e.target.checked ? 1 : 0)} /> Tem caixa térmica para itens refrigerados</label>
          <Local t={t} pontos={pontos} lat={f.base_lat} lng={f.base_lng} onMudar={(lat, lng) => setF((x: any) => ({ ...x, base_lat: lat, base_lng: lng }))} rotulo="De onde o prestador costuma sair" />
        </div>
        <Rodape ocupado={ocupado} erro={erro} onFechar={() => onFechar()} />
      </form>
    </Modal>
  );
}
