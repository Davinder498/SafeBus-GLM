// Emergency restoration for the isolated Recovery GPS comparison ONLY.
// Never run this workflow against production or without the exact reviewed SHA.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { verifiedDatabaseClient, assertReviewedCheckout } from './lib/security-workflow-evidence.mjs';
import { createEnvironmentBinding, assertEnvironmentIdentity } from './lib/environment-identity.mjs';
import { GPS_ORIGINAL_MD5, GPS_RPC_SIGNATURE } from './lib/recovery-native-gps-comparison.mjs';

const TARGET = 'deladookciebwvqojhkv';
const OPTIMIZED_MD5 = 'cc339d880a35380907eab09b456739c2';
const ACL = ['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres'];
const sqlFile = 'supabase/migrations/pending/20261109214533_remove_gps_history.sql';
const SHA = (value) => createHash('sha256').update(value).digest('hex');

export function reviewedOriginalFunction(sql) {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.ingest_driver_location_event(');
  const end = sql.indexOf('REVOKE ALL ON FUNCTION public.ingest_driver_location_event', start);
  if (start < 0 || end < start || end - start < 5000)
    throw Error('RECOVERY_GPS_RESTORE_SOURCE');
  const definition = sql.slice(start, end).trim();
  if (!definition.endsWith('$function$;')) throw Error('RECOVERY_GPS_RESTORE_SOURCE');
  return definition;
}

async function inspect(db) {
  const { rows } = await db.query(
    `select md5(replace(pg_get_functiondef(p.oid),chr(13),'')) as md5,
       pg_get_userbyid(p.proowner) as owner,
       coalesce(p.proacl,acldefault('f',p.proowner))::text[] as acl
     from pg_proc p where p.oid=to_regprocedure($1)`, [GPS_RPC_SIGNATURE]);
  if (rows.length !== 1 || rows[0].owner !== 'postgres' ||
      JSON.stringify([...rows[0].acl].sort()) !== JSON.stringify(ACL))
    throw Error('RECOVERY_GPS_RESTORE_CATALOG');
  return rows[0].md5;
}

export async function restoreRecoveryGps(db, { definition, target = TARGET } = {}) {
  if (target !== TARGET) throw Error('RECOVERY_GPS_RESTORE_TARGET');
  if (!definition?.includes('CREATE OR REPLACE FUNCTION public.ingest_driver_location_event('))
    throw Error('RECOVERY_GPS_RESTORE_SOURCE');
  const before = await inspect(db);
  if (![GPS_ORIGINAL_MD5, OPTIMIZED_MD5].includes(before))
    throw Error('RECOVERY_GPS_RESTORE_DRIFT');
  await db.query('begin');
  try {
    await db.query("set local lock_timeout='1s';set local statement_timeout='10s'");
    // Emergency closure first. Recovery is an isolated, quarantined test DB.
    await db.query('revoke usage on schema public,safebus_private from authenticated');
    if (before === OPTIMIZED_MD5) await db.query(definition);
    if ((await inspect(db)) !== GPS_ORIGINAL_MD5)
      throw Error('RECOVERY_GPS_RESTORE_FAILED');
    await db.query('commit');
  } catch (e) {
    await db.query('rollback').catch(() => {});
    throw e;
  }
  return { before, after: GPS_ORIGINAL_MD5, restored: true };
}

// Direct invocation only under the existing protected, main-branch workflow.
if (process.argv[1]?.endsWith('/restore-recovery-native-gps.mjs')) {
  let client, stage='context';
  try {
    assertReviewedCheckout(process.env.SAFEBUS_RELEASE_SHA);
    if (process.env.GITHUB_REF !== 'refs/heads/main' ||
        process.env.SAFEBUS_CAPACITY_CONFIRM !== 'RESTORE_RECOVERY_GPS_BASELINE' ||
        process.env.SAFEBUS_CAPACITY_WORKLOAD !== 'android_gps_restore')
      throw Error('RECOVERY_GPS_RESTORE_CONTEXT');

    const url = new URL(process.env.SAFEBUS_CAPACITY_DATABASE_URL);
    if (url.pathname !== '/postgres' || (url.port || '5432') !== '5432' ||
        url.search || url.hash || !url.password)
      throw Error('RECOVERY_GPS_RESTORE_CONNECTION');
    const binding = createEnvironmentBinding({
      environment: 'staging', databaseUrl: url.toString(),
      supabaseUrl: `https://${TARGET}.supabase.co`,
    });
    client = verifiedDatabaseClient(url.toString(),
      process.env.SAFEBUS_CAPACITY_DATABASE_CA_CERT,'safebus-recovery-gps-restore');
    await client.connect();
    await assertEnvironmentIdentity(client,binding);
    stage='lock';
    const lock = (await client.query(
      "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) as acquired"
    )).rows[0]?.acquired;
    if (lock !== true) throw Error('RECOVERY_GPS_RESTORE_BUSY');
    const source = await fs.readFile(sqlFile,'utf8');
    stage='restore';
    const result = await restoreRecoveryGps(client,
      {definition: reviewedOriginalFunction(source)});
    stage='verify';
    await assertEnvironmentIdentity(client,binding);
    const evidence = {
      releaseSha: process.env.SAFEBUS_RELEASE_SHA,
      target: TARGET, workload: 'android_gps_restore',
      sourceSha256: SHA(source), originalMd5: result.after,
      previousMd5: result.before, functionRestored: true,
      syntheticRecordsRemoved: false, capacityQualified: false,
    };
    await fs.mkdir('.safebus-release/recovery-capacity',{recursive:true});
    await fs.writeFile('.safebus-release/recovery-capacity/evidence.json',
      JSON.stringify(evidence,null,2)+'\n');
    console.log('Recovery GPS function restored and Data API quarantined; inspect synthetic cleanup separately.');
  } catch {
    process.exitCode=1;
    console.error('Recovery GPS restoration refused; stage='+stage+'; inspect isolated database.');
  } finally {
    if (client) {
      await client.query('rollback').catch(()=>{});
      await client.end().catch(()=>{});
    }
  }
}
