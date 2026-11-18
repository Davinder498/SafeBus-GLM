import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { expectedVisibilityCatalog } from '../../scripts/lib/guardian-visibility-context.mjs';
const migrationPath =
  'supabase/migrations/pending/20261118120604_guardian_visibility_request_context.sql';
const sql = await fs.readFile(migrationPath, 'utf8');
const observed = (
  await fs.readFile(
    'tests/release/fixtures/guardian-visibility-wrapper-hosted-20261118.sql',
    'utf8',
  )
).replace(
  /AS \$function\$([\s\S]*?)\$function\$/,
  (_, body) => 'AS $function$' + body.replaceAll('\n', '\r\n') + '$function$',
);
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create schema auth; create schema safebus_private;
    create role authenticated; create role service_role; create role anon;
    create type public.user_role as enum('guardian','driver','tenant_admin','school_admin','transportation_admin','platform_admin');
    create table public.student_guardians(student_id uuid,tenant_id uuid,guardian_id uuid,status text,access_expires_at timestamptz);
    create table public.visibility_rows(${observed.match(/RETURNS TABLE\((.*?)\)\n/s)[1]});
    create function safebus_private.get_guardian_bus_visibility() returns setof public.visibility_rows language sql stable as 'select * from public.visibility_rows';
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function safebus_private.current_user_role() returns public.user_role language sql stable as $$select nullif(current_setting('test.role',true),'')::public.user_role$$;
    create sequence public.tenant_calls; create sequence public.guardian_calls;
    -- Instrument stable helpers without timing-dependent assertions. Only this
    -- test fixture uses nextval to count evaluations; production helpers are read-only.
    create function safebus_private.current_tenant_id() returns uuid language plpgsql stable as $$begin perform nextval('public.tenant_calls');return nullif(current_setting('test.tenant',true),'')::uuid;end$$;
    create function safebus_private.current_guardian_id() returns uuid language plpgsql stable as $$begin perform nextval('public.guardian_calls');return nullif(current_setting('test.guardian',true),'')::uuid;end$$;
  `);
  await db.exec(observed);
  await db.exec(`revoke all on function public.get_guardian_bus_visibility_v2() from public;
    grant execute on function public.get_guardian_bus_visibility_v2() to authenticated,service_role;
    ${observed.replace('public.get_guardian_bus_visibility_v2()', 'public.previous_visibility()')};
    insert into public.visibility_rows(student_id,student_name,location_state,latitude,longitude,eta_status,eta_label)
      values('${id(1)}','Own child','fresh',53.5,-113.5,'available','5 min'),('${id(2)}','Other child','stale',null,null,'unavailable',null);
    insert into public.student_guardians select '${id(1)}','${id(10)}',('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'active',null from generate_series(100,149) n;
    insert into public.student_guardians values('${id(2)}','${id(20)}','${id(200)}','active',null);
    set test.uid='${id(300)}';set test.role='guardian';set test.tenant='${id(10)}';set test.guardian='${id(100)}';
  `);
  return db;
}
const read = async (db, name = 'get_guardian_bus_visibility_v2') =>
  (await db.query(`select * from public.${name}() order by student_id`)).rows;
const counts = async (db) =>
  (
    await db.query(
      'select (select last_value from tenant_calls) tenant,(select last_value from guardian_calls) guardian',
    )
  ).rows[0];
test('request context removes per-link helper work and preserves complete output', async (t) => {
  const db = await fixture(t);
  const expected = await read(db);
  const before = await counts(db);
  await db.exec(sql);
  await db.exec('alter sequence tenant_calls restart;alter sequence guardian_calls restart');
  assert.deepEqual(await read(db), expected);
  const after = await counts(db);
  assert.deepEqual(after, { tenant: 1, guardian: 1 });
  assert.ok(before.tenant >= 50, JSON.stringify(before));
  t.diagnostic(JSON.stringify({ candidateLinks: 51, before, after }));
  assert.equal(expected.length, 1);
});
test('each request rechecks identity, role, tenant, link status and exclusive expiry', async (t) => {
  const db = await fixture(t);
  await db.exec(sql);
  const changes = [
    "set test.guardian='" + id(101) + "'",
    "set test.guardian='" + id(200) + "'",
    "set test.tenant='" + id(20) + "'",
    "set test.uid=''",
    ...['driver', 'tenant_admin', 'school_admin', 'transportation_admin', 'platform_admin'].map(
      (r) => `set test.role='${r}'`,
    ),
    "set test.uid='" + id(300) + "';set test.role='guardian'",
    "update student_guardians set access_expires_at=now() where guardian_id='" + id(200) + "'",
    "update student_guardians set access_expires_at=now()+interval '1 minute'",
    "update student_guardians set status='inactive'",
    'delete from student_guardians',
  ];
  for (const change of changes) {
    await db.exec('begin');
    await db.exec(change);
    assert.deepEqual(await read(db), await read(db, 'previous_visibility'), change);
    await db.exec('commit');
  }
  await db.exec('set role anon');
  await assert.rejects(read(db), (e) => e.code === '42501');
});
test('migration rejects drift, preserves privileges and rehearses with rollback', async (t) => {
  const db = await fixture(t);
  const catalog = async () =>
    (
      await db.query(
        "select pg_get_functiondef(oid) def,proacl::text acl,prosecdef,provolatile,proconfig from pg_proc where oid='public.get_guardian_bus_visibility_v2()'::regprocedure",
      )
    ).rows[0];
  const before = await catalog();
  const originalCatalog = {
    catalog: {
      routines: [
        {
          schema_name: 'public',
          proname: 'get_guardian_bus_visibility_v2',
          arguments: '',
          definition: before.def,
        },
      ],
      routineGrants: ['unchanged'],
    },
  };
  const expected = expectedVisibilityCatalog(originalCatalog);
  assert.equal(originalCatalog.catalog.routines[0].definition, before.def);
  assert.throws(() => expectedVisibilityCatalog(expected), /VISIBILITY_BASELINE_MISMATCH/);
  await db.exec('begin');
  await db.exec(sql);
  const after = await catalog();
  assert.equal(after.def, expected.catalog.routines[0].definition);
  assert.deepEqual(expected.catalog.routineGrants, originalCatalog.catalog.routineGrants);
  assert.equal(after.acl, before.acl);
  assert.equal(after.prosecdef, true);
  assert.equal(after.provolatile, 's');
  assert.deepEqual(after.proconfig, before.proconfig);
  await db.exec('rollback');
  assert.deepEqual(await catalog(), before);
  await db.exec(sql);
  await assert.rejects(db.exec(sql), /GUARDIAN_VISIBILITY_BASELINE_MISMATCH/);
});

test('protected Recovery verification keeps the original measured workload', async () => {
  const workflow = await fs.readFile('.github/workflows/verify-recovery-map-context.yml', 'utf8');
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /uses: .\/.github\/workflows\/validate-security-install.yml/);
  assert.match(workflow, /SAFEBUS_CAPACITY_BUSES: '10'/);
  assert.match(workflow, /run: node scripts\/run-recovery-capacity.mjs/);
  assert.match(workflow, /SAFEBUS_CAPACITY_CONFIRM: RUN_RECOVERY_CAPACITY/);
  assert.ok(
    workflow.indexOf('run: node scripts/release-recovery-map-context.mjs') <
      workflow.indexOf('run: node scripts/run-recovery-capacity.mjs'),
  );
});
