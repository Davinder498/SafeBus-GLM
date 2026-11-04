#!/usr/bin/env node
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import {
  assertReviewedCheckout,
  verifiedDatabaseClient,
} from './lib/security-workflow-evidence.mjs';
import {
  createEnvironmentBinding,
  assertEnvironmentIdentity,
} from './lib/environment-identity.mjs';
import { encryptBackupStream, fileDigest } from './lib/security-backup.mjs';
import {
  digest,
  snapshotDefaults,
  verifyDefaults,
  rehearseDefaults,
  readOnly,
} from './lib/default-privilege-rollout.mjs';

let client;
let stage = 'preflight';
let commitAttempted = false;
try {
  const mode = process.argv[2];
  const releaseSha = process.env.SAFEBUS_RELEASE_SHA;
  const runId = process.env.GITHUB_RUN_ID;
  assertReviewedCheckout(releaseSha);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_DEPLOY_ENV !== 'production' ||
    !['prepare', 'install', 'verify'].includes(mode) ||
    !/^[1-9][0-9]*$/.test(runId ?? '') ||
    !['REHEARSE_APPLICATION_DEFAULTS', 'INSTALL_APPLICATION_DEFAULTS'].includes(
      process.env.SAFEBUS_DEFAULT_PRIVILEGE_CONFIRM,
    )
  )
    throw new Error('DEFAULT_PRIVILEGE_PROTECTED_CONTEXT');
  const config = JSON.parse(
    await fs.readFile('config/pending/application-default-privileges.json', 'utf8'),
  );
  const binding = createEnvironmentBinding({
    environment: 'production',
    databaseUrl: process.env.SAFEBUS_DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
  });
  if (
    config.projectId !== 'ckrkfylsyihwouvesypm' ||
    binding.projectRefHash !== digest(config.projectId)
  )
    throw new Error('DEFAULT_PRIVILEGE_TARGET');
  const defaultsSql = (await fs.readFile(config.migration, 'utf8')).replaceAll('\r', '');
  const guardSql = (await fs.readFile(config.guardMigration, 'utf8')).replaceAll('\r', '');
  const forward = defaultsSql + '\n' + guardSql;
  const restore = (await fs.readFile(config.restoreFile, 'utf8')).replaceAll('\r', '');
  if (
    digest(defaultsSql) !== config.migrationSha256 ||
    digest(guardSql) !== config.guardMigrationSha256 ||
    digest(forward) !== config.forwardSha256 ||
    digest(restore) !== config.restoreSha256
  )
    throw new Error('DEFAULT_PRIVILEGE_SQL_DIGEST');
  client = verifiedDatabaseClient(
    process.env.SAFEBUS_DATABASE_URL,
    process.env.SAFEBUS_DATABASE_CA_CERT,
    'safebus-application-defaults',
  );
  await client.connect();
  if (
    !(
      await client.query(
        "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) as locked",
      )
    ).rows[0].locked
  )
    throw new Error('DEFAULT_PRIVILEGE_DEPLOY_LOCK');
  const capture = () =>
    readOnly(client, async () => {
      await assertEnvironmentIdentity(client, binding);
      return snapshotDefaults(client);
    });
  const directory = '.safebus-release/application-default-privileges';
  await fs.mkdir(directory, { recursive: true });
  const write = (name, value) =>
    fs.writeFile(`${directory}/${name}.json`, JSON.stringify(value, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  const identity = {
    releaseSha,
    runId,
    binding,
    migrationSha256: config.migrationSha256,
    guardMigrationSha256: config.guardMigrationSha256,
    forwardSha256: config.forwardSha256,
    restoreSha256: config.restoreSha256,
  };
  if (mode === 'prepare') {
    stage = 'reconcile';
    const snapshot = await capture();
    let installed = false;
    try {
      verifyDefaults(snapshot, config, 'after');
      installed = true;
    } catch {
      /* Exact before-state is required below. */
    }
    if (installed) {
      await write('existing', {
        ...identity,
        acceptance: verifyDefaults(snapshot, config, 'after'),
        observationOnly: true,
        sqlApplied: false,
      });
      await fs.appendFile(process.env.GITHUB_OUTPUT, 'state=installed\n');
    } else {
      verifyDefaults(snapshot, config, 'before');
      stage = 'rehearse';
      await rehearseDefaults(client, forward, restore, config);
      if (digest(JSON.stringify(snapshot)) !== digest(JSON.stringify(await capture())))
        throw new Error('DEFAULT_PRIVILEGE_BASELINE_CHANGED');
      stage = 'recovery';
      const recovery = { snapshot, restoreSql: restore };
      const envelope = await encryptBackupStream(
        Readable.from([JSON.stringify(recovery)]),
        `${directory}/recovery.enc`,
        process.env.SAFEBUS_BACKUP_PUBLIC_KEY,
      );
      await write('recovery', {
        ...identity,
        createdAt: new Date().toISOString(),
        snapshotSha256: digest(JSON.stringify(snapshot)),
        envelope,
        boundedRecoveryOnly: true,
        fullDatabaseRestoreVerified: false,
      });
      await fs.appendFile(process.env.GITHUB_OUTPUT, 'state=pending\n');
    }
  } else if (mode === 'install') {
    if (process.env.SAFEBUS_DEFAULT_PRIVILEGE_CONFIRM !== 'INSTALL_APPLICATION_DEFAULTS')
      throw new Error('DEFAULT_PRIVILEGE_CONFIRMATION');
    const evidence = JSON.parse(await fs.readFile(`${directory}/recovery.json`, 'utf8'));
    const age = Date.now() - Date.parse(evidence.createdAt);
    const snapshot = await capture();
    if (
      Object.entries(identity).some(
        ([key, value]) => JSON.stringify(value) !== JSON.stringify(evidence[key]),
      ) ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > 3_600_000 ||
      evidence.envelope.ciphertextSha256 !== (await fileDigest(`${directory}/recovery.enc`)) ||
      evidence.snapshotSha256 !== digest(JSON.stringify(snapshot)) ||
      evidence.envelope.plaintextSha256 !==
        digest(JSON.stringify({ snapshot, restoreSql: restore }))
    )
      throw new Error('DEFAULT_PRIVILEGE_RECOVERY_INVALID');
    await rehearseDefaults(client, forward, restore, config);
    stage = 'install';
    await client.query('begin isolation level repeatable read');
    try {
      await client.query(
        "set local statement_timeout='5s';set local lock_timeout='1s';set local search_path=pg_catalog,public,safebus_private,auth,extensions,realtime,pg_temp",
      );
      verifyDefaults(await snapshotDefaults(client), config, 'before');
      await client.query(forward);
      const acceptance = verifyDefaults(await snapshotDefaults(client), config, 'after');
      commitAttempted = true;
      await client.query('commit');
      await write('installation', {
        ...identity,
        acceptance,
        installedAt: new Date().toISOString(),
        sqlApplied: true,
        notificationSent: false,
      });
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  } else {
    stage = 'verify';
    const acceptance = verifyDefaults(await capture(), config, 'after');
    await write('verification', {
      ...identity,
      acceptance,
      verifiedAt: new Date().toISOString(),
      observationOnly: true,
    });
  }
  console.log(
    JSON.stringify({
      result: 'verified',
      mode,
      scope: 'application-defaults-and-private-session-guards',
      fullAuthorizationAuditPassed: false,
    }),
  );
} catch (error) {
  const code = /^DEFAULT_PRIVILEGE_[A-Z_]+$/.test(error?.message ?? '')
    ? error.message
    : /^[0-9A-Z]{5}$/.test(error?.code ?? '')
      ? error.code
      : 'ERROR';
  console.error(
    JSON.stringify({
      result: 'failed',
      stage,
      code,
      snapshotPhase: error?.snapshotPhase,
      snapshotSection: error?.snapshotSection,
      commitOutcomeRequiresInspection: commitAttempted,
    }),
  );
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
