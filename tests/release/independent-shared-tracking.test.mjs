import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  independentTrackingFixture,
  seedSharedTrip,
  migrationPath,
  id,
} from './fixtures/independent-tracking-db.mjs';
import {
  operationalSnapshot,
  operationalDigest,
  operationalRestoreSql,
  verifyOperationalSnapshot,
} from '../../scripts/lib/operational-rollout.mjs';
import {
  collectSchemaCatalog,
  calculateSchemaFingerprint,
} from '../../scripts/lib/schema-fingerprint.mjs';
import {
  trackingCatalogDelta,
  precedingTrackingCatalog,
} from '../../scripts/lib/tracking-release-lineage.mjs';
const sql = await fs.readFile(migrationPath, 'utf8');
const config = JSON.parse(
  await fs.readFile('config/pending/independent-shared-tracking.json', 'utf8'),
);
const proof = JSON.parse(
  await fs.readFile('config/observed/independent-shared-tracking-lineage-20261116.json', 'utf8'),
);
const value = async (db, query, params = []) => (await db.query(query, params)).rows[0].value;
const dispatch = (db, shard = 0, limit = 256) =>
  value(db, 'select safebus_private.dispatch_shared_tracking($1,$2) as value', [shard, limit]);
const gps = async (db) =>
  db.exec(`insert into driver_trip_current_locations values('${id(6)}','${id(1)}',1,1)
 on conflict(driver_trip_id) do update set latitude=driver_trip_current_locations.latitude+0.001;`);
const count = (db, table) => value(db, `select count(*)::int as value from ${table}`);

// The only application changes are private DB workers. All client protocol and
// notification source/push/email functions must remain outside this catalog delta.
test('exact manifest, bounded jobs, private ACLs, catalog lineage and recoverable queued work', async (t) => {
  const db = await independentTrackingFixture(t);
  await seedSharedTrip(db, 50);
  await gps(db);
  const before = await operationalSnapshot(db, config);
  verifyOperationalSnapshot(before, config, 'before');
  const catalog = await collectSchemaCatalog(db);
  const fingerprint = await calculateSchemaFingerprint(db);
  await db.exec(sql);
  assert.equal(operationalDigest(sql), config.migrationSha256);
  verifyOperationalSnapshot(await operationalSnapshot(db, config), config, 'after');
  await db.exec(await fs.readFile('tests/rls/independent-shared-tracking-readonly.sql', 'utf8'));
  const after = await collectSchemaCatalog(db);
  // Hosted PostgreSQL 17 records NOT NULL in pg_attribute.attnotnull only.
  // PGlite's PostgreSQL 18 also creates pg_constraint rows. Keep the production
  // proof exact; account for this known engine difference only in this test.
  const notNullRows = after.catalog.constraints.filter(
    (row) =>
      row.schema_name === 'safebus_private' &&
      row.relname === 'shared_tracking_queue' &&
      row.definition.startsWith('NOT NULL '),
  );
  assert.deepEqual(notNullRows.map((row) => row.definition).sort(), [
    'NOT NULL available_at',
    'NOT NULL driver_trip_id',
    'NOT NULL failures',
    'NOT NULL first_pending_at',
    'NOT NULL generation',
    'NOT NULL latest_at',
    'NOT NULL tenant_id',
  ]);
  const localProof = structuredClone(proof.cleanup);
  localProof.constraints.added.push(...notNullRows);
  localProof.constraints.added.sort((a, b) => a.conname.localeCompare(b.conname));
  assert.deepEqual(trackingCatalogDelta(catalog, after), localProof);
  assert.deepEqual(precedingTrackingCatalog(after, localProof), catalog);
  const hostedShape = structuredClone(after);
  hostedShape.catalog.constraints = hostedShape.catalog.constraints.filter(
    (row) =>
      !notNullRows.some(
        (local) =>
          local.conname === row.conname &&
          local.schema_name === row.schema_name &&
          local.relname === row.relname,
      ),
  );
  assert.deepEqual(trackingCatalogDelta(catalog, hostedShape), proof.cleanup);
  assert.deepEqual(precedingTrackingCatalog(hostedShape, proof.cleanup), catalog);
  const nullableDrift = structuredClone(hostedShape);
  nullableDrift.catalog.columns.find(
    (row) =>
      row.schema_name === 'safebus_private' &&
      row.relation_name === 'shared_tracking_queue' &&
      row.column_name === 'generation',
  ).attnotnull = false;
  assert.throws(
    () => precedingTrackingCatalog(nullableDrift, proof.cleanup),
    /LINEAGE_CHANGED_OBJECT/,
  );
  assert.equal(
    await count(db, 'safebus_private.shared_tracking_queue'),
    1,
    'prime existing dirty scope',
  );
  for (const role of ['anon', 'authenticated', 'service_role']) {
    assert.equal(
      await value(
        db,
        "select has_table_privilege($1,'safebus_private.shared_tracking_queue','SELECT,INSERT,UPDATE,DELETE') as value",
        [role],
      ),
      false,
    );
    for (const signature of [
      'safebus_private.dispatch_shared_tracking(integer,integer)',
      'safebus_private.shared_tracking_queue_health()',
    ])
      assert.equal(
        await value(db, "select has_function_privilege($1,$2,'EXECUTE') as value", [
          role,
          signature,
        ]),
        false,
      );
  }
  // Shared-only pending work must return to the old queue even if legacy caught up.
  await db.exec('delete from safebus_private.tracking_invalidation_queue');
  await db.exec('begin');
  await db.exec(operationalRestoreSql(before, config));
  await db.exec('commit');
  assert.equal(await calculateSchemaFingerprint(db), fingerprint);
  verifyOperationalSnapshot(await operationalSnapshot(db, config), config, 'before');
  assert.equal(await count(db, 'safebus_private.tracking_invalidation_queue'), 1);
  const old = await value(
    db,
    'select safebus_private.dispatch_tracking_invalidations(10,250) as value',
  );
  assert.equal(old.messages, 27, 'legacy rollback restores admin,shared and parents');
  assert.equal(await count(db, "cron.job where jobname like 'safebus-shared-tracking-%'"), 0);
});

