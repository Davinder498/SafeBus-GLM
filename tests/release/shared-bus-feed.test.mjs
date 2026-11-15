import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { sharedFeedFixture, sharedMigration } from './fixtures/shared-bus-feed-db.mjs';
import {
  operationalSnapshot,
  operationalRestoreSql,
  operationalDigest,
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

const sql = await fs.readFile(sharedMigration, 'utf8');
const config = JSON.parse(await fs.readFile('config/pending/shared-bus-feed.json', 'utf8'));
const proof = JSON.parse(
  await fs.readFile('config/observed/shared-bus-feed-lineage-20261115.json', 'utf8'),
);
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const topic =
  'safebus:bus:' +
  createHash('sha256')
    .update(id(6) + ':safebus:bus:v1')
    .digest('hex');
async function seed(db, count = 1) {
  await db.exec(`insert into tenants(id) values('${id(1)}');
    insert into drivers(id,tenant_id) values('${id(2)}','${id(1)}');
    insert into buses(id,tenant_id) values('${id(3)}','${id(1)}');
    insert into routes(id,tenant_id) values('${id(4)}','${id(1)}');
    insert into route_trip_patterns(id,tenant_id,route_id) values('${id(5)}','${id(1)}','${id(4)}');
    insert into driver_trips(id,tenant_id,driver_id,bus_id,route_id,route_trip_pattern_id)
      values('${id(6)}','${id(1)}','${id(2)}','${id(3)}','${id(4)}','${id(5)}');
    insert into bus_route_assignments(id,tenant_id,bus_id,route_id,route_trip_pattern_id)
      values('${id(7)}','${id(1)}','${id(3)}','${id(4)}','${id(5)}');`);
  for (let n = 0; n < count; n++) {
    const a = 100 + n * 10;
    await db.exec(`insert into profiles(id,tenant_id) values('${id(a)}','${id(1)}');
      insert into guardians(id,tenant_id,profile_id) values('${id(a + 1)}','${id(1)}','${id(a)}');
      insert into students(id,tenant_id) values('${id(a + 2)}','${id(1)}');
      insert into student_guardians(id,tenant_id,student_id,guardian_id) values('${id(a + 3)}','${id(1)}','${id(a + 2)}','${id(a + 1)}');
      insert into student_bus_assignments(id,tenant_id,student_id,bus_route_assignment_id,route_trip_pattern_id,effective_from)
        values('${id(a + 4)}','${id(1)}','${id(a + 2)}','${id(7)}','${id(5)}',(now() at time zone 'America/Edmonton')::date);`);
  }
  await db.query(
    "select set_config('test.uid',$1,false),set_config('test.tenant',$2,false),set_config('test.session','active',false),set_config('test.mfa','complete',false),set_config('realtime.topic',$3,false)",
    [id(100), id(1), topic],
  );
}
const allowed = async (db) =>
  (await db.query('select safebus_private.can_receive_bus_tracking($1) allowed', [topic])).rows[0]
    .allowed;

test('shared feed has exact reviewed catalog, ACLs and rollback including policy dependency', async (t) => {
  const db = await sharedFeedFixture(t);
  const before = await operationalSnapshot(db, config);
  verifyOperationalSnapshot(before, config, 'before');
  const catalog = await collectSchemaCatalog(db);
  const fingerprint = await calculateSchemaFingerprint(db);
  assert.equal(operationalDigest(sql), config.migrationSha256);
  await db.exec(sql);
  verifyOperationalSnapshot(await operationalSnapshot(db, config), config, 'after');
  const after = await collectSchemaCatalog(db);
  assert.deepEqual(trackingCatalogDelta(catalog, after), proof.cleanup);
  assert.deepEqual(precedingTrackingCatalog(after, proof.cleanup), catalog);
  await db.exec(operationalRestoreSql(before, config));
  assert.equal(await calculateSchemaFingerprint(db), fingerprint);
});

test('only current assigned guardians may receive; every account, service, session and MFA boundary fails closed', async (t) => {
  const db = await sharedFeedFixture(t);
  await db.exec(sql);
  await seed(db);
  assert.equal(await allowed(db), true);
  const denials = [
    "select set_config('test.uid','',true)",
    `select set_config('test.uid','${id(999)}',true)`,
    `select set_config('test.tenant','${id(999)}',true)`,
    ...['driver', 'tenant_admin', 'school_admin', 'transportation_admin', 'platform_admin'].map(
      (role) => `select set_config('test.role','${role}',true)`,
    ),
    "select set_config('test.session','revoked',true)",
    "select set_config('test.mfa','required',true)",
    ...[
      'tenants',
      'profiles',
      'guardians',
      'students',
      'student_guardians',
      'student_bus_assignments',
      'bus_route_assignments',
      'buses',
      'routes',
      'route_trip_patterns',
      'drivers',
    ].map((table) => `update ${table} set status='inactive'`),
    "update student_guardians set access_expires_at=now()-interval '1 second'",
    "update student_bus_assignments set effective_from=(now() at time zone 'America/Edmonton')::date+1",
    "update student_bus_assignments set effective_to=(now() at time zone 'America/Edmonton')::date-1",
    "update bus_route_assignments set effective_from=(now() at time zone 'America/Edmonton')::date+1",
    "update bus_route_assignments set effective_to=(now() at time zone 'America/Edmonton')::date-1",
    `update student_bus_assignments set route_trip_pattern_id='${id(999)}'`,
    `update student_guardians set tenant_id='${id(999)}'`,
    `update driver_trips set tenant_id='${id(999)}'`,
    "update driver_trips set status='completed'",
  ];
  for (const change of denials) {
    await db.exec('begin');
    await db.exec(change);
    assert.equal(await allowed(db), false, change);
    await db.exec('rollback');
  }
  await db.exec("update driver_trips set status='paused'");
  assert.equal(await allowed(db), true);
  for (const invalid of [
    null,
    'safebus:bus:bad',
    'safebus:tenant:' + id(1),
    'safebus:bus:' + '0'.repeat(64),
  ])
    assert.equal(
      (await db.query('select safebus_private.can_receive_bus_tracking($1) allowed', [invalid]))
        .rows[0].allowed,
      false,
    );
});

test('actual authenticated receive policy allows assigned broadcast and denies publish/presence/other principals', async (t) => {
  const db = await sharedFeedFixture(t);
  await db.exec(sql);
  await seed(db);
  await db.query(
    "insert into realtime.messages(id,extension,topic,private) values(gen_random_uuid(),'broadcast',$1,true),(gen_random_uuid(),'presence',$1,true)",
    [topic],
  );
  await db.exec(
    'drop trigger if exists test_message_insert on realtime.messages; set role authenticated',
  );
  assert.equal((await db.query('select count(*)::int n from realtime.messages')).rows[0].n, 1);
  await assert.rejects(
    db.exec("insert into realtime.messages(id,extension) values(gen_random_uuid(),'broadcast')"),
    /row-level security/,
  );
  await db.exec('reset role');
  await db.query("select set_config('test.uid',$1,false)", [id(999)]);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::int n from realtime.messages')).rows[0].n, 0);
  await db.exec('reset role');
  for (const role of ['anon', 'service_role'])
    assert.equal(
      (
        await db.query(
          "select has_function_privilege($1,'safebus_private.can_receive_bus_tracking(text)','EXECUTE') allowed",
          [role],
        )
      ).rows[0].allowed,
      false,
    );
});

test('one shared hint per pass preserves legacy recipients, bounded paging, latest-generation work and payload privacy', async (t) => {
  const db = await sharedFeedFixture(t);
  await db.exec(sql);
  await seed(db, 30);
  await db.query('insert into driver_trip_current_locations values($1,$2,53,-113)', [id(6), id(1)]);
  const dispatch = async (limit = 250) =>
    (
      await db.query('select safebus_private.dispatch_tracking_invalidations(10,$1) result', [
        limit,
      ])
    ).rows[0].result;
  assert.deepEqual(await dispatch(), { scopes: 1, messages: 27, failed_scopes: 0 });
  assert.deepEqual(await dispatch(), { scopes: 1, messages: 5, failed_scopes: 0 });
  const rows = (await db.query('select * from realtime.captured')).rows;
  assert.equal(rows.filter((r) => r.topic === topic).length, 1);
  assert.equal(rows.filter((r) => r.topic.startsWith('safebus:guardian:')).length, 30);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row.payload).sort(), ['id', 'occurred_at', 'reason']);
    assert.equal(row.payload.reason, 'location');
    assert.equal(row.private, true);
  }
  await db.exec('update driver_trip_current_locations set latitude=54');
  await db.query('update realtime.test_controls set inject_location_for=$1', [id(6)]);
  await dispatch();
  await dispatch();
  assert.equal(
    (await db.query('select count(*)::int n from safebus_private.tracking_invalidation_queue'))
      .rows[0].n,
    1,
  );
  assert.ok((await dispatch()).messages <= 250);
});

