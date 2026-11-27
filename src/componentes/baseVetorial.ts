// Base vetorial do mapa (MapLibre dentro do Leaflet). Fica num módulo à parte para ser carregada só quando
// há um mapa na tela, e para apontar o worker do MapLibre, que o empacotador não encontra sozinho.
import L from 'leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { MaplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { ESTILO_MAPA, ATRIBUICAO_MAPA } from './estiloMapa';

setWorkerUrl(workerUrl);

// A ligação agenda um quadro no fim da animação de zoom e acessa o mapa nele; se a camada saiu do mapa
// nesse meio-tempo (troca para satélite, mudança de página), o mapa já não existe. Aqui o quadro confere antes.
const BaseVetorial = (MaplibreGL as any).extend({
  _transitionEnd() {
    L.Util.requestAnimFrame(function (this: any) {
      if (!this._map || !this._glMap) return;
      const zoom = this._map.getZoom();
      const center = this._map.getCenter();
      const offset = this._map.latLngToContainerPoint(this._map.getBounds().getNorthWest());
      this._resizeContainer();
      L.DomUtil.setTransform(this._glMap._actualCanvas, offset, 1);
      this._glMap.once('moveend', () => this._map && this._glMap && this._zoomEnd());
      this._glMap.jumpTo({ center, zoom: zoom - 1 });
    }, this);
  },
});

export function criarBaseVetorial(): L.Layer {
  // a ligação repassa customAttribution ao controle de atribuição do Leaflet
  return new BaseVetorial({ style: ESTILO_MAPA, interactive: false, attributionControl: { customAttribution: ATRIBUICAO_MAPA } });
}
