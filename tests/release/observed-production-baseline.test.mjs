import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { createEnvironmentBinding } from '../../scripts/lib/environment-identity.mjs';
import { sha256, readCommittedManifest } from '../../scripts/lib/migrations.mjs';
import { recoverySnapshot } from '../../scripts/lib/existing-security-install.mjs';
import { assertBackupReleaseState } from '../../scripts/lib/backup-release-state.mjs';
import { inspectSchemaDeployment } from '../../scripts/lib/schema-deployment-preflight.mjs';
import {
  validateObservedContract,
  contractDigest,
  registerObservedBaseline,
  inspectObservedBaseline,
  readObservedContract,
  verifyLegacyBaseline,
  verifyAdoptionRecovery,
  assertObservedSource,
} from '../../scripts/lib/observed-production-baseline.mjs';

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;create role authenticator;
    create table public.fixture_rows(id integer primary key);alter table public.fixture_rows enable row level security;
    create schema safebus_release;
    create table safebus_release.security_installations(
      environment text,release_sha text,backup_run_id text,installation_run_id text,rehearsal_run_id text,
      recovery_receipt_sha256 text,source_catalog_sha256 text,installed_catalog_sha256 text,
      executed_migrations jsonb,installed_at timestamptz);
    alter table safebus_release.security_installations enable row level security;`);
  const client = {
    async query(sql, args) {
      const result = args ? await db.query(sql, args) : (await db.exec(sql)).at(-1);
      return { ...result, rows: result?.rows ?? [], rowCount: result?.rows?.length ?? 0 };
    },
  };
  const binding = createEnvironmentBinding({
    environment: 'production',
    databaseUrl:
      'postgresql://postgres:synthetic@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
    supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
  });
  const migrations = [
    '0001_fixture.sql',
    '0122_commercial_authorization_boundaries.sql',
    '0123_existing_project_security_reconciliation.sql',
    '0124_session_claim_validation.sql',
  ].map((filename) => ({
    filename,
    version: filename.slice(0, 4),
    bytes: 123,
    sha256: sha256(filename),
  }));
  const manifest = { migrations };
  const catalog = await recoverySnapshot(client);
  const installedAt = new Date().toISOString();
  const event = {
    environment: 'production',
    releaseSha: 'a'.repeat(40),
    backupRunId: '100',
    installationRunId: '200',
    rehearsalRunId: '300',
    recoveryReceiptSha256: 'b'.repeat(64),
    sourceCatalogSha256: 'c'.repeat(64),
    installedCatalogSha256: sha256(JSON.stringify(catalog)),
    executedMigrations: [migrations[2], migrations[1], migrations[3]],
    installedAt,
  };
  await db.query(
    `insert into safebus_release.security_installations values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      event.environment,
      event.releaseSha,
      event.backupRunId,
      event.installationRunId,
      event.rehearsalRunId,
      event.recoveryReceiptSha256,
      event.sourceCatalogSha256,
      event.installedCatalogSha256,
      JSON.stringify(event.executedMigrations),
      installedAt,
    ],
  );
  const contract = {
    format: 1,
    kind: 'observed-schema-only',
    id: 'fixture-observed-baseline',
    reviewDecision: 'accept-observed-state-with-unverified-historical-execution',
    historicalExecutionClaimed: false,
    historicalEffectEquivalenceClaimed: false,
    historicalReplayAuthorized: false,
    providerDdlHooks: [],
    ...binding,
    observedFromReleaseSha: 'd'.repeat(40),
    schemaFingerprintFormat: 2,
    schemaFingerprint: catalog.publicFingerprint,
    sourceCatalogSha256: event.installedCatalogSha256,
    sourceSecurityInstallation: event,
    immutableLegacyBaselineSha256: 'e'.repeat(64),
    migrationManifestSha256: sha256(JSON.stringify(migrations)),
    dispositions: migrations.map((m) => ({
      ...m,
      disposition:
        m.filename === '0001_fixture.sql'
          ? 'historical_input_not_replayed'
          : 'executed_security_installation',
      evidenceReference: 'fixture-reviewed-evidence',
      effectEquivalenceClaimed: false,
    })),
  };
  const releaseSha = 'f'.repeat(40),
    runId = '400',
    programSha256 = 'a'.repeat(64);
  const args = { client, contract, manifest, binding, releaseSha, runId, programSha256 };
  const rehearsal = {
    mode: 'observed-baseline-rehearsal',
    catalogRestored: true,
    persistentMetadataApplied: false,
    contractSha256: contractDigest(contract),
    programSha256,
    sourceCatalogSha256: contract.sourceCatalogSha256,
    createdAt: installedAt,
  };
  const backup = {
    format: 1,
    mode: 'encrypted-logical-export',
    ...binding,
    releaseSha,
    runId: '500',
    createdAt: installedAt,
    inputs: [],
    catalogSha256: sha256(JSON.stringify(catalog)),
    archive: {
      plaintextSha256: '1'.repeat(64),
      ciphertextSha256: '2'.repeat(64),
      plaintextBytes: 123,
    },
    roles: {
      plaintextSha256: '3'.repeat(64),
      ciphertextSha256: '4'.repeat(64),
      plaintextBytes: 123,
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
    backupLocationReference: 'synthetic-offsite-fixture',
    restoreEvidenceReference: 'synthetic-restore-fixture',
    verifierReference: 'synthetic-verifier-fixture',
    verifiedAt: installedAt,
  };
  const recovery = {
    backup,
    catalog,
    receipt,
    receiptSha256: sha256(JSON.stringify(receipt)),
    inputs: [],
    rehearsal,
  };
  return { db, client, args, recovery };
}

