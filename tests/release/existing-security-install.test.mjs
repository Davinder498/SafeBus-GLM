import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import {
  installBinding,
  readInstallInputs,
  verifyRecovery,
  installExistingSecurity,
  recoverySnapshot,
  RELEASE_STATE_SQL,
  MAX_RECOVERY_AGE_MS,
} from '../../scripts/lib/existing-security-install.mjs';
import {
  APPROVED_PROJECT,
  CATALOG_SNAPSHOT_SQL,
  digest,
} from '../../scripts/lib/existing-security-rehearsal.mjs';
import {
  encryptBackupStream,
  decryptBackupFile,
  pgBackupEnvironment,
  captureEncryptedDump,
} from '../../scripts/lib/security-backup.mjs';
import {
  verifyWorkflowRun,
  safeSecurityFailure,
  verifiedDatabaseClient,
} from '../../scripts/lib/security-workflow-evidence.mjs';

const releaseSha = 'a'.repeat(40);
const target = {
  environment: 'production',
  databaseUrl: `postgresql://postgres:synthetic-password@db.${APPROVED_PROJECT}.supabase.co:5432/postgres?sslmode=require`,
  supabaseUrl: `https://${APPROVED_PROJECT}.supabase.co`,
  confirmation: 'INSTALL_EXISTING_SECURITY_0123_0122_0124',
};
const binding = installBinding(target);
const acceptedSql = "begin transaction read only;\nselect 'PASS' as result;\nrollback;\n";
const plan = {
  inputs: [],
  migrations: [{ filename: '0123.sql' }, { filename: '0122.sql' }, { filename: '0124.sql' }],
  sql: {
    reconciliation: 'reconcile',
    security: 'security',
    sessionValidation: 'claim-validation',
    acceptance: acceptedSql,
  },
};

function fakeDatabase({ failure, priorInstallation = false, schemaDrift = false } = {}) {
  const queries = [];
  let changed = false;
  return {
    queries,
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql === failure)
        throw Object.assign(new Error('postgresql://secret-provider-detail'), { code: '08006' });
      if (sql === RELEASE_STATE_SQL)
        return {
          rows: [
            {
              identity: false,
              migrations: false,
              releases: false,
              security_installation: priorInstallation,
              release_objects: priorInstallation,
            },
          ],
        };
      if (sql === CATALOG_SNAPSHOT_SQL)
        return { rows: [{ snapshot: { fixture: true, changed, schemaDrift } }] };
      if (sql.includes('pg_try_advisory')) return { rows: [{ acquired: true }] };
      if (sql === 'rollback') changed = false;
      if (Object.values(plan.sql).slice(0, 3).includes(sql)) changed = true;
      if (sql.includes("'PASS'")) return { rows: [{ result: 'PASS' }] };
      return { rows: [] };
    },
  };
}

async function evidence(client = fakeDatabase()) {
  const catalog = await recoverySnapshot(client);
  const now = Date.now();
  const backup = {
    format: 1,
    environment: 'production',
    mode: 'encrypted-logical-export',
    ...binding,
    releaseSha,
    runId: '12345',
    inputs: plan.inputs,
    createdAt: new Date(now - 1000).toISOString(),
    catalogSha256: digest(JSON.stringify(catalog)),
    archive: {
      plaintextSha256: 'b'.repeat(64),
      ciphertextSha256: 'c'.repeat(64),
      plaintextBytes: 1000,
    },
    roles: {
      plaintextSha256: 'd'.repeat(64),
      ciphertextSha256: 'e'.repeat(64),
      plaintextBytes: 1000,
    },
  };
  const receipt = {
    format: 1,
    projectRefHash: binding.projectRefHash,
    catalogSha256: backup.catalogSha256,
    archiveSha256: backup.archive.plaintextSha256,
    rolesSha256: backup.roles.plaintextSha256,
    backupRunId: backup.runId,
    backupStoredOffSite: true,
    decryptionVerified: true,
    fullRestoreVerified: true,
    schemaAndDataVerified: true,
    permissionsAndAuthVerified: true,
    destinationIsProduction: false,
    destinationCanadian: true,
    backupLocationReference: 'owner-vault:backup-12345',
    restoreEvidenceReference: 'owner-vault:restore-12345',
    verifierReference: 'owner:approved-recovery-verifier',
    verifiedAt: new Date(now).toISOString(),
  };
  return {
    backup,
    catalog,
    receipt,
    receiptSha256: digest(JSON.stringify(receipt)),
    binding,
    plan,
    releaseSha,
    installationRunId: '23456',
    rehearsalRunId: '34567',
    now,
  };
}

