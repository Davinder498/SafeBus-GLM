import { sendMonitorAlerts } from '../../../../scripts/lib/monitor-alert-email.mjs';
import { createClient } from '@supabase/supabase-js';
import { archiveKeys } from './retention-archive.mjs';

export const RETENTION_CLASSES = [
  'email',
  'push',
  'inbox',
  'gps',
  'current_cache',
  'student_events',
  'exceptions',
  'statuses',
  'announcements',
  'bus_tracking_sessions',
  'bus_run_dispatches',
  'trip_records',
  'guardian_relationships',
  'student_records',
  'driver_records',
  'invitations',
  'audit_records',
  'rate_limit_buckets',
  'user_sessions',
  'export_manifests',
  'export_jobs',
  'business_metadata',
  'archive_manifests',
  'cases',
  'record_holds',
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
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dryRun = process.env.SAFEBUS_RETENTION_LIFECYCLE_EXECUTE !== 'true';
  try {
    if (!url || !service) throw new Error('RETENTION_LIFECYCLE_CONFIG');
    /** @type {import('@supabase/supabase-js').SupabaseClient<import('@safebus/types/database').Database>} */
    const client = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init = {}) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(6_000), cache: 'no-store' }),
      },
    });
    const token = process.env.SAFEBUS_RETENTION_WORKER_TOKEN;
    if (dryRun) {
      const result = await client.rpc('run_retention_lifecycle', { p_dry_run: true, p_limit: 500 });
      if (result.error) throw new Error('RETENTION_LIFECYCLE_RPC');
      const counts = validateLifecycleResult(result.data, true);
      console.log(JSON.stringify({ event: 'retention_lifecycle_dry_run', counts }));
      if (!token) return { statusCode: 200, body: JSON.stringify({ dryRun: true, counts }) };
    }
    archiveKeys();
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(token))
      throw new Error('RETENTION_WORKER_CONFIG');
    const response = await fetch(
      'https://safebus.kids/.netlify/functions/retention-lifecycle-background',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(5_000),
        redirect: 'error',
      },
    );
    if (response.status !== 202) throw new Error('RETENTION_WORKER_HANDOFF');
    console.log(JSON.stringify({ event: 'retention_worker_handoff', state: 'provider_accepted' }));
    return { statusCode: 202, body: JSON.stringify({ dryRun, state: 'queued' }) };
  } catch (error) {
    const code = /^RETENTION_[A-Z_]+$/.test(error?.message || '')
      ? error.message
      : 'RETENTION_LIFECYCLE_FAILED';
    console.error(JSON.stringify({ event: 'retention_lifecycle_failed', dryRun, code }));
    try {
      await sendMonitorAlerts({ checks: [{ check: 'retention_lifecycle', result: 'fail' }] });
    } catch {
      console.error(JSON.stringify({ event: 'retention_lifecycle_alert_failed' }));
    }
    return { statusCode: 500, body: JSON.stringify({ code }) };
  }
}
