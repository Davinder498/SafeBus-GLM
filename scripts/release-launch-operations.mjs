import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import {
  assertReviewedCheckout,
  verifiedDatabaseClient,
} from './lib/security-workflow-evidence.mjs';
import {
  createEnvironmentBinding,
  assertEnvironmentIdentity,
} from './lib/environment-identity.mjs';
import { fileDigest } from './lib/security-backup.mjs';
import { netlifyApi } from './lib/production-credential-isolation.mjs';
import { verifyCompleteDisposalDryRun } from './lib/retention-verification.mjs';
import {
  CONTROL_KEYS,
  activateDatabaseControl,
  isReviewedPause,
  restorePausedMonitor,
  readControls,
  assertInactive,
  assertInitialCounts,
  setProductionControl,
  fail,
  launchFailureCode,
} from './lib/launch-operations-controls.mjs';
const mode = process.argv[2],
  sha = process.env.SAFEBUS_RELEASE_SHA,
  runId = process.env.GITHUB_RUN_ID;
const dir = '.safebus-release/launch-operations',
  reference = `github:${runId}:${sha}`;
let client,
  stage = 'context';
try {
  assertReviewedCheckout(sha);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.GITHUB_WORKFLOW !== 'Release reviewed engineering fixes' ||
    process.env.SAFEBUS_DEPLOY_ENV !== 'production' ||
    process.env.SAFEBUS_OPERATIONS_CONFIRM !== 'ACTIVATE_REVIEWED_RETENTION_AND_ALERTS' ||
    !['prepare', 'activate', 'verify', 'pause'].includes(mode) ||
    !/^\d+$/.test(runId ?? '')
  )
    fail('CONTEXT');
  // Pause remains available if main moves while a release is in progress.
  if (
    mode !== 'pause' &&
    execFileSync('git', ['ls-remote', 'origin', 'refs/heads/main'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .trim()
      .split(/\s+/)[0] !== sha
  )
    fail('MAIN_MOVED');
  const binding = createEnvironmentBinding({
    environment: 'production',
    databaseUrl: process.env.SAFEBUS_DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
  });
  if (process.env.SUPABASE_URL !== 'https://ckrkfylsyihwouvesypm.supabase.co') fail('PROJECT');
  client = verifiedDatabaseClient(
    process.env.SAFEBUS_DATABASE_URL,
    process.env.SAFEBUS_DATABASE_CA_CERT,
    'safebus-launch-controls',
  );
  await client.connect();
  await assertEnvironmentIdentity(client, binding);
  if (
    !(
      await client.query(
        "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) as locked",
      )
    ).rows[0].locked
  )
    fail('DEPLOY_LOCK');
  const api = netlifyApi(process.env.NETLIFY_AUTH_TOKEN);
  await fs.mkdir(dir, { recursive: true });
  const read = async (name) => JSON.parse(await fs.readFile(`${dir}/${name}.json`, 'utf8'));
  const write = (name, value) =>
    fs.writeFile(`${dir}/${name}.json`, JSON.stringify(value, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  const control = async () =>
    (
      await client.query(
        'select destructive_enabled,approval_reference,approved_at::text from public.retention_execution_control where id=1',
      )
    ).rows[0];
  const executionCount = async () =>
    Number(
      (await client.query('select count(*) as n from safebus_private.retention_lifecycle_totals'))
        .rows[0].n,
    );
  const candidates = async () =>
    Number(
      (
        await client.query(`select
 (select count(*) from safebus_private.disposal_accounts where state in ('pending','deleting'))+
 (select count(*) from public.profiles p where p.status='disabled' and p.role in ('driver','guardian') and p.tenant_id is not null and p.updated_at<now()-interval '395 days' and not exists(select 1 from safebus_private.disposal_accounts q where q.profile_id=p.id)) as n`)
      ).rows[0].n,
    );
  if (mode === 'prepare') {
    stage = 'read-only-preflight';
    const hosting = await readControls(api),
      database = await control();
    assertInactive(hosting, database, await executionCount());
    const dryRun = await verifyCompleteDisposalDryRun(client);
    assertInitialCounts(dryRun.eligibleCounts, await candidates());
    await write('plan', {
      sha,
      runId,
      reference,
      createdAt: new Date().toISOString(),
      hosting,
      database,
      dryRun,
    });
  } else if (mode === 'activate') {
    stage = 'verify-retained-recovery';
    const plan = await read('plan');
    const backup = JSON.parse(
      await fs.readFile('.safebus-release/platform-recovery/backup.json', 'utf8'),
    );
    const age = Date.now() - Date.parse(backup.exportCompletedAt);
    if (
      plan.sha !== sha ||
      plan.runId !== runId ||
      backup.mode !== 'encrypted-platform-export' ||
      Object.entries(binding).some(([key, value]) => backup[key] !== value) ||
      backup.releaseSha !== sha ||
      backup.runId !== runId ||
      !(age >= 0 && age < 3600000) ||
      backup.archive.ciphertextSha256 !==
        (await fileDigest('.safebus-release/platform-recovery/database.enc')) ||
      backup.roles.ciphertextSha256 !==
        (await fileDigest('.safebus-release/platform-recovery/roles.enc'))
    )
      fail('RECOVERY');
    let hosting = await readControls(api);
    const database = await control();
    assertInactive(hosting, database, await executionCount());
    if (!isDeepStrictEqual(hosting, plan.hosting) || !isDeepStrictEqual(database, plan.database))
      fail('PLAN_DRIFT');
    const dryRun = await verifyCompleteDisposalDryRun(client);
    assertInitialCounts(dryRun.eligibleCounts, await candidates());
    if (isReviewedPause(database)) {
      stage = 'repair-paused-hosting';
      hosting = await restorePausedMonitor(api, hosting);
    }
    await write('mutation-started', { sha, runId, reference, startedAt: new Date().toISOString() });
    stage = 'activate-database';
    await activateDatabaseControl(client, reference, isReviewedPause(database) ? database : null);
    stage = 'activate-hosting';
    hosting = await setProductionControl(api, CONTROL_KEYS[1], 'alert', hosting);
    await setProductionControl(api, CONTROL_KEYS[0], 'true', hosting);
    await write('activation', {
      sha,
      runId,
      reference,
      activatedAt: new Date().toISOString(),
      initialCounts: dryRun.eligibleCounts,
      fullRestoreVerified: false,
      previousApprovalReference: database.approval_reference,
    });
  } else if (mode === 'pause') {
    // Never imply that a pause restores records already deleted.
    try {
      await read('mutation-started');
    } catch {
      console.log(JSON.stringify({ result: 'skipped', reason: 'no_mutation_started' }));
      process.exit(0);
    }
    stage = 'pause-database';
    const state = await control();
    if (
      state.approval_reference !== null &&
      state.approval_reference !== reference &&
      !isReviewedPause(state)
    )
      fail('PAUSE_OWNER');
    await client.query("set statement_timeout='12s';set lock_timeout='1s'");
    await client.query(
      'update public.retention_execution_control set destructive_enabled=false where id=1 and approval_reference=$1',
      [reference],
    );
    if ((await control()).destructive_enabled !== false) fail('PAUSE_UNVERIFIED');
    stage = 'pause-hosting';
    const hosting = await readControls(api);
    await setProductionControl(api, CONTROL_KEYS[0], 'false', hosting);
    await write('pause', {
      sha,
      runId,
      reference,
      pausedAt: new Date().toISOString(),
      deletedRecordsRestored: false,
      applicationAlertMode:
        (await readControls(api)).controls[CONTROL_KEYS[1]]?.values.find(
          (v) => v.context === 'production',
        )?.value ?? 'unchanged',
    });
  } else {
    stage = 'verify-scheduled-execution';
    const activation = await read('activation');
    if (activation.sha !== sha || activation.runId !== runId) fail('ACTIVATION_IDENTITY');
    const state = await control(),
      hosting = await readControls(api);
    if (
      state.destructive_enabled !== true ||
      state.approval_reference !== reference ||
      hosting.controls[CONTROL_KEYS[0]]?.values.find((v) => v.context === 'production')?.value !==
        'true' ||
      hosting.controls[CONTROL_KEYS[1]]?.values.find((v) => v.context === 'production')?.value !==
        'alert'
    )
      fail('ACTIVE_STATE');
    let totals;
    for (let attempt = 0; attempt < 6; attempt++) {
      totals = (
        await client.query(
          'select completed_at,run_count,counts from safebus_private.retention_lifecycle_totals where completed_at >= $1 order by completed_at desc limit 1',
          [activation.activatedAt],
        )
      ).rows[0];
      if (totals) break;
      if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 30000));
    }
    if (!totals) fail('SCHEDULED_EXECUTION_UNVERIFIED');
    await write('verification', {
      sha,
      runId,
      reference,
      verifiedAt: new Date().toISOString(),
      totals,
      applicationAlertMode: 'alert',
      mailboxDeliveryVerified: false,
    });
  }
  console.log(JSON.stringify({ result: 'passed', stage, mode }));
} catch (error) {
  console.error(
    JSON.stringify({
      result: 'failed',
      stage,
      code: launchFailureCode(error),
    }),
  );
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
