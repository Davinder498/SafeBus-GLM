import { afterEach, describe, expect, it } from 'vitest';
import { handler } from '../../netlify/functions/map-tile-config.mjs';

const previousApiKey = process.env.GEOAPIFY_API_KEY;

afterEach(() => {
  if (previousApiKey === undefined) delete process.env.GEOAPIFY_API_KEY;
  else process.env.GEOAPIFY_API_KEY = previousApiKey;
});

describe('map tile config function', () => {
  it('fails closed when the provider key is absent', async () => {
    delete process.env.GEOAPIFY_API_KEY;
    const response = await handler({ httpMethod: 'GET', headers: {} });

    expect(response.statusCode).toBe(503);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(response.body)).toEqual({ error: 'Map provider is not configured.' });
  });

  it('returns the approved provider URL and required attribution', async () => {
    process.env.GEOAPIFY_API_KEY = 'public test/key';
    const response = await handler({
      httpMethod: 'GET',
      headers: { origin: 'https://localhost' },
    });
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://localhost');
    expect(body.tileUrl).toBe(
      'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=public%20test%2Fkey',
    );
    expect(body.attribution).toContain('Geoapify');
    expect(body.attribution).toContain('OpenStreetMap contributors');
  });

  it('rejects mutation methods', async () => {
    const response = await handler({ httpMethod: 'POST', headers: {} });
    expect(response.statusCode).toBe(405);
    expect(response.headers.allow).toBe('GET, OPTIONS');
  });
});
