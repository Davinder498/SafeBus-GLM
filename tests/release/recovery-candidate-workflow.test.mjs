import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const helper = new URL('../../scripts/lib/security-workflow-evidence.mjs', import.meta.url).href;
const dispatcher =
  'Davinder498/SafeBus-GLM/.github/workflows/run-recovery-candidate.yml@refs/heads/main';

test('the candidate checkout requires the main dispatcher and its exact clean descendant', async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), 'safebus-candidate-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const commit = (message) =>
    git('-c', 'user.name=SafeBus test', '-c', 'user.email=test@example.test',
      '-c', 'commit.gpgsign=false', 'commit', '-m', message);

  git('init', '-q');
  await writeFile(join(cwd, 'tracked'), 'baseline');
  git('add', 'tracked');
  commit('baseline');
  const base = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/main', base);
  await writeFile(join(cwd, 'tracked'), 'candidate');
  git('add', 'tracked');
  commit('candidate');
  const head = git('rev-parse', 'HEAD');

  const run = (sha = head, overrides = {}, method = 'assertRecoveryCapacityCheckout') => () =>
    execFileSync(process.execPath, [
      '--input-type=module', '-e', `import { ${method} } from ${JSON.stringify(helper)}; ${method}(process.argv[1]);`, sha,
    ], {
      cwd,
      stdio: 'pipe',
      env: {
        ...process.env,
        GITHUB_ACTIONS: 'true',
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_WORKFLOW_REF: dispatcher,
        GITHUB_SHA: base,
        SAFEBUS_RECOVERY_CANDIDATE: 'true',
        ...overrides,
      },
    });

  assert.doesNotThrow(run());
  assert.doesNotThrow(run(head, { GITHUB_EVENT_NAME: 'workflow_run' }));
  assert.throws(run('b'.repeat(40)), /not exact and clean/);
  assert.throws(run(head, { GITHUB_SHA: head }), /protected main-branch dispatcher/);
  assert.throws(run(head, { GITHUB_WORKFLOW_REF: dispatcher.replace('candidate', 'capacity') }));
  assert.throws(run(head, { GITHUB_EVENT_NAME: 'pull_request' }));
  assert.throws(run(head, { GITHUB_REF: 'refs/heads/capacity/recovery-candidate' }));
  assert.throws(run(head, { GITHUB_ACTIONS: 'false' }));
  assert.throws(run(head, { GITHUB_SHA: 'a'.repeat(40) }), /merge-base/);
  assert.throws(run(head, { SAFEBUS_RECOVERY_CANDIDATE: '' }), /merge-base/);
  assert.throws(run(head, {}, 'assertReviewedCheckout'), /merge-base/);
  await writeFile(join(cwd, 'tracked'), 'unexpected modification');
  assert.throws(run(), /not exact and clean/);
  git('checkout', '-q', '--detach', base, '--force');
  assert.doesNotThrow(run(base, { SAFEBUS_RECOVERY_CANDIDATE: '' }));
});

test('candidate credentials are restricted to the reviewed Recovery job', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/run-recovery-candidate.yml', import.meta.url), 'utf8',
  );
  const [validation, measurement] = workflow.split('\n  measure:');
  assert.match(validation, /github\.ref == 'refs\/heads\/main'/);
  assert.match(validation, /required_reviewers[\s\S]*prevent_self_review == true/);
  assert.doesNotMatch(validation, /mode == "automatic" or/);
  assert.match(validation, /head_repository\.id == github\.event\.repository\.id/);
  assert.match(validation, /"\$source_actor" == "\$AUTOMATION_ACTOR_ID"/);
  assert.match(validation, /git diff --quiet "\$GITHUB_SHA" "\$CANDIDATE_SHA" -- \.github\/workflows/);
  assert.match(validation, /branch_policies\[0\]\.name == "main"/);
  assert.match(validation, /git rev-parse HEAD\)" = "\$CANDIDATE_SHA"/);
  assert.match(validation, /git merge-base --is-ancestor "\$GITHUB_SHA" "\$CANDIDATE_SHA"/);
  assert.doesNotMatch(validation, /\bsecrets\.|environment:/);
  assert.match(measurement, /environment:\n      name: recovery-capacity/);
  assert.match(measurement, /ref: \$\{\{ needs\.validate-candidate\.outputs\.sha \}\}/);
  const secrets = [...measurement.matchAll(/\bsecrets\.([A-Z0-9_]+)/g)].map(([, name]) => name);
  assert.deepEqual(new Set(secrets), new Set([
    'SAFEBUS_RECOVERY_EXPERIMENT_DATABASE_URL',
    'SAFEBUS_RECOVERY_EXPERIMENT_AUTH_SECRET',
  ]));
  assert.match(measurement, /name: recovery-candidate-/);
});

test('only the configured actor can request an automatic bounded Recovery profile', async (t) => {
  if (['bash', 'jq'].some((tool) => spawnSync(tool, ['--version']).status !== 0)) {
    t.skip('The hosted Ubuntu runner provides Bash and jq.');
    return;
  }
  const workflow = await readFile(
    new URL('../../.github/workflows/run-recovery-candidate.yml', import.meta.url), 'utf8',
  );
  const profileStep = workflow.match(/id: profile\n[\s\S]*?run: \|\n([\s\S]*?)\n {6}- name:/);
  assert.ok(profileStep);
  const command = profileStep[1].split('\n').map((line) => line.slice(10)).join('\n');
  const cwd = await mkdtemp(join(tmpdir(), 'safebus-recovery-request-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const output = join(cwd, 'output');
  const event = join(cwd, 'event.json');
  const metadata = { actor: { id: 123 }, path: '.github/workflows/request-recovery-candidate.yml', run_attempt: 1 };
  const run = async (overrides = {}, eventOverrides = {}) => {
    await writeFile(output, '');
    await writeFile(event, JSON.stringify({ workflow_run: { ...metadata, ...eventOverrides } }));
    execFileSync('bash', ['-e', '-o', 'pipefail', '-c', command], {
      cwd,
      stdio: 'pipe',
      env: {
        ...process.env,
        AUTOMATION_ACTOR_ID: '123',
        CANDIDATE_BRANCH: 'capacity/recovery-diagnostic-run-500',
        CANDIDATE_SHA: 'a'.repeat(40),
        CAPACITY_PROFILE: 'combined-10',
        GITHUB_EVENT_NAME: 'workflow_run',
        GITHUB_EVENT_PATH: event,
        GITHUB_OUTPUT: output,
        GITHUB_RUN_ATTEMPT: '1',
        ...overrides,
      },
    });
    return readFile(output, 'utf8');
  };

  assert.match(await run(), /^buses=500\n[\s\S]*^profile=direct-gps-500$/m);
  assert.match(await run({ CANDIDATE_BRANCH: 'capacity/recovery-diagnostic-run-10' }),
    /^buses=10\n[\s\S]*^profile=combined-10$/m);
  assert.match(await run({ GITHUB_EVENT_NAME: 'workflow_dispatch', AUTOMATION_ACTOR_ID: '' }),
    /^buses=10\n[\s\S]*^profile=combined-10$/m);
  await assert.rejects(run({ AUTOMATION_ACTOR_ID: '' }));
  await assert.rejects(run({}, { actor: { id: 456 } }));
  await assert.rejects(run({}, { path: '.github/workflows/unknown.yml' }));
  await assert.rejects(run({}, { run_attempt: 2 }));
  await assert.rejects(run({ GITHUB_RUN_ATTEMPT: '2' }));
  await assert.rejects(run({ CANDIDATE_BRANCH: 'capacity/recovery-diagnostic-run-5000' }));
});
