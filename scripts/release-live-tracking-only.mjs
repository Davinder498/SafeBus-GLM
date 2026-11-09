// Protected removal only. No QA fixtures, migration replay, resets or provider sends.
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  assertReviewedCheckout,
  verifiedDatabaseClient,
} from './lib/security-workflow-evidence.mjs';
import {
  createEnvironmentBinding,
  assertEnvironmentIdentity,
} from './lib/environment-identity.mjs';
import {
  captureEncryptedDump,
  encryptBackupStream,
  fileDigest,
  pgBackupEnvironment,
} from './lib/security-backup.mjs';
import { operationalDataDigest } from './lib/operational-rollout.mjs';
import {
  HISTORY_TABLES,
  hash,
  snapshotTrackingRemoval,
  verifyTrackingRemoval,
  readOnly,
  rehearseTrackingRemoval,
  verifyRecoveryRun,
  trackingHistoryFootprint,
  retireGpsArchiveBucket,
  requireReviewedCatalog,
  registerTrackingSchemaRelease,
  verifyTrackingSchemaRelease,
} from './lib/live-tracking-removal.mjs';

const mode = process.argv[2],
  sha = process.env.SAFEBUS_RELEASE_SHA;
const directory = '.safebus-release/live-tracking-only';
const repo = 'Davinder498/SafeBus-GLM';
let client,
  stage = 'context',
  commitAttempted = false;
