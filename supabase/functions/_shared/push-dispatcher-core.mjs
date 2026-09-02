const MAX_ATTEMPTS = 5;
const MAX_RETRY_SECONDS = 86_400;
const GOOGLE_OAUTH_URL = 'https://oauth2.googleapis.com/token';
const FIREBASE_MESSAGING_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

const encoder = new TextEncoder();

function base64Url(value) {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function normalizedFailureCode(value) {
  const normalized = String(value || 'unknown')
    .toUpperCase()
    .replace(/[^A-Z0-9_.-]/gu, '_');
  return normalized.slice(0, 120) || 'UNKNOWN';
}

function dispatchError(category, code, retry, invalidateDevice = false, retryAfter = null) {
  const error = new Error(category);
  error.category = category;
  error.code = normalizedFailureCode(code);
  error.retry = retry;
  error.invalidateDevice = invalidateDevice;
  error.retryAfter = retryAfter;
  return error;
}

export function retryDelaySeconds(attempt, providerRetryAfter = null) {
  const boundedProvider = Number.isFinite(providerRetryAfter)
    ? Math.max(0, Math.min(providerRetryAfter, MAX_RETRY_SECONDS))
    : 0;
  const schedule = [60, 300, 900, 3_600, 10_800];
  const index = Math.max(0, Math.min(Number(attempt) - 1, schedule.length - 1));
  return Math.max(boundedProvider, schedule[index]);
}

export function parseRetryAfter(value, now = Date.now()) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(Math.ceil(seconds), MAX_RETRY_SECONDS));
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return null;
  return Math.max(0, Math.min(Math.ceil((retryAt - now) / 1_000), MAX_RETRY_SECONDS));
}

export function classifyFcmError(error) {
  if (error?.category && typeof error.retry === 'boolean') {
    return {
      category: error.category,
      code: normalizedFailureCode(error.code),
      retry: error.retry,
      invalidateDevice: Boolean(error.invalidateDevice),
      retryAfter: Number.isFinite(error.retryAfter) ? error.retryAfter : null,
    };
  }

  const code = normalizedFailureCode(error?.fcmErrorCode || error?.status || error?.code);
  const httpStatus = Number(error?.httpStatus || error?.statusCode || 0);
  const retryAfter = Number.isFinite(error?.retryAfter) ? error.retryAfter : null;

  if (code === 'UNREGISTERED' || code === 'SENDER_ID_MISMATCH') {
    return { category: 'invalid_device', code, retry: false, invalidateDevice: true, retryAfter };
  }
  if (
    code === 'THIRD_PARTY_AUTH_ERROR' ||
    code === 'UNAUTHENTICATED' ||
    httpStatus === 401 ||
    httpStatus === 403
  ) {
    return {
      category: 'configuration_error',
      code,
      retry: false,
      invalidateDevice: false,
      retryAfter,
    };
  }
  if (
    code === 'QUOTA_EXCEEDED' ||
    code === 'UNAVAILABLE' ||
    code === 'INTERNAL' ||
    code === 'NETWORK_ERROR' ||
    httpStatus === 429 ||
    httpStatus === 500 ||
    httpStatus === 502 ||
    httpStatus === 503 ||
    httpStatus === 504
  ) {
    return {
      category: 'temporary_provider_error',
      code,
      retry: true,
      invalidateDevice: false,
      retryAfter,
    };
  }
  if (code === 'INVALID_ARGUMENT' || httpStatus === 400) {
    return {
      category: 'permanent_payload_error',
      code,
      retry: false,
      invalidateDevice: false,
      retryAfter,
    };
  }
  return { category: 'unknown', code, retry: true, invalidateDevice: false, retryAfter };
}

