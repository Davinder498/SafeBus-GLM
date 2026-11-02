// @vitest-environment node
// Synthetic embedded PostgreSQL only; never connects to BusSafe or a provider.
import { beforeAll, afterAll, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  operationalSnapshot,
  verifyOperationalSnapshot,
  rehearseOperational,
} from '../../../../scripts/lib/operational-rollout.mjs';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db, migration, config;
const value = async (sql) => (await db.query(sql)).rows[0].value;
const isolated = async (run) => {
  await db.exec('begin');
  try {
    await db.exec(migration);
    await run();
  } finally {
    await db.exec('rollback');
  }
};
const claims = async (role, aal = 'aal1', authority = 1) => {
  await db.exec('reset role');
  await db.query("update profiles set role=$1,tenant_id=$2,status='active' where id=$3", [
    role,
    id(authority),
    id(2),
  ]);
  await db.query(
    "select set_config('test.uid',$1,false),set_config('test.aal',$2,false),set_config('test.active','true',false)",
    [id(2), aal],
  );
};
const request = async (path = '/trip_exceptions', method = 'GET', dbRole = 'authenticated') => {
  await db.query(
    "select set_config('request.path',$1,false),set_config('request.method',$2,false)",
    [path, method],
  );
  await db.exec('savepoint api_request');
  await db.exec('set local role ' + dbRole);
  try {
    await db.exec('select safebus_private.enforce_active_api_session()');
  } catch (error) {
    await db.exec('rollback to savepoint api_request');
    throw error;
  } finally {
    await db.exec('reset role; release savepoint api_request');
  }
};

