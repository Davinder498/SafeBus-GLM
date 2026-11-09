import { useEffect, useState } from 'react';
import {
  unavailableMapTileConfig,
  type MapTileConfig,
} from '@/config/mapTiles';
import { getMapTileConfig, MAP_CONFIG_RETRY_DELAY_MS } from '@/services/mapTileConfigService';

export function useMapTileConfig(): MapTileConfig {
  const [config, setConfig] = useState<MapTileConfig>(unavailableMapTileConfig);

  useEffect(() => {
    let mounted = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const load = () => {
      void getMapTileConfig().then((nextConfig) => {
        if (!mounted) return;
        setConfig(nextConfig);
        // The fallback remains visible. Retry only after a bounded cooldown,
        // avoiding a permanently cached outage or an aggressive failure loop.
        if (!nextConfig.isConfigured) {
          retryTimer = setTimeout(load, MAP_CONFIG_RETRY_DELAY_MS);
        }
      });
    };
    load();
    return () => {
      mounted = false;
      if (retryTimer !== null) clearTimeout(retryTimer);
    };
  }, []);

  return config;
}
