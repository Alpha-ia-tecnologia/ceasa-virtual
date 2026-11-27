import { useState } from 'react';
import { Camera } from 'lucide-react';
import { api, usarSessao, numero } from '../api';
import { Aviso, Campo, usarAcao } from './ui';
import { CHECKLIST_ESG } from '../../compartilhado/dominio';

// Registro de evidência na origem e no destino [RF-AUD-01]: foto obrigatória, localização, data e hora.

/** Reduz a foto para envio em conexões fracas (lado maior de até 1280 px). */
async function reduzir(arquivo: File): Promise<string> {
  const img = await createImageBitmap(arquivo);
  const f = Math.min(1, 1280 / Math.max(img.width, img.height));
  const tela = document.createElement('canvas');
  tela.width = Math.round(img.width * f);
  tela.height = Math.round(img.height * f);
  tela.getContext('2d')!.drawImage(img, 0, 0, tela.width, tela.height);
  return tela.toDataURL('image/jpeg', 0.82);
}

/** Só no sandbox: gera uma imagem única para testar o fluxo sem câmera. */
function imagemDeExemplo(texto: string): string {
  const tela = document.createElement('canvas');
  tela.width = 800;
  tela.height = 520;
  const c = tela.getContext('2d')!;
  c.fillStyle = '#F5F2E9';
  c.fillRect(0, 0, 800, 520);
  for (let i = 0; i < 60; i++) {
    c.fillStyle = ['#71A541', '#E2AA3B', '#145C43'][i % 3];
    c.globalAlpha = 0.25 + Math.random() * 0.5;
    c.beginPath();
    c.arc(Math.random() * 800, 180 + Math.random() * 320, 14 + Math.random() * 34, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  c.fillStyle = '#145C43';
  c.font = '700 30px Arial';
  c.fillText('Imagem de exemplo — simulação', 32, 64);
  c.fillStyle = '#24372D';
  c.font = '20px Arial';
  c.fillText(texto, 32, 100);
  c.fillText(new Date().toLocaleString('pt-BR'), 32, 130);
  return tela.toDataURL('image/jpeg', 0.8);
}

const posicaoDoAparelho = () =>
  new Promise<{ lat: number; lng: number }>((ok, falha) => {
    if (!navigator.geolocation) return falha(new Error('Este aparelho não informa a localização.'));
    navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), () => falha(new Error('Não foi possível obter a localização. Ative o GPS e permita o acesso.')), { enableHighAccuracy: true, timeout: 15000 });
  });

