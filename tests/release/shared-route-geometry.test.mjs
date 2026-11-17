import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  geometryFixture,
  readLine,
  migrationPath,
  id,
} from './fixtures/shared-route-geometry-db.mjs';
const sql = await fs.readFile(migrationPath, 'utf8');
const scalar = async (db, q) => (await db.query(q)).rows[0].value;
const cache = (db) =>
  scalar(
    db,
    'select jsonb_agg(to_jsonb(c)) as value from safebus_private.route_stop_geometry_cache c',
  );
async function equalPrevious(db) {
  // Same transaction timestamp gives identical freshness/ETA boundaries.
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
test('real PostGIS: preserve full response across geometry, direction, freshness and trip states', async (t) => {
  const db = await geometryFixture(t);
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
test('shared static results never share parent names, access or live GPS; bounded cache does not rewrite on hits', async (t) => {
  const db = await geometryFixture(t);
  await db.exec(sql);
  await db.exec(`create table cache_writes(n integer); insert into cache_writes values(0);
    create function count_cache_write() returns trigger language plpgsql as $$begin update public.cache_writes set n=n+1; return new; end$$;
    create trigger count_cache_write after insert or update on safebus_private.route_stop_geometry_cache for each row execute function count_cache_write();`);
  for (let n = 0; n < 50; n++) {
    const parent = n % 2;
    await db.query("select set_config('test.uid',$1,false)", [id(parent ? 110 : 100)]);
    const line = (await readLine(db))[0];
    assert.deepEqual(line.stops[0].pickupStudentNames, [
      parent ? 'Parent B child' : 'Parent A child',
    ]);
  }
  assert.equal(await scalar(db, 'select n as value from cache_writes'), 1);
  const before = await cache(db);
  for (const s of before[0].geometry_data)
    assert.deepEqual(Object.keys(s).sort(), [
      'distance_m',
      'id',
      'scheduled_seconds',
      'shape_fraction',
    ]);
  await db.exec('update driver_trip_current_locations set latitude=53.515');
  assert.equal((await readLine(db))[0].latitude, 53.515);
  assert.deepEqual(await cache(db), before, 'GPS does not enter static cache');
  await db.exec(
    "update student_guardians set status='inactive' where guardian_id='" + id(111) + "'",
  );
  assert.deepEqual(await readLine(db), [], 'revoked parent receives no cached response');
  await db.query("select set_config('test.uid',$1,false)", [id(100)]);
  await db.exec(
    "update student_bus_assignments set status='inactive' where student_id='" + id(102) + "'",
  );
  assert.deepEqual(await readLine(db), [], 'assignment removal takes effect immediately');
  assert.deepEqual(await cache(db), before);
});
test('static input changes invalidate immediately, one row per pattern, no cached authorization', async (t) => {
  const db = await geometryFixture(t);
  await db.exec(sql);
  await readLine(db);
  let digest = (await cache(db))[0].input_digest;
  for (const change of [
    'update route_stops set latitude=latitude+0.0001',
    'update route_stops set stop_order=4-stop_order',
    "update route_trip_patterns set direction='reverse'",
    "update route_trip_stop_schedules set planned_arrival_time=planned_arrival_time+interval '1 minute'",
    "update route_shapes set path=extensions.st_geomfromtext('LINESTRING(-113.50 53.50,-113.49 53.51,-113.50 53.52)',4326)",
    'update driver_trips set route_shape_id=null',
    "update route_stops set status='inactive' where id='" + id(20) + "'",
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
  ]) {
    await db.exec('begin');
    await db.query('select set_config($1,$2,true)', [setting, value]);
    await assert.rejects(readLine(db), (e) => e.code === '42501');
    await db.exec('rollback');
  }
  await db.query("select set_config('test.tenant',$1,false)", [id(999)]);
  await assert.rejects(readLine(db), (e) => e.code === '42501');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec('begin; set local role ' + role);
    await assert.rejects(
      db.query('select * from safebus_private.route_stop_geometry_cache'),
      (e) => e.code === '42501',
    );
    await db.exec('rollback; begin; set local role ' + role);
    await assert.rejects(
      db.query("select safebus_private.shared_route_stop_geometry(null,null,null,'[]',null)"),
      (e) => e.code === '42501',
    );
    await db.exec('rollback');
  }
  await db.exec("delete from route_trip_patterns where id='" + id(5) + "'");
  assert.equal(await cache(db), null, 'deleting pattern disposes its derived cache');
});
test('read-only cold reads compute exact results without cache writes', async (t) => {
  const db = await geometryFixture(t);
  await db.exec(sql);
  await db.exec('begin transaction read only');
  const expected = (
    await db.query("select public.previous_guardian_service_lines('TEST-1') as value")
  ).rows[0].value;
  assert.deepEqual(await readLine(db), expected);
  assert.equal(await cache(db), null);
  await db.exec('rollback');
});

test('protected release verifies exact catalog delta and restores the previous RPC without losing source data', async (t) => {
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
  const config = JSON.parse(await fs.readFile('config/pending/shared-route-geometry.json', 'utf8'));
  const proof = JSON.parse(
    await fs.readFile('config/observed/shared-route-geometry-lineage-20261117.json', 'utf8'),
  );
  const db = await geometryFixture(t);
  const before = await operationalSnapshot(db, config);
  verifyOperationalSnapshot(before, config, 'before');
  const catalog = await collectSchemaCatalog(db);
  const fingerprint = await calculateSchemaFingerprint(db);
  await db.exec(sql);
  assert.equal(operationalDigest(sql), config.migrationSha256);
  verifyOperationalSnapshot(await operationalSnapshot(db, config), config, 'after');
  await db.exec(await fs.readFile('tests/rls/shared-route-geometry-readonly.sql', 'utf8'));
  await readLine(db);
  const after = await collectSchemaCatalog(db);
  // PostgreSQL 18 adds NOT NULL constraint objects; production 17 uses attnotnull.
  after.catalog.constraints = after.catalog.constraints.filter(
    (r) =>
      !(
        r.schema_name === 'safebus_private' &&
        r.relname === 'route_stop_geometry_cache' &&
        r.definition.startsWith('NOT NULL ')
      ),
  );
  assert.deepEqual(trackingCatalogDelta(catalog, after), proof.cleanup);
  assert.deepEqual(precedingTrackingCatalog(after, proof.cleanup), catalog);
  const drift = structuredClone(after);
  drift.catalog.columns.find(
    (r) =>
      r.schema_name === 'safebus_private' &&
      r.relation_name === 'route_stop_geometry_cache' &&
      r.column_name === 'input_digest',
  ).attnotnull = false;
  assert.throws(() => precedingTrackingCatalog(drift, proof.cleanup), /LINEAGE_CHANGED_OBJECT/);
  await db.exec(operationalRestoreSql(before, config));
  verifyOperationalSnapshot(await operationalSnapshot(db, config), config, 'before');
  assert.equal(await calculateSchemaFingerprint(db), fingerprint);
  await equalPrevious(db);
  assert.equal(await scalar(db, 'select count(*)::int as value from route_stops'), 3);
});
