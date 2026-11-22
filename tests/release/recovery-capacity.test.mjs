import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import {
  capacityTables,
  capacityGuards,
  cleanupCapacity,
  assertCapacityScope,
} from '../../scripts/lib/recovery-capacity-cleanup.mjs';
import { runArrivals, percentiles } from '../../scripts/lib/recovery-capacity-scheduler.mjs';
import {
  createNativeGpsUpload,
  measureNativeGps,
  verifyNativeGpsPositions,
} from '../../scripts/lib/recovery-native-gps-load.mjs';
import { RECOVERY_AUTH_URL } from '../../scripts/lib/recovery-auth.mjs';
import {
  capacityGpsLatitude,
  assertCapacityGpsAck,
} from '../../scripts/lib/recovery-capacity-gps.mjs';

function nativeDrivers(count) {
  return Array.from({ length: count }, (_, i) => ({
    tripId: `trip-${i}`,
    accessToken: `token-${i}`,
    trackingToken: `tracking-${i}`,
    deviceCredential: `device-${i}`,
    lastSequence: 0,
  }));
}

test('native GPS storage check detects a missing, duplicated, or stale bus position', async () => {
  const at = '2027-01-15T08:00:00.000Z';
  const latest = new Map([
    ['trip-a', { sequence: 2, recordedAt: at, latitude: 52.26 }],
    ['trip-b', { sequence: 2, recordedAt: at, latitude: 52.26 }],
  ]);
  const a = {
    driver_trip_id: 'trip-a',
    last_sequence: '2',
    recorded_at: new Date(at),
    latitude: 52.26,
    longitude: -113.81,
  };
  const b = { ...a, driver_trip_id: 'trip-b' };
  const check = (rows) =>
    verifyNativeGpsPositions(
      {
        query: async (_sql, params) => {
          assert.deepEqual(params, [['trip-a', 'trip-b']]);
          return { rows };
        },
      },
      latest,
    );
  assert.equal(await check([a, b]), true);
  assert.equal(await check([a]), false);
  assert.equal(await check([a, a]), false);
  assert.equal(await check([a, { ...b, last_sequence: '1' }]), false);
});

test('native GPS runner issues two separate requests per driver for a 10,000-bus burst', async () => {
  const drivers = nativeDrivers(10_000);
  const observed = new Map();
  const eventIds = new Set();
  let now = 0;
  const upload = createNativeGpsUpload('sb_publishable_fixture', async (url, init) => {
    assert.equal(url, RECOVERY_AUTH_URL + '/rest/v1/rpc/ingest_driver_location_event');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.apikey, 'sb_publishable_fixture');
    const payload = JSON.parse(init.body);
    const index = Number(payload.p_device_credential.slice('device-'.length));
    assert.equal(init.headers.authorization, 'Bearer ' + drivers[index].accessToken);
    assert.equal(payload.p_tracking_token, drivers[index].trackingToken);
    assert.equal(payload.p_sequence, (observed.get(index)?.p_sequence ?? 0) + 1);
    assert.equal(Date.parse(payload.p_recorded_at), 1_800_000_000_000 + now);
    assert.ok(!eventIds.has(payload.p_event_id));
    eventIds.add(payload.p_event_id);
    observed.set(index, payload);
    return {
      ok: true,
      json: async () => ({
        accepted: true,
        duplicate: false,
        stopTracking: false,
        tripState: 'active',
        recordedAt: payload.p_recorded_at,
      }),
    };
  });
  const result = await measureNativeGps({
    drivers,
    rounds: 2,
    pattern: 'synchronized',
    upload,
    clock: () => now,
    wallClock: () => 1_800_000_000_000,
    wait: async (ms) => {
      await new Promise(setImmediate);
      now += ms;
    },
    verifyPositions: async (latest) => {
      assert.equal(latest.size, 10_000);
      for (const [i, payload] of observed) {
        assert.deepEqual(latest.get(drivers[i].tripId), {
          sequence: 2,
          latitude: payload.p_latitude,
          recordedAt: payload.p_recorded_at,
        });
      }
      return true;
    },
  });
  assert.equal(eventIds.size, 20_000);
  assert.equal(result.accepted, 20_000);
  assert.equal(result.passed, true);
});

