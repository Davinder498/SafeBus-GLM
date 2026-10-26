#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  assertReviewedCheckout,
  verifiedDatabaseClient,
} from './lib/security-workflow-evidence.mjs';
import { createEnvironmentBinding } from './lib/environment-identity.mjs';
import { encryptBackupStream, fileDigest } from './lib/security-backup.mjs';
import {
  capturePushRecovery,
  digest,
  pushRecoverySql,
  rehearseRecipientPush,
  recipientPushFailureCode,
  recipientPushState,
  recipientPreferenceDigest,
  verifyInstalledRecipientPush,
  verifyRecipientPushSchema,
} from './lib/recipient-push-rollout.mjs';

const directory = path.resolve('.safebus-release/recipient-push');
const mode = process.argv[2];
let client;
let stage = 'preflight';
try {
  const releaseSha = process.env.SAFEBUS_RELEASE_SHA;
  assertReviewedCheckout(releaseSha);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_DEPLOY_ENV !== 'production' ||
    !['prepare', 'install', 'verify-existing'].includes(mode) ||
    !/^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ID ?? '')
  )
    throw new Error('Invalid protected rollout context.');
  const config = JSON.parse(
    await fs.readFile('config/pending/complete-recipient-push.json', 'utf8'),
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
    throw new Error('Unapproved notification target.');
  const migration = (await fs.readFile(config.migration, 'utf8')).replaceAll('\r\n', '\n');
  if (digest(migration) !== config.migrationSha256)
    throw new Error('Notification migration differs from the reviewed digest.');
  const signatures = config.baseline.map((entry) => entry.signature);
  client = verifiedDatabaseClient(
    process.env.SAFEBUS_DATABASE_URL,
    process.env.SAFEBUS_DATABASE_CA_CERT,
    'safebus-recipient-push-rollout',
  );
  await client.connect();
  if (
    !(
      await client.query(
        "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) as acquired",
      )
    ).rows[0].acquired
  )
    throw new Error('Another schema operation is running.');
  const readOnly = async (operation) => {
    await client.query('begin isolation level repeatable read read only');
    try {
      await client.query("set local statement_timeout='5s'; set local lock_timeout='1s'");
      return await operation();
    } finally {
      await client.query('rollback');
    }
  };
  const capture = () => readOnly(() => capturePushRecovery(client, signatures));
  if (mode === 'prepare') stage = 'inspect-hosted-state';
  const state =
    mode === 'prepare'
      ? await readOnly(() => recipientPushState(client, migration, config.baseline))
      : null;
  if (mode === 'prepare' && state === 'installed') {
    stage = 'verify-existing-installation';
    const acceptance = await readOnly(() =>
      verifyInstalledRecipientPush(client, migration, config.baseline),
    );
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(
      path.join(directory, 'existing.json'),
      JSON.stringify(
        {
          releaseSha,
          runId: process.env.GITHUB_RUN_ID,
          binding,
          observedAt: new Date().toISOString(),
          migrationSha256: config.migrationSha256,
          acceptance,
          observationOnly: true,
          sqlApplied: false,
          preChangeRecoveryCreated: false,
          installationOrigin: 'not-established-by-this-run',
          notificationSent: false,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    await fs.appendFile(process.env.GITHUB_OUTPUT, 'state=installed\n');
    console.log(
      'PASS: existing installation exactly matches reviewed SQL; read-only verification, no migration replay or pre-change recovery claim.',
    );
  } else if (mode === 'prepare') {
    stage = 'rollback-rehearsal';
    const snapshot = await capture();
    const acceptance = await rehearseRecipientPush(client, migration, signatures);
    if (digest(JSON.stringify(snapshot)) !== digest(JSON.stringify(await capture())))
      throw new Error('Notification baseline changed during rehearsal.');
    stage = 'encrypted-recovery';
    await fs.mkdir(directory, { recursive: true });
    const recovery = JSON.stringify({ ...snapshot, restoreSql: pushRecoverySql(snapshot) });
    const envelope = await encryptBackupStream(
      Readable.from([recovery]),
      path.join(directory, 'recovery.enc'),
      process.env.SAFEBUS_BACKUP_PUBLIC_KEY,
    );
    const evidence = {
      format: 1,
      releaseSha,
      runId: process.env.GITHUB_RUN_ID,
      binding,
      createdAt: new Date().toISOString(),
      migrationSha256: config.migrationSha256,
      snapshotSha256: digest(JSON.stringify(snapshot)),
      envelope,
      acceptance,
      boundedRecoveryOnly: true,
      fixtureWrites: false,
      notificationSent: false,
    };
    await fs.writeFile(
      path.join(directory, 'recovery.json'),
      JSON.stringify(evidence, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    await fs.appendFile(process.env.GITHUB_OUTPUT, 'state=pending\n');
    console.log(
      'PASS: rollback-only rehearsal, unchanged recipient preferences, and encrypted bounded recovery captured.',
    );
  } else if (mode === 'verify-existing') {
    stage = 'verify-existing-installation';
    const evidence = JSON.parse(await fs.readFile(path.join(directory, 'existing.json'), 'utf8'));
    if (
      evidence.releaseSha !== releaseSha ||
      evidence.runId !== process.env.GITHUB_RUN_ID ||
      evidence.migrationSha256 !== config.migrationSha256 ||
      JSON.stringify(evidence.binding) !== JSON.stringify(binding)
    )
      throw new Error('Existing installation evidence differs from the reviewed context.');
    const acceptance = await readOnly(() =>
      verifyInstalledRecipientPush(client, migration, config.baseline),
    );
    console.log(
      'PASS: reviewed installed definitions rechecked after Firebase validation; no database mutation.',
    );
    await fs.writeFile(
      path.join(directory, 'installation.json'),
      JSON.stringify(
        {
          ...evidence,
          acceptance,
          verifiedAt: new Date().toISOString(),
          firebaseValidationCompleted: true,
        },
        null,
        2,
      ) + '\n',
    );
  } else {
    if (process.env.SAFEBUS_NOTIFICATION_CONFIRM !== 'INSTALL_RECIPIENT_PUSH')
      throw new Error('Notification installation confirmation is missing.');
    const evidence = JSON.parse(await fs.readFile(path.join(directory, 'recovery.json'), 'utf8'));
    const recoveryAge = Date.now() - Date.parse(evidence.createdAt);
    if (
      evidence.releaseSha !== releaseSha ||
      evidence.runId !== process.env.GITHUB_RUN_ID ||
      evidence.migrationSha256 !== config.migrationSha256 ||
      JSON.stringify(evidence.binding) !== JSON.stringify(binding) ||
      !Number.isFinite(recoveryAge) ||
      recoveryAge < 0 ||
      recoveryAge > 60 * 60 * 1000 ||
      evidence.envelope.ciphertextSha256 !==
        (await fileDigest(path.join(directory, 'recovery.enc'))) ||
      evidence.snapshotSha256 !== digest(JSON.stringify(await capture()))
    )
      throw new Error('Recovery evidence is stale or differs from the current target.');
    stage = 'repeat-rehearsal';
    await rehearseRecipientPush(client, migration, signatures);
    stage = 'atomic-install';
    await client.query('begin isolation level repeatable read');
    try {
      await client.query("set local statement_timeout='5s'; set local lock_timeout='1s'");
      await client.query(
        'lock table public.guardian_notification_delivery_policies in access exclusive mode',
      );
      if (
        evidence.snapshotSha256 !==
        digest(JSON.stringify(await capturePushRecovery(client, signatures)))
      )
        throw new Error('Notification policy changed after recovery capture.');
      const preferences = await recipientPreferenceDigest(client);
      await client.query(migration);
      const acceptance = await verifyRecipientPushSchema(client);
      if (preferences !== (await recipientPreferenceDigest(client)))
        throw new Error('Recipient preferences changed.');
      await client.query('commit');
      await fs.writeFile(
        path.join(directory, 'installation.json'),
        JSON.stringify(
          {
            releaseSha,
            runId: process.env.GITHUB_RUN_ID,
            installedAt: new Date().toISOString(),
            migrationSha256: config.migrationSha256,
            acceptance,
            recipientPreferencesPreserved: true,
            notificationSent: false,
          },
          null,
          2,
        ) + '\n',
      );
      console.log('PASS: authority switches and RPCs removed; recipient preferences preserved.');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }
} catch (error) {
  // Do not emit provider errors, SQL, row values, tokens, URLs, or credentials.
  console.error(
    `Recipient push rollout stopped at ${stage} [${recipientPushFailureCode(error)}]. No automatic retry or historical replay.`,
  );
  process.exitCode = 1;
} finally {
  await client?.end();
}
