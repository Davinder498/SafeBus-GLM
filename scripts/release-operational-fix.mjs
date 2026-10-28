#!/usr/bin/env node
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import {
  assertReviewedCheckout,
  verifiedDatabaseClient,
} from './lib/security-workflow-evidence.mjs';
import { createEnvironmentBinding } from './lib/environment-identity.mjs';
import { encryptBackupStream, fileDigest } from './lib/security-backup.mjs';
import {
  operationalDigest,
  operationalSnapshot,
  operationalReadOnly,
  operationalRestoreSql,
  operationalDataDigest,
  verifyOperationalSnapshot,
  rehearseOperational,
} from './lib/operational-rollout.mjs';

const mode = process.argv[2];
const milestone = process.env.SAFEBUS_OPERATIONAL_MILESTONE;
const manifests = {
  overview: 'config/pending/admin-active-trip-visibility.json',
  notifications: 'config/pending/admin-trip-updates.json',
};
let client;
let stage = 'preflight';
let commitAttempted = false;
try {
  const releaseSha = process.env.SAFEBUS_RELEASE_SHA;
  assertReviewedCheckout(releaseSha);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_DEPLOY_ENV !== 'production' ||
    !['prepare', 'install', 'verify'].includes(mode) ||
    !Object.hasOwn(manifests, milestone) ||
    !/^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ID ?? '')
  )
    throw new Error('OPERATIONAL_PROTECTED_CONTEXT');
  const config = JSON.parse(await fs.readFile(manifests[milestone], 'utf8'));
  const binding = createEnvironmentBinding({
    environment: 'production',
    databaseUrl: process.env.SAFEBUS_DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
  });
  if (
    config.projectId !== 'ckrkfylsyihwouvesypm' ||
    binding.projectRefHash !== operationalDigest(config.projectId)
  )
    throw new Error('OPERATIONAL_TARGET_MISMATCH');
  const sql = (await fs.readFile(config.migration, 'utf8')).replaceAll('\r', '');
  if (operationalDigest(sql) !== config.migrationSha256) throw new Error('OPERATIONAL_SQL_DIGEST');
  client = verifiedDatabaseClient(
    process.env.SAFEBUS_DATABASE_URL,
    process.env.SAFEBUS_DATABASE_CA_CERT,
    'safebus-operational-fix',
  );
  await client.connect();
  if (
    !(
      await client.query(
        "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) as locked",
      )
    ).rows[0].locked
  )
    throw new Error('OPERATIONAL_DEPLOY_LOCK');
  const directory = `.safebus-release/operational-${milestone}`;
  await fs.mkdir(directory, { recursive: true });
  const write = (name, value) =>
    fs.writeFile(`${directory}/${name}.json`, JSON.stringify(value, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  const capture = () => operationalReadOnly(client, () => operationalSnapshot(client, config));
  const identity = {
    releaseSha,
    runId: process.env.GITHUB_RUN_ID,
    binding,
    milestone,
    migrationSha256: config.migrationSha256,
  };
  if (mode === 'prepare') {
    stage = 'reconcile';
    const snapshot = await capture();
    let installed = false;
    try {
      verifyOperationalSnapshot(snapshot, config, 'after');
      installed = true;
    } catch {
      /* A pending baseline must match in full below. */
    }
    if (installed) {
      await write('existing', {
        ...identity,
        acceptance: verifyOperationalSnapshot(snapshot, config, 'after'),
        observationOnly: true,
        sqlApplied: false,
        preChangeRecoveryCreated: false,
      });
      await fs.appendFile(process.env.GITHUB_OUTPUT, 'state=installed\n');
    } else {
      verifyOperationalSnapshot(snapshot, config, 'before');
      stage = 'rehearse';
      const acceptance = await rehearseOperational(client, sql, config);
      if (JSON.stringify(snapshot) !== JSON.stringify(await capture()))
        throw new Error('OPERATIONAL_BASELINE_CHANGED');
      stage = 'recovery';
      const recovery = { snapshot, restoreSql: operationalRestoreSql(snapshot, config) };
      const envelope = await encryptBackupStream(
        Readable.from([JSON.stringify(recovery)]),
        `${directory}/recovery.enc`,
        process.env.SAFEBUS_BACKUP_PUBLIC_KEY,
      );
      await write('recovery', {
        ...identity,
        createdAt: new Date().toISOString(),
        snapshotSha256: operationalDigest(JSON.stringify(snapshot)),
        envelope,
        acceptance,
        boundedRecoveryOnly: true,
        notificationSent: false,
      });
      await fs.appendFile(process.env.GITHUB_OUTPUT, 'state=pending\n');
    }
  } else if (mode === 'install') {
    if (process.env.SAFEBUS_OPERATIONAL_CONFIRM !== 'INSTALL_OPERATIONAL_FIX')
      throw new Error('OPERATIONAL_CONFIRMATION');
    const evidence = JSON.parse(await fs.readFile(`${directory}/recovery.json`, 'utf8'));
    const age = Date.now() - Date.parse(evidence.createdAt);
    if (
      Object.entries(identity).some(
        ([key, value]) => JSON.stringify(evidence[key]) !== JSON.stringify(value),
      ) ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > 3_600_000 ||
      evidence.envelope.ciphertextSha256 !== (await fileDigest(`${directory}/recovery.enc`))
    )
      throw new Error('OPERATIONAL_RECOVERY_INVALID');
    const snapshot = await capture();
    if (
      evidence.snapshotSha256 !== operationalDigest(JSON.stringify(snapshot)) ||
      evidence.envelope.plaintextSha256 !==
        operationalDigest(
          JSON.stringify({ snapshot, restoreSql: operationalRestoreSql(snapshot, config) }),
        )
    )
      throw new Error('OPERATIONAL_BASELINE_CHANGED');
    await rehearseOperational(client, sql, config);
    stage = 'install';
    await client.query('begin isolation level repeatable read');
    try {
      await client.query(
        "set local statement_timeout='5s';set local lock_timeout='1s';set local check_function_bodies=on",
      );
      if (
        evidence.snapshotSha256 !==
        operationalDigest(JSON.stringify(await operationalSnapshot(client, config)))
      )
        throw new Error('OPERATIONAL_BASELINE_CHANGED');
      const data = await operationalDataDigest(client);
      await client.query(sql);
      const acceptance = verifyOperationalSnapshot(
        await operationalSnapshot(client, config),
        config,
        'after',
      );
      if (data !== (await operationalDataDigest(client)))
        throw new Error('OPERATIONAL_RECIPIENT_DATA_CHANGED');
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
    const acceptance = verifyOperationalSnapshot(await capture(), config, 'after');
    await write('verification', {
      ...identity,
      acceptance,
      verifiedAt: new Date().toISOString(),
      observationOnly: true,
    });
  }
  console.log(JSON.stringify({ result: 'verified', mode, milestone }));
} catch (error) {
  const code = /^OPERATIONAL_[A-Z_]+$/.test(error?.message ?? '')
    ? error.message
    : /^[0-9A-Z]{5}$/.test(error?.code ?? '')
      ? error.code
      : 'ERROR';
  console.error(
    JSON.stringify({
      result: 'failed',
      stage,
      code,
      commitOutcomeRequiresInspection: commitAttempted,
    }),
  );
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
