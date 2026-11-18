import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  verifiedDatabaseClient,
  assertReviewedCheckout,
} from './lib/security-workflow-evidence.mjs';
import {
  createEnvironmentBinding,
  assertEnvironmentIdentity,
} from './lib/environment-identity.mjs';
import { TARGET_REF } from './lib/capacity-bootstrap.mjs';
import { capacityQuarantine, capacityTables } from './lib/recovery-capacity-cleanup.mjs';
import { collectSchemaCatalog } from './lib/schema-fingerprint.mjs';
import { sha256 } from './lib/migrations.mjs';
import {
  expectedVisibilityCatalog,
  visibilityContextMigration,
} from './lib/guardian-visibility-context.mjs';
let db,
  connected = false,
  stage = 'preflight';
try {
  assertReviewedCheckout(process.env.SAFEBUS_RELEASE_SHA);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_MAP_CONFIRM !== 'VERIFY_RECOVERY_MAP'
  )
    throw Error('PROTECTED_WORKFLOW_REQUIRED');
  const url = new URL(process.env.SAFEBUS_CAPACITY_DATABASE_URL);
  if (
    url.pathname !== '/postgres' ||
    (url.port || '5432') !== '5432' ||
    url.search ||
    url.hash ||
    !url.password
  )
    throw Error('SESSION_CONNECTION_REQUIRED');
  const binding = createEnvironmentBinding({
    environment: 'staging',
    databaseUrl: url.toString(),
    supabaseUrl: `https://${TARGET_REF}.supabase.co`,
  });
  db = verifiedDatabaseClient(
    url.toString(),
    process.env.SAFEBUS_CAPACITY_DATABASE_CA_CERT,
    'safebus-recovery-map-context',
  );
  await db.connect();
  connected = true;
  await db.query("set statement_timeout='20s';set lock_timeout='2s';set search_path=pg_catalog");
  await assertEnvironmentIdentity(db, binding);
  if (
    !(
      await db.query(
        "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) locked",
      )
    ).rows[0].locked
  )
    throw Error('DEPLOYMENT_BUSY');
  const verifyIsolation = async () => {
    await capacityQuarantine(db);
    for (const table of [
      'auth.users',
      'auth.sessions',
      'cron.job',
      'vault.secrets',
      'storage.objects',
      'public.tenants',
      ...capacityTables.map((t) => 'public.' + t),
    ])
      if ((await db.query(`select 1 from ${table} limit 1`)).rowCount)
        throw Error('NONEMPTY_RECOVERY');
  };
  await verifyIsolation();
  const before = await collectSchemaCatalog(db),
    expected = expectedVisibilityCatalog(before);
  const sql = await fs.readFile(visibilityContextMigration, 'utf8');
  for (const mode of ['rehearse', 'install']) {
    stage = mode;
    await db.query('begin');
    await db.query(sql);
    stage = `${mode}-catalog`;
    assert.deepEqual(await collectSchemaCatalog(db), expected, 'UNEXPECTED_CATALOG_CHANGE');
    await verifyIsolation();
    stage = `${mode}-finish`;
    await db.query(mode === 'rehearse' ? 'rollback' : 'commit');
    assert.deepEqual(
      await collectSchemaCatalog(db),
      mode === 'rehearse' ? before : expected,
      'CATALOG_VERIFICATION',
    );
  }
  stage = 'verify';
  await verifyIsolation();
  await assertEnvironmentIdentity(db, binding);
  await fs.mkdir('.safebus-release/recovery-map-context', { recursive: true });
  await fs.writeFile(
    '.safebus-release/recovery-map-context/evidence.json',
    JSON.stringify(
      {
        target: TARGET_REF,
        releaseSha: process.env.SAFEBUS_RELEASE_SHA,
        migrationSha256: sha256(sql),
        before: sha256(JSON.stringify(before)),
        after: sha256(JSON.stringify(expected)),
        rollbackVerified: true,
        onlyExpectedFunctionChanged: true,
        quarantined: true,
        capacityQualified: false,
      },
      null,
      2,
    ),
  );
  console.log(
    'Recovery guardian context installed; exact catalog delta and rollback verified; API closed.',
  );
} catch (error) {
  const code = /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? error.code : 'UNKNOWN';
  const reasons = [
    'PROTECTED_WORKFLOW_REQUIRED',
    'SESSION_CONNECTION_REQUIRED',
    'DEPLOYMENT_BUSY',
    'NONEMPTY_RECOVERY',
    'CAPACITY_API_EXPOSED',
    'VISIBILITY_BASELINE_MISMATCH',
    'GUARDIAN_VISIBILITY_BASELINE_MISMATCH',
    'UNEXPECTED_CATALOG_CHANGE',
    'CATALOG_VERIFICATION',
  ];
  const reason = reasons.find((value) => error?.message?.includes(value)) ?? 'UNCLASSIFIED';
  console.error(
    `Recovery guardian context stopped at stage=${stage}; code=${code}; reason=${reason}; provider details omitted.`,
  );
  process.exitCode = 1;
} finally {
  if (connected) {
    await db.query('rollback').catch(() => {});
    await db.end().catch(() => {});
  }
}
