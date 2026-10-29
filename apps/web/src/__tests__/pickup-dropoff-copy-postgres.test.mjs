// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, expect, it } from 'vitest';
import {
  createPickupDropoffDb,
  databaseClient,
  id,
  recordEvent,
  readCopyMigration,
  startTrip,
} from '../../../../tests/release/fixtures/pickup-dropoff-copy-db.mjs';
import { buildGuardianEventEmail } from '../../netlify/functions/guardian-notification-email.mjs';
import { buildFcmMessage } from '../../../../supabase/functions/_shared/push-dispatcher-core.mjs';
import {
  rehearseTemplates,
  templateSnapshot,
  templateRestoreSql,
  verifyTemplateInstallation,
} from '../../../../tests/release/helpers/pickup-dropoff-copy-rollout.mjs';

let db;
beforeAll(async () => {
  db = await createPickupDropoffDb();
}, 60_000);
afterAll(async () => db?.close());
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const isolated = async (run) => {
  await db.exec('begin');
  try {
    await run();
  } finally {
    await db.exec('rollback');
  }
};
const notices = () =>
  query(
    "select n.*,c.title,c.body from user_notifications n cross join lateral safebus_private.notification_copy(n) c where n.category='pickup_dropoff' order by n.occurred_at,n.id",
  );
const resolveEmails = async () => {
  await db.exec(
    "update guardian_notification_outbox set status='processing'; select set_config('request.jwt.claim.role','service_role',false)",
  );
  return query(
    'select c.* from guardian_notification_outbox o cross join lateral public.resolve_guardian_pickup_dropoff_email_payload(o.id) c',
  );
};

it('records pickup and drop-off through the real driver recorder and sends the identical event copy through every channel', () =>
  isolated(async () => {
    await startTrip(db);
    await recordEvent(db);
    await recordEvent(db, 'dropped_off');
    const inbox = await notices();
    expect(inbox.map((n) => n.body).sort()).toEqual(
      [
        'Alex Morgan was picked up on Bus Demo 01 at Maple Street.',
        'Alex Morgan was dropped off on Bus Demo 01 at School entrance.',
      ].sort(),
    );
    expect(
      inbox.every((n) => n.recipient_profile_id === id(2) && n.recipient_role === 'guardian'),
    ).toBe(true);
    const emailRows = await resolveEmails();
    expect(emailRows).toHaveLength(2);
    const pushes = await query(
      "select * from public.claim_push_notification_deliveries('copy-worker',100,120)",
    );
    const pickupPushes = pushes.filter((p) => p.category === 'pickup_dropoff');
    expect(pickupPushes).toHaveLength(4);
    for (const notice of inbox) {
      const email = emailRows.find((e) => e.notification_type === notice.event_type);
      expect([email.title, email.body]).toEqual([notice.title, notice.body]);
      const rendered = buildGuardianEventEmail({
        notificationType: email.notification_type,
        notificationTitle: email.title,
        notificationBody: email.body,
        eventCreatedAt: email.event_occurred_at,
        tenantTimezone: email.tenant_timezone,
      });
      expect(rendered.subject).toBe('SafeBus: ' + notice.title);
      expect(rendered.text.split('\n')[0]).toBe(notice.body);
      for (const push of pickupPushes.filter((p) => p.notification_id === notice.id)) {
        const [resolved] = await query(
          'select * from public.resolve_push_notification_delivery($1,$2)',
          [push.outbox_id, 'copy-worker'],
        );
        expect(buildFcmMessage(resolved).message.notification).toEqual({
          title: notice.title,
          body: notice.body,
        });
      }
    }
    const [count] = await query(
      'select count(*)::int as copies from safebus_private.pickup_dropoff_event_copies',
    );
    expect(count.copies).toBe(2);
    await expect(recordEvent(db, 'dropped_off')).rejects.toThrow('already recorded');
  }));

it('keeps the original name, bus and stop across later edits, delayed email and push retries', () =>
  isolated(async () => {
    await startTrip(db);
    await recordEvent(db);
    const [before] = await notices();
    const claimed = await query(
      "select * from public.claim_push_notification_deliveries('first',100,120)",
    );
    await db.exec(`update students set first_name='Changed',last_name='Name';
    update buses set bus_number='Different'; update driver_trips set bus_number_snapshot='Different';
    update route_stops set stop_name='Different'; update student_bus_assignments set pickup_stop_id='${id(61)}';
    update push_notification_outbox set lease_expires_at=now()-interval '1 minute' where status='processing';`);
    const [after] = await notices();
    expect(after.body).toBe(before.body);
    expect((await resolveEmails())[0].body).toBe(before.body);
    const retried = await query(
      "select * from public.claim_push_notification_deliveries('second',100,120)",
    );
    expect(
      retried.filter((p) => p.category === 'pickup_dropoff').every((p) => p.body === before.body),
    ).toBe(true);
    expect(claimed.filter((p) => p.category === 'pickup_dropoff')).toHaveLength(2);
  }));

