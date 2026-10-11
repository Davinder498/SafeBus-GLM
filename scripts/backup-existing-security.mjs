import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  installBinding,
  readInstallInputs,
  recoverySnapshot,
  RELEASE_STATE_SQL,
} from './lib/existing-security-install.mjs';
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
  if (process.env.SAFEBUS_BACKUP_CONFIRM !== 'BACKUP_EXISTING_SECURITY_ENCRYPTED')
    throw new Error('Explicit encrypted backup confirmation is required.');
  const binding = installBinding({
    environment: process.env.SAFEBUS_DEPLOY_ENV,
    databaseUrl: process.env.SAFEBUS_DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    confirmation: 'INSTALL_EXISTING_SECURITY_0123_0122_0124',
  });
  const plan = await readInstallInputs();
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
    const state = (await client.query(RELEASE_STATE_SQL)).rows[0];
    if (Object.values(state).some((v) => v !== false))
      throw new Error('This backup path is limited to the unadopted security snapshot.');
    const server = await client.query(
      "select current_setting('server_version_num')::integer as version, pg_export_snapshot() as id",
    );
    if (Math.floor(server.rows[0].version / 10000) !== 17)
      throw new Error('Review backup tools for this server version.');
    const catalog = await recoverySnapshot(client);
    capturedCatalog = catalog;
    const createdAt = new Date().toISOString();
    const output = path.resolve('.safebus-release/existing-security-backup');
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
      mode: 'encrypted-logical-export',
      releaseSha,
      runId,
      ...binding,
      inputs: plan.inputs,
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
    const state = (await client.query(RELEASE_STATE_SQL)).rows[0];
    if (
      Object.values(state).some((v) => v !== false) ||
      digest(JSON.stringify(await recoverySnapshot(client))) !==
        digest(JSON.stringify(capturedCatalog))
    )
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
