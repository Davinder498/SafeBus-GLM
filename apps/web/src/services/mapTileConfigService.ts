import {
  unavailableMapTileConfig,
  type MapTileConfig,
} from '@/config/mapTiles';

interface MapTileConfigResponse {
  tileUrl?: unknown;
  attribution?: unknown;
}

const NATIVE_MAP_CONFIG_ENDPOINT =
  'https://bussafe.netlify.app/.netlify/functions/map-tile-config';
const WEB_MAP_CONFIG_ENDPOINT = '/.netlify/functions/map-tile-config';
const GEOAPIFY_TILE_ORIGIN = 'https://maps.geoapify.com';

let configRequest: Promise<MapTileConfig> | null = null;

function isNativeCapacitorOrigin(location: Pick<Location, 'hostname' | 'protocol'>): boolean {
  return location.hostname === 'localhost' && location.protocol === 'https:';
}

export function getMapTileConfigEndpoint(
  location: Pick<Location, 'hostname' | 'protocol'> = window.location,
): string {
  return isNativeCapacitorOrigin(location)
    ? NATIVE_MAP_CONFIG_ENDPOINT
    : WEB_MAP_CONFIG_ENDPOINT;
}

export function parseMapTileConfig(payload: MapTileConfigResponse): MapTileConfig {
  if (typeof payload.tileUrl !== 'string' || typeof payload.attribution !== 'string') {
    return unavailableMapTileConfig;
  }

  try {
    const url = new URL(payload.tileUrl);
    if (
      url.origin !== GEOAPIFY_TILE_ORIGIN ||
      !payload.tileUrl.includes('{z}') ||
      !payload.tileUrl.includes('{x}') ||
      !payload.tileUrl.includes('{y}') ||
      payload.attribution.trim().length === 0
    ) {
      return unavailableMapTileConfig;
    }
  } catch {
    return unavailableMapTileConfig;
  }

  return {
    tileUrl: payload.tileUrl,
    attribution: payload.attribution,
    isConfigured: true,
  };
}

async function requestMapTileConfig(): Promise<MapTileConfig> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(getMapTileConfigEndpoint(), {
        headers: { accept: 'application/json' },
      });
      if (response.ok) {
        const config = parseMapTileConfig((await response.json()) as MapTileConfigResponse);
        if (config.isConfigured) return config;
      }
    } catch {
      // A second immediate attempt covers a transient function/CDN connection failure.
    }
  }
  return unavailableMapTileConfig;
}

export function getMapTileConfig(): Promise<MapTileConfig> {
  configRequest ??= requestMapTileConfig();
  return configRequest;
}
