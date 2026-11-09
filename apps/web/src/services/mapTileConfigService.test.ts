import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMapTileConfigEndpoint, parseMapTileConfig } from '@/services/mapTileConfigService';

describe('map tile configuration', () => {
  it('uses the deployed function for the Capacitor HTTPS localhost origin', () => {
    expect(getMapTileConfigEndpoint({ hostname: 'localhost', protocol: 'https:' })).toBe(
      'https://safebus.kids/.netlify/functions/map-tile-config',
    );
  });

  it('uses the same-origin function for web builds', () => {
    expect(getMapTileConfigEndpoint({ hostname: 'safebus.kids', protocol: 'https:' })).toBe(
      '/.netlify/functions/map-tile-config',
    );
  });

  it('accepts only the approved Geoapify XYZ tile endpoint', () => {
    expect(
      parseMapTileConfig({
        tileUrl: 'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=public-key',
        attribution: 'Provider attribution',
      }),
    ).toEqual({
      tileUrl: 'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=public-key',
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
 

describe('map config outage recovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('throttles a failed request but recovers without a page reload after the cooldown', async () => {
    vi.resetModules();
    const payload = {
      tileUrl: 'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=test-public-key',
      attribution: 'Geoapify and OpenStreetMap attribution',
    };
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', mockFetch);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const { getMapTileConfig, MAP_CONFIG_RETRY_DELAY_MS } = await import('@/services/mapTileConfigService');
    expect((await getMapTileConfig()).isConfigured).toBe(false);
    expect((await getMapTileConfig()).isConfigured).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0][1]).toHaveProperty('signal');

    clock.mockReturnValue(10_000 + MAP_CONFIG_RETRY_DELAY_MS);
    expect(await getMapTileConfig()).toEqual({ ...payload, isConfigured: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    await getMapTileConfig();
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('coalesces concurrent map configuration calls into a single supplier request', async () => {
    vi.resetModules();
    let settle: ((value: unknown) => void) | undefined;
    const deferred = new Promise((resolve) => { settle = resolve; });
    const mockFetch = vi.fn().mockReturnValue(deferred);
    vi.stubGlobal('fetch', mockFetch);
    const { getMapTileConfig } = await import('@/services/mapTileConfigService');
    const one = getMapTileConfig();
    const two = getMapTileConfig();
    expect(one).toBe(two);
    settle?.({ ok: true, json: async () => ({
      tileUrl: 'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=test-public-key',
      attribution: 'Geoapify and OpenStreetMap attribution',
    }) });
    expect((await one).isConfigured).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
