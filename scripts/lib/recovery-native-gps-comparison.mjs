import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { assertCapacityScope, capacityQuarantine } from './recovery-capacity-cleanup.mjs';

// Both environments' existing function catalogs were read-only verified on
// 2026-11-23. A different base is a reason to stop, not to overwrite.
export const GPS_ORIGINAL_MD5 = 'a567e385b73bf59ef71a9fc8d47597ad';
export const GPS_OPTIMIZED_MD5 = 'cc339d880a35380907eab09b456739c2';
export const GPS_RPC_SIGNATURE =
  'public.ingest_driver_location_event(text,text,uuid,bigint,timestamptz,double precision,double precision,double precision,double precision,double precision,integer,text)';
const HEARTBEAT_SQL = 'supabase/migrations/pending/20261123095000_bounded_native_tracking_heartbeats.sql';
const CURSOR_SQL = 'supabase/migrations/pending/20261123113000_native_cursor_existing_row_fast_path.sql';
const ALLOWED_ACL = ['authenticated=X/postgres', 'postgres=X/postgres', 'service_role=X/postgres'];

async function readCatalog(db) {
  const { rows } = await db.query(
    `select replace(pg_get_functiondef(p.oid),chr(13),'') as definition,
       md5(replace(pg_get_functiondef(p.oid),chr(13),'')) as md5,
       pg_get_userbyid(p.proowner) as owner,
       coalesce(p.proacl,acldefault('f',p.proowner))::text[] as acl,
       p.prosrc as body
     from pg_proc p where p.oid=to_regprocedure($1)`,
    [GPS_RPC_SIGNATURE],
  );
  if (rows.length !== 1 || !rows[0].definition || !Array.isArray(rows[0].acl))
    throw Error('CAPACITY_GPS_FUNCTION_MISSING');
  return { ...rows[0], acl: rows[0].acl.slice().sort() };
}

function assertPermissions(row) {
  if (row.owner !== 'postgres' ||
      JSON.stringify(row.acl) !== JSON.stringify(ALLOWED_ACL))
    throw Error('CAPACITY_GPS_PERMISSION_DRIFT');
}

