import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  assertSite,
  isIsolated,
  credentialVariables,
  credentialMutation,
  variableDigest,
  previewCandidates,
  inventoryDeploys,
  readConfiguration,
  isolateCredentials,
  retirePreviews,
  verifyPreviewRetirement,
  netlifyApi,
  verifyValueReferenceUpdate,
} from '../../scripts/lib/production-credential-isolation.mjs';

const policy = JSON.parse(
  await fs.readFile('config/pending/production-credential-isolation.json', 'utf8'),
);
const id = (n) => n.toString(16).padStart(24, '0');
const site = {
  id: policy.siteId,
  account_id: policy.accountId,
  name: policy.siteName,
  build_settings: { repo_url: 'https://github.com/' + policy.repository, repo_branch: 'main' },
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
    if (path === '/sites/' + policy.siteId) return structuredClone(data.site);
    if (path === '/accounts/' + policy.accountId + '/env') return structuredClone(data.shared);
    if (path === `/sites/${policy.siteId}/dev_servers?per_page=100&page=1`) return [];
    if (options.method === 'PUT') {
      data.writes.push(structuredClone(options.body));
      const v = structuredClone(options.body);
      const previous = data.variables.find((x) => x.key === v.key);
      if (v.values[0].id && !Object.hasOwn(v.values[0], 'value'))
        v.values[0].value = previous.values.find((x) => x.id === v.values[0].id).value;
      v.values[0].id ??= 'new-production';
      data.variables[data.variables.findIndex((x) => x.key === v.key)] = v;
      return v;
    }
    if (path === `/accounts/${policy.accountId}/env?site_id=${policy.siteId}`)
      return structuredClone(data.variables);
    if (path.startsWith('/deploys/'))
      return structuredClone(data.deployments.get(path.split('/').at(-1)) ?? null);
    if (options.method === 'DELETE') {
      data.writes.push(path);
      data.deployments.delete(path.split('/').at(-1));
      return null;
    }
    throw new Error('Unexpected synthetic API request');
  };
  return { data, api };
}
test('all roles have acceptance and server credentials preserve production bytes without exposing them to builds or previews', async () => {
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
    original = await readConfiguration(api, policy);
  const publicVariable = structuredClone(data.variables.at(-1));
  const result = await isolateCredentials(api, policy, original);
  assert.equal(data.writes.length, policy.requiredKeys.length);
  for (const v of result.credentials) {
    assert.equal(isIsolated(v), true);
    assert.equal(v.values[0].value, v.key + '-synthetic-production');
  }
  assert.deepEqual(data.variables.at(-1), publicVariable);
  await isolateCredentials(api, policy, result);
  assert.equal(data.writes.length, policy.requiredKeys.length, 'Converged isolation is idempotent');
});
test('all-context fallback is promoted to production without changing its value', () => {
  const v = variables()[0];
  v.values = [v.values[0]];
  assert.equal(credentialMutation(v).values[0].value, v.key + '-synthetic-fallback');
});
test('every required value is validated before any write, including masked or absent production values', async () => {
  for (const value of [null, '', '[secret hidden]', '********']) {
    const { data, api } = fixture();
    data.variables[5].values[1].value = value;
    await assert.rejects(
      async () => isolateCredentials(api, policy, { variables: data.variables, shared: [] }),
      /PRODUCTION_VALUE_UNREADABLE/,
    );
    assert.equal(data.writes.length, 0);
  }
  const { data } = fixture();
  data.variables[0].values.push({ context: 'production', value: 'synthetic' });
  assert.throws(() => credentialVariables(data.variables, [], policy), /AMBIGUOUS/);
});
test('masked production credentials are retained by record ID and never sent back as redacted values', () => {
  const v = variables()[0];
  v.is_secret = true;
  v.values[1].value = '[REDACTED]';
  assert.doesNotThrow(() => credentialVariables([v, ...variables().slice(1)], [], policy));
  assert.deepEqual(credentialMutation(v).values, [{ id: v.values[1].id, context: 'production' }]);
  v.values = [{ id: 'fallback', context: 'all', value: '[REDACTED]' }];
  assert.throws(() => credentialMutation(v), /PRODUCTION_VALUE_UNREADABLE/);
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
test('production mutation or scope drift after provider acknowledgement fails verification', async () => {
  const { data, api } = fixture();
  const tampered = async (path, options) => {
    const result = await api(path, options);
    if (options?.method === 'PUT')
      data.variables.find((v) => v.key === options.body.key).values[0].value = 'unexpected-value';
    return result;
  };
  await assert.rejects(
    isolateCredentials(tampered, policy, await readConfiguration(api, policy)),
    /VALUE_OR_SCOPE_DRIFT/,
  );
  assert.equal(data.writes.length, 1);
});
test('provider masking after a successful write is disclosed and does not cause masked values to be copied', async () => {
  const { data, api } = fixture(),
    progress = [];
  const masked = async (path, options) => {
    const result = await api(path, options);
    if (Array.isArray(result)) for (const v of result) if (v.is_secret) v.values[0].value = null;
    return result;
  };
  await isolateCredentials(masked, policy, await readConfiguration(api, policy), async (r) =>
    progress.push(r),
  );
  assert.ok(progress.every((r) => r.productionValueReadBack === 'provider_masked'));
  assert.ok(data.writes.every((r) => !Object.hasOwn(r.values[0], 'value')));
});
test('a live-provider semantics probe must preserve the non-sensitive value by ID and always clean up', async () => {
  for (const preservesValue of [true, false]) {
    let variable = null,
      deleted = false;
    const api = async (_path, options = {}) => {
      if (options.method === 'POST') {
        variable = structuredClone(options.body[0]);
        variable.values[0].id = 'provider-production-id';
        return [variable];
      }
      if (options.method === 'PUT') {
        const before = variable;
        variable = structuredClone(options.body);
        variable.values[0].value = preservesValue ? before.values[0].value : '';
        return variable;
      }
      if (options.method === 'DELETE') {
        variable = null;
        deleted = true;
        return null;
      }
      return structuredClone(variable);
    };
    if (preservesValue)
      assert.equal(
        (await verifyValueReferenceUpdate(api, policy, '12345')).providerValueReferenceVerified,
        true,
      );
    else
      await assert.rejects(
        verifyValueReferenceUpdate(api, policy, '12345'),
        /VALUE_REFERENCE_UNSUPPORTED/,
      );
    assert.equal(deleted, true);
    assert.equal(variable, null);
  }
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