test('reviewed manifest has 122 frozen historical inputs and only three real executions', async () => {
  const contract = await readObservedContract(),
    manifest = await readCommittedManifest();
  const result = validateObservedContract(contract, manifest, contract);
  assert.equal(result.historical.length, 122);
  assert.equal(result.executed.length, 3);
  await verifyLegacyBaseline(process.cwd(), contract);
  for (const mutation of [
    (c) => {
      c.historicalExecutionClaimed = true;
    },
    (c) => {
      c.historicalReplayAuthorized = true;
    },
    (c) => {
      c.dispositions.pop();
    },
    (c) => {
      c.dispositions[0].sha256 = '0'.repeat(64);
    },
    (c) => {
      c.dispositions[0].disposition = 'executed_security_installation';
    },
    (c) => {
      c.sourceSecurityInstallation.executedMigrations.reverse();
    },
  ]) {
    const changed = structuredClone(contract);
    mutation(changed);
    assert.throws(() => validateObservedContract(changed, manifest, contract));
  }
});

test('actual PostgreSQL metadata rehearsal rolls back without touching the application', async (t) => {
  const { db, client, args } = await fixture(t);
  const evidence = await registerObservedBaseline(client, { ...args, mode: 'rehearse' });
  assert.equal(evidence.catalogRestored, true);
  assert.equal(evidence.persistentMetadataApplied, false);
  assert.equal(
    (await db.query("select to_regclass('safebus_release.observed_baselines') as name")).rows[0]
      .name,
    null,
  );
  assert.equal(
    (await db.query('select count(*)::integer as count from public.fixture_rows')).rows[0].count,
    0,
  );
});

test('adoption records only real executions and rejects history, grant, and schema tampering', async (t) => {
  const { db, client, args, recovery } = await fixture(t);
  await registerObservedBaseline(client, { ...args, mode: 'adopt', recovery });
  const inspected = await inspectObservedBaseline(
    client,
    args.manifest,
    args.binding,
    args.contract,
  );
  assert.equal(inspected.applied.size, 3);
  assert.equal(inspected.inherited.size, 1);
  assert.equal(inspected.pending.length, 0);
  const preflight = await inspectSchemaDeployment(client, args.manifest, args.binding, {
    observedContract: args.contract,
  });
  assert.equal(preflight.applied.size, 3);
  assert.equal(preflight.inherited.size, 1);
  assert.equal(preflight.pending.length, 0);
  assert.equal(
    (await db.query('select count(*)::integer as count from safebus_release.releases')).rows[0]
      .count,
    0,
  );
  assert.equal(
    (
      await db.query(
        'select count(distinct applied_at)::integer as count from safebus_release.migration_checksums',
      )
    ).rows[0].count,
    1,
  );
  for (const sql of [
    `insert into safebus_release.migration_checksums values('0001_fixture.sql','0001','${'0'.repeat(64)}',123,'${'f'.repeat(40)}',now())`,
    `update safebus_release.migration_dispositions set disposition='executed_security_installation' where filename='0001_fixture.sql'`,
    'grant select on safebus_release.observed_baselines to anon',
    'grant truncate on safebus_release.observed_baselines to authenticated',
    "update safebus_release.environment_identity set database_target=repeat('0',64)",
    "update safebus_release.migration_checksums set applied_at=applied_at+interval '1 microsecond'",
    "update safebus_release.security_installations set installed_at=installed_at+interval '1 microsecond'",
    'alter table public.fixture_rows add column unexpected text',
  ]) {
    await db.exec('begin');
    try {
      await db.exec(sql);
      await assert.rejects(
        inspectObservedBaseline(client, args.manifest, args.binding, args.contract),
      );
    } finally {
      await db.exec('rollback');
    }
  }
  await assert.rejects(
    registerObservedBaseline(client, { ...args, mode: 'adopt', recovery }),
    /Unexpected release metadata/,
  );
});