test('native GPS counts busy phone slots without submitting overlapping requests', async () => {
  let now = 0;
  let complete;
  const sent = [];
  const result = await measureNativeGps({
    drivers: nativeDrivers(1),
    rounds: 3,
    pattern: 'synchronized',
    upload: (_driver, sequence) => {
      sent.push(sequence);
      if (sequence === 1) return new Promise((resolve) => (complete = resolve));
    },
    verifyPositions: async (latest) => latest.get('trip-0')?.sequence === 3,
    clock: () => now,
    wallClock: () => 1_800_000_000_000,
    wait: async (ms) => {
      if (now >= 3000) {
        complete();
        await new Promise(setImmediate);
      }
      now += ms;
    },
  });
  assert.deepEqual(sent, [1, 3]);
  assert.equal(result.deviceBackpressure, 1);
  assert.equal(result.accepted, 2);
  assert.equal(result.planned, 3);
  assert.equal(result.passed, false);
});

test('native GPS reports only known provider rejection reasons', async () => {
  for (const [reason, code] of [
    ['out_of_order', 'NATIVE_GPS_REJECTED_OUT_OF_ORDER'],
    ['unknown-provider-response', 'NATIVE_GPS_ACK_MISMATCH'],
  ]) {
    const upload = createNativeGpsUpload('sb_publishable_fixture', async () => ({
      ok: true,
      json: async () => ({ accepted: false, rejectionReason: reason }),
    }));
    await assert.rejects(upload(nativeDrivers(1)[0], 1, '2027-01-01T00:00:00Z', 52.26), {
      message: code,
    });
  }
});

test('native GPS runner rejects stale acknowledgements and reports unsent load', async () => {
  const upload = createNativeGpsUpload('sb_publishable_fixture', async () => ({
    ok: true,
    json: async () => ({
      accepted: true,
      duplicate: false,
      stopTracking: false,
      tripState: 'active',
      recordedAt: '2020-01-01T00:00:00.000Z',
    }),
  }));
  let now = 0;
  const result = await measureNativeGps({
    drivers: nativeDrivers(2),
    rounds: 2,
    pattern: 'synchronized',
    upload,
    clock: () => now,
    wallClock: () => 1_800_000_000_000,
    wait: async (ms) => {
      now += ms;
      await new Promise(setImmediate);
    },
    verifyPositions: async () => true,
  });
  assert.equal(result.planned, 4);
  assert.equal(result.offered, 2);
  assert.equal(result.accepted, 0);
  assert.deepEqual(result.errors, { NATIVE_GPS_ACK_MISMATCH: 2 });
  assert.equal(result.passed, false);
});

test('all synthetic GPS coordinates round-trip exactly through hosted PostgreSQL float output', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('set extra_float_digits=0');
  const oldLatitude = 52.26 + 0.000001;
  const old = await db.query(
    'select row_to_json(r)::text payload from (select $1::double precision latitude) r',
    [oldLatitude],
  );
  assert.notEqual(JSON.parse(old.rows[0].payload).latitude, oldLatitude);
  const positions = Array.from({ length: 1000 }, (_, i) => capacityGpsLatitude(i));
  const rows = (
    await db.query(
      `select row_to_json(r)::text payload from (
    select value::double precision latitude, -113.81::double precision longitude, 'trip'::text driver_trip_id
    from json_array_elements_text($1::json) with ordinality as p(value,ord) order by ord
  ) r`,
      [JSON.stringify(positions)],
    )
  ).rows;
  assert.equal(rows.length, 1000);
  rows.forEach((row, i) => assertCapacityGpsAck(JSON.parse(row.payload), 'trip', positions[i]));
  assert.equal(capacityGpsLatitude(1000), capacityGpsLatitude(0));
  for (const invalid of [-1, 1.5, NaN, Infinity, '1'])
    assert.throws(() => capacityGpsLatitude(invalid), /CAPACITY_GPS_SEQUENCE/);
});

