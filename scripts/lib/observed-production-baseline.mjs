import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './migrations.mjs';
import { SCHEMA_FINGERPRINT_FORMAT, calculateSchemaFingerprint } from './schema-fingerprint.mjs';
import { recoverySnapshot, verifyRecovery, assertRecent } from './existing-security-install.mjs';
import { registerEnvironmentIdentity, assertEnvironmentIdentity } from './environment-identity.mjs';
import {
  validateCatalogReconciliation,
  assertObservedCatalog,
  inspectReconciledPartitions,
} from './observed-catalog-reconciliation.mjs';

export const OBSERVED_CONTRACT_PATH = 'config/production-observed-baseline.json';
const executionFields = ['filename', 'version', 'bytes', 'sha256'];
const sameMigration = (a, b) => executionFields.every((key) => a?.[key] === b?.[key]);
export const contractDigest = (contract) => sha256(JSON.stringify(contract));

export async function readObservedContract(root = process.cwd()) {
  return JSON.parse(await fs.readFile(path.join(root, OBSERVED_CONTRACT_PATH), 'utf8'));
}

export function validateObservedContract(contract, manifest, binding) {
  if (
    !Array.isArray(contract?.providerDdlHooks) ||
    contract.providerDdlHooks.some(
      (hook) =>
        typeof hook.evtname !== 'string' || !/^[0-9a-f]{32}$/.test(hook.definition_md5 ?? ''),
    )
  )
    throw new Error('Reviewed provider DDL hooks are required.');
  if (
    contract?.format !== 1 ||
    contract.kind !== 'observed-schema-only' ||
    contract.reviewDecision !== 'accept-observed-state-with-unverified-historical-execution' ||
    contract.historicalExecutionClaimed !== false ||
    contract.historicalEffectEquivalenceClaimed !== false ||
    contract.historicalReplayAuthorized !== false ||
    contract.environment !== 'production' ||
    contract.schemaFingerprintFormat !== SCHEMA_FINGERPRINT_FORMAT ||
    !/^[a-z0-9-]{12,100}$/.test(contract.id ?? '') ||
    !/^[0-9a-f]{40}$/.test(contract.observedFromReleaseSha ?? '') ||
    ![
      contract.schemaFingerprint,
      contract.sourceCatalogSha256,
      contract.immutableLegacyBaselineSha256,
    ].every((value) => /^[0-9a-f]{64}$/.test(value ?? ''))
  )
    throw new Error('Invalid observed-schema contract; historical execution cannot be inferred.');
  if (
    ['environment', 'projectRefHash', 'databaseTarget', 'publicApiOriginHash'].some(
      (key) => contract[key] !== binding[key],
    )
  )
    throw new Error('Observed contract targets a different database or API.');
  if (
    contract.migrationManifestSha256 !== sha256(JSON.stringify(manifest.migrations)) ||
    contract.dispositions?.length !== manifest.migrations.length
  )
    throw new Error('Observed contract does not cover this exact immutable manifest.');
  const event = contract.sourceSecurityInstallation;
  if (
    !event ||
    event.environment !== 'production' ||
    !/^[0-9a-f]{64}$/.test(event.installedCatalogSha256 ?? '') ||
    !/^[1-9][0-9]*$/.test(event.installationRunId ?? '') ||
    !Number.isFinite(Date.parse(event.installedAt)) ||
    !/^[0-9a-f]{40}$/.test(event.releaseSha ?? '') ||
    event.executedMigrations?.length !== 3
  )
    throw new Error('Verified security installation provenance is missing.');
  validateCatalogReconciliation(contract);
  const expectedOrder = [
    '0123_existing_project_security_reconciliation.sql',
    '0122_commercial_authorization_boundaries.sql',
    '0124_session_claim_validation.sql',
  ];
  if (event.executedMigrations.some((m, i) => m.filename !== expectedOrder[i]))
    throw new Error('Unexpected security execution order.');
  const executed = new Map(event.executedMigrations.map((m) => [m.filename, m]));
  for (let i = 0; i < manifest.migrations.length; i++) {
    const migration = manifest.migrations[i],
      disposition = contract.dispositions[i];
    if (
      !sameMigration(disposition, migration) ||
      disposition.effectEquivalenceClaimed !== false ||
      typeof disposition.evidenceReference !== 'string' ||
      disposition.evidenceReference.length < 12 ||
      disposition.disposition !==
        (executed.has(migration.filename)
          ? 'executed_security_installation'
          : 'historical_input_not_replayed') ||
      (executed.has(migration.filename) &&
        !sameMigration(migration, executed.get(migration.filename)))
    )
      throw new Error('Missing, reordered, changed or unsupported migration disposition.');
  }
  if ([...executed.keys()].some((name) => !manifest.migrations.some((m) => m.filename === name)))
    throw new Error('Recorded execution is absent from the manifest.');
  return {
    contractSha256: contractDigest(contract),
    executed: event.executedMigrations,
    historical: contract.dispositions.filter(
      (m) => m.disposition === 'historical_input_not_replayed',
    ),
  };
}

