import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { cleanupRecoveryProfiles } from '../../scripts/lib/recovery-api-cleanup.mjs';
const tenantIds = ['ca000000-0000-4000-8000-000000000001', 'ca000000-0000-4000-8000-000000000002'];
const userId = 'ca100000-0000-4000-8000-000000000001';
const scope = {
  run: '123-1',
  emails: Array.from({ length: 7 }, (_, i) => `capacity-api-123-1-${i}@example.test`),
  tenantIds,
  tenantNames: ['Capacity API 123-1 0', 'Capacity API 123-1 1'],
};
async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
 revoke usage on schema public from public;
 create schema safebus_private; create schema safebus_release; create schema auth;
 create table safebus_release.environment_identity(singleton boolean,environment text,project_ref_hash text);
 insert into safebus_release.environment_identity values(true,'staging',encode(sha256(convert_to('deladookciebwvqojhkv','UTF8')),'hex'));
 create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb);
 create table public.tenants(id uuid primary key,name text,type text);
 create table public.profiles(id uuid primary key references auth.users,tenant_id uuid references public.tenants);
 create table safebus_private.participant_agreement_requirements(profile_id uuid references public.profiles);
 create table safebus_private.tenant_agreement_requirement(tenant_id uuid references public.tenants);
 create function public.deny_delete() returns trigger language plpgsql as $$begin raise exception 'deletion guarded'; end$$;
 create trigger complete_disposal_guard before delete on public.profiles for each row execute function public.deny_delete();
 create trigger protect_final_tenant_admin_delete before delete on public.profiles for each row execute function public.deny_delete();`);
  await db.query('insert into auth.users values($1,$2,$3)', [
    userId,
    scope.emails[0],
    JSON.stringify({ safebus_capacity_run: scope.run }),
  ]);
  for (let i = 0; i < 2; i++)
    await db.query("insert into public.tenants values($1,$2,'demo')", [
      tenantIds[i],
      scope.tenantNames[i],
    ]);
  await db.query('insert into public.profiles values($1,$2)', [userId, tenantIds[0]]);
  await db.query('insert into safebus_private.participant_agreement_requirements values($1)', [
    userId,
  ]);
  await db.query('insert into safebus_private.tenant_agreement_requirement values($1)', [
    tenantIds[0],
  ]);
  return db;
}
async function state(db) {
  return (
    await db.query(`select (select count(*)::int from public.profiles) profiles,
 (select count(*)::int from public.tenants) tenants,
 (select count(*)::int from auth.users) users,
 (select count(*)::int from pg_trigger where tgrelid='public.profiles'::regclass and tgenabled='O' and not tgisinternal) guards`)
  ).rows[0];
}
test('rehearsal rolls back; scoped cleanup removes fixtures and restores both guards', async (t) => {
  const db = await fixture(t);
  await assert.rejects(db.query('delete from public.profiles'), /deletion guarded/);
  const before = await state(db);
  await cleanupRecoveryProfiles(db, { ...scope, rehearse: true });
  assert.deepEqual(await state(db), before);
  await cleanupRecoveryProfiles(db, scope);
  assert.deepEqual(await state(db), { profiles: 0, tenants: 0, users: 1, guards: 2 });
});
for (const [name, sql] of [
  ['production', "update safebus_release.environment_identity set environment='production'"],
  ['public API exposed', 'grant usage on schema public to authenticated'],
  ['foreign profile', "update auth.users set raw_app_meta_data='{}'"],
  ['wrong tenant marker', "update public.tenants set name='Existing authority'"],
  ['disabled guard', 'alter table public.profiles disable trigger complete_disposal_guard'],
  [
    'failure after profile deletion',
    `create trigger fail_cleanup before delete on public.tenants for each row execute function public.deny_delete()`,
  ],
])
  test(`cleanup fails closed and restores transaction for ${name}`, async (t) => {
    const db = await fixture(t);
    await db.exec(sql);
    const before = await state(db);
    await assert.rejects(
      cleanupRecoveryProfiles(db, scope),
      name === 'disabled guard'
        ? /DELETE_GUARDS_CHANGED/
        : name === 'failure after profile deletion'
          ? /deletion guarded/
          : /CLEANUP_GUARD_FAILED/,
    );
    assert.deepEqual(await state(db), before);
    assert.equal(
      (
        await db.query(
          'select count(*)::int n from safebus_private.participant_agreement_requirements',
        )
      ).rows[0].n,
      1,
    );
  });
