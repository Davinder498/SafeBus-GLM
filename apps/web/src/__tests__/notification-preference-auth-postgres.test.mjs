// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('allows only own notification fields without recent auth and preserves access-change checks', async () => {
  const db = new PGlite();
  const user = '10000000-0000-4000-8000-000000000001';
  const guardian = '20000000-0000-4000-8000-000000000001';
  const tenant = '30000000-0000-4000-8000-000000000001';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema safebus_private;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.uid',true),'')::uuid;
      $$;
      create function public.is_current_user_session_active() returns boolean language sql stable as $$
        select current_setting('test.active',true) = 'true';
      $$;
      create function safebus_private.enforce_mfa_if_required() returns void language plpgsql as $$ begin end; $$;
      create function safebus_private.enforce_recent_auth_for_sensitive_action() returns void language plpgsql as $$
        begin raise exception 'Recent authentication required' using errcode='55006'; end; $$;
      create table profiles(id uuid, tenant_id uuid, role text, status text);
      create table tenants(id uuid, status text);
      create table guardians(id uuid, profile_id uuid, tenant_id uuid, status text);
      create table student_guardians(
        id integer primary key, guardian_id uuid, tenant_id uuid, student_id integer,
        status text, access_expires_at timestamptz, can_receive_notifications boolean,
        notify_pickup boolean, notify_dropoff boolean,
        notification_preferences_set_at timestamptz, updated_at timestamptz,
        future_access_field text default 'protected'
      );
      insert into profiles values('${user}','${tenant}','guardian','active');
      insert into tenants values('${tenant}','active');
      insert into guardians values('${guardian}','${user}','${tenant}','active');
      insert into student_guardians(id,guardian_id,tenant_id,student_id,status)
        values(1,'${guardian}','${tenant}',1,'active');
      select set_config('test.uid','${user}',false), set_config('test.active','true',false);
    `);
    await db.exec(
      await readFile(
        '../../supabase/migrations/pending/20261024215400_notification_preference_auth_scope.sql',
        'utf8',
      ),
    );
    await db.exec(`create trigger security before insert or update or delete on student_guardians
      for each row execute function safebus_private.enforce_sensitive_admin_mutation();`);

    await db.exec(`update student_guardians set can_receive_notifications=true, notify_pickup=true,
      notify_dropoff=false, notification_preferences_set_at=now(), updated_at=now() where id=1;`);
    expect(
      (await db.query('select notify_pickup from student_guardians')).rows[0].notify_pickup,
    ).toBe(true);
    for (const assignment of [
      "status='inactive'",
      'student_id=2',
      'access_expires_at=now()',
      "future_access_field='changed'",
      "guardian_id='20000000-0000-4000-8000-000000000002'",
      "tenant_id='30000000-0000-4000-8000-000000000002'",
      "status='inactive', notify_pickup=false",
    ]) {
      await expect(
        db.exec('update student_guardians set ' + assignment + ' where id=1'),
      ).rejects.toMatchObject({ code: '55006' });
    }
    await expect(db.exec('delete from student_guardians where id=1')).rejects.toMatchObject({
      code: '55006',
    });
    await expect(
      db.exec(
        `insert into student_guardians(id,guardian_id,tenant_id) values(2,'${guardian}','${tenant}')`,
      ),
    ).rejects.toMatchObject({ code: '55006' });
    for (const setup of [
      "select set_config('test.active','false',false)",
      `select set_config('test.uid','10000000-0000-4000-8000-000000000002',false)`,
      "update guardians set status='inactive'",
      "update profiles set status='suspended'",
      "update tenants set status='suspended'",
      "update profiles set role='driver'",
    ]) {
      await db.exec('begin');
      await db.exec(setup);
      await expect(
        db.exec('update student_guardians set notify_pickup=false where id=1'),
      ).rejects.toMatchObject({ code: '55006' });
      await db.exec('rollback');
    }
    // Keep the existing hosted onboarding exception when replacing the guard.
    await db.exec(`update profiles set status='invited';
      create trigger profile_security before update of role,status on profiles
        for each row execute function safebus_private.enforce_sensitive_admin_mutation();
      update profiles set status='active' where id='${user}';`);
    await expect(db.exec("update profiles set status='suspended'")).rejects.toMatchObject({
      code: '55006',
    });
    await expect(db.exec("update profiles set role='driver'")).rejects.toMatchObject({
      code: '55006',
    });
  } finally {
    await db.close();
  }
}, 30000);

it('enforces opted-in MFA on API and RLS while permitting only sign-in bootstrap', async () => {
  const db = new PGlite();
  const user = '10000000-0000-4000-8000-000000000001';
  const other = '10000000-0000-4000-8000-000000000002';
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema safebus_private;
      grant usage on schema auth,safebus_private to authenticated,service_role;
      create function auth.uid() returns uuid language sql stable as $$ select '${user}'::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select jsonb_build_object('aal',current_setting('test.aal',true)); $$;
      create function auth.role() returns text language sql stable as $$ select current_user::text $$;
      create function public.is_current_user_session_active() returns boolean language sql stable as $$
        select current_setting('test.active',true)='true'; $$;
      create table profiles(id uuid primary key, role text);
      create table auth.mfa_factors(user_id uuid,status text);
      create table operations(id integer);
      alter table profiles enable row level security;
      alter table operations enable row level security;
      create policy existing_profile on profiles for select to authenticated using(true);
      create policy existing_operations on operations for all to authenticated using(true) with check(true);
      grant select on profiles to authenticated;
      grant select,insert on operations to authenticated;
      insert into profiles values('${user}','guardian'),('${other}','guardian');
      insert into operations values(1);
      select set_config('test.active','true',false),set_config('test.aal','aal1',false);
    `);
    await db.exec(
      await readFile(
        '../../supabase/migrations/pending/20261024215633_optional_recipient_mfa.sql',
        'utf8',
      ),
    );
    async function request(path, method = 'POST') {
      await db.query(
        "select set_config('request.path',$1,false),set_config('request.method',$2,false)",
        [path, method],
      );
      await db.exec('set role authenticated');
      try {
        await db.exec('select safebus_private.enforce_active_api_session()');
      } finally {
        await db.exec('reset role');
      }
    }
    await request('/rpc/set_guardian_delivery_preferences_v3');
    // Unverified enrollment does not opt the user in or lock them out.
    await db.exec(`insert into auth.mfa_factors values('${user}','unverified')`);
    await request('/rpc/set_guardian_delivery_preferences_v3');
    await db.exec("update auth.mfa_factors set status='verified'");
    for (const path of [
      '/rpc/set_guardian_delivery_preferences_v3',
      '/rpc/get_guardian_bus_visibility',
      '/operations',
    ]) {
      await expect(request(path)).rejects.toMatchObject({ code: '42501' });
    }
    await request('/profiles', 'GET');
    await expect(request('/profiles', 'PATCH')).rejects.toMatchObject({ code: '42501' });
    await request('/rpc/register_current_user_session');
    await request('/rpc/record_own_auth_event');
    await expect(request('/rpc/register_current_user_session', 'GET')).rejects.toMatchObject({
      code: '42501',
    });
    await db.exec('set role authenticated');
    expect((await db.query('select id from profiles')).rows).toEqual([{ id: user }]);
    expect((await db.query('select * from operations')).rows).toEqual([]);
    await expect(db.exec('insert into operations values(2)')).rejects.toMatchObject({
      code: '42501',
    });
    await db.exec('reset role');
    await db.exec("select set_config('test.aal','aal2',false)");
    await request('/rpc/set_guardian_delivery_preferences_v3');
    await db.exec('set role authenticated');
    expect((await db.query('select * from operations')).rows).toEqual([{ id: 1 }]);
    await db.exec('reset role');
    // Driver enrollment has exactly the same enforcement.
    await db.exec(
      `update profiles set role='driver' where id='${user}'; select set_config('test.aal','aal1',false)`,
    );
    await expect(request('/rpc/set_driver_delivery_preferences')).rejects.toMatchObject({
      code: '42501',
    });
    await db.exec('delete from auth.mfa_factors');
    await request('/rpc/set_driver_delivery_preferences');
    await db.exec("select set_config('test.active','false',false)");
    await expect(request('/rpc/register_current_user_session')).rejects.toMatchObject({
      code: '42501',
    });
    await request('/rpc/is_current_user_session_active');
  } finally {
    await db.close();
  }
}, 30000);
