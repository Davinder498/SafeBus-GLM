import { Agent, createServer, request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

const integer = (value, name, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`Invalid ${name}.`);
  return value;
};
const number = (value, name, min, max) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
    throw new Error(`Invalid ${name}.`);
  return value;
};
const shape = (value, keys, name) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== [...keys].sort().join(',')
  )
    throw new Error(`Invalid ${name} fields.`);
};

export function validateWorkload(workload) {
  shape(workload, ['version', 'planningOnly', 'target', 'assumptions', 'scenarios'], 'workload');
  if (workload.version !== 1 || workload.planningOnly !== true)
    throw new Error('Only the planning workload format is supported.');
  const t = workload.target;
  shape(t, ['registeredUsers', 'tenants', 'activeBuses', 'peakConcurrentUsers'], 'target');
  integer(t.registeredUsers, 'registered users', 1, 10000000);
  integer(t.tenants, 'tenants', 1, 100000);
  integer(t.activeBuses, 'active buses', 1, 100000);
  integer(t.peakConcurrentUsers, 'peak users', 1, t.registeredUsers);
  const a = workload.assumptions;
  shape(
    a,
    [
      'gpsSeconds',
      'guardianPollSeconds',
      'guardianRpcsPerRefresh',
      'adminPollSeconds',
      'adminRpcsPerRefresh',
      'activeHoursPerDay',
      'historyDaysForSensitivity',
      'linkedBusesPerGuardian',
      'largestTenantShare',
      'offlineSeconds',
      'reconnectingBusShare',
      'recoverySeconds',
    ],
    'assumptions',
  );
  for (const key of ['gpsSeconds', 'guardianPollSeconds', 'adminPollSeconds', 'recoverySeconds'])
    integer(a[key], key, 1, 86400);
  for (const key of ['guardianRpcsPerRefresh', 'adminRpcsPerRefresh', 'linkedBusesPerGuardian'])
    integer(a[key], key, 1, 20);
  integer(a.activeHoursPerDay, 'active hours', 1, 24);
  integer(a.historyDaysForSensitivity, 'history sensitivity days', 1, 365);
  integer(a.offlineSeconds, 'offline seconds', 1, 86400);
  number(a.largestTenantShare, 'largest tenant share', 0.01, 1);
  number(a.reconnectingBusShare, 'reconnecting bus share', 0, 1);
  shape(workload.scenarios, ['pilot', 'regional', 'normal', 'peak', 'reconnect'], 'scenarios');
  for (const s of Object.values(workload.scenarios)) {
    shape(
      s,
      [
        'buses',
        'tenants',
        'concurrentUsers',
        'admins',
        'loginsPerMinute',
        'notificationDeliveriesPerSecond',
      ],
      'scenario',
    );
    integer(s.buses, 'scenario buses', 1, t.activeBuses);
    integer(s.tenants, 'scenario tenants', 1, Math.min(s.buses, t.tenants));
    integer(s.concurrentUsers, 'scenario users', s.buses, t.peakConcurrentUsers);
    integer(s.admins, 'scenario admins', 0, s.concurrentUsers - s.buses);
    integer(s.loginsPerMinute, 'login burst', 0, t.registeredUsers);
    integer(s.notificationDeliveriesPerSecond, 'notification deliveries', 0, 1000000);
  }
  for (const name of ['peak', 'reconnect']) {
    const s = workload.scenarios[name];
    if (
      s.buses !== t.activeBuses ||
      s.tenants !== t.tenants ||
      s.concurrentUsers !== t.peakConcurrentUsers
    )
      throw new Error('Peak/reconnect populations must match the planning target.');
  }
  return workload;
}

export function estimateScenario(workload, name) {
  validateWorkload(workload);
  if (!Object.hasOwn(workload.scenarios, name)) throw new Error('Unknown workload scenario.');
  const s = workload.scenarios[name];
  const a = workload.assumptions;
  const guardians = s.concurrentUsers - s.buses - s.admins;
  const backlog =
    name === 'reconnect'
      ? Math.floor(s.buses * a.reconnectingBusShare) * Math.floor(a.offlineSeconds / a.gpsSeconds)
      : 0;
  const rates = {
    gps: s.buses / a.gpsSeconds,
    guardianRead: (guardians * a.guardianRpcsPerRefresh) / a.guardianPollSeconds,
    adminRead: (s.admins * a.adminRpcsPerRefresh) / a.adminPollSeconds,
    login: s.loginsPerMinute / 60,
    notification: s.notificationDeliveriesPerSecond,
    catchUp: backlog / a.recoverySeconds,
  };
  const invalidations = (guardians * a.linkedBusesPerGuardian) / a.gpsSeconds;
  return {
    scenario: name,
    registeredUsersForFutureDataset: workload.target.registeredUsers,
    population: { ...s, activeDrivers: s.buses, activeGuardians: guardians },
    workItemsPerSecond: rates,
    baselineWorkItemsPerSecond: Object.values(rates).reduce((sum, rate) => sum + rate, 0),
    gpsHistoryEventsPerOperatingDay: (s.buses * a.activeHoursPerDay * 3600) / a.gpsSeconds,
    rawHistoryEventsAtDraftRetention:
      ((s.buses * a.activeHoursPerDay * 3600) / a.gpsSeconds) * a.historyDaysForSensitivity,
    realtimeInvalidationsPerSecondUncoalesced: invalidations,
    guardianReadsPerSecondWithUncoalescedInvalidations:
      rates.guardianRead + invalidations * a.guardianRpcsPerRefresh,
    reconnectBacklogEvents: backlog,
    hottestTenantGpsEventsPerSecond: rates.gps * Math.max(a.largestTenantShare, 1 / s.tenants),
    realtimeConnectionsIfEachActiveUserOpensOne: s.concurrentUsers,
    reconnectJoinsPerSecondIfAllUsersRejoin:
      name === 'reconnect' ? s.concurrentUsers / a.recoverySeconds : 0,
  };
}