test('shared send failure retains work and rolls back preceding admin hint; minimal budgets never overrun', async (t) => {
  const db = await sharedFeedFixture(t);
  await db.exec(sql);
  await seed(db);
  await db.query('insert into driver_trip_current_locations values($1,$2,53,-113)', [id(6), id(1)]);
  await db.query('update realtime.test_controls set fail_topic=$1', [topic]);
  const result = (
    await db.query('select safebus_private.dispatch_tracking_invalidations(10,250) result')
  ).rows[0].result;
  assert.equal(result.failed_scopes, 1);
  assert.equal((await db.query('select count(*)::int n from realtime.captured')).rows[0].n, 0);
  await db.exec(
    "update realtime.test_controls set fail_topic=null; update safebus_private.tracking_invalidation_queue set available_at=now()-interval '1 second'",
  );
  assert.equal(
    (await db.query('select safebus_private.dispatch_tracking_invalidations(10,1) result')).rows[0]
      .result.messages,
    1,
  );
});

test('the additive service response preserves existing ETA/stop logic and rejects invalid sessions before data access', async (t) => {
  const db = await sharedFeedFixture(t);
  const before = (
    await db.query(
      "select pg_get_functiondef('public.get_guardian_bus_service_lines(text)'::regprocedure) body",
    )
  ).rows[0].body;
  await db.exec(sql);
  const after = (
    await db.query(
      "select pg_get_functiondef('public.get_guardian_bus_service_lines(text)'::regprocedure) body",
    )
  ).rows[0].body;
  const withoutAddition = after
    .replace(
      /\n    or public\.is_current_user_session_active\(\) is not true\n    or safebus_private\.has_completed_optional_mfa\(\) is not true/,
      '',
    )
    .replace(/\n      'trackingTopic',[\s\S]*?else null end,/, '');
  assert.equal(withoutAddition, before);
  await seed(db);
  for (const flag of ['test.session', 'test.mfa']) {
    await db.exec('begin');
    await db.query("select set_config($1,'invalid',true)", [flag]);
    await assert.rejects(
      db.query("select public.get_guardian_bus_service_lines('42')"),
      /active guardian login/,
    );
    await db.exec('rollback');
  }
});
