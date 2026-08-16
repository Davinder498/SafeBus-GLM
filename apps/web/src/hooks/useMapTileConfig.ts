import { useEffect, useState } from 'react';
import {
  unavailableMapTileConfig,
  type MapTileConfig,
} from '@/config/mapTiles';
import { getMapTileConfig } from '@/services/mapTileConfigService';

export function useMapTileConfig(): MapTileConfig {
  const [config, setConfig] = useState<MapTileConfig>(unavailableMapTileConfig);

  useEffect(() => {
    let mounted = true;
    void getMapTileConfig().then((nextConfig) => {
      if (mounted) setConfig(nextConfig);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return config;
}