export function buildFcmMessage(row) {
  const urgent = row.severity === 'urgent';
  return {
    message: {
      token: row.fcm_token,
      notification: { title: row.title, body: row.body },
      data: {
        notificationId: row.notification_id,
        eventType: row.event_type,
        category: row.category,
        destination: '/notifications',
      },
      android: {
        priority: urgent ? 'HIGH' : 'NORMAL',
        collapseKey: row.collapse_key,
        notification: {
          channelId: row.android_channel,
          tag: row.collapse_key,
          icon: 'ic_stat_safebus',
          visibility: 'PRIVATE',
          defaultVibrateTimings: urgent,
        },
      },
    },
  };
}

export async function timingSafeSecretEqual(supplied, expected) {
  if (typeof supplied !== 'string' || typeof expected !== 'string' || !supplied || !expected)
    return false;
  const [suppliedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(suppliedDigest);
  const right = new Uint8Array(expectedDigest);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function serviceAccountFields(serviceAccount) {
  const projectId = String(serviceAccount?.project_id || '');
  const clientEmail = String(serviceAccount?.client_email || '');
  const privateKey = String(serviceAccount?.private_key || '');
  if (
    !/^[a-z0-9][a-z0-9-]{4,62}$/u.test(projectId) ||
    !clientEmail ||
    !privateKey.includes('BEGIN PRIVATE KEY')
  ) {
    throw dispatchError('configuration_error', 'INVALID_SERVICE_ACCOUNT', false);
  }
  return { projectId, clientEmail, privateKey };
}

async function signServiceAccountJwt(serviceAccount, nowSeconds) {
  const { clientEmail, privateKey } = serviceAccountFields(serviceAccount);
  const pemBody = privateKey.replace(
    /-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/gu,
    '',
  );
  let keyBytes;
  try {
    keyBytes = Uint8Array.from(atob(pemBody), (character) => character.charCodeAt(0));
  } catch {
    throw dispatchError('configuration_error', 'INVALID_PRIVATE_KEY', false);
  }
  let signingKey;
  try {
    signingKey = await crypto.subtle.importKey(
      'pkcs8',
      keyBytes,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
  } catch {
    throw dispatchError('configuration_error', 'INVALID_PRIVATE_KEY', false);
  }
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: clientEmail,
      sub: clientEmail,
      aud: GOOGLE_OAUTH_URL,
      scope: FIREBASE_MESSAGING_SCOPE,
      iat: nowSeconds,
      exp: nowSeconds + 3_600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    signingKey,
    encoder.encode(unsigned),
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function fcmErrorFromResponse(response, body, now) {
  const details = Array.isArray(body?.error?.details) ? body.error.details : [];
  const detail = details.find((item) => typeof item?.errorCode === 'string');
  const error = {
    fcmErrorCode: detail?.errorCode,
    status: body?.error?.status,
    httpStatus: response.status,
    retryAfter: parseRetryAfter(response.headers.get('retry-after'), now),
  };
  const classification = classifyFcmError(error);
  return dispatchError(
    classification.category,
    classification.code,
    classification.retry,
    classification.invalidateDevice,
    classification.retryAfter,
  );
}

export function createGoogleAccessTokenProvider(serviceAccount, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || (() => Date.now());
  serviceAccountFields(serviceAccount);
  let cachedToken = null;
  let expiresAt = 0;

  return async function getAccessToken() {
    if (cachedToken && expiresAt - now() > 60_000) return cachedToken;
    const assertion = await signServiceAccountJwt(serviceAccount, Math.floor(now() / 1_000));
    let response;
    try {
      response = await fetchImpl(GOOGLE_OAUTH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }),
      });
    } catch {
      throw dispatchError('temporary_provider_error', 'NETWORK_ERROR', true);
    }
    const body = await parseJsonResponse(response);
    if (!response.ok) {
      const retryAfter = parseRetryAfter(response.headers.get('retry-after'), now());
      if (response.status === 429 || response.status >= 500) {
        throw dispatchError(
          'temporary_provider_error',
          'OAUTH_UNAVAILABLE',
          true,
          false,
          retryAfter,
        );
      }
      throw dispatchError('configuration_error', 'OAUTH_REJECTED', false, false, retryAfter);
    }
    if (typeof body?.access_token !== 'string' || !body.access_token) {
      throw dispatchError('configuration_error', 'INVALID_OAUTH_RESPONSE', false);
    }
    cachedToken = body.access_token;
    expiresAt = now() + Math.max(60, Number(body.expires_in) || 3_600) * 1_000;
    return cachedToken;
  };
}

export function createFcmSender(serviceAccount, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const now = options.now || (() => Date.now());
  const { projectId } = serviceAccountFields(serviceAccount);
  const getAccessToken = createGoogleAccessTokenProvider(serviceAccount, { fetchImpl, now });
  const endpoint = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

  return async function send(row) {
    const accessToken = await getAccessToken();
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(buildFcmMessage(row)),
      });
    } catch {
      throw dispatchError('temporary_provider_error', 'NETWORK_ERROR', true);
    }
    const body = await parseJsonResponse(response);
    if (!response.ok) throw fcmErrorFromResponse(response, body, now());
    if (typeof body?.name !== 'string' || !body.name) {
      throw dispatchError('unknown', 'INVALID_PROVIDER_RESPONSE', true);
    }
    return body.name;
  };
}

