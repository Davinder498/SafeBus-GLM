import { createClient } from '@supabase/supabase-js';

const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const MAX_ATTEMPTS = 5;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_TZ = 'America/Edmonton';

// A small allowlist of fields that are safe to appear in dispatcher logs.
const SAFE_LOG_FIELDS = new Set([
  'outboxId',
  'result',
  'category',
  'attempt',
  'notificationType',
  'durationMs',
]);

function safeLog(details) {
  // Only keep allowlisted, non-personal keys.
  const copy = {};
  for (const [key, value] of Object.entries(details)) {
    if (SAFE_LOG_FIELDS.has(key)) copy[key] = value;
  }
  return copy;
}

export function buildGuardianEventEmail({ notificationType, studentFirstName, eventCreatedAt, tenantTimezone }) {
  const action = notificationType === 'student_picked_up' ? 'pickup' : 'drop-off';
  const verb = notificationType === 'student_picked_up' ? 'picked up' : 'dropped off';
  // Validate the tenant timezone by attempting to use it. Fall back to the
  // default Alberta zone if it is invalid or missing.
  let tz = DEFAULT_TZ;
  try {
    if (tenantTimezone) {
      // This throws for invalid IANA time zones.
      new Intl.DateTimeFormat('en-CA', { timeZone: tenantTimezone });
      tz = tenantTimezone;
    }
  } catch {
    tz = DEFAULT_TZ;
  }
  let zoneLabel;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(eventCreatedAt));
    zoneLabel = parts.find((p) => p.type === 'timeZoneName')?.value || tz;
  } catch {
    zoneLabel = tz;
  }
  const when = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(eventCreatedAt));
  const firstToken = String(studentFirstName || '').trim().split(/\s+/)[0];
  const safeFirstName = firstToken || 'your student';
  const subject = `SafeBus ${action} event recorded`;
  const text = [
    `A ${action} event was recorded for ${safeFirstName} at ${when} (${zoneLabel}).`,
    '',
    'This message reflects an event recorded by the transportation system. It is not live child tracking and does not independently verify safety or custody.',
    '',
    'SafeBus Alberta',
  ].join('\n');
  return {
    subject,
    text,
    html: `<p>A ${action} event was recorded for ${escapeHtml(safeFirstName)} at ${escapeHtml(when)} (${escapeHtml(zoneLabel)}).</p><p>This message reflects an event recorded by the transportation system. It is not live child tracking and does not independently verify safety or custody.</p><p>SafeBus Alberta</p>`,
    action,
    verb,
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
export function idempotencyKey(rowId) { return `guardian-notification-outbox:${rowId}`; }
export function retryDelaySeconds(attempt) { return [0, 300, 900, 3600, 10800][Math.max(1, Math.min(attempt, 4))] ?? 10800; }
export function classifyProviderError(status, message = '') {
  if (status === 408 || status === 429 || status >= 500) return 'temporary_provider_error';
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) return 'permanent_provider_error';
  if (/timeout/i.test(message)) return 'provider_timeout';
  return 'unknown';
}

// Retained for backwards compatibility with Phase 15A tests. New code should prefer safeLog().
export function redactLog(details) {
  const copy = { ...details };
  delete copy.email; delete copy.recipient_email; delete copy.message; delete copy.body; delete copy.html; delete copy.text; delete copy.apiKey;
  return copy;
}

function requireConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.SAFEBUS_EMAIL_PROVIDER_API_KEY;
  const from = process.env.SAFEBUS_EMAIL_FROM;
  const dispatcherSecret = process.env.SAFEBUS_NOTIFICATION_DISPATCHER_SECRET;
  if (!url || !service || !apiKey || !from || !dispatcherSecret) throw new Error('configuration_error');
  return { url, service, apiKey, from, fromName: process.env.SAFEBUS_EMAIL_FROM_NAME || 'SafeBus Alberta', dispatcherSecret, devOverride: process.env.SAFEBUS_DEV_EMAIL_RECIPIENT_OVERRIDE || '' };
}

function authorized(event, secret) {
  const header = event.headers['x-safebus-dispatcher-secret'] || event.headers['X-SafeBus-Dispatcher-Secret'];
  return Boolean(header && header === secret);
}

export async function sendResendEmail({ apiKey, from, fromName, to, subject, text, html, idempotency }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'Idempotency-Key': idempotency },
    body: JSON.stringify({ from: `${fromName} <${from}>`, to: [to], subject, text, html }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error('provider_error'); err.status = response.status; err.providerMessage = data?.name || data?.message || 'provider_error'; throw err;
  }
  return { providerMessageId: data?.id || null };
}