test('recovery denies unverified, stale, mismatched and production-destination evidence before any SQL', async (t) => {
  const original = await evidence();
  const variants = [
    [
      (e) => {
        e.receipt.fullRestoreVerified = false;
      },
      /full restore receipt/,
    ],
    [
      (e) => {
        e.receipt.backupStoredOffSite = false;
      },
      /full restore receipt/,
    ],
    [
      (e) => {
        e.receipt.destinationIsProduction = true;
      },
      /full restore receipt/,
    ],
    [
      (e) => {
        e.receipt.permissionsAndAuthVerified = false;
      },
      /full restore receipt/,
    ],
    [
      (e) => {
        e.receipt.archiveSha256 = 'f'.repeat(64);
      },
      /full restore receipt/,
    ],
    [
      (e) => {
        e.receipt.backupRunId = '99999';
      },
      /full restore receipt/,
    ],
    [
      (e) => {
        e.backup.projectRefHash = 'f'.repeat(64);
      },
      /does not match/,
    ],
    [
      (e) => {
        e.catalog.authorization.fixture = false;
      },
      /does not match/,
    ],
    [
      (e) => {
        e.backup.inputs = [{ file: 'other.sql', sha256: 'f'.repeat(64) }];
      },
      /does not match/,
    ],
    [
      (e) => {
        e.backup.createdAt = new Date(e.now - MAX_RECOVERY_AGE_MS - 1).toISOString();
      },
      /24 hours/,
    ],
    [
      (e) => {
        e.receipt.verifiedAt = new Date(e.now + 120000).toISOString();
      },
      /24 hours/,
    ],
  ];
  for (const [index, [mutate, pattern]] of variants.entries())
    await t.test('recovery denial scenario ' + index, async () => {
      const value = structuredClone(original);
      mutate(value);
      value.receiptSha256 = digest(JSON.stringify(value.receipt));
      const client = fakeDatabase();
      await assert.rejects(installExistingSecurity(client, value), pattern);
      assert.equal(client.queries.length, 0);
    });
  const client = fakeDatabase();
  await assert.rejects(
    installExistingSecurity(client, { ...original, receiptSha256: 'f'.repeat(64) }),
    /reviewed digest/,
  );
  assert.equal(client.queries.length, 0);
});

test('installation requires unchanged schema, refuses existing ledgers and atomically commits only the three executed migrations', async () => {
  const value = await evidence();
  for (const options of [{ schemaDrift: true }, { priorInstallation: true }]) {
    const client = fakeDatabase(options);
    await assert.rejects(installExistingSecurity(client, value), /did not commit/);
    assert.ok(!client.queries.some((q) => q.sql === 'commit' || q.sql === 'reconcile'));
  }
  const client = fakeDatabase();
  const result = await installExistingSecurity(client, value);
  assert.equal(result.persistentMigrationApplied, true);
  assert.equal(result.historicalAdoptionPerformed, false);
  assert.equal(client.queries.filter((q) => q.sql === 'commit').length, 1);
  assert.equal(client.queries.filter((q) => q.sql === 'rollback').length, 3);
  assert.deepEqual(
    client.queries
      .filter((q) => Object.values(plan.sql).slice(0, 3).includes(q.sql))
      .map((q) => q.sql),
    ['reconcile', 'security', 'claim-validation', 'reconcile', 'security', 'claim-validation'],
  );
  const ledger = client.queries.find((q) =>
    q.sql.includes('insert into safebus_release.security_installations'),
  );
  assert.deepEqual(JSON.parse(ledger.params[7]), plan.migrations);
  assert.deepEqual(ledger.params.slice(8), ['23456', '34567']);
  assert.ok(
    !client.queries.some((q) => q.sql.includes('insert into safebus_release.migration_checksums')),
  );
});

