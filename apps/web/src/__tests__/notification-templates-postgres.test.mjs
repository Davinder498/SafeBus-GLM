// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  createNotificationTemplateDb,
  id,
  readMigration,
  startTrip,
} from '../../../../tests/release/fixtures/notification-templates-db.mjs';
import {
  buildFcmMessage,
  runPushDispatcher,
} from '../../../../supabase/functions/_shared/push-dispatcher-core.mjs';
import {
  rehearseTemplates,
  templateSnapshot,
  templateRestoreSql,
  verifyTemplateInstallation,
} from '../../../../scripts/lib/notification-template-rollout.mjs';

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
beforeAll(async () => {
  db = await createNotificationTemplateDb();
}, 60_000);
afterAll(async () => db?.close());

const expected = {
  trip_started: ['Trip started', 'Outbound trip for route Demo 01 has started with bus Demo 01.'],
  trip_completed: [
    'Trip completed',
    'Outbound trip for route Demo 01 has been completed by bus Demo 01.',
  ],
  trip_cancelled: ['Trip cancelled', 'Outbound trip for route Demo 01 has been cancelled.'],
  student_picked_up: ['Pickup recorded', 'A pickup was recorded on bus Demo 01 for route Demo 01.'],
  student_dropped_off: [
    'Drop-off recorded',
    'A drop-off was recorded on bus Demo 01 for route Demo 01.',
  ],
  trip_late: ['Bus delayed', 'Bus Demo 01 is delayed on route Demo 01.'],
  trip_missing: [
    'Bus service missing',
    'Bus Demo 01 on route Demo 01 has been reported missing from service.',
  ],
  traffic_disruption: [
    'Traffic disruption',
    'A traffic disruption has been reported for bus Demo 01 on route Demo 01.',
  ],
  weather_disruption: [
    'Weather disruption',
    'A weather disruption has been reported for bus Demo 01 on route Demo 01.',
  ],
  road_closure: [
    'Road closure',
    'A road closure has been reported for route Demo 01, affecting bus Demo 01.',
  ],
  mechanical_disruption: [
    'Mechanical issue',
    'A mechanical issue has been reported for bus Demo 01 on route Demo 01.',
  ],
  driver_assignment_created: [
    'New assignment',
    'You have been assigned to bus Demo 01 on route Demo 01.',
  ],
  driver_assignment_changed: [
    'Assignment changed',
    'Your assignment for bus Demo 01 on route Demo 01 has changed.',
  ],
  driver_assignment_ended: [
    'Assignment ended',
    'Your assignment for bus Demo 01 on route Demo 01 has ended.',
  ],
  student_service_changed: [
    'Bus service changed',
    'Your student’s bus service assignment has changed.',
  ],
  guardian_access_changed: [
    'Student access changed',
    'Your access to a linked student has changed.',
  ],
  delivery_health_incident: [
    'Notification delivery issue',
    'Some notifications could not be delivered.',
  ],
  provider_configuration_incident: [
    'Notification configuration issue',
    'A notification service configuration needs attention.',
  ],
  authority_announcement: ['School authority announcement', 'A new announcement is available.'],
};

async function allSources() {
  await startTrip(db);
  await db.exec(`
    insert into student_trip_events(id,tenant_id,student_id,event_type,driver_trip_id) values
      ('${id(50)}','${id(1)}','${id(14)}','picked_up','${id(40)}'),('${id(51)}','${id(1)}','${id(14)}','dropped_off','${id(40)}');
    insert into trip_operational_statuses values('${id(52)}','${id(1)}','${id(40)}','late','traffic',clock_timestamp());
    update trip_operational_statuses set operational_status='missing',reason_code='dispatch_unknown',set_at=clock_timestamp();
    insert into trip_exceptions(id,tenant_id,driver_trip_id,exception_type)
      select gen_random_uuid(),'${id(1)}','${id(40)}',t from unnest(array['traffic_delay','weather_delay','road_closure','mechanical_issue']) t;
    update driver_trips set status='completed',ended_at=clock_timestamp() where id='${id(40)}';
  `);
  await startTrip(db, 41);
  await db.exec(`
    update driver_trips set status='cancelled',ended_at=clock_timestamp() where id='${id(41)}';
    insert into driver_route_assignments(id,tenant_id,driver_id,bus_id,route_id)
      values('${id(53)}','${id(1)}','${id(13)}','${id(20)}','${id(21)}');
    update driver_route_assignments set effective_from=current_date,updated_at=clock_timestamp();
    update driver_route_assignments set status='ended',updated_at=clock_timestamp();
    update student_bus_assignments set effective_to=current_date+1,updated_at=clock_timestamp() where id='${id(24)}';
    update student_guardians set access_expires_at=now()+interval '1 day',updated_at=clock_timestamp() where id='${id(16)}';
    select public.record_notification_delivery_incident('${id(1)}','provider_unavailable');
    select public.record_notification_delivery_incident(null,'firebase_configuration');
    select set_config('request.jwt.claim.sub','${id(4)}',false);
    select public.send_authority_announcement('${id(54)}','all','Sender’s full title','Sender’s full message.',2);
    select public.send_authority_announcement('${id(54)}','all','Sender’s full title','Sender’s full message.',2);
  `);
}

