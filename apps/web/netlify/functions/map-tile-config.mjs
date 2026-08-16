const GEOAPIFY_TILE_URL =
  'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png';
const MAP_ATTRIBUTION =
  'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | <a href="https://www.openmaptiles.org/">&copy; OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright">&copy; OpenStreetMap contributors</a>';

const responseHeaders = {
  'cache-control': 'public, max-age=300, stale-while-revalidate=86400',
  'content-type': 'application/json; charset=utf-8',
};

const crossOriginClients = new Set(['https://localhost', 'capacitor://localhost']);

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...responseHeaders, ...extraHeaders },
    body: JSON.stringify(body),
  };
}

export async function handler(event = {}) {
  const method = event.httpMethod ?? 'GET';
  const origin = event.headers?.origin ?? event.headers?.Origin;
  const corsHeaders = crossOriginClients.has(origin)
    ? { 'access-control-allow-origin': origin, vary: 'Origin' }
    : {};
  if (method === 'OPTIONS') {
    return json(204, null, {
      ...corsHeaders,
      'access-control-allow-headers': 'Accept, Content-Type',
      'access-control-allow-methods': 'GET, OPTIONS',
    });
  }
  if (method !== 'GET') {
    return json(405, { error: 'Method not allowed.' }, {
      ...corsHeaders,
      allow: 'GET, OPTIONS',
    });
  }

  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey || apiKey.length < 10) {
    return json(
      503,
      { error: 'Map provider is not configured.' },
      { ...corsHeaders, 'cache-control': 'no-store' },
    );
  }

  return json(
    200,
    {
      tileUrl: `${GEOAPIFY_TILE_URL}?apiKey=${encodeURIComponent(apiKey)}`,
      attribution: MAP_ATTRIBUTION,
    },
    corsHeaders,
  );
}
