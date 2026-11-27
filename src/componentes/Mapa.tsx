import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api';

// Mapa sobre base cartográfica real (OpenStreetMap). O município, as pessoas e os pontos são fictícios;
// a base vem sem nomes de lugares para não misturar o território simulado com os nomes reais.

export type PontoMapa = { id: string; tipo: 'escola' | 'area' | 'prestador' | 'marcado'; lat: number; lng: number; rotulo: string; destaque?: boolean };
type LatLng = [number, number];
export type Trajeto = {
  fonte: 'malha_viaria' | 'aproximado'; km: number | null; geometria: LatLng[]; marcos: number[]; acessos: [LatLng, LatLng][];
  saida: { lat: number; lng: number; rotulo: string } | null;
};
export type RotaMapa = { id: string | number; cor: string; paradas: { lat: number; lng: number; tipo: 'coleta' | 'entrega'; nome?: string }[]; rotulo?: string; trajeto?: Trajeto | null };
export type Veiculo = { lat: number; lng: number; rotulo: string };

export const CORES_ROTA = ['#145C43', '#B5732A', '#3E7E8E', '#71A541', '#7A4E8C', '#24372D', '#C4504A', '#4F6DB0', '#8A8F2A', '#E2AA3B'];

const CAMADAS = {
  // reserva para navegadores sem WebGL, que não desenham a base vetorial
  mapa: { rotulo: 'Mapa', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', atribuicao: 'Base &copy; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', nativo: 16, classe: 'fundo-mapa' },
  satelite: { rotulo: 'Satélite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', atribuicao: 'Imagens &copy; Esri, Maxar, Earthstar Geographics', nativo: 17, classe: 'fundo-satelite' },
} as const;
type Camada = keyof typeof CAMADAS;

const lerCamada = (): Camada => {
  try {
    const c = localStorage.getItem('cv:camada');
    return c === 'satelite' ? 'satelite' : 'mapa';
  } catch {
    return 'mapa';
  }
};

let webgl: boolean | undefined;
const temWebGL = () => {
  if (webgl === undefined) {
    try {
      const c = document.createElement('canvas');
      webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      webgl = false;
    }
  }
  return webgl;
};

const icone = (html: string, tam: number, classe = '') => L.divIcon({ html, className: `marcador ${classe}`, iconSize: [tam, tam], iconAnchor: [tam / 2, tam / 2] });
function iconePonto(p: PontoMapa) {
  const r = p.destaque ? 12 : 9, t = r * 2 + 4, c = t / 2;
  const svg = (corpo: string) => `<svg width="${t}" height="${t}" viewBox="0 0 ${t} ${t}" aria-hidden="true">${corpo}</svg>`;
  if (p.tipo === 'escola') return icone(svg(`<rect x="2" y="2" width="${r * 2}" height="${r * 2}" rx="3.5" fill="#145C43" stroke="#fff" stroke-width="2"/>`), t);
  if (p.tipo === 'area') return icone(svg(`<path d="M${c},${c + r} C${c - r * 1.5},${c - r * 0.2} ${c - r * 0.4},${c - r * 1.3} ${c},${c - r * 1.2} C${c + r * 0.4},${c - r * 1.3} ${c + r * 1.5},${c - r * 0.2} ${c},${c + r} Z" fill="#71A541" stroke="#fff" stroke-width="2"/>`), t);
  if (p.tipo === 'prestador') return icone(svg(`<path d="M${c},${c - r} L${c + r},${c} L${c},${c + r} L${c - r},${c} Z" fill="#24372D" stroke="#fff" stroke-width="2"/>`), t);
  return icone(svg(`<circle cx="${c}" cy="${c}" r="8" fill="#E2AA3B" stroke="#24372D" stroke-width="2"/>`), t);
}
const iconeParada = (n: number) => icone(`<span class="marcador-parada">${n}</span>`, 24);
const ICONE_SAIDA = icone('<span class="marcador-saida"></span>', 16);
const ICONE_SEDE = icone('<span class="marcador-sede"></span>', 14);
const ICONE_VEICULO = icone('<span class="marcador-veiculo"></span>', 22, 'veiculo');

/** Anel do território: escurece levemente o que fica fora do raio atendido. */
function mascara(centro: { lat: number; lng: number }, raioKm: number) {
  const kx = 111.32 * Math.cos((centro.lat * Math.PI) / 180);
  const furo: LatLng[] = Array.from({ length: 96 }, (_, i) => {
    const a = (i / 96) * 2 * Math.PI;
    return [centro.lat + (Math.sin(a) * raioKm) / 110.57, centro.lng + (Math.cos(a) * raioKm) / kx];
  });
  const mundo: LatLng[] = [[-85, -180], [-85, 180], [85, 180], [85, -180]];
  return L.polygon([mundo, furo], { stroke: false, fillColor: '#24372D', fillOpacity: 0.16, interactive: false });
}

/** Linha suave entre paradas, usada só quando o traçado pelas estradas não está disponível. */
function curva(ps: LatLng[]): LatLng[] {
  const out: LatLng[] = [];
  ps.forEach((p, i) => {
    if (i === 0) return void out.push(p);
    const a = ps[i - 1];
    const m: LatLng = [(a[0] + p[0]) / 2 - (p[1] - a[1]) * 0.12, (a[1] + p[1]) / 2 + (p[0] - a[0]) * 0.12];
    for (let k = 1; k <= 12; k++) {
      const t = k / 12, u = 1 - t;
      out.push([u * u * a[0] + 2 * u * t * m[0] + t * t * p[0], u * u * a[1] + 2 * u * t * m[1] + t * t * p[1]]);
    }
  });
  return out;
}

export function Mapa({ centro, raioKm, pontos = [], rotas = [], onMarcar, onPonto, altura, veiculo }: {
  centro?: { lat: number; lng: number }; raioKm?: number; pontos?: PontoMapa[]; rotas?: RotaMapa[];
  onMarcar?: (lat: number, lng: number) => void; onPonto?: (p: PontoMapa) => void; altura?: number; veiculo?: Veiculo | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapa = useRef<L.Map | null>(null);
  const grupos = useRef<Record<'territorio' | 'rotas' | 'pontos' | 'paradas', L.LayerGroup> | null>(null);
  const fundo = useRef<L.Layer | null>(null);
  const marcadorVeiculo = useRef<L.Marker | null>(null);
  const [camada, setCamada] = useState<Camada>(lerCamada);
  const eventos = useRef({ onMarcar, onPonto });
  eventos.current = { onMarcar, onPonto };

  // cria o mapa uma vez
  useEffect(() => {
    const m = L.map(el.current!, { scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: true, maxZoom: 18 });
    m.attributionControl.setPrefix(false);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);
    // a roda do mouse só dá zoom depois que a pessoa clica no mapa, para não prender a rolagem da página
    m.on('focus click', () => m.scrollWheelZoom.enable());
    m.on('blur mouseout', () => m.scrollWheelZoom.disable());
    m.on('click', (e: L.LeafletMouseEvent) => eventos.current.onMarcar?.(e.latlng.lat, e.latlng.lng));
    grupos.current = { territorio: L.layerGroup().addTo(m), rotas: L.layerGroup().addTo(m), pontos: L.layerGroup().addTo(m), paradas: L.layerGroup().addTo(m) };
    mapa.current = m;
    const obs = new ResizeObserver(() => m.invalidateSize());
    obs.observe(el.current!);
    return () => {
      obs.disconnect();
      m.remove();
      mapa.current = null;
    };
  }, []);

  // camada de fundo: base vetorial nas cores da marca, ou imagem de satélite
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const m = mapa.current!;
      const c = CAMADAS[camada];
      let novo: L.Layer;
      if (camada === 'mapa' && temWebGL()) {
        novo = (await import('./baseVetorial')).criarBaseVetorial();
      } else {
        novo = L.tileLayer(c.url, { attribution: c.atribuicao, maxNativeZoom: c.nativo, maxZoom: 18, className: c.classe });
      }
      if (cancelado || !mapa.current) return;
      fundo.current?.remove();
      fundo.current = novo.addTo(m);
    })();
    try {
      localStorage.setItem('cv:camada', camada);
    } catch { /* sem armazenamento local: só não lembra a escolha */ }
    return () => { cancelado = true; };
  }, [camada]);

  // território: raio atendido e sede
  useEffect(() => {
    const g = grupos.current!.territorio;
    g.clearLayers();
    if (!centro || !raioKm) return;
    mascara(centro, raioKm).addTo(g);
    L.circle([centro.lat, centro.lng], { radius: raioKm * 1000, color: '#145C43', weight: 1.5, dashArray: '6 8', fill: false, interactive: false }).addTo(g);
    L.marker([centro.lat, centro.lng], { icon: ICONE_SEDE, keyboard: false, interactive: false })
      .bindTooltip('Sede', { permanent: true, direction: 'right', offset: [6, 0], className: 'rotulo-mapa discreto' }).addTo(g);
  }, [centro?.lat, centro?.lng, raioKm]);

  // pontos cadastrados (as páginas recriam a lista a cada renderização; só redesenha quando ela muda)
  const chavePontos = pontos.map((p) => `${p.id}@${p.lat},${p.lng}${p.destaque ? '*' : ''}${p.rotulo}`).join('|');
  useEffect(() => {
    const g = grupos.current!.pontos;
    g.clearLayers();
    for (const p of pontos) {
      const mk = L.marker([p.lat, p.lng], { icon: iconePonto(p), title: p.rotulo, zIndexOffset: p.destaque ? 500 : p.tipo === 'escola' ? 200 : 0, keyboard: !!eventos.current.onPonto })
        .bindTooltip(p.rotulo, { permanent: !!p.destaque, direction: 'top', offset: [0, -10], className: 'rotulo-mapa' })
        .addTo(g);
      mk.on('click', (e) => {
        if (!eventos.current.onPonto) return;
        L.DomEvent.stopPropagation(e);
        eventos.current.onPonto(p);
      });
    }
  }, [chavePontos]); // eslint-disable-line react-hooks/exhaustive-deps

  // rotas: traçado pelas estradas, acessos fora da malha e paradas numeradas quando há uma só rota
  const chaveRotas = rotas.map((r) => `${r.id}:${r.trajeto ? r.trajeto.fonte + r.trajeto.geometria.length : '-'}`).join('|');
  useEffect(() => {
    const g = grupos.current!.rotas, gp = grupos.current!.paradas;
    g.clearLayers();
    gp.clearLayers();
    const unica = rotas.length === 1;
    for (const r of rotas) {
      const t = r.trajeto;
      const real = t?.fonte === 'malha_viaria';
      const linha: LatLng[] = real ? t!.geometria : curva([...(t?.saida ? [[t.saida.lat, t.saida.lng] as LatLng] : []), ...r.paradas.map((p) => [p.lat, p.lng] as LatLng)]);
      L.polyline(linha, { color: '#fff', weight: unica ? 8 : 6, opacity: 0.85, interactive: false }).addTo(g);
      const pl = L.polyline(linha, { color: r.cor, weight: unica ? 5 : 3.5, opacity: 0.95, dashArray: real ? undefined : '8 8', lineJoin: 'round' }).addTo(g);
      if (r.rotulo) pl.bindTooltip(r.rotulo, { sticky: true, className: 'rotulo-mapa' });
      for (const [a, b] of t?.acessos ?? []) L.polyline([a, b], { color: r.cor, weight: 2.5, dashArray: '2 6', opacity: 0.9, interactive: false }).addTo(g);
      if (unica) {
        if (t?.saida) L.marker([t.saida.lat, t.saida.lng], { icon: ICONE_SAIDA }).bindTooltip(t.saida.rotulo, { direction: 'top', className: 'rotulo-mapa' }).addTo(gp);
        r.paradas.forEach((p, i) =>
          L.marker([p.lat, p.lng], { icon: iconeParada(i + 1), zIndexOffset: 800 })
            .bindTooltip(`${i + 1}. ${p.tipo === 'coleta' ? 'Coleta' : 'Entrega'}${p.nome ? ` em ${p.nome}` : ''}`, { direction: 'top', offset: [0, -10], className: 'rotulo-mapa' })
            .addTo(gp),
        );
      }
    }
  }, [chaveRotas]); // eslint-disable-line react-hooks/exhaustive-deps

  // enquadramento: o território inteiro, ou a rota escolhida
  const focoRota = rotas.length === 1 ? `${rotas[0].id}:${rotas[0].trajeto?.fonte ?? ''}` : '';
  useEffect(() => {
    const m = mapa.current!;
    const unica = rotas.length === 1 ? rotas[0] : null;
    const pts: LatLng[] = unica
      ? [...(unica.trajeto?.fonte === 'malha_viaria' ? unica.trajeto.geometria : []), ...unica.paradas.map((p) => [p.lat, p.lng] as LatLng), ...(unica.trajeto?.saida ? [[unica.trajeto.saida.lat, unica.trajeto.saida.lng] as LatLng] : [])]
      : [];
    if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 16 });
    else if (centro && raioKm) m.fitBounds(L.latLng(centro.lat, centro.lng).toBounds(raioKm * 2000), { padding: [8, 8] });
    else if (pontos.length) m.fitBounds(L.latLngBounds(pontos.map((p) => [p.lat, p.lng] as LatLng)), { padding: [36, 36], maxZoom: 15 });
    else m.setView([-14, -52], 4);
  }, [focoRota, centro?.lat, centro?.lng, raioKm]); // eslint-disable-line react-hooks/exhaustive-deps

  // veículo da simulação do percurso
  useEffect(() => {
    const m = mapa.current!;
    if (!veiculo) {
      marcadorVeiculo.current?.remove();
      marcadorVeiculo.current = null;
      return;
    }
    if (!marcadorVeiculo.current) {
      marcadorVeiculo.current = L.marker([veiculo.lat, veiculo.lng], { icon: ICONE_VEICULO, zIndexOffset: 1000, interactive: false })
        .bindTooltip(veiculo.rotulo, { permanent: true, direction: 'right', offset: [12, 0], className: 'rotulo-mapa veiculo' })
        .addTo(m);
    } else {
      marcadorVeiculo.current.setLatLng([veiculo.lat, veiculo.lng]);
      marcadorVeiculo.current.setTooltipContent(veiculo.rotulo);
    }
    // acompanha o veículo quando ele chega perto da borda
    if (!m.getBounds().pad(-0.15).contains([veiculo.lat, veiculo.lng])) m.panTo([veiculo.lat, veiculo.lng], { animate: true, duration: 0.6 });
  }, [veiculo?.lat, veiculo?.lng, veiculo?.rotulo, veiculo]);

  return (
    <div className={`mapa ${onMarcar ? 'marcavel' : ''}`} style={altura ? { height: altura } : undefined}>
      <div ref={el} className="mapa-tela" role="region" aria-label="Mapa do território, com escolas, áreas de plantação e rotas" />
      <div className="mapa-camadas" role="group" aria-label="Fundo do mapa">
        {(Object.keys(CAMADAS) as Camada[]).map((c) => (
          <button key={c} type="button" className={c === camada ? 'ligada' : ''} aria-pressed={c === camada} onClick={() => setCamada(c)}>{CAMADAS[c].rotulo}</button>
        ))}
      </div>
    </div>
  );
}

