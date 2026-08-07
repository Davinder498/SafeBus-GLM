export interface MapTileConfig {
  tileUrl: string | null;
  attribution: string | null;
  isConfigured: boolean;
}

// No production map provider is approved. Keep the existing controlled
// fallback until a named milestone introduces a server-managed provider
// configuration without adding frontend environment variables.
export const mapTileConfig: MapTileConfig = {
  tileUrl: null,
  attribution: null,
  isConfigured: false,
};
