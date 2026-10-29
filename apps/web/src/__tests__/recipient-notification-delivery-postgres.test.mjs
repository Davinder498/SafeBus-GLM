// @vitest-environment node
// Embedded PostgreSQL only. No hosted credentials or network requests.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  capturePushRecovery,
  pushRecoverySql,
  rehearseRecipientPush,
  recipientPushFailureCode,
  recipientPushState,
  reviewedPushDefinitions,
  verifyInstalledRecipientPush,
} from '../../../../tests/release/helpers/recipient-push-rollout.mjs';
import { buildFcmMessage } from '../../../../supabase/functions/_shared/push-dispatcher-core.mjs';
import { runPushDispatcher } from '../../../../tests/release/helpers/legacy-push-dispatcher.mjs';

const read = (path) => readFile(`../../${path}`, 'utf8');
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const definition = (sql, name) => {
  const match = sql.match(
    new RegExp(
      `create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\([\\s\\S]*?\\$\\$;`,
      'i',
    ),
  );
  if (!match) throw new Error(`Missing ${name}`);
  return match[0];
};
let db;
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const isolated = async (run) => {
  await db.exec('begin');
  try {
    await run();
  } finally {
    await db.exec('rollback');
  }
};
const emit = (role, number, profile = role === 'guardian' ? 2 : 3) =>
  query(
    `
  insert into user_notifications(tenant_id,recipient_profile_id,recipient_role,event_type,category,severity,driver_trip_id)
  values($1,$2,$3,'trip_started','trip_status','info',$4) returning id`,
    [id(1), id(profile), role, id(10 + number)],
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(await read('tests/release/fixtures/tracking-worker-baseline.sql'));
  await db.exec(await read('tests/release/fixtures/trip-notification-baseline.sql'));
  await db.exec(`
    set check_function_bodies = false;
    alter table guardian_notification_delivery_policies add push_delivery_preference_enabled boolean default false, add updated_at timestamptz default now();
    alter table tenants add timezone text default 'America/Edmonton';
    alter table user_notification_settings add quiet_hours_enabled boolean default false,
      add quiet_hours_start time default '21:00', add quiet_hours_end time default '07:00',
      add timezone_override text, add urgent_bypass_quiet_hours boolean default false;
    alter table guardian_notification_outbox add available_after timestamptz default now(), add created_at timestamptz default now(),
      add delivered_at timestamptz, add last_attempted_at timestamptz, add claimed_at timestamptz,
      add claim_expires_at timestamptz, add attempt_count integer default 0, add cancelled_at timestamptz,
      add failure_category text, add failure_reason text;
    create unique index guardian_email_unique on guardian_notification_outbox(user_notification_id);
    create unique index guardian_email_scoped_unique on guardian_notification_outbox(tenant_id,guardian_id,user_notification_id,notification_type) where user_notification_id is not null;
    create function safebus_private.current_tenant_id() returns uuid language sql stable as $$ select tenant_id from public.profiles where id=auth.uid() $$;
    create function safebus_private.current_user_role() returns public.user_role language sql stable as $$ select role from public.profiles where id=auth.uid() $$;
    -- Announcement scope itself is covered by announcements-postgres.test.mjs.
    create function safebus_private.announcement_recipient_is_current(public.user_notifications) returns boolean language sql as $$ select false $$;
    create function safebus_private.guardian_email_outbox_is_eligible(uuid) returns boolean language sql as $$ select safebus_private.notification_email_outbox_is_eligible($1) $$;

  `);
  const base = await read('supabase/migrations/0092_end_to_end_notification_system.sql');
  await db.exec('alter table public.push_notification_outbox add provider_message_id text');
  for (const name of [
    'safebus_private.send_notification_invalidation',
    'safebus_private.enqueue_user_notification',
    'public.complete_push_notification_delivery',
  ])
    await db.exec(definition(base, name));
  await db.exec('drop function safebus_private.next_push_availability(uuid,uuid,text)');
  await db.exec(definition(base, 'safebus_private.notification_is_urgent'));
  await db.exec(definition(base, 'safebus_private.next_push_availability'));
  const announcements = await read(
    'supabase/migrations/pending/20261025002759_authority_announcements.sql',
  );
  await db.exec(definition(announcements, 'safebus_private.driver_notification_is_eligible'));
  const trip = await read(
    'supabase/migrations/pending/20261018032558_guardian_trip_notification_deduplication.sql',
  );
  await db.exec(definition(trip, 'safebus_private.guardian_trip_notification_is_eligible'));
  await db.exec(await read('tests/release/fixtures/notification-policy-hosted-20261026.sql'));
  await db.exec(
    await read('supabase/migrations/pending/20261026171535_recipient_notification_delivery.sql'),
  );
  await db.exec(`
    create trigger driver_email after insert on user_notifications for each row execute function safebus_private.enqueue_driver_assignment_email();
    create trigger guardian_email after insert on user_notifications for each row execute function safebus_private.enqueue_guardian_email_for_notification();
    create trigger email_guard before insert on guardian_notification_outbox for each row execute function safebus_private.enforce_guardian_notification_enqueue();
    insert into tenants(id) values('${id(1)}'),('${id(99)}');
    insert into profiles(id,tenant_id,role) values('${id(2)}','${id(1)}','guardian'),('${id(3)}','${id(1)}','driver'),('${id(4)}','${id(1)}','tenant_admin');
    insert into guardians(id,tenant_id,profile_id) values('${id(5)}','${id(1)}','${id(2)}');
    insert into drivers(id,tenant_id,profile_id) values('${id(6)}','${id(1)}','${id(3)}');
    insert into students(id,tenant_id) values('${id(7)}','${id(1)}');
    insert into student_guardians(id,tenant_id,guardian_id,student_id) values('${id(8)}','${id(1)}','${id(5)}','${id(7)}');
    insert into guardian_student_push_preferences values('${id(8)}','trip_status',true);
    insert into bus_route_assignments(id,tenant_id,bus_id,route_id,route_trip_pattern_id) values('${id(9)}','${id(1)}','${id(20)}','${id(21)}','${id(22)}');
    insert into student_bus_assignments(id,tenant_id,student_id,bus_route_assignment_id,route_trip_pattern_id,effective_from) values('${id(23)}','${id(1)}','${id(7)}','${id(9)}','${id(22)}',current_date);
    insert into driver_trips(id,tenant_id,driver_id,bus_id,route_id,route_trip_pattern_id)
      select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${id(1)}','${id(6)}','${id(20)}','${id(21)}','${id(22)}' from generate_series(10,19) n;
    insert into guardian_notification_delivery_policies(tenant_id,notifications_enabled,push_notifications_enabled) values('${id(1)}',false,false);
    insert into user_notification_settings(profile_id,tenant_id) values('${id(2)}','${id(1)}'),('${id(3)}','${id(1)}');
    insert into user_notification_category_preferences(profile_id,category) values('${id(2)}','trip_status'),('${id(3)}','trip_status');
    insert into android_push_devices(id,tenant_id,profile_id) values('${id(30)}','${id(1)}','${id(2)}'),('${id(31)}','${id(1)}','${id(3)}');
    select set_config('request.jwt.claim.role','service_role',false);
  `);
}, 60_000);
afterAll(async () => db?.close());

