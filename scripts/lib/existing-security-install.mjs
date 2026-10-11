import fs from 'node:fs/promises';
import path from 'node:path';
import {
  APPROVED_PROJECT,
  RECONCILIATION_FILE,
  SECURITY_FILE,
  SESSION_VALIDATION_FILE,
  ACCEPTANCE_FILE,
  acceptanceWithinTransaction,
  digest,
  snapshot,
  runRollbackRehearsal,
} from './existing-security-rehearsal.mjs';
import { createEnvironmentBinding } from './environment-identity.mjs';
import { calculateSchemaFingerprint } from './schema-fingerprint.mjs';
import { buildMigrationManifest, readCommittedManifest } from './migrations.mjs';

export const INSTALL_FILES = [
  RECONCILIATION_FILE,
  SECURITY_FILE,
  SESSION_VALIDATION_FILE,
  ACCEPTANCE_FILE,
];
export const MAX_RECOVERY_AGE_MS = 24 * 60 * 60 * 1000;
export const RELEASE_STATE_SQL = `select
  to_regclass('safebus_release.environment_identity') is not null as identity,
  to_regclass('safebus_release.migration_checksums') is not null as migrations,
  to_regclass('safebus_release.releases') is not null as releases,
  to_regclass('safebus_release.security_installations') is not null as security_installation,
  exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='safebus_release') as release_objects`;

export async function readInstallInputs(root = process.cwd()) {
  const manifest = await readCommittedManifest(root);
  if (JSON.stringify(await buildMigrationManifest(root)) !== JSON.stringify(manifest))
    throw new Error('Migration checksum drift.');
  if (manifest.migrations.at(-1)?.filename !== path.basename(SESSION_VALIDATION_FILE))
    throw new Error('Review this installation again before adding later migrations.');
  const sql = await Promise.all(
    INSTALL_FILES.map((file) => fs.readFile(path.join(root, file), 'utf8')),
  );
  const inputs = INSTALL_FILES.map((file, i) => ({
    file,
    sha256: digest(sql[i].replaceAll('\r\n', '\n')),
  }));
  return {
    inputs,
    sql: {
      reconciliation: sql[0],
      security: sql[1],
      sessionValidation: sql[2],
      acceptance: sql[3],
    },
    migrations: INSTALL_FILES.slice(0, 3).map((file) =>
      manifest.migrations.find((m) => m.filename === path.basename(file)),
    ),
  };
}

export function installBinding({ environment, databaseUrl, supabaseUrl, confirmation }) {
  if (environment !== 'production' || confirmation !== 'INSTALL_EXISTING_SECURITY_0123_0122_0124')
    throw new Error('Explicit production security installation confirmation is required.');
  const binding = createEnvironmentBinding({ environment, databaseUrl, supabaseUrl });
  if (binding.projectRefHash !== digest(APPROVED_PROJECT))
    throw new Error('Unapproved database target.');
  return binding;
}

export function assertRecent(timestamp, now = Date.now()) {
  const age = now - Date.parse(timestamp);
  if (!Number.isFinite(age) || age < -60000 || age > MAX_RECOVERY_AGE_MS)
    throw new Error('Recovery evidence must be no more than 24 hours old.');
}

