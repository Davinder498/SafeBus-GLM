import { isDeepStrictEqual } from 'node:util';
export const CONTROL_KEYS = [
  'SAFEBUS_RETENTION_LIFECYCLE_EXECUTE',
  'SAFEBUS_APPLICATION_MONITOR_MODE',
];
export const CONTROL_TARGET = {
  siteId: 'cfb88c3a-8cde-4c2a-ba1b-be4d0e0fc373',
  accountId: '687378def6490474add0e050',
};
export const fail = (code) => {
  throw new Error('LAUNCH_OPERATIONS_' + code);
};
export function productionValue(variable) {
  if (!variable) return null;
  if (variable.is_secret || !Array.isArray(variable.values)) fail('UNREADABLE_CONTROL');
  const explicit = variable.values.filter((v) => v.context === 'production');
  const fallback = variable.values.filter((v) => v.context === 'all');
  if (explicit.length > 1 || fallback.length > 1) fail('AMBIGUOUS_CONTROL');
  return (explicit[0] ?? fallback[0])?.value ?? null;
}
export async function readControls(api) {
  const { siteId, accountId } = CONTROL_TARGET;
  const site = await api('/sites/' + siteId);
  if (
    site.id !== siteId ||
    site.account_id !== accountId ||
    site.name !== 'bussafe' ||
    site.build_settings?.stop_builds !== true ||
    site.build_settings?.repo_branch !== 'main' ||
    site.build_settings?.repo_url !== 'https://github.com/Davinder498/SafeBus-GLM' ||
    site.published_deploy?.state !== 'ready' ||
    site.published_deploy?.context !== 'production'
  )
    fail('TARGET');
  const variables = await api(`/accounts/${accountId}/env?site_id=${siteId}`);
  const shared = await api(`/accounts/${accountId}/env`);
  if (
    !Array.isArray(variables) ||
    !Array.isArray(shared) ||
    shared.some((v) => CONTROL_KEYS.includes(v.key))
  )
    fail('SHARED_CONTROL');
  const selected = variables.filter((v) => CONTROL_KEYS.includes(v.key));
  if (new Set(selected.map((v) => v.key)).size !== selected.length) fail('DUPLICATE_CONTROL');
  const controls = Object.fromEntries(
    CONTROL_KEYS.map((key) => [key, selected.find((v) => v.key === key) ?? null]),
  );
  for (const v of Object.values(controls)) productionValue(v);
  return { deployId: site.published_deploy.id, controls };
}
export function assertInactive(state, control) {
  if (
    control?.destructive_enabled !== false ||
    control.approval_reference !== null ||
    control.approved_at !== null
  )
    fail('DATABASE_BASELINE');
  if (
    ![null, 'false'].includes(productionValue(state.controls[CONTROL_KEYS[0]])) ||
    productionValue(state.controls[CONTROL_KEYS[1]]) !== 'observe'
  )
    fail('HOSTING_BASELINE');
}
export function assertInitialCounts(counts, accountCandidates) {
  const allowed = new Set(['invitations', 'bus_tracking_sessions', 'rate_limit_buckets']);
  if (
    !counts ||
    Object.keys(counts).length !== 23 ||
    accountCandidates !== 0 ||
    Object.entries(counts).some(
      ([key, value]) =>
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > 500 ||
        (!allowed.has(key) && value !== 0),
    )
  )
    fail('INITIAL_DISPOSAL_REVIEW');
}
export async function setProductionControl(api, key, value, before) {
  if (
    !CONTROL_KEYS.includes(key) ||
    !(key === CONTROL_KEYS[0] ? ['true', 'false'] : ['alert', 'observe']).includes(value)
  )
    fail('CONTROL_SCOPE');
  const { accountId, siteId } = CONTROL_TARGET;
  const base = `/accounts/${accountId}/env`,
    query = `?site_id=${siteId}`;
  const original = before.controls[key];
  const current = (await readControls(api)).controls[key];
  if (!isDeepStrictEqual(original, current)) fail('CONTROL_DRIFT');
  if (original)
    await api(base + '/' + key + query, {
      method: 'PATCH',
      body: { context: 'production', value },
    });
  else
    await api(base + query, {
      method: 'POST',
      body: [{ key, values: [{ context: 'production', value }], is_secret: false }],
    });
  const after = await readControls(api),
    updated = after.controls[key];
  if (
    productionValue(updated) !== value ||
    updated?.values.filter((v) => v.context === 'production').length !== 1
  )
    fail('CONTROL_WRITE_UNVERIFIED');
  if (
    original &&
    (!isDeepStrictEqual(
      original.values.filter((v) => v.context !== 'production'),
      updated.values.filter((v) => v.context !== 'production'),
    ) ||
      !isDeepStrictEqual(original.scopes, updated.scopes) ||
      original.is_secret !== updated.is_secret)
  )
    fail('CONTEXT_CHANGED');
  return after;
}

// Guard and mutation share the worker lock so activation cannot race a lifecycle run.
export async function activateDatabaseControl(client, reference) {
  await client.query('begin');
  try {
    await client.query("set local lock_timeout='1s';set local statement_timeout='12s'");
    await client.query('select pg_advisory_xact_lock(864203711)');
    const changed = await client.query(
      `update public.retention_execution_control set destructive_enabled=true,approval_reference=$1,approved_at=now() where id=1 and destructive_enabled=false and approval_reference is null and approved_at is null returning id`,
      [reference],
    );
    if (changed.rowCount !== 1) fail('DATABASE_DRIFT');
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