export function FormEvidencia({ pedido, ponto, papel, onConcluir }: { pedido: any; ponto: 'origem' | 'destino'; papel: 'agricultor' | 'prestador' | 'escola'; onConcluir: (r: any) => void }) {
  const { sessao } = usarSessao();
  const [foto, setFoto] = useState<string | null>(null);
  const [itens, setItens] = useState<any[]>(pedido.itens.map((i: any) => ({ pedido_item_id: i.id, kg: i.quantidade_kg, qualidade: 'conforme' })));
  const [checklist, setChecklist] = useState<Record<string, boolean>>(Object.fromEntries(CHECKLIST_ESG.map((c) => [c.id, true])));
  const [km, setKm] = useState('');
  const [observacao, setObservacao] = useState('');
  const [simular, setSimular] = useState(sessao.sandbox);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const { ocupado, erro, executar } = usarAcao();
  const mudarItem = (id: number, parte: object) => setItens((l) => l.map((i) => (i.pedido_item_id === id ? { ...i, ...parte } : i)));
  const escolher = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arq = e.target.files?.[0];
    if (!arq) return;
    try {
      setFoto(await reduzir(arq));
      setErroLocal(null);
    } catch {
      setErroLocal('Não foi possível ler a foto. Tente tirar outra.');
    }
  };
  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foto) return setErroLocal('A foto é obrigatória.');
    setErroLocal(null);
    executar(async () => {
      let pos: { lat?: number; lng?: number } = {};
      if (!simular) {
        try {
          pos = await posicaoDoAparelho();
        } catch (x) {
          setErroLocal((x as Error).message);
          return;
        }
      }
      const r = await api(`/pedidos/${pedido.id}/evidencias`, {
        corpo: { ponto, papel, foto, ...pos, km: papel === 'prestador' ? km : undefined, itens: papel === 'prestador' ? undefined : itens, checklist: papel === 'escola' ? checklist : undefined, observacao, simulacao: simular ? { posicao: 'planejada', horario: 'planejado' } : undefined },
      });
      onConcluir(r);
    });
  };
  const titulo = papel === 'agricultor' ? 'Foto da carga na plantação' : papel === 'escola' ? 'Foto dos alimentos recebidos' : 'Foto da entrega na escola';

  return (
    <form className="pilha" style={{ gap: 16 }} onSubmit={enviar}>
      <div className="campo">
        <span>{titulo}</span>
        {foto && <img className="foto-previa" src={foto} alt="Prévia da foto" />}
        <label className="botao secundario grande" style={{ cursor: 'pointer' }}>
          <Camera size={22} aria-hidden /> {foto ? 'Tirar outra foto' : 'Tirar foto'}
          <input type="file" accept="image/*" capture="environment" onChange={escolher} className="sr" />
        </label>
        {sessao.sandbox && <button type="button" className="botao texto" onClick={() => setFoto(imagemDeExemplo(`Pedido ${pedido.id} — ${papel}`))}>Usar imagem de exemplo (simulação)</button>}
      </div>

      {papel !== 'prestador' && (
        <div className="campo">
          <span>{papel === 'agricultor' ? 'Quanto está saindo de cada item' : 'Quanto chegou de cada item'}</span>
          {pedido.itens.map((i: any) => {
            const v = itens.find((x) => x.pedido_item_id === i.id);
            return (
              <div key={i.id} className="linha-flex" style={{ padding: '6px 0', borderTop: '1px solid var(--linha)' }}>
                <span style={{ flex: 1, minWidth: 130 }}><strong>{i.alimento}</strong><br /><span className="pequeno suave">Pedido: {numero(i.quantidade_kg, 2)} kg</span></span>
                <input className="entrada curta" type="number" min="0" step="any" inputMode="decimal" value={v.kg} onChange={(e) => mudarItem(i.id, { kg: e.target.value })} aria-label={`Quilos de ${i.alimento}`} /> kg
                {papel === 'escola' && (
                  <select className="entrada" style={{ width: 'auto' }} value={v.qualidade} onChange={(e) => mudarItem(i.id, { qualidade: e.target.value })} aria-label={`Qualidade de ${i.alimento}`}>
                    <option value="conforme">Em bom estado</option><option value="parcial">Parte com problema</option><option value="nao_conforme">Sem condição de uso</option>
                  </select>
                )}
              </div>
            );
          })}
        </div>
      )}

      {papel === 'prestador' && <Campo rotulo="Quilometragem na chegada" ajuda="O número que aparece no painel do veículo. A pé ou de bicicleta, informe a distância percorrida em km."><input type="number" min="0" step="any" value={km} onChange={(e) => setKm(e.target.value)} required inputMode="decimal" /></Campo>}

      {papel === 'escola' && (
        <div className="campo">
          <span>Como a carga chegou</span>
          {CHECKLIST_ESG.map((c) => (
            <label className="marcar" key={c.id}><input type="checkbox" checked={!!checklist[c.id]} onChange={(e) => setChecklist({ ...checklist, [c.id]: e.target.checked })} /> {c.rotulo}</label>
          ))}
        </div>
      )}

      <Campo rotulo="Observação (se quiser)"><textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} /></Campo>

      {sessao.sandbox ? (
        <label className="marcar"><input type="checkbox" checked={simular} onChange={(e) => setSimular(e.target.checked)} /> Usar a posição e o horário planejados (simulação). Desmarque para usar o GPS e o relógio deste aparelho.</label>
      ) : <p className="pequeno suave">A localização, a data e a hora deste aparelho são registradas junto com a foto.</p>}

      {(erroLocal || erro) && <Aviso tipo="erro">{erroLocal ?? erro}</Aviso>}
      <button className="botao grande" disabled={ocupado}>{ocupado ? 'Enviando…' : papel === 'agricultor' ? 'Registrar a saída da carga' : papel === 'escola' ? 'Confirmar o recebimento' : 'Registrar a chegada'}</button>
    </form>
  );
}
