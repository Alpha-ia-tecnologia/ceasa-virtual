// Estilo da base vetorial (OpenFreeMap, esquema OpenMapTiles) nas cores da marca.
// Sem nomes de lugares: o território simulado não se mistura com os nomes reais. As estradas de terra
// aparecem tracejadas, porque é por elas que passa boa parte das rotas da agricultura familiar.

const z = (pares: [number, number][]) => ['interpolate', ['exponential', 1.5], ['zoom'], ...pares.flat()];

const PRINCIPAIS = ['motorway', 'trunk', 'primary'];
const MEDIAS = ['secondary', 'tertiary'];
const LOCAIS = ['minor', 'service'];
const terra = ['any', ['==', ['get', 'class'], 'track'], ['in', ['get', 'surface'], ['literal', ['unpaved', 'dirt', 'gravel', 'ground', 'sand']]]];
const classe = (cs: string[]) => ['in', ['get', 'class'], ['literal', cs]];

export const ESTILO_MAPA = {
  version: 8,
  sources: {
    omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '' },
  },
  layers: [
    { id: 'fundo', type: 'background', paint: { 'background-color': '#F0ECDF' } },
    { id: 'cultivo', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: classe(['farmland', 'grass']), paint: { 'fill-color': '#E7E8D2', 'fill-opacity': 0.8 } },
    { id: 'mata', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: classe(['wood', 'forest']), paint: { 'fill-color': '#D5E0C2', 'fill-opacity': 0.85 } },
    { id: 'alagado', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: classe(['wetland']), paint: { 'fill-color': '#D8E4D8' } },
    { id: 'parque', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': '#D9E4C8', 'fill-opacity': 0.7 } },
    { id: 'urbano', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: classe(['residential', 'suburb', 'neighbourhood', 'commercial', 'retail', 'industrial']), paint: { 'fill-color': '#E8E0CD' } },
    { id: 'escolas-area', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: classe(['school', 'kindergarten']), paint: { 'fill-color': '#E2E7D3' } },
    { id: 'rios', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': '#9FC2C8', 'line-width': z([[8, 0.6], [12, 1.4], [16, 3]]) } },
    { id: 'agua', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': '#B9D3D6' } },
    { id: 'predios', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': '#DDD3BD', 'fill-outline-color': '#CFC3A8' } },

    // estradas de terra e trilhas
    { id: 'trilhas', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 13, filter: classe(['path']), paint: { 'line-color': '#B8A57A', 'line-width': z([[13, 0.6], [17, 1.4]]), 'line-dasharray': [2, 2] } },
    { id: 'terra-borda', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['all', terra, ['!', classe(PRINCIPAIS)]], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#C9B78C', 'line-width': z([[9, 0.8], [12, 2.2], [16, 7]]) } },
    { id: 'terra', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 11, filter: ['all', terra, ['!', classe(PRINCIPAIS)]], paint: { 'line-color': '#F7F1E1', 'line-width': z([[11, 0.6], [12, 1], [16, 4.5]]), 'line-dasharray': [3, 1.5] } },

    // ruas e estradas pavimentadas
    { id: 'locais-borda', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12, filter: ['all', classe(LOCAIS), ['!', terra]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#D3C8AE', 'line-width': z([[12, 1.2], [16, 9]]) } },
    { id: 'locais', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12, filter: ['all', classe(LOCAIS), ['!', terra]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FFFFFF', 'line-width': z([[12, 0.6], [16, 7]]) } },
    { id: 'medias-borda', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['all', classe(MEDIAS), ['!', terra]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#CDBF9E', 'line-width': z([[8, 1], [12, 3.2], [16, 12]]) } },
    { id: 'medias', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['all', classe(MEDIAS), ['!', terra]], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FFFDF7', 'line-width': z([[8, 0.5], [12, 2], [16, 9.5]]) } },
    { id: 'principais-borda', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: classe(PRINCIPAIS), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#C9A961', 'line-width': z([[6, 1], [10, 3], [16, 15]]) } },
    { id: 'principais', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: classe(PRINCIPAIS), layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FBEBC4', 'line-width': z([[6, 0.6], [10, 2], [16, 12]]) } },
  ],
};

export const ATRIBUICAO_MAPA = '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a>, dados &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
