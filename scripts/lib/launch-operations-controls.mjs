import { isDeepStrictEqual } from 'node:util';
export const CONTROL_KEYS = [
  'SAFEBUS_RETENTION_LIFECYCLE_EXECUTE',
  'SAFEBUS_APPLICATION_MONITOR_MODE',
];
export const CONTROL_TARGET = {
  siteId: 'cfb88c3a-8cde-4c2a-ba1b-be4d0e0fc373',
  accountId: '687378def6490474add0e050',
};
// Bounded recovery of the inspected, successfully paused first activation.
export const PAUSED_ACTIVATION = {
  reference: 'github:43583376731:d45d5d6ee62d6fd4d58d07cabc563697a2252247',
  approvedAt: '2026-11-14T11:29:37.160448+00:00',
};
const contexts = ['production', 'deploy-preview', 'branch-deploy', 'dev', 'dev-server'];
function values(variable) {
  const entries = variable.values.map(({ context, context_parameter, value, role }) => {
    if (
      (!contexts.includes(context) && !['all', 'branch'].includes(context)) ||
      typeof value !== 'string' ||
      (role != null && role !== '') ||
      (context === 'branch' ? !context_parameter : !!context_parameter)
    )
      fail('AMBIGUOUS_CONTROL');
    return { context, ...(context_parameter ? { context_parameter } : {}), value };
  });
  const key = (v) => `${v.context}:${v.context_parameter ?? ''}`;
  if (new Set(entries.map(key)).size !== entries.length) fail('AMBIGUOUS_CONTROL');
  return entries.sort((a, b) => key(a).localeCompare(key(b)));
}
function sameSettings(a, b) {
  return a === null || b === null
    ? a === b
    : a.key === b.key &&
        a.is_secret === b.is_secret &&
        isDeepStrictEqual([...a.scopes].sort(), [...b.scopes].sort()) &&
        isDeepStrictEqual(values(a), values(b));
}
export function isReviewedPause(control) {
  return (
    control?.destructive_enabled === false &&
    control.approval_reference === PAUSED_ACTIVATION.reference &&
    typeof control.approved_at === 'string' &&
    control.approved_at.replace(' ', 'T').replace(/\+00(?::00)?$/, 'Z') ===
      PAUSED_ACTIVATION.approvedAt.replace('+00:00', 'Z')
  );
}
function assertPausedHosting(state) {
  const monitor = state.controls[CONTROL_KEYS[1]];
  const expected = [
    { context: 'production', value: 'alert' },
    { context: 'deploy-preview', value: 'observe' },
    { context: 'branch-deploy', value: 'observe' },
    { context: 'dev', value: 'observe' },
  ];
  if (
    !monitor ||
    monitor.is_secret ||
    ![expected, [...expected, { context: 'dev-server', value: 'observe' }]].some((entries) =>
      isDeepStrictEqual(values(monitor), values({ values: entries })),
    )
  )
    fail('PAUSED_HOSTING_BASELINE');
}
export const fail = (code) => {
  throw new Error('LAUNCH_OPERATIONS_' + code);
};
// Preserve only known, value-free transport codes. Never log provider bodies,
// request headers, credentials or arbitrary exception messages.
export function launchFailureCode(error) {
  if (/^LAUNCH_OPERATIONS_[A-Z_]+$/.test(error?.message)) return error.message;
  const transport =
    /^CREDENTIAL_ISOLATION_(HTTP_[0-9]{3}|API_UNAVAILABLE|API_RESPONSE|API_PATH|CREDENTIAL_REQUIRED)$/.exec(
      error?.message,
    );
  return transport ? `LAUNCH_OPERATIONS_NETLIFY_${transport[1]}` : 'LAUNCH_OPERATIONS_FAILED';
}
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
export function assertInactive(state, control, executionCount) {
  if (isReviewedPause(control)) {
    if (executionCount !== 0 || productionValue(state.controls[CONTROL_KEYS[0]]) !== 'false')
      fail('PAUSED_DATABASE_BASELINE');
    assertPausedHosting(state);
    return;
  }
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
  if (!sameSettings(original, current)) fail('CONTROL_DRIFT');
  let expectedValues;
  if (original) {
    const previous = values(original),
      fallback = previous.find((v) => v.context === 'all');
    expectedValues = fallback
      ? [
          ...contexts.map((context) => ({
            context,
            value:
              context === 'production'
                ? value
                : (previous.find((v) => v.context === context)?.value ?? fallback.value),
          })),
          ...previous.filter((v) => v.context === 'branch'),
        ]
      : [...previous.filter((v) => v.context !== 'production'), { context: 'production', value }];
    // PATCH expands `all` itself but omits dev-server. Supply the complete set
    // atomically instead; omit scopes so Free-plan scope restrictions do not apply.
    await api(base + '/' + key + query, {
      method: fallback ? 'PUT' : 'PATCH',
      body: fallback ? { values: expectedValues } : { context: 'production', value },
    });
  } else
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
  if (original && !sameSettings({ ...original, values: expectedValues }, updated))
    fail('CONTEXT_CHANGED');
  return after;
}

export async function restorePausedMonitor(api, before) {
  assertPausedHosting(before);
  const key = CONTROL_KEYS[1],
    original = before.controls[key];
  if (!sameSettings(original, (await readControls(api)).controls[key])) fail('CONTROL_DRIFT');
  if (original.values.some((v) => v.context === 'dev-server')) return before;
  const expected = {
    ...original,
    values: [...values(original), { context: 'dev-server', value: 'observe' }],
  };
  await api(`/accounts/${CONTROL_TARGET.accountId}/env/${key}?site_id=${CONTROL_TARGET.siteId}`, {
    // This variable already has explicit contexts. Add just the missing value;
    // replacing the variable and every value is unnecessary for this repair.
    method: 'PATCH',
    body: { context: 'dev-server', value: 'observe' },
  });
  const after = await readControls(api);
  if (!sameSettings(expected, after.controls[key])) fail('CONTEXT_REPAIR_UNVERIFIED');
  return after;
}

// Guard and mutation share the worker lock so activation cannot race a lifecycle run.
export async function activateDatabaseControl(client, reference, previous = null) {
  await client.query('begin');
  try {
    await client.query("set local lock_timeout='1s';set local statement_timeout='12s'");
    await client.query('select pg_advisory_xact_lock(864203711)');
    if (previous !== null) {
      if (
        !isReviewedPause(previous) ||
        Number(
          (
            await client.query(
              'select count(*) as n from safebus_private.retention_lifecycle_totals',
            )
          ).rows[0].n,
        ) !== 0
      )
        fail('PAUSED_DATABASE_BASELINE');
    }
    const changed = await client.query(
      `update public.retention_execution_control set destructive_enabled=true,approval_reference=$1,approved_at=now() where id=1 and destructive_enabled=false and approval_reference is not distinct from $2::text and approved_at is not distinct from $3::timestamptz returning id`,
      [reference, previous?.approval_reference ?? null, previous?.approved_at ?? null],
    );
    if (changed.rowCount !== 1) fail('DATABASE_DRIFT');
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
