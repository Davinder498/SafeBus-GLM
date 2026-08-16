import { describe, expect, it } from 'vitest';
import {
  getMapTileConfigEndpoint,
  parseMapTileConfig,
} from '@/services/mapTileConfigService';

describe('map tile configuration', () => {
  it('uses the deployed function for the Capacitor HTTPS localhost origin', () => {
    expect(getMapTileConfigEndpoint({ hostname: 'localhost', protocol: 'https:' })).toBe(
      'https://bussafe.netlify.app/.netlify/functions/map-tile-config',
    );
  });

  it('uses the same-origin function for web builds', () => {
    expect(getMapTileConfigEndpoint({ hostname: 'bussafe.netlify.app', protocol: 'https:' })).toBe(
      '/.netlify/functions/map-tile-config',
    );
  });

  it('accepts only the approved Geoapify XYZ tile endpoint', () => {
    expect(
      parseMapTileConfig({
        tileUrl:
          'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=public-key',
        attribution: 'Provider attribution',
      }),
    ).toEqual({
      tileUrl:
        'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=public-key',
      attribution: 'Provider attribution',
      isConfigured: true,
    });

    expect(
      parseMapTileConfig({
        tileUrl: 'https://unapproved.example/{z}/{x}/{y}.png',
        attribution: 'Unapproved provider',
      }).isConfigured,
    ).toBe(false);
  });
});
