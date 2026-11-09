// Scheduled execution defaults to dry-run. Destructive execution additionally
// requires both the existing server flag and the protected database approval.
import { createClient } from '@supabase/supabase-js';
import { RETENTION_POLICY_KEYS } from '../../../../scripts/lib/retention-verification.mjs';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const notificationKeys = ['email_deleted', 'inbox_deleted', 'push_deleted', 'devices_staled'];
function count(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)))
    throw new Error('RETENTION_RESULT_INVALID');
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error('RETENTION_RESULT_INVALID');
  return result;
}
class RetentionPolicyFailure extends Error {
  constructor(failedPolicies) {
    super('RETENTION_POLICY_FAILED');
    this.failedPolicies = failedPolicies;
  }
}
function policyResults(data, dryRun) {
  // A compatible client release precedes the database removal. Accept the
  // predecessor's aggregate-only retired policy result during that transition.
  if (Array.isArray(data)) {
    const retired = data.filter((row) => row?.policy_key === 'raw_location_history');
    if (
      retired.length > 1 ||
      retired.some(
        (row) =>
          row.dry_run !== true ||
          dryRun !== true ||
          row.status !== 'completed' ||
          row.error_code !== null,
      )
    )
      throw new Error('RETENTION_POLICY_RESULT_INVALID');
    for (const row of retired) count(row.affected_rows);
    data = data.filter((row) => row?.policy_key !== 'raw_location_history');
  }
  if (!Array.isArray(data) || data.length !== RETENTION_POLICY_KEYS.length)
    throw new Error('RETENTION_POLICY_RESULT_INVALID');
  const seen = new Set();
  const results = data.map((row) => {
    if (
      !row ||
      !RETENTION_POLICY_KEYS.includes(row.policy_key) ||
      seen.has(row.policy_key) ||
      !['completed', 'failed'].includes(row.status) ||
      row.dry_run !== dryRun ||
      (row.status === 'completed' && row.error_code !== null)
    )
      throw new Error('RETENTION_POLICY_RESULT_INVALID');
    seen.add(row.policy_key);
    return {
      policyKey: row.policy_key,
      affectedRows: count(row.affected_rows),
      dryRun,
      status: 'completed',
    };
  });
  const failed = data.filter((row) => row.status === 'failed');
  if (failed.length)
    throw new RetentionPolicyFailure(
      failed.map((row) => ({
        policyKey: row.policy_key,
        errorCode:
          typeof row.error_code === 'string' && /^[0-9A-Z]{5}$/.test(row.error_code)
            ? row.error_code
            : 'unknown',
      })),
    );
  return results;
}
function notificationResult(data, dryRun) {
  if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object')
    throw new Error('RETENTION_NOTIFICATION_RESULT_INVALID');
  const affectedRows = notificationKeys.reduce((sum, key) => sum + count(data[0][key]), 0);
  if (!Number.isSafeInteger(affectedRows)) throw new Error('RETENTION_NOTIFICATION_RESULT_INVALID');
  return { policyKey: 'notification_system', affectedRows, dryRun, status: 'completed' };
}

export async function runRetention() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const service = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return json(503, { error: 'Retention runner is not configured.' });
  const dryRun = true; // Legacy inventory is observation-only; scoped lifecycle owns execution.
  try {
    /** @type {import('@supabase/supabase-js').SupabaseClient<import('@safebus/types/database').Database>} */
    const client = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await client.rpc('run_all_retention_deletions', { p_dry_run: dryRun });
    if (error) throw new Error('RETENTION_RPC_FAILED');
    const results = policyResults(data, dryRun);
    const notification = await client.rpc('apply_notification_retention', { p_dry_run: dryRun });
    if (notification.error) throw new Error('RETENTION_RPC_FAILED');
    results.push(notificationResult(notification.data, dryRun));
    console.log(JSON.stringify({ event: 'retention_run_completed', dryRun, results }));
    return json(200, { dryRun, results });
  } catch (error) {
    // Only locally defined codes enter logs or responses, never SDK/provider detail.
    const knownCodes = [
      'RETENTION_RPC_FAILED',
      'RETENTION_POLICY_FAILED',
      'RETENTION_RESULT_INVALID',
      'RETENTION_POLICY_RESULT_INVALID',
      'RETENTION_NOTIFICATION_RESULT_INVALID',
    ];
    const code =
      error instanceof Error && knownCodes.includes(error.message)
        ? error.message
        : 'RETENTION_RPC_FAILED';
    const failures =
      error instanceof RetentionPolicyFailure ? { failedPolicies: error.failedPolicies } : {};
    console.error(JSON.stringify({ event: 'retention_run_failed', code, ...failures }));
    return json(500, { error: 'Retention run failed.', code, ...failures });
  }
}
export async function handler() {
  return runRetention();
}
