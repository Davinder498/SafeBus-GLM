import { createClient } from '@supabase/supabase-js';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { randomUUID } from 'node:crypto';

const MAX_ATTEMPTS = 5;
const json = (statusCode, body) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export function retryDelaySeconds(attempt, providerRetryAfter = null) {
  const boundedProvider = Number.isFinite(providerRetryAfter) ? Math.max(0, Math.min(providerRetryAfter, 86_400)) : 0;
  const schedule = [60, 300, 900, 3_600, 10_800];
  return Math.max(boundedProvider, schedule[Math.max(0, Math.min(Number(attempt) - 1, schedule.length - 1))]);
}

export function classifyFcmError(error) {
  const code = String(error?.code || 'unknown');
  if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') return { category: 'invalid_device', retry: false, invalidateDevice: true };
  if (code === 'messaging/mismatched-credential' || code === 'messaging/invalid-credential' || code === 'messaging/authentication-error') return { category: 'configuration_error', retry: false, invalidateDevice: false };
  if (code === 'messaging/quota-exceeded' || code === 'messaging/server-unavailable' || code === 'messaging/internal-error' || code === 'messaging/unknown-error') return { category: 'temporary_provider_error', retry: true, invalidateDevice: false };
  if (code === 'messaging/invalid-argument' || code === 'messaging/message-rate-exceeded') return { category: 'permanent_payload_error', retry: false, invalidateDevice: false };
  return { category: 'unknown', retry: true, invalidateDevice: false };
}

export function buildFcmMessage(row) {
  const urgent = row.severity === 'urgent';
  return {
    token: row.fcm_token,
    notification: { title: row.title, body: row.body },
    data: { notificationId: row.notification_id, eventType: row.event_type, category: row.category, destination: '/notifications' },
    android: {
      priority: urgent ? 'high' : 'normal',
      collapseKey: row.collapse_key,
      notification: { channelId: row.android_channel, tag: row.collapse_key, icon: 'ic_stat_safebus', visibility: 'private', defaultVibrateTimings: urgent },
    },
  };
}

function requireConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dispatcherSecret = process.env.SAFEBUS_PUSH_DISPATCHER_SECRET;
  const firebaseJson = process.env.SAFEBUS_FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!url || !serviceKey || !dispatcherSecret || !firebaseJson) throw new Error('configuration_error');
  let serviceAccount;
  try { serviceAccount = JSON.parse(firebaseJson); } catch { throw new Error('configuration_error'); }
  return { url, serviceKey, dispatcherSecret, serviceAccount };
}

function authorized(event, expected) {
  const supplied = event.headers?.['x-safebus-push-secret'] || event.headers?.['X-SafeBus-Push-Secret'];
  return Boolean(supplied && supplied === expected);
}

function messagingFor(serviceAccount) {
  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
  return getMessaging(app);
}

async function rpc(supabase, name, args) {
  const result = await supabase.rpc(name, args);
  if (result.error) throw result.error;
  return result.data;
}

export async function runPushDispatcher(event, dependencies = {}) {
  const config = requireConfig();
  if (!authorized(event, config.dispatcherSecret)) return json(401, { error: 'Unauthorized.' });
  /** @type {import('@supabase/supabase-js').SupabaseClient<import('@safebus/types/database').Database>} */
  const supabase = dependencies.supabase || createClient(config.url, config.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const messaging = dependencies.messaging || messagingFor(config.serviceAccount);
  const workerId = `netlify-${randomUUID()}`;
  const batchSize = Math.max(1, Math.min(Number(process.env.SAFEBUS_PUSH_BATCH_SIZE || 50), 200));
  const rows = await rpc(supabase, 'claim_push_notification_deliveries', { p_worker_id: workerId, p_limit: batchSize, p_lease_seconds: 120 }) || [];
  const summary = { claimed: rows.length, delivered: 0, retry: 0, failed: 0, cancelled: 0, error: 0 };
  for (const claim of rows) {
    let row = claim;
    try {
      const resolved = await rpc(supabase, 'resolve_push_notification_delivery', { p_outbox_id: claim.outbox_id, p_worker_id: workerId });
      if (!resolved?.[0]) { summary.cancelled += 1; continue; }
      row = resolved[0];
      const providerMessageId = await messaging.send(buildFcmMessage(row));
      await rpc(supabase, 'complete_push_notification_delivery', { p_outbox_id: row.outbox_id, p_worker_id: workerId, p_provider_message_id: providerMessageId });
      summary.delivered += 1;
      console.log(JSON.stringify({ result: 'delivered', outboxId: row.outbox_id, category: row.category, attempt: row.attempt_count }));
    } catch (error) {
      const classification = classifyFcmError(error);
      try {
        if (classification.retry && row.attempt_count < MAX_ATTEMPTS) {
          const retryAfter = Number(error?.retryAfter || error?.retry_after || 0) || null;
          const delay = retryDelaySeconds(row.attempt_count, retryAfter);
          await rpc(supabase, 'retry_push_notification_delivery', { p_outbox_id: row.outbox_id, p_worker_id: workerId, p_failure_category: classification.category, p_failure_code: String(error?.code || 'unknown'), p_available_after: new Date(Date.now() + delay * 1000).toISOString(), p_retry_after_seconds: retryAfter });
          summary.retry += 1;
        } else {
          await rpc(supabase, 'fail_push_notification_delivery', { p_outbox_id: row.outbox_id, p_worker_id: workerId, p_failure_category: classification.category, p_failure_code: String(error?.code || 'unknown'), p_invalidate_device: classification.invalidateDevice });
          if (classification.category === 'configuration_error') {
            await rpc(supabase, 'record_notification_delivery_incident', { p_tenant_id: row.tenant_id, p_incident_code: 'firebase_authentication' });
            await rpc(supabase, 'record_notification_delivery_incident', { p_tenant_id: null, p_incident_code: 'firebase_configuration' });
          }
          summary.failed += 1;
        }
        console.log(JSON.stringify({ result: classification.retry ? 'retry' : 'failed', outboxId: row.outbox_id, category: classification.category, attempt: row.attempt_count }));
      } catch {
        summary.error += 1;
        console.error(JSON.stringify({ result: 'queue_resolution_error', outboxId: row.outbox_id, category: 'unknown' }));
      }
    }
  }
  return json(200, summary);
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  try { return await runPushDispatcher(event); }
  catch (error) {
    console.error(JSON.stringify({ result: 'push_dispatcher_error', category: error?.message === 'configuration_error' ? 'configuration_error' : 'unknown' }));
    return json(500, { error: 'Push dispatcher failed.' });
  }
}
