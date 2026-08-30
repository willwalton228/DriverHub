declare module "leaflet.heat" {
  import * as L from "leaflet";

  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: { [stop: number]: string };
  }

  interface HeatLayer extends L.Layer {
    setLatLngs(latlngs: L.HeatLatLngTuple[]): this;
    addLatLng(latlng: L.HeatLatLngTuple): this;
    setOptions(options: HeatLayerOptions): this;
    redraw(): this;
  }

  namespace L {
    type HeatLatLngTuple = [number, number, number?];
    function heatLayer(latlngs: HeatLatLngTuple[], options?: HeatLayerOptions): HeatLayer;
  }
}

declare module "leaflet" {
  type HeatLatLngTuple = [number, number, number?];

  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: { [stop: number]: string };
  }

  interface HeatLayer extends Layer {
    setLatLngs(latlngs: HeatLatLngTuple[]): this;
    addLatLng(latlng: HeatLatLngTuple): this;
    setOptions(options: HeatLayerOptions): this;
    redraw(): this;
  }

  function heatLayer(latlngs: HeatLatLngTuple[], options?: HeatLayerOptions): HeatLayer;
}
