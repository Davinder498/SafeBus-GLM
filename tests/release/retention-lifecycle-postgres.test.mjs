import {
  operationalSnapshot,
  verifyOperationalSnapshot,
  rehearseOperational,
} from '../../scripts/lib/operational-rollout.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import { fixture, migrationPath } from './fixtures/retention-lifecycle-schema.mjs';
const tenant = '22222222-2222-4222-8222-222222222222';
const trip = '33333333-3333-4333-8333-333333333333';
async function addTrip(db, days = 500) {
  await db.query(
    `insert into public.driver_trips values($1,$2,now()-($3+1)*interval '1 day',now()-$3*interval '1 day','completed',now()-($3+1)*interval '1 day',now()-$3*interval '1 day')`,
    [trip, tenant, days],
  );
}
const hold = async (db, data = {}) => {
  await db.exec("set test.role='authenticated'");
  const result = (
    await db.query("select public.manage_retention_case('create',$1) as value", [
      JSON.stringify({
        tripId: trip,
        reason: 'incident',
        reference: 'CASE-101',
        reviewAt: '2030-01-01T00:00:00Z',
        ...data,
      }),
    ])
  ).rows[0].value;
  await db.exec("set test.role='service_role'");
  return result.id;
};
const batch = async (db, dry = true, limit = 500) =>
  (await db.query('select public.run_retention_lifecycle($1,$2) as value', [dry, limit])).rows[0]
    .value;

test('approved retention boundaries, holds, cascades and archive coverage', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await addTrip(db);
  await db.exec(
    'insert into public.driver_trip_location_updates(tenant_id,driver_trip_id,recorded_at,created_at,latitude,longitude) select tenant_id,id,started_at,started_at,52,-113 from public.driver_trips',
  );
  const gps = (await db.query('select id from public.driver_trip_location_updates')).rows[0].id;
  await db.exec(
    'insert into public.student_trip_events(driver_trip_id,created_at,event_time) select id,ended_at,ended_at from public.driver_trips',
  );
  await t.test(
    'dry-run changes no source data, execution requires both approval fields',
    async () => {
      assert.equal((await batch(db)).counts.gps, 1);
      assert.equal((await batch(db)).counts.student_events, 1);
      await assert.rejects(batch(db, false), (e) => e.code === '55006');
      await db.exec('update public.retention_execution_control set destructive_enabled=true');
      await assert.rejects(batch(db, false), (e) => e.code === '55006');
      await db.exec(
        "update public.retention_execution_control set approval_reference='fixture-only',approved_at=now()",
      );
    },
  );
  const caseId = await hold(db);
  await t.test(
    'hold excludes GPS/events and parent cascades, with no automatic review release',
    async () => {
      assert.equal((await batch(db)).counts.gps, 0);
      assert.equal((await batch(db)).counts.student_events, 0);
      await assert.rejects(
        db.query('delete from public.driver_trips where id=$1', [trip]),
        (e) => e.code === '55006',
      );
      await assert.rejects(
        db.query('delete from public.driver_trip_location_updates where id=$1', [gps]),
        (e) => e.code === '55006',
      );
      await db.exec("update safebus_private.retention_cases set review_at=now()-interval '1 day'");
      assert.equal((await batch(db)).counts.gps, 0);
    },
  );
  await t.test(
    'unverified archive retains source; verified exact-row coverage permits GPS expiry',
    async () => {
      const chunk = (await db.query("select public.retention_archive_work('next') as value"))
        .rows[0].value;
      assert.equal(chunk.payload.samples.length, 1);
      assert.equal(chunk.payload.samples[0].id, gps);
      assert.equal((await batch(db)).counts.gps, 0);
      await assert.rejects(
        db.query('update public.driver_trip_location_updates set latitude=0'),
        (e) => e.code === '55006',
      );
      await db.query("select public.retention_archive_work('verify',$1)", [
        JSON.stringify({ id: chunk.id, sha256: 'a'.repeat(64), keyId: 'fixture' }),
      ]);
      assert.equal((await batch(db)).counts.gps, 1);
      await batch(db, false);
      assert.equal(
        (await db.query('select count(*)::int n from public.driver_trip_location_updates')).rows[0]
          .n,
        0,
      );
      assert.equal(
        (await db.query('select count(*)::int n from public.student_trip_events')).rows[0].n,
        1,
      );
    },
  );
  await t.test(
    'late-arriving GPS needs its own coverage; every overlapping hold must be covered',
    async () => {
      await db.exec(
        'insert into public.driver_trip_location_updates(tenant_id,driver_trip_id,recorded_at,created_at) select tenant_id,id,started_at,started_at from public.driver_trips',
      );
      assert.equal((await batch(db)).counts.gps, 0);
      const chunk = (await db.query("select public.retention_archive_work('next') as value"))
        .rows[0].value;
      await db.query("select public.retention_archive_work('verify',$1)", [
        JSON.stringify({ id: chunk.id, sha256: 'b'.repeat(64), keyId: 'fixture' }),
      ]);
      assert.equal((await batch(db)).counts.gps, 1);
      await hold(db, { reference: 'CASE-102' });
      assert.equal((await batch(db)).counts.gps, 0);
    },
  );
  await t.test('release respects minimum and decision use adds a calendar year', async () => {
    await db.exec("set test.role='authenticated'");
    const future = (
      await db.query("select public.manage_retention_case('create',$1) as value", [
        JSON.stringify({
          tripId: trip,
          reason: 'decision',
          reference: 'DEC-1',
          reviewAt: '2030-01-01',
          decisionUsedAt: '2026-11-01T18:00:00Z',
        }),
      ])
    ).rows[0].value;
    assert.equal(future.minimumUntil, '2027-11-01T18:00:00+00:00');
    await assert.rejects(
      db.query("select public.manage_retention_case('release',$1)", [
        JSON.stringify({ id: future.id, confirm: 'release' }),
      ]),
      (e) => e.code === '22023',
    );
    await db.query("select public.manage_retention_case('release',$1)", [
      JSON.stringify({ id: caseId, confirm: 'release' }),
    ]);
    await db.exec("set test.role='service_role'");
    assert.equal((await batch(db)).counts.student_events, 0);
  });
});

