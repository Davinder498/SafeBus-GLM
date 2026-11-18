import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import {
  verifiedDatabaseClient,
  assertReviewedCheckout,
} from './lib/security-workflow-evidence.mjs';
import {
  createEnvironmentBinding,
  assertEnvironmentIdentity,
} from './lib/environment-identity.mjs';
import { RECOVERY_AUTH_URL, assertRecoveryAuthKeys } from './lib/recovery-auth.mjs';
import { capacityQuarantine, cleanupCapacity } from './lib/recovery-capacity-cleanup.mjs';
import { quarantineCapacity, capacityFetch } from './lib/recovery-capacity-lifecycle.mjs';
import { checkedCapacityAuth } from './lib/recovery-capacity-auth.mjs';
import { recoverCapacityScope } from './lib/recovery-capacity-recovery.mjs';
import { calculateSchemaFingerprint } from './lib/schema-fingerprint.mjs';
const { createClient } = createRequire(new URL('../apps/web/package.json', import.meta.url))(
  '@supabase/supabase-js',
);
const run = process.env.SAFEBUS_CAPACITY_CLEANUP_RUN;
const buses = Number(process.env.SAFEBUS_CAPACITY_BUSES);
const evidence = {
  target: 'deladookciebwvqojhkv',
  runId: run,
  cleanupVerified: false,
  capacityQualified: false,
};
let db,
  connected = false,
  stage = 'preflight';
try {
  assertReviewedCheckout(process.env.SAFEBUS_RELEASE_SHA);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_CAPACITY_CONFIRM !== 'CLEANUP_RECOVERY_CAPACITY' ||
    !/^\d+-\d+$/.test(run ?? '') ||
    ![10, 100, 500].includes(buses)
  )
    throw Error('CAPACITY_CLEANUP_WORKFLOW_REQUIRED');
  const url = new URL(process.env.SAFEBUS_CAPACITY_DATABASE_URL);
  if (
    url.pathname !== '/postgres' ||
    (url.port || '5432') !== '5432' ||
    url.search ||
    url.hash ||
    !url.password
  )
    throw Error('CAPACITY_SESSION_CONNECTION_REQUIRED');
  assertRecoveryAuthKeys(
    process.env.SAFEBUS_CAPACITY_AUTH_SECRET,
    process.env.SAFEBUS_CAPACITY_PUBLISHABLE_KEY,
  );
  const binding = createEnvironmentBinding({
    environment: 'staging',
    databaseUrl: url.toString(),
    supabaseUrl: RECOVERY_AUTH_URL,
  });
  db = verifiedDatabaseClient(
    url.toString(),
    process.env.SAFEBUS_CAPACITY_DATABASE_CA_CERT,
    'safebus-capacity-cleanup',
  );
  await db.connect();
  connected = true;
  await db.query("set statement_timeout='8s';set lock_timeout='1s'");
  await assertEnvironmentIdentity(db, binding);
  if (
    !(
      await db.query(
        "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) locked",
      )
    ).rows[0].locked
  )
    throw Error('CAPACITY_DEPLOYMENT_BUSY');
  stage = 'quarantine';
  await quarantineCapacity(db);
  const fingerprint = await calculateSchemaFingerprint(db);
  stage = 'ownership';
  // Only an intact, identified failed capacity run is accepted. Partial/foreign state needs inspection.
  const tenants = (await db.query('select id,name,type from public.tenants order by name')).rows;
  const users = (
    await db.query("select id,email,raw_app_meta_data->>'safebus_capacity_run' run from auth.users")
  ).rows;
  const scope = recoverCapacityScope({ run, buses, tenants, users });
  for (const table of ['cron.job', 'vault.secrets', 'storage.objects'])
    if ((await db.query(`select 1 from ${table} limit 1`)).rowCount)
      throw Error('CAPACITY_ISOLATION_DRIFT');
  if (
    (
      await db.query(
        "select 1 from pg_trigger where tgrelid in ('auth.users'::regclass,'auth.sessions'::regclass) and not tgisinternal",
      )
    ).rowCount
  )
    throw Error('CAPACITY_AUTH_TRIGGER_DRIFT');
  const admin = createClient(RECOVERY_AUTH_URL, process.env.SAFEBUS_CAPACITY_AUTH_SECRET, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => capacityFetch(input, init, { origin: RECOVERY_AUTH_URL }) },
  });
  stage = 'rehearsal';
  await cleanupCapacity(db, scope, true);
  if ((await calculateSchemaFingerprint(db)) !== fingerprint)
    throw Error('CAPACITY_SCHEMA_CHANGED');
  stage = 'domain-cleanup';
  await cleanupCapacity(db, scope);
  stage = 'auth-cleanup';
  for (const user of users) checkedCapacityAuth(await admin.auth.admin.deleteUser(user.id));
  if (
    (await db.query('select 1 from auth.users limit 1')).rowCount ||
    (await db.query('select 1 from auth.sessions limit 1')).rowCount
  )
    throw Error('CAPACITY_AUTH_CLEANUP');
  await capacityQuarantine(db);
  if ((await calculateSchemaFingerprint(db)) !== fingerprint)
    throw Error('CAPACITY_SCHEMA_CHANGED');
  evidence.cleanupVerified = true;
  console.log(
    'Recovery capacity cleanup verified; API closed; synthetic accounts and fixtures removed.',
  );
} catch (error) {
  evidence.failedStage = stage;
  evidence.failureCode = /^[A-Z][A-Z0-9_]{3,65}$/.test(error.message ?? '')
    ? error.message
    : /^[A-Z0-9]{5}$/.test(error.code ?? '')
      ? error.code
      : 'UNCLASSIFIED_FAILURE';
  process.exitCode = 1;
  console.error(
    `Recovery cleanup stopped at stage=${stage}; code=${evidence.failureCode}; inspect before rerun.`,
  );
} finally {
  if (connected) await db.end().catch(() => {});
  evidence.finishedAt = new Date().toISOString();
  await fs.mkdir('.safebus-release/recovery-capacity', { recursive: true });
  await fs.writeFile(
    '.safebus-release/recovery-capacity/evidence.json',
    JSON.stringify(evidence, null, 2),
  );
}
