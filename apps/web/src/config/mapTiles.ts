export interface MapTileConfig {
  tileUrl: string | null;
  attribution: string | null;
  isConfigured: boolean;
}

function cleanPublicEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function createMapTileConfig(env: Pick<ImportMetaEnv, 'VITE_MAP_TILE_URL' | 'VITE_MAP_TILE_ATTRIBUTION'>): MapTileConfig {
  const tileUrl = cleanPublicEnvValue(env.VITE_MAP_TILE_URL);
  const attribution = cleanPublicEnvValue(env.VITE_MAP_TILE_ATTRIBUTION);
  return { tileUrl, attribution, isConfigured: tileUrl !== null && attribution !== null };
}

export const mapTileConfig = createMapTileConfig(import.meta.env);
