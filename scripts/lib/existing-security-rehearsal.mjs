import { createHash } from 'node:crypto';
import { createEnvironmentBinding } from './environment-identity.mjs';

export const APPROVED_PROJECT = 'ckrkfylsyihwouvesypm';
export const RECONCILIATION_FILE =
  'supabase/migrations/0123_existing_project_security_reconciliation.sql';
export const SECURITY_FILE = 'supabase/migrations/0122_commercial_authorization_boundaries.sql';
export const SESSION_VALIDATION_FILE = 'supabase/migrations/0124_session_claim_validation.sql';
export const ACCEPTANCE_FILE = 'tests/rls/commercial-security-existing-database-readonly.sql';
// The gateway reserves the OpenAPI root for secret keys. A nonexistent relation
// exercises schema selection with a public key without reading application rows.
export const PRIVATE_API_PROBE_PATH =
  '/rest/v1/__safebus_security_schema_probe__?select=id&limit=0';

// Catalog only: no auth rows, app records, connection strings, or API keys.
export const CATALOG_SNAPSHOT_SQL = [
  'select jsonb_build_object(',
  "'functions', (select jsonb_agg(jsonb_build_object(",
  "'schema',n.nspname,'name',p.proname,'args',pg_get_function_identity_arguments(p.oid),",
  "'definition',pg_get_functiondef(p.oid),'acl',p.proacl,'owner',pg_get_userbyid(p.proowner))",
  'order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))',
  'from pg_proc p join pg_namespace n on n.oid=p.pronamespace',
  "where n.nspname in ('public','safebus_private') and p.prokind='f'",
  "and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass",
  "and d.objid=p.oid and d.refclassid='pg_extension'::regclass and d.deptype='e')),",
  "'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)",
  "from pg_policies p where schemaname in ('public','safebus_private','realtime')),",
  "'triggers',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,",
  "'name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)",
  'order by n.nspname,c.relname,t.tgname) from pg_trigger t',
  'join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace',
  "where n.nspname in ('public','safebus_private') and not t.tgisinternal),",
  "'relations',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,",
  "'acl',c.relacl,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity)",
  'order by n.nspname,c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace',
  "where n.nspname in ('public','safebus_private','realtime') and c.relkind in ('r','p','v','m','S')),",
  "'column_grants',(select jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,",
  "'column',a.attname,'acl',a.attacl) order by n.nspname,c.relname,a.attnum)",
  'from pg_attribute a join pg_class c on c.oid=a.attrelid',
  "join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','safebus_private','realtime')",
  'and a.attnum>0 and not a.attisdropped and a.attacl is not null),',
  "'schemas',(select jsonb_agg(jsonb_build_object('name',n.nspname,'acl',n.nspacl) order by n.nspname)",
  "from pg_namespace n where n.nspname in ('public','safebus_private')),",
  "'api_hook',(select jsonb_agg(jsonb_build_object('database',s.setdatabase,'role',s.setrole,",
  "'setting',c.setting) order by s.setdatabase,s.setrole,c.setting)",
  'from pg_db_role_setting s cross join lateral unnest(s.setconfig) c(setting)',
  'where s.setdatabase in (0,(select oid from pg_database where datname=current_database()))',
  "and c.setting like 'pgrst.db_pre_request=%')) as snapshot",
].join('\n');

export function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

