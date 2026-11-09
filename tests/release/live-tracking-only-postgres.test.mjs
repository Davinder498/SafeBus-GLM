import assert from 'node:assert/strict';
import test from 'node:test';
import {
  baseline,
  installed,
  migration,
  setup,
  time,
  ingest,
  start,
  register,
  bind,
  id,
} from './fixtures/live-tracking-only-db.mjs';

const count = async (db, table) =>
  Number((await db.query('select count(*) as n from ' + table)).rows[0].n);
async function changedFix(
  db,
  run,
  device,
  sequence,
  recordedAt,
  latitude,
  event = id(100 + sequence),
) {
  return (
    await db.query(
      "select public.ingest_driver_location_event($1,$2,$3,$4,$5,$6,-113.5,5,null,null,80,'offline') result",
      [run.trackingToken, device.deviceCredential, event, sequence, recordedAt, latitude],
    )
  ).rows[0].result;
}
test('live tracking uses a constant-size cursor with no GPS trail or duplicate side effects', async (t) => {
  const db = await installed();
  t.after(() => db.close());
  const { run, device } = await setup(db);
  const initial = await time(db, '-10 minutes'),
    next = await time(db, '-9 minutes');
  await t.test(
    'bound native sessions cannot bypass validation through the legacy uploader',
    async () => {
      await assert.rejects(
        db.query('select public.update_bus_tracking_location($1,53.5,-113.5,5,null,null)', [
          run.trackingToken,
        ]),
        /must use native ingestion/,
      );
      assert.equal(await count(db, 'driver_trip_current_locations'), 0);
    },
  );
  await t.test('table, archive tables and archive RPC are gone', async () => {
    const r = (
      await db.query(
        "select to_regclass('public.driver_trip_location_updates') as history,to_regclass('safebus_private.retention_archive_chunks') as archive,to_regprocedure('public.retention_archive_work(text,jsonb)') as rpc",
      )
    ).rows[0];
    assert.deepEqual(r, { history: null, archive: null, rpc: null });
  });
  await t.test('a lost-response retry acknowledges once without publishing twice', async () => {
    assert.equal(
      (await ingest(db, run.trackingToken, device.deviceCredential, 1, initial)).accepted,
      true,
    );
    assert.equal(
      (await ingest(db, run.trackingToken, device.deviceCredential, 1, initial)).duplicate,
      true,
    );
    assert.equal(await count(db, 'tracking_test_signals'), 1);
    assert.equal(await count(db, 'safebus_private.driver_tracking_state'), 1);
    const messages = (await db.query('select * from realtime.captured')).rows;
    assert.deepEqual(messages.map((m) => m.topic).sort(), [
      'safebus:guardian:' + id(4),
      'safebus:tenant:' + id(1),
    ]);
    assert.ok(
      messages.every(
        (m) =>
          m.private === true &&
          m.payload.reason === 'location' &&
          !('latitude' in m.payload) &&
          !('longitude' in m.payload),
      ),
    );
  });
  await t.test(
    'latest identity cannot be reused with altered sequence, payload, UUID or timestamp',
    async () => {
      await assert.rejects(
        changedFix(db, run, device, 1, initial, 53.6),
        /identity has already been used/,
      );
      await assert.rejects(
        ingest(db, run.trackingToken, device.deviceCredential, 1, next),
        /identity has already been used/,
      );
      await assert.rejects(
        ingest(db, run.trackingToken, device.deviceCredential, 1, initial, id(999)),
        /identity has already been used/,
      );
      await assert.rejects(
        ingest(db, run.trackingToken, device.deviceCredential, 2, next, id(101)),
        /identity has already been used/,
      );
      assert.equal(await count(db, 'tracking_test_signals'), 1);
    },
  );
  await t.test(
    'new fixes overwrite state and any older replay is discardable without another effect',
    async () => {
      assert.equal(
        (await ingest(db, run.trackingToken, device.deviceCredential, 2, next)).accepted,
        true,
      );
      const old = await ingest(db, run.trackingToken, device.deviceCredential, 1, initial);
      assert.equal(old.accepted, false);
      assert.equal(old.rejectionReason, 'out_of_order');
      assert.equal(await count(db, 'tracking_test_signals'), 2);
      assert.equal(await count(db, 'safebus_private.driver_tracking_state'), 1);
      assert.equal(await count(db, 'driver_trip_current_locations'), 1);
      assert.equal(await count(db, 'realtime.captured'), 4);
    },
  );
  await t.test(
    'invalid, stale, out-of-order and impossible fixes never advance the cursor',
    async () => {
      assert.equal(
        (await changedFix(db, run, device, 3, next, 53.5)).rejectionReason,
        'out_of_order',
      );
      assert.equal(
        (await changedFix(db, run, device, 3, await time(db, '-8 minutes 59 seconds'), 60))
          .rejectionReason,
        'impossible_jump',
      );
      for (const latitude of [null, 91, Number.NaN, Number.POSITIVE_INFINITY])
        assert.equal(
          (await changedFix(db, run, device, 3, await time(db, '-8 minutes'), latitude))
            .rejectionReason,
          'invalid_fix',
        );
      assert.equal(
        (
          await ingest(
            db,
            run.trackingToken,
            device.deviceCredential,
            3,
            await time(db, '-25 hours'),
          )
        ).rejectionReason,
        'stale_fix',
      );
      assert.equal(await count(db, 'tracking_test_signals'), 2);
      assert.equal(
        Number(
          (await db.query('select last_sequence from safebus_private.driver_tracking_state'))
            .rows[0].last_sequence,
        ),
        2,
      );
    },
  );
  await t.test('simultaneously submitted retries have one accepted effect', async () => {
    const at = await time(db, '-7 minutes');
    // PGlite serializes calls; this exercises the real lock/unique-key SQL, not a production load test.
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        ingest(db, run.trackingToken, device.deviceCredential, 3, at),
      ),
    );
    assert.equal(results.filter((r) => r.duplicate === false).length, 1);
    assert.equal(await count(db, 'tracking_test_signals'), 3);
  });
  await t.test('credential rotation and QR rescan preserve the device cursor', async () => {
    const scanned = await start(db),
      rotated = await register(db);
    await bind(db, scanned.trackingToken, rotated);
    assert.equal(rotated.deviceId, device.deviceId);
    const recorded = (
      await db.query('select recorded_at::text as at from safebus_private.driver_tracking_state')
    ).rows[0].at;
    const r = await ingest(db, run.trackingToken, rotated.deviceCredential, 3, recorded);
    // The recorded fix's exact timestamp is stored at acceptance, not regenerated by the retry.
    assert.equal(r.duplicate, true);
  });
});

