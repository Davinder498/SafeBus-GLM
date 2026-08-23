const REQUIRED_SECURITY_HEADERS = [
  ['content-security-policy', ["default-src 'self'", "frame-ancestors 'none'"]],
  ['strict-transport-security', ['max-age=']],
  ['x-frame-options', ['deny']],
  ['x-content-type-options', ['nosniff']],
  ['referrer-policy', ['strict-origin-when-cross-origin']],
  ['permissions-policy', ['geolocation=(self)', 'microphone=()']],
];

function normalizeOrigin(rawOrigin, allowHttp) {
  let url;
  try {
    url = new URL(rawOrigin);
  } catch {
    throw new Error('SAFEBUS_MONITOR_ORIGIN must be a valid absolute URL.');
  }

  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('SAFEBUS_MONITOR_ORIGIN must contain only a scheme and host.');
  }
  if (url.protocol !== 'https:' && !(allowHttp && url.protocol === 'http:')) {
    throw new Error('SAFEBUS_MONITOR_ORIGIN must use HTTPS.');
  }
  return url.origin;
}

function assertOk(response, checkName) {
  if (!response.ok) {
    throw new Error(`${checkName} returned HTTP ${response.status}.`);
  }
}

async function executeCheck({ name, attempts, check }) {
  const startedAt = performance.now();
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await check();
      return {
        name,
        result: 'pass',
        attempts: attempt,
        durationMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      if (attempt === attempts) {
        const message = error instanceof Error ? error.message : `${name} failed.`;
        throw new Error(`${name}: ${message}`);
      }
    }
  }
  throw new Error(`${name} failed.`);
}

function request(fetchImpl, url, timeoutMs) {
  return fetchImpl(url, {
    headers: {
      accept: 'text/html,application/json;q=0.9',
      'cache-control': 'no-cache',
      'user-agent': 'SafeBus-Production-Health/1.0',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function runProductionHealth({
  origin: rawOrigin,
  fetchImpl = globalThis.fetch,
  retries = 2,
  timeoutMs = 8_000,
  allowHttp = false,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  if (!Number.isInteger(retries) || retries < 0 || retries > 4) {
    throw new Error('retries must be an integer between 0 and 4.');
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new Error('timeoutMs must be an integer between 100 and 30000.');
  }

  const origin = normalizeOrigin(rawOrigin, allowHttp);
  const attempts = retries + 1;
  const checks = [];

  checks.push(
    await executeCheck({
      name: 'landing_page',
      attempts,
      check: async () => {
        const response = await request(fetchImpl, `${origin}/`, timeoutMs);
        assertOk(response, 'Landing page');
        const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
        if (!contentType.includes('text/html')) {
          throw new Error('Landing page did not return HTML.');
        }
        const body = await response.text();
        if (!body.includes('SafeBus Alberta')) {
          throw new Error('Landing page did not contain the SafeBus release marker.');
        }
        for (const [header, requiredValues] of REQUIRED_SECURITY_HEADERS) {
          const value = response.headers.get(header)?.toLowerCase() ?? '';
          if (requiredValues.some((required) => !value.includes(required.toLowerCase()))) {
            throw new Error(`Landing page is missing the required ${header} policy.`);
          }
        }
      },
    }),
  );

  checks.push(
    await executeCheck({
      name: 'spa_login_route',
      attempts,
      check: async () => {
        const response = await request(fetchImpl, `${origin}/login`, timeoutMs);
        assertOk(response, 'Login route');
        const body = await response.text();
        if (!body.includes('SafeBus Alberta')) {
          throw new Error('Login route did not return the SafeBus application shell.');
        }
      },
    }),
  );

  checks.push(
    await executeCheck({
      name: 'map_configuration',
      attempts,
      check: async () => {
        const response = await request(
          fetchImpl,
          `${origin}/.netlify/functions/map-tile-config`,
          timeoutMs,
        );
        assertOk(response, 'Map configuration');
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new Error('Map configuration did not return JSON.');
        }
        if (
          typeof payload?.tileUrl !== 'string' ||
          !payload.tileUrl.startsWith('https://maps.geoapify.com/') ||
          typeof payload?.attribution !== 'string' ||
          !payload.attribution.includes('Geoapify') ||
          !payload.attribution.includes('OpenStreetMap')
        ) {
          throw new Error('Map configuration did not match the approved provider contract.');
        }
      },
    }),
  );

  return {
    result: 'healthy',
    origin,
    checkedAt: new Date().toISOString(),
    checks,
  };
}
