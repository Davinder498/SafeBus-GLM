import fs from 'node:fs/promises';
import { randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { performance } from 'node:perf_hooks';
import {
  verifiedDatabaseClient,
  assertReviewedCheckout,
} from './lib/security-workflow-evidence.mjs';
import {
  createEnvironmentBinding,
  assertEnvironmentIdentity,
} from './lib/environment-identity.mjs';
import { RECOVERY_AUTH_URL, assertRecoveryAuthKeys } from './lib/recovery-auth.mjs';
import {
  capacityTables,
  capacityQuarantine,
  cleanupCapacity,
  assertCapacityScope,
} from './lib/recovery-capacity-cleanup.mjs';
import {
  seedCapacityTenant,
  seedCapacityBus,
  seedCapacityGuardian,
} from './lib/recovery-capacity-fixtures.mjs';
import { runArrivals } from './lib/recovery-capacity-scheduler.mjs';
import { sendRecoveryProbe } from './lib/recovery-broadcast-readiness.mjs';
import { channelFailureCode, withRealtimeStartupRetry } from './lib/recovery-api-diagnostics.mjs';
import { calculateSchemaFingerprint } from './lib/schema-fingerprint.mjs';
import { recoveryPolicyQuery } from './lib/recovery-runtime-catalog.mjs';
const { createClient } = createRequire(new URL('../apps/web/package.json', import.meta.url))(
  '@supabase/supabase-js',
);
const buses = Number(process.env.SAFEBUS_CAPACITY_BUSES);
const run = `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
const scope = {
  run,
  buses,
  tenantIds: [randomUUID(), randomUUID()],
  emails: Array.from(
    { length: Number.isInteger(buses) && buses <= 500 ? buses + 51 : 0 },
    (_, i) => `capacity-load-${run}-${i}@example.test`,
  ),
};
const evidence = {
  releaseSha: process.env.SAFEBUS_RELEASE_SHA,
  runId: run,
  target: 'deladookciebwvqojhkv',
  requestedBuses: buses,
  startedAt: new Date().toISOString(),
  stages: [],
  cleanupVerified: false,
  capacityQualified: false,
  limitations: [
    'Exploratory browser-session GPS; native device ingestion and offline replay not exercised.',
    '50 eligible guardians on one bus only; not 50 guardians per fleet bus.',
    'Internal notification audience/inbox only; no push or email provider delivery.',
    'Node workers invoke installed functions; not a pg_cron scheduler qualification.',
    'No eight-hour soak, fleet-wide viewer load, or commercial launch certification.',
  ],
};
const stop = new AbortController();
let db,
  admin,
  connected = false,
  armed = false,
  stage = 'preflight',
  workers = [],
  workerTasks = [],
  workerStop = false,
  workerError = null;
const accounts = [],
  fleet = [],
  viewers = [],
  channels = [];
let hintCount = 0;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => stop.abort());
const deadline = setTimeout(() => stop.abort(), 20 * 60 * 1000);
const checked = (r) => {
  if (r.error) throw Error('CAPACITY_AUTH_FAILED');
  return r.data;
};
const safeFetch = (input, init) => {
  if (new URL(typeof input === 'string' ? input : input.url).origin !== RECOVERY_AUTH_URL)
    throw Error('CAPACITY_ORIGIN_REJECTED');
  return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
};
const options = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: safeFetch },
};
const assertRunning = () => {
  if (workerError) throw workerError;
  if (stop.signal.aborted) throw Error('CAPACITY_STOP_REQUESTED');
};
const safeCode = (e) =>
  /^[A-Z][A-Z0-9_]{3,65}$/.test(e?.message ?? '')
    ? e.message
    : /^[A-Z0-9]{5}$/.test(e?.code ?? '')
      ? e.code
      : 'UNCLASSIFIED_FAILURE';
try {
  assertCapacityScope(scope);
  assertReviewedCheckout(process.env.SAFEBUS_RELEASE_SHA);
  if (
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.SAFEBUS_CAPACITY_CONFIRM !== 'RUN_RECOVERY_CAPACITY'
  )
    throw Error('CAPACITY_WORKFLOW_REQUIRED');
  const url = new URL(process.env.SAFEBUS_CAPACITY_DATABASE_URL);
  if (
    url.pathname !== '/postgres' ||
    (url.port || '5432') !== '5432' ||
    url.search ||
    url.hash ||
    !url.password
  )
    throw Error('CAPACITY_SESSION_CONNECTION_REQUIRED');
  assertRecoveryAuthKeys(
    process.env.SAFEBUS_CAPACITY_AUTH_SECRET,
    process.env.SAFEBUS_CAPACITY_PUBLISHABLE_KEY,
  );
  const binding = createEnvironmentBinding({
    environment: 'staging',
    databaseUrl: url.toString(),
    supabaseUrl: RECOVERY_AUTH_URL,
  });
  const connect = async (name) => {
    const c = verifiedDatabaseClient(
      url.toString(),
      process.env.SAFEBUS_CAPACITY_DATABASE_CA_CERT,
      name,
    );
    await c.connect();
    await c.query("set statement_timeout='8s';set lock_timeout='1s'");
    return c;
  };
  db = await connect('safebus-capacity-control');
  connected = true;
  await assertEnvironmentIdentity(db, binding);
  if (
    !(
      await db.query(
        "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) locked",
      )
    ).rows[0].locked
  )
    throw Error('CAPACITY_DEPLOYMENT_BUSY');
  await capacityQuarantine(db);
  for (const table of [
    'auth.users',
    'auth.sessions',
    'cron.job',
    'vault.secrets',
    'storage.objects',
    'public.tenants',
    ...capacityTables.map((t) => 'public.' + t),
    'safebus_private.notification_audience_queue',
  ])
    if ((await db.query(`select 1 from ${table} limit 1`)).rowCount)
      throw Error('CAPACITY_NONEMPTY_BASELINE');
  if (
    (
      await db.query(
        "select 1 from pg_trigger where tgrelid in ('auth.users'::regclass,'auth.sessions'::regclass) and not tgisinternal",
      )
    ).rowCount
  )
    throw Error('CAPACITY_AUTH_TRIGGER_DRIFT');
  await db.query('set search_path=pg_catalog');
  if (
    JSON.stringify((await db.query(recoveryPolicyQuery)).rows) !==
    JSON.stringify(
      JSON.parse(await fs.readFile('tests/capacity/recovery-runtime-policies.json', 'utf8')),
    )
  )
    throw Error('CAPACITY_POLICY_DRIFT');
  const hook = (
    await db.query(
      "select setting from pg_db_role_setting s join pg_roles r on r.oid=s.setrole cross join lateral unnest(s.setconfig) setting where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%'",
    )
  ).rows;
  if (
    hook.length !== 1 ||
    hook[0].setting !== 'pgrst.db_pre_request=safebus_private.enforce_active_api_session'
  )
    throw Error('CAPACITY_HOOK_DRIFT');
  const settings = await safeFetch(RECOVERY_AUTH_URL + '/auth/v1/settings', {
    headers: { apikey: process.env.SAFEBUS_CAPACITY_PUBLISHABLE_KEY },
  });
  if (!settings.ok) throw Error('CAPACITY_SETTINGS_FAILED');
  const config = await settings.json();
  if (
    config.disable_signup !== true ||
    config.external?.email !== true ||
    config.external?.phone === true
  )
    throw Error('CAPACITY_AUTH_NOT_ISOLATED');
  evidence.schemaFingerprint = await calculateSchemaFingerprint(db);
  evidence.database = (
    await db.query(
      "select version() version,current_setting('max_connections')::int max_connections,pg_database_size(current_database()) bytes",
    )
  ).rows[0];
  admin = createClient(RECOVERY_AUTH_URL, process.env.SAFEBUS_CAPACITY_AUTH_SECRET, options);
  checked(await admin.auth.admin.listUsers({ page: 1, perPage: 1 }));
  armed = true;
  for (let i = 0; i < 2; i++)
    await db.query("insert into public.tenants(id,name,type) values($1,$2,'demo')", [
      scope.tenantIds[i],
      `Capacity Load ${run} ${i + 1}`,
    ]);
  stage = 'accounts';
  for (let i = 0; i < scope.emails.length; i++) {
    assertRunning();
    stage = `account-${i}`;
    const email = scope.emails[i],
      password = `Ca9!${randomBytes(32).toString('base64url')}`;
    const user = checked(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { safebus_capacity_run: run },
      }),
    ).user;
    if (!user?.id) throw Error('CAPACITY_AUTH_FAILED');
    const role = i < buses ? 'driver' : 'guardian',
      tenant = scope.tenantIds[i === scope.emails.length - 1 ? 1 : 0];
    await db.query(
      "insert into public.profiles(id,tenant_id,full_name,first_name,last_name,email,role,status) values($1,$2,'Capacity Synthetic','Capacity','Synthetic',$3,$4,'active')",
      [user.id, tenant, email, role],
    );
    const client = createClient(
      RECOVERY_AUTH_URL,
      process.env.SAFEBUS_CAPACITY_PUBLISHABLE_KEY,
      options,
    );
    const a = { id: user.id, email, client, tenant };
    accounts.push(a);
    const login = checked(await client.auth.signInWithPassword({ email, password }));
    if (login.user?.id !== user.id || !login.session?.access_token)
      throw Error('CAPACITY_LOGIN_MISMATCH');
    a.token = login.session.access_token;
    await delay(100); // provisioning rate is not an Auth capacity claim
  }
  stage = 'fixtures';
  for (let i = 0; i < 2; i++) await seedCapacityTenant(db, scope, i, accounts[0].id);
  for (let i = 0; i < buses; i++) {
    assertRunning();
    stage = `fixture-bus-${i}`;
    fleet.push(await seedCapacityBus(db, scope.tenantIds[0], accounts[i].id, i));
  }
  for (let i = 0; i < 50; i++) {
    stage = `fixture-guardian-${i}`;
    const a = accounts[buses + i];
    Object.assign(a, await seedCapacityGuardian(db, fleet[0], a, i));
    viewers.push(a);
  }
  stage = 'cleanup-rehearsal';
  await cleanupCapacity(db, scope, true);
  await db.query('grant usage on schema public,safebus_private to authenticated');
  stage = 'shared-bus-correctness';
  await gps(0, 0);
  await readMap(viewers[0], 0);
  const foreign = checked(
    await accounts
      .at(-1)
      .client.rpc('get_guardian_bus_service_lines', { p_bus_number: fleet[0].busNumber }),
  );
  if (!Array.isArray(foreign) || foreign.length !== 0) throw Error('CAPACITY_SCOPE_DISCLOSURE');
  const wrong = await accounts[1].client.rpc('update_bus_tracking_location', {
    p_tracking_token: fleet[0].token,
    p_latitude: 52.26,
    p_longitude: -113.81,
  });
  if (wrong.error?.code !== '42501') throw Error('CAPACITY_DRIVER_SCOPE');
  // Initialize managed replication and confirm real receipt before timing load.
  const probeNonce = randomUUID();
  let probeReceived = false;
  const probe = await join(
    viewers[0],
    `safebus:notifications:${viewers[0].id}`,
    'capacity_probe',
    (p) => {
      if (p?.nonce === probeNonce) probeReceived = true;
    },
  );
  await sendRecoveryProbe(db, {
    nonce: probeNonce,
    topic: `safebus:notifications:${viewers[0].id}`,
  });
  for (let i = 0; i < 40 && !probeReceived; i++) await delay(200);
  if (!probeReceived) throw Error('CAPACITY_PROBE_DELIVERY');
  await viewers[0].client.removeChannel(probe);
  stage = 'workers';
  for (let i = 0; i < 4; i++) workers.push(await connect('safebus-capacity-worker'));
  workerTasks = workers.map((w, index) => workerLoop(w, index));
  // Requeue the real trip-start source after guardian assignments exist.
  await db.query(
    "select safebus_private.notify_trip_audience($1,$2,$3,'trip_started','trip_status','info','driver_trip',$2,now())",
    [fleet[0].tenant, fleet[0].trip, fleet[0].route],
  );
  stage = 'notification-only';
  await measure(10, 30000, false);
  for (let i = 0; i < 60; i++) {
    assertRunning();
    const n = (
      await db.query(
        "select count(distinct recipient_profile_id)::int n from public.user_notifications where driver_trip_id=$1 and event_type='trip_started' and recipient_profile_id=any($2::uuid[])",
        [fleet[0].trip, viewers.map((a) => a.id)],
      )
    ).rows[0].n;
    if (n === 50) {
      evidence.notificationRecipientsWithoutMaps = n;
      break;
    }
    await delay(500);
  }
  if (evidence.notificationRecipientsWithoutMaps !== 50) throw Error('CAPACITY_NOTIFICATION_LOSS');
  stage = 'map-viewers';
  for (const a of viewers)
    await join(a, fleet[0].topic, 'tracking_changed', () => {
      hintCount++;
      a.hints = (a.hints ?? 0) + 1;
    });
  await measure(10, 30000, true);
  if (viewers.some((a) => !a.hints)) throw Error('CAPACITY_TRACKING_DELIVERY');
  evidence.sharedTrackingHintsReceived = hintCount;
  // One deliberately disconnected viewer must rejoin and read a fresh snapshot.
  const reconnectStarted = performance.now();
  await viewers[0].client.removeAllChannels();
  let rejoinedHint = false;
  await join(viewers[0], fleet[0].topic, 'tracking_changed', () => {
    rejoinedHint = true;
  });
  await gps(0, 100);
  for (let i = 0; i < 40 && !rejoinedHint; i++) await delay(200);
  if (!rejoinedHint) throw Error('CAPACITY_REJOIN_DELIVERY');
  await readMap(viewers[0], 0);
  evidence.rejoinMs = performance.now() - reconnectStarted;
  for (const a of viewers) await a.client.removeAllChannels();
  if (buses >= 100) {
    stage = 'ramp-100';
    await measure(100, 60000, false);
  }
  if (buses === 500) {
    stage = 'ramp-500';
    await measure(500, 300000, false);
  }
  stage = 'drain';
  let drained = false;
  for (let i = 0; i < 180; i++) {
    assertRunning();
    const q = await queueHealth();
    if (q.shared === 0 && q.legacy === 0 && q.audience === 0) {
      drained = true;
      break;
    }
    await delay(500);
  }
  if (!drained) throw Error('CAPACITY_DRAIN_TIMEOUT');
  evidence.exploratoryPassed = true;
} catch (e) {
  evidence.exploratoryPassed = false;
  evidence.failedStage = stage;
  evidence.failureCode = safeCode(e);
  if (/^[a-z_][a-z0-9_]{0,79}$/.test(e.constraint ?? '')) evidence.failedConstraint = e.constraint;
  process.exitCode = 1;
  console.error(
    `Recovery capacity stopped at stage=${stage}; code=${safeCode(e)}; provider details omitted.`,
  );
} finally {
  workerStop = true;
  await Promise.allSettled(workerTasks);
  for (const w of workers) await w.end().catch(() => {});
  if (connected && armed) {
    try {
      await db.query('rollback');
      await db.query('revoke usage on schema public,safebus_private from authenticated');
      for (const a of accounts) await a.client.removeAllChannels();
      await capacityQuarantine(db);
      await cleanupCapacity(db, scope);
      const owned = (
        await db.query(
          "select id from auth.users where raw_app_meta_data->>'safebus_capacity_run'=$1 and email=any($2::text[])",
          [run, scope.emails],
        )
      ).rows;
      for (const a of owned) checked(await admin.auth.admin.deleteUser(a.id));
      if (
        (await db.query('select 1 from auth.users limit 1')).rowCount ||
        (await db.query('select 1 from auth.sessions limit 1')).rowCount
      )
        throw Error('CAPACITY_AUTH_CLEANUP');
      await capacityQuarantine(db);
      if ((await calculateSchemaFingerprint(db)) !== evidence.schemaFingerprint)
        throw Error('CAPACITY_SCHEMA_CHANGED');
      evidence.cleanupVerified = true;
    } catch (e) {
      evidence.cleanupFailure = safeCode(e);
      process.exitCode = 1;
      console.error(
        `Recovery capacity cleanup stopped; code=${safeCode(e)}; inspect before rerun.`,
      );
    }
  }
  if (connected) await db.end().catch(() => {});
  for (const a of accounts) a.client.auth.stopAutoRefresh();
  clearTimeout(deadline);
  evidence.finishedAt = new Date().toISOString();
  await fs.mkdir('.safebus-release/recovery-capacity', { recursive: true });
  await fs.writeFile(
    '.safebus-release/recovery-capacity/evidence.json',
    JSON.stringify(evidence, null, 2),
  );
}
async function gps(i, sequence) {
  assertRunning();
  const latitude = 52.26 + (sequence % 1000) * 0.000001;
  const r = await accounts[i].client.rpc('update_bus_tracking_location', {
    p_tracking_token: fleet[i].token,
    p_latitude: latitude,
    p_longitude: -113.81,
    p_accuracy_m: 5,
    p_speed_mps: 5,
  });
  if (r.error) throw Error('CAPACITY_GPS_REJECTED');
  if (r.data?.driver_trip_id !== fleet[i].trip || r.data?.latitude !== latitude)
    throw Error('CAPACITY_GPS_ACK_MISMATCH');
  fleet[i].lastLatitude = latitude;
}
async function readMap(a, sequence) {
  const r = await a.client.rpc('get_guardian_bus_visibility_v2');
  if (r.error) throw Error('CAPACITY_MAP_REJECTED');
  if (
    !Array.isArray(r.data) ||
    r.data.length !== 1 ||
    r.data[0].student_id !== a.student ||
    r.data[0].bus_number !== fleet[0].busNumber
  )
    throw Error('CAPACITY_SCOPE_DISCLOSURE');
  if (!r.data[0].has_active_trip || r.data[0].location_state !== 'fresh')
    throw Error('CAPACITY_STALE_MAP');
  if (sequence % 5 === 0) {
    const detail = await a.client.rpc('get_guardian_bus_service_lines', {
      p_bus_number: fleet[0].busNumber,
    });
    if (
      detail.error ||
      detail.data?.length !== 1 ||
      detail.data[0].trackingTopic !== fleet[0].topic
    )
      throw Error('CAPACITY_SHARED_READ');
  }
}
async function join(a, topic, event, onPayload) {
  await a.client.realtime.setAuth(a.token);
  return withRealtimeStartupRetry(async () => {
    const ch = a.client
      .channel(topic, { config: { private: true } })
      .on('broadcast', { event }, ({ payload }) => onPayload(payload));
    let timer;
    try {
      await new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(Error('CAPACITY_CHANNEL_TIMEOUT')), 12000);
        ch.subscribe((status, error) => {
          if (status === 'SUBSCRIBED') resolve();
          if (status === 'CHANNEL_ERROR') reject(Error(channelFailureCode(error)));
          if (status === 'TIMED_OUT') reject(Error('CAPACITY_CHANNEL_TIMEOUT'));
        });
      });
      channels.push(ch);
      return ch;
    } catch (e) {
      await a.client.removeChannel(ch);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  });
}
async function workerLoop(w, index) {
  try {
    while (!workerStop && !stop.signal.aborted) {
      const start = performance.now();
      for (let shard = index; shard < 16; shard += 4) {
        await w.query('begin');
        try {
          await w.query("set local statement_timeout='750ms'");
          const r = (
            await w.query('select safebus_private.dispatch_shared_tracking($1,256) r', [shard])
          ).rows[0].r;
          if (r.failed_scopes) throw Error('CAPACITY_SHARED_WORKER_FAILED');
          await w.query('commit');
        } catch (e) {
          await w.query('rollback');
          throw e;
        }
      }
      if (index === 0) {
        const r = (
          await w.query('select safebus_private.dispatch_tracking_invalidations(10,250) r')
        ).rows[0].r;
        if (r.failed_scopes) throw Error('CAPACITY_LEGACY_WORKER_FAILED');
        await w.query("begin; set local request.jwt.claim.role='service_role'");
        try {
          await w.query('select public.expand_notification_audiences(16)');
          await w.query('commit');
        } catch (e) {
          await w.query('rollback');
          throw e;
        }
      }
      if (performance.now() - start > 1000) throw Error('CAPACITY_WORKER_SCHEDULER_LIMIT');
      await delay(Math.max(0, 1000 - (performance.now() - start)));
    }
  } catch (e) {
    workerError = Error(safeCode(e));
    stop.abort();
  }
}
async function queueHealth() {
  return (
    await db.query(`select
    (select count(*)::int from safebus_private.shared_tracking_queue) shared,
    (select count(*)::int from safebus_private.tracking_invalidation_queue) legacy,
    (select coalesce(extract(epoch from (clock_timestamp()-min(first_pending_at))),0)::float8 from safebus_private.shared_tracking_queue) sharedAgeSeconds,
    (select coalesce(extract(epoch from (clock_timestamp()-min(first_pending_at))),0)::float8 from safebus_private.tracking_invalidation_queue) legacyAgeSeconds,
    (select count(*)::int from safebus_private.notification_audience_queue) audience,
    (select count(*)::int from safebus_private.notification_audience_queue where failed_at is not null) failed,
    (select count(*)::int from pg_stat_activity where datname=current_database()) connections`)
  ).rows[0];
}
async function measure(count, durationMs, maps) {
  assertRunning();
  const samples = [],
    began = Date.now();
  let monitoring = true;
  const monitor = (async () => {
    try {
      while (monitoring) {
        const q = await queueHealth();
        samples.push({ elapsedMs: Date.now() - began, ...q });
        if (
          q.failed ||
          q.sharedageseconds > 120 ||
          q.legacyageseconds > 120 ||
          q.connections > evidence.database.max_connections * 0.8
        )
          throw Error('CAPACITY_RESOURCE_STOP');
        await delay(1000);
      }
    } catch (e) {
      workerError = Error(safeCode(e));
      stop.abort();
    }
  })();
  let result;
  try {
    const tasks = [
      runArrivals({
        count,
        periodMs: 3000,
        durationMs,
        signal: stop.signal,
        operation: gps,
        onError: (e) => {
          workerError = Error(safeCode(e));
          stop.abort();
        },
      }),
    ];
    if (maps)
      tasks.push(
        runArrivals({
          count: 50,
          periodMs: 3000,
          durationMs,
          signal: stop.signal,
          operation: (i, s) => readMap(viewers[i], s),
          onError: (e) => {
            workerError = Error(safeCode(e));
            stop.abort();
          },
        }),
      );
    result = await Promise.all(tasks);
  } finally {
    monitoring = false;
    await monitor;
  }
  evidence.stages.push({
    buses: count,
    mapViewers: maps ? 50 : 0,
    eligibleGuardians: 50,
    durationMs,
    requests: result,
    queueSamples: samples,
  });
  assertRunning();
  if (result.some((r) => !r.passed)) throw Error('CAPACITY_LOAD_THRESHOLD');
  const locations = (
    await db.query(
      'select driver_trip_id,latitude from public.driver_trip_current_locations where driver_trip_id=any($1::uuid[])',
      [fleet.slice(0, count).map((b) => b.trip)],
    )
  ).rows;
  if (
    locations.length !== count ||
    locations.some(
      (row) => fleet.find((b) => b.trip === row.driver_trip_id)?.lastLatitude !== row.latitude,
    )
  )
    throw Error('CAPACITY_ACK_RECONCILIATION');
  console.log(
    `Capacity stage completed: buses=${count}; map_viewers=${maps ? 50 : 0}; gps_p99_ms=${result[0].latencyMs.p99.toFixed(1)}`,
  );
}