export async function verifyLegacyBaseline(root, contract) {
  const content = await fs.readFile(
    path.join(root, 'config/production-adoption-baseline.json'),
    'utf8',
  );
  if (sha256(content.replaceAll('\r\n', '\n')) !== contract.immutableLegacyBaselineSha256)
    throw new Error('The legacy 0088 baseline must remain immutable.');
}

export async function inspectSecurityInstallation(client, contract) {
  const hooks = await client.query(`select e.evtname,e.evtevent,e.evtenabled,
    pg_get_userbyid(e.evtowner) as event_owner,e.evttags::text as tags,n.nspname as function_schema,
    p.proname,pg_get_userbyid(p.proowner) as function_owner,
    md5(pg_get_functiondef(p.oid)) as definition_md5 from pg_event_trigger e
    join pg_proc p on p.oid=e.evtfoid join pg_namespace n on n.oid=p.pronamespace order by e.evtname`);
  if (JSON.stringify(hooks.rows) !== JSON.stringify(contract.providerDdlHooks))
    throw new Error('Provider DDL hooks changed after review.');
  const privacy = await client.query(`select c.relrowsecurity,
    has_schema_privilege('anon','safebus_release','USAGE') as anon_schema,
    has_schema_privilege('authenticated','safebus_release','USAGE') as authenticated_schema,
    has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as anon_table,
    has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as authenticated_table
    from pg_class c where c.oid='safebus_release.security_installations'::regclass`);
  const privateLedger = privacy.rows[0];
  if (
    !privateLedger?.relrowsecurity ||
    ['anon_schema', 'authenticated_schema', 'anon_table', 'authenticated_table'].some(
      (key) => privateLedger[key] !== false,
    )
  )
    throw new Error('Security installation ledger must remain private and RLS protected.');
  const result = await client.query(
    `select environment,release_sha,backup_run_id,installation_run_id,
    rehearsal_run_id,recovery_receipt_sha256,source_catalog_sha256,installed_catalog_sha256,
    executed_migrations,installed_at::text as installed_at,
    installed_at=$1::timestamptz as timestamp_matches
    from safebus_release.security_installations order by installed_at`,
    [contract.sourceSecurityInstallation.installedAt],
  );
  if (result.rows.length !== 1)
    throw new Error('Expected exactly one verified security installation.');
  const row = result.rows[0],
    expected = contract.sourceSecurityInstallation;
  for (const [sql, key] of Object.entries({
    environment: 'environment',
    release_sha: 'releaseSha',
    backup_run_id: 'backupRunId',
    installation_run_id: 'installationRunId',
    rehearsal_run_id: 'rehearsalRunId',
    recovery_receipt_sha256: 'recoveryReceiptSha256',
    source_catalog_sha256: 'sourceCatalogSha256',
    installed_catalog_sha256: 'installedCatalogSha256',
  }))
    if (row[sql] !== expected[key])
      throw new Error('Security installation ledger differs from reviewed provenance.');
  if (
    row.timestamp_matches !== true ||
    row.executed_migrations?.length !== expected.executedMigrations.length ||
    row.executed_migrations.some((m, i) => !sameMigration(m, expected.executedMigrations[i]))
  )
    throw new Error('Security execution checksums or timestamp differ.');
  return row;
}