test('cutover preserves the last accepted sequence and rollback preserves the old data', async (t) => {
  const db = await baseline();
  t.after(() => db.close());
  const { run, device } = await setup(db),
    at = await time(db, '-10 minutes');
  await ingest(db, run.trackingToken, device.deviceCredential, 10, at);
  await db.exec('begin');
  await db.exec(await migration());
  assert.equal(
    (await ingest(db, run.trackingToken, device.deviceCredential, 10, at)).duplicate,
    true,
  );
  assert.equal(
    (await ingest(db, run.trackingToken, device.deviceCredential, 9, at)).rejectionReason,
    'out_of_order',
  );
  await db.exec('rollback');
  assert.equal(await count(db, 'driver_trip_location_updates'), 1);
  assert.equal(
    (await db.query("select to_regclass('safebus_private.driver_tracking_state') as state")).rows[0]
      .state,
    null,
  );
});

test('stopped-session backlog, replacement trips and private expiry cannot recreate a GPS trail', async (t) => {
  const db = await installed();
  t.after(() => db.close());
  const { run, device } = await setup(db),
    at = await time(db, '-30 minutes');
  await ingest(db, run.trackingToken, device.deviceCredential, 1, at);
  await db.query('select public.end_driver_trip($1)', [run.trip.id]);
  const afterEnd = await ingest(
    db,
    run.trackingToken,
    device.deviceCredential,
    2,
    await time(db, '-29 minutes'),
  );
  assert.equal(afterEnd.accepted, true);
  assert.equal(afterEnd.stopTracking, true);
  assert.equal(await count(db, 'tracking_test_signals'), 1);
  const second = await start(db);
  await bind(db, second.trackingToken, device);
  assert.equal(
    (await ingest(db, second.trackingToken, device.deviceCredential, 3, await time(db))).accepted,
    true,
  );
  assert.equal(
    (await ingest(db, run.trackingToken, device.deviceCredential, 2, at)).rejectionReason,
    'out_of_order',
  );
  await db.exec("select set_config('test.agreement_allowed','false',false)");
  await assert.rejects(
    db.query('delete from driver_trip_current_locations where driver_trip_id=$1', [second.trip.id]),
    /MSA and DPA/,
  );
  await assert.rejects(
    ingest(db, second.trackingToken, device.deviceCredential, 4, await time(db, '1 second')),
    /MSA and DPA/,
  );
  await db.exec("select set_config('test.agreement_allowed','true',false)");
  await db.exec(
    "update driver_trip_current_locations set recorded_at=now()-interval '25 hours'; select set_config('test.agreement_allowed','false',false); select safebus_private.expire_driver_tracking_positions()",
  );
  const state = (await db.query('select * from safebus_private.driver_tracking_state')).rows[0];
  assert.equal(Number(state.last_sequence), 3);
  assert.equal('latitude' in state, false);
  assert.equal('longitude' in state, false);
  assert.equal(await count(db, 'driver_trip_current_locations'), 0);
  await db.exec("select set_config('test.agreement_allowed','true',false)");
  assert.equal(
    (await ingest(db, second.trackingToken, device.deviceCredential, 1, at)).rejectionReason,
    'out_of_order',
  );
});

