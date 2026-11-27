// Provedor geográfico [RF-LOG-03]. Na Fase 1 as distâncias são estimadas localmente:
// linha reta (haversine) multiplicada por um fator de tortuosidade parametrizável.
// A integração com uma API de rotas (tipo Distance Matrix) substitui esta implementação sem mudar quem a usa.

export type Ponto = { lat: number; lng: number };

const R = 6371;
const rad = (g: number) => (g * Math.PI) / 180;

export function linhaRetaKm(a: Ponto, b: Ponto): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface ProvedorGeo {
  distanciaKm(a: Ponto, b: Ponto): number;
}

export function provedorLocal(fatorTortuosidade: number): ProvedorGeo {
  return { distanciaKm: (a, b) => linhaRetaKm(a, b) * fatorTortuosidade };
}

/** Desloca um ponto em metros (norte, leste). Usado para dados sintéticos e simulação de posição. */
export function deslocar(p: Ponto, norteM: number, lesteM: number): Ponto {
  return {
    lat: p.lat + norteM / 111320,
    lng: p.lng + lesteM / (111320 * Math.cos(rad(p.lat))),
  };
}