export async function assertObservedSource(client, contract) {
  const objects =
    await client.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='safebus_release' and c.relkind in ('r','p','v','m','S','f') order by c.relname`);
  const routines =
    await client.query(`select count(*)::integer as count from pg_proc p join pg_namespace n
    on n.oid=p.pronamespace where n.nspname='safebus_release'`);
  if (
    JSON.stringify(objects.rows.map((r) => r.relname)) !==
      JSON.stringify(['security_installations']) ||
    routines.rows[0]?.count !== 0
  )
    throw new Error('Unexpected release metadata; inspect before adopting.');
  await inspectSecurityInstallation(client, contract);
  const snapshot = await recoverySnapshot(client);
  assertObservedCatalog(snapshot, contract);
  await inspectReconciledPartitions(client, contract);
  return snapshot;
}

// The only rows called "applied" are copied from the real execution event.
// Historical files are frozen review inputs, never migration execution records.
async function writeObservedMetadata(client, { contract, binding, releaseSha, runId }) {
  await registerEnvironmentIdentity(client, binding, releaseSha);
  await client.query(`create table safebus_release.migration_checksums (
    filename text primary key,version text not null,checksum text not null check(checksum ~ '^[0-9a-f]{64}$'),
    bytes bigint not null check(bytes>0),release_sha text not null,
    applied_at timestamptz not null);
    create table safebus_release.releases (
      release_sha text primary key,environment text not null check(environment='production'),
      schema_fingerprint text check(schema_fingerprint ~ '^[0-9a-f]{64}$'),
      status text not null check(status in ('deploying','deployed','failed')),
      deployed_at timestamptz not null default clock_timestamp());
    create table safebus_release.observed_baselines (
      singleton boolean primary key default true check(singleton),
      contract_sha256 text not null,manifest_sha256 text not null,
      source_catalog_sha256 text not null,schema_fingerprint text not null,
      schema_fingerprint_format integer not null check(schema_fingerprint_format=2),
      historical_execution_claimed boolean not null check(not historical_execution_claimed),
      registration_release_sha text not null,registration_run_id text not null,
      recorded_at timestamptz not null default clock_timestamp());
    create table safebus_release.migration_dispositions (
      filename text primary key,version text not null,checksum text not null,bytes bigint not null,
      disposition text not null check(disposition in ('historical_input_not_replayed','executed_security_installation')),
      evidence_reference text not null,effect_equivalence_claimed boolean not null check(not effect_equivalence_claimed));
    alter table safebus_release.environment_identity enable row level security;
    alter table safebus_release.migration_checksums enable row level security;
    alter table safebus_release.releases enable row level security;
    alter table safebus_release.observed_baselines enable row level security;
    alter table safebus_release.migration_dispositions enable row level security;
    revoke all on schema safebus_release from public,anon,authenticated;
    revoke all on all tables in schema safebus_release from public,anon,authenticated;`);
  for (const migration of contract.sourceSecurityInstallation.executedMigrations)
    await client.query(
      `insert into safebus_release.migration_checksums
      (filename,version,checksum,bytes,release_sha,applied_at) values($1,$2,$3,$4,$5,$6)`,
      [
        migration.filename,
        migration.version,
        migration.sha256,
        migration.bytes,
        contract.sourceSecurityInstallation.releaseSha,
        contract.sourceSecurityInstallation.installedAt,
      ],
    );
  await client.query(
    `insert into safebus_release.migration_dispositions
    select filename,version,sha256,bytes,disposition,"evidenceReference","effectEquivalenceClaimed"
    from jsonb_to_recordset($1::jsonb) as x(filename text,version text,sha256 text,bytes bigint,
      disposition text,"evidenceReference" text,"effectEquivalenceClaimed" boolean)`,
    [JSON.stringify(contract.dispositions)],
  );
  await client.query(
    `insert into safebus_release.observed_baselines
    (contract_sha256,manifest_sha256,source_catalog_sha256,schema_fingerprint,schema_fingerprint_format,
      historical_execution_claimed,registration_release_sha,registration_run_id)
    values($1,$2,$3,$4,2,false,$5,$6)`,
    [
      contractDigest(contract),
      contract.migrationManifestSha256,
      contract.sourceCatalogSha256,
      contract.schemaFingerprint,
      releaseSha,
      runId,
    ],
  );
}

export async function inspectObservedBaseline(client, manifest, binding, contract = undefined) {
  contract ??= await readObservedContract();
  const checked = validateObservedContract(contract, manifest, binding);
  await assertEnvironmentIdentity(client, binding);
  const objectNames =
    await client.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='safebus_release' and c.relkind in ('r','p','v','m','S','f') order by c.relname`);
  if (
    JSON.stringify(objectNames.rows.map((row) => row.relname)) !==
    JSON.stringify([
      'environment_identity',
      'migration_checksums',
      'migration_dispositions',
      'observed_baselines',
      'releases',
      'security_installations',
    ])
  )
    throw new Error('Observed release metadata inventory differs.');
  const schemaIsolation =
    await client.query(`select has_schema_privilege('anon','safebus_release','USAGE') as anon,
    has_schema_privilege('authenticated','safebus_release','USAGE') as authenticated`);
  if (schemaIsolation.rows[0]?.anon !== false || schemaIsolation.rows[0]?.authenticated !== false)
    throw new Error('Release metadata schema must remain private.');
  const baselines = await client.query('select * from safebus_release.observed_baselines');
  const baseline = baselines.rows[0];
  if (
    baselines.rows.length !== 1 ||
    baseline.contract_sha256 !== checked.contractSha256 ||
    baseline.manifest_sha256 !== contract.migrationManifestSha256 ||
    baseline.source_catalog_sha256 !== contract.sourceCatalogSha256 ||
    baseline.schema_fingerprint !== contract.schemaFingerprint ||
    baseline.schema_fingerprint_format !== 2 ||
    baseline.historical_execution_claimed !== false ||
    !/^[0-9a-f]{40}$/.test(baseline.registration_release_sha ?? '') ||
    !/^[1-9][0-9]*$/.test(baseline.registration_run_id ?? '')
  )
    throw new Error('Observed baseline differs from its reviewed contract.');
  await inspectSecurityInstallation(client, contract);
  const dispositions =
    await client.query(`select filename,version,checksum,bytes,disposition,evidence_reference,
    effect_equivalence_claimed from safebus_release.migration_dispositions order by filename`);
  const actual = new Map(dispositions.rows.map((m) => [m.filename, m]));
  if (actual.size !== contract.dispositions.length || dispositions.rows.length !== actual.size)
    throw new Error('Historical disposition inventory is incomplete.');
  for (const item of contract.dispositions) {
    const row = actual.get(item.filename);
    if (
      !row ||
      row.version !== item.version ||
      row.checksum !== item.sha256 ||
      Number(row.bytes) !== item.bytes ||
      row.disposition !== item.disposition ||
      row.evidence_reference !== item.evidenceReference ||
      row.effect_equivalence_claimed !== false
    )
      throw new Error('Historical disposition drift detected.');
  }
  const checksums = await client.query(
    `select filename,version,checksum,bytes,release_sha,applied_at::text as applied_at,
    applied_at=$1::timestamptz as timestamp_matches
    from safebus_release.migration_checksums order by filename`,
    [contract.sourceSecurityInstallation.installedAt],
  );
  if (checksums.rows.length !== checked.executed.length)
    throw new Error('Unsupported historical execution records.');
  for (const row of checksums.rows) {
    const expected = checked.executed.find((m) => m.filename === row.filename);
    if (
      !expected ||
      row.version !== expected.version ||
      row.checksum !== expected.sha256 ||
      Number(row.bytes) !== expected.bytes ||
      row.release_sha !== contract.sourceSecurityInstallation.releaseSha ||
      row.timestamp_matches !== true
    )
      throw new Error('Execution ledger differs from verified security provenance.');
  }
  const isolation =
    await client.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='safebus_release' and c.relkind in ('r','p') and
      (not c.relrowsecurity or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))`);
  if (isolation.rows.length) throw new Error('Release metadata is not private and RLS protected.');
  const releases = await client.query(`select schema_fingerprint from safebus_release.releases
    where status='deployed' order by deployed_at desc limit 1`);
  const expectedFingerprint = releases.rows[0]?.schema_fingerprint ?? contract.schemaFingerprint;
  if ((await calculateSchemaFingerprint(client)) !== expectedFingerprint)
    throw new Error('Out-of-band schema or authorization drift from observed baseline.');
  return {
    initialized: true,
    provenance: 'observed-schema-only',
    applied: new Map(checksums.rows.map((m) => [m.filename, m.checksum])),
    inherited: new Map(checked.historical.map((m) => [m.filename, m.sha256])),
    pending: [],
    schemaFingerprint: expectedFingerprint,
    contractSha256: checked.contractSha256,
  };
}

export function verifyAdoptionRecovery({
  contract,
  backup,
  catalog,
  receipt,
  receiptSha256,
  binding,
  inputs,
  rehearsal,
  programSha256,
  now,
}) {
  verifyRecovery({ backup, catalog, receipt, receiptSha256, binding, inputs, now });
  if (
    backup.catalogSha256 !== contract.sourceCatalogSha256 ||
    catalog.publicFingerprint !== contract.schemaFingerprint
  )
    throw new Error(
      'Adoption requires a restored backup of the installed source, not the older pre-security backup.',
    );
  assertObservedCatalog(catalog, contract);
  assertRecent(rehearsal?.createdAt, now);
  if (
    rehearsal?.mode !== 'observed-baseline-rehearsal' ||
    rehearsal.catalogRestored !== true ||
    rehearsal.persistentMetadataApplied !== false ||
    rehearsal.contractSha256 !== contractDigest(contract) ||
    rehearsal.programSha256 !== programSha256 ||
    rehearsal.sourceCatalogSha256 !== contract.sourceCatalogSha256
  )
    throw new Error('A fresh matching protected observed-baseline rehearsal is required.');
}

export async function registerObservedBaseline(
  client,
  { contract, manifest, binding, releaseSha, runId, mode, recovery, programSha256 },
) {
  validateObservedContract(contract, manifest, binding);
  if (
    !['rehearse', 'adopt'].includes(mode) ||
    !/^[0-9a-f]{40}$/.test(releaseSha ?? '') ||
    !/^[1-9][0-9]*$/.test(runId ?? '')
  )
    throw new Error('Explicit reviewed observed-baseline mode and workflow binding are required.');
  if (mode === 'adopt') verifyAdoptionRecovery({ ...recovery, contract, binding, programSha256 });
  if (mode === 'adopt')
    await registerObservedBaseline(client, {
      contract,
      manifest,
      binding,
      releaseSha,
      runId,
      mode: 'rehearse',
      programSha256,
    });
  let attemptedCommit = false;
  await client.query('begin');
  try {
    await client.query("set local lock_timeout='2s'");
    await client.query("set local statement_timeout='30s'");
    await client.query("set local idle_in_transaction_session_timeout='15s'");
    const lock = await client.query(
      "select pg_try_advisory_xact_lock(hashtextextended('safebus-schema-deploy',0)) as acquired",
    );
    if (!lock.rows[0]?.acquired) throw new Error('Another schema operation is running.');
    await assertObservedSource(client, contract);
    await writeObservedMetadata(client, { contract, binding, releaseSha, runId });
    await inspectObservedBaseline(client, manifest, binding, contract);
    attemptedCommit = mode === 'adopt';
    await client.query(mode === 'adopt' ? 'commit' : 'rollback');
  } catch (error) {
    if (!attemptedCommit) await client.query('rollback');
    if (attemptedCommit)
      throw new Error(
        'Observed baseline commit outcome unknown; inspect metadata before any retry.',
      );
    throw error;
  }
  await client.query('begin transaction read only');
  try {
    await client.query("set local statement_timeout='15s'");
    await client.query("set local lock_timeout='2s'");
    if (mode === 'rehearse') await assertObservedSource(client, contract);
    else await inspectObservedBaseline(client, manifest, binding, contract);
  } catch (error) {
    if (mode === 'adopt') {
      const failure = new Error(
        'Observed baseline committed; post-commit verification failed. Inspect before retrying.',
      );
      failure.metadataCommitted = true;
      throw failure;
    }
    throw error;
  } finally {
    await client.query('rollback');
  }
  return {
    format: 1,
    mode: mode === 'rehearse' ? 'observed-baseline-rehearsal' : 'observed-baseline-registration',
    releaseSha,
    runId,
    contractSha256: contractDigest(contract),
    programSha256,
    sourceCatalogSha256: contract.sourceCatalogSha256,
    schemaFingerprint: contract.schemaFingerprint,
    catalogRestored: mode === 'rehearse',
    persistentMetadataApplied: mode === 'adopt',
    historicalExecutionsClaimed: false,
    createdAt: new Date().toISOString(),
  };
}
