import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