it('keeps siblings distinct and shares one copy among multiple linked guardians and devices', () =>
  isolated(async () => {
    await db.exec(`insert into profiles(id,tenant_id,role,email) values('${id(70)}','${id(1)}','guardian','second@example.test');
    insert into guardians(id,tenant_id,profile_id) values('${id(71)}','${id(1)}','${id(70)}');
    insert into student_guardians(id,tenant_id,guardian_id,student_id) values('${id(72)}','${id(1)}','${id(71)}','${id(14)}');
    insert into user_notification_settings(profile_id,tenant_id) values('${id(70)}','${id(1)}');
    insert into user_notification_category_preferences(profile_id,category) values('${id(70)}','pickup_dropoff');
    insert into guardian_student_push_preferences(student_guardian_id,category) values('${id(72)}','pickup_dropoff') on conflict do nothing;
    insert into android_push_devices(id,tenant_id,profile_id) values('${id(73)}','${id(1)}','${id(70)}');`);
    await startTrip(db);
    await recordEvent(db);
    await recordEvent(db, 'picked_up', id(15));
    expect((await notices()).map((n) => n.body).sort()).toEqual([
      'Alex Morgan was picked up on Bus Demo 01 at Maple Street.',
      'Alex Morgan was picked up on Bus Demo 01 at Maple Street.',
      'Jamie Morgan was picked up on Bus Demo 01 at Maple Street.',
    ]);
    expect(await resolveEmails()).toHaveLength(3);
  }));

it('preserves Unicode, HTML characters, complete long names/stops and BusSafe as part of an actual name', () =>
  isolated(async () => {
    const first = 'Élodie BusSafe',
      last = '王'.repeat(110),
      stop = 'Maple <Street> & "School" '.repeat(20);
    await db.query('update students set first_name=$1,last_name=$2 where id=$3', [
      first,
      last,
      id(14),
    ]);
    await db.query('update route_stops set stop_name=$1 where id=$2', [stop, id(60)]);
    await startTrip(db);
    await recordEvent(db);
    const [notice] = await notices();
    expect(notice.body.length).toBeGreaterThan(240);
    const [email] = await resolveEmails();
    expect(email.body).toBe(notice.body);
    const push = (
      await query("select * from public.claim_push_notification_deliveries('long',100,120)")
    ).find((p) => p.category === 'pickup_dropoff');
    expect(buildFcmMessage(push).message.notification.body).toBe(notice.body);
    const rendered = buildGuardianEventEmail({
      notificationType: email.notification_type,
      notificationTitle: email.title,
      notificationBody: email.body,
      eventCreatedAt: email.event_occurred_at,
    });
    expect(rendered.html).toContain('&lt;Street&gt; &amp; &quot;School&quot;');
    expect(rendered.text.split('\n')[0]).toBe(notice.body);
  }));

it.each([
  ["update student_guardians set status='inactive'", true],
  ["update student_guardians set access_expires_at=now()-interval '1 minute'", true],
  ["update guardians set status='inactive'", true],
  ["update profiles set status='inactive' where role='guardian'", true],
  ["update tenants set status='suspended'", true],
  ["update guardian_notification_delivery_policies set privacy_review_status='rejected'", true],
  [
    "update user_notification_category_preferences set email_enabled=false,push_enabled=false where category='pickup_dropoff'",
    true,
  ],
  ["update android_push_devices set permission_state='denied'", false],
])('rechecks consent and access after claim: %s', (change, emailBlocked) =>
  isolated(async () => {
    await startTrip(db);
    await recordEvent(db);
    const pushes = await query(
      "select * from public.claim_push_notification_deliveries('access',100,120)",
    );
    await db.exec(change);
    expect((await resolveEmails()).length).toBe(emailBlocked ? 0 : 1);
    for (const p of pushes.filter((p) => p.category === 'pickup_dropoff'))
      expect(
        await query('select * from public.resolve_push_notification_delivery($1,$2)', [
          p.outbox_id,
          'access',
        ]),
      ).toEqual([]);
  }),
);

it('uses explicit unavailable legacy values and never looks up a replacement assignment or another authority stop', () =>
  isolated(async () => {
    await startTrip(db);
    await recordEvent(db);
    await db.exec(`delete from safebus_private.pickup_dropoff_event_copies;
    update students set first_name='',last_name=''; update buses set bus_number=''; update driver_trips set bus_number_snapshot='';
    update route_stops set tenant_id='${id(99)}',stop_name='SECRET';`);
    const [notice] = await notices();
    expect(notice.body).toBe(
      'Student name unavailable was picked up on bus number unavailable at stop unavailable.',
    );
    expect((await resolveEmails())[0].body).toBe(notice.body);
    const [outbox] = await query('select * from guardian_notification_outbox');
    await db.query('update guardian_notification_outbox set student_id=$1 where id=$2', [
      id(15),
      outbox.id,
    ]);
    expect(await resolveEmails()).toEqual([]);
  }));

