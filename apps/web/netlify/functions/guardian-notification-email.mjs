import { runDeliveryWorker } from '../../../../supabase/functions/_shared/notification-worker.mjs';
import { createClient } from '@supabase/supabase-js';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_PROVIDER_LIMIT_PER_MINUTE = 600;
const DEFAULT_TZ = 'America/Edmonton';

// A small allowlist of fields that are safe to appear in dispatcher logs.
const SAFE_LOG_FIELDS = new Set([
  'outboxId',
  'result',
  'category',
  'attempt',
  'notificationType',
  'durationMs',
  'claimed',
  'delivered',
  'retry',
  'failed',
  'cancelled',
  'error',
]);

function safeLog(details) {
  // Only keep allowlisted, non-personal keys.
  const copy = {};
  for (const [key, value] of Object.entries(details)) {
    if (SAFE_LOG_FIELDS.has(key)) copy[key] = value;
  }
  return copy;
}

export function buildGuardianEventEmail({
  notificationType,
  notificationTitle,
  notificationBody,
  eventCreatedAt,
  tenantTimezone,
}) {
  if (
    typeof notificationTitle !== 'string' ||
    !notificationTitle.trim() ||
    typeof notificationBody !== 'string' ||
    !notificationBody.trim()
  ) {
    throw new Error('canonical_notification_copy_required');
  }
  let tz = DEFAULT_TZ;
  try {
    if (tenantTimezone) {
      new Intl.DateTimeFormat('en-CA', { timeZone: tenantTimezone });
      tz = tenantTimezone;
    }
  } catch {
    /* Use the Alberta default for legacy invalid timezones. */
  }
  const when = new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: tz,
  }).format(new Date(eventCreatedAt));
  const recorded = 'Recorded: ' + when + ' (' + tz + ')';
  return {
    subject: 'SafeBus: ' + notificationTitle,
    text: [notificationBody, '', recorded, '', 'SafeBus'].join('\n'),
    html:
      '<p>' +
      escapeHtml(notificationBody) +
      '</p><p>' +
      escapeHtml(recorded) +
      '</p><p>SafeBus</p>',
  };
}

const HTML_AMP = String.fromCharCode(38) + 'amp;';
const HTML_LT = String.fromCharCode(38) + 'lt;';
const HTML_GT = String.fromCharCode(38) + 'gt;';
const HTML_QUOT = String.fromCharCode(38) + 'quot;';
const HTML_APOS = String.fromCharCode(38) + '#39;';

const ESCAPE_MAP = {
  '&': HTML_AMP,
  '<': HTML_LT,
  '>': HTML_GT,
  '"': HTML_QUOT,
  "'": HTML_APOS,
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);
}
export function retryDelaySeconds(attempt) {
  return [0, 300, 900, 3600, 10800][Math.max(1, Math.min(attempt, 4))] ?? 10800;
}
export function classifyProviderError(status, message = '') {
  if (status === 408 || status === 429 || status >= 500) return 'temporary_provider_error';
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422)
    return 'permanent_provider_error';
  if (/timeout/i.test(message)) return 'provider_timeout';
  return 'unknown';
}

function requireConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.SAFEBUS_EMAIL_PROVIDER_API_KEY;
  const from = process.env.SAFEBUS_EMAIL_FROM;
  const dispatcherSecret = process.env.SAFEBUS_NOTIFICATION_DISPATCHER_SECRET;
  if (!url || !service || !apiKey || !from) throw new Error('configuration_error');
  return {
    url,
    service,
    apiKey,
    from,
    fromName: process.env.SAFEBUS_EMAIL_FROM_NAME || 'SafeBus',
    dispatcherSecret,
    devOverride: process.env.SAFEBUS_DEV_EMAIL_RECIPIENT_OVERRIDE || '',
  };
}

function authorized(event, secret) {
  const header =
    event.headers['x-safebus-dispatcher-secret'] || event.headers['X-SafeBus-Dispatcher-Secret'];
  return Boolean(header && header === secret);
}

export async function sendResendEmail({
  apiKey,
  from,
  fromName,
  to,
  subject,
  text,
  html,
  idempotency,
}) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'Idempotency-Key': idempotency,
    },
    body: JSON.stringify({ from: `${fromName} <${from}>`, to: [to], subject, text, html }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error('provider_error');
    err.status = response.status;
    err.providerMessage = data?.name || data?.message || 'provider_error';
    throw err;
  }
  return { providerMessageId: data?.id || null };
}

