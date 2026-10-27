#!/usr/bin/env node
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import {
  assertReviewedCheckout,
  verifiedDatabaseClient,
} from './lib/security-workflow-evidence.mjs';
import { createEnvironmentBinding } from './lib/environment-identity.mjs';
import { encryptBackupStream, fileDigest } from './lib/security-backup.mjs';
import { recipientPreferenceDigest } from './lib/recipient-push-rollout.mjs';
import {
  templateDigest,
  templateReadOnly,
  templateSnapshot,
  templateRestoreSql,
  verifyTemplateInstallation,
  rehearseTemplates,
} from './lib/notification-template-rollout.mjs';

const directory = '.safebus-release/notification-templates';
const mode = process.argv[2];
let client;
let stage = 'preflight';
try {
  const releaseSha = process.env.SAFEBUS_RELEASE_SHA;
  assertReviewedCheckout(releaseSha);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_DEPLOY_ENV !== 'production' ||
    !['prepare', 'install', 'verify'].includes(mode) ||
    !/^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ID ?? '')
  )
    throw new Error('TEMPLATE_PROTECTED_CONTEXT');
  const config = JSON.parse(
    await fs.readFile('config/pending/notification-templates.json', 'utf8'),
  );
  const binding = createEnvironmentBinding({
    environment: 'production',
    databaseUrl: process.env.SAFEBUS_DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
  });
  if (
    config.projectId !== 'ckrkfylsyihwouvesypm' ||
    binding.projectRefHash !== templateDigest(config.projectId)
  )
    throw new Error('TEMPLATE_TARGET_MISMATCH');
  const sql = (await fs.readFile(config.migration, 'utf8')).replaceAll('\r', '');
  if (templateDigest(sql) !== config.migrationSha256) throw new Error('TEMPLATE_DIGEST_MISMATCH');
  client = verifiedDatabaseClient(
    process.env.SAFEBUS_DATABASE_URL,
    process.env.SAFEBUS_DATABASE_CA_CERT,
    'safebus-notification-templates',
  );
  await client.connect();
  if (
    !(
      await client.query(
        "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) as locked",
      )
    ).rows[0].locked
  )
    throw new Error('TEMPLATE_DEPLOY_LOCK');
  const capture = () => templateReadOnly(client, () => templateSnapshot(client, config));
  const identity = {
    releaseSha,
    runId: process.env.GITHUB_RUN_ID,
    binding,
    migrationSha256: config.migrationSha256,
  };
  await fs.mkdir(directory, { recursive: true });
  const write = (name, value) =>
    fs.writeFile(`${directory}/${name}.json`, JSON.stringify(value, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  if (mode === 'prepare') {
    stage = 'inspect';
    const snapshot = await capture();
    const present = snapshot.functions.filter(
      (entry) => config.newFunctions.includes(entry.signature) && entry.definition,
    );
    if (present.length) {
      const acceptance = await templateReadOnly(client, () =>
        verifyTemplateInstallation(client, sql, config),
      );
      await write('existing', {
        ...identity,
        acceptance,
        observationOnly: true,
        sqlApplied: false,
        preChangeRecoveryCreated: false,
      });
      await fs.appendFile(process.env.GITHUB_OUTPUT, 'state=installed\n');
    } else {
      stage = 'rehearsal';
      const acceptance = await rehearseTemplates(client, sql, config);
      if (JSON.stringify(snapshot) !== JSON.stringify(await capture()))
        throw new Error('TEMPLATE_BASELINE_CHANGED');
      stage = 'recovery';
      const envelope = await encryptBackupStream(
        Readable.from([JSON.stringify({ snapshot, restoreSql: templateRestoreSql(snapshot) })]),
        `${directory}/recovery.enc`,
        process.env.SAFEBUS_BACKUP_PUBLIC_KEY,
      );
      await write('recovery', {
        ...identity,
        createdAt: new Date().toISOString(),
        snapshotSha256: templateDigest(JSON.stringify(snapshot)),
        envelope,
        acceptance,
        boundedRecoveryOnly: true,
        notificationSent: false,
      });
      await fs.appendFile(process.env.GITHUB_OUTPUT, 'state=pending\n');
    }
  } else if (mode === 'install') {
    if (process.env.SAFEBUS_NOTIFICATION_CONFIRM !== 'INSTALL_NOTIFICATION_TEMPLATES')
      throw new Error('TEMPLATE_CONFIRMATION_MISSING');
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
      throw new Error('TEMPLATE_RECOVERY_INVALID');
    const snapshot = await capture();
    if (evidence.snapshotSha256 !== templateDigest(JSON.stringify(snapshot)))
      throw new Error('TEMPLATE_BASELINE_CHANGED');
    if (
      evidence.envelope.plaintextSha256 !==
      templateDigest(JSON.stringify({ snapshot, restoreSql: templateRestoreSql(snapshot) }))
    )
      throw new Error('TEMPLATE_RECOVERY_INVALID');
    await rehearseTemplates(client, sql, config);
    stage = 'install';
    await client.query('begin isolation level repeatable read');
    try {
      await client.query("set local statement_timeout='5s';set local lock_timeout='1s'");
      if (
        evidence.snapshotSha256 !==
        templateDigest(JSON.stringify(await templateSnapshot(client, config)))
      )
        throw new Error('TEMPLATE_BASELINE_CHANGED');
      const preferences = await recipientPreferenceDigest(client);
      await client.query(sql);
      const acceptance = await verifyTemplateInstallation(client, sql, config, snapshot);
      if (preferences !== (await recipientPreferenceDigest(client)))
        throw new Error('TEMPLATE_PREFERENCES_CHANGED');
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
    const acceptance = await templateReadOnly(client, () =>
      verifyTemplateInstallation(client, sql, config),
    );
    await write('verification', {
      ...identity,
      acceptance,
      verifiedAt: new Date().toISOString(),
      observationOnly: true,
      notificationSent: false,
    });
  }
  console.log(`PASS: notification template ${mode}; no notifications sent.`);
} catch (error) {
  const code = /^TEMPLATE_[A-Z_]+$/.test(error?.message ?? '')
    ? error.message
    : 'TEMPLATE_ROLLOUT_FAILED';
  console.error(`Notification template rollout stopped at ${stage} [${code}].`);
  process.exitCode = 1;
} finally {
  await client?.end();
}