test('authority boundaries, privileged MFA, active session and recent authentication', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await addTrip(db, 10);
  await t.test('permitted administrators can preserve; every other role is denied', async () => {
    for (const role of ['tenant_admin', 'transportation_admin']) {
      await db.query('update public.profiles set role=$1', [role]);
      await hold(db, { reference: role });
    }
    for (const role of ['school_admin', 'guardian', 'driver', 'platform_super_admin']) {
      await db.query('update public.profiles set role=$1', [role]);
      await db.exec("set test.role='authenticated'");
      await assert.rejects(
        db.query("select public.manage_retention_case('list')"),
        (e) => e.code === '42501',
      );
    }
  });
  await db.exec("update public.profiles set role='tenant_admin';set test.role='authenticated'");
  for (const gate of ['session', 'mfa', 'recent'])
    await t.test(gate + ' is enforced', async () => {
      await db.exec(`set test.${gate}='false'`);
      await assert.rejects(
        db.query("select public.manage_retention_case('create',$1)", [
          JSON.stringify({
            tripId: trip,
            reason: 'incident',
            reference: 'GATE',
            reviewAt: '2030-01-01',
          }),
        ]),
        (e) => e.code === '42501',
      );
      await db.exec(`set test.${gate}='true'`);
    });
  await t.test('disabled authority and inactive profile are denied', async () => {
    await db.exec("update public.tenants set status='disabled'");
    await assert.rejects(
      db.query("select public.manage_retention_case('list')"),
      (e) => e.code === '42501',
    );
    await db.exec(
      "update public.tenants set status='active';update public.profiles set status='inactive'",
    );
    await assert.rejects(
      db.query("select public.manage_retention_case('list')"),
      (e) => e.code === '42501',
    );
    await db.exec("update public.profiles set status='active'");
  });
  await t.test('other authority cannot read or release preservation', async () => {
    await db.exec(
      "update public.profiles set tenant_id=gen_random_uuid(); insert into public.tenants select tenant_id,'active' from public.profiles",
    );
    assert.deepEqual(
      (await db.query("select public.manage_retention_case('list') as value")).rows[0].value,
      [],
    );
    await assert.rejects(
      db.query("select public.manage_retention_case('create',$1)", [
        JSON.stringify({
          tripId: trip,
          reason: 'incident',
          reference: 'OTHER',
          reviewAt: '2030-01-01',
        }),
      ]),
      (e) => e.code === '42501',
    );
  });
  await t.test('anonymous/customer/service privileges remain separated', async () => {
    const row = (
      await db.query(`select
   has_function_privilege('anon','public.manage_retention_case(text,jsonb)','execute') a,
   has_function_privilege('service_role','public.manage_retention_case(text,jsonb)','execute') s,
   has_function_privilege('authenticated','public.run_retention_lifecycle(boolean,integer)','execute') r,
   has_table_privilege('authenticated','safebus_private.retention_cases','select') t`)
    ).rows[0];
    assert.deepEqual(row, { a: false, s: false, r: false, t: false });
  });
});