it('keeps inbox and details recipient-scoped for guardians and every administrator/driver role', () =>
  isolated(async () => {
    await startTrip(db);
    await recordEvent(db);
    const [notice] = await notices();
    await db.exec(
      `insert into profiles(id,tenant_id,role) values('${id(74)}','${id(1)}','transportation_admin')`,
    );
    for (const profile of [2, 3, 4, 5, 6, 74, 97]) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(profile)]);
      const detail = await query('select * from public.get_user_notification_detail($1)', [
        notice.id,
      ]);
      expect(detail).toHaveLength(profile === 2 ? 1 : 0);
      if (profile === 2) expect(detail[0].body).toBe(notice.body);
      const inbox = await query(
        "select * from public.get_user_notifications(30,null,null,false,'pickup_dropoff')",
      );
      expect(inbox).toHaveLength(profile === 2 ? 1 : 0);
    }
  }));

it('blocks private table reads and anonymous/service resolver misuse', () =>
  isolated(async () => {
    const [privileges] =
      await query(`select has_table_privilege('anon','safebus_private.pickup_dropoff_event_copies','select') as anon,
    has_table_privilege('authenticated','safebus_private.pickup_dropoff_event_copies','select') as authenticated,
    has_table_privilege('service_role','safebus_private.pickup_dropoff_event_copies','select') as service`);
    expect(privileges).toEqual({ anon: false, authenticated: false, service: false });
    await db.exec("select set_config('request.jwt.claim.role','',true)");
    await expect(
      query('select * from public.resolve_guardian_pickup_dropoff_email_payload($1)', [id(90)]),
    ).rejects.toThrow('Service role required');
  }));

it.each([
  'guardian',
  'driver',
  'tenant_admin',
  'school_admin',
  'transportation_admin',
  'platform_super_admin',
])('does not expose private copy or the service resolver to %s', (role) =>
  isolated(async () => {
    const profile =
      { guardian: 2, driver: 3, tenant_admin: 4, school_admin: 6, platform_super_admin: 5 }[role] ??
      74;
    if (role === 'transportation_admin')
      await db.exec(
        `insert into profiles(id,tenant_id,role) values('${id(profile)}','${id(1)}','transportation_admin')`,
      );
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(profile)]);
    await db.exec(
      "set local role authenticated; select set_config('request.jwt.claim.role','authenticated',true)",
    );
    await expect(
      query('select * from public.resolve_guardian_pickup_dropoff_email_payload($1)', [id(90)]),
    ).rejects.toThrow('permission denied');
  }),
);

it('rehearses the guarded rollout, verifies private table/ACLs, and restores functions without deleting saved events', async () => {
  const rehearsal = await createPickupDropoffDb({ migrate: false }),
    client = databaseClient(rehearsal);
  const config = JSON.parse(
    await readFile('../../config/pending/pickup-dropoff-copy.json', 'utf8'),
  );
  try {
    const before = await templateSnapshot(client, config);
    await rehearsal.exec(
      'alter table student_trip_events disable trigger student_trip_events_notify',
    );
    await expect(rehearseTemplates(client, await readCopyMigration(), config)).rejects.toThrow(
      'TEMPLATE_TRIGGER_DRIFT',
    );
    await rehearsal.exec(
      'alter table student_trip_events enable trigger student_trip_events_notify',
    );
    expect(await rehearseTemplates(client, await readCopyMigration(), config)).toEqual({
      definitionsMatched: 7,
      privateEventCopy: true,
    });
    expect(await templateSnapshot(client, config)).toEqual(before);
    await rehearsal.exec(await readCopyMigration());
    await verifyTemplateInstallation(client, await readCopyMigration(), config, before);
    await rehearsal.exec(
      'grant select on safebus_private.pickup_dropoff_event_copies to authenticated',
    );
    await expect(
      verifyTemplateInstallation(client, await readCopyMigration(), config, before),
    ).rejects.toThrow('TEMPLATE_TABLE_DRIFT');
    await rehearsal.exec(
      'revoke select on safebus_private.pickup_dropoff_event_copies from authenticated',
    );
    await rehearsal.exec(
      'grant execute on function public.resolve_guardian_pickup_dropoff_email_payload(uuid) to authenticated',
    );
    await expect(
      verifyTemplateInstallation(client, await readCopyMigration(), config, before),
    ).rejects.toThrow('TEMPLATE_ACL_CHANGED');
    await rehearsal.exec(
      'revoke execute on function public.resolve_guardian_pickup_dropoff_email_payload(uuid) from authenticated',
    );
    await startTrip(rehearsal);
    await recordEvent(rehearsal);
    await rehearsal.exec(templateRestoreSql(before));
    expect((await templateSnapshot(client, config)).functions).toEqual(before.functions);
    expect(
      (
        await rehearsal.query(
          'select count(*)::int as total from safebus_private.pickup_dropoff_event_copies',
        )
      ).rows[0].total,
    ).toBe(1);
  } finally {
    await rehearsal.close();
  }
}, 60_000);
