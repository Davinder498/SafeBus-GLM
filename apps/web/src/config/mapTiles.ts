export interface MapTileConfig {
  tileUrl: string | null;
  attribution: string | null;
  isConfigured: boolean;
}

export const unavailableMapTileConfig: MapTileConfig = {
  tileUrl: null,
  attribution: null,
  isConfigured: false,
};
