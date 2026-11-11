import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  REQUIRED_CHECKS,
  verifyChecks,
  collectCheckRuns,
  artifactManifest,
  verifyHostedArtifact,
  publishEngineeringArtifact,
  requirePrelaunchMaintenance,
} from '../../scripts/lib/engineering-artifact-release.mjs';
import { digest } from '../../scripts/lib/production-credential-isolation.mjs';
import { verifyPublicFrontendConfiguration } from '../../scripts/lib/public-build-environment.mjs';
const policy = JSON.parse(
  await fs.readFile('config/pending/production-credential-isolation.json', 'utf8'),
);
const previous = 'a'.repeat(24),
  candidate = 'b'.repeat(24),
  sha = 'c'.repeat(40),
  manifest = { 'index.html': digest('synthetic-html') };
test('frontend builds reject privileged keys, other projects and invalid public gateway credentials', async () => {
  const jwt = (role) =>
    'synthetic.' +
    Buffer.from(JSON.stringify({ role, ref: 'ckrkfylsyihwouvesypm' })).toString('base64url') +
    '.synthetic';
  const env = {
    VITE_SUPABASE_URL: 'https://ckrkfylsyihwouvesypm.supabase.co',
    VITE_SUPABASE_ANON_KEY: jwt('anon'),
  };
  assert.equal(
    (await verifyPublicFrontendConfiguration(env, async () => new Response('{}')))
      .publicKeyAccepted,
    true,
  );
  await assert.rejects(
    verifyPublicFrontendConfiguration({ ...env, VITE_SUPABASE_ANON_KEY: jwt('service_role') }),
    /KEY_NOT_PUBLIC/,
  );
  await assert.rejects(
    verifyPublicFrontendConfiguration({ ...env, VITE_SUPABASE_URL: 'https://other.invalid' }),
    /TARGET/,
  );
  await assert.rejects(
    verifyPublicFrontendConfiguration(env, async () => new Response('{}', { status: 401 })),
    /KEY_UNVERIFIED/,
  );
});
function fixture() {
  const data = {
    site: {
      id: policy.siteId,
      account_id: policy.accountId,
      name: policy.siteName,
      build_settings: {
        repo_url: 'https://github.com/' + policy.repository,
        repo_branch: 'main',
        stop_builds: true,
      },
      published_deploy: { id: previous, state: 'ready', context: 'production' },
    },
    records: [],
    restores: [],
  };
  const variables = policy.requiredKeys.map((key, i) => ({
    key,
    scopes: ['builds', 'functions', 'runtime'],
    is_secret: true,
    values: [{ id: 'production-' + i, context: 'production', value: '[REDACTED]' }],
  }));
  const api = async (url, options = {}) => {
    if (url === '/sites/' + policy.siteId) return structuredClone(data.site);
    if (url === '/accounts/' + policy.accountId + '/env?site_id=' + policy.siteId)
      return structuredClone(variables);
    if (url === '/accounts/' + policy.accountId + '/env') return [];
    if (url.includes('/dev_servers?')) return [];
    if (url === '/deploys/' + candidate)
      return { id: candidate, site_id: policy.siteId, context: 'production', state: 'ready' };
    if (url.endsWith('/' + previous + '/restore') && options.method === 'POST') {
      data.restores.push(previous);
      data.site.published_deploy.id = previous;
      return {};
    }
    throw Error('Unexpected synthetic control request');
  };
  const params = {
    api,
    policy,
    sha,
    manifest,
    record: async (name, value) => data.records.push({ name, ...value }),
    upload: async () => {
      assert.equal(data.records[0].name, 'previous');
      data.site.published_deploy.id = candidate;
      return { site_id: policy.siteId, deploy_id: candidate };
    },
    localManifest: async () => manifest,
    verifyHosted: async () => ({ publicFilesVerified: 1 }),
    health: async () => ({ result: 'healthy' }),
  };
  return { data, params };
}
test('release requires successful exact-commit CI and rejects stale, skipped or newly failed checks', () => {
  requirePrelaunchMaintenance({ commercialLaunchApproved: false });
  assert.throws(
    () => requirePrelaunchMaintenance({ commercialLaunchApproved: true }),
    /PRELAUNCH_ONLY/,
  );
  assert.throws(() => requirePrelaunchMaintenance({}), /PRELAUNCH_ONLY/);
  const runs = REQUIRED_CHECKS.map((name, i) => ({
    name,
    id: i + 1,
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
    app: { id: 15368, slug: 'github-actions' },
  }));
  verifyChecks(runs, sha);
  for (const change of [
    { head_sha: 'd'.repeat(40) },
    { conclusion: 'skipped' },
    { status: 'in_progress' },
  ])
    assert.throws(
      () => verifyChecks([{ ...runs[0], ...change }, ...runs.slice(1)], sha),
      /CI_NOT_SUCCESSFUL/,
    );
  assert.throws(
    () => verifyChecks([...runs, { ...runs[0], id: 999, conclusion: 'failure' }], sha),
    /CI_NOT_SUCCESSFUL/,
  );
});
test('observed merged-main CI passes without the PR-only CodeQL summary, while the analysis remains mandatory', async () => {
  const runs = JSON.parse(
    await fs.readFile('tests/release/fixtures/engineering-ci-main-20261110.json', 'utf8'),
  );
  const sourceSha = runs[0].head_sha;
  assert.equal(runs.length, 8);
  assert.equal(
    runs.some((r) => r.name === 'CodeQL'),
    false,
  );
  assert.ok(runs.some((r) => r.name === 'CodeQL JavaScript and TypeScript'));
  verifyChecks(runs, sourceSha);
  // A failed deployment of the same commit is not a failed CI/security check.
  verifyChecks(
    [...runs, { ...runs[0], name: 'release', id: 999999999999, conclusion: 'failure' }],
    sourceSha,
  );
  assert.throws(
    () =>
      verifyChecks(
        runs.filter((r) => r.name !== 'CodeQL JavaScript and TypeScript'),
        sourceSha,
      ),
    (error) => {
      assert.equal(error.message, 'ENGINEERING_RELEASE_CI_NOT_SUCCESSFUL');
      assert.deepEqual(error.checks, [
        { name: 'CodeQL JavaScript and TypeScript', reason: 'missing' },
      ]);
      return true;
    },
  );
});
test('present CodeQL summaries must pass on the exact SHA and cannot replace the analysis job', async () => {
  const runs = JSON.parse(
    await fs.readFile('tests/release/fixtures/engineering-ci-main-20261110.json', 'utf8'),
  );
  const sourceSha = runs[0].head_sha;
  const summary = {
    ...runs[0],
    name: 'CodeQL',
    id: 999999999999,
    app: { id: 57789, slug: 'github-advanced-security' },
  };
  verifyChecks([...runs, summary], sourceSha);
  for (const change of [
    { conclusion: 'failure' },
    { conclusion: 'skipped' },
    { conclusion: 'cancelled' },
    { status: 'in_progress', conclusion: null },
    { app: { id: 42, slug: 'untrusted' } },
  ]) {
    assert.throws(
      () => verifyChecks([...runs, { ...summary, ...change }], sourceSha),
      /CI_NOT_SUCCESSFUL/,
    );
  }
  assert.throws(
    () =>
      verifyChecks(
        [...runs.filter((r) => r.name !== 'CodeQL JavaScript and TypeScript'), summary],
        sourceSha,
      ),
    /CI_NOT_SUCCESSFUL/,
  );
  verifyChecks(
    [...runs, { ...summary, head_sha: 'f'.repeat(40), conclusion: 'failure' }],
    sourceSha,
  );
  assert.throws(
    () =>
      verifyChecks(
        [...runs, summary, { ...summary, id: summary.id + 1, conclusion: 'failure' }],
        sourceSha,
      ),
    /CI_NOT_SUCCESSFUL/,
  );
  verifyChecks([...runs, { ...summary, id: 1, conclusion: 'failure' }, summary], sourceSha);
});
test('required checks reject spoofed app identity and report fixed missing/failure reasons', async () => {
  const runs = JSON.parse(
    await fs.readFile('tests/release/fixtures/engineering-ci-main-20261110.json', 'utf8'),
  );
  const sourceSha = runs[0].head_sha;
  for (const app of [
    undefined,
    { id: 42, slug: 'github-actions' },
    { id: 15368, slug: 'untrusted' },
  ]) {
    assert.throws(
      () => verifyChecks([{ ...runs[0], app }, ...runs.slice(1)], sourceSha),
      (error) => {
        assert.deepEqual(error.checks, [{ name: runs[0].name, reason: 'untrusted_source' }]);
        return true;
      },
    );
  }
  const changed = runs.map((r) =>
    r.name === 'Browser smoke tests'
      ? { ...r, status: 'in_progress', conclusion: null }
      : r.name === 'Unit tests'
        ? { ...r, conclusion: 'failure' }
        : r,
  );
  assert.throws(
    () => verifyChecks(changed, sourceSha),
    (error) => {
      assert.deepEqual(error.checks, [
        { name: 'Unit tests', reason: 'not_successful' },
        { name: 'Browser smoke tests', reason: 'incomplete' },
      ]);
      return true;
    },
  );
});
test('publisher records rollback before upload and verifies the actual published artifact rather than its display title', async () => {
  const { data, params } = fixture();
  assert.deepEqual(await publishEngineeringArtifact(params), { deployId: candidate });
  assert.equal(data.records.at(-1).name, 'verified');
  assert.equal(data.records.at(-1).commercialLaunchApproved, false);
  assert.equal(data.restores.length, 0);
});
test('cloud-build or operator-freeze drift prevents upload', async () => {
  for (const mode of ['builds', 'lock']) {
    const { data, params } = fixture();
    if (mode === 'builds') data.site.build_settings.stop_builds = false;
    else data.site.published_deploy.locked = true;
    let uploads = 0;
    params.upload = async () => {
      uploads++;
      return {};
    };
    await assert.rejects(
      publishEngineeringArtifact(params),
      /DELIVERY_CONTROLS_NOT_ACTIVE|OPERATOR_PUBLISH_FREEZE/,
    );
    assert.equal(uploads, 0);
  }
});
test('artifact mismatch or post-release health failure restores and verifies the previous production deployment', async () => {
  for (const failure of ['bytes', 'health', 'local']) {
    const { data, params } = fixture();
    if (failure === 'bytes')
      params.verifyHosted = async () => {
        throw Error('ENGINEERING_RELEASE_HOSTED_ARTIFACT_MISMATCH');
      };
    if (failure === 'health')
      params.health = async () => {
        throw Error('synthetic public-health failure');
      };
    if (failure === 'local') params.localManifest = async () => ({ 'index.html': 'changed' });
    await assert.rejects(publishEngineeringArtifact(params));
    assert.deepEqual(data.restores, [previous]);
    assert.equal(data.site.published_deploy.id, previous);
    assert.equal(data.records.at(-1).name, 'rollback');
  }
});
test('a lost upload receipt or concurrent operator publish is not overwritten by a guessed rollback', async () => {
  const lost = fixture();
  lost.params.upload = async () => {
    lost.data.site.published_deploy.id = candidate;
    throw Error('unknown upload outcome');
  };
  await assert.rejects(publishEngineeringArtifact(lost.params));
  assert.equal(lost.data.restores.length, 0);
  const concurrent = fixture();
  concurrent.params.health = async () => {
    concurrent.data.site.published_deploy.id = 'd'.repeat(24);
    throw Error('synthetic');
  };
  await assert.rejects(publishEngineeringArtifact(concurrent.params));
  assert.equal(concurrent.data.restores.length, 0);
});
test('hosted file verification compares immutable deployment bytes and rejects a mismatching artifact', async () => {
  const ok = await verifyHostedArtifact(candidate, policy, manifest, async (url) => {
    assert.equal(new URL(url).hostname, candidate + '--bussafe.netlify.app');
    return new Response('synthetic-html');
  });
  assert.equal(ok.publicFilesVerified, 1);
  await assert.rejects(
    verifyHostedArtifact(candidate, policy, manifest, async () => new Response('wrong artifact')),
    /HOSTED_ARTIFACT_MISMATCH/,
  );
});
test('artifact manifests bind file content and reject public source maps', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'safebus-artifact-test-'));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith('safebus-artifact-test-'));
    await fs.rm(dir, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(dir, 'index.html'), 'synthetic-html');
  assert.deepEqual(await artifactManifest(dir), manifest);
  await fs.writeFile(path.join(dir, 'source.map'), 'synthetic-map');
  await assert.rejects(artifactManifest(dir), /SOURCE_MAP/);
});