it('initiates all 19 real source events, uses approved copy, and queues each eligible device exactly once', () =>
  isolated(async () => {
    await allSources();
    const notices = await query(
      'select n.*, c.title,c.body from user_notifications n cross join lateral safebus_private.notification_copy(n) c',
    );
    expect([...new Set(notices.map((n) => n.event_type))].sort()).toEqual(
      Object.keys(expected).sort(),
    );
    for (const n of notices) {
      expect(n.body).not.toMatch(/Private Student|Private Sibling|Private Driver| at \d| on Oct/);
      if (n.event_type === 'authority_announcement')
        expect([n.title, n.body]).toEqual(['Sender’s full title', 'Sender’s full message.']);
      else expect([n.title, n.body]).toEqual(expected[n.event_type]);
      const outboxes = await query(
        'select * from push_notification_outbox where notification_id=$1',
        [n.id],
      );
      expect(outboxes).toHaveLength(
        n.recipient_role === 'guardian' ? 2 : n.recipient_role === 'driver' ? 1 : 0,
      );
    }
    expect(
      notices.filter(
        (n) =>
          n.event_type === 'trip_started' &&
          n.driver_trip_id === id(40) &&
          n.recipient_role === 'guardian',
      ),
    ).toHaveLength(1);
    expect(notices.filter((n) => n.event_type === 'authority_announcement')).toHaveLength(2);
    expect(notices.some((n) => n.recipient_profile_id === id(97))).toBe(false);
    const claims = await query(
      "select * from public.claim_push_notification_deliveries('matrix-worker',200,120)",
    );
    expect(claims.length).toBeGreaterThan(30);
    for (const claim of claims) {
      expect([claim.title, claim.body]).toEqual(expected[claim.event_type]);
      const [resolved] = await query(
        'select * from public.resolve_push_notification_delivery($1,$2)',
        [claim.outbox_id, 'matrix-worker'],
      );
      expect([resolved.title, resolved.body]).toEqual(expected[claim.event_type]);
      const payload = buildFcmMessage(resolved);
      expect(payload.message.data.notificationId).toBe(claim.notification_id);
      expect(payload.message.notification).toEqual({ title: claim.title, body: claim.body });
      expect(payload.message.android.notification.visibility).toBe('PRIVATE');
      await query('select public.complete_push_notification_delivery($1,$2,$3)', [
        claim.outbox_id,
        'matrix-worker',
        'synthetic-provider-id',
      ]);
    }
    expect(
      await query("select * from public.claim_push_notification_deliveries('retry',200,120)"),
    ).toEqual([]);
  }));

it('queues a new guardian access link after inheriting the recipient’s existing category choices', () =>
  isolated(async () => {
    await db.exec(`insert into students(id,tenant_id,school_id) values('${id(18)}','${id(1)}','${id(8)}');
    insert into student_guardians(id,tenant_id,guardian_id,student_id) values('${id(19)}','${id(1)}','${id(12)}','${id(18)}');`);
    const rows = await query(
      "select o.* from push_notification_outbox o join user_notifications n on n.id=o.notification_id where n.source_id=$1 and n.event_type='guardian_access_changed'",
      [id(19)],
    );
    expect(rows).toHaveLength(2);
    await db.exec(`update user_notification_category_preferences set push_enabled=false where profile_id='${id(2)}' and category='service_changes';
    insert into students(id,tenant_id,school_id) values('${id(26)}','${id(1)}','${id(8)}');
    insert into student_guardians(id,tenant_id,guardian_id,student_id) values('${id(27)}','${id(1)}','${id(12)}','${id(26)}');`);
    expect(
      await query(
        'select o.* from push_notification_outbox o join user_notifications n on n.id=o.notification_id where n.source_id=$1',
        [id(27)],
      ),
    ).toHaveLength(0);
  }));