test('GPS acknowledgement still rejects wrong trips, stale positions and malformed coordinates', () => {
  const latitude = capacityGpsLatitude(1);
  const valid = { driver_trip_id: 'trip', latitude, longitude: -113.81 };
  assertCapacityGpsAck(valid, 'trip', latitude);
  for (const row of [
    null,
    [],
    {},
    { ...valid, driver_trip_id: 'foreign' },
    { ...valid, latitude: capacityGpsLatitude(0) },
    { ...valid, latitude: latitude + 1e-10 },
    { ...valid, latitude: String(latitude) },
    { ...valid, latitude: NaN },
    { ...valid, longitude: -113.8 },
  ])
    assert.throws(() => assertCapacityGpsAck(row, 'trip', latitude), /CAPACITY_GPS_ACK_MISMATCH/);
});
import {
  capacityWorkerPlan,
  dispatchCapacityRound,
} from '../../scripts/lib/recovery-capacity-workers.mjs';

async function workerFixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create schema safebus_private;
    create table calls(kind text, shard integer);
    create function safebus_private.dispatch_shared_tracking(shard integer, lim integer) returns jsonb language plpgsql as $$
      begin insert into calls values('shared',shard); return '{"failed_scopes":0}'; end $$;
    create function safebus_private.dispatch_tracking_invalidations(scopes integer, messages integer) returns jsonb language plpgsql as $$
      begin insert into calls values('legacy',null); return '{"failed_scopes":0}'; end $$;
    create function public.expand_notification_audiences(lim integer) returns integer language plpgsql as $$
      begin
        if current_setting('request.jwt.claim.role',true) is distinct from 'service_role' then raise exception 'role missing'; end if;
        insert into calls values('audience',null); return 1;
      end $$;`);
  return db;
}

test('batched worker plans cover all shards once with independent legacy and notification schedules', async (t) => {
  const db = await workerFixture(t);
  let queries = 0;
  const client = {
    query: async (sql) => {
      queries++;
      return db.exec(sql);
    },
  };
  for (let i = 0; i < 6; i++) {
    const plan = capacityWorkerPlan(i);
    assert.equal(plan.periodMs, i === 5 ? 20000 : 1000);
    const result = await dispatchCapacityRound(client, plan);
    assert.equal(result.dispatches, i < 4 ? 4 : 1);
    assert.ok(result.serverElapsedMs >= 0);
  }
  assert.equal(queries, 6);
  assert.deepEqual(
    (await db.query("select shard from calls where kind='shared' order by shard")).rows.map(
      (r) => r.shard,
    ),
    Array.from({ length: 16 }, (_, i) => i),
  );
  assert.equal((await db.query('select count(*)::int n from calls')).rows[0].n, 18);
  assert.notEqual(
    (await db.query("select current_setting('request.jwt.claim.role',true) role")).rows[0].role,
    'service_role',
  );
  for (const invalid of [-1, 6, 1.5, '0'])
    assert.throws(() => capacityWorkerPlan(invalid), /CAPACITY_WORKER_PLAN/);
});

test('a failed statement rolls back only its dispatch transaction and preserves its SQL error', async (t) => {
  const db = await workerFixture(t);
  await db.exec(`create or replace function safebus_private.dispatch_shared_tracking(shard integer, lim integer) returns jsonb language plpgsql as $$
    begin insert into calls values('shared',shard); if shard=4 then raise exception 'bounded failure' using errcode='57014'; end if; return '{"failed_scopes":0}'; end $$;`);
  await assert.rejects(
    dispatchCapacityRound({ query: (sql) => db.exec(sql) }, capacityWorkerPlan(0)),
    (e) => e.code === '57014',
  );
  assert.deepEqual((await db.query('select shard from calls')).rows, [{ shard: 0 }]);
});

test('batch results cannot hide reported worker failures or missing dispatches', async () => {
  const rows = [
    { capacity_clock_ms: '100' },
    { capacity_worker: 'legacy', r: { failed_scopes: 1 } },
    { capacity_clock_ms: '200' },
  ];
  await assert.rejects(
    dispatchCapacityRound({ query: async () => [{ rows }] }, capacityWorkerPlan(4)),
    /CAPACITY_LEGACY_WORKER_FAILED/,
  );
  await assert.rejects(
    dispatchCapacityRound({ query: async () => [{ rows: [] }] }, capacityWorkerPlan(0)),
    /CAPACITY_WORKER_RESULT/,
  );
});
import {
  checkedCapacityAuth,
  createCapacityLogin,
} from '../../scripts/lib/recovery-capacity-auth.mjs';

test('capacity setup sustains 551 sign-ins without exhausting a 150/5-minute token bucket', async () => {
  let now = 0,
    last = 0,
    tokens = 30,
    rejections = 0;
  const starts = [];
  const login = createCapacityLogin({
    clock: () => now,
    wait: async (ms) => {
      now += ms;
    },
  });
  for (let i = 0; i < 551; i++) {
    await login(async () => {
      tokens = Math.min(30, tokens + (now - last) / 2000);
      last = now;
      starts.push(now);
      if (tokens < 1) {
        rejections++;
        return { error: { status: 429 } };
      }
      tokens--;
      return { data: { ok: true } };
    });
  }
  assert.equal(rejections, 0);
  assert.equal(starts.length, 551);
  assert.ok(starts.slice(1).every((time, i) => time - starts[i] >= 2100));
});

test('setup retries only rejected logins and caps retries without exposing responses', async () => {
  let now = 0,
    calls = 0;
  const retries = [];
  const login = createCapacityLogin({
    clock: () => now,
    wait: async (ms) => {
      now += ms;
    },
    onRetry: (r) => retries.push(r),
  });
  assert.deepEqual(
    await login(async () =>
      ++calls < 3 ? { error: { status: 429, message: 'secret' } } : { data: { ok: true } },
    ),
    { ok: true },
  );
  assert.deepEqual(retries, [{ backoffMs: 5000 }, { backoffMs: 10000 }]);
  calls = 0;
  await assert.rejects(
    login(async () => {
      calls++;
      return { error: { status: 429 } };
    }),
    /^Error: CAPACITY_AUTH_RATE_LIMIT$/,
  );
  assert.equal(calls, 4);
  calls = 0;
  await assert.rejects(
    login(async () => {
      calls++;
      return { error: { status: 401, message: 'secret' } };
    }),
    /^Error: CAPACITY_AUTH_HTTP_401$/,
  );
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(
    login(async () => {
      calls++;
      throw Error('network uncertain');
    }),
    /network uncertain/,
  );
  assert.equal(calls, 1);
  assert.throws(
    () => checkedCapacityAuth({ error: { message: 'secret' } }),
    /^Error: CAPACITY_AUTH_FAILED$/,
  );
});

test('setup retry wait budget is shared between accounts', async () => {
  let now = 0,
    waited = 0;
  const login = createCapacityLogin({
    clock: () => now,
    wait: async (ms) => {
      now += ms;
    },
    onRetry: ({ backoffMs }) => {
      waited += backoffMs;
    },
  });
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      login(async () => ({ error: { status: 429 } })),
      /CAPACITY_AUTH_RATE_LIMIT/,
    );
  assert.equal(waited, 120000);
});

test('aborting setup prevents another sign-in during pacing or backoff', async () => {
  const stop = new AbortController();
  let now = 0,
    calls = 0;
  const login = createCapacityLogin({
    signal: stop.signal,
    clock: () => now,
    wait: async (ms) => {
      now += ms;
      stop.abort();
    },
  });
  await login(async () => {
    calls++;
    return { data: {} };
  });
  await assert.rejects(
    login(async () => {
      calls++;
      return { data: {} };
    }),
    /CAPACITY_STOP_REQUESTED/,
  );
  assert.equal(calls, 1);
});
const tid = 'ca000000-0000-4000-8000-000000000001',
  uid = 'ca100000-0000-4000-8000-000000000001';
const scope = {
  run: '123-1',
  buses: 10,
  tenantIds: [tid, 'ca000000-0000-4000-8000-000000000002'],
  emails: Array.from({ length: 61 }, (_, i) => `capacity-load-123-1-${i}@example.test`),
};
async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;
    revoke usage on schema public from public;
    create schema auth;create schema safebus_private;create schema safebus_release;
    create table safebus_release.environment_identity(singleton boolean,environment text,project_ref_hash text);
    insert into safebus_release.environment_identity values(true,'staging',encode(sha256(convert_to('deladookciebwvqojhkv','UTF8')),'hex'));
    create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb);
    create table public.tenants(id uuid primary key,name text,type text);
    create function public.deny_delete() returns trigger language plpgsql as $$begin raise exception 'guarded';end$$;`);
  for (const table of capacityTables)
    await db.exec(
      `create table public.${table}(id uuid primary key,tenant_id uuid references public.tenants)`,
    );
  await db.exec(`create table safebus_private.driver_tracking_state(device_id uuid primary key references public.driver_tracking_devices on delete cascade);
    create table safebus_private.notification_audience_queue(tenant_id uuid references public.tenants);
    create table safebus_private.agreement_packages(tenant_id uuid references public.tenants);
    create table safebus_private.participant_agreement_requirements(profile_id uuid references public.profiles);
    create table safebus_private.tenant_agreement_requirement(tenant_id uuid references public.tenants);`);
  await db.query("insert into public.tenants values($1,'Capacity Load 123-1 1','demo')", [tid]);
  await db.query('insert into auth.users values($1,$2,$3)', [
    uid,
    scope.emails[0],
    JSON.stringify({ safebus_capacity_run: scope.run }),
  ]);
  for (const table of capacityTables)
    await db.query(`insert into public.${table} values($1,$2)`, [uid, tid]);
  await db.query('insert into safebus_private.driver_tracking_state values($1)', [uid]);
  await db.query('insert into safebus_private.participant_agreement_requirements values($1)', [
    uid,
  ]);
  for (const [table, guard] of capacityGuards)
    await db.exec(
      `create trigger ${guard} before delete on public.${table} for each row execute function public.deny_delete()`,
    );
  return db;
}
async function state(db) {
  return (
    await db.query(`select
  (select count(*)::int from public.profiles) profiles,
  (select count(*)::int from public.driver_trips) trips,
  (select count(*)::int from public.user_notifications) notifications,
  (select count(*)::int from public.driver_tracking_devices) devices,
  (select count(*)::int from safebus_private.driver_tracking_state) device_cursors,
  (select count(*)::int from pg_trigger where not tgisinternal and tgenabled='O') guards`)
  ).rows[0];
}
test('capacity cleanup rehearses without loss and restores all 16 guards after deletion', async (t) => {
  const db = await fixture(t),
    before = await state(db);
  assert.equal(before.guards, 16);
  await cleanupCapacity(db, scope, true);
  assert.deepEqual(await state(db), before);
  await cleanupCapacity(db, scope);
  assert.equal(before.devices, 1);
  assert.equal(before.device_cursors, 1);
  assert.deepEqual(await state(db), {
    profiles: 0,
    trips: 0,
    notifications: 0,
    devices: 0,
    device_cursors: 0,
    guards: 16,
  });
  assert.equal(
    (await db.query('select * from auth.users')).rows.length,
    1,
    'Auth deletion remains a separate API step',
  );
});
for (const [name, sql] of [
  ['production', "update safebus_release.environment_identity set environment='production'"],
  ['exposed API', 'grant usage on schema public to authenticated'],
  ['wrong identity', "update auth.users set raw_app_meta_data='{}'"],
  ['wrong tenant name', "update public.tenants set name='Customer'"],
  ['unowned row', 'update public.driver_trips set tenant_id=null'],
  ['guard drift', 'alter table public.driver_trips disable trigger complete_disposal_guard'],
  [
    'late failure',
    'create trigger fail_cleanup before delete on public.routes for each row execute function public.deny_delete()',
  ],
])
  test(`capacity cleanup rolls back safely: ${name}`, async (t) => {
    const db = await fixture(t);
    await db.exec(sql);
    const before = await state(db);
    await assert.rejects(cleanupCapacity(db, scope), {
      message:
        name === 'exposed API'
          ? 'CAPACITY_API_EXPOSED'
          : name === 'unowned row'
            ? 'CAPACITY_FOREIGN_ROWS'
            : name === 'guard drift'
              ? 'CAPACITY_GUARD_DRIFT'
              : name === 'late failure'
                ? 'guarded'
                : 'CAPACITY_CLEANUP_OWNERSHIP',
    });
    assert.deepEqual(await state(db), before);
  });