test('shared progress is independent of fifty parent pages, repeated GPS and legacy failure', async (t) => {
  const db = await independentTrackingFixture(t);
  await db.exec(sql);
  await seedSharedTrip(db, 50);
  await gps(db);
  await gps(db);
  assert.equal(await count(db, 'safebus_private.shared_tracking_queue'), 1);
  assert.equal((await dispatch(db)).messages, 2);
  assert.equal(await count(db, 'safebus_private.shared_tracking_queue'), 0);
  assert.equal(await count(db, 'safebus_private.tracking_invalidation_queue'), 1);
  const legacy = await value(
    db,
    'select safebus_private.dispatch_tracking_invalidations(10,250) as value',
  );
  assert.equal(legacy.messages, 25, 'legacy lane emits only parent hints');
  await db.exec(`update realtime.test_controls set fail_topic='safebus:guardian:${id(350)}'`);
  assert.equal(
    (await value(db, 'select safebus_private.dispatch_tracking_invalidations(10,250) as value'))
      .failed_scopes,
    1,
  );
  await gps(db);
  assert.equal((await dispatch(db)).messages, 2, 'fresh shared pass survives legacy retry');
  assert.equal(
    await value(
      db,
      "select count(*)::int as value from realtime.messages where topic like 'safebus:bus:%'",
    ),
    2,
  );
});

test('zero map viewers or guardians still produce shared hints; payloads contain no location or student data', async (t) => {
  const db = await independentTrackingFixture(t);
  await db.exec(sql);
  await seedSharedTrip(db, 0);
  await gps(db);
  assert.equal((await dispatch(db)).messages, 2);
  for (const row of (await db.query('select * from realtime.messages')).rows) {
    assert.equal(row.private, true);
    assert.equal(row.extension, 'broadcast');
    assert.equal(row.event, 'tracking_changed');
    assert.deepEqual(Object.keys(row.payload).sort(), ['id', 'occurred_at', 'reason']);
    assert.equal(row.payload.id, row.id);
  }
});