test('old backups, missing human proof and changed rehearsals fail before database access', async (t) => {
  const { args, recovery } = await fixture(t);
  const verify = (value) =>
    verifyAdoptionRecovery({
      ...value,
      contract: args.contract,
      binding: args.binding,
      programSha256: args.programSha256,
    });
  verify(recovery);
  for (const mutate of [
    (r) => {
      r.receipt.fullRestoreVerified = false;
    },
    (r) => {
      r.rehearsal.catalogRestored = false;
    },
    (r) => {
      r.rehearsal.programSha256 = '9'.repeat(64);
    },
    (r) => {
      r.backup.createdAt = '2020-01-01T00:00:00Z';
    },
  ]) {
    const changed = structuredClone(recovery);
    mutate(changed);
    assert.throws(() => verify(changed));
  }
  const old = structuredClone(recovery);
  old.catalog = { ...old.catalog, publicFingerprint: '0'.repeat(64) };
  old.backup.catalogSha256 = sha256(JSON.stringify(old.catalog));
  old.receipt.catalogSha256 = old.backup.catalogSha256;
  old.receiptSha256 = sha256(JSON.stringify(old.receipt));
  assert.throws(() => verify(old), /older pre-security backup/);
  let connected = false;
  const client = {
    async query() {
      connected = true;
      throw new Error('Unexpected database statement');
    },
  };
  await assert.rejects(
    registerObservedBaseline(client, { ...args, client, mode: 'adopt', recovery: undefined }),
  );
  assert.equal(connected, false);
});

test('source drift and an unprotected security ledger stop metadata writes', async (t) => {
  const { db, client, args } = await fixture(t);
  await assert.rejects(
    assertObservedSource(client, {
      ...args.contract,
      providerDdlHooks: [{ evtname: 'unreviewed-hook', definition_md5: '0'.repeat(32) }],
    }),
    /DDL hooks changed/,
  );
  await db.exec('begin');
  try {
    await db.exec('alter table public.fixture_rows add column changed boolean');
    await assert.rejects(assertObservedSource(client, args.contract), /changed/);
  } finally {
    await db.exec('rollback');
  }
  await db.exec('alter table safebus_release.security_installations disable row level security');
  await assert.rejects(assertObservedSource(client, args.contract), /RLS protected/);
});

test('post-security export accepts only the exact reviewed source and stops after adoption', async (t) => {
  const { db, client, args, recovery } = await fixture(t);
  assert.equal(
    (await assertBackupReleaseState(client, args.contract)).publicFingerprint,
    args.contract.schemaFingerprint,
  );
  await db.exec('begin');
  try {
    await db.exec('create table safebus_release.unreviewed(id integer)');
    await assert.rejects(
      assertBackupReleaseState(client, args.contract),
      /Unexpected release metadata/,
    );
  } finally {
    await db.exec('rollback');
  }
  await registerObservedBaseline(client, { ...args, mode: 'adopt', recovery });
  await assert.rejects(assertBackupReleaseState(client, args.contract), /unadopted/);
});

test('protected registration retains canonical types, recovery, and human environment gates', async () => {
  const workflow = await fs.readFile('.github/workflows/adopt-observed-production.yml', 'utf8');
  for (const gate of [
    'environment: production',
    'validate-security-install.yml',
    'pnpm types:check',
    'recovery_receipt_sha256',
    'backup_run_id',
    'rehearsal_run_id',
  ])
    assert.ok(workflow.includes(gate));
  const legacy = await fs.readFile('scripts/adopt-existing-production.mjs', 'utf8');
  assert.ok(
    legacy.indexOf('Historical production adoption is blocked') <
      legacy.indexOf('await client.connect()'),
  );
});
