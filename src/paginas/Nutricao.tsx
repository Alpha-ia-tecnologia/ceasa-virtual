import { useState } from 'react';
import { Upload } from 'lucide-react';
import { api, usarDados, usarSessao, numero, dataBr } from '../api';
import { Aviso, Cabecalho, Campo, Estado, Modal, Painel, usarAcao } from '../componentes/ui';
import { GRUPOS, pct, pode } from '../../compartilhado/dominio';

export function Nutricao() {
  const { sessao } = usarSessao();
  const { dados: alimentos, recarregar } = usarDados<any[]>('/alimentos');
  const { dados: n, erro, carregando, recarregar: recarregarN } = usarDados<any>('/nutricao');
  const [grupo, setGrupo] = useState('');
  const [edicao, setEdicao] = useState<any>(null);
  const [importar, setImportar] = useState(false);
  const editar = pode(sessao.usuario.perfil, 'nutricao.editar');
  const atualizar = () => (recarregar(), recarregarN());
  const lista = (alimentos ?? []).filter((a) => !grupo || a.grupo === grupo);

  return (
    <>
      <Cabecalho titulo="Base nutricional" acoes={editar && <button className="botao secundario" onClick={() => setImportar(true)}><Upload size={18} aria-hidden /> Importar tabela de composição</button>}>
        Composição dos alimentos, referências do PNAE por faixa etária e perecibilidade de cada gênero. É daqui que saem a adequação dos cardápios e a data-limite dos lotes.
      </Cabecalho>
      <Estado carregando={carregando} erro={erro}>
        {n && (
          <div className="pilha">
            <div className="grade g-lado">
              <Painel titulo="Cobertura da base">
                <div className="linha-flex" style={{ alignItems: 'baseline' }}>
                  <b className="num" style={{ fontSize: '2.4rem', color: 'var(--verde)' }}>{pct(n.cobertura.indice, 1)}</b>
                  <span>dos {n.cobertura.total} ingredientes de referência estão completos. Meta da Fase 1: acima de {pct(n.cobertura.meta)}.</span>
                </div>
                <div className="barra" style={{ margin: '12px 0' }}><i className={n.cobertura.indice >= n.cobertura.meta ? '' : 'ocre'} style={{ width: `${n.cobertura.indice * 100}%` }} /></div>
                {n.cobertura.pendencias.length ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {n.cobertura.pendencias.map((p: any) => <li key={p.id}><strong>{p.nome}</strong>: falta {p.falta.join(' e ')}.</li>)}
                  </ul>
                ) : <p>Nenhuma pendência.</p>}
                <p className="pequeno suave" style={{ marginTop: 10 }}>Conta como completo o ingrediente com composição nutricional, perecibilidade e, quando agrícola, produto correspondente. A fórmula ainda depende de confirmação do cliente (decisão 1 da especificação).</p>
              </Painel>
              <Painel titulo="Referências por refeição">
                <div className="tabela-rolagem">
                  <table>
                    <thead><tr><th>Faixa</th><th className="dir">Energia</th><th className="dir">Cálcio</th><th className="dir">Ferro</th><th className="dir">Vit. C</th></tr></thead>
                    <tbody>{n.referencias.map((r: any) => <tr key={r.id}><td>{r.rotulo}</td><td className="dir">{r.kcal} kcal</td><td className="dir">{r.calcio} mg</td><td className="dir">{numero(r.ferro)} mg</td><td className="dir">{r.vit_c} mg</td></tr>)}</tbody>
                  </table>
                </div>
                <p className="pequeno suave" style={{ marginTop: 10 }}>Proteínas de {pct(n.criterios.faixa_macro.ptn[0])} a {pct(n.criterios.faixa_macro.ptn[1])} da energia, carboidratos de {pct(n.criterios.faixa_macro.cho[0])} a {pct(n.criterios.faixa_macro.cho[1])} e lipídios de {pct(n.criterios.faixa_macro.lip[0])} a {pct(n.criterios.faixa_macro.lip[1])}.</p>
              </Painel>
            </div>
            {sessao.sandbox && <Aviso>Os valores deste ambiente são aproximados e servem só para demonstração. Antes do uso real, importe a tabela oficial de composição e confira as referências com a resolução vigente do FNDE.</Aviso>}
            <Painel titulo="Alimentos" acoes={
              <select className="entrada" style={{ width: 'auto' }} value={grupo} onChange={(e) => setGrupo(e.target.value)} aria-label="Filtrar por grupo">
                <option value="">Todos os grupos</option>
                {Object.entries(GRUPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            }>
              <div className="tabela-rolagem">
                <table>
                  <thead><tr><th>Alimento (por 100 g, cru)</th><th>Grupo</th><th className="dir">kcal</th><th className="dir">Prot.</th><th className="dir">Carb.</th><th className="dir">Lip.</th><th className="dir">Cálcio</th><th className="dir">Ferro</th><th className="dir">Vit. C</th><th className="dir">Dura</th><th>Guarda</th><th>Origem</th></tr></thead>
                  <tbody>
                    {lista.map((a) => (
                      <tr key={a.id} className={editar ? 'clicavel' : ''} onClick={() => editar && setEdicao(a)}>
                        <td><strong>{a.nome}</strong> <span className="pequeno suave">{a.codigo}</span></td>
                        <td className="pequeno">{GRUPOS[a.grupo as keyof typeof GRUPOS]}</td>
                        <td className="dir">{numero(a.kcal, 0)}</td><td className="dir">{numero(a.ptn)}</td><td className="dir">{numero(a.cho)}</td><td className="dir">{numero(a.lip)}</td>
                        <td className="dir">{numero(a.calcio, 0)}</td><td className="dir">{numero(a.ferro)}</td><td className="dir">{numero(a.vit_c)}</td>
                        <td className="dir">{a.validade_dias == null ? <span className="selo atencao">Falta</span> : `${a.validade_dias} d`}</td>
                        <td className="pequeno">{a.armazenamento}</td>
                        <td>{a.agricola ? <span className="selo ok">Agricultura familiar</span> : <span className="selo liso">Convencional</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="pequeno suave" style={{ marginTop: 10 }}>
                Versões importadas: {n.versoes.map((v: any) => `${v.rotulo} (${dataBr(v.importado_em)}, ${v.total} itens)`).join('; ')}.
              </p>
            </Painel>
          </div>
        )}
      </Estado>
      {edicao && <EditarAlimento a={edicao} onFechar={(s) => (setEdicao(null), s && atualizar())} />}
      {importar && <Importar onFechar={(s) => (setImportar(false), s && atualizar())} />}
    </>
  );
}

function EditarAlimento({ a, onFechar }: { a: any; onFechar: (salvou?: boolean) => void }) {
  const [f, setF] = useState<any>({ ...a });
  const { ocupado, erro, executar } = usarAcao();
  const campo = (k: string, rotulo: string) => <Campo rotulo={rotulo}><input type="number" min="0" step="any" value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Campo>;
  return (
    <Modal titulo={a.nome} onFechar={() => onFechar()}>
      <form onSubmit={(e) => { e.preventDefault(); executar(async () => { await api(`/alimentos/${a.id}`, { metodo: 'PUT', corpo: f }); onFechar(true); }); }}>
        <div className="form">
          {campo('kcal', 'Energia (kcal)')}{campo('ptn', 'Proteínas (g)')}{campo('cho', 'Carboidratos (g)')}{campo('lip', 'Lipídios (g)')}
          {campo('calcio', 'Cálcio (mg)')}{campo('ferro', 'Ferro (mg)')}{campo('vit_c', 'Vitamina C (mg)')}{campo('fibra', 'Fibra (g)')}
          {campo('validade_dias', 'Dura quantos dias depois da colheita')}{campo('percapita_padrao_g', 'Per capita padrão (g)')}
          <Campo rotulo="Como guardar">
            <select value={f.armazenamento ?? 'ambiente'} onChange={(e) => setF({ ...f, armazenamento: e.target.value })}><option value="seco">Seco</option><option value="ambiente">Ambiente</option><option value="refrigerado">Refrigerado</option></select>
          </Campo>
          <Campo rotulo="Produto agrícola correspondente"><input value={f.produto_agricola ?? ''} onChange={(e) => setF({ ...f, produto_agricola: e.target.value })} /></Campo>
          <label className="marcar largo"><input type="checkbox" checked={!!f.agricola} onChange={(e) => setF({ ...f, agricola: e.target.checked })} /> Pode ser comprado da agricultura familiar</label>
        </div>
        {erro && <div style={{ marginTop: 14 }}><Aviso tipo="erro">{erro}</Aviso></div>}
        <div className="modal-pe"><button type="button" className="botao secundario" onClick={() => onFechar()}>Cancelar</button><button className="botao" disabled={ocupado}>Salvar alimento</button></div>
      </form>
    </Modal>
  );
}

function Importar({ onFechar }: { onFechar: (salvou?: boolean) => void }) {
  const [f, setF] = useState({ rotulo: '', fonte: '', csv: '' });
  const [resultado, setResultado] = useState<any>(null);
  const { ocupado, erro, executar } = usarAcao();
  return (
    <Modal titulo="Importar tabela de composição" onFechar={() => onFechar(!!resultado)} largo>
      {resultado ? (
        <>
          <Aviso tipo="ok">Importação concluída: {resultado.novos} alimentos novos e {resultado.atualizados} atualizados. A versão ficou no histórico.</Aviso>
          <div className="modal-pe"><button className="botao" onClick={() => onFechar(true)}>Fechar</button></div>
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); executar(async () => setResultado(await api('/nutricao/importar', { corpo: f }))); }}>
          <div className="form">
            <Campo rotulo="Nome da versão"><input value={f.rotulo} onChange={(e) => setF({ ...f, rotulo: e.target.value })} placeholder="Ex.: TACO 4ª edição" required /></Campo>
            <Campo rotulo="Fonte"><input value={f.fonte} onChange={(e) => setF({ ...f, fonte: e.target.value })} /></Campo>
            <Campo rotulo="Conteúdo em CSV" largo ajuda="Cabeçalho: codigo;nome;grupo;kcal;ptn;cho;lip;fibra;calcio;ferro;vit_c. Códigos já existentes são atualizados; os demais são criados.">
              <textarea style={{ minHeight: 180, fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }} value={f.csv} onChange={(e) => setF({ ...f, csv: e.target.value })} required />
            </Campo>
          </div>
          {erro && <div style={{ marginTop: 14 }}><Aviso tipo="erro">{erro}</Aviso></div>}
          <div className="modal-pe"><button type="button" className="botao secundario" onClick={() => onFechar()}>Cancelar</button><button className="botao" disabled={ocupado}>Importar tabela</button></div>
        </form>
      )}
    </Modal>
  );
}