it('keeps genuine subsecond changes and repeated operational episodes, but ignores no-op retries and preference edits', () =>
  isolated(async () => {
    await startTrip(db);
    await db.exec(`
    insert into driver_route_assignments(id,tenant_id,driver_id,bus_id,route_id,updated_at) values('${id(53)}','${id(1)}','${id(13)}','${id(20)}','${id(21)}','2026-10-27T12:00:00.100Z');
    update driver_route_assignments set effective_from=current_date,updated_at='2026-10-27T12:00:00.200Z';
    update driver_route_assignments set effective_to=current_date+2,updated_at='2026-10-27T12:00:00.300Z';
    update driver_route_assignments set effective_to=current_date+2,updated_at='2026-10-27T12:00:00.400Z';
    update student_bus_assignments set effective_to=current_date+1,updated_at='2026-10-27T12:00:00.100Z' where id='${id(24)}';
    update student_bus_assignments set effective_to=current_date+2,updated_at='2026-10-27T12:00:00.200Z' where id='${id(24)}';
    update student_bus_assignments set seat_number=2,updated_at=clock_timestamp() where id='${id(24)}';
    update student_guardians set access_expires_at=now()+interval '1 day',updated_at='2026-10-27T12:00:00.100Z' where id='${id(16)}';
    update student_guardians set access_expires_at=now()+interval '2 days',updated_at='2026-10-27T12:00:00.200Z' where id='${id(16)}';
    update student_guardians set can_receive_notifications=false,updated_at=clock_timestamp() where id='${id(16)}';
    insert into trip_operational_statuses values('${id(52)}','${id(1)}','${id(40)}','late','traffic','2026-10-27T12:00:00.100Z');
    update trip_operational_statuses set operational_status='normal',set_at='2026-10-27T12:00:00.200Z';
    update trip_operational_statuses set operational_status='late',set_at='2026-10-27T12:00:00.300Z';
    update trip_operational_statuses set operational_status='late',set_at='2026-10-27T12:00:00.400Z';
  `);
    const counts = Object.fromEntries(
      (
        await query(
          'select event_type,count(*)::int as n from user_notifications where recipient_profile_id=$1 group by event_type',
          [id(2)],
        )
      ).map((r) => [r.event_type, r.n]),
    );
    expect(counts.student_service_changed).toBe(2);
    expect(counts.guardian_access_changed).toBe(2);
    expect(counts.trip_late).toBe(2);
    expect(
      (
        await query(
          "select count(*)::int as n from user_notifications where event_type='driver_assignment_changed'",
        )
      )[0].n,
    ).toBe(2);
    expect(
      (
        await query(
          "select count(*)::int as n from user_notifications where event_type='trip_late' and recipient_role='driver'",
        )
      )[0].n,
    ).toBe(2);
  }));

it('uses generic-safe fallbacks, avoids duplicate label prefixes, and bounds Unicode push previews for both legacy modes', () =>
  isolated(async () => {
    await startTrip(db);
    await db.exec(`update buses set bus_number='bus Demo 01';update routes set route_code='Route Demo 01';
    update driver_trips set bus_number_snapshot='bus Demo 01',trip_name_snapshot='Return trip';`);
    const [named] = await query(
      "select c.* from user_notifications n cross join lateral safebus_private.notification_copy(n) c where event_type='trip_started' limit 1",
    );
    expect(named.body).toBe('Return trip for route Demo 01 has started with bus Demo 01.');
    await db.exec(
      "update driver_trips set bus_number_snapshot='',trip_name_snapshot='';update buses set bus_number=null;update routes set route_code=null,route_name=null;update route_trip_patterns set display_name=null;",
    );
    const [fallback] = await query(
      "select c.* from user_notifications n cross join lateral safebus_private.notification_copy(n) c where event_type='trip_started' limit 1",
    );
    expect(fallback.body).toBe(
      'The trip for the assigned route has started with the assigned bus.',
    );
    await query('update driver_trips set trip_name_snapshot=$1', ['🚌'.repeat(400)]);
    await db.exec("update user_notification_settings set preview_mode='limited'");
    const [preview] = await query(
      "select c.* from user_notifications n cross join lateral safebus_private.notification_push_copy(n) c where event_type='trip_started' limit 1",
    );
    expect(Array.from(preview.body)).toHaveLength(240);
    expect(preview.body.endsWith('…')).toBe(true);
    expect(
      (
        await query(
          "select safebus_private.notification_preview_text(repeat('🚌',150),100) as title",
        )
      )[0].title,
    ).toHaveLength(199);
  }));