export function planningReport(workload, name = 'all') {
  validateWorkload(workload);
  const names = name === 'all' ? Object.keys(workload.scenarios) : [name];
  return {
    formatVersion: 1,
    workloadSha256: createHash('sha256').update(JSON.stringify(workload)).digest('hex'),
    evidenceType: 'workload_estimate',
    applicationCapacityVerified: false,
    hostedAuthRlsVerified: false,
    target: workload.target,
    assumptions: workload.assumptions,
    scenarios: names.map((scenario) => estimateScenario(workload, scenario)),
    limitations: [
      'Rates are estimates, not measured API throughput or SQL operation counts.',
      'Registered-user dataset, actual JWT sessions, WebSockets and provider deliveries are not created.',
      'Catch-up is spread over the proposed recovery window; actual native queue burst pacing is not tested.',
      'Invalidation-driven refetch is an uncoalesced upper-bound model, not an observed request rate.',
    ],
  };
}

export function seededRandom(seed) {
  let state = integer(seed, 'seed', 1, 0xffffffff);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

export function sampledRates(workload, name, scale) {
  const estimate = estimateScenario(workload, name);
  number(scale, 'sample scale', 0.00001, 1);
  return Object.fromEntries(
    Object.entries(estimate.workItemsPerSecond).map(([kind, rate]) => [kind, rate * scale]),
  );
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] * 100) / 100;
}

/** Open-loop arrivals are offered even when the fixture is slow. Exhausted
 * in-flight slots are recorded as unsent; there is no hidden retry or queue. */
