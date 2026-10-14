import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { buildMigrationManifest, readCommittedManifest } from '../../scripts/lib/migrations.mjs';
import { readInstallInputs } from '../../scripts/lib/existing-security-install.mjs';

const migrationFile = 'supabase/migrations/pending/0125_async_tracking_invalidations.sql';
const uuid = (n) => {
  const h = n.toString(16).padStart(32, '0');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const tenant = uuid(1),
  otherTenant = uuid(2),
  trip = uuid(31),
  otherBusTrip = uuid(32);
const profile = (i) => uuid(1000 + i);

async function fixture(t, count = 3) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile('tests/release/fixtures/tracking-worker-baseline.sql', 'utf8'));
  // Execute the real predecessor helpers/trigger, then preserve their OIDs as
  // reconciliation does. Realtime message insertion and cron use local fixtures.
  const oldSql = await fs.readFile(
    'supabase/migrations/0030_secure_trip_tracking_realtime.sql',
    'utf8',
  );
  for (const name of [
    'send_tracking_invalidation',
    'send_guardian_tracking_invalidation',
    'broadcast_route_tracking_invalidation',
    'notify_tracking_location_change',
    'notify_tracking_trip_change',
  ]) {
    const definition = oldSql.match(
      new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`),
    )?.[0];
    assert.ok(definition, name);
    await db.exec(
      definition
        .replaceAll(
          'public.send_tracking_invalidation(',
          'safebus_private.send_tracking_invalidation(',
        )
        .replaceAll(
          'public.send_guardian_tracking_invalidation(',
          'safebus_private.send_guardian_tracking_invalidation(',
        )
        .replaceAll(
          'public.broadcast_route_tracking_invalidation(',
          'safebus_private.broadcast_route_tracking_invalidation(',
        )
        .replaceAll(`function public.${name}(`, `function safebus_private.${name}(`),
    );
  }
  await db.exec(`create trigger notify_tracking_location_change after insert or update
    on public.driver_trip_current_locations for each row execute function safebus_private.notify_tracking_location_change();
    create trigger notify_tracking_trip_change after insert or update or delete on public.driver_trips
    for each row execute function safebus_private.notify_tracking_trip_change();`);
  const oldFunction = (
    await db.query(
      "select 'safebus_private.notify_tracking_location_change()'::regprocedure::oid as oid",
    )
  ).rows[0].oid;
  const tripFunction = (
    await db.query(
      "select pg_get_functiondef('safebus_private.notify_tracking_trip_change()'::regprocedure) as sql",
    )
  ).rows[0].sql;
  await db.exec('begin');
  await db.exec(await fs.readFile(migrationFile, 'utf8'));
  await db.exec('commit');
  assert.equal(
    (
      await db.query(
        "select 'safebus_private.notify_tracking_location_change()'::regprocedure::oid as oid",
      )
    ).rows[0].oid,
    oldFunction,
  );
  assert.equal(
    (
      await db.query(
        "select pg_get_functiondef('safebus_private.notify_tracking_trip_change()'::regprocedure) as sql",
      )
    ).rows[0].sql,
    tripFunction,
  );
  await db.query(`insert into tenants values($1,'active'),($2,'active')`, [tenant, otherTenant]);
  for (let i = 1; i <= 2; i++) {
    await db.query(`insert into drivers(id,tenant_id) values($1,$2);`, [uuid(10 + i), tenant]);
    await db.query(`insert into buses(id,tenant_id) values($1,$2)`, [uuid(20 + i), tenant]);
  }
  await db.query(`insert into routes(id,tenant_id) values($1,$2)`, [uuid(40), tenant]);
  await db.query(
    `insert into route_trip_patterns(id,tenant_id,route_id) values($1,$2,$3),($4,$2,$3)`,
    [uuid(50), tenant, uuid(40), uuid(51)],
  );
  for (let i = 1; i <= 2; i++) {
    await db.query(
      `insert into driver_trips(id,tenant_id,driver_id,bus_id,route_id,route_trip_pattern_id)
      values($1,$2,$3,$4,$5,$6)`,
      [uuid(30 + i), tenant, uuid(10 + i), uuid(20 + i), uuid(40), uuid(50)],
    );
    await db.query(
      `insert into bus_route_assignments(id,tenant_id,bus_id,route_id,route_trip_pattern_id)
      values($1,$2,$3,$4,$5)`,
      [uuid(60 + i), tenant, uuid(20 + i), uuid(40), uuid(50)],
    );
  }
  for (let i = 1; i <= count; i++) await addGuardian(db, i);
  await db.exec('truncate realtime.captured');
  return db;
}

async function addGuardian(db, i, service = uuid(61)) {
  await db.query('insert into profiles(id,tenant_id) values($1,$2)', [profile(i), tenant]);
  await db.query('insert into guardians(id,tenant_id,profile_id) values($1,$2,$3)', [
    uuid(2000 + i),
    tenant,
    profile(i),
  ]);
  await db.query('insert into students(id,tenant_id) values($1,$2)', [uuid(3000 + i), tenant]);
  await db.query(
    'insert into student_guardians(id,tenant_id,student_id,guardian_id) values($1,$2,$3,$4)',
    [uuid(4000 + i), tenant, uuid(3000 + i), uuid(2000 + i)],
  );
  await db.query(
    `insert into student_bus_assignments(id,tenant_id,student_id,bus_route_assignment_id,route_trip_pattern_id)
    values($1,$2,$3,$4,$5)`,
    [uuid(5000 + i), tenant, uuid(3000 + i), service, uuid(50)],
  );
}
async function enqueue(db, id = trip) {
  await db.query(
    `insert into driver_trip_current_locations values($1,$2,53,-113)
    on conflict(driver_trip_id) do update set latitude = driver_trip_current_locations.latitude + 0.001`,
    [id, tenant],
  );
}
async function dispatch(db, scopes = 10, messages = 250) {
  return (
    await db.query('select safebus_private.dispatch_tracking_invalidations($1,$2) as result', [
      scopes,
      messages,
    ])
  ).rows[0].result;
}
const queue = async (db) =>
  (
    await db.query(
      'select * from safebus_private.tracking_invalidation_queue order by driver_trip_id',
    )
  ).rows;
const capture = async (db) => (await db.query('select * from realtime.captured')).rows;
const guardianTopics = async (db) =>
  (await capture(db)).filter((r) => r.topic.startsWith('safebus:guardian:')).map((r) => r.topic);

test('GPS commits without broadcasts; repeated updates coalesce and worker payload stays coordinate-free', async (t) => {
  const db = await fixture(t);
  for (let i = 0; i < 30; i++) await enqueue(db);
  assert.equal((await capture(db)).length, 0);
  assert.equal((await queue(db)).length, 1);
  assert.equal((await queue(db))[0].generation, 30);
  assert.deepEqual(await dispatch(db), { scopes: 1, messages: 4, failed_scopes: 0 });
  assert.equal((await queue(db)).length, 0);
  for (const message of await capture(db)) {
    assert.equal(message.private, true);
    assert.equal(message.event, 'tracking_changed');
    assert.deepEqual(Object.keys(message.payload).sort(), ['id', 'occurred_at', 'reason']);
    assert.equal(message.payload.reason, 'location');
    assert.match(message.payload.id, /^[0-9a-f-]{36}$/);
  }
});

test('global message cap, admin-only budget, cursor pagination and sibling deduplication', async (t) => {
  const db = await fixture(t, 32);
  await db.query(
    `insert into student_guardians(id,tenant_id,student_id,guardian_id) values($1,$2,$3,$4)`,
    [uuid(6000), tenant, uuid(3002), uuid(2001)],
  );
  await enqueue(db);
  assert.equal((await dispatch(db, 1, 1)).messages, 1);
  assert.equal((await queue(db)).length, 1); // no page was allowed; do not delete
  assert.equal((await dispatch(db, 1, 10)).messages, 10);
  assert.equal((await queue(db))[0].guardian_cursor, profile(10));
  assert.equal((await dispatch(db, 1, 1000)).messages, 22);
  assert.equal((await queue(db)).length, 0);
  assert.equal((await capture(db)).filter((r) => r.topic.startsWith('safebus:tenant:')).length, 1);
  assert.equal(new Set(await guardianTopics(db)).size, 32);
});

test('exact-full page uses a bounded completion pass, with no duplicate delivery', async (t) => {
  const db = await fixture(t, 25);
  await enqueue(db);
  assert.equal((await dispatch(db)).messages, 26);
  assert.equal((await queue(db)).length, 1);
  assert.equal((await dispatch(db)).messages, 0);
  assert.equal((await queue(db)).length, 0);
  assert.equal(new Set(await guardianTopics(db)).size, 25);
});

test('a GPS update during dispatch cannot be erased by completing the older generation', async (t) => {
  const db = await fixture(t);
  await enqueue(db);
  await db.query('update realtime.test_controls set inject_location_for = $1', [trip]);
  await dispatch(db);
  assert.equal((await queue(db))[0].generation, 2);
  assert.equal((await queue(db))[0].guardian_cursor, null);
  await dispatch(db);
  assert.equal((await queue(db)).length, 0);
  assert.equal((await guardianTopics(db)).length, 6);
});

test('continuous ingress preserves cursor progress and schedules another complete pass', async (t) => {
  const db = await fixture(t, 32);
  await enqueue(db);
  await dispatch(db, 1, 8);
  for (let i = 0; i < 10; i++) await enqueue(db);
  assert.equal((await queue(db))[0].guardian_cursor, profile(7));
  await dispatch(db);
  assert.equal(new Set(await guardianTopics(db)).size, 32);
  await dispatch(db); // short zero-message tail completes first generation
  assert.equal((await queue(db))[0].guardian_cursor, null);
  await dispatch(db);
  await dispatch(db);
  assert.equal((await queue(db)).length, 0);
});

test('pages resolve current eligible bus-service audience, not all guardians on a route', async (t) => {
  const db = await fixture(t, 3);
  await addGuardian(db, 4, uuid(62)); // same route, another bus
  await enqueue(db);
  await dispatch(db, 1, 2); // admin + guardian 1
  await db.query(
    "update student_guardians set access_expires_at = now() - interval '1 second' where guardian_id = $1",
    [uuid(2002)],
  );
  await db.query("update guardians set status = 'inactive' where id = $1", [uuid(2003)]);
  await dispatch(db);
  assert.deepEqual(await guardianTopics(db), ['safebus:guardian:' + profile(1)]);
});

test('negative audience checks cover inactive, cross-tenant, expired, future and mismatched services', async (t) => {
  const changes = [
    ['inactive profile', "update profiles set status = 'suspended'"],
    ['wrong role', "update profiles set role = 'driver'"],
    ['profile other tenant', `update profiles set tenant_id = '${otherTenant}'`],
    ['guardian other tenant', `update guardians set tenant_id = '${otherTenant}'`],
    ['inactive student', "update students set status = 'inactive'"],
    ['inactive guardian link', "update student_guardians set status = 'inactive'"],
    [
      'expired link',
      "update student_guardians set access_expires_at = now() - interval '1 second'",
    ],
    ['inactive assignment', "update student_bus_assignments set status = 'inactive'"],
    ['future assignment', 'update student_bus_assignments set effective_from = current_date + 1'],
    ['past assignment', 'update student_bus_assignments set effective_to = current_date - 1'],
    ['inactive service', "update bus_route_assignments set status = 'inactive'"],
    ['future service', 'update bus_route_assignments set effective_from = current_date + 1'],
    ['past service', 'update bus_route_assignments set effective_to = current_date - 1'],
    [
      'other service pattern',
      `update student_bus_assignments set route_trip_pattern_id = '${uuid(51)}'`,
    ],
    ['cross-tenant student', `update students set tenant_id = '${otherTenant}'`],
    ['cross-tenant service', `update bus_route_assignments set tenant_id = '${otherTenant}'`],
  ];
  const db = await fixture(t, 1);
  for (const [name, sql] of changes)
    await t.test(name, async () => {
      await db.exec('begin');
      try {
        await enqueue(db);
        await db.exec(sql);
        await dispatch(db);
        assert.deepEqual(await guardianTopics(db), []);
      } finally {
        await db.exec('rollback');
      }
    });
});

test('ended trips and disabled entities are discarded without a location signal', async (t) => {
  const db = await fixture(t);
  for (const sql of [
    "update driver_trips set status = 'completed'",
    "update tenants set status = 'disabled'",
    "update drivers set status = 'inactive'",
    "update buses set status = 'inactive'",
    "update routes set status = 'inactive'",
    "update route_trip_patterns set status = 'inactive'",
  ])
    await t.test(sql, async () => {
      await db.exec('begin');
      try {
        await enqueue(db);
        await db.exec(sql); // trip trigger may emit its separate immediate hint
        await db.exec('truncate realtime.captured');
        assert.equal((await dispatch(db)).messages, 0);
        assert.equal((await capture(db)).length, 0);
        assert.equal((await queue(db)).length, 0);
      } finally {
        await db.exec('rollback');
      }
    });
});

test('a failed scope rolls back partial broadcasts and retries without blocking another bus', async (t) => {
  const db = await fixture(t);
  await addGuardian(db, 4, uuid(62));
  await enqueue(db);
  await enqueue(db, otherBusTrip);
  await db.query('update realtime.test_controls set fail_topic = $1', [
    'safebus:guardian:' + profile(2),
  ]);
  // The reviewed provider swallows insertion errors: an old helper returns
  // successfully although no message was queued. The strict worker must retry.
  await db.query("select safebus_private.send_guardian_tracking_invalidation($1,'location')", [
    profile(2),
  ]);
  assert.equal((await capture(db)).length, 0);
  assert.deepEqual(await dispatch(db), { scopes: 2, messages: 2, failed_scopes: 1 });
  assert.deepEqual(await guardianTopics(db), ['safebus:guardian:' + profile(4)]);
  const [pending] = await queue(db);
  assert.equal(pending.failures, 1);
  assert.equal(pending.last_error_code, 'P0001');
  assert.equal(pending.admin_sent, false);
  assert.equal((await dispatch(db)).scopes, 0);
  await db.exec(
    'update realtime.test_controls set fail_topic = null; update safebus_private.tracking_invalidation_queue set available_at = now()',
  );
  await dispatch(db);
  assert.equal((await queue(db)).length, 0);
  assert.equal((await guardianTopics(db)).length, 4);
});

test('round-robin scope progress and hard call bounds', async (t) => {
  const db = await fixture(t, 32);
  await addGuardian(db, 33, uuid(62));
  await enqueue(db);
  await enqueue(db, otherBusTrip);
  await dispatch(db, 1, 5);
  await dispatch(db, 1, 5);
  assert.ok((await guardianTopics(db)).includes('safebus:guardian:' + profile(33)));
  for (const [scopes, messages] of [
    [0, 10],
    [51, 10],
    [null, 10],
    [10, 0],
    [10, 1001],
    [10, null],
  ]) {
    await assert.rejects(dispatch(db, scopes, messages), (e) => e.code === '22023');
  }
});

test('clients cannot read/write queue or invoke internal worker/trigger', async (t) => {
  const db = await fixture(t);
  const privileges = (
    await db.query(`select r.role,
    has_table_privilege(r.role,'safebus_private.tracking_invalidation_queue','SELECT') as read,
    has_table_privilege(r.role,'safebus_private.tracking_invalidation_queue','INSERT') as insert,
    has_table_privilege(r.role,'safebus_private.tracking_invalidation_queue','UPDATE') as update,
    has_table_privilege(r.role,'safebus_private.tracking_invalidation_queue','DELETE') as delete,
    has_function_privilege(r.role,'safebus_private.dispatch_tracking_invalidations(integer,integer)','EXECUTE') as worker,
    has_function_privilege(r.role,'safebus_private.send_queued_tracking_invalidation(text)','EXECUTE') as sender,
    has_function_privilege(r.role,'safebus_private.notify_tracking_location_change()','EXECUTE') as trigger
    from (values('anon'),('authenticated'),('service_role')) r(role)`)
  ).rows;
  for (const row of privileges)
    for (const [key, value] of Object.entries(row)) if (key !== 'role') assert.equal(value, false);
  assert.equal(
    (
      await db.query(
        "select relrowsecurity from pg_class where oid='safebus_private.tracking_invalidation_queue'::regclass",
      )
    ).rows[0].relrowsecurity,
    true,
  );
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec('begin; set local role ' + role);
    try {
      await assert.rejects(dispatch(db), (e) => e.code === '42501');
    } finally {
      await db.exec('rollback');
    }
  }
  const [job] = (await db.query('select * from cron.test_jobs')).rows;
  assert.equal(job.schedule, '1 second');
  assert.match(job.command, /set local statement_timeout = '750ms'/);
  assert.match(job.command, /set local lock_timeout = '100ms'/);
  // Execute the exact post-install read-only catalog acceptance file, including
  // its transaction timeouts and rollback. This is not hosted acceptance.
  await db.exec(
    await fs.readFile('tests/rls/async-tracking-existing-database-readonly.sql', 'utf8'),
  );
});

test('prepared migration fails closed on an unreconciled public trigger baseline', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile('tests/release/fixtures/tracking-worker-baseline.sql', 'utf8'));
  await db.exec('begin');
  try {
    await assert.rejects(
      db.exec(await fs.readFile(migrationFile, 'utf8')),
      /Validate the reconciled security baseline/,
    );
  } finally {
    await db.exec('rollback');
  }
  assert.equal(
    (await db.query("select to_regclass('safebus_private.tracking_invalidation_queue') as queue"))
      .rows[0].queue,
    null,
  );
  assert.equal(
    (await db.query('select count(*)::int as count from cron.test_jobs')).rows[0].count,
    0,
  );
});

test('outer rollback undoes both messages and cursor/queue acknowledgement', async (t) => {
  const db = await fixture(t);
  await enqueue(db);
  await db.exec('begin');
  await dispatch(db);
  assert.equal((await queue(db)).length, 0);
  await db.exec('rollback');
  assert.equal((await queue(db)).length, 1);
  assert.equal((await capture(db)).length, 0);
  await dispatch(db);
  assert.equal((await queue(db)).length, 0);
});

test('trip changes still broadcast synchronously even when the location worker is idle', async (t) => {
  const db = await fixture(t);
  await enqueue(db);
  await db.query("update driver_trips set status = 'paused' where id=$1", [trip]);
  assert.ok((await capture(db)).some((r) => r.payload.reason === 'trip'));
  assert.equal((await capture(db)).filter((r) => r.payload.reason === 'location').length, 0);
});

test('pending migration preserves active manifest and existing security-install gate', async () => {
  assert.deepEqual(await buildMigrationManifest(), await readCommittedManifest());
  assert.equal(
    (await readCommittedManifest()).migrations.at(-1).filename,
    '0124_session_claim_validation.sql',
  );
  assert.equal((await readInstallInputs()).migrations.length, 3);
  const sql = await fs.readFile(migrationFile, 'utf8');
  assert.doesNotMatch(sql, /create\s+(?:or replace\s+)?function\s+public\./i);
  assert.doesNotMatch(sql, /create policy|grant .* (?:authenticated|anon|service_role)/i);
});
