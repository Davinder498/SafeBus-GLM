import { createHash } from 'node:crypto';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
const fail = (code) => {
  throw new Error('CREDENTIAL_ISOLATION_' + code);
};
const sorted = (values) => [...values].sort();
const sensitive = (key) =>
  /SECRET|SERVICE_ROLE|ARCHIVE_KEYS|EMAIL_PROVIDER_API_KEY|MONITOR_GITHUB_TOKEN|RESEND_API_KEY/.test(
    key,
  );
export const readable = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  !/redact|hidden|masked|\*{4}|^\[.*secret.*\]$/i.test(value);
export function assertSite(site, policy) {
  if (
    site.id !== policy.siteId ||
    site.account_id !== policy.accountId ||
    site.name !== policy.siteName ||
    site.build_settings?.repo_url !== 'https://github.com/' + policy.repository ||
    site.build_settings?.repo_branch !== 'main' ||
    !/^[a-f0-9]{24}$/.test(site.published_deploy?.id ?? '') ||
    site.published_deploy?.state !== 'ready' ||
    site.published_deploy?.context !== 'production'
  )
    fail('TARGET');
}
export function isIsolated(variable) {
  return (
    variable.values.length === 1 &&
    variable.values[0].context === 'production' &&
    !variable.values[0].context_parameter
  );
}
function productionEntry(variable) {
  const explicit = variable.values.filter((v) => v.context === 'production');
  const fallback = variable.values.filter((v) => v.context === 'all');
  if (explicit.length > 1 || fallback.length > 1) fail('AMBIGUOUS_PRODUCTION_VALUE');
  const selected = explicit[0] ?? fallback[0];
  if (!selected) fail('PRODUCTION_VALUE_UNREADABLE');
  const reference =
    selected.context === 'production' && /^[a-zA-Z0-9-]{1,100}$/.test(selected.id ?? '');
  if (!readable(selected.value) && !(reference && variable.is_secret === true))
    fail('PRODUCTION_VALUE_UNREADABLE');
  return selected;
}
export function credentialVariables(variables, shared, policy) {
  const allowed = new Set([...policy.requiredKeys, ...policy.optionalKeys]);
  if (shared.some((v) => sensitive(v.key) || allowed.has(v.key))) fail('INHERITED_CREDENTIAL');
  if (variables.some((v) => sensitive(v.key) && !allowed.has(v.key))) fail('UNREVIEWED_CREDENTIAL');
  if (new Set(variables.map((v) => v.key)).size !== variables.length) fail('DUPLICATE_VARIABLE');
  for (const key of policy.requiredKeys)
    if (!variables.some((v) => v.key === key)) fail('MISSING_CREDENTIAL');
  const selected = variables
    .filter((v) => allowed.has(v.key))
    .sort((a, b) => a.key.localeCompare(b.key));
  for (const variable of selected) if (!isIsolated(variable)) productionEntry(variable);
  return selected;
}
export function variableDigest(variables) {
  return digest(
    JSON.stringify(
      variables
        .map((v) => ({
          key: v.key,
          scopes: sorted(v.scopes),
          is_secret: v.is_secret,
          values: v.values
            .map((x) => ({
              id: x.id,
              context: x.context,
              context_parameter: x.context_parameter ?? null,
              value: x.value ?? null,
            }))
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    ),
  );
}
export function previewCandidates(deploys, site, policy, cutoff) {
  if (
    deploys.some(
      (d) =>
        ['deploy-preview', 'branch-deploy'].includes(d.context) &&
        !Number.isFinite(Date.parse(d.created_at)),
    )
  )
    fail('PREVIEW_DATE');
  const candidates = deploys.filter(
    (d) =>
      ['deploy-preview', 'branch-deploy'].includes(d.context) &&
      Date.parse(d.created_at) <= Date.parse(cutoff),
  );
  if (candidates.length > policy.maxPreviewRetirements) fail('PREVIEW_BOUND');
  for (const d of candidates) {
    if (
      !/^[a-f0-9]{24}$/.test(d.id ?? '') ||
      d.site_id !== policy.siteId ||
      d.id === site.published_deploy?.id ||
      d.locked === true ||
      d.published_at != null
    )
      fail('PREVIEW_PRODUCTION_BOUNDARY');
  }
  return candidates.map((d) => ({
    id: d.id,
    context: d.context,
    createdAt: d.created_at,
    sourceSha: d.commit_ref ?? null,
  }));
}
export async function inventoryDeploys(api, policy) {
  const found = [],
    ids = new Set();
  for (let page = 1; page <= Math.ceil(policy.maxDeployInventory / 100); page++) {
    const rows = await api(`/sites/${policy.siteId}/deploys?page=${page}&per_page=100`);
    if (!Array.isArray(rows)) fail('INVENTORY_RESPONSE');
    for (const d of rows) {
      if (ids.has(d.id)) fail('INVENTORY_CHANGED');
      ids.add(d.id);
      found.push(d);
    }
    if (found.length > policy.maxDeployInventory) fail('INVENTORY_BOUND');
    if (rows.length < 100) return found;
  }
  fail('INVENTORY_BOUND');
}
export async function readConfiguration(api, policy) {
  const site = await api('/sites/' + policy.siteId);
  assertSite(site, policy);
  const variables = await api(`/accounts/${policy.accountId}/env?site_id=${policy.siteId}`);
  const shared = await api(`/accounts/${policy.accountId}/env`);
  const devServers = await api(`/sites/${policy.siteId}/dev_servers?per_page=100&page=1`);
  if (!Array.isArray(devServers) || devServers.length) fail('DEV_SERVER_RECONCILIATION_REQUIRED');
  const credentials = credentialVariables(variables, shared, policy);
  return { site, variables, shared, credentials };
}
export function configurationSummary(state) {
  return state.credentials.map((v) => ({
    key: v.key,
    scopes: sorted(v.scopes),
    secret: v.is_secret === true,
    contexts: sorted(v.values.map((x) => x.context)),
    isolated: isIsolated(v),
  }));
}
export async function isolateCredentials(api, policy, original, progress = async () => {}) {
  if (original.site.build_settings.stop_builds !== true) fail('CLOUD_BUILDS_NOT_STOPPED');
  const selected = credentialVariables(original.variables, original.shared, policy);
  for (const variable of selected) {
    if (isIsolated(variable)) continue;
    const base = '/accounts/' + policy.accountId + '/env/' + encodeURIComponent(variable.key);
    const query = '?site_id=' + policy.siteId;
    const fresh = await api(base + query);
    if (variableDigest([fresh]) !== variableDigest([variable])) fail('PLAN_DRIFT');
    const before = productionEntry(variable);
    // The Free-compatible context API leaves existing production records, scopes
    // and secret flags untouched. Only readable all-context fallbacks are copied.
    if (before.context === 'all') {
      await api(base + query, {
        method: 'PATCH',
        body: { context: 'production', value: before.value },
      });
    }
    let current = await api(base + query);
    let production = productionEntry(current);
    const expectedId = before.context === 'production' ? before.id : production.id;
    const checkProduction = (value) => {
      const entry = productionEntry(value);
      if (
        entry.context !== 'production' ||
        !entry.id ||
        entry.id !== expectedId ||
        value.is_secret !== variable.is_secret ||
        JSON.stringify(sorted(value.scopes)) !== JSON.stringify(sorted(variable.scopes)) ||
        (readable(before.value) && readable(entry.value) && entry.value !== before.value)
      )
        fail('VALUE_OR_SCOPE_DRIFT');
      return entry;
    };
    checkProduction(current);
    for (const removed of current.values.filter((v) => v.context !== 'production')) {
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(removed.id ?? '') || removed.id === expectedId)
        fail('CONTEXT_BOUNDARY');
      const observed = await api(base + query);
      checkProduction(observed);
      const stillPresent = observed.values.find((v) => v.id === removed.id);
      if (!stillPresent) continue;
      if (stillPresent.context === 'production') fail('CONTEXT_BOUNDARY');
      await api(base + '/value/' + encodeURIComponent(removed.id) + query, { method: 'DELETE' });
      await progress({
        key: variable.key,
        removedContext: removed.context,
        productionRecordUntouched: true,
      });
    }
    current = await api(base + query);
    production = checkProduction(current);
    if (!isIsolated(current)) fail('CONFIGURATION_NOT_ISOLATED');
    await progress({
      key: variable.key,
      isolated: true,
      productionValueReadBack: readable(production.value) ? 'matched' : 'provider_masked',
      existingProductionRecordPreserved: before.context === 'production',
    });
  }
  const final = await readConfiguration(api, policy);
  if (
    final.site.build_settings.stop_builds !== true ||
    final.credentials.some((v) => !isIsolated(v))
  )
    fail('CONFIGURATION_NOT_ISOLATED');
  return final;
}
export async function stopCloudBuilds(api, policy, original) {
  assertSite(original, policy);
  const before = { ...original.build_settings };
  await api('/sites/' + policy.siteId, {
    method: 'PATCH',
    body: { build_settings: { stop_builds: true } },
  });
  const observed = await api('/sites/' + policy.siteId);
  assertSite(observed, policy);
  if (
    observed.build_settings.stop_builds !== true ||
    observed.published_deploy.id !== original.published_deploy.id
  )
    fail('CLOUD_BUILD_CONTROL_DRIFT');
  for (const key of ['provider', 'repo_url', 'repo_branch', 'cmd', 'dir', 'functions_dir']) {
    if ((observed.build_settings[key] ?? null) !== (before[key] ?? null))
      fail('CLOUD_BUILD_CONTROL_DRIFT');
  }
  return observed;
}
async function mapLimited(candidates, operation) {
  let index = 0,
    stopped = false;
  const output = [];
  const workers = await Promise.allSettled(
    Array.from({ length: Math.min(4, candidates.length) }, async () => {
      while (!stopped && index < candidates.length) {
        const i = index++;
        try {
          output[i] = await operation(candidates[i]);
        } catch (error) {
          stopped = true;
          throw error;
        }
      }
    }),
  );
  const failed = workers.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
  return output;
}
export async function retirePreviews(api, policy, candidates, progress = async () => {}) {
  await mapLimited(candidates, async (candidate) => {
    // Recheck the live boundary immediately before each delete, including concurrent publication.
    const site = await api('/sites/' + policy.siteId);
    assertSite(site, policy);
    const deploy = await api('/deploys/' + candidate.id, { missing: true });
    if (deploy === null) {
      await progress({ id: candidate.id, retired: true });
      return;
    }
    const checked = previewCandidates([deploy], site, policy, new Date().toISOString());
    if (checked.length !== 1 || checked[0].id !== candidate.id) fail('PREVIEW_CHANGED');
    await api(`/sites/${policy.siteId}/deploys/${candidate.id}`, {
      method: 'DELETE',
      missing: true,
    });
    await progress({ id: candidate.id, deletionRequested: true });
  });
}
export async function verifyPreviewRetirement(api, candidates) {
  const results = await mapLimited(candidates, (candidate) =>
    api('/deploys/' + candidate.id, { missing: true }),
  );
  const pending = results.filter((r) => r !== null).length;
  return { candidates: candidates.length, pending, retired: candidates.length - pending };
}
export function netlifyApi(token, request = fetch) {
  if (!token) fail('CREDENTIAL_REQUIRED');
  let nextRequestAt = 0;
  return async (path, { method = 'GET', body, missing = false } = {}) => {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('..')) fail('API_PATH');
    let response;
    for (let attempt = 0; attempt < 3; attempt++) {
      const startAt = Math.max(Date.now(), nextRequestAt);
      nextRequestAt = startAt + 250;
      if (startAt > Date.now())
        await new Promise((resolve) => setTimeout(resolve, startAt - Date.now()));
      try {
        response = await request('https://api.netlify.com/api/v1' + path, {
          method,
          redirect: 'error',
          headers: {
            Authorization: 'Bearer ' + token,
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(20000),
        });
      } catch {
        // An uncertain write is not retried. Progress and recovery remain retained.
        fail('API_UNAVAILABLE');
      }
      if (response.status !== 429 || attempt === 2) break;
      const seconds = Math.min(15, Math.max(1, Number(response.headers.get('retry-after')) || 1));
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    }
    if (missing && [404, 410].includes(response.status)) return null;
    if (!response.ok) fail('HTTP_' + response.status);
    if (response.status === 204) return null;
    try {
      return await response.json();
    } catch {
      fail('API_RESPONSE');
    }
  };
}
