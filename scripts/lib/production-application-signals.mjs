// Production-only, aggregate-only operations probes. No identifiers, coordinates,
// response bodies, arbitrary errors or credentials enter logs or notifications.
// The service API key stays only in Netlify Functions and is used for HEAD counts.
// Read-only HEAD requests do not mutate customer data or bypass product UI RLS.
export const APPLICATION_SIGNAL_NAMES = [
  'app_database',
  'app_gps_freshness',
  'app_email_backlog',
  'app_push_backlog',
  'app_delivery_failures',
  'app_map_tiles',
];

const FIXED_CODES = {
  app_database: ['DATABASE_CHECK_UNAVAILABLE'],
  app_gps_freshness: ['GPS_CHECK_UNAVAILABLE', 'ACTIVE_GPS_STALE'],
  app_email_backlog: ['EMAIL_QUEUE_UNAVAILABLE', 'EMAIL_QUEUE_OLD'],
  app_push_backlog: ['PUSH_QUEUE_UNAVAILABLE', 'PUSH_QUEUE_OLD'],
  app_delivery_failures: ['DELIVERY_CHECK_UNAVAILABLE', 'DELIVERY_FAILURE_SPIKE'],
  app_map_tiles: ['MAP_TILE_CHECK_UNAVAILABLE', 'MAP_TILE_UNAVAILABLE'],
};

export function validApplicationChecks(checks) {
  if (!Array.isArray(checks) || checks.length !== APPLICATION_SIGNAL_NAMES.length) return false;
  return APPLICATION_SIGNAL_NAMES.every((name, index) => {
    const check = checks[index];
    if (!check || check.check !== name || !['pass', 'fail'].includes(check.result)) return false;
    const keys = Object.keys(check).sort().join(',');
    if (check.result === 'pass' && !['check,result', 'check,mode,result'].includes(keys)) return false;
    if (check.result === 'fail' && keys !== 'check,code,result') return false;
    if (check.result === 'pass') {
      return check.code === undefined && (check.mode === undefined || check.mode === 'idle');
    }
    return check.mode === undefined && FIXED_CODES[name].includes(check.code);
  });
}

function serviceConnection(env) {
  const source = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  let url;
  try { url = new URL(source); } catch { throw new Error('APP_MONITOR_CONFIGURATION'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
      url.pathname !== '/' || url.search || url.hash || url.port || url.username || url.password ||
      typeof key !== 'string' || !key.trim() || key.length > 4096 || /[\r\n]/.test(key)) {
    throw new Error('APP_MONITOR_CONFIGURATION');
  }
  return { origin: url.origin, key };
}

// Fixed queries only. All responses are ignored except the HTTP status and
// exact Content-Range total. No row body or identifying table field is fetched.
async function countRows(connection, table, filters, select, fetchImpl) {
  const url = new URL('/rest/v1/' + table, connection.origin);
  url.searchParams.set('select', select);
  for (const [field, expression] of Object.entries(filters)) url.searchParams.set(field, expression);
  const headers = {
    apikey: connection.key,
    accept: 'application/json',
    prefer: 'count=exact',
    range: '0-0',
    // Legacy service_role keys are JWTs; new sb_secret_ keys are not JWTs.
    ...(connection.key.startsWith('eyJ') ? { authorization: 'Bearer ' + connection.key } : {}),
  };
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: 'HEAD', headers, redirect: 'error', signal: AbortSignal.timeout(5_500),
    });
  } catch { throw new Error('APP_MONITOR_QUERY'); }
  if (response.status < 200 || response.status >= 300) throw new Error('APP_MONITOR_QUERY');
  const match = /^(?:\*|[0-9]+-[0-9]+)\/([0-9]+)$/.exec(response.headers?.get('content-range') ?? '');
  if (!match) throw new Error('APP_MONITOR_QUERY');
  const count = Number(match[1]);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('APP_MONITOR_QUERY');
  return count;
}