async function dispatchOne(supabase, cfg, row, sendEmail = sendResendEmail) {
  const startedAt = Date.now();
  const { data: payloads, error: resolveError } = await supabase.rpc('resolve_guardian_notification_email_payload', { p_outbox_id: row.id });
  if (resolveError) throw resolveError;
  const payload = payloads?.[0];
  if (!payload) {
    await supabase.rpc('cancel_guardian_notification_email', { p_outbox_id: row.id, p_failure_category: 'eligibility_revoked', p_failure_reason: 'eligibility_revoked' });
    console.log(JSON.stringify(safeLog({ outboxId: row.id, result: 'cancelled', category: 'eligibility_revoked', attempt: row.attempt_count, notificationType: row.notification_type })));
    return 'cancelled';
  }
  if (!payload.recipient_email || !/^\S+@\S+\.\S+$/.test(payload.recipient_email)) {
    await supabase.rpc('cancel_guardian_notification_email', { p_outbox_id: row.id, p_failure_category: 'missing_recipient_email', p_failure_reason: 'missing_recipient_email' });
    console.log(JSON.stringify(safeLog({ outboxId: row.id, result: 'cancelled', category: 'missing_recipient_email', attempt: row.attempt_count, notificationType: row.notification_type })));
    return 'cancelled';
  }
  const email = buildGuardianEventEmail({ notificationType: payload.notification_type, studentFirstName: payload.student_first_name, eventCreatedAt: payload.event_created_at, tenantTimezone: payload.tenant_timezone });
  const to = cfg.devOverride && process.env.CONTEXT !== 'production' ? cfg.devOverride : payload.recipient_email;
  if (cfg.devOverride && process.env.CONTEXT !== 'production') console.log(JSON.stringify(safeLog({ outboxId: row.id, result: 'dev_recipient_override', attempt: row.attempt_count, notificationType: row.notification_type })));
  try {
    const result = await sendEmail({ apiKey: cfg.apiKey, from: cfg.from, fromName: cfg.fromName, to, ...email, idempotency: idempotencyKey(row.id) });
    await supabase.rpc('complete_guardian_notification_email', { p_outbox_id: row.id, p_provider_message_id: result.providerMessageId });
    console.log(JSON.stringify(safeLog({ outboxId: row.id, result: 'delivered', attempt: row.attempt_count, notificationType: row.notification_type, durationMs: Date.now() - startedAt })));
    return 'delivered';
  } catch (error) {
    const category = classifyProviderError(error.status || 0, error.providerMessage || error.message);
    if (category === 'temporary_provider_error' || category === 'provider_timeout' || category === 'unknown') {
      await supabase.rpc('retry_guardian_notification_email', { p_outbox_id: row.id, p_failure_category: category, p_failure_reason: category, p_retry_after_seconds: retryDelaySeconds(row.attempt_count), p_max_attempts: MAX_ATTEMPTS });
      console.log(JSON.stringify(safeLog({ outboxId: row.id, result: 'retry', category, attempt: row.attempt_count, notificationType: row.notification_type, durationMs: Date.now() - startedAt })));
      return 'retry';
    }
    await supabase.rpc('fail_guardian_notification_email', { p_outbox_id: row.id, p_failure_category: category, p_failure_reason: category });
    console.log(JSON.stringify(safeLog({ outboxId: row.id, result: 'failed', category, attempt: row.attempt_count, notificationType: row.notification_type, durationMs: Date.now() - startedAt })));
    return 'failed';
  }
}

export async function runDispatcher(event, sendEmail) {
  const cfg = requireConfig();
  if (!authorized(event, cfg.dispatcherSecret)) return json(401, { error: 'Unauthorized.' });
  const supabase = createClient(cfg.url, cfg.service, { auth: { autoRefreshToken: false, persistSession: false } });
  const batchSize = Math.max(1, Math.min(Number(process.env.SAFEBUS_NOTIFICATION_BATCH_SIZE || DEFAULT_BATCH_SIZE), 50));
  const { data: rows, error } = await supabase.rpc('claim_guardian_notification_email_batch', { p_batch_size: batchSize, p_lease_seconds: 120, p_max_attempts: MAX_ATTEMPTS });
  if (error) throw error;
  const summary = { claimed: rows?.length || 0, delivered: 0, retry: 0, failed: 0, cancelled: 0 };
  for (const row of rows || []) { const result = await dispatchOne(supabase, cfg, row, sendEmail); summary[result] = (summary[result] || 0) + 1; }
  console.log(JSON.stringify(safeLog({ result: 'batch_complete', claimed: summary.claimed, delivered: summary.delivered, retry: summary.retry, failed: summary.failed, cancelled: summary.cancelled })));
  return json(200, summary);
}

export async function handler(event) {
  try { if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' }); return await runDispatcher(event); }
  catch (e) { console.error(JSON.stringify(safeLog({ result: 'dispatcher_error', category: e.message === 'configuration_error' ? 'configuration_error' : 'unknown' }))); return json(500, { error: 'Notification dispatcher failed.' }); }
}