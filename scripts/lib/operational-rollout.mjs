import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const operationalDigest = (value) => createHash('sha256').update(value).digest('hex');
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const identifier = (value) => {
  if (!/^[a-z_][a-z_0-9]*$/.test(value)) throw new Error('OPERATIONAL_IDENTIFIER');
  return '"' + value + '"';
};

export async function operationalSnapshot(client, config) {
  const functions = [];
  for (const signature of config.functions.map((f) => f.signature)) {
    const {
      rows: [row],
    } = await client.query(
      `select
      replace(pg_get_functiondef(p.oid),chr(13),'') as definition,
      md5(replace(pg_get_functiondef(p.oid),chr(13),'')) as md5,
      pg_get_userbyid(p.proowner) as owner,
      coalesce(proacl,acldefault('f',proowner))::text[] as acl
      from pg_proc p where oid=to_regprocedure($1)`,
      [signature],
    );
    if (!row) throw new Error('OPERATIONAL_FUNCTION_MISSING');
    functions.push({ signature, ...row, acl: row.acl.sort() });
  }
  const policies = [];
  for (const expected of config.policies) {
    const {
      rows: [row],
    } = await client.query(
      `select schemaname,tablename,policyname,
      permissive,roles::text[],cmd,qual,with_check from pg_policies
      where schemaname=$1 and tablename=$2 and policyname=$3`,
      [expected.before.schemaname, expected.before.tablename, expected.before.policyname],
    );
    if (!row) throw new Error('OPERATIONAL_POLICY_MISSING');
    policies.push(row);
  }
  const defaults = [];
  for (const expected of config.defaults) {
    const {
      rows: [row],
    } = await client.query(
      `select table_schema,table_name,column_name,column_default
      from information_schema.columns where table_schema=$1 and table_name=$2 and column_name=$3`,
      [expected.before.table_schema, expected.before.table_name, expected.before.column_name],
    );
    if (!row) throw new Error('OPERATIONAL_DEFAULT_MISSING');
    defaults.push(row);
  }
  const repairs = [];
  for (const expected of config.repairs) {
    const {
      rows: [row],
    } = await client.query(
      `select id,tenant_id,started_at::text,service_date::text
      from public.driver_trips where id=$1`,
      [expected.id],
    );
    if (row) repairs.push(row);
  }
  return { functions, policies, defaults, repairs };
}

export function verifyOperationalSnapshot(snapshot, config, state) {
  for (const expected of config.functions) {
    const actual = snapshot.functions.find((f) => f.signature === expected.signature);
    if (
      actual?.md5 !== expected[state].md5 ||
      actual.owner !== expected.owner ||
      JSON.stringify(actual.acl) !== JSON.stringify([...expected.acl].sort())
    )
      throw new Error('OPERATIONAL_FUNCTION_DRIFT');
  }
  for (const key of ['policies', 'defaults']) {
    if (
      !isDeepStrictEqual(
        snapshot[key],
        config[key].map((entry) => entry[state]),
      )
    )
      throw new Error('OPERATIONAL_SCHEMA_DRIFT');
  }
  for (const row of snapshot.repairs) {
    const expected = config.repairs.find((r) => r.id === row.id);
    if (
      !expected ||
      row.tenant_id !== expected.tenant_id ||
      Date.parse(row.started_at) !== Date.parse(expected.started_at) ||
      !(state === 'after' ? [expected.after] : [expected.before, expected.after]).includes(
        row.service_date,
      )
    )
      throw new Error('OPERATIONAL_REPAIR_DRIFT');
  }
  return {
    functionsVerified: snapshot.functions.length,
    policiesVerified: snapshot.policies.length,
    defaultsVerified: snapshot.defaults.length,
    confirmedTripDatesVerified: snapshot.repairs.length,
  };
}

export function operationalRestoreSql(snapshot, config) {
  const statements = snapshot.functions.map((f) => f.definition.trim().replace(/;$/, '') + ';');
  for (const p of snapshot.policies) {
    // These reviewed migrations alter expressions only, preserving policy audience/type.
    if (!config.policies.some((entry) => entry.before.policyname === p.policyname))
      throw new Error('OPERATIONAL_RECOVERY_SCOPE');
    const name = '"' + p.policyname.replaceAll('"', '""') + '"';
    statements.push(
      `ALTER POLICY ${name} ON ${identifier(p.schemaname)}.${identifier(p.tablename)}` +
        (p.qual === null ? '' : ` USING (${p.qual})`) +
        (p.with_check === null ? '' : ` WITH CHECK (${p.with_check})`) +
        ';',
    );
  }
  for (const d of snapshot.defaults)
    statements.push(
      `ALTER TABLE ${identifier(d.table_schema)}.${identifier(d.table_name)} ALTER COLUMN ${identifier(d.column_name)} ${d.column_default === null ? 'DROP DEFAULT' : 'SET DEFAULT ' + d.column_default};`,
    );
  for (const r of snapshot.repairs) {
    const expected = config.repairs.find((entry) => entry.id === r.id);
    if (!expected) throw new Error('OPERATIONAL_RECOVERY_SCOPE');
    statements.push(
      `UPDATE public.driver_trips SET service_date=${literal(r.service_date)}::date WHERE id=${literal(r.id)}::uuid AND tenant_id=${literal(r.tenant_id)}::uuid AND started_at=${literal(r.started_at)}::timestamptz AND service_date=${literal(expected.after)}::date;`,
    );
  }
  return statements.join('\n');
}

export async function operationalReadOnly(client, run) {
  await client.query('begin isolation level repeatable read read only');
  try {
    await client.query("set local statement_timeout='5s';set local lock_timeout='1s'");
    return await run();
  } finally {
    await client.query('rollback');
  }
}

export async function operationalDataDigest(client) {
  // Worker activity is invisible within the repeatable-read transaction. The
  // migration itself must neither rewrite recipient choices nor produce alerts.
  const {
    rows: [row],
  } = await client.query(`select md5(jsonb_build_object(
    'settings',(select jsonb_agg(to_jsonb(s) order by profile_id) from public.user_notification_settings s),
    'categories',(select jsonb_agg(to_jsonb(c) order by profile_id,category) from public.user_notification_category_preferences c),
    'student_preferences',(select jsonb_agg(to_jsonb(g) order by student_guardian_id,category) from public.guardian_student_push_preferences g),
    'notifications',(select jsonb_agg(to_jsonb(n) order by id) from public.user_notifications n),
    'push',(select jsonb_agg(to_jsonb(o) order by id) from public.push_notification_outbox o),
    'email',(select jsonb_agg(to_jsonb(o) order by id) from public.guardian_notification_outbox o)
    )::text) as digest`);
  return row.digest;
}

export async function rehearseOperational(client, sql, config) {
  const capture = () => operationalReadOnly(client, () => operationalSnapshot(client, config));
  const before = await capture();
  verifyOperationalSnapshot(before, config, 'before');
  await client.query('begin isolation level repeatable read');
  let result;
  try {
    await client.query(
      "set local statement_timeout='5s';set local lock_timeout='1s';set local check_function_bodies=on",
    );
    const data = await operationalDataDigest(client);
    await client.query(sql);
    result = verifyOperationalSnapshot(await operationalSnapshot(client, config), config, 'after');
    if (data !== (await operationalDataDigest(client)))
      throw new Error('OPERATIONAL_RECIPIENT_DATA_CHANGED');
  } finally {
    await client.query('rollback');
    if (JSON.stringify(before) !== JSON.stringify(await capture()))
      throw new Error('OPERATIONAL_RESTORATION_FAILED');
  }
  return result;
}