test('acceptance failure rolls back; a lost COMMIT response requires inspection and never automatic retry', async () => {
  const value = await evidence();
  const acceptance = "\nselect 'PASS' as result;\n";
  const failed = fakeDatabase({ failure: acceptance });
  await assert.rejects(installExistingSecurity(failed, value), /did not commit/);
  assert.ok(!failed.queries.some((q) => q.sql === 'commit'));
  const ambiguous = fakeDatabase({ failure: 'commit' });
  await assert.rejects(installExistingSecurity(ambiguous, value), (error) => {
    assert.equal(error.commitOutcomeUnknown, true);
    assert.match(safeSecurityFailure(error, 'installation'), /Commit outcome is unknown/);
    assert.ok(!safeSecurityFailure(error, 'installation').includes('secret-provider-detail'));
    return true;
  });
  assert.equal(ambiguous.queries.filter((q) => q.sql === 'commit').length, 1);
  assert.equal(ambiguous.queries.filter((q) => q.sql === 'rollback').length, 3);
});

test('the actual installation event DDL is private and stores no fabricated historical adoption', async () => {
  const client = fakeDatabase();
  await installExistingSecurity(client, await evidence());
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated;');
    await db.exec(
      client.queries.find((q) =>
        q.sql.includes('create table safebus_release.security_installations'),
      ).sql,
    );
    const insert = client.queries.find((q) =>
      q.sql.includes('insert into safebus_release.security_installations'),
    );
    await db.query(insert.sql, insert.params);
    assert.equal(
      (await db.query('select executed_migrations from safebus_release.security_installations'))
        .rows[0].executed_migrations.length,
      3,
    );
    await db.exec('set role authenticated;');
    await assert.rejects(
      db.query('select * from safebus_release.security_installations'),
      (error) => error.code === '42501',
    );
  } finally {
    await db.close();
  }
});

test('encrypted archives roundtrip and corruption fails without overwriting or leaving a partial plaintext file', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'safebus-encryption-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const keys = generateKeyPairSync('rsa', { modulusLength: 3072 });
  const publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const encrypted = path.join(directory, 'database.enc');
  const plaintext = Buffer.from('synthetic-private-auth-record'.repeat(30));
  const envelope = await encryptBackupStream(Readable.from([plaintext]), encrypted, publicKey);
  assert.ok(!(await fs.readFile(encrypted)).includes(plaintext));
  const output = path.join(directory, 'verified.dump');
  await decryptBackupFile(encrypted, output, envelope, privateKey);
  assert.deepEqual(await fs.readFile(output), plaintext);
  await assert.rejects(decryptBackupFile(encrypted, output, envelope, privateKey), /EEXIST/);
  assert.deepEqual(await fs.readFile(output), plaintext);
  const bad = { ...envelope, authTag: Buffer.alloc(16).toString('base64') };
  const partial = path.join(directory, 'partial.dump');
  await assert.rejects(decryptBackupFile(encrypted, partial, bad, privateKey));
  await assert.rejects(fs.stat(partial), /ENOENT/);
});

test('backup tools use read-only verified TLS and keep passwords out of arguments', () => {
  const env = pgBackupEnvironment(target.databaseUrl, '/approved/ca.pem');
  assert.equal(env.PGSSLMODE, 'verify-full');
  assert.match(env.PGOPTIONS, /default_transaction_read_only=on/);
  assert.equal(env.PGPASSWORD, 'synthetic-password');
  assert.equal(env.SAFEBUS_DATABASE_URL, undefined);
  assert.throws(
    () => pgBackupEnvironment(target.databaseUrl.replace(':5432', ':6543'), 'ca'),
    /session-mode/,
  );
  const client = verifiedDatabaseClient(
    target.databaseUrl,
    '-----BEGIN CERTIFICATE-----\nfixture',
    'test',
  );
  assert.equal(client.connectionParameters.ssl.rejectUnauthorized, true);
});

