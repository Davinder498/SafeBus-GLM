// SafeBus Alberta - Phase 3 scheduled retention runner.
//
// The schedule is registered in netlify.toml. Netlify scheduled functions are
// not addressable by a public production URL. Execution defaults to dry-run;
// destructive deletion is enabled only after counsel approval by setting the
// server-only SAFEBUS_RETENTION_EXECUTE value to exactly "true".

import { createClient } from '@supabase/supabase-js';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export async function runRetention() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) {
    return json(503, { error: 'Retention runner is not configured.' });
  }

  const dryRun = process.env.SAFEBUS_RETENTION_EXECUTE !== 'true';
  /** @type {import('@supabase/supabase-js').SupabaseClient<import('@safebus/types/database').Database>} */
  const client = createClient(url, service, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.rpc('run_all_retention_deletions', {
    p_dry_run: dryRun,
  });

  if (error) {
    console.error(JSON.stringify({ event: 'retention_run_failed', code: error.code ?? 'unknown' }));
    return json(500, { error: 'Retention run failed.' });
  }

  const failedPolicies = Array.isArray(data)
    ? data.filter((row) => row.status === 'failed').map((row) => ({
        policyKey: row.policy_key,
        errorCode: row.error_code ?? 'unknown',
      }))
    : [];
  if (failedPolicies.length > 0) {
    console.error(JSON.stringify({ event: 'retention_run_failed', failedPolicies }));
    return json(500, { error: 'One or more retention policies failed.', failedPolicies });
  }

  const { data: notificationRetention, error: notificationRetentionError } = await client.rpc(
    'apply_notification_retention',
    { p_dry_run: dryRun },
  );
  if (notificationRetentionError) {
    console.error(JSON.stringify({ event: 'retention_run_failed', code: notificationRetentionError.code ?? 'unknown' }));
    return json(500, { error: 'Notification retention run failed.' });
  }

  const results = Array.isArray(data)
    ? data.map((row) => ({
        policyKey: row.policy_key,
        affectedRows: Number(row.affected_rows ?? 0),
        dryRun: Boolean(row.dry_run),
        status: row.status ?? 'completed',
      }))
    : [];
  results.push({ policyKey: 'notification_system', affectedRows: Object.values(notificationRetention?.[0] ?? {}).reduce((sum, value) => sum + Number(value ?? 0), 0), dryRun, status: 'completed' });
  console.log(JSON.stringify({ event: 'retention_run_completed', dryRun, results }));
  return json(200, { dryRun, results });
}

export async function handler() {
  return runRetention();
}
