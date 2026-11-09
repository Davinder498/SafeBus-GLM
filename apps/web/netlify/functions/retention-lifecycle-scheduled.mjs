import { disposeOneAccount } from './disposal-accounts.mjs';
import { sendMonitorAlerts } from '../../../../scripts/lib/monitor-alert-email.mjs';
import { createClient } from '@supabase/supabase-js';

export const RETENTION_CLASSES = [
  'student_events',
  'exceptions',
  'statuses',
  'announcements',
  'email',
  'push',
  'inbox',
  'audience_failures',
  'push_devices',
  'cases',
  'invitations',
  'guardian_relationships',
  'student_records',
  'bus_tracking_sessions',
  'bus_run_dispatches',
  'trip_records',
  'driver_records',
  'guardian_records',
  'audit_records',
  'rate_limit_buckets',
  'user_sessions',
];
export function validateLifecycleResult(value, dryRun) {
  // Allow the predecessor's two aggregate counters during a schema-first rollout.
  // No history or archive work is performed by this worker.
  const retired = ['gps', 'archive_manifests'];
  const keys = Object.keys(value?.counts || {});
  if (
    !value ||
    value.version !== 1 ||
    value.dryRun !== dryRun ||
    value.limit !== 500 ||
    !value.counts ||
    ![RETENTION_CLASSES.length, RETENTION_CLASSES.length + retired.length].includes(keys.length) ||
    !keys.every((key) => [...RETENTION_CLASSES, ...retired].includes(key)) ||
    !RETENTION_CLASSES.every((key) => keys.includes(key)) ||
    !keys.every(
      (key) =>
        Number.isSafeInteger(value.counts[key]) &&
        value.counts[key] >= 0 &&
        value.counts[key] <= 500,
    )
  )
    throw new Error('RETENTION_LIFECYCLE_RESULT');
  return Object.fromEntries(RETENTION_CLASSES.map((key) => [key, value.counts[key]]));
}

// A single saturated dry-run is an observation, not an alert or a deletion.
// When approved deletion is eventually enabled, a saturated final batch
// indicates work may remain. Notify operations with fixed, deduplicated text;
// an alert-provider failure must not turn a completed database run into a retry.
export async function reportRetentionBacklog({
  dryRun,
  saturated,
  notify = sendMonitorAlerts,
  log = console.log,
} = {}) {
  if (dryRun !== false || saturated !== true) return { result: 'skipped' };
  try {
    const outcome = await notify({ checks: [{ check: 'retention_backlog', result: 'fail' }] });
    if (outcome?.result !== 'accepted') throw new Error('RETENTION_BACKLOG_ALERT_UNCONFIRMED');
    log(
      JSON.stringify({ event: 'retention_lifecycle_backlog_alert', result: 'provider_accepted' }),
    );
    return { result: 'accepted' };
  } catch {
    log(
      JSON.stringify({
        event: 'retention_lifecycle_backlog_alert',
        result: 'failed',
        code: 'MONITOR_ALERT_DELIVERY_FAILED',
      }),
    );
    return { result: 'failed' };
  }
}

export async function handler() {
  const dryRun = process.env.SAFEBUS_RETENTION_LIFECYCLE_EXECUTE !== 'true';
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return { statusCode: 503, body: JSON.stringify({ code: 'RETENTION_LIFECYCLE_CONFIG' }) };
  try {
    /** @type {import('@supabase/supabase-js').SupabaseClient<import('@safebus/types/database').Database>} */
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.timeout(8_000) }),
      },
    });
    // Destructive operational-record disposal still requires its existing approval.
    if (!dryRun) {
      const state = await client.rpc('disposal_account_work', { p_action: 'state', p_id: null });
      if (state.error || state.data?.enabled !== true)
        throw new Error('RETENTION_LIFECYCLE_DISABLED');
    }
    const counts = Object.fromEntries(RETENTION_CLASSES.map((name) => [name, 0]));
    const started = Date.now();
    let saturated = false;
    for (let batch = 0; batch < (dryRun ? 1 : 4); batch += 1) {
      const result = await client.rpc('run_retention_lifecycle', {
        p_dry_run: dryRun,
        p_limit: 500,
      });
      if (result.error) throw new Error('RETENTION_LIFECYCLE_RPC');
      const current = validateLifecycleResult(result.data, dryRun);
      for (const name of RETENTION_CLASSES) counts[name] += current[name];
      saturated = RETENTION_CLASSES.some((name) => current[name] === 500);
      if (!saturated || Date.now() - started > 12_000) break;
    }
    const account = dryRun ? 'dry_run' : await disposeOneAccount(client);
    await reportRetentionBacklog({ dryRun, saturated });
    console.log(
      JSON.stringify({
        event: 'retention_lifecycle_completed',
        dryRun,
        counts,
        account,
        saturated,
      }),
    );
    return {
      statusCode: 200,
      body: JSON.stringify({ dryRun, counts, account, saturated }),
    };
  } catch (error) {
    const code = /^RETENTION_LIFECYCLE_[A-Z_]+$/.test(error?.message || '')
      ? error.message
      : 'RETENTION_LIFECYCLE_FAILED';
    console.error(JSON.stringify({ event: 'retention_lifecycle_failed', dryRun, code }));
    try {
      await sendMonitorAlerts({ checks: [{ check: 'retention_lifecycle', result: 'fail' }] });
    } catch {
      console.error(
        JSON.stringify({
          event: 'retention_lifecycle_alert_failed',
          code: 'MONITOR_ALERT_DELIVERY_FAILED',
        }),
      );
    }
    return { statusCode: 500, body: JSON.stringify({ code }) };
  }
}
