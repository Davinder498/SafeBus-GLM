import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  assertSite,
  isIsolated,
  credentialVariables,
  variableDigest,
  previewCandidates,
  inventoryDeploys,
  readConfiguration,
  isolateCredentials,
  retirePreviews,
  verifyPreviewRetirement,
  netlifyApi,
  stopCloudBuilds,
} from '../../scripts/lib/production-credential-isolation.mjs';
import { publicBuildEnvironment } from '../../scripts/lib/public-build-environment.mjs';
const policy = JSON.parse(
  await fs.readFile('config/pending/production-credential-isolation.json', 'utf8'),
);
const id = (n) => n.toString(16).padStart(24, '0');
const site = {
  id: policy.siteId,
  account_id: policy.accountId,
  name: policy.siteName,
  build_settings: {
    repo_url: 'https://github.com/' + policy.repository,
    repo_branch: 'main',
    stop_builds: true,
  },
  published_deploy: { id: id(9999), state: 'ready', context: 'production' },
};
const variables = () => [
  ...policy.requiredKeys.map((key, i) => ({
    key,
    scopes: ['builds', 'functions', 'runtime'],
    is_secret: false,
    values: [
      { id: 'all-' + i, context: 'all', value: key + '-synthetic-fallback' },
      { id: 'production-' + i, context: 'production', value: key + '-synthetic-production' },
      { id: 'preview-' + i, context: 'deploy-preview', value: key + '-synthetic-preview' },
    ],
  })),
  {
    key: 'VITE_SUPABASE_ANON_KEY',
    scopes: ['builds'],
    is_secret: false,
    values: [{ id: 'public', context: 'all', value: 'synthetic-public-key' }],
  },
];
const preview = (n) => ({
  id: id(n),
  site_id: policy.siteId,
  context: 'deploy-preview',
  created_at: '2026-11-01T00:00:00Z',
  published_at: null,
  locked: false,
});
function fixture() {
  const data = {
    site: structuredClone(site),
    variables: variables(),
    shared: [],
    writes: [],
    deployments: new Map(),
  };
  const api = async (path, options = {}) => {
    if (path === '/sites/' + policy.siteId) {
      if (options.method === 'PATCH') {
        data.writes.push({ path, method: 'PATCH', body: structuredClone(options.body) });
        Object.assign(data.site.build_settings, options.body.build_settings);
      }
      return structuredClone(data.site);
    }
    if (path === '/accounts/' + policy.accountId + '/env') return structuredClone(data.shared);
    if (path === '/sites/' + policy.siteId + '/dev_servers?per_page=100&page=1') return [];
    if (path === '/accounts/' + policy.accountId + '/env?site_id=' + policy.siteId)
      return structuredClone(data.variables);
    if (path.startsWith('/accounts/' + policy.accountId + '/env/')) {
      const parts = new URL(path, 'https://synthetic.invalid').pathname.split('/').filter(Boolean),
        key = decodeURIComponent(parts[3]);
      const v = data.variables.find((x) => x.key === key);
      if (options.method === 'PATCH') {
        data.writes.push({ path, key, method: 'PATCH', body: structuredClone(options.body) });
        v.values.push({ id: 'created-production-' + data.variables.indexOf(v), ...options.body });
      }
      if (options.method === 'DELETE') {
        const valueId = decodeURIComponent(parts[5]);
        data.writes.push({ path, key, method: 'DELETE', valueId });
        v.values = v.values.filter((x) => x.id !== valueId);
        return null;
      }
      return structuredClone(v);
    }
    if (path.startsWith('/deploys/'))
      return structuredClone(data.deployments.get(path.split('/').at(-1)) ?? null);
    if (options.method === 'DELETE') {
      data.writes.push(path);
      data.deployments.delete(path.split('/').at(-1));
      return null;
    }
    throw Error('Unexpected synthetic API request');
  };
  return { data, api };
}
test('all roles have acceptance; Free isolation preserves production records, flags and scopes with cloud builds stopped', async () => {
  for (const role of [
    'schoolAuthorityAdmin',
    'schoolScopedAdmin',
    'transportationAdmin',
    'guardian',
    'driver',
    'platformAdmin',
  ])
    assert.ok(policy.acceptance[role]);
  const { data, api } = fixture(),
    before = await readConfiguration(api, policy);
  const publicVariable = structuredClone(data.variables.at(-1));
  const result = await isolateCredentials(api, policy, before);
  for (const v of result.credentials) {
    const original = before.variables.find((x) => x.key === v.key);
    assert.ok(isIsolated(v));
    assert.equal(v.values[0].value, v.key + '-synthetic-production');
    assert.equal(v.values[0].id, original.values[1].id);
    assert.equal(v.is_secret, original.is_secret);
    assert.deepEqual(v.scopes, original.scopes);
  }
  assert.deepEqual(data.variables.at(-1), publicVariable);
  assert.ok(
    data.writes.every((w) => w.method === 'DELETE' && !w.valueId.startsWith('production-')),
  );
  const count = data.writes.length;
  await isolateCredentials(api, policy, result);
  assert.equal(data.writes.length, count);
});
test('a readable all-context fallback is verified in production before the fallback is removed', async () => {
  const { data, api } = fixture();
  data.variables[0].values = data.variables[0].values.filter((v) => v.context !== 'production');
  await isolateCredentials(api, policy, await readConfiguration(api, policy));
  const v = data.variables[0];
  assert.equal(v.values[0].value, v.key + '-synthetic-fallback');
  assert.ok(isIsolated(v));
  const create = data.writes.findIndex((w) => w.key === v.key && w.method === 'PATCH'),
    remove = data.writes.findIndex((w) => w.key === v.key && w.valueId === 'all-0');
  assert.ok(create >= 0 && remove > create);
});
test('every required value is validated before any context write', async () => {
  for (const value of [null, '', '[secret hidden]', '********']) {
    const { data, api } = fixture();
    data.variables[5].values[1].value = value;
    await assert.rejects(
      async () =>
        isolateCredentials(api, policy, { site: data.site, variables: data.variables, shared: [] }),
      /PRODUCTION_VALUE_UNREADABLE/,
    );
    assert.equal(data.writes.length, 0);
  }
  const { data } = fixture();
  data.variables[0].values.push({ context: 'production', value: 'synthetic' });
  assert.throws(() => credentialVariables(data.variables, [], policy), /AMBIGUOUS/);
});
test('opaque production credentials are never copied, replaced, or deleted', async () => {
  const { data, api } = fixture();
  for (const v of data.variables.slice(0, -1)) v.is_secret = true;
  const masked = async (path, options) => {
    const result = await api(path, options);
    const redact = (v) => {
      if (v?.is_secret) for (const x of v.values) x.value = '[REDACTED]';
    };
    if (Array.isArray(result)) result.forEach(redact);
    else redact(result);
    return result;
  };
  const progress = [];
  await isolateCredentials(masked, policy, await readConfiguration(masked, policy), async (r) =>
    progress.push(r),
  );
  assert.ok(
    data.writes.every((w) => w.method === 'DELETE' && !w.valueId.startsWith('production-')),
  );
  assert.ok(
    progress
      .filter((x) => x.isolated)
      .every((x) => x.productionValueReadBack === 'provider_masked'),
  );
  for (const v of data.variables.slice(0, -1))
    assert.equal(v.values[0].value, v.key + '-synthetic-production');
});
test('unknown, inherited, missing and duplicate credentials cannot be silently left exposed', () => {
  assert.throws(
    () => credentialVariables([...variables(), { key: 'NEW_ADMIN_SECRET' }], [], policy),
    /UNREVIEWED/,
  );
  assert.throws(
    () => credentialVariables(variables(), [{ key: 'SUPABASE_SECRET_KEY' }], policy),
    /INHERITED/,
  );
  assert.throws(() => credentialVariables(variables().slice(1), [], policy), /MISSING/);
  assert.throws(
    () => credentialVariables([...variables(), variables()[0]], [], policy),
    /DUPLICATE/,
  );
});
test('unexpected production drift stops further context removals', async () => {
  const { data, api } = fixture();
  const tampered = async (path, options) => {
    const result = await api(path, options);
    if (options?.method === 'DELETE' && path.includes('/value/')) {
      const key = decodeURIComponent(
        new URL(path, 'https://synthetic.invalid').pathname.split('/')[4],
      );
      data.variables
        .find((v) => v.key === key)
        .values.find((v) => v.context === 'production').value = 'changed';
    }
    return result;
  };
  await assert.rejects(
    isolateCredentials(tampered, policy, await readConfiguration(api, policy)),
    /VALUE_OR_SCOPE_DRIFT/,
  );
  assert.equal(data.writes.length, 1);
});
test('Netlify cloud builds must be stopped before credentials are isolated; stopping preserves current deployment and repository', async () => {
  const { data, api } = fixture();
  data.site.build_settings.stop_builds = false;
  await assert.rejects(
    isolateCredentials(api, policy, await readConfiguration(api, policy)),
    /CLOUD_BUILDS_NOT_STOPPED/,
  );
  assert.equal(data.writes.length, 0);
  const result = await stopCloudBuilds(api, policy, structuredClone(data.site));
  assert.ok(result.build_settings.stop_builds);
  assert.equal(result.published_deploy.id, site.published_deploy.id);
  assert.equal(result.build_settings.repo_url, site.build_settings.repo_url);
});
test('public builds receive only the two allowed VITE values and necessary system configuration', () => {
  const result = publicBuildEnvironment({
    PATH: 'synthetic-path',
    CI: 'true',
    VITE_SUPABASE_URL: 'https://example.invalid',
    VITE_SUPABASE_ANON_KEY: 'synthetic-public',
    SUPABASE_SECRET_KEY: 'synthetic-secret',
    NETLIFY_AUTH_TOKEN: 'synthetic-token',
    STRIPE_SECRET_KEY: 'synthetic-stripe',
    SAFEBUS_DATABASE_URL: 'synthetic-db',
    VITE_MAP_TILE_URL: 'unsupported',
  });
  assert.deepEqual(Object.keys(result).sort(), [
    'CI',
    'PATH',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_URL',
  ]);
});
test('snapshot binding detects changed production bytes, contexts and scope while ignoring API property order', () => {
  const a = variables(),
    original = variableDigest(a);
  assert.equal(variableDigest([...a].reverse()), original);
  const b = structuredClone(a);
  b[0].values[1].value += '-changed';
  assert.notEqual(variableDigest(b), original);
  b[0] = structuredClone(a[0]);
  b[0].scopes.push('post-processing');
  assert.notEqual(variableDigest(b), original);
});
test('production, promoted, locked, foreign and malformed deployment IDs are never retired', () => {
  assert.deepEqual(
    previewCandidates([{ ...preview(1), context: 'production' }], site, policy, '2026-11-10'),
    [],
  );
  for (const change of [
    { id: site.published_deploy.id },
    { locked: true },
    { published_at: '2026-11-02' },
    { site_id: 'different-site' },
    { id: '../../production' },
  ])
    assert.throws(
      () => previewCandidates([{ ...preview(1), ...change }], site, policy, '2026-11-10'),
      /PRODUCTION_BOUNDARY/,
    );
  assert.throws(() => assertSite({ ...site, account_id: 'another-account' }, policy), /TARGET/);
});
test('retirement rechecks publication immediately before delete and never deletes a promoted preview', async () => {
  const { data, api } = fixture();
  data.deployments.set(id(1), preview(1));
  data.site.published_deploy.id = id(1);
  await assert.rejects(retirePreviews(api, policy, [{ id: id(1) }]), /PRODUCTION_BOUNDARY/);
  assert.equal(data.writes.length, 0);
});
test('retirement removes only approved unpublished previews and verification waits for provider deletion', async () => {
  const { data, api } = fixture();
  data.deployments.set(id(1), preview(1));
  data.deployments.set(id(2), preview(2));
  const candidates = [{ id: id(1) }, { id: id(2) }];
  assert.equal((await verifyPreviewRetirement(api, candidates)).pending, 2);
  await retirePreviews(api, policy, candidates);
  assert.deepEqual(await verifyPreviewRetirement(api, candidates), {
    candidates: 2,
    pending: 0,
    retired: 2,
  });
  assert.equal(data.writes.length, 2);
});
test('deployment inventory is paginated and refuses overflow or duplicate IDs during a changing listing', async () => {
  const rows = Array.from({ length: 102 }, (_, i) => preview(i + 1));
  const api = async (path) => {
    const page = Number(new URL(path, 'https://synthetic.invalid').searchParams.get('page'));
    return rows.slice((page - 1) * 100, page * 100);
  };
  assert.equal((await inventoryDeploys(api, policy)).length, 102);
  await assert.rejects(
    inventoryDeploys(api, { ...policy, maxDeployInventory: 100 }),
    /INVENTORY_BOUND/,
  );
  await assert.rejects(
    inventoryDeploys(async () => rows.slice(0, 100), policy),
    /INVENTORY_CHANGED/,
  );
});
test('HTTP and network failures cannot leak provider response bodies or authentication tokens', async () => {
  const api = netlifyApi(
    'synthetic-token',
    async () => new Response('sensitive synthetic provider body', { status: 403 }),
  );
  await assert.rejects(api('/sites/known'), (e) => e.message === 'CREDENTIAL_ISOLATION_HTTP_403');
  const unavailable = netlifyApi('synthetic-token', async () => {
    throw new Error('Bearer synthetic-token');
  });
  await assert.rejects(
    unavailable('/sites/known'),
    (e) => e.message === 'CREDENTIAL_ISOLATION_API_UNAVAILABLE',
  );
  await assert.rejects(api('//other-host'), /API_PATH/);
  const missing = netlifyApi('synthetic-token', async () => new Response(null, { status: 404 }));
  assert.equal(await missing('/deploys/known', { missing: true }), null);
});
