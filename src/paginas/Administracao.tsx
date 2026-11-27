import { useEffect, useState } from 'react';
import { api, usarDados, usarSessao } from '../api';
import { Aviso, Cabecalho, Campo, Estado, Opcoes, Painel, usarAcao } from '../componentes/ui';
import { DIAS_SEMANA, MODAIS, PERFIS, TIPOS_VIA, pode } from '../../compartilhado/dominio';

export function Administracao() {
  const { sessao, recarregar: recarregarSessao } = usarSessao();
  const { dados, erro, carregando, recarregar } = usarDados<any>('/parametros');
  const [p, setP] = useState<any>(null);
  const [salvo, setSalvo] = useState(false);
  const [carga, setCarga] = useState<any>(null);
  const { ocupado, erro: erroAcao, executar } = usarAcao();
  const edita = pode(sessao.usuario.perfil, 'parametros.editar');
  useEffect(() => { if (dados) setP(dados.params); }, [dados]);
  const mudar = (k: string, v: unknown) => (setSalvo(false), setP((x: any) => ({ ...x, [k]: v })));
  const numero = (k: string, rotulo: string, opcoes: { ajuda?: string; passo?: string; fator?: number } = {}) => (
    <Campo rotulo={rotulo} ajuda={opcoes.ajuda}>
      <input type="number" step={opcoes.passo ?? 'any'} disabled={!edita} value={p[k] == null ? '' : Number((p[k] * (opcoes.fator ?? 1)).toFixed(4))} onChange={(e) => mudar(k, Number(e.target.value) / (opcoes.fator ?? 1))} />
    </Campo>
  );
  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    executar(async () => { await api('/parametros', { metodo: 'PUT', corpo: p }); setSalvo(true); await recarregar(); });
  };
  const reiniciar = () => {
    if (!window.confirm('Reiniciar o sandbox apaga tudo o que foi feito neste ambiente e recarrega os dados sintéticos. Continuar?')) return;
    executar(async () => { setCarga(await api('/sandbox/reiniciar', { metodo: 'POST' })); recarregarSessao(); await recarregar(); });
  };

  return (
    <>
      <Cabecalho titulo="Administração">Parâmetros de {sessao.municipio.nome}, usuários e ambiente de simulação. Toda alteração fica no log administrativo, com o nome de quem fez.</Cabecalho>
      <Estado carregando={carregando} erro={erro}>
        {dados && p && (
          <div className="pilha">
            {!edita && <Aviso tipo="neutro">Seu perfil consulta os parâmetros; só o controle interno e o operador alteram.</Aviso>}
            <form className="pilha" onSubmit={salvar}>
              <Painel titulo="Frete e roteirização">
                <div className="form">
                  <div className="campo largo"><span>Índice por tipo de via</span><small>Multiplica a distância de ida e volta no custo de referência do frete. Valores iniciais informados pelo cliente.</small></div>
                  {Object.entries(TIPOS_VIA).map(([k, v]) => (
                    <Campo key={k} rotulo={v.rotulo}><input type="number" step="0.01" min="0.1" disabled={!edita} value={p.indices_via[k]} onChange={(e) => mudar('indices_via', { ...p.indices_via, [k]: Number(e.target.value) })} /></Campo>
                  ))}
                  <div className="campo largo"><span>Tabela de frete: valor-base por km de cada meio de transporte (R$)</span><small>Com 1,00, o custo de referência é exatamente km × índice da via.</small></div>
                  {Object.entries(MODAIS).map(([k, v]) => (
                    <Campo key={k} rotulo={v.rotulo}><input type="number" step="0.05" min="0" disabled={!edita} value={p.frete_km[k]} onChange={(e) => mudar('frete_km', { ...p.frete_km, [k]: Number(e.target.value) })} /></Campo>
                  ))}
                  {numero('custo_km_convencional', 'Custo por km do transporte convencional (R$)', { ajuda: 'Usado só no cenário-base de comparação. Valor ilustrativo; ajuste à realidade do município.' })}
                  {numero('fator_tortuosidade', 'Fator de tortuosidade', { ajuda: 'Multiplica a distância em linha reta enquanto não há integração com uma API de rotas.' })}
                  <div className="campo largo">
                    <span>Dias de entrega nas escolas</span>
                    <Opcoes opcoes={DIAS_SEMANA.map((d, i) => ({ id: i + 1, rotulo: d }))} valor={p.dias_entrega} onMudar={(v) => edita && mudar('dias_entrega', v)} />
                    <small>A segunda-feira é sempre dia de entrega. Os alimentos de cada dia chegam na entrega anterior mais próxima.</small>
                  </div>
                </div>
              </Painel>
              <Painel titulo="Auditoria e pagamento">
                <div className="form">
                  {numero('aliquota_iss', 'Alíquota de ISS sobre o frete (%)', { fator: 100, passo: '0.1' })}
                  {numero('raio_evidencia_m', 'Raio aceito para a foto (metros)', { ajuda: 'Distância máxima entre a foto e a plantação ou a escola.' })}
                  {numero('tolerancia_volume', 'Tolerância de quantidade (%)', { fator: 100, passo: '0.5' })}
                  {numero('tolerancia_horario_min', 'Tolerância de horário (minutos)', { ajuda: 'Margem antes e depois da janela de recebimento da escola.' })}
                  <Campo rotulo="Repasses">
                    <select disabled={!edita} value={p.repasse_modo} onChange={(e) => mudar('repasse_modo', e.target.value)}><option value="por_entrega">Um pagamento por entrega validada</option><option value="agrupado">Agrupados em lote por período</option></select>
                  </Campo>
                </div>
              </Painel>
              {erroAcao && <Aviso tipo="erro">{erroAcao}</Aviso>}
              {salvo && <Aviso tipo="ok">Parâmetros salvos. A alteração foi registrada no log administrativo.</Aviso>}
              {edita && <div><button className="botao" disabled={ocupado}>Salvar parâmetros</button></div>}
            </form>

            {dados.usuarios.length > 0 && (
              <Painel titulo="Usuários do município">
                <div className="tabela-rolagem">
                  <table>
                    <thead><tr><th>Nome</th><th>Perfil</th><th>E-mail</th></tr></thead>
                    <tbody>{dados.usuarios.map((u: any) => <tr key={u.id}><td>{u.nome}</td><td>{PERFIS[u.perfil as keyof typeof PERFIS]}</td><td>{u.email}</td></tr>)}</tbody>
                  </table>
                </div>
                <p className="pequeno suave" style={{ marginTop: 10 }}>Cada perfil vê e faz só o que lhe cabe; agricultores, prestadores e escolas enxergam apenas as próprias entregas.</p>
              </Painel>
            )}

            <Painel titulo="Ambiente de simulação">
              <p style={{ maxWidth: '75ch' }}>
                {sessao.sandbox ? 'Este ambiente roda com dados sintéticos: município, pessoas, documentos, preços e entregas são fictícios. Pagamentos, análise de imagem e distâncias são simulados.' : 'O modo de simulação está desligado neste servidor.'}
                {dados.modo_piloto && ' O município está em modo piloto: os indicadores do painel são coletados automaticamente para o estudo de caso.'}
              </p>
              {sessao.sandbox && pode(sessao.usuario.perfil, 'sandbox.operar') && <div style={{ marginTop: 14 }}><button className="botao perigo" disabled={ocupado} onClick={reiniciar}>Reiniciar o sandbox</button></div>}
              {carga && <div style={{ marginTop: 12 }}><Aviso tipo="ok">Sandbox recarregado em {carga.ms} ms: {carga.pedidos} pedidos, {carga.evidencias} evidências e {carga.trilha} registros na trilha.</Aviso></div>}
            </Painel>
          </div>
        )}
      </Estado>
    </>
  );
}