test('driver scope and all non-driver roles remain isolated from the new tracking state', async (t) => {
  const db = await installed();
  t.after(() => db.close());
  const { run, device } = await setup(db),
    at = await time(db);
  for (const role of [
    'tenant_admin',
    'school_admin',
    'transportation_admin',
    'guardian',
    'platform_super_admin',
  ]) {
    await db.query('update profiles set role=$1 where id=$2', [role, id(3)]);
    await assert.rejects(
      ingest(db, run.trackingToken, device.deviceCredential, 1, at),
      /authenticated driver/,
    );
  }
  await db.query("update profiles set role='driver' where id=$1", [id(3)]);
  for (const [column, value] of [
    ['tenant_id', id(90)],
    ['driver_id', id(99)],
    ['device_id', id(98)],
    ['status', 'revoked'],
  ]) {
    await db.exec('begin');
    await db.query(
      'update bus_tracking_sessions set ' + column + '=$1 where session_token_hash=md5($2)',
      [value, run.trackingToken],
    );
    await assert.rejects(
      ingest(db, run.trackingToken, device.deviceCredential, 1, at),
      /session is not valid/,
    );
    await db.exec('rollback');
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec('begin;set local role ' + role);
    await assert.rejects(
      db.query('select * from safebus_private.driver_tracking_state'),
      /permission denied/,
    );
    await db.exec('rollback');
  }
  await db.query("insert into auth.mfa_factors(user_id,status) values($1,'verified')", [id(3)]);
  await assert.rejects(
    ingest(db, run.trackingToken, device.deviceCredential, 1, at),
    /MFA required/,
  );
  await db.exec("select set_config('test.aal','aal2',false)");
  await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [
    id(70),
  ]);
  await assert.rejects(
    ingest(db, run.trackingToken, device.deviceCredential, 1, at),
    /authenticated driver/,
  );
  assert.equal(await count(db, 'safebus_private.driver_tracking_state'), 0);
});

test('interleaving retired-session backlog cannot reset active-trip movement validation', async (t) => {
  const db = await installed();
  t.after(() => db.close());
  const { run: first, device } = await setup(db);
  await ingest(db, first.trackingToken, device.deviceCredential, 1, await time(db, '-30 minutes'));
  await db.query('select public.end_driver_trip($1)', [first.trip.id]);
  const current = await start(db);
  await bind(db, current.trackingToken, device);
  assert.equal(
    (
      await ingest(
        db,
        current.trackingToken,
        device.deviceCredential,
        2,
        await time(db, '-30 seconds'),
      )
    ).accepted,
    true,
  );
  assert.equal(
    (
      await ingest(
        db,
        first.trackingToken,
        device.deviceCredential,
        3,
        await time(db, '-29 minutes'),
      )
    ).accepted,
    true,
  );
  const before = await count(db, 'tracking_test_signals');
  assert.equal(
    (await changedFix(db, current, device, 4, await time(db), 60)).rejectionReason,
    'impossible_jump',
  );
  assert.equal(await count(db, 'tracking_test_signals'), before);
});

