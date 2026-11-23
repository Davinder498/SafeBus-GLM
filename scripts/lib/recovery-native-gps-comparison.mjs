import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Both environments' existing function catalogs were read-only verified on
// 2026-11-23. A different base is a reason to stop, not to overwrite.
export const GPS_ORIGINAL_MD5 = 'a567e385b73bf59ef71a9fc8d47597ad';
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
