import { createHmac, timingSafeEqual } from 'node:crypto';

export const EMAIL_INTERVAL_MS = 20_000;
export const EMAIL_WINDOW_MS = 60_000;
export const EMAIL_BACKGROUND_PATH = '/.netlify/functions/guardian-notification-email-background';

function signature(body) {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('configuration_error');
  // Domain separation: this short-lived signature cannot authorize another endpoint.
  // The existing server credential never leaves this process.
  return createHmac('sha256', key)
    .update(`safebus:notification-email-cadence:v1\n${body}`)
    .digest('hex');
}

export async function startEmailCadence(startedAt) {
  // URL is supplied by Netlify at function runtime, never taken from request headers.
  const site = new URL(process.env.URL);
  if (site.protocol !== 'https:' || site.username || site.password) {
    throw new Error('configuration_error');
  }
  const body = JSON.stringify({ startedAt });
  const response = await fetch(new URL(EMAIL_BACKGROUND_PATH, site.origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-safebus-cadence-signature': signature(body) },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(5_000),
  });
  // Background acceptance is exactly 202; a SPA fallback must not count as success.
  if (response.status !== 202) throw new Error('background_start_failed');
}

export function authorizedCadenceStart(event, now = Date.now()) {
  if (event?.httpMethod !== 'POST' || event.isBase64Encoded) return null;
  const body = event.body;
  const header =
    event.headers?.['x-safebus-cadence-signature'] ||
    event.headers?.['X-Safebus-Cadence-Signature'];
  if (typeof body !== 'string' || body.length > 100 || !/^[a-f0-9]{64}$/.test(header || '')) {
    return null;
  }
  try {
    if (!timingSafeEqual(Buffer.from(header, 'hex'), Buffer.from(signature(body), 'hex')))
      return null;
    const { startedAt } = JSON.parse(body);
    if (
      !Number.isSafeInteger(startedAt) ||
      startedAt > now + 5_000 ||
      startedAt + EMAIL_WINDOW_MS <= now
    )
      return null;
    return startedAt;
  } catch {
    return null;
  }
}