it('rechecks ownership, session, MFA and access when opening a pushed notification', () =>
  isolated(async () => {
    await startTrip(db);
    const [notice] = await query(
      "select id from user_notifications where recipient_profile_id=$1 and event_type='trip_started'",
      [id(2)],
    );
    await query("select set_config('request.jwt.claim.sub',$1,false)", [id(2)]);
    expect(
      await query('select * from public.get_user_notification_detail($1)', [notice.id]),
    ).toHaveLength(1);
    await db.exec("select set_config('test.active','false',false)");
    expect(
      await query('select * from public.get_user_notification_detail($1)', [notice.id]),
    ).toHaveLength(0);
    await db.exec(
      "select set_config('test.active','true',false);select set_config('test.mfa','false',false)",
    );
    expect(
      await query('select * from public.get_user_notification_detail($1)', [notice.id]),
    ).toHaveLength(0);
    await db.exec("select set_config('test.mfa','true',false)");
    await db.exec("update tenants set status='suspended'");
    expect(
      await query('select * from public.get_user_notification_detail($1)', [notice.id]),
    ).toHaveLength(0);
    await db.exec("update tenants set status='active'");
    await query("select set_config('request.jwt.claim.sub',$1,false)", [id(97)]);
    expect(
      await query('select * from public.get_user_notification_detail($1)', [notice.id]),
    ).toHaveLength(0);
    await query("select set_config('request.jwt.claim.sub',$1,false)", [id(2)]);
    await db.exec("update student_guardians set status='revoked',updated_at=clock_timestamp()");
    expect(
      await query('select * from public.get_user_notification_detail($1)', [notice.id]),
    ).toHaveLength(0);
  }));

it('does not expose a replacement driver’s current assignment through the former driver’s notification history', () =>
  isolated(async () => {
    await db.exec(`insert into driver_route_assignments(id,tenant_id,driver_id,bus_id,route_id) values('${id(53)}','${id(1)}','${id(13)}','${id(20)}','${id(21)}');
    insert into profiles(id,tenant_id,role) values('${id(70)}','${id(1)}','driver');
    insert into drivers(id,tenant_id,profile_id) values('${id(71)}','${id(1)}','${id(70)}');
    update driver_route_assignments set driver_id='${id(71)}',updated_at=clock_timestamp();`);
    const [copy] = await query(
      "select c.* from user_notifications n cross join lateral safebus_private.notification_copy(n) c where n.recipient_profile_id=$1 and event_type='driver_assignment_created'",
      [id(3)],
    );
    expect(copy.body).toBe('You have been assigned to the assigned bus on the assigned route.');
    expect(copy.body).not.toContain('Demo 01');
  }));

it('rejects baseline drift and restores exact prior functions after rollback', () =>
  isolated(async () => {
    const rollback = await readFile(
      '../../docs/operations/notification-templates-rollback.sql',
      'utf8',
    );
    await db.exec(rollback);
    const config = JSON.parse(
      await readFile('../../config/pending/notification-templates.json', 'utf8'),
    );
    for (const entry of config.baseline)
      expect(
        (
          await query(
            "select md5(replace(pg_get_functiondef(to_regprocedure($1)),chr(13),'')) as hash",
            [entry.signature],
          )
        )[0].hash,
      ).toBe(entry.md5);
    await db.exec('savepoint drift');
    await db.exec(
      'create or replace function safebus_private.on_guardian_access_notification() returns trigger language plpgsql as $$begin return new;end;$$;',
    );
    await expect(db.exec(await readMigration())).rejects.toThrow('baseline differs');
    await db.exec('rollback to savepoint drift');
    await db.exec(await readMigration());
    for (const sig of config.newFunctions)
      expect(
        (
          await query("select has_function_privilege('authenticated', $1, 'execute') as allowed", [
            sig,
          ])
        )[0].allowed,
      ).toBe(false);
  }));

