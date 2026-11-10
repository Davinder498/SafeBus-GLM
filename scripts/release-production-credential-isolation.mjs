import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { assertReviewedCheckout } from './lib/security-workflow-evidence.mjs';
import { encryptBackupStream, fileDigest } from './lib/security-backup.mjs';
import {
  digest,
  netlifyApi,
  readConfiguration,
  configurationSummary,
  variableDigest,
  inventoryDeploys,
  previewCandidates,
  isolateCredentials,
  retirePreviews,
  verifyPreviewRetirement,
  isIsolated,
  stopCloudBuilds,
} from './lib/production-credential-isolation.mjs';

const action = process.argv[2],
  sha = process.env.SAFEBUS_RELEASE_SHA;
const directory = '.safebus-release/production-credential-isolation';
let stage = 'context';
try {
  assertReviewedCheckout(sha);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_DEPLOY_ENV !== 'production' ||
    !['prepare', 'install', 'verify'].includes(action) ||
    !/^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ID ?? '') ||
    !/^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ATTEMPT ?? '') ||
    process.env.SAFEBUS_ISOLATION_CONFIRM !== 'ISOLATE_PRODUCTION_CREDENTIALS'
  )
    throw new Error('CREDENTIAL_ISOLATION_PROTECTED_CONTEXT');
  const configText = await fs.readFile(
    'config/pending/production-credential-isolation.json',
    'utf8',
  );
  const policy = JSON.parse(configText);
  if (
    policy.siteId !== 'cfb88c3a-8cde-4c2a-ba1b-be4d0e0fc373' ||
    policy.accountId !== '687378def6490474add0e050'
  )
    throw new Error('CREDENTIAL_ISOLATION_TARGET');
  const identity = {
    sha,
    runId: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT,
    siteId: policy.siteId,
    policyDigest: digest(configText),
  };
  const api = netlifyApi(process.env.NETLIFY_AUTH_TOKEN);
  const json = async (name) =>
    JSON.parse(await fs.readFile(directory + '/' + name + '.json', 'utf8'));
  await fs.mkdir(directory, { recursive: true });
  const write = (name, value) =>
    fs.writeFile(directory + '/' + name + '.json', JSON.stringify(value, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  const journal = (value) =>
    fs.appendFile(
      directory + '/progress.jsonl',
      JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n',
      { mode: 0o600 },
    );
  const requireCurrentMain = () => {
    const remote = execFileSync('git', ['ls-remote', 'origin', 'refs/heads/main'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .trim()
      .split(/\s+/)[0];
    if (remote !== sha) throw new Error('CREDENTIAL_ISOLATION_MAIN_MOVED');
  };
  requireCurrentMain();
  if (action === 'prepare') {
    stage = 'read-only-plan';
    const state = await readConfiguration(api, policy);
    const deploys = await inventoryDeploys(api, policy),
      preparedAt = new Date().toISOString();
    const previews = previewCandidates(deploys, state.site, policy, preparedAt);
    const plan = {
      ...identity,
      preparedAt,
      sourceDigest: variableDigest(state.variables),
      credentials: configurationSummary(state),
      previews,
      productionDeployId: state.site.published_deploy?.id,
      productionCredentialsWillBeRotated: false,
      productionDeploymentsWillBeDeleted: false,
      cloudBuildsWillBeStopped: true,
      cloudBuildsPreviouslyStopped: state.site.build_settings.stop_builds === true,
      recoveryScope:
        'Preserve production values. Never reinstate administrative credentials in non-production contexts.',
    };
    stage = 'encrypted-recovery';
    const envelope = await encryptBackupStream(
      Readable.from([
        JSON.stringify({
          ...identity,
          preparedAt,
          variables: state.variables,
          shared: state.shared,
          siteConfiguration: state.site,
        }),
      ]),
      directory + '/configuration.enc',
      process.env.SAFEBUS_BACKUP_PUBLIC_KEY,
    );
    await write('plan', plan);
    await write('recovery', {
      ...identity,
      preparedAt,
      planDigest: digest(JSON.stringify(plan)),
      envelope,
    });
  } else if (action === 'install') {
    stage = 'verify-recovery';
    const plan = await json('plan'),
      recovery = await json('recovery');
    const age = Date.now() - Date.parse(recovery.preparedAt);
    if (
      Object.entries(identity).some(([k, v]) => recovery[k] !== v || plan[k] !== v) ||
      !(age >= 0 && age < 3600000) ||
      digest(JSON.stringify(plan)) !== recovery.planDigest ||
      recovery.envelope.ciphertextSha256 !== (await fileDigest(directory + '/configuration.enc'))
    )
      throw new Error('CREDENTIAL_ISOLATION_RECOVERY');
    const state = await readConfiguration(api, policy);
    if (
      variableDigest(state.variables) !== plan.sourceDigest ||
      state.site.published_deploy?.id !== plan.productionDeployId
    )
      throw new Error('CREDENTIAL_ISOLATION_PLAN_DRIFT');
    stage = 'stop-cloud-builds';
    state.site = await stopCloudBuilds(api, policy, state.site);
    await journal({ cloudBuildsStopped: true, existingProductionDeployPreserved: true });
    stage = 'isolate';
    await isolateCredentials(api, policy, state, journal);
    const isolatedAt = new Date().toISOString();
    stage = 'retire-secret-bearing-previews';
    const current = await readConfiguration(api, policy);
    const candidates = previewCandidates(
      await inventoryDeploys(api, policy),
      current.site,
      policy,
      isolatedAt,
    );
    await write('retirements', { ...identity, isolatedAt, candidates });
    await retirePreviews(api, policy, candidates, journal);
    await write('installation', {
      ...identity,
      isolatedAt,
      credentials: configurationSummary(current),
      deletionRequests: candidates.length,
      productionDeployId: current.site.published_deploy?.id,
      productionCredentialsRotated: false,
      productionDeploymentsDeleted: 0,
      notificationSent: false,
      databaseWritesPerformed: false,
    });
  } else {
    stage = 'verify-isolation';
    const state = await readConfiguration(api, policy);
    if (
      state.site.build_settings.stop_builds !== true ||
      state.credentials.some((v) => !isIsolated(v))
    )
      throw new Error('CREDENTIAL_ISOLATION_CONFIGURATION_NOT_ISOLATED');
    const retirements = await json('retirements');
    if (Object.entries(identity).some(([k, v]) => retirements[k] !== v))
      throw new Error('CREDENTIAL_ISOLATION_RETIREMENT_CONTEXT');
    let result;
    for (let attempt = 0; attempt < 12; attempt++) {
      result = await verifyPreviewRetirement(api, retirements.candidates);
      if (!result.pending) break;
      if (attempt < 11) await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    if (result.pending) throw new Error('CREDENTIAL_ISOLATION_PREVIEW_DELETION_PENDING');
    const residual = previewCandidates(
      await inventoryDeploys(api, policy),
      state.site,
      policy,
      retirements.isolatedAt,
    );
    if (residual.length) throw new Error('CREDENTIAL_ISOLATION_PREVIEW_INVENTORY_REMAINS');
    const published = await api('/deploys/' + state.site.published_deploy.id);
    if (
      published.site_id !== policy.siteId ||
      published.context !== 'production' ||
      published.state !== 'ready'
    )
      throw new Error('CREDENTIAL_ISOLATION_PRODUCTION_DEPLOY');
    await write('verification', {
      ...identity,
      verifiedAt: new Date().toISOString(),
      credentials: configurationSummary(state),
      previews: result,
      productionDeployId: published.id,
      productionSourceSha: published.commit_ref,
      productionApplicationRebuilt: false,
      cloudBuildsDisabledVerified: true,
      providerScopesPreserved: true,
      functionOnlyScopesClaimed: false,
      sourceEventDeliveryVerified: false,
      commercialLaunchApproved: false,
      databaseWritesPerformed: false,
      notificationSent: false,
    });
  }
  console.log(
    JSON.stringify({
      result: 'passed',
      action,
      productionCredentialIsolationVerified: action === 'verify',
      commercialLaunchApproved: false,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      result: 'failed',
      stage,
      code: /^CREDENTIAL_ISOLATION_[A-Z0-9_]+$/.test(error?.message ?? '')
        ? error.message
        : 'CREDENTIAL_ISOLATION_FAILED',
    }),
  );
  process.exitCode = 1;
}