export async function runDispatcher(event, sendEmail) {
  const cfg = requireConfig();
  if (!cfg.dispatcherSecret) throw new Error('configuration_error');
  if (!authorized(event, cfg.dispatcherSecret)) return json(401, { error: 'Unauthorized.' });
  return dispatchBatch(cfg, sendEmail);
}

// Called by the platform-only scheduled entry point and its signed background worker.
// The manual HTTP endpoint always uses runDispatcher with its separate secret.
export async function runScheduledDispatcher(sendEmail) {
  return dispatchBatch(requireConfig(), sendEmail);
}

async function dispatchBatch(cfg, sendEmail) {
  /** @type {import('@supabase/supabase-js').SupabaseClient<import('@safebus/types/database').Database>} */
  const supabase = createClient(cfg.url, cfg.service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const batchSize = Math.max(
    1,
    Math.min(Number(process.env.SAFEBUS_NOTIFICATION_BATCH_SIZE || DEFAULT_BATCH_SIZE), 100),
  );
  const providerLimit = Math.max(
    1,
    Math.min(
      Number(
        process.env.SAFEBUS_NOTIFICATION_PROVIDER_LIMIT_PER_MINUTE ||
          DEFAULT_PROVIDER_LIMIT_PER_MINUTE,
      ),
      600_000,
    ),
  );
  const workers = Math.max(1, Math.min(Number(process.env.SAFEBUS_EMAIL_WORKERS) || 1, 16));
  const rpc = async (name, args) => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data;
  };
  const summaries = await Promise.allSettled(
    Array.from({ length: workers }, () =>
      runDeliveryWorker({
        rpc,
        channel: 'email',
        workerId: 'email-' + crypto.randomUUID(),
        batchSize,
        concurrency: Math.max(1, Math.min(Number(process.env.SAFEBUS_EMAIL_CONCURRENCY) || 8, 128)),
        providerMinute: providerLimit,
        retryDelay: retryDelaySeconds,
        classify: (error) => ({
          category: classifyProviderError(
            error.status || 0,
            error.providerMessage || error.message,
          ),
          code: classifyProviderError(error.status || 0, error.providerMessage || error.message),
          retry: ['temporary_provider_error', 'provider_timeout', 'unknown'].includes(
            classifyProviderError(error.status || 0, error.providerMessage || error.message),
          ),
        }),
        send: async (payload) => {
          if (!payload.recipient_email || !/^\S+@\S+\.\S+$/.test(payload.recipient_email))
            return {
              state: 'cancelled',
              category: 'missing_recipient_email',
              code: 'missing_recipient_email',
            };
          const email = buildGuardianEventEmail({
            notificationType: payload.notification_type,
            notificationTitle: payload.title,
            notificationBody: payload.body,
            eventCreatedAt: payload.event_occurred_at,
            tenantTimezone: payload.tenant_timezone,
          });
          const result = await (sendEmail || sendResendEmail)({
            apiKey: cfg.apiKey,
            from: cfg.from,
            fromName: cfg.fromName,
            to:
              cfg.devOverride && process.env.CONTEXT !== 'production'
                ? cfg.devOverride
                : payload.recipient_email,
            ...email,
            idempotency: payload.idempotency_key,
          });
          return result.providerMessageId;
        },
      }),
    ),
  );
  if (summaries.every((result) => result.status === 'rejected'))
    throw new Error('notification_worker_failed');
  const summary = summaries.reduce(
    (total, result) => {
      if (result.status === 'rejected') {
        total.error++;
        return total;
      }
      for (const key of Object.keys(total)) total[key] += result.value[key];
      return total;
    },
    { claimed: 0, delivered: 0, retry: 0, failed: 0, cancelled: 0, error: 0 },
  );
  console.log(
    JSON.stringify(
      safeLog({
        result: 'batch_complete',
        claimed: summary.claimed,
        delivered: summary.delivered,
        retry: summary.retry,
        failed: summary.failed,
        cancelled: summary.cancelled,
      }),
    ),
  );
  return json(200, summary);
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
    return await runDispatcher(event);
  } catch (e) {
    console.error(
      JSON.stringify(
        safeLog({
          result: 'dispatcher_error',
          category: e.message === 'configuration_error' ? 'configuration_error' : 'unknown',
        }),
      ),
    );
    return json(500, { error: 'Notification dispatcher failed.' });
  }
}
