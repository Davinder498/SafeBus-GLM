import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrationPath =
  'supabase/migrations/pending/20261018032558_guardian_trip_notification_deduplication.sql';
function definition(source, name) {
  const match = source.match(
    new RegExp(
      `create(?: or replace)? function ${name.replaceAll('.', '\\.')}\\([\\s\\S]*?\\$\\$;`,
      'i',
    ),
  );
  assert.ok(match, name);
  return match[0];
}
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
test('trip fan-out deduplicates siblings while rechecking exact service and each delivery channel', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile('tests/release/fixtures/tracking-worker-baseline.sql', 'utf8'));
  await db.exec(await fs.readFile('tests/release/fixtures/trip-notification-baseline.sql', 'utf8'));
  const base = await fs.readFile(
    'supabase/migrations/0092_end_to_end_notification_system.sql',
    'utf8',
  );
  for (const name of [
    'safebus_private.send_notification_invalidation',
    'safebus_private.enqueue_push_for_notification',
    'safebus_private.enqueue_user_notification',
    'public.claim_push_notification_deliveries',
    'public.resolve_push_notification_delivery',
  ])
    await db.exec(definition(base, name));
  const legacy = await fs.readFile(
    'supabase/migrations/0110_cool_cloud_notification_preferences.sql',
    'utf8',
  );
  await db.exec(
    definition(legacy, 'safebus_private.guardian_email_outbox_is_eligible').replace(
      'safebus_private.guardian_email_outbox_is_eligible(',
      'safebus_private.guardian_email_outbox_is_eligible_legacy(',
    ),
  );
  const sql = await fs.readFile(migrationPath, 'utf8');
  await db.exec(sql);
  await db.exec(sql); // A rehearsal/retry preserves existing signatures and behavior.
  assert.equal(
    (await db.query('select * from public.claim_guardian_notification_email_batch_v2(7)')).rows[0]
      .attempt_count,
    7,
  );
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated','public.claim_guardian_notification_email_batch_v2(integer,integer,integer,integer)','execute') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','service_role',false)",
    [id(2)],
  );
  await db.query(
    `insert into public.tenants(id) values ($1);
    `,
    [id(1)],
  );
  await db.query("insert into public.profiles(id,tenant_id,role) values($1,$2,'guardian')", [
    id(2),
    id(1),
  ]);
  await db.query('insert into public.guardians(id,tenant_id,profile_id) values($1,$2,$3)', [
    id(3),
    id(1),
    id(2),
  ]);
  await db.query('insert into public.routes(id,tenant_id) values($1,$2)', [id(4), id(1)]);
  await db.query(
    'insert into public.driver_trips(id,tenant_id,bus_id,route_id,route_trip_pattern_id) values($1,$2,$3,$4,$5)',
    [id(5), id(1), id(6), id(4), id(7)],
  );
  await db.query(
    'insert into public.bus_route_assignments(id,tenant_id,bus_id,route_id,route_trip_pattern_id) values($1,$2,$3,$4,$5)',
    [id(8), id(1), id(6), id(4), id(7)],
  );
  for (const n of [10, 20]) {
    await db.query('insert into public.students(id,tenant_id) values($1,$2)', [id(n), id(1)]);
    await db.query(
      'insert into public.student_guardians(id,tenant_id,student_id,guardian_id) values($1,$2,$3,$4)',
      [id(n + 1), id(1), id(n), id(3)],
    );
    await db.query(
      'insert into public.student_bus_assignments(id,tenant_id,student_id,bus_route_assignment_id,route_trip_pattern_id) values($1,$2,$3,$4,$5)',
      [id(n + 2), id(1), id(n), id(8), id(7)],
    );
    await db.query(
      "insert into public.guardian_student_push_preferences values($1,'trip_status',$2)",
      [id(n + 1), n === 20],
    );
  }
  await db.query(
    'insert into public.user_notification_settings(profile_id,tenant_id) values($1,$2)',
    [id(2), id(1)],
  );
  await db.query(
    "insert into public.user_notification_category_preferences(profile_id,category) values($1,'trip_status')",
    [id(2)],
  );
  await db.query(
    'insert into public.guardian_notification_delivery_policies(tenant_id) values($1)',
    [id(1)],
  );
  await db.query(
    'insert into public.android_push_devices(id,tenant_id,profile_id) values($1,$2,$3)',
    [id(9), id(1), id(2)],
  );
  const emit = () =>
    db.query(
      "select safebus_private.notify_trip_audience($1,$2,$3,'trip_started','trip_status','info','driver_trip',$2,now())",
      [id(1), id(5), id(4)],
    );
  await emit();
  await emit();
  const rows = (await db.query('select * from public.user_notifications')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].student_id, null);
  assert.match(rows[0].deduplication_key, /:guardian_trip$/);
  assert.equal((await db.query('select * from public.push_notification_outbox')).rows.length, 1);
  const claimed = (
    await db.query("select * from public.claim_push_notification_deliveries('worker',10,60)")
  ).rows;
  assert.equal(claimed.length, 1);
  assert.equal(
    (
      await db.query("select * from public.resolve_push_notification_delivery($1,'worker')", [
        claimed[0].outbox_id,
      ])
    ).rows.length,
    1,
  );
  await db.query(
    "insert into public.guardian_notification_outbox(tenant_id,guardian_id,user_notification_id,notification_type) values($1,$2,$3,'trip_started')",
    [id(1), id(3), rows[0].id],
  );
  const eligible = async (push) =>
    (
      await db.query(
        'select safebus_private.guardian_trip_notification_is_eligible(n,$1) as ok from public.user_notifications n',
        [push],
      )
    ).rows[0].ok;
  const inbox = async () =>
    (
      await db.query(
        'select safebus_private.notification_recipient_can_access(n) as ok from public.user_notifications n',
      )
    ).rows[0].ok;
  const email = async () =>
    (
      await db.query(
        'select safebus_private.notification_email_outbox_is_eligible(id) as ok from public.guardian_notification_outbox',
      )
    ).rows[0].ok;
  assert.equal(await inbox(), true);
  assert.equal(await email(), true);
  await db.query("update public.student_guardians set status='inactive' where student_id=$1", [
    id(10),
  ]);
  assert.equal(await eligible(true), true);
  assert.equal(await inbox(), true);
  await db.exec('update public.guardian_student_push_preferences set push_enabled=false');
  assert.equal(await eligible(true), false);
  assert.equal(await email(), true);
  assert.equal(
    (
      await db.query("select * from public.resolve_push_notification_delivery($1,'worker')", [
        claimed[0].outbox_id,
      ])
    ).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from public.claim_push_notification_deliveries('worker',10,60)")).rows
      .length,
    0,
  );
  assert.equal(
    (await db.query('select status from public.push_notification_outbox')).rows[0].status,
    'cancelled',
  );
  await db.exec("update public.student_guardians set status='inactive'");
  assert.equal(await inbox(), false);
  assert.equal(await email(), false);
  await db.exec(
    "update public.student_guardians set status='active'; update public.guardian_student_push_preferences set push_enabled=true",
  );
  for (const change of [
    "update public.student_guardians set access_expires_at=now()-interval '1 second'",
    "update public.students set status='inactive'",
    "update public.student_bus_assignments set route_trip_pattern_id='00000000-0000-0000-0000-000000000099'",
    "update public.bus_route_assignments set bus_id='00000000-0000-0000-0000-000000000099'",
    'update public.student_bus_assignments set effective_from=current_date+1',
    'update public.student_bus_assignments set effective_to=current_date-1',
    "update public.guardians set tenant_id='00000000-0000-0000-0000-000000000099'",
  ]) {
    await db.exec('begin');
    await db.exec(change);
    assert.equal(await eligible(false), false, change);
    assert.equal(await inbox(), false, change);
    assert.equal(await email(), false, change);
    await db.exec('rollback');
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(99)]);
  assert.equal(await inbox(), false);
  await db.exec('set role authenticated');
  await assert.rejects(
    db.query(
      'select safebus_private.guardian_trip_notification_is_eligible(n,false) from public.user_notifications n',
    ),
  );
  await db.exec('reset role');
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated','public.claim_push_notification_deliveries(text,integer,integer)','execute') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated','safebus_private.guardian_trip_notification_is_eligible(public.user_notifications,boolean)','execute') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
  // Pre-release per-child trip emails are grouped before the repaired worker sends.
  for (const n of [30, 31]) {
    await db.query(
      "insert into public.user_notifications(id,tenant_id,recipient_profile_id,recipient_role,event_type,category,source_type,source_id,student_id,driver_trip_id,deduplication_key) values($1,$2,$3,'guardian','trip_started','trip_status','driver_trip',$4,$5,$6,$7)",
      [id(n), id(1), id(2), id(99), id(n === 30 ? 10 : 20), id(5), `legacy:${n}`],
    );
    await db.query(
      "insert into public.guardian_notification_outbox(id,tenant_id,guardian_id,user_notification_id,notification_type) values($1,$2,$3,$4,'trip_started')",
      [id(n + 10), id(1), id(3), id(n)],
    );
  }
  const legacyEmail = async (n) =>
    (
      await db.query('select safebus_private.notification_email_outbox_is_eligible($1) as ok', [
        id(n),
      ])
    ).rows[0].ok;
  assert.equal(await legacyEmail(40), true);
  assert.equal(await legacyEmail(41), false);
  await db.query("update public.guardian_notification_outbox set status='cancelled' where id=$1", [
    id(40),
  ]);
  assert.equal(await legacyEmail(41), true);
  // Child-specific updates still have separate dedupe keys; no child events are collapsed.
  for (const n of [10, 20])
    await db.query(
      "select safebus_private.enqueue_user_notification($1,$2,'student_picked_up','pickup_dropoff','info','student_trip_event',$3,$4,now(),$5,$6,null)",
      [id(1), id(2), id(n + 3), `child:${n}`, id(n), id(5)],
    );
  assert.equal(
    (await db.query("select * from public.user_notifications where event_type='student_picked_up'"))
      .rows.length,
    2,
  );
});