test('capacity scope rejects oversized runs and arbitrary addresses', () => {
  assert.throws(() => assertCapacityScope({ ...scope, buses: 10000 }));
  assert.throws(() =>
    assertCapacityScope({ ...scope, emails: scope.emails.map(() => 'real@example.com') }),
  );
});
test('latency percentiles preserve the tail', () =>
  assert.deepEqual(percentiles([1, 2, 3, 4, 5000]), { p50: 3, p95: 5000, p99: 5000 }));
test('open loop records offered, achieved and bounded latency', async () => {
  let now = 0;
  const seen = [];
  const result = await runArrivals({
    count: 2,
    periodMs: 1000,
    durationMs: 2000,
    clock: () => now,
    wait: async (ms) => {
      now += ms;
    },
    operation: async (i, s) => {
      seen.push([i, s]);
    },
  });
  assert.equal(result.expected, 4);
  assert.equal(result.completed, 4);
  assert.equal(result.passed, true);
  assert.deepEqual(seen, [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]);
});
test('generator backlog fails rather than silently lowering offered load', async () => {
  let now = 0;
  const result = await runArrivals({
    count: 1,
    periodMs: 1000,
    durationMs: 3000,
    clock: () => now,
    wait: async (ms) => {
      now += ms + 2000;
    },
    operation: async () => {},
  });
  assert.equal(result.passed, false);
  assert.equal(result.missed, 1);
  assert.ok(result.completed < result.expected);
});
test('operation failures and pre-aborted load cannot pass', async () => {
  let now = 0;
  const base = {
    count: 1,
    periodMs: 1000,
    durationMs: 3000,
    clock: () => now,
    wait: async (ms) => {
      now += ms;
    },
    operation: async () => {
      throw Error('rejected');
    },
  };
  assert.equal((await runArrivals(base)).passed, false);
  assert.equal((await runArrivals({ ...base, signal: AbortSignal.abort() })).passed, false);
});

test('arrivals do not issue a request when cancelled during scheduled wait', async () => {
  const controller = new AbortController();
  let now = 0,
    requests = 0;
  const result = await runArrivals({
    count: 1,
    periodMs: 1000,
    durationMs: 2000,
    signal: controller.signal,
    clock: () => now,
    wait: async (ms) => {
      now += ms;
      controller.abort();
    },
    operation: async () => {
      requests++;
    },
  });
  assert.equal(requests, 1);
  assert.equal(result.passed, false);
});
