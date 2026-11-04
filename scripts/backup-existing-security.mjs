import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { installBinding, readInstallInputs } from './lib/existing-security-install.mjs';
import { assertBackupReleaseState } from './lib/backup-release-state.mjs';
import {
  observePlatformRecoveryCatalog,
  platformRecoveryAttestation,
} from './lib/platform-recovery-state.mjs';
import { digest, assertPrivateApiSchemaHidden } from './lib/existing-security-rehearsal.mjs';
import {
  captureEncryptedDump,
  pgBackupEnvironment,
  publicBackupKey,
} from './lib/security-backup.mjs';
import {
  assertReviewedCheckout,
  safeSecurityFailure,
  verifiedDatabaseClient,
} from './lib/security-workflow-evidence.mjs';

let client;
let stage = 'preflight';
let capturedCatalog;
try {
  const releaseSha = process.env.SAFEBUS_RELEASE_SHA;
  assertReviewedCheckout(releaseSha);
  const platformRecovery =
    process.env.SAFEBUS_BACKUP_CONFIRM === 'BACKUP_PLATFORM_RECOVERY_ENCRYPTED';
  if (
    !platformRecovery &&
    process.env.SAFEBUS_BACKUP_CONFIRM !== 'BACKUP_EXISTING_SECURITY_ENCRYPTED'
  )
    throw new Error('Explicit encrypted backup confirmation is required.');
  if (platformRecovery && process.env.GITHUB_REF !== 'refs/heads/main')
    throw new Error('Platform recovery requires reviewed main.');
  const binding = installBinding({
    environment: process.env.SAFEBUS_DEPLOY_ENV,
    databaseUrl: process.env.SAFEBUS_DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    confirmation: 'INSTALL_EXISTING_SECURITY_0123_0122_0124',
  });
  const plan = platformRecovery ? undefined : await readInstallInputs();
  const captureCatalog = () =>
    platformRecovery
      ? observePlatformRecoveryCatalog(client, binding)
      : assertBackupReleaseState(client);
  const publicKeyPem = process.env.SAFEBUS_BACKUP_PUBLIC_KEY;
  publicBackupKey(publicKeyPem);
  const version = execFileSync('pg_dump', ['--version'], { encoding: 'utf8' });
  if (!/\b17\./.test(version))
    throw new Error('PostgreSQL 17 backup tools are required for this reviewed project.');
  const runId = process.env.GITHUB_RUN_ID;
  if (!/^[1-9][0-9]*$/.test(runId ?? '')) throw new Error('Workflow run binding is required.');
  stage = 'api-isolation';
  await assertPrivateApiSchemaHidden(
    process.env.SUPABASE_URL,
    process.env.SAFEBUS_REHEARSAL_API_KEY,
  );
  stage = 'database';
  const ca = process.env.SAFEBUS_DATABASE_CA_CERT;
  client = verifiedDatabaseClient(
    process.env.SAFEBUS_DATABASE_URL,
    ca,
    'safebus-security-backup-catalog',
  );
  await client.connect();
  const lock = await client.query(
    "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) as acquired",
  );
  if (!lock.rows[0]?.acquired) throw new Error('Another schema operation is running.');
  await client.query('begin isolation level repeatable read read only');
  try {
    await client.query("set local statement_timeout='30s'");
    await client.query("set local lock_timeout='2s'");
    await client.query("set local idle_in_transaction_session_timeout='17min'");
    const server = await client.query(
      "select current_setting('server_version_num')::integer as version, pg_export_snapshot() as id",
    );
    if (Math.floor(server.rows[0].version / 10000) !== 17)
      throw new Error('Review backup tools for this server version.');
    const catalog = await captureCatalog();
    capturedCatalog = catalog;
    const createdAt = new Date().toISOString();
    const output = path.resolve(
      platformRecovery
        ? '.safebus-release/platform-recovery'
        : '.safebus-release/existing-security-backup',
    );
    await fs.mkdir(output, { recursive: true });
    const caFile = path.join(process.env.RUNNER_TEMP, 'safebus-approved-db-ca.pem');
    await fs.writeFile(caFile, ca, { flag: 'wx', mode: 0o600 });
    const env = pgBackupEnvironment(process.env.SAFEBUS_DATABASE_URL, caFile);
    stage = 'encrypted-export';
    const archive = await captureEncryptedDump(
      'pg_dump',
      [
        '--format=custom',
        '--lock-wait-timeout=2s',
        '--no-subscriptions',
        '--snapshot=' + server.rows[0].id,
      ],
      { directory: output, name: 'database', publicKeyPem, env },
    );
    const roles = await captureEncryptedDump(
      'pg_dumpall',
      ['--roles-only', '--no-role-passwords'],
      { directory: output, name: 'roles', publicKeyPem, env },
    );
    await fs.writeFile(
      path.join(output, 'catalog-before.json'),
      JSON.stringify(catalog, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    const backup = {
      format: 1,
      environment: 'production',
      mode: platformRecovery ? 'encrypted-platform-export' : 'encrypted-logical-export',
      releaseSha,
      runId,
      ...binding,
      ...(platformRecovery ? platformRecoveryAttestation() : { inputs: plan.inputs }),
      catalogSha256: digest(JSON.stringify(catalog)),
      createdAt,
      exportCompletedAt: new Date().toISOString(),
      archive,
      roles,
      fullRestoreVerified: false,
      scope:
        'Full logical database export; roles without passwords. Storage object bytes and provider secrets require separate recovery.',
    };
    await fs.writeFile(path.join(output, 'backup.json'), JSON.stringify(backup, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  } finally {
    await client.query('rollback');
  }
  stage = 'post-export-catalog';
  await client.query('begin transaction read only');
  try {
    await client.query("set local statement_timeout='30s'");
    await client.query("set local lock_timeout='2s'");
    if (digest(JSON.stringify(await captureCatalog())) !== digest(JSON.stringify(capturedCatalog)))
      throw new Error('Database schema changed during export; capture a fresh backup.');
  } finally {
    await client.query('rollback');
  }
  console.log('PASS: encrypted database and role exports captured without hosted writes.');
  console.log(
    'Download and retain the encrypted artifact off-site; decryption and full restoration remain unverified.',
  );
} catch (error) {
  console.error(safeSecurityFailure(error, stage));
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
