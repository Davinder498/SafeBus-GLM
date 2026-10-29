// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  createUnifiedNotificationDb,
  id,
  startTrip,
  recordEvent,
} from '../../../../tests/release/fixtures/unified-notifications-db.mjs';
import { buildFcmMessage } from '../../../../supabase/functions/_shared/push-dispatcher-core.mjs';
import { runDeliveryWorker } from '../../../../supabase/functions/_shared/notification-worker.mjs';
import { buildGuardianEventEmail } from '../../netlify/functions/guardian-notification-email.mjs';
let db;
const approved = {
  student_picked_up: ['Student picked up', 'Alex Morgan was picked up on Bus Demo 01.'],
  student_dropped_off: ['Student dropped off', 'Alex Morgan was dropped off on Bus Demo 01.'],
  trip_started: ['Trip started', 'Outbound trip on Bus Demo 01 has started.'],
  trip_completed: ['Trip completed', 'Outbound trip on Bus Demo 01 has ended.'],
  trip_cancelled: ['Trip cancelled', 'Outbound trip on Bus Demo 01 is cancelled.'],
  trip_late: ['Bus delayed', 'Bus Demo 01 is delayed on Route Demo 01.'],
  trip_missing: ['Service unconfirmed', 'Service for Bus Demo 01 is currently unconfirmed.'],
  traffic_disruption: ['Traffic disruption', 'Traffic is affecting Bus Demo 01.'],
  weather_disruption: ['Weather disruption', 'Weather is affecting Bus Demo 01.'],
  road_closure: ['Road closure', 'A road closure is affecting Bus Demo 01.'],
  mechanical_disruption: ['Mechanical issue', 'Bus Demo 01 has a mechanical problem.'],
  driver_assignment_created: ['New assignment', 'You’re assigned to Bus Demo 01 on Route Demo 01.'],
  driver_assignment_changed: [
    'Assignment changed',
    'Your Bus Demo 01 assignment on Route Demo 01 has changed.',
  ],
  driver_assignment_ended: [
    'Assignment ended',
    'Your Bus Demo 01 assignment on Route Demo 01 has ended.',
  ],
  student_service_changed: [
    'Student bus assignment changed',
    'Alex Morgan’s bus assignment has changed.',
  ],
  guardian_access_changed: [
    'Student access changed',
    'Your access to student updates has changed.',
  ],
  delivery_health_incident: [
    'Notification delivery issue',
    'Some notifications could not be delivered.',
  ],
  provider_configuration_incident: [
    'Notification service issue',
    'A notification service needs attention.',
  ],
  authority_announcement: ['New announcement', 'Your school authority posted an announcement.'],
};
beforeAll(async () => {
  db = await createUnifiedNotificationDb();
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
async function rpc(name, args) {
  const entries = Object.entries(args),
    rows = await query(
      'select * from public.' +
        name +
        '(' +
        entries.map(([key], i) => key + '=> $' + (i + 1)).join(',') +
        ')',
      entries.map(([, value]) =>
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? JSON.stringify(value)
          : value,
      ),
    );
  if (['claim_notification_deliveries', 'resolve_notification_deliveries'].includes(name))
    return rows.map((row) => row[name]);
  return rows[0]?.[name];
}
it('covers all 19 actual alert sources and shares their approved wording across enabled channels', () =>
  isolated(async () => {
    await allSources();
    const notices = await query(
      'select n.*,c.title,c.body from user_notifications n cross join lateral safebus_private.notification_copy(n)c',
    );
    expect([...new Set(notices.map((n) => n.event_type))].sort()).toEqual(
      Object.keys(approved).sort(),
    );
    for (const notice of notices) {
      expect([notice.title, notice.body]).toEqual(
        notice.event_type === 'authority_announcement'
          ? ['Sender’s full title', 'Sender’s full message.']
          : approved[notice.event_type],
      );
      if (notice.event_type === 'trip_missing')
        expect(['guardian', 'driver']).not.toContain(notice.recipient_role);
    }
    for (const channel of ['push', 'email']) {
      const claims = await rpc('claim_notification_deliveries', {
        p_channel: channel,
        p_worker_id: channel,
        p_limit: 200,
        p_provider_minute: 600000,
      });
      const payloads = await rpc('resolve_notification_deliveries', {
        p_channel: channel,
        p_worker_id: channel,
        p_ids: claims.map((r) => r.id),
      });
      expect(payloads.length).toBeGreaterThan(10);
      for (const payload of payloads) {
        const event = payload.event_type ?? payload.notification_type;
        expect(event).not.toBe('trip_missing');
        expect([payload.title, payload.body]).toEqual(approved[event]);
        if (channel === 'push')
          expect(buildFcmMessage(payload).message.notification).toEqual({
            title: payload.title,
            body: payload.body,
          });
        else {
          const rendered = buildGuardianEventEmail({
            notificationType: event,
            notificationTitle: payload.title,
            notificationBody: payload.body,
            eventCreatedAt: payload.event_occurred_at,
          });
          expect(rendered.subject).toBe('SafeBus: ' + payload.title);
          expect(rendered.text.split('\n')[0]).toBe(payload.body);
        }
      }
    }
  }));
it('records one durable trip audience intent before expanding it', () =>
  isolated(async () => {
    await startTrip(db);
    expect(
      (await query("select * from user_notifications where event_type='trip_started'")).length,
    ).toBe(0);
    expect(await query('select * from safebus_private.notification_audience_queue')).toHaveLength(
      1,
    );
    expect(await rpc('expand_notification_audiences', { p_limit: 16 })).toBe(1);
    const rows = await query("select * from user_notifications where event_type='trip_started'");
    expect(rows.filter((r) => r.recipient_role === 'guardian')).toHaveLength(1);
    expect(await query('select * from safebus_private.notification_audience_queue')).toHaveLength(
      0,
    );
    await rpc('expand_notification_audiences', { p_limit: 16 });
    expect(
      await query("select * from user_notifications where event_type='trip_started'"),
    ).toHaveLength(rows.length);
  }));
it('retains failed audience work for bounded retries without half-created inbox items', () =>
  isolated(async () => {
    await startTrip(db);
    await db.exec(`create or replace function safebus_private.deliver_trip_notification_audience(p_tenant_id uuid,p_trip_id uuid,p_route_id uuid,p_event_type text,p_category text,p_severity text,p_source_type text,p_source_id uuid,p_occurred_at timestamptz)
 returns void language plpgsql as $$ begin raise exception 'local failure'; end $$;`);
    for (let attempt = 1; attempt <= 5; attempt++) {
      await db.exec('update safebus_private.notification_audience_queue set available_after=now()');
      expect(await rpc('expand_notification_audiences', { p_limit: 16 })).toBe(0);
      const [job] = await query(
        'select attempts,failed_at,failure_code from safebus_private.notification_audience_queue',
      );
      expect(job.attempts).toBe(attempt);
      expect(job.failure_code).toBe('P0001');
      expect(Boolean(job.failed_at)).toBe(attempt === 5);
    }
    expect(await query("select * from user_notifications where event_type='trip_started'")).toEqual(
      [],
    );
    await expect(rpc('expand_notification_audiences', { p_limit: null })).rejects.toThrow(
      'Invalid expansion limit',
    );
  }));
it('keeps complete Unicode/HTML names and bus labels across all channels without shortening', () =>
  isolated(async () => {
    const first = 'Élodie BusSafe <&>',
      last = '王'.repeat(260),
      bus = '12 & <North>';
    await db.query('update students set first_name=$1,last_name=$2 where id=$3', [
      first,
      last,
      id(14),
    ]);
    await startTrip(db);
    await db.query('update driver_trips set bus_number_snapshot=$1 where id=$2', [bus, id(40)]);
    await recordEvent(db);
    const expected = first + ' ' + last + ' was picked up on Bus ' + bus + '.';
    for (const channel of ['push', 'email']) {
      const claims = await rpc('claim_notification_deliveries', {
        p_channel: channel,
        p_worker_id: channel,
        p_limit: 100,
        p_provider_minute: 6000,
      });
      const rows = await rpc('resolve_notification_deliveries', {
        p_channel: channel,
        p_worker_id: channel,
        p_ids: claims.map((r) => r.id),
      });
      const payload = rows.find(
        (r) => (r.event_type ?? r.notification_type) === 'student_picked_up',
      );
      expect(payload.body).toBe(expected);
      expect(payload.body.length).toBeGreaterThan(240);
      if (channel === 'push')
        expect(buildFcmMessage(payload).message.notification.body).toBe(expected);
      else {
        const rendered = buildGuardianEventEmail({
          notificationType: payload.notification_type,
          notificationTitle: payload.title,
          notificationBody: payload.body,
          eventCreatedAt: payload.event_occurred_at,
        });
        expect(rendered.html).toContain('&lt;&amp;&gt;');
        expect(rendered.html).toContain('&amp; &lt;North&gt;');
        expect(rendered.text.split('\n')[0]).toBe(expected);
      }
    }
  }));
it('returns explicit legacy fallbacks and denies cross-authority lookup without leaking a student name', () =>
  isolated(async () => {
    await startTrip(db);
    await recordEvent(db);
    const [event] = await query('select * from student_trip_events where student_id=$1', [id(14)]);
    const args = [event.id, id(99), id(14), id(40), 'student_picked_up'];
    const [copy] = await query(
      'select * from safebus_private.pickup_dropoff_event_copy($1,$2,$3,$4,$5)',
      args,
    );
    expect(copy.body).toBe('Student name unavailable was picked up on bus number unavailable.');
    await db.exec(
      `update students set first_name=null,last_name=null;update driver_trips set bus_number_snapshot=null;update buses set bus_number=null;`,
    );
    args[1] = id(1);
    expect(
      (
        await query('select * from safebus_private.pickup_dropoff_event_copy($1,$2,$3,$4,$5)', args)
      )[0],
    ).toEqual(copy);
  }));
it('uses the approved no-stop pickup/drop-off copy in inbox, push and email through real source events', () =>
  isolated(async () => {
    await startTrip(db);
    await recordEvent(db);
    await recordEvent(db, 'dropped_off');
    for (const channel of ['push', 'email']) {
      const claimed = await rpc('claim_notification_deliveries', {
        p_channel: channel,
        p_worker_id: channel,
        p_limit: 100,
        p_provider_minute: 6000,
      });
      const payloads = await rpc('resolve_notification_deliveries', {
        p_channel: channel,
        p_worker_id: channel,
        p_ids: claimed.map((r) => r.id),
      });
      for (const event of ['student_picked_up', 'student_dropped_off']) {
        const payload = payloads.find((p) => (p.notification_type ?? p.event_type) === event);
        expect(payload).toBeDefined();
        const verb = event === 'student_picked_up' ? 'picked up' : 'dropped off';
        expect(payload.title).toBe('Student ' + verb);
        expect(payload.body).toBe('Alex Morgan was ' + verb + ' on Bus Demo 01.');
        expect(payload.body).not.toMatch(/Maple|entrance|stop/i);
        const [notice] = await query(
          'select c.* from user_notifications n cross join lateral safebus_private.notification_copy(n) c where n.event_type=$1',
          [event],
        );
        expect([payload.title, payload.body]).toEqual([notice.title, notice.body]);
        if (channel === 'push')
          expect(buildFcmMessage(payload).message.notification).toEqual(notice);
        else
          expect(
            buildGuardianEventEmail({
              notificationType: event,
              notificationTitle: payload.title,
              notificationBody: payload.body,
              eventCreatedAt: payload.event_occurred_at,
            }).text.split('\n')[0],
          ).toBe(notice.body);
      }
      expect(
        await rpc('settle_notification_deliveries', {
          p_channel: channel,
          p_worker_id: channel,
          p_results: claimed.map((r) => ({ id: r.id, state: 'delivered', provider_id: 'mock' })),
        }),
      ).toBe(claimed.length);
    }
    expect(
      (
        await query(
          'select count(*)::int as total from safebus_release.pickup_dropoff_event_copies',
        )
      )[0].total,
    ).toBe(0);
  }));
it('keeps service-unconfirmed events internal, including old inbox/queue items', () =>
  isolated(async () => {
    await startTrip(db);
    await db.exec(`insert into trip_operational_statuses(id,tenant_id,driver_trip_id,operational_status,reason_code)
 values('${id(80)}','${id(1)}','${id(40)}','missing','dispatch_unknown');`);
    await rpc('expand_notification_audiences', { p_limit: 16 });
    const notices = await query(
      "select n.*,c.title from user_notifications n cross join lateral safebus_private.notification_copy(n)c where n.event_type='trip_missing'",
    );
    expect(notices.length).toBeGreaterThan(0);
    expect(notices.every((n) => !['guardian', 'driver'].includes(n.recipient_role))).toBe(true);
    expect(notices.every((n) => n.title === 'Service unconfirmed')).toBe(true);
    await db.exec(`insert into user_notifications(id,tenant_id,recipient_profile_id,recipient_role,event_type,category,severity,source_type,source_id,driver_trip_id,deduplication_key,occurred_at)
 values('${id(81)}','${id(1)}','${id(2)}','guardian','trip_missing','operations','urgent','trip_operational_status','${id(80)}','${id(40)}','legacy-unconfirmed',now());
 insert into push_notification_outbox(id,tenant_id,notification_id,device_id) values('${id(82)}','${id(1)}','${id(81)}','${id(30)}');
 select set_config('request.jwt.claim.sub','${id(2)}',true);`);
    expect(await query('select * from get_user_notification_detail($1)', [id(81)])).toEqual([]);
    await query("select * from claim_push_notification_deliveries('internal',100,120)");
    expect(
      (await query('select status from push_notification_outbox where id=$1', [id(82)]))[0].status,
    ).toBe('cancelled');
  }));
it('atomically reserves quota across worker claims and preserves custom account limits', () =>
  isolated(async () => {
    await db.exec(
      `update guardian_notification_delivery_policies set push_tenant_per_minute_limit=3 where tenant_id='${id(1)}';`,
    );
    await startTrip(db);
    await recordEvent(db);
    await recordEvent(db, 'dropped_off');
    const a = await rpc('claim_notification_deliveries', {
      p_channel: 'push',
      p_worker_id: 'a',
      p_limit: 100,
      p_provider_minute: 6000,
    });
    const b = await rpc('claim_notification_deliveries', {
      p_channel: 'push',
      p_worker_id: 'b',
      p_limit: 100,
      p_provider_minute: 6000,
    });
    expect(a.length + b.length).toBe(3);
    expect(new Set([...a, ...b].map((r) => r.id)).size).toBe(3);
    const [counter] = await query(
      "select minute_used from safebus_private.notification_dispatch_counters where channel='push' and scope=$1",
      [id(1)],
    );
    expect(counter.minute_used).toBe(3);
  }));
it('reclaims leases while rejecting stale email resolution and completion', () =>
  isolated(async () => {
    await startTrip(db);
    await recordEvent(db);
    const first = await rpc('claim_notification_deliveries', {
      p_channel: 'email',
      p_worker_id: 'old',
      p_limit: 100,
      p_provider_minute: 6000,
    });
    expect(first.length).toBeGreaterThan(0);
    await db.exec(
      "update guardian_notification_outbox set claim_expires_at=now()-interval '1 second' where status='processing'",
    );
    const second = await rpc('claim_notification_deliveries', {
      p_channel: 'email',
      p_worker_id: 'new',
      p_limit: 100,
      p_provider_minute: 6000,
    });
    expect(second.map((r) => r.id).sort()).toEqual(first.map((r) => r.id).sort());
    expect(
      await rpc('resolve_notification_deliveries', {
        p_channel: 'email',
        p_worker_id: 'old',
        p_ids: first.map((r) => r.id),
      }),
    ).toEqual([]);
    expect(
      await rpc('settle_notification_deliveries', {
        p_channel: 'email',
        p_worker_id: 'old',
        p_results: first.map((r) => ({ id: r.id, state: 'delivered', provider_id: 'stale' })),
      }),
    ).toBe(0);
  }));
it.each([
  "update student_guardians set status='inactive'",
  "update student_guardians set access_expires_at=now()-interval '1 second'",
  "update profiles set status='inactive' where role='guardian'",
  "update tenants set status='suspended' where id='" + id(1) + "'",
  "update user_notification_category_preferences set push_enabled=false,email_enabled=false where category='pickup_dropoff'",
])('rechecks recipient eligibility before every channel submission: %s', (change) =>
  isolated(async () => {
    await startTrip(db);
    await recordEvent(db);
    const claims = {};
    for (const channel of ['push', 'email'])
      claims[channel] = await rpc('claim_notification_deliveries', {
        p_channel: channel,
        p_worker_id: channel,
        p_limit: 100,
        p_provider_minute: 6000,
      });
    await db.exec(change);
    for (const channel of ['push', 'email']) {
      const resolved = await rpc('resolve_notification_deliveries', {
        p_channel: channel,
        p_worker_id: channel,
        p_ids: claims[channel].map((r) => r.id),
      });
      expect(
        resolved.filter((r) => (r.event_type ?? r.notification_type) === 'student_picked_up'),
      ).toEqual([]);
    }
  }),
);
it('uses group claim/resolve/settle through the actual worker with a local provider', () =>
  isolated(async () => {
    await startTrip(db);
    await recordEvent(db);
    const sent = [];
    const result = await runDeliveryWorker({
      rpc,
      channel: 'push',
      workerId: 'real-local-worker',
      batchSize: 100,
      concurrency: 16,
      budgetMs: 1000,
      send: async (row) => {
        sent.push(buildFcmMessage(row));
        return 'mock-provider-id';
      },
      classify: () => ({ retry: false, category: 'permanent_payload_error' }),
      retryDelay: () => 60,
    });
    expect(result.delivered).toBeGreaterThan(0);
    expect(sent).toHaveLength(result.delivered);
    expect(
      (
        await query(
          "select count(*)::int as total from push_notification_outbox where status='delivered'",
        )
      )[0].total,
    ).toBe(result.delivered);
  }));
it.each([
  'guardian',
  'driver',
  'tenant_admin',
  'school_admin',
  'transportation_admin',
  'platform_super_admin',
])('keeps worker APIs unavailable to %s', (role) =>
  isolated(async () => {
    const profile =
      { guardian: 2, driver: 3, tenant_admin: 4, school_admin: 6, platform_super_admin: 5 }[role] ??
      74;
    if (role === 'transportation_admin')
      await db.exec(
        `insert into profiles(id,tenant_id,role) values('${id(profile)}','${id(1)}','transportation_admin')`,
      );
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id(profile)]);
    await db.exec('set local role authenticated');
    await expect(
      query("select * from claim_notification_deliveries('push','unauthorized',10,600)"),
    ).rejects.toThrow('permission denied');
  }),
);

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
  await rpc('expand_notification_audiences', { p_limit: 32 });
}
