import { useState } from 'react';
import { api, usarDados, usarSessao, dataBr, numero } from '../api';
import { Aviso, Cabecalho, Estado, Indicador, Modal, Painel, Vazio, usarAcao } from '../componentes/ui';
import { FormEscuta } from '../componentes/Escuta';
import { kg, pct, pode, reais } from '../../compartilhado/dominio';

const area = (ha: number) => (ha < 0.1 ? `${numero(ha * 10000, 0)} m²` : `${numero(ha, 2)} ha`);
const chave = (r: any) => `${r.agricultor_id}-${r.alimento_id}`;

export function Recomendacoes() {
  const { sessao } = usarSessao();
  const { dados: r, erro, carregando, recarregar } = usarDados<any>('/recomendacoes');
  const { dados: t, recarregar: recarregarT } = usarDados<any>('/territorio');
  const { dados: alimentos } = usarDados<any[]>('/alimentos');
  const [fora, setFora] = useState<string[]>([]);
  const [sim, setSim] = useState<any>(null);
  const [escuta, setEscuta] = useState<any>(null);
  const { ocupado, erro: erroSim, executar } = usarAcao();
  const podeEscuta = pode(sessao.usuario.perfil, 'escuta.registrar');
  const escolhidas = (r?.recomendacoes ?? []).filter((x: any) => !fora.includes(chave(x)));
  const simular = () => executar(async () => setSim(await api('/recomendacoes/simular', { corpo: { selecao: escolhidas.map((x: any) => ({ agricultor_id: x.agricultor_id, alimento_id: x.alimento_id })) } })));
  const delta = (v: number, fmt: (n: number) => string) => `${v > 0 ? '+' : ''}${fmt(v)}`;

  return (
    <>
      <Cabecalho titulo="Recomendações de plantio">
        O que o cardápio pede e a oferta local ainda não cobre, e quem declarou que quer e sabe produzir. Nesta fase as recomendações são avaliadas em simulação e não são enviadas aos agricultores.
      </Cabecalho>
      <Estado carregando={carregando} erro={erro}>
        {r && (
          <div className="pilha">
            <Painel titulo={`O que falta para o cardápio-base na semana de ${dataBr(r.semana)}`}>
              {r.lacunas.length ? (
                <div className="tabela-rolagem">
                  <table>
                    <thead><tr><th>Alimento</th><th className="dir">Falta por semana</th><th className="dir">Valor por semana</th><th className="dir">Dias servidos</th><th>Histórico</th></tr></thead>
                    <tbody>
                      {r.lacunas.map((l: any) => (
                        <tr key={l.alimento_id}>
                          <td><strong>{l.alimento}</strong></td><td className="dir">{kg(l.falta_kg)}</td><td className="dir">{reais(l.valor_semanal)}</td><td className="dir">{l.dias_servidos}</td>
                          <td>{!l.semanas_avaliadas ? 'Sem histórico' : l.semanas_com_falta ? `Faltou em ${l.semanas_com_falta} das últimas ${l.semanas_avaliadas} semanas` : `Coberto por trocas nas últimas ${l.semanas_avaliadas} semanas`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Vazio titulo="A oferta local cobre o cardápio-base" />}
            </Painel>

            <Painel titulo="Quem pode plantar o quê" acoes={escolhidas.length > 0 && <button className="botao" onClick={simular} disabled={ocupado}>Simular o efeito das {escolhidas.length} selecionadas</button>}>
              {r.recomendacoes.length ? (
                <div className="tabela-rolagem">
                  <table>
                    <thead><tr><th><span className="sr">Incluir na simulação</span></th><th>Agricultor</th><th>Plantar</th><th className="dir">Volume estimado</th><th className="dir">Área</th><th>Quando</th><th className="dir">Receita estimada</th><th>Por que esta pessoa</th></tr></thead>
                    <tbody>
                      {r.recomendacoes.map((x: any) => (
                        <tr key={chave(x)}>
                          <td><input type="checkbox" style={{ width: 18, height: 18, accentColor: 'var(--verde)' }} checked={!fora.includes(chave(x))} onChange={(e) => (setSim(null), setFora(e.target.checked ? fora.filter((k) => k !== chave(x)) : [...fora, chave(x)]))} aria-label={`Incluir ${x.alimento} de ${x.agricultor} na simulação`} /></td>
                          <td><strong>{x.agricultor}</strong></td><td>{x.alimento}</td><td className="dir">{kg(x.kg_semana)} por semana</td><td className="dir">{area(x.area_ha)}</td>
                          <td>Plantar até {dataBr(x.plantar_ate)}; colher a partir de {dataBr(x.colher_a_partir)} {!x.na_safra && <span className="selo atencao">Fora da safra</span>}</td>
                          <td className="dir">{reais(x.receita_semanal)} por semana</td><td className="pequeno">{x.motivos.join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Vazio titulo="Nenhuma recomendação no momento">As recomendações aparecem quando há lacuna no cardápio e agricultores com escuta registrada.</Vazio>}
              {erroSim && <div style={{ marginTop: 12 }}><Aviso tipo="erro">{erroSim}</Aviso></div>}
              {r.sem_candidato.length > 0 && <div style={{ marginTop: 12 }}><Aviso>Nenhum agricultor declarou interesse em {r.sem_candidato.join(', ')}. Vale conversar com os produtores sobre esses itens.</Aviso></div>}
              <p className="pequeno suave" style={{ marginTop: 10 }}>Volume, área e receita são estimativas a partir de produtividade e ciclo médios e do preço definido pelo gestor. Não são garantia de compra nem de renda.</p>
            </Painel>

            {sim && (
              <Painel titulo="Se essas recomendações forem adotadas">
                <div className="grade g4">
                  <Indicador valor={pct(sim.pct_af.depois, 1)} rotulo="Do valor do cardápio-base vindo da agricultura familiar" nota={`Hoje: ${pct(sim.pct_af.antes, 1)} (${delta(sim.pct_af.variacao * 100, (n) => `${numero(n)} p.p.`)})`} />
                  <Indicador valor={kg(sim.falta_kg.depois)} rotulo="Ainda sem oferta local por semana" nota={`Hoje: ${kg(sim.falta_kg.antes)}`} />
                  <Indicador valor={reais(sim.custo.depois)} rotulo="Custo da semana" nota={`${delta(sim.custo.variacao, reais)} com o frete local embutido`} />
                  <Indicador valor={pct(sim.adequacao.depois, 1)} rotulo="Adequação da alternativa combinada" nota={`Hoje: ${pct(sim.adequacao.antes, 1)}; trocas caem de ${sim.substituicoes.antes} para ${sim.substituicoes.depois}`} />
                </div>
              </Painel>
            )}

            <Painel titulo="Escuta dos agricultores">
              {r.agricultores_sem_escuta.length > 0 && <div style={{ marginBottom: 12 }}><Aviso>Ainda sem escuta registrada: {r.agricultores_sem_escuta.join(', ')}. Sem ela, a pessoa não entra nas recomendações.</Aviso></div>}
              <div className="tabela-rolagem">
                <table>
                  <thead><tr><th>Agricultor</th><th>Quer plantar</th><th>Sabe plantar</th><th className="dir">Área livre</th><th>Água</th><th /></tr></thead>
                  <tbody>
                    {(t?.agricultores ?? []).map((a: any) => {
                      const nomes = (ids?: number[]) => (ids ?? []).map((i) => alimentos?.find((x) => x.id === i)?.nome).filter(Boolean).join(', ') || '—';
                      return (
                        <tr key={a.id}>
                          <td><strong>{a.nome}</strong></td><td className="pequeno">{nomes(a.escuta?.quer)}</td><td className="pequeno">{nomes(a.escuta?.sabe)}</td>
                          <td className="dir">{a.escuta ? `${numero(a.escuta.area_ha)} ha` : '—'}</td><td className="pequeno">{a.escuta ? { sim: 'O ano todo', sazonal: 'Nas chuvas', nao: 'Não tem' }[a.escuta.agua as 'sim'] : '—'}</td>
                          <td className="dir">{podeEscuta && <button className="botao texto" onClick={() => setEscuta(a)}>{a.escuta ? 'Atualizar' : 'Registrar'}</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Painel>
          </div>
        )}
      </Estado>
      {escuta && (
        <Modal titulo={`Escuta de ${escuta.nome}`} onFechar={() => setEscuta(null)} largo>
          <FormEscuta agricultorId={escuta.id} escuta={escuta.escuta} alimentos={alimentos ?? []} onSalvar={() => (recarregar(), recarregarT(), setSim(null))} />
        </Modal>
      )}
    </>
  );
}
