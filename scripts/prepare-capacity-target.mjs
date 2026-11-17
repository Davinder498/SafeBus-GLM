import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  verifiedDatabaseClient,
  assertReviewedCheckout,
} from './lib/security-workflow-evidence.mjs';
import { pgBackupEnvironment } from './lib/security-backup.mjs';
import { calculateSchemaFingerprint } from './lib/schema-fingerprint.mjs';
import {
  assertEnvironmentIdentity,
  registerEnvironmentIdentity,
} from './lib/environment-identity.mjs';
import { sha256 } from './lib/migrations.mjs';
import {
  bootstrapBindings,
  schemaDumpArgs,
  normalizeDump,
  assertAppCatalog,
  collectBootstrapCatalog,
  assertEmptyTarget,
  assertManagedDefaults,
  RESET_TARGET_DEFAULTS_SQL,
  EMPTY_TARGET_SQL,
  EXTENSIONS,
  SOURCE_REF,
  TARGET_REF,
  SOURCE_FINGERPRINT,
} from './lib/capacity-bootstrap.mjs';

let source,
  target,
  directory,
  stage = 'preflight';
let sourceConnected = false,
  targetConnected = false;
try {
  assertReviewedCheckout(process.env.SAFEBUS_RELEASE_SHA);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_CAPACITY_CONFIRM !== 'PREPARE_RECOVERY_SCHEMA_ONLY' ||
    !['rehearse', 'install'].includes(process.env.SAFEBUS_CAPACITY_MODE)
  )
    throw new Error('Protected reviewed workflow required.');
  const binding = bootstrapBindings(
    process.env.SAFEBUS_DATABASE_URL,
    process.env.SAFEBUS_CAPACITY_DATABASE_URL,
  );
  if (!/\b17\./.test(execFileSync('pg_dump', ['--version'], { encoding: 'utf8' })))
    throw new Error('PostgreSQL 17 client required.');
  source = verifiedDatabaseClient(
    process.env.SAFEBUS_DATABASE_URL,
    process.env.SAFEBUS_DATABASE_CA_CERT,
    'safebus-capacity-schema-source',
  );
  target = verifiedDatabaseClient(
    process.env.SAFEBUS_CAPACITY_DATABASE_URL,
    process.env.SAFEBUS_CAPACITY_DATABASE_CA_CERT,
    'safebus-capacity-schema-target',
  );
  await source.connect();
  sourceConnected = true;
  await target.connect();
  targetConnected = true;
  for (const client of [source, target]) {
    if (
      !(
        await client.query(
          "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) as locked",
        )
      ).rows[0].locked
    )
      throw new Error('Another schema operation is running.');
    if (
      Math.floor(
        Number((await client.query('show server_version_num')).rows[0].server_version_num) / 10000,
      ) !== 17
    )
      throw new Error('PostgreSQL 17 server required.');
  }
  stage = 'source-snapshot';
  await source.query('begin isolation level repeatable read read only');
  await source.query(
    "set local statement_timeout='30s'; set local lock_timeout='2s'; set local idle_in_transaction_session_timeout='12min'",
  );
  await assertEnvironmentIdentity(source, binding.source);
  if ((await calculateSchemaFingerprint(source)) !== SOURCE_FINGERPRINT)
    throw new Error('Production schema changed; review a new baseline.');
  const sourceCatalog = await collectBootstrapCatalog(source);
  const snapshot = (await source.query('select pg_export_snapshot() as id')).rows[0].id;
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'safebus-capacity-'));
  await fs.chmod(directory, 0o700);
  const caPath = path.join(directory, 'source-ca.pem');
  await fs.writeFile(caPath, process.env.SAFEBUS_DATABASE_CA_CERT, { mode: 0o600 });
  stage = 'schema-export';
  const sql = normalizeDump(
    execFileSync('pg_dump', schemaDumpArgs(snapshot), {
      env: pgBackupEnvironment(process.env.SAFEBUS_DATABASE_URL, caPath),
      encoding: 'utf8',
      maxBuffer: 20_000_000,
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
  // Read only native dump. No archive, SQL, provider credentials or row data is
  // uploaded as an artifact or printed. PostgreSQL executes this in one target
  // transaction; catalog mismatches cause rollback before any commit.
  stage = 'target-empty';
  await target.query('begin');
  await target.query(
    "set local statement_timeout='120s'; set local lock_timeout='2s'; set local idle_in_transaction_session_timeout='5min'",
  );
  assertEmptyTarget((await target.query(EMPTY_TARGET_SQL)).rows[0]);
  for (const [name, schema, version] of EXTENSIONS) {
    const available = await target.query(
      'select installed from pg_available_extension_versions where name=$1 and version=$2',
      [name, version],
    );
    if (available.rowCount !== 1) throw new Error('Required extension version unavailable.');
    // All identifiers and versions come from the reviewed constant allowlist.
    await target.query(
      `create extension if not exists "${name}" with schema "${schema}" version '${version}'`,
    );
    const actual = await target.query('select extversion from pg_extension where extname=$1', [
      name,
    ]);
    if (actual.rows[0]?.extversion !== version) throw new Error('Extension version mismatch.');
  }
  if (Number((await target.query('select count(*) as count from cron.job')).rows[0].count) !== 0)
    throw new Error('Target has scheduled jobs.');
  assertManagedDefaults(sourceCatalog, await collectBootstrapCatalog(target));
  await target.query(RESET_TARGET_DEFAULTS_SQL);
  stage = 'target-schema';
  await target.query(sql);
  stage = 'catalog-verification';
  const appDigest = assertAppCatalog(sourceCatalog, await collectBootstrapCatalog(target));
  await target.query(
    'revoke usage on schema public, safebus_private from public, anon, authenticated, service_role',
  );
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const access = await target.query(
      "select has_schema_privilege($1,'public','USAGE') or has_schema_privilege($1,'safebus_private','USAGE') as allowed",
      [role],
    );
    if (access.rows[0].allowed) throw new Error('Target schema quarantine failed.');
  }
  assertAppCatalog(sourceCatalog, await collectBootstrapCatalog(target), true);
  await registerEnvironmentIdentity(target, binding.target, process.env.SAFEBUS_RELEASE_SHA);
  await assertEnvironmentIdentity(target, binding.target);
  // Data API must remain disabled at the project level until its separate
  // security/configuration review. No cron jobs or delivery credentials are copied.
  const committed = process.env.SAFEBUS_CAPACITY_MODE === 'install';
  await target.query(committed ? 'commit' : 'rollback');
  if (committed) {
    await target.query('begin transaction read only');
    assertAppCatalog(sourceCatalog, await collectBootstrapCatalog(target), true);
    await assertEnvironmentIdentity(target, binding.target);
    await target.query('rollback');
  } else assertEmptyTarget((await target.query(EMPTY_TARGET_SQL)).rows[0]);
  await source.query('rollback');
  await fs.mkdir('.safebus-release/capacity-bootstrap', { recursive: true });
  const evidence = {
    version: 1,
    createdAt: new Date().toISOString(),
    sourceRef: SOURCE_REF,
    targetRef: TARGET_REF,
    releaseSha: process.env.SAFEBUS_RELEASE_SHA,
    mode: process.env.SAFEBUS_CAPACITY_MODE,
    committed,
    sourceFingerprint: SOURCE_FINGERPRINT,
    appCatalogSha256: appDigest,
    schemaSqlSha256: sha256(sql),
    schemaApiAccess: 'quarantined',
    rowsCopied: 0,
    cronJobsCopied: 0,
    secretsCopied: 0,
    capacityVerified: false,
    applicationReady: false,
    excluded: [
      'provider schemas and policies',
      'Auth/API configuration',
      'global roles/default grants',
      'publications',
      'cron schedules',
      'reference rows',
      'external service configuration',
      'synthetic identities',
    ],
  };
  await fs.writeFile(
    '.safebus-release/capacity-bootstrap/' + process.env.SAFEBUS_CAPACITY_MODE + '.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      stage: 'completed',
      committed,
      capacityVerified: false,
      applicationReady: false,
    }),
  );
} catch (error) {
  // SQLSTATE is safe diagnostic metadata; never emit raw SQL, messages or URLs.
  const code = /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? error.code : 'UNKNOWN';
  const section = [
    'columns',
    'relations',
    'constraints',
    'indexes',
    'policies',
    'routines',
    'routineGrants',
    'relationGrants',
    'columnGrants',
    'triggers',
    'schemas',
    'types',
    'typeGrants',
    'sequences',
    'eventTriggers',
    'defaultGrants',
  ].includes(error?.catalogSection)
    ? error.catalogSection
    : 'none';
  console.error(
    'Capacity schema preparation stopped at stage=' +
      stage +
      '; code=' +
      code +
      '; section=' +
      section,
  );
  process.exitCode = 1;
} finally {
  for (const [client, connected] of [
    [target, targetConnected],
    [source, sourceConnected],
  ]) {
    if (client && connected) {
      await client.query('rollback').catch(() => {});
      await client.end().catch(() => {});
    }
  }
  if (directory) await fs.rm(directory, { recursive: true, force: true });
}
