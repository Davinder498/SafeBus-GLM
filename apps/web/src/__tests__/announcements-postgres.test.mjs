// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const definition = (sql, name) =>
  sql.match(
    new RegExp(
      `create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\([\\s\\S]*?\\$\\$;`,
      'i',
    ),
  )[0];
it('broadcasts only within authorized audiences, preserves opt-outs, and deduplicates retries', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      await readFile('../../tests/release/fixtures/tracking-worker-baseline.sql', 'utf8'),
    );
    await db.exec(
      await readFile('../../tests/release/fixtures/trip-notification-baseline.sql', 'utf8'),
    );
    await db.exec(`
      set check_function_bodies = false;
      alter table profiles add full_name text, add email text;
      create table schools(id uuid primary key, tenant_id uuid, status text default 'active');
      alter table students add school_id uuid;
      create table driver_route_assignments(id uuid primary key,tenant_id uuid,driver_id uuid,route_id uuid,status text default 'active',effective_from date,effective_to date);
      alter table user_notification_settings add in_app_enabled boolean default true, add updated_at timestamptz;
      alter table user_notification_category_preferences add in_app_enabled boolean default true, add updated_at timestamptz;
      alter table user_notifications add constraint user_notifications_event_type_check check(true), add constraint user_notifications_source_type_check check(true);
      alter table guardian_notification_outbox add constraint guardian_notification_outbox_type_check check(true);
      create unique index guardian_notification_outbox_user_notification_unique on guardian_notification_outbox(tenant_id,guardian_id,user_notification_id,notification_type) where user_notification_id is not null;
      create unique index driver_email_unique on guardian_notification_outbox(tenant_id,recipient_profile_id,user_notification_id,notification_type) where user_notification_id is not null;
      create or replace function public.is_current_user_session_active() returns boolean language sql stable as $$ select coalesce(current_setting('test.active',true),'true') = 'true' $$;
      create function safebus_private.has_completed_optional_mfa() returns boolean language sql stable as $$ select coalesce(current_setting('test.mfa',true),'true') = 'true' $$;
      create function safebus_private.enforce_mfa_if_required() returns void language plpgsql as $$ begin
        if not safebus_private.has_completed_optional_mfa() then raise exception 'MFA required' using errcode='55006'; end if; end; $$;
      create function safebus_private.guardian_email_outbox_is_eligible_legacy(uuid) returns boolean language sql as $$ select false $$;
      create function safebus_private.guardian_trip_notification_is_eligible(public.user_notifications,boolean) returns boolean language sql as $$ select false $$;
    `);
    const base = await readFile(
      '../../supabase/migrations/0092_end_to_end_notification_system.sql',
      'utf8',
    );
    for (const name of [
      'safebus_private.send_notification_invalidation',
      'safebus_private.enqueue_user_notification',
    ])
      await db.exec(definition(base, name));
    const guardianSql = await readFile(
      '../../supabase/migrations/0110_cool_cloud_notification_preferences.sql',
      'utf8',
    );
    await db.exec(
      definition(guardianSql, 'safebus_private.guardian_email_outbox_is_eligible').replace(
        'safebus_private.guardian_email_outbox_is_eligible(',
        'safebus_private.guardian_email_outbox_is_eligible_legacy(',
      ),
    );
    await db.exec(
      await readFile(
        '../../supabase/migrations/pending/20261025002759_authority_announcements.sql',
        'utf8',
      ),
    );
    await db.exec(`
      create trigger driver_scope before insert on user_notifications for each row execute function safebus_private.enforce_driver_assignment_only_notification();
      create trigger visibility before insert on user_notifications for each row execute function safebus_private.capture_notification_inbox_visibility();
      create trigger driver_email after insert on user_notifications for each row execute function safebus_private.enqueue_driver_assignment_email();
      create trigger guardian_email after insert on user_notifications for each row execute function safebus_private.enqueue_guardian_email_for_notification();
      create trigger email_guard before insert on guardian_notification_outbox for each row execute function safebus_private.enforce_guardian_notification_enqueue();
      insert into tenants(id) values('${id(1)}'),('${id(2)}');
      insert into schools(id,tenant_id) values('${id(10)}','${id(1)}'),('${id(11)}','${id(1)}'),('${id(12)}','${id(2)}');
      insert into profiles(id,tenant_id,role,full_name,school_id) values
        ('${id(20)}','${id(1)}','tenant_admin','Admin',null),
        ('${id(21)}','${id(1)}','school_admin','School admin','${id(10)}'),
        ('${id(22)}','${id(2)}','tenant_admin','Other admin',null),
        ('${id(30)}','${id(1)}','guardian','Guardian',null),
        ('${id(31)}','${id(1)}','guardian','Second guardian',null),
        ('${id(32)}','${id(2)}','guardian','Other guardian',null),
        ('${id(40)}','${id(1)}','driver','Driver',null),
        ('${id(41)}','${id(1)}','driver','Second driver',null),
        ('${id(42)}','${id(2)}','driver','Other driver',null);
      insert into guardians(id,tenant_id,profile_id) values('${id(50)}','${id(1)}','${id(30)}'),('${id(51)}','${id(1)}','${id(31)}'),('${id(52)}','${id(2)}','${id(32)}');
      insert into drivers(id,tenant_id,profile_id) values('${id(60)}','${id(1)}','${id(40)}'),('${id(61)}','${id(1)}','${id(41)}'),('${id(62)}','${id(2)}','${id(42)}');
      insert into students(id,tenant_id,school_id) values('${id(70)}','${id(1)}','${id(10)}'),('${id(71)}','${id(1)}','${id(11)}'),('${id(72)}','${id(2)}','${id(12)}'),('${id(73)}','${id(1)}','${id(10)}');
      insert into student_guardians(id,tenant_id,student_id,guardian_id) values('${id(80)}','${id(1)}','${id(70)}','${id(50)}'),('${id(81)}','${id(1)}','${id(71)}','${id(51)}'),('${id(82)}','${id(2)}','${id(72)}','${id(52)}'),('${id(83)}','${id(1)}','${id(73)}','${id(50)}');
      insert into routes(id,tenant_id,school_id) values('${id(90)}','${id(1)}','${id(10)}'),('${id(91)}','${id(1)}','${id(11)}');
      insert into driver_route_assignments(id,tenant_id,driver_id,route_id) values('${id(92)}','${id(1)}','${id(60)}','${id(90)}'),('${id(93)}','${id(1)}','${id(61)}','${id(91)}');
      insert into guardian_notification_delivery_policies(tenant_id) values('${id(1)}'),('${id(2)}');
      insert into user_notification_settings(profile_id,tenant_id,push_enabled,email_enabled,in_app_enabled) select id,tenant_id,true,true,true from profiles;
      insert into user_notification_category_preferences(profile_id,category) select id,'operations' from profiles;
      update user_notification_category_preferences set push_enabled=false,email_enabled=false,in_app_enabled=false where profile_id='${id(31)}';
      insert into android_push_devices(id,tenant_id,profile_id) values('${id(94)}','${id(1)}','${id(30)}'),('${id(95)}','${id(1)}','${id(31)}'),('${id(96)}','${id(1)}','${id(40)}');
      grant usage on schema auth to authenticated;
      select set_config('request.jwt.claim.sub','${id(20)}',false);
    `);
    const call = async (sql, params = []) => (await db.query(sql, params)).rows[0];
    const audience = async (target) =>
      (await call('select public.get_announcement_audience($1) as value', [target])).value;
    expect(await audience('all')).toEqual({ guardians: 2, drivers: 2, total: 4 });
    expect(await audience('guardians')).toEqual({ guardians: 2, drivers: 0, total: 2 });
    expect(await audience('drivers')).toEqual({ guardians: 0, drivers: 2, total: 2 });
    const send = async (n, target = 'all', count = 4) =>
      (
        await call('select public.send_authority_announcement($1,$2,$3,$4,$5) as value', [
          id(n),
          target,
          'Service cancelled',
          'No bus service tomorrow.',
          count,
        ])
      ).value;
    await db.exec('set role authenticated');
    expect((await send(100)).recipientCount).toBe(4);
    expect((await send(100)).recipientCount).toBe(4);
    await expect(
      db.query('select * from safebus_private.authority_announcements'),
    ).rejects.toMatchObject({ code: '42501' });
    await db.exec('reset role');
    expect((await call('select count(*)::int as n from user_notifications')).n).toBe(4);
    expect((await call('select count(*)::int as n from push_notification_outbox')).n).toBe(2);
    expect((await call('select count(*)::int as n from guardian_notification_outbox')).n).toBe(3);
    expect(
      (
        await call(
          `select in_app_visible from user_notifications where recipient_profile_id='${id(31)}'`,
        )
      ).in_app_visible,
    ).toBe(false);
    const notice = (
      await db.query(`select n.* from user_notifications n where recipient_profile_id='${id(30)}'`)
    ).rows[0];
    expect(
      (
        await call(
          `select c.* from user_notifications n cross join lateral safebus_private.notification_copy(n) c where n.id=$1`,
          [notice.id],
        )
      ).title,
    ).toBe('Service cancelled');
    await expect(send(100, 'drivers', 2)).rejects.toMatchObject({ code: '22023' });
    await expect(send(101, 'all', 3)).rejects.toMatchObject({ code: '22023' });
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(21)]);
    expect(await audience('all')).toEqual({ guardians: 1, drivers: 1, total: 2 });
    await send(102, 'all', 2);
    expect((await call('select public.get_authority_announcements() as value')).value).toHaveLength(
      1,
    );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(22)]);
    expect((await call('select public.get_authority_announcements() as value')).value).toEqual([]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(30)]);
    await expect(audience('all')).rejects.toMatchObject({ code: '42501' });
    await expect(send(103)).rejects.toMatchObject({ code: '42501' });
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(20)]);
    await db.exec("select set_config('test.mfa','false',false)");
    await expect(send(103)).rejects.toMatchObject({ code: '55006' });
    await db.exec(
      "select set_config('test.mfa','true',false),set_config('test.active','false',false)",
    );
    await expect(send(103)).rejects.toMatchObject({ code: '42501' });
    await db.exec("select set_config('test.active','true',false)");
    const email = (
      await db.query('select id from guardian_notification_outbox where user_notification_id=$1', [
        notice.id,
      ])
    ).rows[0];
    expect(
      (
        await call('select safebus_private.notification_email_outbox_is_eligible($1) as allowed', [
          email.id,
        ])
      ).allowed,
    ).toBe(true);
    await db.exec(`update student_guardians set status='inactive' where guardian_id='${id(50)}'`);
    expect(
      (
        await call('select safebus_private.notification_email_outbox_is_eligible($1) as allowed', [
          email.id,
        ])
      ).allowed,
    ).toBe(false);
    expect(
      (
        await call(
          'select safebus_private.announcement_recipient_is_current(n) as allowed from user_notifications n where n.id=$1',
          [notice.id],
        )
      ).allowed,
    ).toBe(false);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(40)]);
    const preferences = (await call('select public.get_driver_delivery_preferences_v2() as value'))
      .value;
    expect(preferences.operational_alerts).toEqual({ in_app: true, push: true, email: true });
    const driverEmail = (
      await db.query(
        `select o.id from guardian_notification_outbox o join user_notifications n on n.id=o.user_notification_id where n.source_id='${id(102)}' and n.recipient_profile_id='${id(40)}'`,
      )
    ).rows[0];
    expect(
      (
        await call('select safebus_private.notification_email_outbox_is_eligible($1) as allowed', [
          driverEmail.id,
        ])
      ).allowed,
    ).toBe(true);
    await db.exec(
      `update driver_route_assignments set status='inactive' where driver_id='${id(60)}'`,
    );
    expect(
      (
        await call('select safebus_private.notification_email_outbox_is_eligible($1) as allowed', [
          driverEmail.id,
        ])
      ).allowed,
    ).toBe(false);
    await db.exec(
      `update driver_route_assignments set status='active' where driver_id='${id(60)}'`,
    );
    preferences.operational_alerts = { in_app: false, push: false, email: false };
    expect(
      (await call('select public.set_driver_delivery_preferences_v2($1) as value', [preferences]))
        .value.operational_alerts,
    ).toEqual(preferences.operational_alerts);
    expect(
      (
        await call('select safebus_private.notification_email_outbox_is_eligible($1) as allowed', [
          driverEmail.id,
        ])
      ).allowed,
    ).toBe(false);
    await expect(
      db.query('select public.set_driver_delivery_preferences_v2($1)', [{}]),
    ).rejects.toMatchObject({ code: '22023' });
    await db.exec("select set_config('test.mfa','false',false)");
    await expect(
      db.query('select public.get_driver_delivery_preferences_v2()'),
    ).rejects.toMatchObject({ code: '42501' });
  } finally {
    await db.close();
  }
}, 30000);
