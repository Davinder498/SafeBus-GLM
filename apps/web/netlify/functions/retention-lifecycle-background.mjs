import { timingSafeEqual, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { archiveKeys, archiveOne, ARCHIVE_BUCKET } from './retention-archive.mjs';
import { exportOne, disposeBusinessOne } from './retention-export-storage.mjs';
import { validateLifecycleResult, RETENTION_CLASSES } from './retention-lifecycle-scheduled.mjs';
import { sendMonitorAlerts } from '../../../../scripts/lib/monitor-alert-email.mjs';

export function authorizedWorker(headers, expected) {
  const supplied = (headers?.authorization || headers?.Authorization || '').replace(/^Bearer /, '');
  if (
    typeof expected !== 'string' ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(expected) ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(supplied) ||
    supplied.length !== expected.length
  )
    return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}
export async function runLifecycleWorker(
  client,
  {
    keys,
    owner = randomUUID(),
    now = Date.now,
    budgetMs = 660_000,
    execute = false,
    log = console.log,
  } = {},
) {
  const claim = await client.rpc('retention_worker_lease', { p_action: 'claim', p_owner: owner });
  if (claim.error) throw new Error('RETENTION_WORKER_LEASE');
  if (claim.data !== true) return { state: 'already_running' };
  const totals = Object.fromEntries(RETENTION_CLASSES.map((k) => [k, 0]));
  const started = now();
  let rounds = 0;
  try {
    const bucket = await client.storage.getBucket(ARCHIVE_BUCKET);
    if (bucket.error || bucket.data?.public !== false) throw new Error('RETENTION_ARCHIVE_CONFIG');
    while (now() - started < budgetMs) {
      const control = await client.rpc('retention_worker_lease', {
        p_action: 'enabled',
        p_owner: owner,
      });
      if (control.error) throw new Error('RETENTION_WORKER_LEASE');
      if (!execute || control.data !== true) {
        const exported = await exportOne(client, keys, { allowRemoval: false });
        rounds += 1;
        if (exported !== 'verified' && exported !== 'finished') break;
        continue;
      }
      const batch = await client.rpc('run_retention_lifecycle', { p_dry_run: false, p_limit: 500 });
      if (batch.error) throw new Error('RETENTION_LIFECYCLE_RPC');
      const counts = validateLifecycleResult(batch.data, false);
      for (const name of RETENTION_CLASSES) totals[name] += counts[name];
      const gps = await archiveOne(client, keys);
      const exported = await exportOne(client, keys);
      const business = await disposeBusinessOne(client);
      const orphan = await client.rpc('retention_orphan_upload');
      if (orphan.error) throw new Error('RETENTION_EXPORT_RPC');
      if (orphan.data !== null) {
        if (!/^staging\/business\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.bin$/.test(orphan.data))
          throw new Error('RETENTION_EXPORT_RESULT');
        const deleted = await client.storage.from(ARCHIVE_BUCKET).remove([orphan.data]);
        if (deleted.error) throw new Error('RETENTION_EXPORT_REMOVE');
      }
      rounds += 1;
      log(JSON.stringify({ event: 'retention_worker_batch', counts, gps, exported, business }));
      const progress =
        Object.values(counts).some((n) => n > 0) ||
        ['verified', 'removed', 'changed'].includes(gps) ||
        ['verified', 'removed', 'finished'].includes(exported) ||
        business === 'removed' ||
        orphan.data !== null;
      if (!progress) break;
    }
    log(JSON.stringify({ event: 'retention_worker_completed', rounds, totals }));
    return { state: 'completed', rounds, totals };
  } finally {
    const release = await client.rpc('retention_worker_lease', {
      p_action: 'release',
      p_owner: owner,
    });
    if (release.error) log(JSON.stringify({ event: 'retention_worker_release_failed' }));
  }
}
export async function handler(event) {
  if (
    event.httpMethod !== 'POST' ||
    (event.body?.length || 0) > 1024 ||
    !authorizedWorker(event.headers, process.env.SAFEBUS_RETENTION_WORKER_TOKEN)
  )
    return { statusCode: 401 };
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const service = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) throw new Error('RETENTION_WORKER_CONFIG');
    /** @type {import('@supabase/supabase-js').SupabaseClient<import('@safebus/types/database').Database>} */
    const client = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init = {}) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(8_000), cache: 'no-store' }),
      },
    });
    await runLifecycleWorker(client, {
      keys: archiveKeys(),
      execute: process.env.SAFEBUS_RETENTION_LIFECYCLE_EXECUTE === 'true',
    });
    return { statusCode: 204 };
  } catch (error) {
    const code = /^RETENTION_[A-Z_]+$/.test(error?.message || '')
      ? error.message
      : 'RETENTION_WORKER_FAILED';
    console.error(JSON.stringify({ event: 'retention_worker_failed', code }));
    try {
      await sendMonitorAlerts({ checks: [{ check: 'retention_lifecycle', result: 'fail' }] });
    } catch {
      console.error(JSON.stringify({ event: 'retention_worker_alert_failed' }));
    }
    return { statusCode: 500 };
  }
}
