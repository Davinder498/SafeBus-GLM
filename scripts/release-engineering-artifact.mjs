import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { assertReviewedCheckout } from './lib/security-workflow-evidence.mjs';
import { hashDirectory } from './lib/release-attestation.mjs';
import { netlifyApi, digest } from './lib/production-credential-isolation.mjs';
import {
  artifactManifest,
  deliveryState,
  verifyChecks,
  collectCheckRuns,
  verifyHostedArtifact,
  publishEngineeringArtifact,
  requirePrelaunchMaintenance,
} from './lib/engineering-artifact-release.mjs';
import { runProductionHealth } from './lib/production-health.mjs';

const action = process.argv[2],
  sha = process.env.SAFEBUS_RELEASE_SHA;
const directory = '.safebus-release/engineering-artifact';
let stage = 'context';
let uploadDiagnostic;
try {
  stage = 'reviewed-checkout';
  try {
    assertReviewedCheckout(sha);
  } catch {
    throw Error('ENGINEERING_RELEASE_CHECKOUT_NOT_REVIEWED');
  }
  const closure = JSON.parse(await fs.readFile('config/commercial-launch-closure.json', 'utf8'));
  // Owner-authorized repairs on the sole prelaunch production project. This
  // maintenance route closes when commercial scope is approved; normal release
  // privacy, legal, operations and pilot gates remain unchanged.
  requirePrelaunchMaintenance(closure.scope);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_DEPLOY_ENV !== 'production' ||
    process.env.GITHUB_WORKFLOW !== 'Release reviewed engineering fixes' ||
    !/^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ID ?? '') ||
    !/^[1-9][0-9]*$/.test(process.env.GITHUB_RUN_ATTEMPT ?? '') ||
    process.env.SAFEBUS_ENGINEERING_CONFIRM !== 'RELEASE_REVIEWED_ENGINEERING_FIX' ||
    !['checks', 'prepare', 'publish'].includes(action)
  )
    throw Error('ENGINEERING_RELEASE_CONTEXT');
  stage = 'main-binding';
  const main = execFileSync('git', ['ls-remote', 'origin', 'refs/heads/main'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .trim()
    .split(/\s+/)[0];
  if (main !== sha) throw Error('ENGINEERING_RELEASE_MAIN_MOVED');
  if (action === 'checks') {
    stage = 'checks';
    const runs = collectCheckRuns((page) =>
      JSON.parse(
        execFileSync(
          'gh',
          [
            'api',
            `repos/Davinder498/SafeBus-GLM/commits/${sha}/check-runs?per_page=100&filter=latest&page=${page}`,
          ],
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
        ),
      ),
    );
    verifyChecks(runs, sha);
  } else {
    const policy = JSON.parse(
      await fs.readFile('config/pending/production-credential-isolation.json', 'utf8'),
    );
    if (
      policy.siteId !== 'cfb88c3a-8cde-4c2a-ba1b-be4d0e0fc373' ||
      policy.accountId !== '687378def6490474add0e050'
    )
      throw Error('ENGINEERING_RELEASE_TARGET');
    const identity = {
      sha,
      runId: process.env.GITHUB_RUN_ID,
      attempt: process.env.GITHUB_RUN_ATTEMPT,
      siteId: policy.siteId,
    };
    stage = 'artifact-inputs';
    const api = netlifyApi(process.env.NETLIFY_AUTH_TOKEN);
    const manifest = await artifactManifest('apps/web/dist');
    if (!manifest['index.html']) throw Error('ENGINEERING_RELEASE_NO_ARTIFACT');
    const functionsSourceDigest = await hashDirectory('apps/web/netlify/functions');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const write = (name, value) =>
      fs.writeFile(
        directory + '/' + name + '.json',
        JSON.stringify({ ...identity, ...value }, null, 2) + '\n',
        { flag: 'wx', mode: 0o600 },
      );
    if (action === 'prepare') {
      stage = 'prepare-rollback';
      const state = await deliveryState(api, policy);
      await write('plan', {
        createdAt: new Date().toISOString(),
        previousDeployId: state.site.published_deploy.id,
        manifest,
        functionsSourceDigest,
        artifactDigest: digest(JSON.stringify(manifest)),
        commercialLaunchApproved: false,
        databaseWritesPerformed: false,
      });
    } else {
      stage = 'verify-plan';
      const plan = JSON.parse(await fs.readFile(directory + '/plan.json', 'utf8'));
      const age = Date.now() - Date.parse(plan.createdAt);
      if (
        Object.entries(identity).some(([k, v]) => plan[k] !== v) ||
        !(age >= 0 && age < 3600000) ||
        plan.functionsSourceDigest !== functionsSourceDigest ||
        JSON.stringify(plan.manifest) !== JSON.stringify(manifest)
      )
        throw Error('ENGINEERING_RELEASE_PLAN_DRIFT');
      const state = await deliveryState(api, policy);
      if (state.site.published_deploy.id !== plan.previousDeployId)
        throw Error('ENGINEERING_RELEASE_PREVIOUS_CHANGED');
      stage = 'publish';
      await publishEngineeringArtifact({
        api,
        policy,
        sha,
        manifest,
        record: write,
        localManifest: () => artifactManifest('apps/web/dist'),
        verifyHosted: (id, files) => verifyHostedArtifact(id, policy, files),
        health: () =>
          runProductionHealth({ origin: 'https://safebus.kids', retries: 1, timeoutMs: 8000 }),
        upload: async () => {
          // Never build in this credential-bearing process or enable Netlify builds.
          // --prod selects the deployed functions' runtime context. CLI 27 rejects
          // --context together with --no-build because that flag applies to builds.
          try {
            return JSON.parse(
              execFileSync(
                process.execPath,
                [
                  'node_modules/netlify-cli/bin/run.js',
                  'deploy',
                  '--prod',
                  '--no-build',
                  '--site',
                  policy.siteId,
                  '--filter',
                  '@safebus/web',
                  '--dir',
                  'apps/web/dist',
                  '--message',
                  'Reviewed engineering fix ' + sha,
                  '--json',
                ],
                {
                  encoding: 'utf8',
                  stdio: ['ignore', 'pipe', 'pipe'],
                  timeout: 900000,
                  maxBuffer: 8000000,
                },
              ),
            );
          } catch (error) {
            // Process output can contain environment values. Report fixed fields only.
            uploadDiagnostic = {
              phase: error instanceof SyntaxError ? 'response_json' : 'cli_execution',
              exitStatus: Number.isInteger(error?.status) && error.status >= 0 && error.status <= 255
                ? error.status : null,
              timedOut: error?.code === 'ETIMEDOUT',
            };
            throw Error('ENGINEERING_RELEASE_UPLOAD_REQUIRES_INSPECTION');
          }
        },
      });
    }
  }
  console.log(JSON.stringify({ result: 'passed', action, commercialLaunchApproved: false }));
} catch (error) {
  console.error(
    JSON.stringify({
      result: 'failed',
      stage,
      code: /^ENGINEERING_RELEASE_[A-Z_]+$/.test(error?.message ?? '')
        ? error.message
        : 'ENGINEERING_RELEASE_FAILED',
      ...(uploadDiagnostic ? { upload: uploadDiagnostic } : {}),
      ...(error?.message === 'ENGINEERING_RELEASE_CI_NOT_SUCCESSFUL'
        ? { checks: error.checks }
        : {}),
    }),
  );
  process.exitCode = 1;
}