test('notification outcomes, event floors, unresolved announcements and bounded repeats', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await addTrip(db);
  await db.exec(`
 insert into public.user_notifications(created_at) values(now()-interval '120 days');
 insert into public.guardian_notification_outbox(user_notification_id,status,created_at,delivered_at)
  select id,'delivered',now()-interval '120 days',now()-interval '1 day' from public.user_notifications;
 insert into public.guardian_notification_outbox(status,created_at,failed_at) values('failed',now()-interval '120 days',now()-interval '91 days');
 insert into public.guardian_notification_outbox(status,created_at) values('pending',now()-interval '120 days');
 insert into public.push_notification_outbox(status,created_at,cancelled_at) values('cancelled',now()-interval '120 days',now()-interval '91 days');
 insert into safebus_private.authority_announcements(tenant_id,created_at) values('${tenant}',now()-interval '500 days');
 insert into public.trip_exceptions(driver_trip_id,created_at) select id,now()-interval '394 days' from public.driver_trips;
 insert into public.trip_operational_statuses(driver_trip_id,set_at,updated_at) select id,now()-interval '396 days',now()-interval '396 days' from public.driver_trips;
 update public.retention_execution_control set destructive_enabled=true,approval_reference='fixture',approved_at=now();
 `);
  const first = await batch(db);
  assert.equal(first.counts.email, 1);
  assert.equal(first.counts.push, 1);
  assert.equal(first.counts.inbox, 0);
  assert.equal(first.counts.exceptions, 0);
  assert.equal(first.counts.statuses, 1);
  assert.equal(first.counts.announcements, 0);
  await assert.rejects(db.exec('delete from public.user_notifications'), (e) => e.code === '55006');
  await assert.rejects(
    db.exec('delete from safebus_private.authority_announcements'),
    (e) => e.code === '55006',
  );
  await batch(db, false, 1);
  assert.equal((await batch(db)).counts.email, 0);
  assert.equal((await batch(db)).counts.inbox, 0);
  await assert.rejects(
    db.query('select public.run_retention_lifecycle(true,501)'),
    (e) => e.code === '22023',
  );
  await assert.rejects(
    db.query('select safebus_private.run_retention_deletion(null,false)'),
    (e) => e.code === '55006',
  );
  await assert.rejects(
    db.query('select public.apply_notification_retention(false)'),
    (e) => e.code === '55006',
  );
});

