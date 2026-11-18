import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test, { test as registerTest } from 'node:test';
import {
  liveProgressFixture,
  readLine,
  migrationPath,
  id,
} from './fixtures/shared-live-progress-db.mjs';
const sql = await fs.readFile(migrationPath, 'utf8');
const scalar = async (db, q) => (await db.query(q)).rows[0].value;
const cache = (db) =>
  scalar(
    db,
    'select jsonb_agg(to_jsonb(c)) as value from safebus_private.live_bus_progress_cache c',
  );
async function equalPrevious(db) {
  await db.exec('begin');
  try {
    const expected = (
      await db.query("select public.previous_guardian_service_lines('TEST-1') as value")
    ).rows[0].value;
    assert.deepEqual(await readLine(db), expected);
    await db.exec('commit');
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
}
function behaviorSuite(sql, prefix) {
  const test = (name, fn) => registerTest(prefix + name, fn);
  test('real PostGIS: preserve full response across geometry, direction, freshness and trip states', async (t) => {
    const db = await liveProgressFixture(t);
    await db.exec(sql);
    const changes = [
      '',
      "update route_trip_patterns set direction='reverse'",
      "update route_trip_stop_schedules set planned_arrival_time=case when route_stop_id='" +
        id(20) +
        "' then '23:59'::time else '00:05'::time end",
      'update driver_trips set route_shape_id=null',
      "update driver_trips set route_shape_id='" +
        id(23) +
        "'; update route_shapes set path=extensions.st_geomfromtext('LINESTRING(-113.50 53.50,-113.49 53.51,-113.50 53.52)',4326)",
      'update driver_trip_current_locations set longitude=-110',
      "update driver_trip_current_locations set longitude=-113.5,recorded_at=now()-interval '3 minutes'",
      "update driver_trip_current_locations set recorded_at=now()+interval '1 hour'",
      'update driver_trip_current_locations set recorded_at=now(),latitude=null',
      "update driver_trip_current_locations set latitude=53.505; update driver_trips set status='paused'",
      "update driver_trips set status='completed'",
      "update driver_trips set status='active'; update route_stops set latitude=null,longitude=null",
      "update route_stops set status='inactive'",
    ];
    for (const change of changes) {
      if (change) await db.exec(change);
      await equalPrevious(db);
    }
  });
  test('fifty guardian reads share live results without sharing names, access or coordinates', async (t) => {
    const db = await liveProgressFixture(t);
    await db.exec(sql);
    await db.exec(`create table live_cache_writes(n integer); insert into live_cache_writes values(0);
 create function count_live_cache_write() returns trigger language plpgsql as $$begin update public.live_cache_writes set n=n+1;return new;end$$;
 create trigger count_live_cache_write after insert or update on safebus_private.live_bus_progress_cache for each row execute function count_live_cache_write();
 set role authenticated;`);
    for (let n = 0; n < 50; n++) {
      await db.query("select set_config('test.uid',$1,false)", [id(n % 2 ? 110 : 100)]);
      assert.deepEqual((await readLine(db))[0].stops[0].pickupStudentNames, [
        n % 2 ? 'Parent B child' : 'Parent A child',
      ]);
    }
    await db.exec('reset role');
    assert.equal(await scalar(db, 'select n as value from live_cache_writes'), 1);
    const rows = await cache(db);
    assert.equal(rows.length, 1);
    assert.deepEqual(Object.keys(rows[0].progress_data).sort(), [
      'display_position',
      'progress_source',
      'stop_count',
      'stops',
    ]);
    for (const s of rows[0].progress_data.stops)
      assert.deepEqual(Object.keys(s).sort(), [
        'eta_min_minutes',
        'eta_status',
        'id',
        'service_state',
      ]);
    const encoded = JSON.stringify(rows);
    for (const forbidden of [
      'Parent A',
      'Parent B',
      'latitude',
      'longitude',
      'recorded_at',
      'guardian',
    ])
      assert.equal(encoded.includes(forbidden), false);
    await db.exec(
      "update student_guardians set access_expires_at=now()-interval '1 minute' where guardian_id='" +
        id(111) +
        "'",
    );
    assert.deepEqual(await readLine(db), []);
    await db.query("select set_config('test.uid',$1,false)", [id(100)]);
    await db.exec(
      "update student_bus_assignments set status='inactive' where student_id='" + id(102) + "'",
    );
    assert.deepEqual(await readLine(db), []);
    assert.deepEqual(
      await cache(db),
      rows,
      'access changes never become shared permission decisions',
    );
  });
  test('GPS, pause/end, reassignment and source deletion discard old live metrics immediately', async (t) => {
    const db = await liveProgressFixture(t);
    await db.exec(sql);
    await readLine(db);
    for (const change of [
      'update driver_trip_current_locations set latitude=53.515',
      'update driver_trip_current_locations set speed_mps=12',
      'update driver_trip_current_locations set accuracy_m=15',
      "update driver_trip_current_locations set recorded_at=now()-interval '3 minutes'",
      'update driver_trip_current_locations set recorded_at=now()',
      "update driver_trips set status='paused'",
      "update driver_trips set status='active'",
      'update driver_trips set route_shape_id=null',
    ]) {
      await db.exec(change);
      assert.equal(await cache(db), null, change);
      await equalPrevious(db);
    }
    await db.exec("update driver_trips set status='completed'");
    assert.equal(await cache(db), null);
    await equalPrevious(db);
    assert.equal(await cache(db), null);
    await db.exec("update driver_trips set status='active'");
    await readLine(db);
    await db.exec('delete from driver_trip_current_locations');
    assert.equal(await cache(db), null);
    await equalPrevious(db);
    assert.equal(await cache(db), null);
  });
  test('route edits replace one result, stale requests never reuse fresh progress, all roles fail closed', async (t) => {
    const db = await liveProgressFixture(t);
    await db.exec(sql);
    await readLine(db);
    let digest = (await cache(db))[0].input_digest;
    for (const change of [
      'update route_stops set latitude=latitude+0.0001',
      'update route_stops set stop_order=4-stop_order',
      "update route_trip_patterns set direction='reverse'",
      "update route_trip_stop_schedules set planned_arrival_time=planned_arrival_time+interval '1 minute'",
      "update route_shapes set path=extensions.st_geomfromtext('LINESTRING(-113.50 53.50,-113.49 53.51,-113.50 53.52)',4326)",
    ]) {
      await db.exec(change);
      await equalPrevious(db);
      const rows = await cache(db);
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].input_digest, digest);
      digest = rows[0].input_digest;
    }
    for (const [setting, value] of [
      ['test.session', 'revoked'],
      ['test.mfa', 'incomplete'],
      ['test.role', 'driver'],
      ['test.role', 'tenant_admin'],
      ['test.role', 'school_admin'],
      ['test.role', 'transportation_admin'],
      ['test.role', 'platform_admin'],
      ['test.tenant', id(999)],
    ]) {
      await db.exec('begin');
      await db.query('select set_config($1,$2,true)', [setting, value]);
      await assert.rejects(readLine(db), (e) => e.code === '42501');
      await db.exec('rollback');
    }
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await db.exec('begin;set local role ' + role);
      await assert.rejects(
        db.query('select * from safebus_private.live_bus_progress_cache'),
        (e) => e.code === '42501',
      );
      await db.exec('rollback');
      await db.exec('begin;set local role ' + role);
      await assert.rejects(
        db.query("select safebus_private.shared_live_bus_progress(null,'{}','[]',null)"),
        (e) => e.code === '42501',
      );
      await db.exec('rollback');
    }
  });
  test('read-only cache misses preserve exact response without filling live or static cache', async (t) => {
    const db = await liveProgressFixture(t);
    await db.exec(sql);
    await db.exec('begin transaction read only');
    const previous = (
      await db.query("select public.previous_guardian_service_lines('TEST-1') as value")
    ).rows[0].value;
    assert.deepEqual(await readLine(db), previous);
    assert.equal(await cache(db), null);
    await db.exec('rollback');
  });
  async function inputs(db) {
    const service = (
      await db.query(`select jsonb_build_object('driver_trip_id',d.id,'driver_id',d.driver_id,'bus_id',d.bus_id,
 'bus_number',b.bus_number,'license_plate',b.license_plate,'route_name',r.route_name,'trip_name',p.display_name,'direction',p.direction,
 'route_id',d.route_id,'route_trip_pattern_id',d.route_trip_pattern_id,'route_shape_id',d.route_shape_id,'trip_status',d.status,
 'location_state','fresh','raw_latitude',l.latitude,'raw_longitude',l.longitude,'raw_recorded_at',l.recorded_at,
 'accuracy_m',l.accuracy_m,'speed_mps',l.speed_mps) as value from driver_trips d join driver_trip_current_locations l on l.driver_trip_id=d.id join buses b on b.id=d.bus_id join routes r on r.id=d.route_id join route_trip_patterns p on p.id=d.route_trip_pattern_id`)
    ).rows[0].value;
    const stops = (
      await db.query(`select jsonb_agg(jsonb_build_object('id',id,'stop_name',stop_name,'stop_order',stop_order,
 'latitude',latitude,'longitude',longitude,'display_index',stop_order-1,'stop_count',3,'planned_arrival_time',(select planned_arrival_time from route_trip_stop_schedules where route_stop_id=route_stops.id)) order by stop_order) as value from route_stops`)
    ).rows[0].value;
    const path = await scalar(db, 'select path::text as value from route_shapes limit 1');
    return [id(1), service, stops, path];
  }
  const compute = (db, args) =>
    db.query('select safebus_private.shared_live_bus_progress($1,$2,$3,$4)', args);
  test('late computations cannot resurrect an old GPS sample or an ended trip', async (t) => {
    const db = await liveProgressFixture(t);
    await db.exec(sql);
    const old = await inputs(db);
    await db.exec('update driver_trip_current_locations set latitude=53.515');
    await compute(db, old);
    assert.equal(await cache(db), null, 'source comparison rejects superseded input');
    await readLine(db);
    assert.equal((await cache(db)).length, 1);
    const active = await inputs(db);
    await db.exec("update driver_trips set status='completed'");
    await compute(db, active);
    assert.equal(await cache(db), null, 'closed trip cannot be repopulated by late computation');
  });
  test('a retained earlier result is never served once its location state is stale', async (t) => {
    const db = await liveProgressFixture(t);
    await db.exec(sql);
    await readLine(db);
    const warm = (await cache(db))[0].input_digest;
    await compute(db, await inputs(db));
    assert.equal(
      (await cache(db))[0].input_digest,
      warm,
      'synthetic inputs match the real RPC exactly',
    );
    await db.exec(
      "update driver_trip_current_locations set recorded_at=now()-interval '3 minutes'",
    );
    // Simulate a result made while this same sample was still fresh. Only the
    // private owner can construct these inputs; production callers recompute state.
    await compute(db, await inputs(db));
    assert.equal((await cache(db)).length, 1);
    const response = (await readLine(db))[0];
    assert.equal(response.locationState, 'stale');
    assert.equal(response.progressPosition, null);
    assert.equal(response.latitude, null);
    for (const stop of response.stops) assert.equal(stop.etaStatus, 'unavailable');
  });
}
behaviorSuite(sql, '');
behaviorSuite(
  sql +
    '\n' +
    (await fs.readFile(
      'supabase/migrations/pending/20261118143224_bound_shared_eta_query_expansion.sql',
      'utf8',
    )),
  'bounded ETA: ',
);
test('protected release restores source triggers and previous RPC with exact catalog lineage', async (t) => {
  const {
    operationalSnapshot,
    operationalDigest,
    operationalRestoreSql,
    verifyOperationalSnapshot,
  } = await import('../../scripts/lib/operational-rollout.mjs');
  const { collectSchemaCatalog, calculateSchemaFingerprint } =
    await import('../../scripts/lib/schema-fingerprint.mjs');
  const { trackingCatalogDelta, precedingTrackingCatalog } =
    await import('../../scripts/lib/tracking-release-lineage.mjs');
  const config = JSON.parse(await fs.readFile('config/pending/shared-live-progress.json', 'utf8'));
  const proof = JSON.parse(
    await fs.readFile('config/observed/shared-live-progress-lineage-20261117.json', 'utf8'),
  );
  const db = await liveProgressFixture(t);
  const before = await operationalSnapshot(db, config);
  verifyOperationalSnapshot(before, config, 'before');
  const catalog = await collectSchemaCatalog(db);
  const fingerprint = await calculateSchemaFingerprint(db);
  await db.exec(sql);
  assert.equal(operationalDigest(sql), config.migrationSha256);
  verifyOperationalSnapshot(await operationalSnapshot(db, config), config, 'after');
  await db.exec(await fs.readFile('tests/rls/shared-live-progress-readonly.sql', 'utf8'));
  await readLine(db);
  const after = await collectSchemaCatalog(db);
  // Only the known PG18-only NOT NULL objects are excluded from the PG17 proof.
  after.catalog.constraints = after.catalog.constraints.filter(
    (r) =>
      !(
        r.schema_name === 'safebus_private' &&
        r.relname === 'live_bus_progress_cache' &&
        r.definition.startsWith('NOT NULL ')
      ),
  );
  assert.deepEqual(trackingCatalogDelta(catalog, after), proof.cleanup);
  assert.deepEqual(precedingTrackingCatalog(after, proof.cleanup), catalog);
  for (const name of [
    'invalidate_live_bus_progress_trip',
    'invalidate_live_bus_progress_location',
  ]) {
    const drift = structuredClone(after);
    drift.catalog.triggers.find((r) => r.tgname === name).tgenabled = 'D';
    assert.throws(() => precedingTrackingCatalog(drift, proof.cleanup), /LINEAGE_CHANGED_OBJECT/);
  }
  const extra = structuredClone(after);
  extra.catalog.triggers.push({ ...extra.catalog.triggers[0], tgname: 'unreviewed_trigger' });
  assert.notDeepEqual(
    precedingTrackingCatalog(extra, proof.cleanup),
    catalog,
    'unreviewed trigger cannot disappear during lineage reconstruction',
  );
  await db.exec(operationalRestoreSql(before, config));
  verifyOperationalSnapshot(await operationalSnapshot(db, config), config, 'before');
  assert.equal(await calculateSchemaFingerprint(db), fingerprint);
  await equalPrevious(db);
  assert.equal(
    await scalar(db, 'select count(*)::int as value from driver_trip_current_locations'),
    1,
  );
});

test('bounded ETA migration changes only two query boundaries and restores the complete catalog', async (t) => {
  const { collectSchemaCatalog } = await import('../../scripts/lib/schema-fingerprint.mjs');
  const { expectedSharedEtaCatalog, sharedEtaMigration } =
    await import('../../scripts/lib/shared-eta-query.mjs');
  const db = await liveProgressFixture(t);
  await db.exec(sql);
  const before = await collectSchemaCatalog(db);
  const expected = expectedSharedEtaCatalog(before);
  const patch = await fs.readFile(sharedEtaMigration, 'utf8');
  await db.exec('begin');
  await db.exec(patch);
  assert.deepEqual(await collectSchemaCatalog(db), expected);
  await db.exec('rollback');
  assert.deepEqual(await collectSchemaCatalog(db), before);
  await db.exec(patch);
  await assert.rejects(db.exec(patch), /SHARED_ETA_BASELINE_MISMATCH/);
  assert.throws(() => expectedSharedEtaCatalog(expected), /SHARED_ETA_BASELINE_MISMATCH/);
});
