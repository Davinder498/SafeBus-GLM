import { sendMonitorAlerts } from '../../../../scripts/lib/monitor-alert-email.mjs';
import { createClient } from '@supabase/supabase-js';
import { archiveKeys, archiveOne } from './retention-archive.mjs';

export const RETENTION_CLASSES = [
  'gps',
  'student_events',
  'exceptions',
  'statuses',
  'announcements',
  'email',
  'push',
  'inbox',
  'archive_manifests',
  'cases',
];
export function validateLifecycleResult(value, dryRun) {
  if (
    !value ||
    value.version !== 1 ||
    value.dryRun !== dryRun ||
    value.limit !== 500 ||
    !value.counts ||
    Object.keys(value.counts).length !== RETENTION_CLASSES.length ||
    !RETENTION_CLASSES.every(
      (key) =>
        Number.isSafeInteger(value.counts[key]) &&
        value.counts[key] >= 0 &&
        value.counts[key] <= 500,
    )
  )
    throw new Error('RETENTION_LIFECYCLE_RESULT');
  return value.counts;
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
    // Dry-runs perform no storage writes or archive mutations. Execute requires
    // valid dedicated keys even when there are currently no preservation cases.
    const archive = dryRun ? 'dry_run' : await archiveOne(client, archiveKeys());
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
    console.log(
      JSON.stringify({
        event: 'retention_lifecycle_completed',
        dryRun,
        counts,
        archive,
        saturated,
      }),
    );
    return { statusCode: 200, body: JSON.stringify({ dryRun, counts, archive, saturated }) };
  } catch (error) {
    const code = /^RETENTION_(?:LIFECYCLE|ARCHIVE)_[A-Z_]+$/.test(error?.message || '')
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
