import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api, usarDados, usarSessao, dataBr, numero, somarDias } from '../api';
import { Abas, Aviso, Cabecalho, Campo, Estado, Modal, Painel, Vazio, usarAcao } from '../componentes/ui';
import { GRUPOS, kg, pode, reais } from '../../compartilhado/dominio';

const MESES = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export function Ofertas() {
  const { sessao } = usarSessao();
  const { dados: c, erro, carregando, recarregar } = usarDados<any>('/ofertas/consolidado');
  const { dados: lotes, recarregar: recarregarLotes } = usarDados<any[]>('/ofertas');
  const [aba, setAba] = useState<'saldo' | 'lotes' | 'safra'>('saldo');
  const [nova, setNova] = useState(false);
  const registrar = pode(sessao.usuario.perfil, 'ofertas.registrar');
  const vence = (d: string) => (d <= somarDias(sessao.hoje, 2) ? 'atencao' : '');

  return (
    <>
      <Cabecalho titulo="Oferta agrícola" acoes={registrar && <button className="botao" onClick={() => setNova(true)}><Plus size={18} aria-hidden /> Registrar oferta</button>}>
        O que os agricultores têm para entregar, quanto já está comprometido em pedidos e até quando cada lote pode ser consumido.
      </Cabecalho>
      <Estado carregando={carregando} erro={erro}>
        {c && (
          <>
            <Abas ativa={aba} onMudar={setAba} abas={[{ id: 'saldo', rotulo: 'Saldo por produto' }, { id: 'lotes', rotulo: 'Lotes', conta: lotes?.length }, { id: 'safra', rotulo: 'Calendário de safra' }]} />
            {aba === 'saldo' && (c.por_alimento.length ? (
              <div className="tabela-rolagem">
                <table>
                  <thead><tr><th>Produto</th><th>Grupo</th><th className="dir">Ofertado</th><th className="dir">Comprometido</th><th className="dir">Disponível</th><th style={{ width: 160 }}>Uso</th><th className="dir">Agricultores</th><th>Vence primeiro em</th></tr></thead>
                  <tbody>
                    {c.por_alimento.map((a: any) => (
                      <tr key={a.alimento_id}>
                        <td><strong>{a.alimento}</strong></td><td className="pequeno">{GRUPOS[a.grupo as keyof typeof GRUPOS]}</td>
                        <td className="dir">{kg(a.total_kg)}</td><td className="dir">{kg(a.comprometido_kg)}</td><td className="dir"><strong>{kg(a.saldo_kg)}</strong></td>
                        <td><div className="barra" title={`${numero((a.comprometido_kg / a.total_kg) * 100, 0)}% comprometido`}><i style={{ width: `${(a.comprometido_kg / a.total_kg) * 100}%` }} /></div></td>
                        <td className="dir">{a.agricultores}</td>
                        <td><span className={`selo ${vence(a.proxima_data_limite)}`}>{dataBr(a.proxima_data_limite)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Painel><Vazio titulo="Nenhuma oferta em aberto">Quando os agricultores registrarem o que vão colher, o saldo aparece aqui.</Vazio></Painel>)}
            {aba === 'lotes' && (
              <div className="tabela-rolagem">
                <table>
                  <thead><tr><th>Produto</th><th>Agricultor</th><th>Área</th><th className="dir">Quantidade</th><th className="dir">Disponível</th><th>Colheita</th><th>Consumir até</th><th>Coleta</th><th className="dir">Preço pedido</th></tr></thead>
                  <tbody>
                    {(lotes ?? []).map((o) => (
                      <tr key={o.id}>
                        <td><strong>{o.alimento}</strong></td><td>{o.agricultor}</td><td className="pequeno">{o.area}</td>
                        <td className="dir">{kg(o.quantidade_kg)}</td><td className="dir">{kg(o.saldo_kg)}</td><td>{dataBr(o.data_colheita)}</td>
                        <td><span className={`selo ${vence(o.data_limite)}`}>{dataBr(o.data_limite)}</span></td><td className="num">{o.coleta_inicio}–{o.coleta_fim}</td>
                        <td className="dir">{o.preco_kg ? `${reais(o.preco_kg)}/kg` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {aba === 'safra' && (
              <Painel titulo="Quando cada produto do município costuma ter safra">
                <div className="tabela-rolagem">
                  <table>
                    <thead><tr><th>Produto</th><th><div className="safra" style={{ textAlign: 'center' }}>{MESES.map((m, i) => <span key={i}>{m}</span>)}</div></th><th>Neste mês</th></tr></thead>
                    <tbody>
                      {c.calendario.map((a: any) => (
                        <tr key={a.alimento_id}>
                          <td><strong>{a.alimento}</strong></td>
                          <td><div className="safra" role="img" aria-label={`Safra de ${a.alimento} ao longo do ano`}>{a.meses.map((v: number, i: number) => <i key={i} className={i === c.mes_atual ? 'agora' : ''} style={{ opacity: 0.12 + v * 0.88 }} title={`${MESES[i]}: ${numero(v * 100, 0)}%`} />)}</div></td>
                          <td><span className={`selo ${a.agora >= 0.7 ? 'ok' : a.agora >= 0.45 ? '' : 'atencao'}`}>{a.agora >= 0.7 ? 'Safra cheia' : a.agora >= 0.45 ? 'Oferta média' : 'Entressafra'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="pequeno suave" style={{ marginTop: 10 }}>Quanto mais forte o verde, maior a oferta esperada no mês. No ambiente de simulação o histórico de safras é sintético.</p>
              </Painel>
            )}
          </>
        )}
      </Estado>
      {nova && <NovaOferta onFechar={(s) => (setNova(false), s && (recarregar(), recarregarLotes()))} />}
    </>
  );
}

export function NovaOferta({ onFechar, agricultorFixo }: { onFechar: (salvou?: boolean) => void; agricultorFixo?: number }) {
  const { sessao } = usarSessao();
  const { dados: t } = usarDados<any>('/territorio');
  const { dados: alimentos } = usarDados<any[]>('/alimentos');
  const [f, setF] = useState<any>({ agricultor_id: agricultorFixo ?? '', area_id: '', alimento_id: '', quantidade_kg: '', data_colheita: sessao.hoje, coleta_inicio: '06:00', coleta_fim: '09:00', preco_kg: '' });
  const { ocupado, erro, executar } = usarAcao();
  const ag = t?.agricultores.find((a: any) => a.id === Number(f.agricultor_id));
  const areas = ag?.areas ?? [];
  const produtos = (alimentos ?? []).filter((a) => a.agricola).sort((a, b) => Number(ag?.produtos.includes(b.id)) - Number(ag?.produtos.includes(a.id)));
  const al = alimentos?.find((a) => a.id === Number(f.alimento_id));
  const areaId = f.area_id || (areas.length === 1 ? areas[0].id : '');
  return (
    <Modal titulo="Registrar oferta" onFechar={() => onFechar()}>
      <form onSubmit={(e) => { e.preventDefault(); executar(async () => { await api('/ofertas', { corpo: { ...f, area_id: areaId } }); onFechar(true); }); }}>
        <div className="form">
          {!agricultorFixo && (
            <Campo rotulo="Agricultor" largo>
              <select value={f.agricultor_id} onChange={(e) => setF({ ...f, agricultor_id: e.target.value, area_id: '' })} required>
                <option value="">Escolha</option>{t?.agricultores.map((a: any) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </Campo>
          )}
          <Campo rotulo="Produto">
            <select value={f.alimento_id} onChange={(e) => setF({ ...f, alimento_id: e.target.value })} required>
              <option value="">Escolha</option>{produtos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Quantidade (kg)"><input type="number" min="0.5" step="0.5" value={f.quantidade_kg} onChange={(e) => setF({ ...f, quantidade_kg: e.target.value })} required /></Campo>
          {areas.length > 1 && (
            <Campo rotulo="De qual área sai" largo>
              <select value={f.area_id} onChange={(e) => setF({ ...f, area_id: e.target.value })} required><option value="">Escolha</option>{areas.map((a: any) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select>
            </Campo>
          )}
          <Campo rotulo="Dia da colheita" ajuda={al?.validade_dias ? `${al.nome} pode ser consumido até ${dataBr(somarDias(f.data_colheita, al.validade_dias))}.` : undefined}><input type="date" value={f.data_colheita} onChange={(e) => setF({ ...f, data_colheita: e.target.value })} required /></Campo>
          <Campo rotulo="Preço que espera receber (R$/kg)" ajuda="Informativo. O preço pago é o definido pela prefeitura."><input type="number" min="0" step="0.01" value={f.preco_kg} onChange={(e) => setF({ ...f, preco_kg: e.target.value })} /></Campo>
          <Campo rotulo="Pode buscar a partir de"><input type="time" value={f.coleta_inicio} onChange={(e) => setF({ ...f, coleta_inicio: e.target.value })} /></Campo>
          <Campo rotulo="Pode buscar até"><input type="time" value={f.coleta_fim} onChange={(e) => setF({ ...f, coleta_fim: e.target.value })} /></Campo>
        </div>
        {erro && <div style={{ marginTop: 14 }}><Aviso tipo="erro">{erro}</Aviso></div>}
        <div className="modal-pe"><button type="button" className="botao secundario" onClick={() => onFechar()}>Cancelar</button><button className="botao" disabled={ocupado}>Registrar oferta</button></div>
      </form>
    </Modal>
  );
}