test('check collection follows later pages before verifying CI, with fixed evidence bounds', () => {
  const fullPage = Array.from({ length: 100 }, (_, id) => ({ id, name: 'unrelated' }));
  const calls = [];
  const runs = collectCheckRuns((page) => {
    calls.push(page);
    return { check_runs: page === 1 ? fullPage : [{ name: 'later-page-check' }] };
  });
  assert.deepEqual(calls, [1, 2]);
  assert.equal(runs.at(-1).name, 'later-page-check');
  assert.equal(runs.length, 101);
  assert.throws(() => collectCheckRuns(() => ({})), /CI_EVIDENCE_INVALID/);
  assert.throws(
    () => collectCheckRuns(() => ({ check_runs: [...fullPage, {}] })),
    /CI_EVIDENCE_INVALID/,
  );
  let attempts = 0;
  assert.throws(
    () =>
      collectCheckRuns(() => {
        attempts++;
        return { check_runs: fullPage };
      }),
    /CI_EVIDENCE_PAGE_LIMIT/,
  );
  assert.equal(attempts, 10);
});

test('frontend publisher builds only the web artifact and enforces clean tracked inputs', async () => {
  const workflow = await fs.readFile('.github/workflows/release-engineering-artifact.yml', 'utf8');
  const build = workflow.slice(workflow.indexOf('      - name: Build artifact'),
    workflow.indexOf('      - name: Prepare exact artifact'));
  assert.match(build, /pnpm --filter @safebus\/web build/);
  assert.doesNotMatch(build, /pnpm build|@safebus\/mobile|cap:sync/);
  assert.match(build, /git diff --exit-code/);
  assert.match(build, /git diff --cached --exit-code/);
  const publisher = await fs.readFile('scripts/release-engineering-artifact.mjs', 'utf8');
  assert.match(publisher, /ENGINEERING_RELEASE_CHECKOUT_NOT_REVIEWED/);
  assert.match(publisher, /'--prod',\s*'--no-build'/);
  assert.doesNotMatch(publisher, /'--context'/);
  assert.ok(publisher.indexOf('assertReviewedCheckout(sha)') < publisher.indexOf('netlifyApi(process.env'));
});