beforeAll(async () => {
  db = new PGlite();
  config = JSON.parse(await readFile('../../config/pending/privileged-admin-mfa.json', 'utf8'));
  migration = (await readFile(`../../${config.migration}`, 'utf8')).replaceAll('\r', '');
  const baseline = JSON.parse(
    await readFile('../../tests/release/fixtures/privileged-mfa-hosted-20261102.json', 'utf8'),
  );
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema safebus_private;
    create table profiles(id uuid primary key,tenant_id uuid,role text,status text default 'active');
    create table tenants(id uuid primary key,status text default 'active');
    create table auth.mfa_factors(user_id uuid,status text);
    create table auth.users(id uuid,encrypted_password text,email_confirmed_at timestamptz);
    create table tenant_onboarding_invitations(invited_profile_id uuid,status text,expires_at timestamptz,
      cancelled_at timestamptz,delivery_status text);
    create table trip_exceptions(id integer,tenant_id uuid);
    create table trip_operational_statuses(id integer,tenant_id uuid);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',current_setting('test.aal',true)) $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text $$;
    create function public.is_current_user_session_active() returns boolean language sql stable as $$ select current_setting('test.active',true)='true' $$;
    create function safebus_private.validate_password_policy(text) returns boolean language sql immutable as $$ select length($1)>=12 $$;
    create function safebus_private.is_compromised_password(text) returns boolean language sql immutable as $$ select false $$;
    create function safebus_private.current_user_role() returns text language sql stable security definer as $$
      select p.role from public.profiles p join public.tenants t on t.id=p.tenant_id and t.status='active'
      where p.id=auth.uid() and p.status='active' and p.role<>'school_admin' $$;
    create function safebus_private.current_tenant_id() returns uuid language sql stable security definer as $$
      select tenant_id from public.profiles where id=auth.uid() and status='active' $$;
    insert into tenants values('${id(1)}','active'),('${id(90)}','active');
    insert into profiles values('${id(2)}','${id(1)}','tenant_admin','active');
    insert into trip_exceptions values(1,'${id(1)}'),(2,'${id(90)}');
    insert into trip_operational_statuses values(1,'${id(1)}'),(2,'${id(90)}');
    grant usage on schema public,auth,safebus_private to authenticated,service_role;
    grant select on profiles,tenants,trip_exceptions,trip_operational_statuses to authenticated;
    create table user_notification_settings(profile_id uuid);
    create table user_notification_category_preferences(profile_id uuid,category text);
    create table guardian_student_push_preferences(student_guardian_id uuid,category text);
    create table user_notifications(id uuid);
    create table push_notification_outbox(id uuid);
    create table guardian_notification_outbox(id uuid);
    select set_config('test.uid','${id(2)}',false),set_config('test.aal','aal1',false),set_config('test.active','true',false);
  `);
  for (const f of baseline) {
    await db.exec(f.definition);
    await db.exec(`revoke all on function ${f.signature} from public,anon,authenticated,service_role;
      grant execute on function ${f.signature} to authenticated,service_role`);
  }
  for (const table of ['trip_exceptions', 'trip_operational_statuses'])
    await db.exec(`
    alter table ${table} enable row level security;
    create policy existing_authority_scope on ${table} for select to authenticated using (
      tenant_id=safebus_private.current_tenant_id() and safebus_private.current_user_role() in ('tenant_admin','transportation_admin'));
    create policy existing_active_session on ${table} as restrictive for all to authenticated using(public.is_current_user_session_active());
    create policy existing_optional_mfa on ${table} as restrictive for all to authenticated using(safebus_private.has_completed_optional_mfa());
  `);
}, 60_000);
afterAll(async () => db?.close());

it('rehearses the exact protected manifest and restores the original functions, grants and empty outboxes', async () => {
  const client = {
    query: (sql, args) =>
      args ? db.query(sql, args) : db.exec(sql).then((results) => results.at(-1)),
  };
  const before = await operationalSnapshot(client, config);
  expect(verifyOperationalSnapshot(before, config, 'before').functionsVerified).toBe(5);
  expect((await rehearseOperational(client, migration, config)).functionsVerified).toBe(5);
  expect(await operationalSnapshot(client, config)).toEqual(before);
}, 30_000);

it.each(['tenant_admin', 'transportation_admin', 'platform_super_admin', 'school_admin'])(
  'requires admin MFA for %s without enrollment',
  (role) =>
    isolated(async () => {
      await claims(role);
      expect(await value('select safebus_private.has_completed_optional_mfa() value')).toBe(false);
      await expect(request()).rejects.toMatchObject({ code: '42501' });
      // Sign-in bootstrap keeps its existing limited exemptions.
      await request('/profiles');
      await request('/rpc/register_current_user_session', 'POST');
      await request('/rpc/record_own_auth_event', 'POST');
      await request('/rpc/enforce_new_password_policy', 'POST');
      await request('/rpc/complete_invited_account', 'POST');
      await expect(request('/rpc/complete_invited_account', 'GET')).rejects.toMatchObject({
        code: '42501',
      });
      await expect(request('/rpc/register_current_user_session', 'GET')).rejects.toMatchObject({
        code: '42501',
      });
      await claims(role, 'aal2');
      expect(await value('select safebus_private.has_completed_optional_mfa() value')).toBe(true);
      await request();
    }),
);

it.each(['tenant_admin', 'transportation_admin'])(
  'activates a valid own invitation before MFA for %s, then keeps operations locked',
  (role) =>
    isolated(async () => {
      await claims(role);
      await db.exec(`update profiles set status='invited' where id='${id(2)}';
    insert into profiles values('${id(3)}','${id(1)}','guardian','invited');
    insert into auth.users values('${id(2)}','synthetic-password-hash',now());
    insert into tenant_onboarding_invitations values('${id(2)}','pending',now()+interval '1 day',null,'sent');`);
      await request('/rpc/enforce_new_password_policy', 'POST');
      await db.exec(
        "set local role authenticated; select public.enforce_new_password_policy('Synthetic-password-42'); reset role",
      );
      await request('/rpc/complete_invited_account', 'POST');
      await db.exec('set local role authenticated');
      expect(await value("select public.complete_invited_account()->>'status' value")).toBe(
        'active',
      );
      await db.exec('reset role');
      expect(await value(`select status value from profiles where id='${id(2)}'`)).toBe('active');
      expect(await value(`select status value from profiles where id='${id(3)}'`)).toBe('invited');
      await expect(request()).rejects.toMatchObject({ code: '42501' });
      await db.exec("select set_config('test.aal','aal2',false)");
      await request();
    }),
);

it.each(['expired', 'revoked', 'cancelled'])(
  'bootstrap does not accept an %s invitation',
  (status) =>
    isolated(async () => {
      await claims('tenant_admin');
      await db.exec(`update profiles set status='invited';
    insert into auth.users values('${id(2)}','synthetic-password-hash',now());`);
      await db.query(
        "insert into tenant_onboarding_invitations values($1,$2,now()+$3::interval,null,'sent')",
        [
          id(2),
          status === 'expired' ? 'pending' : status,
          status === 'expired' ? '-1 day' : '1 day',
        ],
      );
      await request('/rpc/complete_invited_account', 'POST');
      await expect(
        db.exec('set local role authenticated; select public.complete_invited_account()'),
      ).rejects.toMatchObject({ code: '22023' });
    }),
);

it.each(['guardian', 'driver'])(
  'preserves optional MFA and enrollment enforcement for %s',
  (role) =>
    isolated(async () => {
      await claims(role);
      expect(await value('select safebus_private.has_completed_optional_mfa() value')).toBe(true);
      await request();
      await db.exec(`insert into auth.mfa_factors values('${id(2)}','unverified')`);
      expect(await value('select safebus_private.has_completed_optional_mfa() value')).toBe(true);
      await db.exec("update auth.mfa_factors set status='verified'");
      expect(await value('select safebus_private.has_completed_optional_mfa() value')).toBe(false);
      await expect(request()).rejects.toMatchObject({ code: '42501' });
      await claims(role, 'aal2');
      expect(await value('select safebus_private.has_completed_optional_mfa() value')).toBe(true);
      await request();
    }),
);

it.each(['tenant_admin', 'transportation_admin'])(
  'enforces evidence RLS, authority isolation, MFA, session and account status for %s',
  (role) =>
    isolated(async () => {
      await claims(role, 'aal2');
      await db.exec('set local role authenticated');
      expect((await db.query('select id from trip_exceptions')).rows).toEqual([{ id: 1 }]);
      expect((await db.query('select id from trip_operational_statuses')).rows).toEqual([
        { id: 1 },
      ]);
      await db.exec('reset role');
      await claims(role, 'aal2', 90);
      await db.exec('set local role authenticated');
      expect((await db.query('select id from trip_exceptions')).rows).toEqual([{ id: 2 }]);
      await db.exec('reset role');
      await claims(role, 'aal1');
      await db.exec('set local role authenticated');
      expect((await db.query('select id from trip_exceptions')).rows).toEqual([]);
      await db.exec('reset role');
      await claims(role, 'aal2');
      await db.exec("select set_config('test.active','false',false)");
      await expect(request()).rejects.toMatchObject({ code: '42501' });
      await db.exec('set local role authenticated');
      expect((await db.query('select id from trip_exceptions')).rows).toEqual([]);
      await db.exec('reset role');
      await claims(role, 'aal2');
      await db.exec("update profiles set status='suspended'");
      await db.exec('set local role authenticated');
      expect((await db.query('select id from trip_exceptions')).rows).toEqual([]);
      await db.exec('reset role');
      await claims(role, 'aal2');
      await db.exec("update tenants set status='suspended'");
      await db.exec('set local role authenticated');
      expect((await db.query('select id from trip_exceptions')).rows).toEqual([]);
    }),
);

it.each(['guardian', 'driver', 'platform_super_admin', 'school_admin'])(
  'does not grant authority reporting RLS to %s',
  (role) =>
    isolated(async () => {
      await claims(role, 'aal2');
      await db.exec('set local role authenticated');
      expect((await db.query('select id from trip_exceptions')).rows).toEqual([]);
      expect((await db.query('select id from trip_operational_statuses')).rows).toEqual([]);
    }),
);

it('rejects drift, preserves service-role bypass and rejects an absent identity', () =>
  isolated(async () => {
    await db.exec("select set_config('test.active','false',false)");
    await request('/trip_exceptions', 'GET', 'service_role');
    await db.exec('reset role');
    await db.exec("select set_config('test.uid','',false)");
    expect(await value('select safebus_private.has_completed_optional_mfa() value')).toBe(false);
    await expect(db.exec(migration)).rejects.toMatchObject({ code: '55000' });
  }));