it.each([
  [
    'personal opt-out',
    `update user_notification_settings set push_enabled=false where profile_id='${id(2)}'`,
  ],
  [
    'category opt-out',
    `update user_notification_category_preferences set push_enabled=false where profile_id='${id(2)}' and category='trip_status'`,
  ],
  [
    'device permission',
    `update android_push_devices set permission_state='denied' where profile_id='${id(2)}'`,
  ],
  [
    'stale devices',
    `update android_push_devices set last_seen_at=now()-interval '91 days' where profile_id='${id(2)}'`,
  ],
  ['expired links', `update student_guardians set access_expires_at=now()-interval '1 day'`],
  ['inactive students', `update students set status='inactive'`],
  ['inactive guardian account', `update profiles set status='inactive' where id='${id(2)}'`],
  ['per-student opt-out', `update guardian_student_push_preferences set push_enabled=false`],
  ['authority suspension', `update tenants set status='suspended' where id='${id(1)}'`],
  [
    'privacy rejection',
    `update guardian_notification_delivery_policies set privacy_review_status='rejected'`,
  ],
])('preserves %s when initiating an event', (_name, sql) =>
  isolated(async () => {
    await db.exec(sql);
    await startTrip(db);
    expect(
      await query(
        "select o.* from push_notification_outbox o join user_notifications n on n.id=o.notification_id where n.recipient_profile_id=$1 and n.event_type='trip_started'",
        [id(2)],
      ),
    ).toHaveLength(0);
  }),
);

it('preserves quiet hours and quotas, and cancels a claimed alert after a recipient opts out', () =>
  isolated(async () => {
    const [{ hour }] = await query(
      "select extract(hour from now() at time zone 'America/Edmonton')::int as hour",
    );
    await query(
      'update user_notification_settings set quiet_hours_enabled=true,quiet_hours_start=$1::time,quiet_hours_end=$2::time where profile_id=$3',
      [`${hour}:00`, `${(hour + 1) % 24}:00`, id(2)],
    );
    await startTrip(db);
    expect(
      (
        await query(
          'select count(*)::int as n from push_notification_outbox o join user_notifications n on n.id=o.notification_id where n.recipient_profile_id=$1 and o.available_after>now()',
          [id(2)],
        )
      )[0].n,
    ).toBe(2);
    await db.exec('update guardian_notification_delivery_policies set push_tenant_daily_limit=0');
    expect(
      await query("select * from public.claim_push_notification_deliveries('quota',50,120)"),
    ).toHaveLength(0);
    await db.exec(
      'update guardian_notification_delivery_policies set push_tenant_daily_limit=1000',
    );
    const [claim] = await query(
      "select * from public.claim_push_notification_deliveries('lease',50,120)",
    );
    expect(claim).toBeDefined();
    await db.exec(
      "update user_notification_settings set push_enabled=false where profile_id='" + id(3) + "'",
    );
    expect(
      await query('select * from public.resolve_push_notification_delivery($1,$2)', [
        claim.outbox_id,
        'lease',
      ]),
    ).toHaveLength(0);
    expect(
      (await query('select status from push_notification_outbox where id=$1', [claim.outbox_id]))[0]
        .status,
    ).toBe('cancelled');
  }));

const workerRpc = async (name, args) => {
  if (!/^[a-z_]+$/.test(name)) throw new Error('Invalid test RPC');
  const keys = Object.keys(args);
  const rows = await query(
    `select * from public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(',')})`,
    Object.values(args),
  );
  return ['claim_push_notification_deliveries', 'resolve_push_notification_delivery'].includes(name)
    ? rows
    : Object.values(rows[0] ?? {})[0];
};

