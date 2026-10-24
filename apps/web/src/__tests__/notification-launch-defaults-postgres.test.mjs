// @vitest-environment node
// Embedded PostgreSQL only. No hosted credentials, email, push, or fixture writes.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const target = 'a7033cbe-9bc7-4508-89bd-0a19270a2c15';
const paused = '10000000-0000-4000-8000-000000000001';
const rejected = '10000000-0000-4000-8000-000000000002';
const unrelated = '10000000-0000-4000-8000-000000000003';
const fresh = '10000000-0000-4000-8000-000000000004';
const actor = '20000000-0000-4000-8000-000000000001';
const read = (file) => readFile(resolve('../../', file), 'utf8');
let db, migration, existing;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema safebus_private;
    grant usage on schema auth to authenticated;
    create type public.user_role as enum ('tenant_admin','guardian','driver');
    create table public.tenants(id uuid primary key, name text, status text default 'active');
    create table public.profiles(id uuid primary key);
    create table public.audit_events(actor uuid, detail jsonb);
    create table public.user_notification_settings(
      profile_id uuid primary key, push_enabled boolean default false,
      email_enabled boolean default false, quiet_hours_enabled boolean default true);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.actor',true),'')::uuid $$;
    create function public.current_tenant_id() returns uuid language sql stable as $$
      select nullif(current_setting('test.tenant',true),'')::uuid $$;
    create function public.current_user_role() returns public.user_role language sql stable as $$
      select nullif(current_setting('test.role',true),'')::public.user_role $$;
    create function safebus_private.set_updated_at() returns trigger language plpgsql as $$
      begin new.updated_at = now(); return new; end $$;
    create function public.phase5_write_audit_event(uuid,text,text,uuid,text,jsonb)
      returns void language sql as $$ insert into public.audit_events values($1,$6) $$;
    insert into public.profiles values('${actor}');
    insert into public.user_notification_settings(profile_id) values('${actor}');
  `);
  const foundation = await read(
    'supabase/migrations/0087_phase8_guardian_experience_notifications.sql',
  );
  // Use the real policy table and trigger, reconciled to the hosted private
  // function names. No other milestone data writers run in this harness.
  await db.exec(
    foundation
      .slice(
        foundation.indexOf('create table public.guardian_notification_delivery_policies'),
        foundation.indexOf('-- Guardian-owned, expiry-aware'),
      )
      .replaceAll(
        'public.create_default_guardian_notification_policy',
        'safebus_private.create_default_guardian_notification_policy',
      )
      .replaceAll('public.set_updated_at()', 'safebus_private.set_updated_at()'),
  );
  const push = await read('supabase/migrations/0092_end_to_end_notification_system.sql');
  await db.exec(
    push.slice(
      push.indexOf('alter table public.guardian_notification_delivery_policies'),
      push.indexOf('create table public.user_notifications'),
    ),
  );
  await db.exec(await read('supabase/migrations/0118_tenant_notification_control_center.sql'));
  await db.exec(`
    insert into public.tenants(id,name) values
      ('${target}','Test School District'), ('${paused}','Synthetic paused'),
      ('${rejected}','Synthetic rejected'), ('${unrelated}','Synthetic pending');
    update public.guardian_notification_delivery_policies
      set privacy_review_status='approved',privacy_approved_at='2026-10-01',
          push_delivery_preference_enabled=true where tenant_id='${paused}';
    update public.guardian_notification_delivery_policies
      set privacy_review_status='rejected' where tenant_id='${rejected}';
    update public.guardian_notification_delivery_policies
      set tenant_daily_limit=77,push_tenant_daily_limit=88 where tenant_id='${target}';
  `);
  existing = (
    await db.query(
      'select * from public.guardian_notification_delivery_policies where tenant_id <> $1 order by tenant_id',
      [target],
    )
  ).rows;
  migration = await read(
    'supabase/migrations/pending/20261024203929_launch_ready_notification_defaults.sql',
  );
  await db.exec(migration);
}, 30000);

afterAll(async () => {
  await db?.close();
});

async function settings(tenantId, role = 'tenant_admin') {
  await db.query(
    "select set_config('test.tenant',$1,false),set_config('test.actor',$2,false),set_config('test.role',$3,false)",
    [tenantId, actor, role],
  );
  return (await db.query('select public.get_tenant_notification_settings() as value')).rows[0]
    .value;
}

describe('launch-ready notification provisioning in PostgreSQL', () => {
  it('provisions a new school authority atomically with usable notification controls', async () => {
    await db.query('insert into public.tenants(id,name) values($1,$2)', [
      fresh,
      'Synthetic new authority',
    ]);
    expect(await settings(fresh)).toMatchObject({
      notifications_enabled: true,
      push_notifications_enabled: true,
      email_effective: true,
      push_effective: true,
      privacy_review_status: 'approved',
    });
    expect((await settings(fresh)).privacy_approved_at).not.toBeNull();
    const policy = (
      await db.query(
        'select privacy_approved_by from public.guardian_notification_delivery_policies where tenant_id=$1',
        [fresh],
      )
    ).rows[0];
    expect(policy.privacy_approved_by).toBeNull();
  });

  it('repairs only the identified account at the old defaults and preserves limits', async () => {
    expect(await settings(target)).toMatchObject({ email_effective: true, push_effective: true });
    expect(
      (
        await db.query(
          'select tenant_daily_limit,push_tenant_daily_limit from public.guardian_notification_delivery_policies where tenant_id=$1',
          [target],
        )
      ).rows[0],
    ).toEqual({ tenant_daily_limit: 77, push_tenant_daily_limit: 88 });
    expect(
      (
        await db.query(
          'select * from public.guardian_notification_delivery_policies where tenant_id <> $1 and tenant_id <> $2 order by tenant_id',
          [target, fresh],
        )
      ).rows,
    ).toEqual(existing);
  });

  it('does not subscribe people, change opt-outs, or turn off quiet hours', async () => {
    expect(
      (
        await db.query(
          'select push_enabled,email_enabled,quiet_hours_enabled from public.user_notification_settings where profile_id=$1',
          [actor],
        )
      ).rows[0],
    ).toEqual({ push_enabled: false, email_enabled: false, quiet_hours_enabled: true });
    expect(
      (await db.query('select count(*)::integer as total from public.audit_events')).rows[0].total,
    ).toBe(0);
  });

  it('preserves an administrator pause and saved push choice, including on migration replay', async () => {
    await settings(fresh);
    await db.query('select public.set_tenant_notification_delivery_enabled(false)');
    expect(await settings(fresh)).toMatchObject({
      notifications_enabled: false,
      push_notifications_enabled: true,
      push_effective: false,
    });
    await db.exec(migration);
    expect(await settings(fresh)).toMatchObject({ email_effective: false, push_effective: false });
    await db.query('select public.set_tenant_notification_delivery_enabled(true)');
    expect(await settings(fresh)).toMatchObject({ email_effective: true, push_effective: true });
    expect((await db.query('select detail from public.audit_events')).rows).toHaveLength(2);
  });

  it('retains approval consistency and role restrictions', async () => {
    await expect(
      db.query(
        'update public.guardian_notification_delivery_policies set privacy_approved_at=null where tenant_id=$1',
        [fresh],
      ),
    ).rejects.toThrow('guardian_notification_policy_approval_check');
    await expect(settings(fresh, 'guardian')).rejects.toThrow('active tenant administrator');
    await settings(fresh);
    await db.exec('set role authenticated');
    try {
      expect(
        (await db.query('select public.get_tenant_notification_settings() as value')).rows[0].value
          .email_effective,
      ).toBe(true);
      await expect(
        db.query('select * from public.guardian_notification_delivery_policies'),
      ).rejects.toThrow('permission denied');
      await expect(
        db.query('select safebus_private.create_default_guardian_notification_policy()'),
      ).rejects.toThrow('permission denied');
    } finally {
      await db.exec('reset role');
    }
  });

  it('rolls back the policy along with an incomplete school authority creation', async () => {
    const rolledBack = '10000000-0000-4000-8000-000000000005';
    await db.exec('begin');
    try {
      await db.query('insert into public.tenants(id,name) values($1,$2)', [
        rolledBack,
        'Synthetic rollback',
      ]);
      expect(
        (
          await db.query(
            'select count(*)::integer as total from public.guardian_notification_delivery_policies where tenant_id=$1',
            [rolledBack],
          )
        ).rows[0].total,
      ).toBe(1);
    } finally {
      await db.exec('rollback');
    }
    expect(
      (
        await db.query(
          'select count(*)::integer as total from public.guardian_notification_delivery_policies where tenant_id=$1',
          [rolledBack],
        )
      ).rows[0].total,
    ).toBe(0);
  });
});
