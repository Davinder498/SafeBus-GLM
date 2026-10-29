import { drainNotifications } from '../../../supabase/functions/_shared/notification-worker.mjs';
import {
  classifyFcmError,
  retryDelaySeconds,
} from '../../../supabase/functions/_shared/push-dispatcher-core.mjs';
const MAX_ATTEMPTS = 5;
async function bestEffortIncident(rpc, tenant, code) {
  try {
    await rpc('record_notification_delivery_incident', {
      p_tenant_id: tenant,
      p_incident_code: code,
    });
  } catch {}
}
export async function runPushDispatcher({
  rpc,
  send,
  workerId,
  batchSize = 50,
  concurrency = 16,
  drain = false,
  budgetMs = 15_000,
  now = Date.now,
}) {
  const limit = Math.max(1, Math.min(Number(batchSize) || 50, 200));
  return drainNotifications({
    concurrency,
    now,
    budgetMs,
    maxMessages: drain ? 50_000 : limit,
    retryIdle: drain,
    claim: async (remaining) =>
      (await rpc('claim_push_notification_deliveries', {
        p_worker_id: workerId,
        p_limit: Math.min(limit, remaining, drain ? concurrency : 200),
        p_lease_seconds: 120,
      })) || [],
    deliver: async (claim) => {
      let row = claim;
      try {
        const resolved = await rpc('resolve_push_notification_delivery', {
          p_outbox_id: claim.outbox_id,
          p_worker_id: workerId,
        });
        if (!resolved?.[0]) return 'cancelled';
        row = resolved[0];
        const providerMessageId = await send(row);
        await rpc('complete_push_notification_delivery', {
          p_outbox_id: row.outbox_id,
          p_worker_id: workerId,
          p_provider_message_id: providerMessageId,
        });
        return 'delivered';
      } catch (error) {
        const failure = classifyFcmError(error);
        if (failure.retry && Number(row.attempt_count) < MAX_ATTEMPTS) {
          const delay =
            retryDelaySeconds(row.attempt_count, failure.retryAfter) +
            (drain ? Math.floor(Math.random() * 15) : 0);
          await rpc('retry_push_notification_delivery', {
            p_outbox_id: row.outbox_id,
            p_worker_id: workerId,
            p_failure_category: failure.category,
            p_failure_code: failure.code,
            p_available_after: new Date(now() + delay * 1000).toISOString(),
            p_retry_after_seconds: failure.retryAfter,
          });
          return 'retry';
        }
        await rpc('fail_push_notification_delivery', {
          p_outbox_id: row.outbox_id,
          p_worker_id: workerId,
          p_failure_category: failure.category,
          p_failure_code: failure.code,
          p_invalidate_device: failure.invalidateDevice,
        });
        if (failure.category === 'configuration_error') {
          await bestEffortIncident(rpc, row.tenant_id, 'firebase_authentication');
          await bestEffortIncident(rpc, null, 'firebase_configuration');
        } else if (failure.code === 'QUOTA_EXCEEDED')
          await bestEffortIncident(rpc, row.tenant_id, 'quota_exhausted');
        else if (failure.category === 'temporary_provider_error')
          await bestEffortIncident(rpc, row.tenant_id, 'provider_unavailable');
        return 'failed';
      }
    },
  });
}