/** Busca o traçado das rotas pelas estradas; guarda em memória para não repetir a busca. */
const trajetosEmCache = new Map<number, Promise<Trajeto | null>>();
export function usarTrajetos(ids: number[]) {
  const [trajetos, setTrajetos] = useState<Record<number, Trajeto | null>>({});
  const chave = ids.join(',');
  useEffect(() => {
    let vivo = true;
    for (const id of ids) {
      if (!trajetosEmCache.has(id)) trajetosEmCache.set(id, api<Trajeto>(`/rotas/${id}/trajeto`).catch(() => (trajetosEmCache.delete(id), null)));
      trajetosEmCache.get(id)!.then((t) => vivo && setTrajetos((atual) => (atual[id] === t ? atual : { ...atual, [id]: t })));
    }
    return () => { vivo = false; };
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  return trajetos;
}

export function LegendaMapa({ rotas = false, trajetos }: { rotas?: boolean; trajetos?: (Trajeto | null | undefined)[] }) {
  const aproximado = trajetos?.some((t) => t?.fonte === 'aproximado');
  return (
    <div className="legenda">
      <span><i style={{ background: '#145C43' }} />Escola</span>
      <span><i style={{ background: '#71A541', borderRadius: '50% 50% 50% 50% / 40% 40% 60% 60%' }} />Área de plantação</span>
      <span><i style={{ background: '#24372D', transform: 'rotate(45deg) scale(0.8)' }} />Prestador de frete</span>
      {rotas && <span><i className="tracejado" />Acesso fora das estradas mapeadas</span>}
      {rotas && <span><i style={{ background: '#E2AA3B', borderRadius: '50%' }} />Parada numerada: escolha uma rota para ver a ordem</span>}
      <span className="suave">{aproximado ? 'Sem conexão com o serviço de rotas: algumas rotas aparecem em linha aproximada (tracejada).' : 'Base cartográfica real; município, pessoas e pontos são simulados.'}</span>
    </div>
  );
}
