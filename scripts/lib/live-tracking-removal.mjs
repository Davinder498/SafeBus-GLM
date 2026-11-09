import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { collectSchemaCatalog, calculateSchemaFingerprint } from './schema-fingerprint.mjs';
export const hash = (value) => createHash('sha256').update(value).digest('hex');
export const HISTORY_TABLES = [
  'public.driver_trip_location_updates',
  'safebus_private.retention_archive_chunks',
  'safebus_private.retention_archive_coverage',
];
export const STATE_TABLE = 'safebus_private.driver_tracking_state';
// A server-canonical pre-image can be reviewed through the read-only connector
// without fetching catalog contents or relying on client bigint/array parsers.
export async function reviewedCatalogDigestSql() {
  const queries = [];
  await collectSchemaCatalog({
    query: async (query) => {
      queries.push(query);
      return { rows: [] };
    },
  });
  return (
    'select encode(sha256(convert_to(jsonb_build_array(' +
    queries
      .map(
        (query) =>
          "(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from (" +
          query.replace(/;\s*$/, '') +
          ') s)',
      )
      .join(',') +
    ")::text,'UTF8')),'hex') as digest"
  );
}
export async function reviewedCatalogDigest(client) {
  return (await client.query(await reviewedCatalogDigestSql())).rows[0].digest;
}
export async function requireReviewedCatalog(client, config) {
  const digest = await reviewedCatalogDigest(client);
  if (
    !/^[a-f0-9]{64}$/.test(config.beforeCatalogDigest ?? '') ||
    digest !== config.beforeCatalogDigest
  )
    throw new Error('TRACKING_REMOVAL_UNREVIEWED_CATALOG');
  return digest;
}
export async function registerTrackingSchemaRelease(client, sha) {
  const schemaFingerprint = await calculateSchemaFingerprint(client);
  await client.query(
    "insert into safebus_release.releases(release_sha,environment,status,schema_fingerprint) values($1,'production','deployed',$2)",
    [sha, schemaFingerprint],
  );
  return schemaFingerprint;
}
export async function verifyTrackingSchemaRelease(client, sha) {
  const fingerprint = await calculateSchemaFingerprint(client);
  const { rows } = await client.query(
    "select schema_fingerprint from safebus_release.releases where release_sha=$1 and environment='production' and status='deployed'",
    [sha],
  );
  if (rows.length !== 1 || rows[0].schema_fingerprint !== fingerprint)
    throw new Error('TRACKING_REMOVAL_REGISTERED_SCHEMA_DRIFT');
  return fingerprint;
}
export async function retireGpsArchiveBucket(client, storage) {
  const inspect = () =>
    readOnly(client, async () => {
      const {
        rows: [state],
      } = await client.query(`select
      (select public from storage.buckets where id='retention-evidence') as is_public,
      exists(select 1 from storage.buckets where id='retention-evidence') as present,
      exists(select 1 from storage.objects where bucket_id='retention-evidence') as has_objects`);
      return state;
    });
  const before = await inspect();
  if (!before.present) return { alreadyAbsent: true, objectsDeleted: 0 };
  if (before.is_public !== false || before.has_objects)
    throw new Error('TRACKING_REMOVAL_ARCHIVE_BUCKET_NOT_EMPTY_PRIVATE');
  // The Storage API enforces emptiness too. Never call emptyBucket or delete objects.
  const result = await storage.deleteBucket('retention-evidence');
  if (result.error || (await inspect()).present)
    throw new Error('TRACKING_REMOVAL_ARCHIVE_BUCKET_FAILED');
  return { removed: true, objectsDeleted: 0 };
}
export async function trackingHistoryFootprint(client, maxRows) {
  const {
    rows: [size],
  } = await client.query(
    'select count(*)::int as n from (select 1 from public.driver_trip_location_updates limit $1) s',
    [maxRows + 1],
  );
  if (size.n > maxRows) throw new Error('TRACKING_REMOVAL_RECOVERY_BOUND');
  return (
    await client.query(`select count(*)::int as rows,
    md5(coalesce(string_agg(md5(to_jsonb(h)::text),'' order by id),'')) as digest
    from public.driver_trip_location_updates h`)
  ).rows[0];
}
export async function snapshotTrackingRemoval(client, config) {
  const functions = [];
  for (const f of config.functions) {
    const {
      rows: [row],
    } = await client.query(
      `select md5(replace(pg_get_functiondef(p.oid),chr(13),'')) as md5,
      pg_get_userbyid(proowner) as owner,coalesce(proacl,acldefault('f',proowner))::text[] as acl
      from pg_proc p where oid=to_regprocedure($1)`,
      [f.signature],
    );
    functions.push({
      signature: f.signature,
      ...(row ? { ...row, acl: row.acl.sort() } : { md5: null, owner: null, acl: [] }),
    });
  }
  const tables = [];
  for (const name of [...HISTORY_TABLES, STATE_TABLE]) {
    const {
      rows: [r],
    } = await client.query(
      `select c.relrowsecurity as rls,pg_get_userbyid(c.relowner) as owner,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon,
      has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') as authenticated,
      has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE') as service,
      (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull) order by a.attnum)
       from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns
      from pg_class c where c.oid=to_regclass($1)`,
      [name],
    );
    tables.push({ name, definition: r ?? null });
  }
  const {
    rows: [policy],
  } = await client.query(
    "select active from public.retention_policies where policy_key='raw_location_history'",
  );
  const {
    rows: [job],
  } = await client.query(
    "select schedule,command from cron.job where jobname='safebus-expire-tracking-positions'",
  );
  return { functions, tables, retiredPolicyActive: policy?.active ?? null, expiryJob: job ?? null };
}
export function verifyTrackingRemoval(snapshot, config, state) {
  if (!isDeepStrictEqual(snapshot, config[state])) throw new Error('TRACKING_REMOVAL_SCHEMA_DRIFT');
  return {
    functions: snapshot.functions.length,
    historyRemoved: state === 'after',
    privateStateOnly: state === 'after',
  };
}
export async function readOnly(client, run) {
  await client.query('begin isolation level repeatable read read only');
  try {
    await client.query("set local statement_timeout='12s';set local lock_timeout='1s'");
    return await run();
  } finally {
    await client.query('rollback');
  }
}
export async function rehearseTrackingRemoval(client, sql, config, dataDigest) {
  const before = await readOnly(client, () => snapshotTrackingRemoval(client, config));
  verifyTrackingRemoval(before, config, 'before');
  await client.query('begin isolation level repeatable read');
  let result;
  try {
    await client.query(
      "set local statement_timeout='12s';set local lock_timeout='1s';set local check_function_bodies=on",
    );
    const data = await dataDigest(client);
    await client.query(sql);
    result = verifyTrackingRemoval(await snapshotTrackingRemoval(client, config), config, 'after');
    if (data !== (await dataDigest(client)))
      throw new Error('TRACKING_REMOVAL_OPERATIONAL_DATA_CHANGED');
  } finally {
    await client.query('rollback');
    if (
      !isDeepStrictEqual(
        before,
        await readOnly(client, () => snapshotTrackingRemoval(client, config)),
      )
    )
      throw new Error('TRACKING_REMOVAL_ROLLBACK_FAILED');
  }
  return { ...result, rollbackVerified: true, notificationSent: false };
}
export function verifyRecoveryRun(run, artifacts, { sha, runId, now = Date.now() }) {
  const age = now - Date.parse(run.created_at);
  if (
    !/^[1-9][0-9]*$/.test(runId ?? '') ||
    String(run.id) !== runId ||
    run.path !== '.github/workflows/backup-platform-recovery.yml' ||
    run.event !== 'workflow_dispatch' ||
    run.head_branch !== 'main' ||
    run.head_sha !== sha ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    !Number.isFinite(age) ||
    age < 0 ||
    age > 86400000 ||
    !artifacts.some(
      (a) =>
        a.name === 'platform-recovery-' + sha + '-' + runId && !a.expired && a.size_in_bytes > 0,
    )
  )
    throw new Error('TRACKING_REMOVAL_RECOVERY_INVALID');
}