it('rejects baseline drift and rehearses the explicit schema rollback', () =>
  isolated(async () => {
    await db.exec(await read('docs/operations/recipient-notification-delivery-rollback.sql'));
    const config = JSON.parse(await read('config/pending/recipient-notification-delivery.json'));
    for (const entry of config.baseline) {
      expect(
        (
          await query(
            "select md5(replace(pg_get_functiondef(to_regprocedure($1)),chr(13),'')) as digest",
            [entry.signature],
          )
        )[0].digest,
      ).toBe(entry.md5);
    }
    await db.exec(
      'create or replace function safebus_private.enqueue_push_for_notification(p_notification_id uuid) returns void language sql as $$ select null::void $$',
    );
    await db.exec('savepoint drift');
    await expect(
      db.exec(
        await read(
          'supabase/migrations/pending/20261026171535_recipient_notification_delivery.sql',
        ),
      ),
    ).rejects.toThrow('baseline differs');
    await db.exec('rollback to savepoint drift');
  }));

it('delivers guardian and own-trip driver events with legacy authority switches off, then respects opt-outs', () =>
  isolated(async () => {
    for (const role of ['guardian', 'driver']) {
      const [{ id: notice }] = await emit(role, 0);
      await query('select safebus_private.enqueue_push_for_notification($1)', [notice]);
    }
    expect((await query('select count(*)::int as n from push_notification_outbox'))[0].n).toBe(2);
    expect((await query('select count(*)::int as n from guardian_notification_outbox'))[0].n).toBe(
      2,
    );
    expect(
      (
        await query(
          'select count(*)::int as n from public.claim_guardian_notification_email_batch(10)',
        )
      )[0].n,
    ).toBe(2);
    expect(
      (
        await query(
          "select count(*)::int as n from public.claim_push_notification_deliveries('worker')",
        )
      )[0].n,
    ).toBe(2);
    await db.exec('update user_notification_settings set push_enabled=false,email_enabled=false');
    expect(
      (
        await query(
          'select count(*)::int as n from guardian_notification_outbox where safebus_private.guardian_email_outbox_is_eligible(id)',
        )
      )[0].n,
    ).toBe(0);
    expect(
      await query(
        "select * from public.resolve_push_notification_delivery((select id from push_notification_outbox limit 1),'worker')",
      ),
    ).toEqual([]);
    expect((await query('select count(*)::int as n from user_notifications'))[0].n).toBe(2);
  }));

