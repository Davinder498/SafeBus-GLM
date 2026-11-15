import { getStore as getBlobStore } from '@netlify/blobs';

export const MAX_HEARTBEAT_AGE_MS = 45 * 60_000;
const STORE = 'production-monitor';
const KEY = 'completion';

function production(deploy) {
  return deploy?.context === 'production' && deploy?.published === true;
}

// Keep the last published-production observation across deployments so a normal
// release does not manufacture an outage while waiting for the next scheduled run.
// The timestamp still expires; previews/unpublished runners cannot refresh it.
// Store only time and a boolean, never probe details.
function store() {
  return getBlobStore({ name: STORE, consistency: 'strong',
    fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(2_000) }),
  });
}

async function bounded(work) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('MONITOR_STORAGE_UNAVAILABLE')), 3_000); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function recordMonitorHeartbeat({ deploy, healthy, applicationMode,
  now = Date.now(), getStore = store } = {}) {
  if (!production(deploy) || typeof healthy !== 'boolean' ||
      !Number.isSafeInteger(now) || now < 0 || !['off', 'observe', 'alert'].includes(applicationMode))
    throw new Error('MONITOR_HEARTBEAT_INVALID_INPUT');
  try {
    await bounded(() => getStore().setJSON(KEY, {
      completedAt: now, healthy: healthy && applicationMode === 'alert',
    }));
  } catch { throw new Error('MONITOR_HEARTBEAT_WRITE_FAILED'); }
}

export async function monitorStatus(request, { deploy, now = Date.now(), getStore = store } = {}) {
  const headers = { 'cache-control': 'no-store', 'netlify-cdn-cache-control': 'no-store',
    'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' };
  if (!['GET', 'HEAD'].includes(request.method))
    return new Response(null, { status: 405, headers: { ...headers, allow: 'GET, HEAD' } });
  let healthy = false;
  if (production(deploy) && Number.isSafeInteger(now) && now >= 0) {
    try {
      const record = await bounded(() => getStore().get(KEY, { type: 'json' }));
      healthy = record?.healthy === true && Number.isSafeInteger(record.completedAt) &&
        record.completedAt >= 0 && record.completedAt <= now &&
        now - record.completedAt <= MAX_HEARTBEAT_AGE_MS &&
        Object.keys(record).sort().join(',') === 'completedAt,healthy';
    } catch { /* Fail closed without returning provider content. */ }
  }
  return new Response(request.method === 'HEAD' ? null : healthy ? 'available' : 'unavailable',
    { status: healthy ? 200 : 503, headers });
}