it('recovers abandoned leases, rejects stale workers, and stops after the fifth attempt', () =>
  isolated(async () => {
    await startTrip(db);
    const claims = await query(
      "select * from public.claim_push_notification_deliveries('abandoned',50,120)",
    );
    expect(claims).toHaveLength(3);
    await db.exec("update push_notification_outbox set lease_expires_at=now()-interval '1 second'");
    const recovered = await query(
      "select * from public.claim_push_notification_deliveries('replacement',50,120)",
    );
    expect(recovered).toHaveLength(3);
    expect(recovered.every((row) => row.attempt_count === 2)).toBe(true);
    expect(
      await query('select * from public.resolve_push_notification_delivery($1,$2)', [
        claims[0].outbox_id,
        'abandoned',
      ]),
    ).toHaveLength(0);
    expect(
      await query('select * from public.resolve_push_notification_delivery($1,$2)', [
        claims[0].outbox_id,
        'replacement',
      ]),
    ).toHaveLength(1);
    await db.exec(
      "update push_notification_outbox set attempt_count=5,lease_expires_at=now()-interval '1 second'",
    );
    expect(
      await query("select * from public.claim_push_notification_deliveries('exhausted',50,120)"),
    ).toHaveLength(0);
    expect(
      await query(
        "select * from push_notification_outbox where status='failed' and failure_category='lease_expired'",
      ),
    ).toHaveLength(3);
  }));
it.each([
  ['UNAVAILABLE', 503, 'retry'],
  ['UNREGISTERED', 404, 'failed'],
  ['INVALID_ARGUMENT', 400, 'failed'],
  ['PERMISSION_DENIED', 403, 'failed'],
])(
  'handles provider %s through the real leased worker and incident path',
  (code, httpStatus, state) =>
    isolated(async () => {
      await startTrip(db);
      const result = await runPushDispatcher({
        rpc: workerRpc,
        workerId: 'provider-worker',
        send: async () => {
          throw { fcmErrorCode: code, httpStatus };
        },
      });
      expect(result.error).toBe(0);
      expect(result[state === 'retry' ? 'retry' : 'failed']).toBe(3);
      expect(
        await query('select * from push_notification_outbox where status=$1', [state]),
      ).toHaveLength(3);
      if (code === 'UNREGISTERED')
        expect(
          await query("select * from android_push_devices where status='invalid'"),
        ).toHaveLength(3);
      if (code === 'PERMISSION_DENIED') {
        expect(
          (
            await query(
              "select distinct event_type from user_notifications where category in ('delivery_health','platform')",
            )
          )
            .map((n) => n.event_type)
            .sort(),
        ).toEqual(['delivery_health_incident', 'provider_configuration_incident']);
      }
      if (state === 'retry') {
        await db.exec(
          "update push_notification_outbox set available_after=now() where status='retry'",
        );
        const recovery = await runPushDispatcher({
          rpc: workerRpc,
          workerId: 'recovered-worker',
          send: async (row) => 'synthetic:' + row.notification_id,
        });
        expect(recovery).toMatchObject({ delivered: 3, error: 0, failed: 0 });
      }
    }),
);

it('runs the protected rehearsal and dynamic recovery against real embedded transactions', async () => {
  // Rehearsal owns its transactions, so use a fresh embedded database rather than an enclosing savepoint.
  const rehearsalDb = await createNotificationTemplateDb({ migrate: false });
  const client = {
    query: async (sql, params) =>
      params ? rehearsalDb.query(sql, params) : (await rehearsalDb.exec(sql)).at(-1),
  };
  try {
    const config = JSON.parse(
      await readFile('../../config/pending/notification-templates.json', 'utf8'),
    );
    const before = await templateSnapshot(client, config);
    await rehearsalDb.exec(
      'alter table student_guardians disable trigger student_guardians_sync_push_defaults',
    );
    await expect(rehearseTemplates(client, await readMigration(), config)).rejects.toThrow(
      'trigger baseline differs',
    );
    await rehearsalDb.exec(
      'alter table student_guardians enable trigger student_guardians_sync_push_defaults',
    );
    expect(await rehearseTemplates(client, await readMigration(), config)).toEqual({
      definitionsMatched: 12,
      privateHelpers: 3,
    });
    expect(await templateSnapshot(client, config)).toEqual(before);
    await rehearsalDb.exec(await readMigration());
    await verifyTemplateInstallation(client, await readMigration(), config, before);
    await rehearsalDb.exec(
      'grant execute on function safebus_private.notification_push_copy(user_notifications) to authenticated',
    );
    await expect(
      verifyTemplateInstallation(client, await readMigration(), config, before),
    ).rejects.toThrow('TEMPLATE_HELPER_EXPOSED');
    await rehearsalDb.exec(templateRestoreSql(before));
    expect(await templateSnapshot(client, config)).toEqual(before);
  } finally {
    await rehearsalDb.close();
  }
}, 30_000);