async function mapTileProbe(fetchImpl) {
  // Fetch the *published* config, not a local approximation. Its public key
  // must never appear in an event, error, exception message or test result.
  let config;
  try {
    const response = await fetchImpl('https://safebus.kids/.netlify/functions/map-tile-config', {
      method: 'GET', redirect: 'error',
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status !== 200) throw new Error('APP_MAP_CONFIG');
    config = await response.json();
  } catch { throw new Error('APP_MAP_TILE'); }
  if (!config || typeof config.tileUrl !== 'string') throw new Error('APP_MAP_TILE');
  let tile;
  try {
    const source = config.tileUrl;
    const expected = 'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png';
    if (!source.startsWith(expected + '?')) throw new Error('APP_MAP_TILE');
    tile = new URL(source.replace('{z}', '1').replace('{x}', '0').replace('{y}', '0'));
    if (tile.protocol !== 'https:' || tile.hostname !== 'maps.geoapify.com' ||
        tile.pathname !== '/v1/tile/osm-bright/1/0/0.png' ||
        tile.username || tile.password || tile.hash ||
        tile.searchParams.size !== 1 ||
        typeof tile.searchParams.get('apiKey') !== 'string' ||
        (tile.searchParams.get('apiKey') ?? '').length < 10) throw new Error('APP_MAP_TILE');
  } catch { throw new Error('APP_MAP_TILE'); }
  try {
    const response = await fetchImpl(tile.toString(), {
      method: 'GET', redirect: 'error',
      headers: { accept: 'image/png,image/*', referer: 'https://safebus.kids/' },
      signal: AbortSignal.timeout(5_000),
    });
    const good = response.status === 200 &&
      (response.headers?.get('content-type') ?? '').toLowerCase().startsWith('image/');
    await response.body?.cancel?.();
    if (!good) throw new Error('APP_MAP_TILE');
    return true;
  } catch { throw new Error('APP_MAP_TILE'); }
}

async function assess(check, unavailableCode, alertCode, work) {
  try {
    const result = await work();
    if (result === null) return { check, result: 'pass', mode: 'idle' };
    if (result === true) return { check, result: 'pass' };
    if (result === false) return { check, result: 'fail', code: alertCode };
  } catch { /* Suppress arbitrary network and provider error messages. */ }
  return { check, result: 'fail', code: unavailableCode };
}

export async function runApplicationSignals({
  env = process.env,
  now = Date.now(),
  fetchImpl = fetch,
} = {}) {
  if (typeof fetchImpl !== 'function' || !Number.isFinite(now) || now < 0)
    throw new Error('APP_MONITOR_INVALID_INPUT');
  const startedGrace = new Date(now - 180_000).toISOString();
  const freshSince = new Date(now - 120_000).toISOString();
  const oldQueueBefore = new Date(now - 20 * 60_000).toISOString();
  const recentFailureSince = new Date(now - 60 * 60_000).toISOString();
  let conn;
  try { conn = serviceConnection(env); } catch { conn = null; }
  const count = (table, filters, select = 'id') => {
    if (!conn) return Promise.reject(new Error('APP_MONITOR_CONFIGURATION'));
    return countRows(conn, table, filters, select, fetchImpl);
  };
  // Share one active-trip count, but keep all categories independent. A paused
  // or recently started trip is not a stale-GPS failure. No active trips is idle.
  const eligible = count('driver_trips', { status: 'eq.active', started_at: 'lt.' + startedGrace });
  const checks = await Promise.all([
    assess('app_database', 'DATABASE_CHECK_UNAVAILABLE', 'DATABASE_CHECK_UNAVAILABLE',
      async () => { await eligible; return true; }),
    assess('app_gps_freshness', 'GPS_CHECK_UNAVAILABLE', 'ACTIVE_GPS_STALE',
      async () => {
        const active = await eligible;
        if (active === 0) return null;
        const fresh = await count('driver_trip_current_locations', {
          'driver_trips.status': 'eq.active',
          'driver_trips.started_at': 'lt.' + startedGrace,
          recorded_at: 'gte.' + freshSince,
        }, 'driver_trip_id,driver_trips!inner(id)');
        if (fresh > active) throw new Error('APP_GPS_INCONSISTENT');
        return fresh === active;
      }),
    assess('app_email_backlog', 'EMAIL_QUEUE_UNAVAILABLE', 'EMAIL_QUEUE_OLD',
      async () => (await count('guardian_notification_outbox', {
        status: 'in.(pending,processing)', created_at: 'lt.' + oldQueueBefore,
      })) === 0),
    assess('app_push_backlog', 'PUSH_QUEUE_UNAVAILABLE', 'PUSH_QUEUE_OLD',
      async () => (await count('push_notification_outbox', {
        status: 'in.(pending,processing,retry)', created_at: 'lt.' + oldQueueBefore,
      })) === 0),
    assess('app_delivery_failures', 'DELIVERY_CHECK_UNAVAILABLE', 'DELIVERY_FAILURE_SPIKE',
      async () => {
        const [email, push] = await Promise.all([
          count('guardian_notification_outbox', { status: 'eq.failed', created_at: 'gte.' + recentFailureSince }),
          count('push_notification_outbox', { status: 'eq.failed', created_at: 'gte.' + recentFailureSince }),
        ]);
        // Preliminary operating threshold, not an approved customer SLA.
        return email + push < 10;
      }),
    assess('app_map_tiles', 'MAP_TILE_CHECK_UNAVAILABLE', 'MAP_TILE_UNAVAILABLE',
      () => mapTileProbe(fetchImpl)),
  ]);
  if (!validApplicationChecks(checks)) throw new Error('APP_MONITOR_INVALID_RESULT');
  return checks;
}