const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const github = (path) =>
  JSON.parse(
    execFileSync('gh', ['api', 'repos/' + repo + path], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
async function requireBackup() {
  const runId = process.env.SAFEBUS_RECOVERY_RUN_ID;
  if (!/^[1-9][0-9]*$/.test(runId ?? '')) throw new Error('TRACKING_REMOVAL_RECOVERY_REQUIRED');
  verifyRecoveryRun(
    github('/actions/runs/' + runId),
    github('/actions/runs/' + runId + '/artifacts').artifacts ?? [],
    { sha, runId },
  );
  if (process.env.SAFEBUS_RECOVERY_CONFIRM !== 'RESTORE_VERIFIED_OFFSITE')
    throw new Error('TRACKING_REMOVAL_RESTORE_REVIEW_REQUIRED');
  return runId;
}
try {
  assertReviewedCheckout(sha);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_DEPLOY_ENV !== 'production' ||
    !['prepare', 'install', 'verify', 'cleanup'].includes(mode) ||
    !/^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ID ?? '')
  )
    throw new Error('TRACKING_REMOVAL_PROTECTED_CONTEXT');
  const config = await readJson('config/pending/live-tracking-only.json');
  const sql = (await fs.readFile(config.migration, 'utf8')).replaceAll('\r', '');
  if (hash(sql) !== config.migrationSha256) throw new Error('TRACKING_REMOVAL_SQL_DRIFT');
  const binding = createEnvironmentBinding({
    environment: 'production',
    databaseUrl: process.env.SAFEBUS_DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
  });
  if (
    config.projectId !== 'ckrkfylsyihwouvesypm' ||
    binding.projectRefHash !== hash(config.projectId)
  )
    throw new Error('TRACKING_REMOVAL_TARGET_MISMATCH');
  client = verifiedDatabaseClient(
    process.env.SAFEBUS_DATABASE_URL,
    process.env.SAFEBUS_DATABASE_CA_CERT,
    'safebus-live-tracking-release',
  );
  await client.connect();
  await assertEnvironmentIdentity(client, binding);
  await client.query("set timezone='UTC'");
  if (
    !(
      await client.query(
        "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) as locked",
      )
    ).rows[0].locked
  )
    throw new Error('TRACKING_REMOVAL_DEPLOY_LOCK');
  await fs.mkdir(directory, { recursive: true });
  const write = async (name, value) =>
    fs.writeFile(directory + '/' + name + '.json', JSON.stringify(value, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  const identity = {
    sha,
    runId: process.env.GITHUB_RUN_ID,
    binding,
    migrationSha256: config.migrationSha256,
  };
  if (mode === 'prepare') {
    stage = 'reconcile';
    const observed = await readOnly(client, () => snapshotTrackingRemoval(client, config));
    try {
      verifyTrackingRemoval(observed, config, 'after');
      await readOnly(client, () => verifyTrackingSchemaRelease(client, sha));
      await write('existing', { ...identity, observationOnly: true, historyRemoved: true });
      await fs.appendFile(process.env.GITHUB_OUTPUT, 'state=installed\n');
    } catch (error) {
      if (error.message !== 'TRACKING_REMOVAL_SCHEMA_DRIFT') throw error;
      verifyTrackingRemoval(observed, config, 'before');
      await readOnly(client, () => requireReviewedCatalog(client, config));
      stage = 'rehearse';
      const rehearsal = await rehearseTrackingRemoval(client, sql, config, operationalDataDigest);
      await readOnly(client, () => requireReviewedCatalog(client, config));
      if (process.env.SAFEBUS_TRACKING_REMOVAL_MODE === 'rehearse') {
        await write('rehearsal', { ...identity, ...rehearsal });
        await fs.appendFile(process.env.GITHUB_OUTPUT, 'state=rehearsed\n');
      } else {
        stage = 'recover';
        const backupRunId = await requireBackup();
        if (!/\b17\./.test(execFileSync('pg_dump', ['--version'], { encoding: 'utf8' })))
          throw new Error('TRACKING_REMOVAL_PG_TOOLS');
        const caFile = directory + '/database-ca.pem';
        await fs.writeFile(caFile, process.env.SAFEBUS_DATABASE_CA_CERT, {
          flag: 'wx',
          mode: 0o600,
        });
        const env = pgBackupEnvironment(process.env.SAFEBUS_DATABASE_URL, caFile);
        await client.query('begin isolation level repeatable read read only');
        let footprint, envelope, functions;
        try {
          await client.query(
            "set local statement_timeout='30s';set local lock_timeout='1s';set local idle_in_transaction_session_timeout='15min'",
          );
          footprint = await trackingHistoryFootprint(client, config.maxRemovalRows);
          const snapshotId = (await client.query('select pg_export_snapshot() id')).rows[0].id;
          // pg_dump reads the exact same MVCC snapshot; plaintext never reaches disk or logs.
          envelope = await captureEncryptedDump(
            'pg_dump',
            [
              '--format=custom',
              '--snapshot=' + snapshotId,
              ...HISTORY_TABLES.map((t) => '--table=' + t),
            ],
            {
              directory,
              name: 'removed-relations',
              publicKeyPem: process.env.SAFEBUS_BACKUP_PUBLIC_KEY,
              env,
            },
          );
          functions = (
            await client.query(
              `select p.oid::regprocedure::text as signature,
          pg_get_functiondef(p.oid) as definition from pg_proc p
          where p.oid=any(array(select to_regprocedure(x) from unnest($1::text[]) x))`,
              [
                [
                  ...config.functions.map((f) => f.signature),
                  'safebus_private.enforce_native_ingestion_for_bound_session()',
                ],
              ],
            )
          ).rows;
        } finally {
          await client.query('rollback');
        }
        const recovery = {
          ...identity,
          backupRunId,
          footprint,
          originalFunctions: functions,
          scopedDumpEnvelope: envelope,
          rollbackRequiresReviewedRestore: true,
        };
        const metadata = await encryptBackupStream(
          Readable.from([JSON.stringify(recovery)]),
          directory + '/metadata.enc',
          process.env.SAFEBUS_BACKUP_PUBLIC_KEY,
        );
        await write('recovery', {
          ...identity,
          createdAt: new Date().toISOString(),
          backupRunId,
          footprint,
          scopedDumpEnvelope: envelope,
          metadataEnvelope: metadata,
          rehearsal,
        });
        await fs.appendFile(process.env.GITHUB_OUTPUT, 'state=pending\n');
      }
    }
  } else if (mode === 'install') {
    stage = 'verify-recovery';
    if (process.env.SAFEBUS_TRACKING_REMOVAL_CONFIRM !== 'REMOVE_GPS_HISTORY')
      throw new Error('TRACKING_REMOVAL_CONFIRMATION');
    const recovery = await readJson(directory + '/recovery.json');
    const age = Date.now() - Date.parse(recovery.createdAt);
    if (
      Object.entries(identity).some(
        ([k, v]) => JSON.stringify(recovery[k]) !== JSON.stringify(v),
      ) ||
      !(age >= 0 && age <= 3600000) ||
      recovery.scopedDumpEnvelope.ciphertextSha256 !==
        (await fileDigest(directory + '/removed-relations.enc')) ||
      recovery.metadataEnvelope.ciphertextSha256 !==
        (await fileDigest(directory + '/metadata.enc')) ||
      recovery.backupRunId !== (await requireBackup())
    )
      throw new Error('TRACKING_REMOVAL_RECOVERY_INVALID');
    // Retired aggregate counters remain zero so predecessor workers can finish safely.
    stage = 'install';
    await client.query('begin isolation level repeatable read');
    try {
      await client.query(
        "set local statement_timeout='12s';set local lock_timeout='1s';set local check_function_bodies=on",
      );
      await client.query(
        'lock table public.bus_tracking_sessions in exclusive mode;lock table public.driver_trip_location_updates in access exclusive mode',
      );
      verifyTrackingRemoval(await snapshotTrackingRemoval(client, config), config, 'before');
      await requireReviewedCatalog(client, config);
      if (
        JSON.stringify(await trackingHistoryFootprint(client, config.maxRemovalRows)) !==
        JSON.stringify(recovery.footprint)
      )
        throw new Error('TRACKING_REMOVAL_HISTORY_CHANGED_SINCE_BACKUP');
      const data = await operationalDataDigest(client);
      await client.query(sql);
      const result = verifyTrackingRemoval(
        await snapshotTrackingRemoval(client, config),
        config,
        'after',
      );
      if (data !== (await operationalDataDigest(client)))
        throw new Error('TRACKING_REMOVAL_OPERATIONAL_DATA_CHANGED');
      // Register this exact schema in the normal protected application-release ledger.
      const schemaFingerprint = await registerTrackingSchemaRelease(client, sha);
      commitAttempted = true;
      await client.query('commit');
      await readOnly(client, () => verifyTrackingSchemaRelease(client, sha));
      await write('installation', {
        ...identity,
        ...result,
        installedAt: new Date().toISOString(),
        backupRunId: recovery.backupRunId,
        notificationSent: false,
        schemaFingerprint,
      });
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  } else if (mode === 'cleanup') {
    stage = 'retire-empty-archive-bucket';
    await readOnly(client, async () =>
      verifyTrackingRemoval(await snapshotTrackingRemoval(client, config), config, 'after'),
    );
    await readOnly(client, () => verifyTrackingSchemaRelease(client, sha));
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!key) throw new Error('TRACKING_REMOVAL_STORAGE_CREDENTIAL_REQUIRED');
    const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
    const { createClient } = require('@supabase/supabase-js');
    const storage = createClient(process.env.SUPABASE_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
      },
    }).storage;
    await write('archive-bucket', {
      ...identity,
      ...(await retireGpsArchiveBucket(client, storage)),
    });
  } else {
    stage = 'verify';
    let result,
      expiryExecuted = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      result = await readOnly(client, async () => {
        await verifyTrackingSchemaRelease(client, sha);
        const result = verifyTrackingRemoval(
          await snapshotTrackingRemoval(client, config),
          config,
          'after',
        );
        const {
          rows: [health],
        } = await client.query(`select j.active,r.status,
          r.end_time>now()-interval '5 minutes' as recent
          from cron.job j left join lateral
            (select status,end_time from cron.job_run_details where jobid=j.jobid order by runid desc limit 1) r on true
          where j.jobname='safebus-expire-tracking-positions'`);
        if (health?.active !== true) throw new Error('TRACKING_REMOVAL_EXPIRY_DISABLED');
        if (health.status === 'failed' && health.recent)
          throw new Error('TRACKING_REMOVAL_EXPIRY_FAILED');
        expiryExecuted = health.status === 'succeeded' && health.recent === true;
        return result;
      });
      if (expiryExecuted) break;
      if (attempt < 11) await new Promise((resolve) => setTimeout(resolve, 15000));
    }
    if (!expiryExecuted) throw new Error('TRACKING_REMOVAL_EXPIRY_NOT_OBSERVED');
    await write('verification', {
      ...identity,
      ...result,
      expiryExecutionVerified: true,
      verifiedAt: new Date().toISOString(),
      observationOnly: true,
    });
  }
  console.log(JSON.stringify({ result: 'verified', mode, historyRemoval: true }));
} catch (error) {
  console.error(
    JSON.stringify({
      result: 'failed',
      stage,
      code: /^TRACKING_REMOVAL_[A-Z_]+$/.test(error?.message ?? '')
        ? error.message
        : 'TRACKING_REMOVAL_FAILED',
      commitOutcomeRequiresInspection: commitAttempted,
    }),
  );
  process.exitCode = 1;
} finally {
  await client?.end();
}
