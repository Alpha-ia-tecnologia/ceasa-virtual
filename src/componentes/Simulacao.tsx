import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { Trajeto, Veiculo } from './Mapa';

// Simulação do percurso de uma rota no mapa: o veículo anda pelo traçado nas estradas seguindo os horários
// planejados (saída, chegada e saída de cada parada, espera pela janela da escola).

type LatLng = [number, number];
type Parada = { tipo: 'coleta' | 'entrega'; nome: string; lat: number; lng: number; chegada: string; saida: string; espera_min?: number };
type Rota = { inicio: string; fim: string; paradas: Parada[] };
type Trecho =
  | { tipo: 'andar'; de: number; ate: number; linha: LatLng[]; acum: number[]; texto: string }
  | { tipo: 'parar'; de: number; ate: number; ponto: LatLng; texto: (t: number) => string };

const minutos = (h: string) => {
  const [a, b] = h.split(':').map(Number);
  return a * 60 + b;
};
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

function comprimentos(linha: LatLng[]) {
  const acum = [0];
  for (let i = 1; i < linha.length; i++) {
    const [a, b] = [linha[i - 1], linha[i]];
    const kx = Math.cos((a[0] * Math.PI) / 180);
    acum.push(acum[i - 1] + Math.hypot(b[0] - a[0], (b[1] - a[1]) * kx));
  }
  return acum;
}

function montar(rota: Rota, t: Trajeto): Trecho[] {
  const ps = rota.paradas;
  if (!ps.length) return [];
  const desloc = t.saida ? 1 : 0;
  const trechos: Trecho[] = [];
  let livre = t.saida ? minutos(rota.inicio) : minutos(ps[0].chegada);
  let anterior: LatLng = t.saida ? [t.saida.lat, t.saida.lng] : [ps[0].lat, ps[0].lng];
  ps.forEach((p, i) => {
    const chegada = Math.max(livre, minutos(p.chegada));
    const acao = p.tipo === 'coleta' ? 'Coletando em' : 'Entregando em';
    if (i > 0 || t.saida) {
      const a = t.marcos[i + desloc - 1], b = t.marcos[i + desloc];
      const linha = a != null && b != null && b > a ? t.geometria.slice(a, b + 1) : [anterior, [p.lat, p.lng] as LatLng];
      trechos.push({ tipo: 'andar', de: livre, ate: chegada, linha, acum: comprimentos(linha), texto: `A caminho de ${p.nome} (${p.tipo === 'coleta' ? 'coleta' : 'entrega'}, parada ${i + 1} de ${ps.length})` });
    }
    const saida = Math.max(chegada, minutos(p.saida));
    const espera = p.espera_min ?? 0;
    trechos.push({ tipo: 'parar', de: chegada, ate: saida, ponto: [p.lat, p.lng], texto: (m) => (espera > 0 && m < chegada + espera ? `Esperando abrir a janela de ${p.nome}` : `${acao} ${p.nome}`) });
    livre = saida;
    anterior = [p.lat, p.lng];
  });
  return trechos;
}

function posicao(tr: Trecho, m: number): LatLng {
  if (tr.tipo === 'parar') return tr.ponto;
  const total = tr.acum[tr.acum.length - 1];
  const f = tr.ate > tr.de ? Math.min(1, Math.max(0, (m - tr.de) / (tr.ate - tr.de))) : 1;
  const alvo = f * total;
  let k = 1;
  while (k < tr.acum.length - 1 && tr.acum[k] < alvo) k++;
  const [a, b] = [tr.linha[k - 1], tr.linha[k]];
  const seg = tr.acum[k] - tr.acum[k - 1] || 1;
  const g = Math.min(1, Math.max(0, (alvo - tr.acum[k - 1]) / seg));
  return [a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g];
}

const VELOCIDADES = [
  { id: 5, rotulo: 'Devagar' },
  { id: 12, rotulo: 'Normal' },
  { id: 30, rotulo: 'Rápido' },
];

/** Controla a simulação e devolve a posição do veículo para o mapa. */
export function usarSimulacao(rota: Rota | null, trajeto: Trajeto | null | undefined) {
  const trechos = useMemo(() => (rota && trajeto ? montar(rota, trajeto) : []), [rota, trajeto]);
  const inicio = trechos[0]?.de ?? 0, fim = trechos[trechos.length - 1]?.ate ?? 0;
  const [agora, setAgora] = useState<number | null>(null);
  const [tocando, setTocando] = useState(false);
  const [velocidade, setVelocidade] = useState(12);
  const ref = useRef({ agora: inicio, ultimo: 0 });

  useEffect(() => { setTocando(false); setAgora(null); }, [trechos]);

  useEffect(() => {
    if (!tocando) return;
    let quadro = 0;
    ref.current.ultimo = performance.now();
    const passo = (t: number) => {
      const dt = (t - ref.current.ultimo) / 1000;
      ref.current.ultimo = t;
      const m = Math.min(fim, ref.current.agora + dt * velocidade);
      ref.current.agora = m;
      setAgora(m);
      if (m >= fim) return setTocando(false);
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [tocando, velocidade, fim]);

  const tocar = () => {
    if (agora == null || agora >= fim) ref.current.agora = inicio;
    else ref.current.agora = agora;
    setAgora(ref.current.agora);
    setTocando(true);
  };
  const recomecar = () => {
    ref.current.agora = inicio;
    setAgora(inicio);
    setTocando(true);
  };
  const parar = () => setTocando(false);

  let veiculo: Veiculo | null = null, situacao = '';
  if (agora != null && trechos.length) {
    const tr = trechos.find((x) => agora <= x.ate) ?? trechos[trechos.length - 1];
    const [lat, lng] = posicao(tr, agora);
    situacao = agora >= fim ? `Percurso concluído às ${hhmm(fim)}.` : tr.tipo === 'andar' ? tr.texto : tr.texto(agora);
    veiculo = { lat, lng, rotulo: hhmm(agora) };
  }
  return { disponivel: trechos.length > 0, veiculo, situacao, agora, inicio, fim, tocando, tocar, parar, recomecar, velocidade, setVelocidade };
}

export function ControlesSimulacao({ s }: { s: ReturnType<typeof usarSimulacao> }) {
  if (!s.disponivel) return null;
  const iniciada = s.agora != null;
  return (
    <div className="simulacao">
      {s.tocando ? (
        <button type="button" className="botao" onClick={s.parar}><Pause size={16} aria-hidden /> Pausar</button>
      ) : (
        <button type="button" className="botao" onClick={s.tocar}><Play size={16} aria-hidden /> {iniciada && s.agora! < s.fim ? 'Continuar' : 'Simular o percurso'}</button>
      )}
      {iniciada && <button type="button" className="botao texto" onClick={s.recomecar}><RotateCcw size={16} aria-hidden /> Recomeçar</button>}
      <span className="relogio">{hhmm(s.agora ?? s.inicio)}</span>
      <span className="situacao" aria-live="polite">{iniciada ? s.situacao : `Saída às ${hhmm(s.inicio)}, término às ${hhmm(s.fim)}. Veja o veículo andar pelas estradas no horário planejado.`}</span>
      <label className="pequeno linha-flex" style={{ gap: 6 }}>
        Velocidade
        <select className="entrada curta" value={s.velocidade} onChange={(e) => s.setVelocidade(Number(e.target.value))}>
          {VELOCIDADES.map((v) => <option key={v.id} value={v.id}>{v.rotulo}</option>)}
        </select>
      </label>
    </div>
  );
}