function reference(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{11,199}$/.test(value);
}
function hash(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

export function verifyRecovery({
  backup,
  catalog,
  receipt,
  receiptSha256,
  binding,
  inputs,
  now = Date.now(),
}) {
  if (!hash(receiptSha256) || digest(JSON.stringify(receipt)) !== receiptSha256)
    throw new Error('Recovery receipt differs from the reviewed digest.');
  if (
    backup?.format !== 1 ||
    backup.mode !== 'encrypted-logical-export' ||
    backup.environment !== 'production' ||
    backup.projectRefHash !== binding.projectRefHash ||
    backup.databaseTarget !== binding.databaseTarget ||
    backup.publicApiOriginHash !== binding.publicApiOriginHash ||
    !/^[0-9a-f]{40}$/.test(backup.releaseSha ?? '') ||
    !/^[1-9][0-9]*$/.test(backup.runId ?? '') ||
    digest(JSON.stringify(catalog)) !== backup.catalogSha256 ||
    JSON.stringify(backup.inputs) !== JSON.stringify(inputs)
  )
    throw new Error('Backup does not match the reviewed project, catalog, and SQL inputs.');
  assertRecent(backup.createdAt, now);
  if (
    !hash(backup.archive?.plaintextSha256) ||
    !hash(backup.roles?.plaintextSha256) ||
    !hash(backup.archive?.ciphertextSha256) ||
    !hash(backup.roles?.ciphertextSha256) ||
    !(backup.archive.plaintextBytes >= 100) ||
    !(backup.roles.plaintextBytes >= 100)
  )
    throw new Error('Backup archive hashes are missing.');
  if (
    receipt?.format !== 1 ||
    receipt.projectRefHash !== binding.projectRefHash ||
    receipt.catalogSha256 !== backup.catalogSha256 ||
    receipt.archiveSha256 !== backup.archive.plaintextSha256 ||
    receipt.rolesSha256 !== backup.roles.plaintextSha256 ||
    receipt.backupRunId !== backup.runId ||
    receipt.backupStoredOffSite !== true ||
    receipt.decryptionVerified !== true ||
    receipt.fullRestoreVerified !== true ||
    receipt.schemaAndDataVerified !== true ||
    receipt.permissionsAndAuthVerified !== true ||
    receipt.destinationIsProduction !== false ||
    receipt.destinationCanadian !== true ||
    !reference(receipt.backupLocationReference) ||
    !reference(receipt.restoreEvidenceReference) ||
    !reference(receipt.verifierReference)
  )
    throw new Error('A human-verified, off-site backup and full restore receipt is required.');
  assertRecent(receipt.verifiedAt, now);
  if (Date.parse(receipt.verifiedAt) < Date.parse(backup.createdAt))
    throw new Error('Restore verification predates this backup.');
  return { receiptSha256, backupRunId: backup.runId, catalogSha256: backup.catalogSha256 };
}

// Include default privileges, which 0123 changes, beyond the older authorization snapshot.
export async function recoverySnapshot(client) {
  const authorization = await snapshot(client);
  const publicFingerprint = await calculateSchemaFingerprint(client);
  const defaults = await client.query(`select pg_get_userbyid(d.defaclrole) as owner,
    coalesce(n.nspname,'') as schema, d.defaclobjtype as type, d.defaclacl::text as acl
    from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
    order by owner,schema,type`);
  return { authorization, publicFingerprint, defaultPrivileges: defaults.rows };
}

async function rejectReleaseState(client) {
  const state = (await client.query(RELEASE_STATE_SQL)).rows[0];
  if (!state || Object.values(state).some((v) => v !== false))
    throw new Error('Release metadata already exists; inspect it before retrying or adopting.');
}

export async function installExistingSecurity(
  client,
  {
    plan,
    binding,
    backup,
    catalog,
    receipt,
    receiptSha256,
    releaseSha,
    installationRunId,
    rehearsalRunId,
    now = Date.now(),
  },
) {
  if (!/^[0-9a-f]{40}$/.test(releaseSha ?? ''))
    throw new Error('Exact reviewed installation SHA is required.');
  if (!/^[1-9][0-9]*$/.test(installationRunId ?? '') || !/^[1-9][0-9]*$/.test(rehearsalRunId ?? ''))
    throw new Error('Installation and rehearsal workflow bindings are required.');
  // No database statement (including BEGIN) until all recovery evidence is checked.
  const recovery = verifyRecovery({
    backup,
    catalog,
    receipt,
    receiptSha256,
    binding,
    inputs: plan.inputs,
    now,
  });
  const acceptance = acceptanceWithinTransaction(plan.sql.acceptance);
  let commitAttempted = false;
  let committed = false;
  const sameCatalog = async () => {
    if (digest(JSON.stringify(await recoverySnapshot(client))) !== backup.catalogSha256)
      throw new Error('Database schema changed after backup; capture and verify a fresh backup.');
  };
  const locked = await client.query(
    "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) as acquired",
  );
  if (locked.rows[0]?.acquired !== true) throw new Error('Another schema operation is running.');
  try {
    await client.query('begin transaction read only');
    try {
      await client.query("set local statement_timeout='30s'");
      await client.query("set local lock_timeout='2s'");
      await rejectReleaseState(client);
      await sameCatalog();
    } finally {
      await client.query('rollback');
    }

    // Re-run the actual reviewed SQL against current state immediately before committing it.
    await runRollbackRehearsal(client, plan.sql);
    await client.query('begin');
    try {
      await client.query("set local lock_timeout='2s'");
      await client.query("set local statement_timeout='30s'");
      await client.query("set local idle_in_transaction_session_timeout='15s'");
      await rejectReleaseState(client);
      await sameCatalog();
      for (const key of ['reconciliation', 'security', 'sessionValidation'])
        await client.query(plan.sql[key]);
      const result = await client.query(acceptance);
      if (
        !(Array.isArray(result) ? result : [result]).some((r) =>
          r.rows?.some((row) => row.result === 'PASS'),
        )
      )
        throw new Error('Installation acceptance did not pass.');
      await client.query(`select set_config('request.jwt.claim','',true),
        set_config('request.jwt.claim.sub','',true), set_config('request.jwt.claim.role','',true),
        set_config('request.jwt.claims','{}',true)`);
      const installedCatalog = await recoverySnapshot(client);
      // Dedicated event ledger: do not claim 0001-0121 were replayed or fully adopted.
      await client.query(`create schema if not exists safebus_release;
        revoke all on schema safebus_release from public, anon, authenticated;
        create table safebus_release.security_installations (
          singleton boolean primary key default true check(singleton),
          environment text not null check(environment='production'),
          project_ref_hash text not null check(project_ref_hash ~ '^[0-9a-f]{64}$'),
          database_target text not null check(database_target ~ '^[0-9a-f]{64}$'),
          release_sha text not null check(release_sha ~ '^[0-9a-f]{40}$'),
          recovery_receipt_sha256 text not null check(recovery_receipt_sha256 ~ '^[0-9a-f]{64}$'),
          source_catalog_sha256 text not null, installed_catalog_sha256 text not null,
          backup_run_id text not null, executed_migrations jsonb not null,
          installation_run_id text not null, rehearsal_run_id text not null,
          installed_at timestamptz not null default clock_timestamp()
        );
        alter table safebus_release.security_installations enable row level security;
        revoke all on table safebus_release.security_installations from public, anon, authenticated;`);
      await client.query(
        `insert into safebus_release.security_installations
        (environment,project_ref_hash,database_target,release_sha,recovery_receipt_sha256,
          source_catalog_sha256,installed_catalog_sha256,backup_run_id,executed_migrations,
          installation_run_id,rehearsal_run_id)
        values ('production',$1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
        [
          binding.projectRefHash,
          binding.databaseTarget,
          releaseSha,
          receiptSha256,
          backup.catalogSha256,
          digest(JSON.stringify(installedCatalog)),
          backup.runId,
          JSON.stringify(plan.migrations),
          installationRunId,
          rehearsalRunId,
        ],
      );
      commitAttempted = true;
      await client.query('commit');
      committed = true;
      return {
        format: 1,
        environment: 'production',
        releaseSha,
        installationRunId,
        rehearsalRunId,
        ...recovery,
        installedCatalogSha256: digest(JSON.stringify(installedCatalog)),
        executedMigrations: plan.migrations,
        persistentMigrationApplied: true,
        historicalAdoptionPerformed: false,
        realApiAcceptance: false,
        installedAt: new Date().toISOString(),
      };
    } catch (error) {
      if (!commitAttempted) await client.query('rollback');
      throw error;
    }
  } catch (cause) {
    const error = new Error(
      commitAttempted && !committed
        ? 'Commit outcome is unknown. Inspect security_installations before any retry.'
        : 'Security installation did not commit.',
    );
    error.code = /^[0-9A-Z]{5}$/.test(cause?.code ?? '') ? cause.code : 'INSTALL_FAILED';
    error.safeReason = cause?.message;
    error.commitOutcomeUnknown = commitAttempted && !committed;
    throw error;
  } finally {
    // Session close is the final lock release even if this query fails.
    await client
      .query("select pg_advisory_unlock(hashtextextended('safebus-schema-deploy',0))")
      .catch(() => {});
  }
}
