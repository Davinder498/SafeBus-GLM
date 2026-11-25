import fs from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { performance } from "node:perf_hooks";
import {
  verifiedDatabaseClient,
  assertRecoveryCapacityCheckout,
} from "./lib/security-workflow-evidence.mjs";
import {
  createEnvironmentBinding,
  assertEnvironmentIdentity,
} from "./lib/environment-identity.mjs";
import {
  RECOVERY_AUTH_URL,
  assertRecoveryAuthKeys,
} from "./lib/recovery-auth.mjs";
import {
  capacityTables,
  capacityAccountCount,
  capacityQuarantine,
  cleanupCapacity,
  assertCapacityScope,
} from "./lib/recovery-capacity-cleanup.mjs";
import {
  seedCapacityTenant,
  seedCapacityBus,
  seedCapacityGuardian,
  seedCapacityNativeDevice,
  seedCapacityFleetInLanes,
} from "./lib/recovery-capacity-fixtures.mjs";
import {
  quarantineCapacity,
  disconnectCapacityClients,
  capacityFetch,
} from "./lib/recovery-capacity-lifecycle.mjs";
import { runArrivals } from "./lib/recovery-capacity-scheduler.mjs";
import {
  capacityGpsLatitude,
  assertCapacityGpsAck,
} from "./lib/recovery-capacity-gps.mjs";
import {
  createNativeGpsTransport,
  createNativeGpsUpload,
  measureNativeGps,
  verifyNativeGpsPositions,
} from "./lib/recovery-native-gps-load.mjs";
import {
  capacityWorkerPlan,
  dispatchCapacityRound,
} from "./lib/recovery-capacity-workers.mjs";
import {
  checkedCapacityAuth,
  createCapacityLogin,
} from "./lib/recovery-capacity-auth.mjs";
import { sendRecoveryProbe } from "./lib/recovery-broadcast-readiness.mjs";
import {
  channelFailureCode,
  withRealtimeStartupRetry,
} from "./lib/recovery-api-diagnostics.mjs";
import { calculateSchemaFingerprint } from "./lib/schema-fingerprint.mjs";
import { recoveryPolicyQuery } from "./lib/recovery-runtime-catalog.mjs";
import { assertRecoveryRealtimePartitions } from "./lib/recovery-realtime-readiness.mjs";
import { createRecoveryGpsComparison, recoveryGpsComparisonPlan, sampleRecoveryGpsDatabase, sampleRecoveryGpsSql, classifyRecoveryGpsStage, resetRecoveryGpsWindow } from "./lib/recovery-native-gps-comparison.mjs";
import { runRecoveryDirectGpsComparison, directGpsPlan } from "./lib/recovery-direct-gps-comparison.mjs";
const { createClient } = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
)("@supabase/supabase-js");
const buses = Number(process.env.SAFEBUS_CAPACITY_BUSES);
const workload = process.env.SAFEBUS_CAPACITY_WORKLOAD ?? "combined";
const gpsCompare = workload === "android_gps_compare";
const directCompare = workload === "android_gps_direct_compare";
const directPlan = directCompare && [100, 500, 10000].includes(buses) ? directGpsPlan(buses) : null;
const directTimingRun = directPlan?.measurementOnly === true;
const scaledDirectRun = directCompare && (buses === 500 || directTimingRun);
const nativeGpsOnly = workload === "android_gps" || gpsCompare || directCompare;
const sustainedGpsCompare = gpsCompare && buses === 100;
const comparisonPlan = gpsCompare && [10, 100].includes(buses) ? recoveryGpsComparisonPlan(buses) : null;
const largeNativeRun = nativeGpsOnly && buses === 5000;
const driverOnlyFixtures = largeNativeRun || directTimingRun;
const loginIntervalMs = driverOnlyFixtures ? 250 : 2100;
const run = `${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
const scope = {
  run,
  buses,
  tenantIds: [randomUUID(), randomUUID()],
  emails: Array.from(
    { length: capacityAccountCount(buses) },
    (_, i) => `capacity-load-${run}-${i}@example.test`,
  ),
};
const evidence = {
  releaseSha: process.env.SAFEBUS_RELEASE_SHA,
  ...(process.env.SAFEBUS_RECOVERY_CANDIDATE === "true"
    ? { preMergeCandidate: true, dispatcherSha: process.env.GITHUB_SHA }
    : {}),
  runId: run,
  target: "deladookciebwvqojhkv",
  requestedBuses: buses,
  workload,
  startedAt: new Date().toISOString(),
  stages: [],
  workers: [],
  cleanupVerified: false,
  authSetup: {
    rateLimitRetries: 0,
    retryWaitMs: 0,
    minimumLoginIntervalMs: loginIntervalMs,
  },
  capacityQualified: false,
  limitations: nativeGpsOnly
    ? [
        "Android GPS API only; guardian maps, alerts and physical devices are outside this probe.",
      ]
    : [
        "Exploratory browser-session GPS; native device ingestion and offline replay not exercised.",
        "50 eligible guardians on one bus only; not 50 guardians per fleet bus.",
        "Internal notification audience/inbox only; no push or email provider delivery.",
        "Node workers invoke installed functions; not a pg_cron scheduler qualification.",
        "No eight-hour soak, fleet-wide viewer load, or commercial launch certification.",
      ],
};
const stop = new AbortController();
let deadlineReached = false;
let db,
  monitorDb,
  admin,
  connected = false,
  armed = false,
  stage = "preflight",
  workers = [],
  workerTasks = [],
  workerStop = false,
  workerError = null,
  gpsComparison = null;
const accounts = [],
  fleet = [],
  viewers = [],
  channels = [];
let hintCount = 0;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => stop.abort());
const deadline = setTimeout(
  () => {
    deadlineReached = true;
    stop.abort();
  },
  (directTimingRun ? 210 : largeNativeRun ? 160 : scaledDirectRun ? 65 : sustainedGpsCompare ? 55 : 35) * 60 * 1000,
);
const checked = checkedCapacityAuth;
const loginAccount = createCapacityLogin({
  signal: stop.signal,
  minimumIntervalMs: loginIntervalMs,
  onRetry: ({ backoffMs }) => {
    evidence.authSetup.rateLimitRetries++;
    evidence.authSetup.retryWaitMs += backoffMs;
  },
});
const safeFetch = (input, init) =>
  capacityFetch(input, init, { origin: RECOVERY_AUTH_URL });
const workloadFetch = (input, init) =>
  capacityFetch(input, init, {
    origin: RECOVERY_AUTH_URL,
    signal: stop.signal,
  });
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: { fetch: safeFetch },
};
const assertRunning = () => {
  if (workerError) throw workerError;
  if (stop.signal.aborted) throw Error("CAPACITY_STOP_REQUESTED");
};
const safeCode = (e) =>
  /^[A-Z][A-Z0-9_]{3,65}$/.test(e?.message ?? "")
    ? e.message
    : /^[A-Z0-9]{5}$/.test(e?.code ?? "")
      ? e.code
      : "UNCLASSIFIED_FAILURE";
function phaseComplete(name) {
  (evidence.setupMilestones ??= {})[name] = new Date().toISOString();
  console.log(`Recovery setup complete: ${name}.`);
}
try {
  assertCapacityScope(scope);
  if (
    !["combined", "android_gps", "android_gps_compare", "android_gps_direct_compare"].includes(workload) ||
    (directCompare && !directPlan) ||
    (buses === 10000 && !directTimingRun) ||
    (!nativeGpsOnly && buses === 5000) ||
    (gpsCompare && !comparisonPlan)
  )
    throw Error("CAPACITY_WORKLOAD_INVALID");
  assertRecoveryCapacityCheckout(process.env.SAFEBUS_RELEASE_SHA);
  if (
    process.env.GITHUB_REF !== "refs/heads/main" ||
    process.env.SAFEBUS_CAPACITY_CONFIRM !==
      (largeNativeRun ? "RUN_RECOVERY_CAPACITY_5000" :
        gpsCompare ? comparisonPlan.confirmation : directCompare ? directPlan.confirmation : "RUN_RECOVERY_CAPACITY")
  )
    throw Error("CAPACITY_WORKFLOW_REQUIRED");
  const url = new URL(process.env.SAFEBUS_CAPACITY_DATABASE_URL);
  if (
    url.pathname !== "/postgres" ||
    (url.port || "5432") !== "5432" ||
    url.search ||
    url.hash ||
    !url.password
  )
    throw Error("CAPACITY_SESSION_CONNECTION_REQUIRED");
  assertRecoveryAuthKeys(
    process.env.SAFEBUS_CAPACITY_AUTH_SECRET,
    process.env.SAFEBUS_CAPACITY_PUBLISHABLE_KEY,
  );
  const binding = createEnvironmentBinding({
    environment: "staging",
    databaseUrl: url.toString(),
    supabaseUrl: RECOVERY_AUTH_URL,
  });
  const connect = async (name) => {
    const c = verifiedDatabaseClient(
      url.toString(),
      process.env.SAFEBUS_CAPACITY_DATABASE_CA_CERT,
      name,
    );
    try {
      await c.connect();
      await c.query("set statement_timeout='8s';set lock_timeout='1s'");
      return c;
    } catch (error) {
      await c.end().catch(() => {});
      throw error;
    }
  };
  db = await connect("safebus-capacity-control");
  connected = true;
  await assertEnvironmentIdentity(db, binding);
  if (
    !(
      await db.query(
        "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy',0)) locked",
      )
    ).rows[0].locked
  )
    throw Error("CAPACITY_DEPLOYMENT_BUSY");
  await capacityQuarantine(db);
  for (const table of [
    "auth.users",
    "auth.sessions",
    "cron.job",
    "vault.secrets",
    "storage.objects",
    "public.tenants",
    ...capacityTables.map((t) => "public." + t),
    "safebus_private.notification_audience_queue",
    "safebus_private.driver_tracking_state",
  ])
    if ((await db.query(`select 1 from ${table} limit 1`)).rowCount)
      throw Error("CAPACITY_NONEMPTY_BASELINE");
  if (
    (
      await db.query(
        "select 1 from pg_trigger where tgrelid in ('auth.users'::regclass,'auth.sessions'::regclass) and not tgisinternal",
      )
    ).rowCount
  )
    throw Error("CAPACITY_AUTH_TRIGGER_DRIFT");
  await db.query("set search_path=pg_catalog");
  if (
    JSON.stringify((await db.query(recoveryPolicyQuery)).rows) !==
    JSON.stringify(
      JSON.parse(
        await fs.readFile(
          "tests/capacity/recovery-runtime-policies.json",
          "utf8",
        ),
      ),
    )
  )
    throw Error("CAPACITY_POLICY_DRIFT");
  const hook = (
    await db.query(
      "select setting from pg_db_role_setting s join pg_roles r on r.oid=s.setrole cross join lateral unnest(s.setconfig) setting where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%'",
    )
  ).rows;
  if (
    hook.length !== 1 ||
    hook[0].setting !==
      "pgrst.db_pre_request=safebus_private.enforce_active_api_session"
  )
    throw Error("CAPACITY_HOOK_DRIFT");
  const settings = await safeFetch(RECOVERY_AUTH_URL + "/auth/v1/settings", {
    headers: { apikey: process.env.SAFEBUS_CAPACITY_PUBLISHABLE_KEY },
  });
  if (!settings.ok) throw Error("CAPACITY_SETTINGS_FAILED");
  const config = await settings.json();
  if (
    config.disable_signup !== true ||
    config.external?.email !== true ||
    config.external?.phone === true
  )
    throw Error("CAPACITY_AUTH_NOT_ISOLATED");
  // Android GPS-only does not run Realtime dispatch workers; keep it available
  // for isolating ingestion bottlenecks even when managed partitions are stale.
  // The combined workload must have live provider partitions before setup.
  if (!nativeGpsOnly) {
    evidence.realtimePartitionReadiness = await assertRecoveryRealtimePartitions(db);
  }
  evidence.schemaFingerprint = await calculateSchemaFingerprint(db);
  evidence.database = (
    await db.query(
      "select version() version,current_setting('max_connections')::int max_connections,pg_database_size(current_database()) bytes",
    )
  ).rows[0];
  admin = createClient(
    RECOVERY_AUTH_URL,
    process.env.SAFEBUS_CAPACITY_AUTH_SECRET,
    options,
  );
  checked(await admin.auth.admin.listUsers({ page: 1, perPage: 1 }));
  armed = true;
  for (let i = 0; i < 2; i++)
    await db.query(
      "insert into public.tenants(id,name,type) values($1,$2,'demo')",
      [scope.tenantIds[i], `Capacity Load ${run} ${i + 1}`],
    );
  stage = "accounts";
  for (let i = 0; i < scope.emails.length; i++) {
    assertRunning();
    stage = `account-create-${i}`;
    const email = scope.emails[i],
      password = `Ca9!${randomBytes(32).toString("base64url")}`;
    const user = checked(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { safebus_capacity_run: run },
      }),
    ).user;
    if (!user?.id) throw Error("CAPACITY_AUTH_FAILED");
    const role = i < buses ? "driver" : "guardian";
    const tenantIndex = largeNativeRun || (directCompare && i < buses)
      ? i % 2
      : Number(i === scope.emails.length - 1);
    const tenant = scope.tenantIds[tenantIndex];
    stage = `account-profile-${i}`;
    await db.query(
      "insert into public.profiles(id,tenant_id,full_name,first_name,last_name,email,role,status) values($1,$2,'Capacity Synthetic','Capacity','Synthetic',$3,$4,'active')",
      [user.id, tenant, email, role],
    );
    const client = createClient(
      RECOVERY_AUTH_URL,
      process.env.SAFEBUS_CAPACITY_PUBLISHABLE_KEY,
      {
        ...options,
        global: { fetch: workloadFetch },
      },
    );
    const a = { id: user.id, email, client, tenant };
    accounts.push(a);
    stage = `account-login-${i}`;
    if (largeNativeRun || scaledDirectRun) a.password = password;
    else await signInAccount(a, password);
  }
  if (largeNativeRun || scaledDirectRun) phaseComplete("accounts-created");
  stage = "fixtures";
  for (let i = 0; i < 2; i++)
    await seedCapacityTenant(db, scope, i, accounts[largeNativeRun || directCompare ? i : 0].id);
  const nativeDrivers = [];
  if (largeNativeRun || scaledDirectRun) {
    await seedCapacityFleetInLanes({
      tenants: accounts.slice(0, buses).map((account) => account.tenant),
      connect,
      assertRunning,
      seed: async (connection, i) => {
        const account = accounts[i];
        const bus = await seedCapacityBus(
          connection,
          account.tenant,
          account.id,
          i,
        );
        if (scaledDirectRun) fleet[i] = bus;
        nativeDrivers[i] = await seedCapacityNativeDevice(
          connection,
          bus,
          account,
        );
      },
    });
    phaseComplete("buses-and-devices-created");
  } else {
    for (let i = 0; i < buses; i++) {
      assertRunning();
      stage = `fixture-bus-${i}`;
      fleet.push(
        await seedCapacityBus(db, accounts[i].tenant, accounts[i].id, i),
      );
    }
  }
  if (!driverOnlyFixtures) {
    for (let i = 0; i < 50; i++) {
      stage = `fixture-guardian-${i}`;
      const a = accounts[buses + i];
      Object.assign(a, await seedCapacityGuardian(db, fleet[0], a, i));
      viewers.push(a);
    }
    stage = "fixture-unlinked-guardian";
    const outsider = accounts.at(-1);
    await db.query(
      "insert into public.guardians(tenant_id,profile_id,full_name,first_name,last_name,email) values($1,$2,'Capacity Unlinked','Capacity','Unlinked',$3)",
      [outsider.tenant, outsider.id, outsider.email],
    );
  }
  if (nativeGpsOnly && !largeNativeRun && !scaledDirectRun) {
    stage = "android-device-fixtures";
    for (let i = 0; i < buses; i++) {
      assertRunning();
      nativeDrivers.push(
        await seedCapacityNativeDevice(db, fleet[i], accounts[i]),
      );
    }
  }
  stage = "cleanup-rehearsal";
  await cleanupCapacity(db, scope, true);
  if (largeNativeRun || scaledDirectRun) {
    phaseComplete("cleanup-rehearsed");
    for (const [index, account] of accounts.entries()) {
      stage = `account-login-${index}`;
      if (scaledDirectRun && index >= buses) { delete account.password; continue; }
      await signInAccount(account, account.password);
      delete account.password;
      nativeDrivers[index].accessToken = account.token;
    }
    phaseComplete("driver-sign-ins-complete");
    stage = "android-session-window";
    const expiresAfter = Date.now() + 300000;
    if (
      accounts.slice(0,buses).some(
        (account) =>
          !Number.isFinite(account.expiresAt) ||
          account.expiresAt < expiresAfter,
      )
    )
      throw Error("CAPACITY_AUTH_SESSION_WINDOW");
  }
  if (!scaledDirectRun) await db.query(
    "grant usage on schema public,safebus_private to authenticated",
  );
  if (gpsCompare) {
    stage = "gps-comparison-preflight";
    if (sustainedGpsCompare) {
      // No JWT renewal during measured traffic; allow the entire A-B-A plus margin.
      const expiresAfter = Date.now() + comparisonPlan.phaseDurationMs * 3 + 180000;
      if (accounts.slice(0, buses).some(account =>
        !Number.isFinite(account.expiresAt) || account.expiresAt < expiresAfter))
        throw Error("CAPACITY_AUTH_SESSION_WINDOW");
    }
    if (sustainedGpsCompare) {
      monitorDb = await connect("safebus-capacity-gps-monitor");
      await assertEnvironmentIdentity(monitorDb, binding);
    }
    gpsComparison = await createRecoveryGpsComparison(db);
    evidence.nativeGpsComparison = { ...gpsComparison.evidence, plan: comparisonPlan, restored: false };
    await runNativeGps(nativeDrivers, { phase: "baseline_before", sequenceOffset: 0 });
    stage = "gps-comparison-install";
    evidence.nativeGpsComparison.optimized = await gpsComparison.install();
    await delay(3000, undefined, { signal: stop.signal });
    await runNativeGps(nativeDrivers, { phase: "optimized", sequenceOffset: comparisonPlan.phaseSequenceSpan });
    stage = "gps-comparison-restore";
    await gpsComparison.restore();
    evidence.nativeGpsComparison.restored = true;
    await delay(3000, undefined, { signal: stop.signal });
    await runNativeGps(nativeDrivers, { phase: "baseline_after", sequenceOffset: comparisonPlan.phaseSequenceSpan * 2 });
    if (sustainedGpsCompare) {
      const measured = evidence.nativeGpsStages;
      evidence.nativeGpsComparison.completedAllStages = measured.length === 6;
      evidence.nativeGpsComparison.allStagesPassed = measured.length === 6 && measured.every(s => s.passed);
      if (!evidence.nativeGpsComparison.allStagesPassed) {
        stage = "gps-comparison-performance";
        throw Error("CAPACITY_GPS_COMPARISON_PERFORMANCE");
      }
    }
  } else if (directCompare) {
    stage = "direct-gps-comparison";
    const remainingSessionMs = (directTimingRun ? 5 : scaledDirectRun ? 20 : 15) * 60 * 1000;
    if (accounts.slice(0,buses).some(a => !Number.isFinite(a.expiresAt) || a.expiresAt < Date.now() + remainingSessionMs))
      throw Error("CAPACITY_AUTH_SESSION_WINDOW");
    evidence.directGpsComparison = { plan: directPlan, windows: [], restored: false, capacityQualified: false };
    await runRecoveryDirectGpsComparison({
      db, scope, drivers: nativeDrivers, plan: directPlan, evidence: evidence.directGpsComparison,
      connect: async name => {
        const c = await connect(name);
        try { await assertEnvironmentIdentity(c,binding); return c; }
        catch(e) { await c.end().catch(()=>{}); throw e; }
      },
      auth: createClient(RECOVERY_AUTH_URL,process.env.SAFEBUS_CAPACITY_PUBLISHABLE_KEY,
        {...options,global:{fetch:workloadFetch}}).auth,
      publishableKey: process.env.SAFEBUS_CAPACITY_PUBLISHABLE_KEY,
      signal: stop.signal,
    });
  } else if (nativeGpsOnly) await runNativeGps(nativeDrivers);
  else await runCombined(connect);
  evidence.exploratoryPassed = true;
} catch (e) {
  evidence.exploratoryPassed = false;
  evidence.failedStage = stage;
  evidence.failureCode = deadlineReached
    ? "CAPACITY_SETUP_OR_WORKLOAD_DEADLINE"
    : safeCode(e);
  if (/^[a-z_][a-z0-9_]{0,79}$/.test(e.constraint ?? ""))
    evidence.failedConstraint = e.constraint;
  process.exitCode = 1;
  console.error(
    `Recovery capacity stopped at stage=${stage}; code=${evidence.failureCode}; provider details omitted.`,
  );
} finally {
  workerStop = true;
  stop.abort();
  // Restore the original function before synthetic cleanup and schema checks,
  // including if an HTTPS measurement failed. This is Recovery ONLY.
  if (monitorDb) await monitorDb.end().catch(() => {});
  if (connected && gpsComparison) {
    try {
      await db.query('rollback').catch(() => {});
      await gpsComparison.restore();
      evidence.nativeGpsComparison.restored = true;
    } catch {
      evidence.nativeGpsComparison.restoreFailureCode = 'CAPACITY_GPS_RESTORE_FAILED';
      process.exitCode = 1;
      console.error('Recovery GPS restoration failed; isolated target requires review.');
    }
  }
  await disconnectCapacityClients(accounts);
  await Promise.allSettled(workerTasks);
  for (const w of workers) await w.end().catch(() => {});
  if (connected && armed) {
    try {
      await quarantineCapacity(db);
      await cleanupCapacity(db, scope);
      const owned = (
        await db.query(
          "select id from auth.users where raw_app_meta_data->>'safebus_capacity_run'=$1 and email=any($2::text[])",
          [run, scope.emails],
        )
      ).rows;
      for (const a of owned) checked(await admin.auth.admin.deleteUser(a.id));
      if (
        (await db.query("select 1 from auth.users limit 1")).rowCount ||
        (await db.query("select 1 from auth.sessions limit 1")).rowCount
      )
        throw Error("CAPACITY_AUTH_CLEANUP");
      await capacityQuarantine(db);
      if ((await calculateSchemaFingerprint(db)) !== evidence.schemaFingerprint)
        throw Error("CAPACITY_SCHEMA_CHANGED");
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
  await fs.mkdir(".safebus-release/recovery-capacity", { recursive: true });
  await fs.writeFile(
    ".safebus-release/recovery-capacity/evidence.json",
    JSON.stringify(evidence, null, 2),
  );
}
async function signInAccount(account, password) {
  const login = await loginAccount(() =>
    account.client.auth.signInWithPassword({ email: account.email, password }),
  );
  if (login.user?.id !== account.id || !login.session?.access_token)
    throw Error("CAPACITY_LOGIN_MISMATCH");
  account.token = login.session.access_token;
  account.expiresAt = login.session.expires_at * 1000;
}
async function runNativeGps(drivers, { phase = null, sequenceOffset = 0 } = {}) {
  const transport = createNativeGpsTransport();
  try {
    const upload = createNativeGpsUpload(
      process.env.SAFEBUS_CAPACITY_PUBLISHABLE_KEY,
      transport.fetch,
    );
    stage = "android-driver-scope";
    const wrongDriver = { ...drivers[0], accessToken: drivers[1].accessToken };
    try {
      await upload(
        wrongDriver,
        1,
        new Date().toISOString(),
        capacityGpsLatitude(1),
        stop.signal,
      );
      throw Error("CAPACITY_DRIVER_SCOPE");
    } catch (error) {
      if (error.message !== "NATIVE_GPS_HTTP_403") throw error;
    }
    transport.takeMetrics();
    evidence.nativeGpsStages ??= [];
    const rounds = phase ? comparisonPlan.rounds : 10;
    for (const [index, pattern] of ["staggered", "synchronized"].entries()) {
      stage = "android-gps-" + (phase ?? "default") + "-" + pattern;
      // Start the second wave on a fresh collection interval for every device.
      if (index) await delay(3000, undefined, { signal: stop.signal });
      if (sustainedGpsCompare) {
        // No measured request is in flight when resetting. Quarantine before
        // touching synthetic state and keep all application triggers enabled.
        await quarantineCapacity(db);
        await resetRecoveryGpsWindow(db, scope, drivers.map(d => d.tripId));
        await db.query("grant usage on schema public,safebus_private to authenticated");
        assertRunning();
      }
      const databaseSamples = [];
      let sampleTask = null;
      let sampleTimer = null;
      let sampleErrors = 0;
      let sqlBefore = null;
      let sqlAfter = null;
      const sample = async () => {
        try { databaseSamples.push(await sampleRecoveryGpsDatabase(monitorDb)); }
        catch { sampleErrors++; }
      };
      if (sustainedGpsCompare) {
        sqlBefore = await sampleRecoveryGpsSql(monitorDb);
        await sample();
        sampleTimer = setInterval(() => {
          if (!sampleTask) sampleTask = sample().finally(() => { sampleTask = null; });
        }, 1000);
      }
      let result;
      const measuredAt = performance.now();
      try {
        result = await measureNativeGps({
        drivers: drivers.map((driver) => ({
          ...driver,
          lastSequence: sequenceOffset + index * rounds,
        })),
        rounds,
        pattern,
        upload,
        verifyPositions: (latest) => verifyNativeGpsPositions(db, latest),
        signal: stop.signal,
        maxInFlight: buses * 2,
        queueBusySlots: sustainedGpsCompare,
        });
      } finally {
        if (sampleTimer) clearInterval(sampleTimer);
        if (sampleTask) await sampleTask;
        if (sustainedGpsCompare) {
          await sample();
          sqlAfter = await sampleRecoveryGpsSql(monitorDb);
        }
      }
      result.elapsedMs = performance.now() - measuredAt;
      if (sustainedGpsCompare) {
        result.databaseSamples = databaseSamples;
        result.databaseSampleErrors = sampleErrors;
        result.sqlCounters = { before: sqlBefore, after: sqlAfter };
      }
      result.transport = transport.takeMetrics();
      if (phase) result.phase = phase;
      if (sustainedGpsCompare) result.classification = classifyRecoveryGpsStage(result);
      evidence.nativeGpsStages.push(result);
      console.log(
        `Android GPS stage: phase=${phase ?? "default"}; pattern=${pattern}; planned=${result.planned}; sent=${result.offered}; accepted=${result.accepted}; late=${result.late}; device_backpressure=${result.deviceBackpressure}; busy_in_flight=${result.busyInFlight}; busy_cooldown=${result.busyCooldown}; unsent_cancelled=${result.cancelledBeforeSend}; max_queue_delay_ms=${result.maxQueueDelayMs.toFixed(1)}; p99_ms=${result.latencyMs.p99?.toFixed(1) ?? "unavailable"}; final_positions_matched=${result.reconciled}; transport=${JSON.stringify(result.transport)}; errors=${JSON.stringify(result.errors)}`,
      );
      if (sustainedGpsCompare && (sampleErrors || databaseSamples.length < 2))
        throw Error("CAPACITY_GPS_DATABASE_STATS");
      if (sustainedGpsCompare && result.classification === "fatal")
        throw Error("CAPACITY_ANDROID_GPS_FAILED");
      if (!result.passed) {
        if (!sustainedGpsCompare || result.classification !== "performance_failed")
          throw Error("CAPACITY_ANDROID_GPS_FAILED");
        console.log("Recovery comparison records performance failure; drained and reconciled, continuing diagnostic only.");
      }
    }
  } finally {
    transport.close();
  }
}
async function runCombined(connect) {
  stage = "shared-bus-correctness";
  await gps(0, 0);
  await readMap(viewers[0], 0);
  const foreign = checked(
    await accounts
      .at(-1)
      .client.rpc("get_guardian_bus_service_lines", {
        p_bus_number: fleet[0].busNumber,
      }),
  );
  if (!Array.isArray(foreign) || foreign.length !== 0)
    throw Error("CAPACITY_SCOPE_DISCLOSURE");
  const wrong = await accounts[1].client.rpc("update_bus_tracking_location", {
    p_tracking_token: fleet[0].token,
    p_latitude: 52.26,
    p_longitude: -113.81,
  });
  if (wrong.error?.code !== "42501") throw Error("CAPACITY_DRIVER_SCOPE");
  // Initialize managed replication and confirm real receipt before timing load.
  const probeNonce = randomUUID();
  let probeReceived = false;
  const probe = await join(
    viewers[0],
    `safebus:notifications:${viewers[0].id}`,
    "capacity_probe",
    (p) => {
      if (p?.nonce === probeNonce) probeReceived = true;
    },
  );
  await sendRecoveryProbe(db, {
    nonce: probeNonce,
    topic: `safebus:notifications:${viewers[0].id}`,
  });
  for (let i = 0; i < 40 && !probeReceived; i++) await delay(200);
  if (!probeReceived) throw Error("CAPACITY_PROBE_DELIVERY");
  await viewers[0].client.removeChannel(probe);
  stage = "workers";
  for (let i = 0; i < 6; i++)
    workers.push(await connect("safebus-capacity-worker"));
  // Requeue the real trip-start source after guardian assignments exist.
  await db.query(
    "select safebus_private.notify_trip_audience($1,$2,$3,'trip_started','trip_status','info','driver_trip',$2,now())",
    [fleet[0].tenant, fleet[0].trip, fleet[0].route],
  );
  workerTasks = workers.map((w, index) => workerLoop(w, index));
  stage = "notification-only";
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
  if (evidence.notificationRecipientsWithoutMaps !== 50)
    throw Error("CAPACITY_NOTIFICATION_LOSS");
  stage = "map-viewers";
  for (const a of viewers)
    await join(a, fleet[0].topic, "tracking_changed", () => {
      hintCount++;
      a.hints = (a.hints ?? 0) + 1;
    });
  await measure(10, 30000, true);
  if (viewers.some((a) => !a.hints)) throw Error("CAPACITY_TRACKING_DELIVERY");
  evidence.sharedTrackingHintsReceived = hintCount;
  // One deliberately disconnected viewer must rejoin and read a fresh snapshot.
  const reconnectStarted = performance.now();
  await viewers[0].client.removeAllChannels();
  let rejoinedHint = false;
  await join(viewers[0], fleet[0].topic, "tracking_changed", () => {
    rejoinedHint = true;
  });
  await gps(0, 100);
  for (let i = 0; i < 40 && !rejoinedHint; i++) await delay(200);
  if (!rejoinedHint) throw Error("CAPACITY_REJOIN_DELIVERY");
  await readMap(viewers[0], 0);
  evidence.rejoinMs = performance.now() - reconnectStarted;
  for (const a of viewers) await a.client.removeAllChannels();
  if (buses >= 100) {
    stage = "ramp-100";
    await measure(100, 60000, false);
  }
  if (buses === 500) {
    stage = "ramp-500";
    await measure(500, 300000, false);
  }
  stage = "drain";
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
  if (!drained) throw Error("CAPACITY_DRAIN_TIMEOUT");
}
async function gps(i, sequence) {
  assertRunning();
  const latitude = capacityGpsLatitude(sequence);
  const r = await accounts[i].client.rpc("update_bus_tracking_location", {
    p_tracking_token: fleet[i].token,
    p_latitude: latitude,
    p_longitude: -113.81,
    p_accuracy_m: 5,
    p_speed_mps: 5,
  });
  if (r.error) throw Error("CAPACITY_GPS_REJECTED");
  assertCapacityGpsAck(r.data, fleet[i].trip, latitude);
  fleet[i].lastLatitude = latitude;
}
async function readMap(a, sequence) {
  const r = await a.client.rpc("get_guardian_bus_visibility_v2");
  if (r.error) {
    evidence.mapErrorCode = /^[A-Z0-9]{5}$/.test(r.error.code ?? "")
      ? r.error.code
      : "UNCLASSIFIED_FAILURE";
    throw Error("CAPACITY_MAP_REJECTED");
  }
  if (
    !Array.isArray(r.data) ||
    r.data.length !== 1 ||
    r.data[0].student_id !== a.student ||
    r.data[0].bus_number !== fleet[0].busNumber
  )
    throw Error("CAPACITY_SCOPE_DISCLOSURE");
  if (!r.data[0].has_active_trip || r.data[0].location_state !== "fresh")
    throw Error("CAPACITY_STALE_MAP");
  if (sequence % 5 === 0) {
    const detail = await a.client.rpc("get_guardian_bus_service_lines", {
      p_bus_number: fleet[0].busNumber,
    });
    if (
      detail.error ||
      detail.data?.length !== 1 ||
      detail.data[0].trackingTopic !== fleet[0].topic
    )
      throw Error("CAPACITY_SHARED_READ");
  }
}
async function join(a, topic, event, onPayload) {
  await a.client.realtime.setAuth(a.token);
  return withRealtimeStartupRetry(async () => {
    const ch = a.client
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event }, ({ payload }) => onPayload(payload));
    let timer;
    try {
      await new Promise((resolve, reject) => {
        timer = setTimeout(
          () => reject(Error("CAPACITY_CHANNEL_TIMEOUT")),
          12000,
        );
        ch.subscribe((status, error) => {
          if (status === "SUBSCRIBED") resolve();
          if (status === "CHANNEL_ERROR")
            reject(Error(channelFailureCode(error)));
          if (status === "TIMED_OUT") reject(Error("CAPACITY_CHANNEL_TIMEOUT"));
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
  const plan = capacityWorkerPlan(index);
  const metrics = {
    index,
    kind: plan.kind,
    periodMs: plan.periodMs,
    rounds: 0,
    dispatches: 0,
    maxClientElapsedMs: 0,
    maxServerElapsedMs: 0,
    overruns: 0,
  };
  evidence.workers.push(metrics);
  try {
    while (!workerStop && !stop.signal.aborted) {
      const start = performance.now();
      let result;
      try {
        result = await dispatchCapacityRound(w, plan);
      } finally {
        metrics.maxClientElapsedMs = Math.max(
          metrics.maxClientElapsedMs,
          performance.now() - start,
        );
      }
      const elapsed = performance.now() - start;
      metrics.rounds++;
      metrics.dispatches += result.dispatches;
      metrics.maxClientElapsedMs = Math.max(
        metrics.maxClientElapsedMs,
        elapsed,
      );
      metrics.maxServerElapsedMs = Math.max(
        metrics.maxServerElapsedMs,
        result.serverElapsedMs,
      );
      if (elapsed > plan.periodMs) {
        metrics.overruns++;
        throw Error("CAPACITY_WORKER_SCHEDULER_LIMIT");
      }
      while (
        !workerStop &&
        !stop.signal.aborted &&
        performance.now() - start < plan.periodMs
      )
        await delay(Math.min(250, plan.periodMs - (performance.now() - start)));
    }
  } catch (e) {
    metrics.failureCode = safeCode(e);
    workerError ??= e;
    console.error(
      `Capacity worker stopped: kind=${plan.kind}; index=${index}; period_ms=${plan.periodMs}; max_client_ms=${metrics.maxClientElapsedMs.toFixed(1)}; max_server_ms=${metrics.maxServerElapsedMs.toFixed(1)}; code=${metrics.failureCode}`,
    );
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
    (select count(*)::int from pg_stat_activity where datname=current_database()) connections,
    (select coalesce(jsonb_agg(to_jsonb(activity)), '[]'::jsonb) from (
      select state,wait_event_type,wait_event,count(*)::int sessions,
        max(case when state='active' then greatest(0,extract(epoch from clock_timestamp()-query_start)) end)::float8 oldest_active_seconds
      from pg_stat_activity where datname=current_database()
      group by state,wait_event_type,wait_event
    ) activity) activity`)
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
          throw Error("CAPACITY_RESOURCE_STOP");
        await delay(1000);
      }
    } catch (e) {
      workerError ??= e;
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
          workerError ??= e;
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
            workerError ??= e;
            stop.abort();
          },
        }),
      );
    result = await Promise.all(tasks);
  } finally {
    monitoring = false;
    await monitor;
    evidence.stages.push({
      buses: count,
      mapViewers: maps ? 50 : 0,
      eligibleGuardians: 50,
      durationMs,
      requests: result ?? null,
      queueSamples: samples,
    });
  }
  assertRunning();
  if (result.some((r) => !r.passed)) throw Error("CAPACITY_LOAD_THRESHOLD");
  const locations = (
    await db.query(
      "select driver_trip_id,latitude from public.driver_trip_current_locations where driver_trip_id=any($1::uuid[])",
      [fleet.slice(0, count).map((b) => b.trip)],
    )
  ).rows;
  if (
    locations.length !== count ||
    locations.some(
      (row) =>
        fleet.find((b) => b.trip === row.driver_trip_id)?.lastLatitude !==
        row.latitude,
    )
  )
    throw Error("CAPACITY_ACK_RECONCILIATION");
  console.log(
    `Capacity stage completed: buses=${count}; map_viewers=${maps ? 50 : 0}; gps_p99_ms=${result[0].latencyMs.p99.toFixed(1)}`,
  );
}