export async function assertPrivateApiSchemaHidden(supabaseUrl, apiKey, fetchImpl = fetch) {
  const fail = (code, status, apiCode) => {
    const error = new Error(
      'Private API schema isolation could not be confirmed; refusing rehearsal.',
    );
    error.stage = 'api-boundary';
    error.code = code;
    error.httpStatus = status;
    error.apiCode = apiCode;
    return error;
  };
  if (!apiKey) {
    const error = fail('REHEARSAL_API_KEY_MISSING');
    error.message = 'A valid publishable/anon key is required for the API boundary check.';
    throw error;
  }
  let response;
  try {
    response = await fetchImpl(supabaseUrl + PRIVATE_API_PROBE_PATH, {
      method: 'GET',
      headers: { apikey: apiKey, 'Accept-Profile': 'safebus_private' },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw fail('REHEARSAL_API_NETWORK');
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw fail('REHEARSAL_API_RESPONSE', response.status);
  }
  if (response.status !== 406 || body?.code !== 'PGRST106') {
    throw fail('REHEARSAL_API_REJECTED', response.status, body?.code);
  }
}

export function formatRehearsalFailure(error, fallbackStage) {
  const stages = new Set([
    'api-boundary',
    'database-connection',
    'rollback-rehearsal',
    'catalog',
    'reconciliation',
    'security',
    'session-validation',
    'acceptance',
  ]);
  const stage = stages.has(error?.stage)
    ? error.stage
    : stages.has(fallbackStage)
      ? fallbackStage
      : 'unknown';
  const codes = new Set([
    'REHEARSAL_API_KEY_MISSING',
    'REHEARSAL_API_NETWORK',
    'REHEARSAL_API_RESPONSE',
    'REHEARSAL_API_REJECTED',
    'REHEARSAL_FAILED',
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ETIMEDOUT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'CERT_HAS_EXPIRED',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  ]);
  const code =
    codes.has(error?.code) || /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? error.code : 'ERROR';
  const details = ['stage=' + stage, 'code=' + code];
  if (stage === 'api-boundary') {
    if (Number.isInteger(error?.httpStatus) && error.httpStatus >= 100 && error.httpStatus <= 599)
      details.push('HTTP=' + error.httpStatus);
    if (/^PGRST[0-9]{3}$/.test(error?.apiCode ?? '')) details.push('API=' + error.apiCode);
  }
  return 'Rollback rehearsal did not pass (' + details.join('; ') + ').';
}

export function validateRehearsalTarget({ environment, databaseUrl, supabaseUrl, confirmation }) {
  if (environment !== 'production')
    throw new Error('Keep the existing project production-designated.');
  const binding = createEnvironmentBinding({ environment, databaseUrl, supabaseUrl });
  if (binding.projectRefHash !== digest(APPROVED_PROJECT)) {
    throw new Error('Target is not the approved BusSafe project.');
  }
  if (confirmation !== 'REHEARSE_EXISTING_SECURITY_ROLLBACK_ONLY') {
    throw new Error('Explicit rollback-only security rehearsal confirmation is required.');
  }
  return binding;
}

export function acceptanceWithinTransaction(sql) {
  const starts = sql.match(/^begin transaction read only;\s*$/gim) ?? [];
  const ends = sql.match(/^rollback;\s*$/gim) ?? [];
  if (starts.length !== 1 || ends.length !== 1 || !/rollback;\s*$/i.test(sql)) {
    throw new Error('Acceptance SQL transaction envelope changed; review it again.');
  }
  const result = sql
    .replace(/^begin transaction read only;\s*$/im, '')
    .replace(/^rollback;\s*$/im, '');
  // The reviewed file uses DO $$ blocks, whose END must remain inside each body.
  const outsideBodies = result.replace(/do \$\$[\s\S]*?\$\$;/gi, '');
  if (/^\s*(?:commit|begin|rollback|end|start transaction)\s*;/im.test(outsideBodies)) {
    throw new Error('Unexpected transaction control in acceptance SQL.');
  }
  return result;
}

export async function snapshot(client) {
  const result = await client.query(CATALOG_SNAPSHOT_SQL);
  if (!result.rows[0]?.snapshot) throw new Error('Missing catalog snapshot.');
  return result.rows[0].snapshot;
}

export async function runRollbackRehearsal(
  client,
  { reconciliation, security, sessionValidation, acceptance },
) {
  if (!sessionValidation?.trim())
    throw new Error('Reviewed session validation correction is required.');
  const acceptanceSql = acceptanceWithinTransaction(acceptance);
  await client.query('begin');
  let before;
  let failure;
  let stage = 'catalog';
  try {
    await client.query("set local lock_timeout = '2s'");
    await client.query("set local statement_timeout = '30s'");
    await client.query("set local idle_in_transaction_session_timeout = '15s'");
    const lock = await client.query(
      "select pg_try_advisory_xact_lock(hashtextextended('safebus-schema-deploy',0)) as acquired",
    );
    if (lock.rows[0]?.acquired !== true) throw new Error('Another schema operation is running.');
    before = await snapshot(client);
    stage = 'reconciliation';
    await client.query(reconciliation);
    stage = 'security';
    await client.query(security);
    stage = 'session-validation';
    await client.query(sessionValidation);
    stage = 'acceptance';
    const accepted = await client.query(acceptanceSql);
    const results = Array.isArray(accepted) ? accepted : [accepted];
    if (!results.some((result) => result.rows?.some((row) => row.result === 'PASS'))) {
      throw new Error('Acceptance checks did not return PASS.');
    }
  } catch (error) {
    failure = error;
  } finally {
    // No commit mode and no release-ledger write.
    await client.query('rollback');
  }
  await client.query('begin transaction read only');
  let after;
  try {
    await client.query("set local statement_timeout = '5s'");
    await client.query("set local lock_timeout = '1s'");
    after = await snapshot(client);
  } finally {
    await client.query('rollback');
  }
  const restored = before && digest(JSON.stringify(before)) === digest(JSON.stringify(after));
  if (before && !restored)
    throw new Error('Catalog changed after rollback; investigate concurrent changes.');
  if (failure) {
    const error = new Error('Security rehearsal failed at ' + stage + '; transaction rolled back.');
    error.code = failure.code ?? 'REHEARSAL_FAILED';
    error.stage = stage;
    throw error;
  }
  return { before, restored: Boolean(restored), acceptance: 'catalog-and-negative-checks-only' };
}