test('streamed backup refuses a failed native export even when stdout produced data', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'safebus-export-'));
  t.after(async () => {
    assert.equal(path.dirname(directory), os.tmpdir());
    await fs.rm(directory, { recursive: true, force: true });
  });
  const keys = generateKeyPairSync('rsa', { modulusLength: 3072 });
  const options = {
    directory,
    name: 'failed',
    publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }),
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
  };
  await assert.rejects(
    captureEncryptedDump(
      process.execPath,
      [
        '-e',
        "process.stdout.write('synthetic-record'.repeat(100));process.stderr.write('sensitive-provider-detail');process.exitCode=1",
      ],
      options,
    ),
    (error) => {
      assert.equal(error.message, 'PostgreSQL export failed.');
      assert.ok(
        !safeSecurityFailure(error, 'encrypted-export').includes('sensitive-provider-detail'),
      );
      return true;
    },
  );
  await assert.rejects(fs.stat(path.join(directory, 'failed.envelope.json')), /ENOENT/);
});

test('offline owner key generation enforces private storage and never prints the key', async (t) => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'safebus-key-owner-'));
  t.after(async () => {
    assert.equal(path.dirname(parent), os.tmpdir());
    await fs.rm(parent, { recursive: true, force: true });
  });
  const directory = path.join(parent, 'keys');
  const output = execFileSync(
    process.execPath,
    ['scripts/security-recovery-tools.mjs', 'keypair', directory],
    { encoding: 'utf8', windowsHide: true },
  );
  assert.ok(!output.includes('PRIVATE KEY'));
  assert.match(
    await fs.readFile(path.join(directory, 'recovery-private.pem'), 'utf8'),
    /BEGIN PRIVATE KEY/,
  );
  assert.match(
    await fs.readFile(path.join(directory, 'recovery-public.pem'), 'utf8'),
    /BEGIN PUBLIC KEY/,
  );
});

test('diagnostics identify missing recovery configuration without copying provider details', () => {
  assert.match(
    safeSecurityFailure(
      new Error('The approved database CA certificate is required.'),
      'preflight',
    ),
    /DATABASE_CA_MISSING/,
  );
  assert.match(
    safeSecurityFailure(
      new Error('A human-verified, off-site backup and full restore receipt is required.'),
      'preflight',
    ),
    /RECOVERY_NOT_VERIFIED/,
  );
  assert.ok(
    !safeSecurityFailure(new Error('postgresql://secret@host'), 'database').includes('secret@host'),
  );
});

test('workflow evidence refuses forks, incorrect workflow, failed runs and unprotected branch provenance', () => {
  const repository = 'Davinder498/SafeBus-GLM';
  const run = {
    id: 12345,
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    path: '.github/workflows/backup-existing-security.yml',
    event: 'workflow_dispatch',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    head_sha: releaseSha,
  };
  const options = { repository, workflow: 'backup-existing-security.yml', runId: '12345' };
  verifyWorkflowRun(run, options);
  for (const change of [
    { conclusion: 'failure' },
    { head_branch: 'feature' },
    { event: 'pull_request' },
    { head_repository: { full_name: 'someone/fork' } },
    { path: '.github/workflows/ci.yml' },
  ])
    assert.throws(() => verifyWorkflowRun({ ...run, ...change }, options), /successful protected/);
});

test('reviewed plan is limited to the exact three migrations; fresh secret-free validation precedes protected jobs', async () => {
  const actual = await readInstallInputs();
  assert.deepEqual(
    actual.migrations.map((m) => m.version),
    ['0123', '0122', '0124'],
  );
  const validation = await fs.readFile('.github/workflows/validate-security-install.yml', 'utf8');
  assert.doesNotMatch(validation, /secrets\.|environment: production/);
  for (const command of ['typecheck', 'lint', 'build', 'test'])
    assert.ok(validation.includes('pnpm ' + command));
  for (const name of ['backup', 'install']) {
    const workflow = await fs.readFile(
      '.github/workflows/' + name + '-existing-security.yml',
      'utf8',
    );
    assert.match(workflow, /needs: validate/);
    assert.match(workflow, /environment: production/);
    assert.match(workflow, /group: production-release/);
    assert.ok(workflow.indexOf('git merge-base --is-ancestor') < workflow.indexOf('pnpm install'));
    assert.doesNotMatch(workflow, /pnpm build|pnpm test|db reset|supabase start|git reset/);
  }
});
