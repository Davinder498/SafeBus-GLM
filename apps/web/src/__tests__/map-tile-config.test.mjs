import { afterEach, describe, expect, it } from 'vitest';
import { handler } from '../../netlify/functions/map-tile-config.mjs';

const keyNames = ['GEOAPIFY_API_KEY', 'GEOAPIFY_WEB_API_KEY', 'GEOAPIFY_ANDROID_API_KEY'];
const originalKeys = Object.fromEntries(keyNames.map((key) => [key, process.env[key]]));

function setKeys(overrides = {}) {
  for (const key of keyNames) {
    if (Object.hasOwn(overrides, key)) {
      process.env[key] = overrides[key];
    } else {
      delete process.env[key];
    }
  }
}

afterEach(() => {
  for (const key of keyNames) {
    if (originalKeys[key] === undefined) delete process.env[key];
    else process.env[key] = originalKeys[key];
  }
});

describe('map tile config function', () => {
  it('fails closed when the provider key is absent', async () => {
    setKeys();
    const response = await handler({ httpMethod: 'GET', headers: {} });

    expect(response.statusCode).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(response.body)).toEqual({ error: 'Map provider is not configured.' });
  });

  it('returns the approved provider URL and required attribution', async () => {
    setKeys({ GEOAPIFY_API_KEY: 'public test/key' });
    const response = await handler({
      httpMethod: 'GET',
      headers: { origin: 'https://localhost' },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://localhost');
    expect(response.headers.vary).toBe('Origin');
    expect(body.tileUrl).toBe(
      'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=public%20test%2Fkey',
    );
    expect(body.attribution).toContain('Geoapify');
    expect(body.attribution).toContain('OpenStreetMap contributors');
  });

  it('keeps legacy key on both channels until a dedicated key is configured', async () => {
    setKeys({ GEOAPIFY_API_KEY: 'legacy-tile-demo-key' });
    const web = await handler({ httpMethod: 'GET', headers: {} });
    const native = await handler({ httpMethod: 'GET', headers: { origin: 'https://localhost' } });
    const iosStyle = await handler({ httpMethod: 'GET', headers: { origin: 'capacitor://localhost' } });
    for (const response of [web, native, iosStyle]) {
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).tileUrl).toContain('apiKey=legacy-tile-demo-key');
      expect(response.headers.vary).toBe('Origin');
    }
  });

  it('routes dedicated website key separately while preserving signed Android fallback', async () => {
    setKeys({
      GEOAPIFY_API_KEY: 'legacy-tile-demo-key',
      GEOAPIFY_WEB_API_KEY: 'website-tile-demo-key',
    });
    const web = await handler({ httpMethod: 'GET', headers: {} });
    const native = await handler({ httpMethod: 'GET', headers: { origin: 'https://localhost' } });
    const unapprovedOrigin = await handler({ httpMethod: 'GET', headers: { origin: 'https://other.example' } });
    expect(JSON.parse(web.body).tileUrl).toContain('apiKey=website-tile-demo-key');
    expect(JSON.parse(native.body).tileUrl).toContain('apiKey=legacy-tile-demo-key');
    expect(JSON.parse(unapprovedOrigin.body).tileUrl).toContain('apiKey=website-tile-demo-key');
    expect(unapprovedOrigin.headers['access-control-allow-origin']).toBeUndefined();
    for (const response of [web, native, unapprovedOrigin]) expect(response.headers.vary).toBe('Origin');
  });

  it('supports an explicitly configured native key without mutating the web key', async () => {
    setKeys({
      GEOAPIFY_API_KEY: 'legacy-tile-demo-key',
      GEOAPIFY_WEB_API_KEY: 'website-tile-demo-key',
      GEOAPIFY_ANDROID_API_KEY: 'mobile-tile-demo-key',
    });
    const web = await handler({ httpMethod: 'GET', headers: {} });
    const native = await handler({ httpMethod: 'GET', headers: { Origin: 'https://localhost' } });
    expect(JSON.parse(web.body).tileUrl).toContain('apiKey=website-tile-demo-key');
    expect(JSON.parse(native.body).tileUrl).toContain('apiKey=mobile-tile-demo-key');
    expect(native.headers['access-control-allow-origin']).toBe('https://localhost');
    expect(native.headers.vary).toBe('Origin');
  });

  it('fails closed for a deliberately configured blank channel key instead of silently using legacy', async () => {
    setKeys({ GEOAPIFY_API_KEY: 'legacy-tile-demo-key', GEOAPIFY_WEB_API_KEY: '' });
    const web = await handler({ httpMethod: 'GET', headers: {} });
    const native = await handler({ httpMethod: 'GET', headers: { origin: 'https://localhost' } });
    expect(web.statusCode).toBe(503);
    expect(web.headers['cache-control']).toBe('no-store');
    expect(web.headers.vary).toBe('Origin');
    expect(native.statusCode).toBe(200);
    setKeys({ GEOAPIFY_API_KEY: 'legacy-tile-demo-key', GEOAPIFY_ANDROID_API_KEY: '  ' });
    expect((await handler({ httpMethod: 'GET', headers: { origin: 'https://localhost' } })).statusCode).toBe(503);
    expect((await handler({ httpMethod: 'GET', headers: {} })).statusCode).toBe(200);
  });

  it('preflight stays origin-separated without exposing any key', async () => {
    setKeys({
      GEOAPIFY_API_KEY: 'legacy-tile-demo-key',
      GEOAPIFY_WEB_API_KEY: 'website-tile-demo-key',
    });
    const preflight = await handler({ httpMethod: 'OPTIONS', headers: { origin: 'https://localhost' } });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers.vary).toBe('Origin');
    expect(preflight.headers['access-control-allow-origin']).toBe('https://localhost');
    expect(preflight.body).not.toContain('website-tile-demo-key');
    expect(preflight.body).not.toContain('legacy-tile-demo-key');
  });

  it('rejects mutation methods', async () => {
    const response = await handler({ httpMethod: 'POST', headers: {} });
    expect(response.statusCode).toBe(405);
    expect(response.headers.allow).toBe('GET, OPTIONS');
  });
});