it('preserves category choices, privacy rejection, guardian links, device permission, tenant scope, quiet hours and quotas', () =>
  isolated(async () => {
    await db.exec(
      'update user_notification_category_preferences set push_enabled=false,email_enabled=false',
    );
    const [{ id: off }] = await emit('guardian', 1);
    await query('select safebus_private.enqueue_push_for_notification($1)', [off]);
    expect((await query('select count(*)::int as n from push_notification_outbox'))[0].n).toBe(0);
    expect((await query('select count(*)::int as n from guardian_notification_outbox'))[0].n).toBe(
      0,
    );
    await db.exec(
      "update user_notification_category_preferences set push_enabled=true,email_enabled=true; update guardian_notification_delivery_policies set privacy_review_status='rejected'",
    );
    const [{ id: rejected }] = await emit('guardian', 2);
    await query('select safebus_private.enqueue_push_for_notification($1)', [rejected]);
    expect((await query('select count(*)::int as n from push_notification_outbox'))[0].n).toBe(0);
    await db.exec(
      "update guardian_notification_delivery_policies set privacy_review_status='approved'; update student_guardians set access_expires_at=now()-interval '1 minute'",
    );
    const [{ id: expired }] = await emit('guardian', 3);
    await query('select safebus_private.enqueue_push_for_notification($1)', [expired]);
    expect((await query('select count(*)::int as n from push_notification_outbox'))[0].n).toBe(0);
    await db.exec(
      "update student_guardians set access_expires_at=null; update android_push_devices set permission_state='denied'",
    );
    const [{ id: denied }] = await emit('driver', 4);
    await query('select safebus_private.enqueue_push_for_notification($1)', [denied]);
    expect((await query('select count(*)::int as n from push_notification_outbox'))[0].n).toBe(0);
    await db.exec(
      "update android_push_devices set permission_state='granted'; update user_notification_settings set quiet_hours_enabled=true",
    );
    const [{ at }] = await query(
      "select safebus_private.next_push_availability($1,$2,'trip_started','2026-10-26 04:00Z') as at",
      [id(1), id(2)],
    );
    expect(new Date(at).toISOString()).toBe('2026-10-26T13:00:00.000Z');
    await db.exec(
      'update user_notification_settings set quiet_hours_enabled=false; update guardian_notification_delivery_policies set push_tenant_daily_limit=0,tenant_daily_limit=0',
    );
    const [{ id: limited }] = await emit('driver', 5);
    await query('select safebus_private.enqueue_push_for_notification($1)', [limited]);
    expect(
      await query("select * from public.claim_push_notification_deliveries('worker')"),
    ).toEqual([]);
    expect(await query('select * from public.claim_guardian_notification_email_batch(10)')).toEqual(
      [],
    );
    await db.exec(`update driver_trips set tenant_id='${id(99)}' where id='${id(16)}'`);
    const [{ id: other }] = await emit('driver', 6);
    await query('select safebus_private.enqueue_push_for_notification($1)', [other]);
    expect(
      (
        await query(
          'select count(*)::int as n from push_notification_outbox where notification_id=$1',
          [other],
        )
      )[0].n,
    ).toBe(0);
  }));