test('protected lifecycle manifest reconciles exact observed functions and rehearses rollback', async (t) => {
  const db = await fixture(false);
  t.after(() => db.close());
  const client = {
    query: (sql, params) =>
      !params && sql.includes(';')
        ? db.exec(sql).then((rows) => rows.at(-1) ?? { rows: [] })
        : db.query(sql, params),
  };
  const config = JSON.parse(await fs.readFile('config/pending/retention-lifecycle.json', 'utf8'));
  verifyOperationalSnapshot(await operationalSnapshot(client, config), config, 'before');
  await rehearseOperational(client, await fs.readFile(migrationPath, 'utf8'), config);
  verifyOperationalSnapshot(await operationalSnapshot(client, config), config, 'before');
});

test('overlapping preservation inherits available archives; release cannot delete another case evidence', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await addTrip(db);
  await db.exec(
    'insert into public.driver_trip_location_updates(tenant_id,driver_trip_id,recorded_at,created_at) select tenant_id,id,started_at,started_at from public.driver_trips',
  );
  const first = await hold(db);
  const chunk = (await db.query("select public.retention_archive_work('next') as v")).rows[0].v;
  await db.query("select public.retention_archive_work('verify',$1)", [
    JSON.stringify({ id: chunk.id, keyId: 'fixture', sha256: 'a'.repeat(64) }),
  ]);
  await db.exec(
    "update public.retention_execution_control set destructive_enabled=true,approved_at=now(),approval_reference='fixture'",
  );
  await batch(db, false);
  const second = await hold(db, { reference: 'CASE-SECOND' });
  await db.exec("set test.role='authenticated'");
  const archives = (
    await db.query("select public.manage_retention_case('archives',$1) as v", [
      JSON.stringify({ id: second }),
    ])
  ).rows[0].v;
  assert.equal(archives[0].id, chunk.id);
  assert.equal(archives[0].source_case_id, first);
  await db.query("select public.manage_retention_case('release',$1)", [
    JSON.stringify({ id: first, confirm: 'release' }),
  ]);
  await db.exec(
    "set test.role='service_role';update safebus_private.retention_cases set released_at=now()-interval '10 minutes' where released_at is not null;update safebus_private.retention_archive_chunks set lease_until=now()-interval '10 minutes'",
  );
  assert.equal(
    (await db.query("select public.retention_archive_work('cleanup') as v")).rows[0].v,
    null,
  );
  await db.exec("set test.role='authenticated'");
  await db.query("select public.manage_retention_case('release',$1)", [
    JSON.stringify({ id: second, confirm: 'release' }),
  ]);
  await db.exec(
    "set test.role='service_role';update safebus_private.retention_cases set released_at=now()-interval '10 minutes' where released_at is not null",
  );
  const cleanup = (await db.query("select public.retention_archive_work('cleanup') as v")).rows[0]
    .v;
  assert.equal(cleanup.id, chunk.id);
  await db.exec("set test.role='authenticated'");
  await assert.rejects(
    db.query("select public.manage_retention_case('create',$1)", [
      JSON.stringify({
        tripId: trip,
        reason: 'incident',
        reference: 'TOO-LATE',
        reviewAt: '2030-01-01',
      }),
    ]),
    (e) => e.code === '55006',
  );
  await db.exec("set test.role='service_role'");
  await db.query("select public.retention_archive_work('removed',$1)", [
    JSON.stringify({ id: chunk.id }),
  ]);
  assert.equal(
    (await db.query('select count(*)::int n from safebus_private.retention_archive_coverage'))
      .rows[0].n,
    0,
  );
  assert.equal(
    (await db.query('select cardinality(gps_ids) n from safebus_private.retention_archive_chunks'))
      .rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("select public.retention_archive_work('cleanup') as v")).rows[0].v,
    null,
  );
  await db.exec(
    "update safebus_private.retention_archive_chunks set last_removed_check=now()-interval '2 days'",
  );
  assert.equal(
    (await db.query("select public.retention_archive_work('cleanup') as v")).rows[0].v.id,
    chunk.id,
  );
});
