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
    if (!row) {
      if (config.functions.find((f) => f.signature === signature)?.before.md5 !== null)
        throw new Error('OPERATIONAL_FUNCTION_MISSING');
      functions.push({ signature, definition: null, md5: null, owner: null, acl: [] });
    } else functions.push({ signature, ...row, acl: row.acl.sort() });
  }
  const policies = [];
  for (const expected of config.policies) {
    const {
      rows: [row],
    } = await client.query(
      `select schemaname,tablename,policyname,
      permissive,roles::text[],cmd,qual,with_check from pg_policies
      where schemaname=$1 and tablename=$2 and policyname=$3`,
      [
        (expected.before ?? expected.after).schemaname,
        (expected.before ?? expected.after).tablename,
        (expected.before ?? expected.after).policyname,
      ],
    );
    if (!row && expected.before !== null) throw new Error('OPERATIONAL_POLICY_MISSING');
    policies.push(row ?? null);
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
  const snapshot = { functions, policies, defaults, repairs };
  if (config.columns) {
    snapshot.columns = [];
    for (const column of config.columns) {
      const {
        rows: [row],
      } = await client.query(
        'select data_type,is_nullable,column_default from information_schema.columns where table_schema=$1 and table_name=$2 and column_name=$3',
        [column.schema, column.table, column.name],
      );
      snapshot.columns.push(row ?? null);
    }
  }
  if (config.relations) {
    snapshot.relations = [];
    for (const relation of config.relations) {
      const {
        rows: [row],
      } = await client.query(
        `select c.relrowsecurity as rls,c.relforcerowsecurity as force_rls,
        pg_get_userbyid(c.relowner) as owner,coalesce(c.relacl,acldefault('r',c.relowner))::text[] as acl,
        (select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
         from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
        (select jsonb_agg(pg_get_constraintdef(k.oid) order by k.conname) from pg_constraint k where k.conrelid=c.oid and k.contype<>'n') as constraints,
        (select count(*)::int from pg_policy where polrelid=c.oid) as policies
        from pg_class c where c.oid=to_regclass($1)`,
        [relation.name],
      );
      snapshot.relations.push(row ?? null);
    }
  }
  if (config.jobs) {
    snapshot.jobs = [];
    for (const job of config.jobs) {
      const {
        rows: [row],
      } = await client.query(
        "select jobname as name,schedule,active,md5(replace(command,chr(13),'')) as command_md5 from cron.job where jobname=$1",
        [job.name],
      );
      snapshot.jobs.push(row ?? null);
    }
  }
  if (config.quotaRepairs) {
    snapshot.quotaRepairs = [];
    for (const policy of config.quotaRepairs) {
      const {
        rows: [row],
      } = await client.query(
        'select tenant_daily_limit,tenant_per_minute_limit,push_tenant_daily_limit,push_tenant_per_minute_limit from public.guardian_notification_delivery_policies where tenant_id=$1',
        [policy.tenant_id],
      );
      snapshot.quotaRepairs.push(row ?? null);
    }
  }
  if (config.constraints) {
    snapshot.constraints = [];
    for (const constraint of config.constraints) {
      const {
        rows: [row],
      } = await client.query(
        'select pg_get_constraintdef(oid,true) as definition from pg_constraint where conrelid=to_regclass($1) and conname=$2',
        [constraint.table, constraint.name],
      );
      snapshot.constraints.push(row?.definition ?? null);
    }
  }
  if (config.indexes) {
    snapshot.indexes = [];
    for (const index of config.indexes) {
      const {
        rows: [row],
      } = await client.query(
        'select indexdef from pg_indexes where schemaname=$1 and indexname=$2',
        [index.schema, index.name],
      );
      snapshot.indexes.push(row?.indexdef ?? null);
    }
  }
  if (config.columnGrants) {
    snapshot.columnGrants = [];
    for (const grant of config.columnGrants) {
      const { rows } = await client.query(
        `select column_name,has_column_privilege($1,quote_ident($2)||'.'||quote_ident($3),column_name,'SELECT') as allowed
        from information_schema.columns where table_schema=$2 and table_name=$3 and column_name=any($4::text[]) order by column_name`,
        [grant.role, grant.schema, grant.table, grant.columns],
      );
      snapshot.columnGrants.push(rows);
    }
  }
  return snapshot;
}

