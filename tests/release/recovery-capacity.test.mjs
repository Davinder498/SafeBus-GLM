import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import {
  capacityTables,
  capacityGuards,
  cleanupCapacity,
  assertCapacityScope,
} from '../../scripts/lib/recovery-capacity-cleanup.mjs';
import { runArrivals, percentiles } from '../../scripts/lib/recovery-capacity-scheduler.mjs';
const tid = 'ca000000-0000-4000-8000-000000000001',
  uid = 'ca100000-0000-4000-8000-000000000001';
const scope = {
  run: '123-1',
  buses: 10,
  tenantIds: [tid, 'ca000000-0000-4000-8000-000000000002'],
  emails: Array.from({ length: 61 }, (_, i) => `capacity-load-123-1-${i}@example.test`),
};
async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;
    revoke usage on schema public from public;
    create schema auth;create schema safebus_private;create schema safebus_release;
    create table safebus_release.environment_identity(singleton boolean,environment text,project_ref_hash text);
    insert into safebus_release.environment_identity values(true,'staging',encode(sha256(convert_to('deladookciebwvqojhkv','UTF8')),'hex'));
    create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb);
    create table public.tenants(id uuid primary key,name text,type text);
    create function public.deny_delete() returns trigger language plpgsql as $$begin raise exception 'guarded';end$$;`);
  for (const table of capacityTables)
    await db.exec(
      `create table public.${table}(id uuid primary key,tenant_id uuid references public.tenants)`,
    );
  await db.exec(`create table safebus_private.notification_audience_queue(tenant_id uuid references public.tenants);
    create table safebus_private.agreement_packages(tenant_id uuid references public.tenants);
    create table safebus_private.participant_agreement_requirements(profile_id uuid references public.profiles);
    create table safebus_private.tenant_agreement_requirement(tenant_id uuid references public.tenants);`);
  await db.query("insert into public.tenants values($1,'Capacity Load 123-1 1','demo')", [tid]);
  await db.query('insert into auth.users values($1,$2,$3)', [
    uid,
    scope.emails[0],
    JSON.stringify({ safebus_capacity_run: scope.run }),
  ]);
  for (const table of capacityTables)
    await db.query(`insert into public.${table} values($1,$2)`, [uid, tid]);
  await db.query('insert into safebus_private.participant_agreement_requirements values($1)', [
    uid,
  ]);
  for (const [table, guard] of capacityGuards)
    await db.exec(
      `create trigger ${guard} before delete on public.${table} for each row execute function public.deny_delete()`,
    );
  return db;
}
async function state(db) {
  return (
    await db.query(`select
  (select count(*)::int from public.profiles) profiles,
  (select count(*)::int from public.driver_trips) trips,
  (select count(*)::int from public.user_notifications) notifications,
  (select count(*)::int from pg_trigger where not tgisinternal and tgenabled='O') guards`)
  ).rows[0];
}
test('capacity cleanup rehearses without loss and restores all 16 guards after deletion', async (t) => {
  const db = await fixture(t),
    before = await state(db);
  assert.equal(before.guards, 16);
  await cleanupCapacity(db, scope, true);
  assert.deepEqual(await state(db), before);
  await cleanupCapacity(db, scope);
  assert.deepEqual(await state(db), { profiles: 0, trips: 0, notifications: 0, guards: 16 });
  assert.equal(
    (await db.query('select * from auth.users')).rows.length,
    1,
    'Auth deletion remains a separate API step',
  );
});
for (const [name, sql] of [
  ['production', "update safebus_release.environment_identity set environment='production'"],
  ['exposed API', 'grant usage on schema public to authenticated'],
  ['wrong identity', "update auth.users set raw_app_meta_data='{}'"],
  ['wrong tenant name', "update public.tenants set name='Customer'"],
  ['unowned row', 'update public.driver_trips set tenant_id=null'],
  ['guard drift', 'alter table public.driver_trips disable trigger complete_disposal_guard'],
  [
    'late failure',
    'create trigger fail_cleanup before delete on public.routes for each row execute function public.deny_delete()',
  ],
])
  test(`capacity cleanup rolls back safely: ${name}`, async (t) => {
    const db = await fixture(t);
    await db.exec(sql);
    const before = await state(db);
    await assert.rejects(cleanupCapacity(db, scope), {
      message:
        name === 'exposed API'
          ? 'CAPACITY_API_EXPOSED'
          : name === 'unowned row'
            ? 'CAPACITY_FOREIGN_ROWS'
            : name === 'guard drift'
              ? 'CAPACITY_GUARD_DRIFT'
              : name === 'late failure'
                ? 'guarded'
                : 'CAPACITY_CLEANUP_OWNERSHIP',
    });
    assert.deepEqual(await state(db), before);
  });
test('capacity scope rejects oversized runs and arbitrary addresses', () => {
  assert.throws(() => assertCapacityScope({ ...scope, buses: 10000 }));
  assert.throws(() =>
    assertCapacityScope({ ...scope, emails: scope.emails.map(() => 'real@example.com') }),
  );
});
test('latency percentiles preserve the tail', () =>
  assert.deepEqual(percentiles([1, 2, 3, 4, 5000]), { p50: 3, p95: 5000, p99: 5000 }));
test('open loop records offered, achieved and bounded latency', async () => {
  let now = 0;
  const seen = [];
  const result = await runArrivals({
    count: 2,
    periodMs: 1000,
    durationMs: 2000,
    clock: () => now,
    wait: async (ms) => {
      now += ms;
    },
    operation: async (i, s) => {
      seen.push([i, s]);
    },
  });
  assert.equal(result.expected, 4);
  assert.equal(result.completed, 4);
  assert.equal(result.passed, true);
  assert.deepEqual(seen, [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]);
});
test('generator backlog fails rather than silently lowering offered load', async () => {
  let now = 0;
  const result = await runArrivals({
    count: 1,
    periodMs: 1000,
    durationMs: 3000,
    clock: () => now,
    wait: async (ms) => {
      now += ms + 2000;
    },
    operation: async () => {},
  });
  assert.equal(result.passed, false);
  assert.equal(result.missed, 1);
  assert.ok(result.completed < result.expected);
});
test('operation failures and pre-aborted load cannot pass', async () => {
  let now = 0;
  const base = {
    count: 1,
    periodMs: 1000,
    durationMs: 3000,
    clock: () => now,
    wait: async (ms) => {
      now += ms;
    },
    operation: async () => {
      throw Error('rejected');
    },
  };
  assert.equal((await runArrivals(base)).passed, false);
  assert.equal((await runArrivals({ ...base, signal: AbortSignal.abort() })).passed, false);
});