test('shared send failure rolls back messages, keeps work and retries; newer generation survives ACK', async (t) => {
  const db = await independentTrackingFixture(t);
  await db.exec(sql);
  await seedSharedTrip(db, 1);
  await gps(db);
  await db.exec(`update realtime.test_controls set fail_topic='safebus:tenant:${id(1)}'`);
  assert.equal((await dispatch(db)).failed_scopes, 1);
  assert.equal(await count(db, 'realtime.messages'), 0);
  const health = await value(db, 'select safebus_private.shared_tracking_queue_health() as value');
  assert.equal(health.pending, 1);
  assert.equal(health.retrying, 1);
  assert.ok(health.oldest_pending_seconds >= 0);
  assert.equal((await dispatch(db)).scopes, 0, 'backoff prevents spinning');
  await db.exec(`update realtime.test_controls set fail_topic=null,inject_location_for='${id(6)}';
 update safebus_private.shared_tracking_queue set available_at=now()-interval '1 second'`);
  assert.equal((await dispatch(db)).messages, 2);
  assert.equal(
    await count(db, 'safebus_private.shared_tracking_queue'),
    1,
    'new enqueue not acknowledged by old generation',
  );
  assert.equal((await dispatch(db)).messages, 2);
  assert.equal(await count(db, 'safebus_private.shared_tracking_queue'), 0);
});

test('inactive scopes are discarded and every account/service status blocks shared publication', async (t) => {
  const db = await independentTrackingFixture(t);
  await db.exec(sql);
  await seedSharedTrip(db, 1);
  for (const table of [
    'tenants',
    'drivers',
    'buses',
    'routes',
    'route_trip_patterns',
    'driver_trips',
  ]) {
    await db.exec('begin');
    await gps(db);
    await db.exec(`update ${table} set status='inactive'`);
    assert.equal((await dispatch(db)).messages, 0, table);
    assert.equal(await count(db, 'safebus_private.shared_tracking_queue'), 0);
    await db.exec('rollback');
  }
  for (const role of [
    'driver',
    'tenant_admin',
    'school_admin',
    'transportation_admin',
    'platform_admin',
  ]) {
    await db.query("select set_config('test.role',$1,false)", [role]);
    assert.equal(
      await value(
        db,
        "select safebus_private.can_receive_bus_tracking('safebus:bus:'||encode(sha256(convert_to($1||':safebus:bus:v1','UTF8')),'hex')) as value",
        [id(6)],
      ),
      false,
    );
  }
});

test('10,000 synthetic dirty scopes drain by shard in bounded batches with tenant deduplication', async (t) => {
  const db = await independentTrackingFixture(t);
  await db.exec(sql);
  await seedSharedTrip(db, 0);
  // Queue correctness fixture, not a realistic fleet/database load benchmark.
  await db.exec(`insert into driver_trips(id,tenant_id,driver_id,bus_id,route_id,route_trip_pattern_id)
 select (to_hex(n%16)||substr(md5(n::text),2))::uuid,'${id(1)}','${id(2)}','${id(3)}','${id(4)}','${id(5)}' from generate_series(1,10000) n;
 insert into safebus_private.shared_tracking_queue(driver_trip_id,tenant_id)
 select id,tenant_id from driver_trips where id<>'${id(6)}';`);
  let scopes = 0,
    messages = 0;
  for (let round = 0; round < 3; round++)
    for (let shard = 0; shard < 16; shard++) {
      const result = await dispatch(db, shard);
      assert.ok(result.scopes <= 256);
      assert.equal(result.failed_scopes, 0);
      assert.equal(result.messages, result.scopes + 1);
      scopes += result.scopes;
      messages += result.messages;
    }
  assert.equal(scopes, 10000);
  assert.equal(messages, 10048);
  assert.equal(await count(db, 'safebus_private.shared_tracking_queue'), 0);
  for (const args of [
    [-1, 1],
    [16, 1],
    [null, 1],
    [0, 0],
    [0, 257],
    [0, null],
  ])
    await assert.rejects(dispatch(db, ...args), /Invalid shared/);
});

test('history pruning includes new jobs but preserves other jobs and unfinished/recent runs', async (t) => {
  const db = await independentTrackingFixture(t);
  await db.exec(sql);
  await db.exec(`select cron.schedule('unrelated','1 second','select 1');
 insert into cron.job_run_details select jobid,jobid,now()-interval '49 hours' from cron.job;
 insert into cron.job_run_details select 10000+jobid,jobid,null from cron.job;
 insert into cron.job_run_details select 20000+jobid,jobid,now() from cron.job;`);
  const expected = await count(db, "cron.job where jobname<>'unrelated'");
  assert.equal(
    await value(db, 'select safebus_private.prune_tracking_worker_history() as value'),
    expected,
  );
  assert.equal(await count(db, "cron.job_run_details where end_time<now()-interval '48 hours'"), 1);
  assert.equal(await count(db, 'cron.job_run_details where end_time is null'), expected + 1);
});