export async function runLocalSimulation(workload, options = {}) {
  const {
    scenario = 'pilot',
    scale = 0.1,
    seed = 42,
    durationMs = 5000,
    fixtureDelayMs = 0,
    fixtureRejectEvery = 0,
    maxInFlight = 32,
  } = options;
  shape(
    options,
    Object.keys(options).filter((key) =>
      [
        'scenario',
        'scale',
        'seed',
        'durationMs',
        'fixtureDelayMs',
        'fixtureRejectEvery',
        'maxInFlight',
      ].includes(key),
    ),
    'simulator options',
  );
  integer(durationMs, 'duration', 100, 30000);
  integer(fixtureDelayMs, 'fixture delay', 0, 250);
  integer(fixtureRejectEvery, 'fixture rejection interval', 0, 1000);
  integer(maxInFlight, 'in-flight ceiling', 1, 32);
  const random = seededRandom(seed);
  const rates = sampledRates(workload, scenario, scale);
  const scheduled = Object.fromEntries(
    Object.entries(rates).map(([kind, rate]) => [kind, Math.floor((rate * durationMs) / 1000)]),
  );
  const totalRate = Object.values(rates).reduce((sum, rate) => sum + rate, 0);
  const totalPlanned = Object.values(scheduled).reduce((sum, count) => sum + count, 0);
  if (totalRate > 200 || totalPlanned > 5000 || totalPlanned < 1)
    throw new Error(
      'Local simulation requires 1–5000 requests and at most 200 requests/second; reduce scale.',
    );
  const fixtureKinds = new Set(Object.keys(rates));
  const received = Object.fromEntries([...fixtureKinds].map((kind) => [kind, 0]));
  const tenantSlotsSeen = new Set();
  let hotspotRequests = 0;
  let fixtureCount = 0;
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/synthetic-workload') {
      response.writeHead(404).end();
      return;
    }
    try {
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 2048) throw new Error('Oversized synthetic request');
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (
        body.synthetic !== true ||
        !fixtureKinds.has(body.kind) ||
        !Number.isInteger(body.sequence) ||
        !Number.isInteger(body.tenantSlot)
      )
        throw new Error('Invalid synthetic request');
      received[body.kind] += 1;
      tenantSlotsSeen.add(body.tenantSlot);
      if (body.tenantSlot === 0) hotspotRequests += 1;
      const rejected = fixtureRejectEvery > 0 && ++fixtureCount % fixtureRejectEvery === 0;
      if (fixtureDelayMs) await delay(fixtureDelayMs);
      response
        .writeHead(rejected ? 503 : 200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ synthetic: true, accepted: !rejected, sequence: body.sequence }));
    } catch {
      response.writeHead(400).end();
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  // Core HTTP with a literal loopback address bypasses ambient proxy settings.
  // No arbitrary URL, DNS name, redirect following or external adapter exists.
  const agent = new Agent({ keepAlive: true, maxSockets: maxInFlight });
  const inflight = new Set();
  const offered = Object.fromEntries([...fixtureKinds].map((kind) => [kind, 0]));
  const latencies = [];
  const statusCounts = {};
  let sent = 0;
  let unsent = 0;
  let accepted = 0;
  let rejected = 0;
  let clientErrors = 0;
  let inFlightPeak = 0;
  let bytesSent = 0;
  let sequence = 0;
  const startedAt = performance.now();
  const send = (kind) => {
    if (inflight.size >= maxInFlight) {
      unsent += 1;
      return;
    }
    const tenantSlots = workload.scenarios[scenario].tenants;
    const tenantSlot =
      tenantSlots === 1 ||
      random() < Math.max(workload.assumptions.largestTenantShare, 1 / tenantSlots)
        ? 0
        : 1 + Math.floor(random() * (tenantSlots - 1));
    const eventSequence = ++sequence;
    const body = JSON.stringify({ synthetic: true, kind, sequence: eventSequence, tenantSlot });
    sent += 1;
    bytesSent += Buffer.byteLength(body);
    const started = performance.now();
    const task = (async () => {
      try {
        const result = await new Promise((resolve, reject) => {
          const request = httpRequest(
            {
              hostname: '127.0.0.1',
              port: address.port,
              path: '/synthetic-workload',
              method: 'POST',
              agent,
              signal: AbortSignal.timeout(1500),
              headers: {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(body),
              },
            },
            (response) => {
              statusCounts[response.statusCode] = (statusCounts[response.statusCode] ?? 0) + 1;
              const chunks = [];
              let bytes = 0;
              response.on('data', (chunk) => {
                bytes += chunk.length;
                if (bytes > 2048) {
                  response.destroy(new Error('Oversized fixture response'));
                  return;
                }
                chunks.push(chunk);
              });
              response.once('error', reject);
              response.once('end', () => {
                try {
                  resolve({
                    status: response.statusCode,
                    body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
                  });
                } catch {
                  reject(new Error('Invalid fixture response'));
                }
              });
            },
          );
          request.once('error', reject);
          request.end(body);
        });
        if (
          result.status === 200 &&
          result.body.synthetic === true &&
          result.body.accepted === true &&
          result.body.sequence === eventSequence
        )
          accepted += 1;
        else rejected += 1;
      } catch {
        clientErrors += 1;
      } finally {
        latencies.push(performance.now() - started);
      }
    })();
    inflight.add(task);
    inFlightPeak = Math.max(inFlightPeak, inflight.size);
    void task.finally(() => inflight.delete(task));
  };
  try {
    while (true) {
      const elapsed = Math.min(performance.now() - startedAt, durationMs);
      for (const [kind, rate] of Object.entries(rates)) {
        const due = Math.min(scheduled[kind], Math.floor((rate * elapsed) / 1000));
        while (offered[kind] < due) {
          offered[kind] += 1;
          send(kind);
        }
      }
      if (elapsed >= durationMs) break;
      await delay(5);
    }
    await Promise.all([...inflight]);
    const elapsedMs = performance.now() - startedAt;
    return {
      formatVersion: 1,
      workloadSha256: createHash('sha256').update(JSON.stringify(workload)).digest('hex'),
      nodeVersion: process.version,
      evidenceType: 'synthetic_local_http',
      applicationCapacityVerified: false,
      hostedAuthRlsVerified: false,
      datasetSeeded: false,
      realtimeTested: false,
      providerDeliveriesTested: false,
      target: 'owned-loopback-fixture',
      scenario,
      scale,
      seed,
      durationMs,
      fixtureDelayMs,
      fixtureRejectEvery,
      maxInFlight,
      inFlightPeak,
      ratesPerSecond: rates,
      scheduled,
      offered,
      fixtureReceived: received,
      totals: { planned: totalPlanned, sent, unsent, accepted, rejected, clientErrors, bytesSent },
      statusCounts,
      latencyMs: {
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        p99: percentile(latencies, 0.99),
      },
      tenantMix: {
        logicalTenantSlots: workload.scenarios[scenario].tenants,
        distinctTenantSlotsSeen: tenantSlotsSeen.size,
        hotspotRequests,
      },
      dispatchedRequestsPerSecond: sent / (durationMs / 1000),
      completedRequestsPerSecondIncludingDrain:
        (accepted + rejected + clientErrors) / (elapsedMs / 1000),
      drainAndRunElapsedMs: Math.round(elapsedMs),
      generatorPassed:
        unsent === 0 &&
        rejected === 0 &&
        clientErrors === 0 &&
        accepted === totalPlanned &&
        Object.values(received).reduce((sum, count) => sum + count, 0) === sent,
      limitations:
        'Measures synthetic fixture and generator only; cold HTTP requests, no warm-up; excludes process/server setup. Not app throughput, RLS, WebSockets, dataset capacity, device pacing or provider behavior.',
    };
  } finally {
    agent.destroy();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