it('retires administrator channel mutations without changing personal preferences', () =>
  isolated(async () => {
    const savedPreferences = await query(
      'select * from user_notification_settings order by profile_id',
    );
    await query("select set_config('request.jwt.claim.sub',$1,false)", [id(4)]);
    for (const name of [
      'set_tenant_notification_delivery_enabled',
      'set_tenant_push_notifications_enabled',
    ]) {
      await db.exec('savepoint call');
      await expect(query(`select public.${name}(false)`)).rejects.toThrow(
        'managed by each guardian or driver',
      );
      await db.exec('rollback to savepoint call');
    }
    expect(
      (await query('select public.get_tenant_notification_settings() as settings'))[0].settings
        .push_effective,
    ).toBe(true);
    expect(await query('select * from user_notification_settings order by profile_id')).toEqual(
      savedPreferences,
    );
  }));

it('completely removes authority switches and RPCs while retaining recipient delivery and privacy', () =>
  isolated(async () => {
    await db.exec(await read('docs/operations/recipient-notification-delivery-rollback.sql'));
    await db.exec(`alter table public.guardian_notification_delivery_policies
      add constraint guardian_notification_policy_approval_check check (
      (privacy_review_status='approved' and privacy_approved_at is not null)
      or (privacy_review_status<>'approved' and notifications_enabled=false))`);
    const client = {
      query: async (sql, params) => (params ? db.query(sql, params) : (await db.exec(sql)).at(-1)),
    };
    const signatures = JSON.parse(
      await read('config/pending/complete-recipient-push.json'),
    ).baseline.map((entry) => entry.signature);
    const recovery = await capturePushRecovery(client, signatures);
    const installationConfig = JSON.parse(
      await read('config/pending/complete-recipient-push.json'),
    );
    const reviewedMigration = await read(installationConfig.migration);
    expect(await recipientPushState(client, reviewedMigration, installationConfig.baseline)).toBe(
      'pending',
    );
    await db.exec('savepoint partial_installation');
    await db.exec('drop function public.get_tenant_notification_settings()');
    await expect(
      recipientPushState(client, reviewedMigration, installationConfig.baseline),
    ).rejects.toThrow('Notification schema is partially installed.');
    await db.exec('rollback to partial_installation');
    const before = await query('select * from user_notification_settings order by profile_id');
    await db.exec(
      await read('supabase/migrations/pending/20261026212046_complete_recipient_push_delivery.sql'),
    );
    for (const entry of reviewedPushDefinitions(reviewedMigration, installationConfig.baseline))
      await db.exec(`revoke all on function ${entry.signature} from public,anon,authenticated`);
    for (const table of [
      'guardian_notification_delivery_policies',
      'android_push_devices',
      'push_notification_outbox',
      'user_notification_settings',
      'user_notification_category_preferences',
      'guardian_student_push_preferences',
    ])
      await db.exec(`alter table public.${table} enable row level security`);
    expect(await recipientPushState(client, reviewedMigration, installationConfig.baseline)).toBe(
      'installed',
    );
    expect(
      await verifyInstalledRecipientPush(client, reviewedMigration, installationConfig.baseline),
    ).toMatchObject({ reviewedDefinitionsMatched: 10, authorizationRetained: true });
    await db.exec('savepoint definition_drift');
    const [{ definition: installedDefinition }] = await query(
      "select pg_get_functiondef('safebus_private.enqueue_push_for_notification(uuid)'::regprocedure) as definition",
    );
    await db.exec(installedDefinition.replace('begin', 'begin\n-- unreviewed change'));
    await expect(
      recipientPushState(client, reviewedMigration, installationConfig.baseline),
    ).rejects.toThrow('Installed notification definitions differ');
    await db.exec('rollback to definition_drift');
    await db.exec('savepoint authorization_drift');
    await db.exec(
      'grant execute on function safebus_private.enqueue_push_for_notification(uuid) to authenticated',
    );
    await expect(
      recipientPushState(client, reviewedMigration, installationConfig.baseline),
    ).rejects.toThrow('Installed notification authorization differs');
    await db.exec('rollback to authorization_drift');
    await db.exec('savepoint constraint_drift');
    await db.exec(`alter table public.guardian_notification_delivery_policies
      drop constraint guardian_notification_policy_approval_check;
      alter table public.guardian_notification_delivery_policies
      add constraint guardian_notification_policy_approval_check check (true)`);
    await expect(
      recipientPushState(client, reviewedMigration, installationConfig.baseline),
    ).rejects.toThrow('Recipient push schema acceptance failed.');
    await db.exec('rollback to constraint_drift');
    expect(
      await query(`select column_name from information_schema.columns where table_schema='public'
      and table_name='guardian_notification_delivery_policies' and column_name in
      ('notifications_enabled','push_notifications_enabled','push_delivery_preference_enabled')`),
    ).toEqual([]);
    expect(
      (
        await query(`select to_regprocedure('public.get_tenant_notification_settings()') as legacy`)
      )[0].legacy,
    ).toBeNull();
    for (const name of [
      'set_tenant_notification_delivery_enabled',
      'set_tenant_push_notifications_enabled',
    ])
      expect(
        (await query(`select to_regprocedure($1) as legacy`, [`public.${name}(boolean)`]))[0]
          .legacy,
      ).toBeNull();
    expect(await query('select * from user_notification_settings order by profile_id')).toEqual(
      before,
    );
    for (const role of ['guardian', 'driver']) {
      const args = [id(1), id(role === 'guardian' ? 2 : 3), id(role === 'guardian' ? 10 : 11)];
      const enqueue = () =>
        query(
          `select safebus_private.enqueue_user_notification($1::uuid,$2::uuid,'trip_started',
        'trip_status','info','driver_trip',$3::uuid,$3::text,now(),null,$3::uuid,null) as id`,
          args,
        );
      const [{ id: notice }] = await enqueue();
      expect((await enqueue())[0].id).toBeNull();
      expect(
        (
          await query(
            'select count(*)::int as n from push_notification_outbox where notification_id=$1',
            [notice],
          )
        )[0].n,
      ).toBe(1);
    }
    const messages = [];
    const rpc = async (name, args) => {
      if (
        ![
          'claim_push_notification_deliveries',
          'resolve_push_notification_delivery',
          'complete_push_notification_delivery',
        ].includes(name)
      )
        throw new Error(`Unexpected RPC: ${name}`);
      const values = Object.values(args);
      return query(
        `select * from public.${name}(${values.map((_, i) => '$' + (i + 1)).join(',')})`,
        values,
      );
    };
    await db.exec(`savepoint suspended; update tenants set status='suspended' where id='${id(1)}'`);
    let sentWhileSuspended = false;
    const paused = await runPushDispatcher({
      workerId: 'paused-worker',
      rpc,
      send: async () => {
        sentWhileSuspended = true;
        throw new Error('Suspended authority cannot send.');
      },
    });
    expect(paused.claimed).toBe(0);
    expect(sentWhileSuspended).toBe(false);
    expect(
      (
        await query(
          "select count(*)::int as n from push_notification_outbox where status='cancelled'",
        )
      )[0].n,
    ).toBe(2);
    const [{ id: noQueue }] = await emit('guardian', 4);
    await query('select safebus_private.enqueue_push_for_notification($1)', [noQueue]);
    expect(
      (
        await query(
          'select count(*)::int as n from push_notification_outbox where notification_id=$1',
          [noQueue],
        )
      )[0].n,
    ).toBe(0);
    await db.exec('rollback to suspended');
    const summary = await runPushDispatcher({
      workerId: 'synthetic-worker',
      rpc,
      send: async (row) => {
        messages.push(buildFcmMessage(row));
        return 'projects/test/messages/' + row.notification_id;
      },
    });
    expect(summary).toMatchObject({ claimed: 2, delivered: 2, error: 0, failed: 0 });
    expect(messages).toHaveLength(2);
    expect(messages.every((message) => message.message.android.priority === 'HIGH')).toBe(true);
    expect(
      (
        await query(
          "select count(*)::int as n from push_notification_outbox where status='delivered' and provider_message_id is not null",
        )
      )[0].n,
    ).toBe(2);
    expect(
      (
        await query(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('public','safebus_private') and p.prokind='f'
      and pg_get_functiondef(p.oid) ~ 'notifications_enabled|push_delivery_preference_enabled'`)
      )[0].n,
    ).toBe(0);
    await db.exec('savepoint privacy');
    await expect(
      db.exec(
        `update guardian_notification_delivery_policies set privacy_approved_at=null where tenant_id='${id(1)}'`,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await db.exec('rollback to privacy');
    await db.exec(
      `update guardian_notification_delivery_policies set privacy_review_status='rejected' where tenant_id='${id(1)}'`,
    );
    const [{ id: blocked }] = await emit('guardian', 2);
    await query('select safebus_private.enqueue_push_for_notification($1)', [blocked]);
    expect(
      (
        await query(
          'select count(*)::int as n from push_notification_outbox where notification_id=$1',
          [blocked],
        )
      )[0].n,
    ).toBe(0);
    await db.exec(pushRecoverySql(recovery));
    expect(await capturePushRecovery(client, signatures)).toEqual(recovery);
  }));

it('rehearses the entire rollout and verifies restoration in a separate read-only transaction', async () => {
  await db.exec(await read('docs/operations/recipient-notification-delivery-rollback.sql'));
  await db.exec(`alter table public.guardian_notification_delivery_policies
    add constraint guardian_notification_policy_approval_check check (
    (privacy_review_status='approved' and privacy_approved_at is not null)
    or (privacy_review_status<>'approved' and notifications_enabled=false))`);
  const client = {
    query: async (sql, params) => (params ? db.query(sql, params) : (await db.exec(sql)).at(-1)),
  };
  const signatures = JSON.parse(
    await read('config/pending/complete-recipient-push.json'),
  ).baseline.map((entry) => entry.signature);
  const before = await capturePushRecovery(client, signatures);
  try {
    expect(
      await rehearseRecipientPush(
        client,
        await read(
          'supabase/migrations/pending/20261026212046_complete_recipient_push_delivery.sql',
        ),
        signatures,
      ),
    ).toEqual({ switchesRemoved: true, legacyRpcsRemoved: true, privacyConstraintRetained: true });
    expect(await capturePushRecovery(client, signatures)).toEqual(before);
  } finally {
    await db.exec(
      'alter table public.guardian_notification_delivery_policies drop constraint guardian_notification_policy_approval_check',
    );
    await db.exec(
      await read('supabase/migrations/pending/20261026171535_recipient_notification_delivery.sql'),
    );
  }
});

it('prints only fixed rollout failure codes', () => {
  expect(recipientPushFailureCode(new Error('sensitive arbitrary database response'))).toBe(
    'ROLLOUT_GUARD_FAILED',
  );
  expect(recipientPushFailureCode({ code: '57014', message: 'sensitive SQL' })).toBe(
    'STATEMENT_TIMEOUT',
  );
  expect(recipientPushFailureCode(new Error('Notification schema is partially installed.'))).toBe(
    'PARTIAL_INSTALLATION',
  );
});