async function bestEffortIncident(rpc, tenantId, incidentCode) {
  try {
    await rpc('record_notification_delivery_incident', {
      p_tenant_id: tenantId,
      p_incident_code: incidentCode,
    });
  } catch {
    // Delivery state is authoritative. Incident reporting must not re-lease a terminal row.
  }
}

export async function runPushDispatcher({
  rpc,
  send,
  workerId,
  batchSize = 50,
  now = () => Date.now(),
}) {
  const limit = Math.max(1, Math.min(Number(batchSize) || 50, 200));
  const claims =
    (await rpc('claim_push_notification_deliveries', {
      p_worker_id: workerId,
      p_limit: limit,
      p_lease_seconds: 120,
    })) || [];
  const summary = {
    claimed: claims.length,
    delivered: 0,
    retry: 0,
    failed: 0,
    cancelled: 0,
    error: 0,
  };

  for (const claim of claims) {
    let row = claim;
    try {
      const resolved = await rpc('resolve_push_notification_delivery', {
        p_outbox_id: claim.outbox_id,
        p_worker_id: workerId,
      });
      if (!resolved?.[0]) {
        summary.cancelled += 1;
        continue;
      }
      row = resolved[0];
      const providerMessageId = await send(row);
      await rpc('complete_push_notification_delivery', {
        p_outbox_id: row.outbox_id,
        p_worker_id: workerId,
        p_provider_message_id: providerMessageId,
      });
      summary.delivered += 1;
    } catch (error) {
      const classification = classifyFcmError(error);
      try {
        if (classification.retry && Number(row.attempt_count) < MAX_ATTEMPTS) {
          const delay = retryDelaySeconds(row.attempt_count, classification.retryAfter);
          await rpc('retry_push_notification_delivery', {
            p_outbox_id: row.outbox_id,
            p_worker_id: workerId,
            p_failure_category: classification.category,
            p_failure_code: classification.code,
            p_available_after: new Date(now() + delay * 1_000).toISOString(),
            p_retry_after_seconds: classification.retryAfter,
          });
          summary.retry += 1;
        } else {
          await rpc('fail_push_notification_delivery', {
            p_outbox_id: row.outbox_id,
            p_worker_id: workerId,
            p_failure_category: classification.category,
            p_failure_code: classification.code,
            p_invalidate_device: classification.invalidateDevice,
          });
          summary.failed += 1;
          if (classification.category === 'configuration_error') {
            await bestEffortIncident(rpc, row.tenant_id, 'firebase_authentication');
            await bestEffortIncident(rpc, null, 'firebase_configuration');
          } else if (classification.code === 'QUOTA_EXCEEDED') {
            await bestEffortIncident(rpc, row.tenant_id, 'quota_exhausted');
          } else if (classification.category === 'temporary_provider_error') {
            await bestEffortIncident(rpc, row.tenant_id, 'provider_unavailable');
          }
        }
      } catch {
        summary.error += 1;
      }
    }
  }

  return summary;
}