async function atomic(db, statements) {
  await db.query('begin');
  try {
    await db.query("set local statement_timeout='8s';set local lock_timeout='1s'");
    for (const sql of statements) await db.query(sql);
    await db.query('commit');
  } catch (error) {
    await db.query('rollback').catch(() => {});
    throw error;
  }
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

/**
 * Use only in the protected, quarantined, empty Recovery capacity runner.
 * It is NOT an installer for production.
 * Never expose captured function SQL or user tokens in the evidence artifact.
 */
export async function createRecoveryGpsComparison(db, {
  readFile = (path) => fs.readFile(path, 'utf8'),
} = {}) {
  const original = await readCatalog(db);
  assertPermissions(original);
  if (original.md5 !== GPS_ORIGINAL_MD5 ||
      !original.body.includes('INSERT INTO safebus_private.driver_tracking_state(device_id) VALUES(v_device.id) ON CONFLICT DO NOTHING;'))
    throw Error('CAPACITY_GPS_BASELINE_DRIFT');

  const [heartbeat, cursor] = await Promise.all([readFile(HEARTBEAT_SQL), readFile(CURSOR_SQL)]);
  if (!heartbeat.includes('CREATE OR REPLACE FUNCTION public.ingest_driver_location_event(') ||
      !cursor.includes('CREATE OR REPLACE FUNCTION public.ingest_driver_location_event('))
    throw Error('CAPACITY_GPS_MIGRATION_INVALID');
  let optimized = null;
  let restored = false;
  return {
    evidence: {
      originalMd5: original.md5,
      migrationsSha256: [sha256(heartbeat), sha256(cursor)],
      phases: ['baseline_before', 'optimized', 'baseline_after'],
    },
    async install() {
      if (restored || optimized) throw Error('CAPACITY_GPS_COMPARISON_STATE');
      const existing = await readCatalog(db);
      assertPermissions(existing);
      if (existing.md5 !== original.md5) throw Error('CAPACITY_GPS_BASELINE_DRIFT');
      await atomic(db, [heartbeat, cursor]);
      const after = await readCatalog(db);
      assertPermissions(after);
      if (after.md5 === original.md5 ||
          !after.body.includes('SELECT * INTO v_state FROM safebus_private.driver_tracking_state') ||
          !after.body.includes("last_seen_at<now()-interval '30 seconds'"))
        throw Error('CAPACITY_GPS_OPTIMIZED_DRIFT');
      optimized = after;
      return { md5: after.md5 };
    },
    async restore() {
      if (restored) return;
      const current = await readCatalog(db);
      assertPermissions(current);
      if (current.md5 !== original.md5) {
        if (optimized && current.md5 !== optimized.md5)
          throw Error('CAPACITY_GPS_UNEXPECTED_FUNCTION');
        if (!optimized && !current.body.includes('SELECT * INTO v_state FROM safebus_private.driver_tracking_state'))
          throw Error('CAPACITY_GPS_UNEXPECTED_FUNCTION');
        await atomic(db, [original.definition]);
      }
      const after = await readCatalog(db);
      assertPermissions(after);
      if (after.md5 !== original.md5)
        throw Error('CAPACITY_GPS_RESTORE_FAILED');
      restored = true;
    },
    get restored() { return restored; },
  };
}

/** Fixed, bounded A-B-A profiles; no caller-controlled duration or arbitrary fleet. */
export function recoveryGpsComparisonPlan(buses) {
  if (buses !== 10 && buses !== 100) throw Error('CAPACITY_WORKLOAD_INVALID');
  const rounds = buses === 100 ? 100 : 10;
  const phaseSequenceSpan = rounds * 2;
  return {
    rounds,
    phaseSequenceSpan,
    phaseDurationMs: phaseSequenceSpan * 3000,
    plannedUpdates: buses * phaseSequenceSpan * 3,
    confirmation: buses === 100 ? 'RUN_RECOVERY_GPS_COMPARE_100' : 'RUN_RECOVERY_GPS_COMPARE',
  };
}

/** Read-only aggregate database observations; counters are cumulative, never reset. */
export async function sampleRecoveryGpsDatabase(db) {
  const { rows } = await db.query(`
    select clock_timestamp() as sampled_at, stats_reset,
      numbackends, xact_commit::text, xact_rollback::text,
      blks_read::text, blks_hit::text, tup_inserted::text,
      tup_updated::text, tup_deleted::text, temp_bytes::text, deadlocks::text,
      (select count(*)::int from pg_stat_activity
        where datname=current_database() and state='active') as active_connections,
      (select count(*)::int from pg_stat_activity
        where datname=current_database() and wait_event_type='Lock') as lock_waiters,
      (select coalesce(jsonb_object_agg(wait_name,n),'{}'::jsonb) from (
        select coalesce(wait_event_type,'CPU_or_running')||':'||coalesce(wait_event,'none') as wait_name,
          count(*) as n from pg_stat_activity
        where datname=current_database() and state='active' and pid<>pg_backend_pid()
        group by wait_event_type,wait_event
      ) waits) as active_waits
    from pg_stat_database where datname=current_database()
  `);
  if (rows.length !== 1) throw Error('CAPACITY_GPS_DATABASE_STATS');
  return rows[0];
}

/** A stopped stage remains a failure; only safely reconciled performance stops
 * may continue to the next diagnostic stage. No auth/transport/correctness
 * failures are tolerated, even if an earlier result had high latency. */
export function classifyRecoveryGpsStage(result) {
  const t = result.transport;
  const errors = Object.keys(result.errors ?? {});
  if (result.reconciled !== true || result.offered !== result.accepted ||
      result.accepted <= 0 || !t || t.writes !== result.offered ||
      t.responses !== result.offered || Object.keys(t.failures ?? {}).length ||
      errors.some(code => !['NATIVE_GPS_DEVICE_QUEUE_LIMIT', 'NATIVE_GPS_IN_FLIGHT_LIMIT'].includes(code)))
    return 'fatal';
  if (result.passed) return result.accepted === result.planned && !errors.length && !result.late ? 'passed' : 'fatal';
  if (result.late > 0 || errors.length || result.deviceBackpressure > 0)
    return 'performance_failed';
  return 'fatal';
}

/** Reset only run-owned GPS state, not accounts/entitlements/route fixtures.
 * All six windows start from equivalent empty tracking state. Caller must
 * drain all HTTP work and quarantine the Data API first. No trigger bypass. */
export async function resetRecoveryGpsWindow(db, scope, tripIds) {
  assertCapacityScope(scope);
  if (![100,500].includes(scope.buses) || tripIds.length !== scope.buses || new Set(tripIds).size !== scope.buses)
    throw Error('CAPACITY_GPS_WINDOW_SCOPE');
  await capacityQuarantine(db);
  await db.query('begin');
  try {
    await db.query("set local lock_timeout='2s';set local statement_timeout='20s'");
    const { rows } = await db.query(`
      select
        exists(select 1 from safebus_release.environment_identity where singleton
          and environment='staging' and project_ref_hash=encode(sha256(convert_to('deladookciebwvqojhkv','UTF8')),'hex')) as identity,
        (select count(*)::int from public.driver_trips) as trips,
        (select count(*)::int from public.driver_trips t
          join public.bus_tracking_sessions s on s.driver_trip_id=t.id and s.tenant_id=t.tenant_id and s.status='active'
          join public.driver_tracking_devices d on d.id=s.device_id and d.tenant_id=t.tenant_id and d.status='active'
          join auth.users u on u.id=d.profile_id
          join public.tenants a on a.id=t.tenant_id and a.type='demo'
          where t.id=any($1::uuid[]) and t.tenant_id=any($2::uuid[])
          and a.name='Capacity Load '||$3||' '||array_position($2::uuid[],a.id)::text
          and u.raw_app_meta_data->>'safebus_capacity_run'=$3 and u.email=any($4::text[])) as owned
    `, [tripIds, scope.tenantIds, scope.run, scope.emails]);
    if (!rows[0]?.identity || rows[0].trips !== scope.buses || rows[0].owned !== scope.buses)
      throw Error('CAPACITY_GPS_WINDOW_SCOPE');
    for (const relation of ['public.driver_trip_current_locations', 'safebus_private.tracking_invalidation_queue',
      'safebus_private.shared_tracking_queue', 'safebus_private.live_bus_progress_cache']) {
      const foreign = await db.query(`select 1 from ${relation} where
        not(driver_trip_id=any($1::uuid[])) or not(tenant_id=any($2::uuid[])) limit 1`, [tripIds, scope.tenantIds]);
      if (foreign.rows.length) throw Error('CAPACITY_GPS_WINDOW_SCOPE');
      await db.query(`delete from ${relation} where driver_trip_id=any($1::uuid[]) and tenant_id=any($2::uuid[])`, [tripIds, scope.tenantIds]);
    }
    await db.query(`delete from safebus_private.driver_tracking_state x using public.bus_tracking_sessions s
      where x.device_id=s.device_id and s.driver_trip_id=any($1::uuid[]) and s.tenant_id=any($2::uuid[])`, [tripIds, scope.tenantIds]);
    if ((await db.query('select 1 from safebus_private.driver_tracking_state limit 1')).rows.length)
      throw Error('CAPACITY_GPS_WINDOW_SCOPE');
    const devices = await db.query(`update public.driver_tracking_devices d set last_seen_at=null
      from public.bus_tracking_sessions s where d.id=s.device_id and d.tenant_id=s.tenant_id
      and s.driver_trip_id=any($1::uuid[]) and s.tenant_id=any($2::uuid[])`, [tripIds, scope.tenantIds]);
    const sessions = await db.query(`update public.bus_tracking_sessions set last_seen_at=null
      where driver_trip_id=any($1::uuid[]) and tenant_id=any($2::uuid[])`, [tripIds, scope.tenantIds]);
    if (devices.rowCount !== scope.buses || sessions.rowCount !== scope.buses)
      throw Error('CAPACITY_GPS_WINDOW_SCOPE');
    await db.query('commit');
  } catch (error) {
    await db.query('rollback').catch(() => {});
    throw error;
  }
}

/** Cumulative authenticated REST SQL counters; read before/after each window.
 * No query text, query identifiers, credentials or provider-wide reset. */
export async function sampleRecoveryGpsSql(db) {
  const { rows } = await db.query(`
    select (select stats_reset from extensions.pg_stat_statements_info) as stats_reset,
      (select dealloc from extensions.pg_stat_statements_info)::text as dealloc,
      coalesce(sum(calls),0)::text as calls,
      coalesce(sum(total_exec_time),0) as total_exec_ms,
      coalesce(sum(wal_bytes),0)::text as wal_bytes,
      coalesce(sum(shared_blks_hit),0)::text as shared_blks_hit,
      coalesce(sum(shared_blks_read),0)::text as shared_blks_read
    from extensions.pg_stat_statements
    where dbid=(select oid from pg_database where datname=current_database())
      and userid=(select oid from pg_roles where rolname='authenticated')
      and toplevel and query ilike '%ingest_driver_location_event%'
  `);
  if (rows.length !== 1) throw Error('CAPACITY_GPS_DATABASE_STATS');
  return rows[0];
}