export function verifyOperationalSnapshot(snapshot, config, state) {
  for (const key of ['relations', 'jobs', 'quotaRepairs', 'constraints', 'indexes', 'columns']) {
    if (
      config[key] &&
      !isDeepStrictEqual(
        snapshot[key],
        config[key].map((entry) => entry[state]),
      )
    )
      throw new Error('OPERATIONAL_SCHEMA_DRIFT');
  }
  for (const expected of config.functions) {
    const actual = snapshot.functions.find((f) => f.signature === expected.signature);
    if (
      actual?.md5 !== expected[state].md5 ||
      actual.owner !== (expected[state].md5 === null ? null : expected.owner) ||
      JSON.stringify(actual.acl) !==
        JSON.stringify(expected[state].md5 === null ? [] : [...expected.acl].sort())
    )
      throw new Error('OPERATIONAL_FUNCTION_DRIFT');
  }
  if (
    config.columnGrants &&
    !isDeepStrictEqual(
      snapshot.columnGrants,
      config.columnGrants.map((g) =>
        [...g.columns].sort().map((column_name) => ({ column_name, allowed: g[state] })),
      ),
    )
  )
    throw new Error('OPERATIONAL_GRANT_DRIFT');
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
  const pendingGuards = (config.mustBeEmptyBeforeRestore ?? []).map((table) => {
    const [schema, name] = table.split('.');
    return `DO $restore$ BEGIN IF EXISTS(SELECT 1 FROM ${identifier(schema)}.${identifier(name)} LIMIT 1) THEN RAISE EXCEPTION 'Pending notification audience work must drain before rollback.'; END IF; END $restore$;`;
  });
  const moves = (config.tableMoves ?? []).map(
    (move) =>
      `ALTER TABLE ${identifier(move.after.schema)}.${identifier(move.after.table)} SET SCHEMA ${identifier(move.before.schema)};`,
  );
  const statements = [
    ...pendingGuards,
    ...moves,
    ...[...snapshot.functions]
      .reverse()
      .map((f) =>
        f.definition === null
          ? `DROP FUNCTION IF EXISTS ${f.signature};`
          : f.definition.trim().replace(/;$/, '') + ';',
      ),
  ];
  for (const [index, policy] of (config.quotaRepairs ?? []).entries()) {
    statements.push(
      `UPDATE public.guardian_notification_delivery_policies SET ${Object.entries(
        snapshot.quotaRepairs[index],
      )
        .map(([key, value]) => identifier(key) + '=' + Number(value))
        .join(',')} WHERE tenant_id=${literal(policy.tenant_id)}::uuid AND ${Object.entries(
        policy.after,
      )
        .map(([key, value]) => identifier(key) + '=' + Number(value))
        .join(' AND ')};`,
    );
  }
  for (const [index, constraint] of (config.constraints ?? []).entries()) {
    const [schema, table] = constraint.table.split('.');
    statements.push(
      `ALTER TABLE ${identifier(schema)}.${identifier(table)} DROP CONSTRAINT ${identifier(constraint.name)};`,
      `ALTER TABLE ${identifier(schema)}.${identifier(table)} ADD CONSTRAINT ${identifier(constraint.name)} ${snapshot.constraints[index]};`,
    );
  }
  for (const [index, job] of (config.jobs ?? []).entries())
    statements.push(
      `SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname=${literal(job.name)}),schedule:=${literal(snapshot.jobs[index].schedule)});`,
    );
  for (const index of (config.indexes ?? []).filter((entry) => entry.before === null))
    statements.push(`DROP INDEX ${identifier(index.schema)}.${identifier(index.name)};`);
  for (const table of [...(config.newTables ?? [])].reverse()) {
    const [schema, name] = table.split('.');
    statements.push(`DROP TABLE ${identifier(schema)}.${identifier(name)};`);
  }
  for (const column of (config.columns ?? []).filter((entry) => entry.before === null))
    statements.push(
      `ALTER TABLE ${identifier(column.schema)}.${identifier(column.table)} DROP COLUMN ${identifier(column.name)};`,
    );
  for (const [index, p] of snapshot.policies.entries()) {
    if (p === null) {
      const target = config.policies[index].after;
      statements.push(
        `DROP POLICY ${identifier(target.policyname)} ON ${identifier(target.schemaname)}.${identifier(target.tablename)};`,
      );
      continue;
    }
    // These reviewed migrations alter expressions only, preserving policy audience/type.
    if (!config.policies.some((entry) => entry.before?.policyname === p.policyname))
      throw new Error('OPERATIONAL_RECOVERY_SCOPE');
    const name = '"' + p.policyname.replaceAll('"', '""') + '"';
    statements.push(
      `ALTER POLICY ${name} ON ${identifier(p.schemaname)}.${identifier(p.tablename)}` +
        (p.qual === null ? '' : ` USING (${p.qual})`) +
        (p.with_check === null ? '' : ` WITH CHECK (${p.with_check})`) +
        ';',
    );
  }
  for (const [index, g] of (config.columnGrants ?? []).entries()) {
    const rows = snapshot.columnGrants[index];
    for (const allowed of [false, true]) {
      const columns = rows
        .filter((row) => row.allowed === allowed)
        .map((row) => identifier(row.column_name));
      if (columns.length)
        statements.push(
          `${allowed ? 'GRANT' : 'REVOKE'} SELECT (${columns.join(',')}) ON ${identifier(g.schema)}.${identifier(g.table)} ${allowed ? 'TO' : 'FROM'} ${identifier(g.role)};`,
        );
    }
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
    'email',(select jsonb_agg(to_jsonb(o)-'worker_id' order by id) from public.guardian_notification_outbox o)
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
    if (config.rehearseRestore) {
      await client.query(operationalRestoreSql(before, config));
      verifyOperationalSnapshot(await operationalSnapshot(client, config), config, 'before');
      if (data !== (await operationalDataDigest(client)))
        throw new Error('OPERATIONAL_RECOVERY_DATA_CHANGED');
    }
  } finally {
    await client.query('rollback');
    if (JSON.stringify(before) !== JSON.stringify(await capture()))
      throw new Error('OPERATIONAL_RESTORATION_FAILED');
  }
  return result;
}