test('a replacement phone cannot reset the same bus trip movement validation', async (t) => {
  const db = await installed();
  t.after(() => db.close());
  const { run, device } = await setup(db);
  await ingest(db, run.trackingToken, device.deviceCredential, 1, await time(db, '-10 minutes'));
  const replacement = await register(db, id(51)),
    rescan = await start(db);
  await bind(db, rescan.trackingToken, replacement);
  assert.equal(rescan.trip.id, run.trip.id);
  assert.equal(
    (await changedFix(db, rescan, replacement, 1, await time(db), 60, id(999))).rejectionReason,
    'impossible_jump',
  );
});

test('removal refuses new preservation, archive objects, unknown dependencies and changed definitions', async (t) => {
  const db = await baseline();
  t.after(() => db.close());
  const { run } = await setup(db);
  const blockers = [
    [
      "insert into safebus_private.retention_cases(id,tenant_id,driver_trip_id,window_start,window_end,reason,reference,minimum_until,review_at,created_by) values($1,$2,$3,now(),now(),'incident','CASE-1',now(),now(),$4)",
      [id(301), id(1), run.trip.id, id(2)],
      /preservation or archive/,
    ],
    [
      "insert into storage.objects(id,bucket_id) values($1,'retention-evidence')",
      [id(302)],
      /preservation or archive/,
    ],
    [
      'create view gps_test_dependency as select id from public.driver_trip_location_updates',
      [],
      /depend/,
    ],
    [
      'alter function public.update_bus_tracking_location(text,double precision,double precision,double precision,double precision,double precision) security invoker',
      [],
      /differs from reviewed/,
    ],
  ];
  for (const [sql, args, error] of blockers) {
    await db.exec('begin');
    await db.query(sql, args);
    await assert.rejects(db.exec(await migration()), error);
    await db.exec('rollback');
    assert.notEqual(
      (await db.query("select to_regclass('public.driver_trip_location_updates') as h")).rows[0].h,
      null,
    );
  }
});

test('operational preservation and disposal still work without GPS archives', async (t) => {
  const db = await installed();
  t.after(() => db.close());
  await setup(db);
  await db.exec(
    "select set_config('test.role','authenticated',false),set_config('test.aal','aal2',false)",
  );
  for (const role of ['driver', 'guardian', 'school_admin', 'platform_super_admin']) {
    await db.query('update profiles set role=$1 where id=$2', [role, id(3)]);
    await assert.rejects(
      db.query("select public.manage_retention_case('list','{}')"),
      /administrator required/,
    );
  }
  for (const role of ['tenant_admin', 'transportation_admin']) {
    await db.query('update profiles set role=$1 where id=$2', [role, id(3)]);
    assert.deepEqual(
      (await db.query("select public.manage_retention_case('list','{}') r")).rows[0].r,
      [],
    );
    await assert.rejects(
      db.query("select public.manage_retention_case('archives','{}')"),
      /Unknown preservation action/,
    );
  }
  await db.query(
    `insert into driver_trips(id,tenant_id,driver_id,bus_id,route_id,started_at,ended_at,status,created_at,updated_at)
    values($1,$2,$3,$4,$5,now()-interval '501 days',now()-interval '500 days','completed',now()-interval '501 days',now()-interval '500 days')`,
    [id(501), id(1), id(13), id(20), id(21)],
  );
  const held = (
    await db.query(
      `select public.manage_retention_case('create',jsonb_build_object('tripId',$1::text,
    'reason','incident','reference','CASE-1','reviewAt',now()+interval '30 days')) r`,
      [id(501)],
    )
  ).rows[0].r;
  const list = (await db.query("select public.manage_retention_case('list','{}') r")).rows[0].r;
  assert.equal(list.length, 1);
  assert.equal(list[0].verified_chunks, 0);
  await assert.rejects(
    db.query('delete from driver_trips where id=$1', [id(501)]),
    /preservation active/,
  );
  await db.query(
    "select public.manage_retention_case('release',jsonb_build_object('id',$1::text,'confirm','release'))",
    [held.id],
  );
  await db.query('delete from driver_trips where id=$1', [id(501)]);
  await db.exec("select set_config('test.role','service_role',false)");
  const result = (await db.query('select public.run_retention_lifecycle(true,500) r')).rows[0].r;
  assert.equal(result.dryRun, true);
  assert.equal(result.counts.gps, 0);
  assert.equal(result.counts.archive_manifests, 0);
  assert.ok('student_events' in result.counts);
});
