import { useState } from 'react';
import { api, usarDados, dataHoraBr } from '../api';
import { Aviso, Cabecalho, Estado, Painel, usarAcao } from '../componentes/ui';
import { PERFIS } from '../../compartilhado/dominio';

export function Trilha() {
  const [categoria, setCategoria] = useState('');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<number | null>(null);
  const [verificacao, setVerificacao] = useState<any>(null);
  const { dados, erro, carregando } = usarDados<any>(`/trilha?categoria=${categoria}&busca=${encodeURIComponent(busca)}`);
  const { ocupado, executar } = usarAcao();
  const detalhe = (texto: string) => {
    try {
      return Object.entries(JSON.parse(texto)).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' | ');
    } catch {
      return texto;
    }
  };
  return (
    <>
      <Cabecalho titulo="Trilha de auditoria" acoes={<button className="botao secundario" disabled={ocupado} onClick={() => executar(async () => setVerificacao(await api('/trilha/verificar')))}>Verificar a integridade</button>}>
        Quem fez o quê e quando, do pedido ao pagamento, e todas as ações administrativas. Cada registro carrega a impressão digital do anterior; nenhum pode ser alterado ou apagado.
      </Cabecalho>
      <div className="pilha">
        {verificacao && (verificacao.integra
          ? <Aviso tipo="ok">Cadeia íntegra: os {verificacao.registros} registros foram recalculados e nenhum foi alterado.</Aviso>
          : <Aviso tipo="erro">A cadeia foi quebrada no registro #{verificacao.falha_em}. Algum registro foi adulterado fora da plataforma.</Aviso>)}
        <div className="linha-flex">
          <select className="entrada" style={{ width: 'auto' }} value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Tipo de registro">
            <option value="">Operação e administração</option><option value="operacao">Só operação</option><option value="admin">Só ações administrativas</option>
          </select>
          <input className="entrada" style={{ maxWidth: 320 }} placeholder="Buscar por ação ou pessoa" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
          {dados && <span className="pequeno suave">{dados.total} registro(s); mostrando os {dados.registros.length} mais recentes.</span>}
        </div>
        <Estado carregando={carregando} erro={erro}>
          {dados && (
            <Painel>
              <div className="tabela-rolagem">
                <table>
                  <thead><tr><th>Nº</th><th>Quando</th><th>Quem</th><th>O que aconteceu</th><th>Sobre</th><th>Impressão digital</th></tr></thead>
                  <tbody>
                    {dados.registros.map((t: any) => (
                      <tr key={t.seq} className="clicavel" onClick={() => setAberto(aberto === t.seq ? null : t.seq)}>
                        <td className="num">{t.seq}</td><td>{dataHoraBr(t.em)}</td>
                        <td>{t.usuario_nome}<div className="pequeno suave">{PERFIS[t.perfil as keyof typeof PERFIS] ?? 'Sistema'}</div></td>
                        <td>{t.acao}{t.categoria === 'admin' && <span className="selo liso" style={{ marginLeft: 8 }}>Administrativo</span>}{aberto === t.seq && <div className="pequeno suave" style={{ marginTop: 4, wordBreak: 'break-word' }}>{detalhe(t.detalhe)}</div>}</td>
                        <td className="pequeno">{t.entidade ? `${t.entidade}${t.entidade_id ? ` ${t.entidade_id}` : ''}` : '—'}</td>
                        <td className="hash" title={t.hash}>{t.hash.slice(0, 16)}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="pequeno suave" style={{ marginTop: 10 }}>Toque numa linha para ver os detalhes do registro.</p>
            </Painel>
          )}
        </Estado>
      </div>
    </>
  );
}
