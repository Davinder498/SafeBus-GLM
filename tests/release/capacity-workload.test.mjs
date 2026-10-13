import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  estimateScenario,
  planningReport,
  runLocalSimulation,
  sampledRates,
  seededRandom,
  validateWorkload,
} from '../../scripts/lib/capacity-workload.mjs';

const workload = JSON.parse(await fs.readFile('docs/governance/capacity-workload.json', 'utf8'));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001);
const small = () => {
  const value = structuredClone(workload);
  value.scenarios.pilot = {
    buses: 6,
    tenants: 2,
    concurrentUsers: 20,
    admins: 2,
    loginsPerMinute: 60,
    notificationDeliveriesPerSecond: 4,
  };
  return value;
};

test('planning target reflects the requested fleet, registered accounts, tenants and selected concurrency', () => {
  assert.deepEqual(workload.target, {
    registeredUsers: 1000000,
    tenants: 2000,
    activeBuses: 10000,
    peakConcurrentUsers: 100000,
  });
  const peak = estimateScenario(workload, 'peak');
  assert.equal(peak.population.activeGuardians, 88000);
  assert.equal(
    peak.population.activeDrivers + peak.population.admins + peak.population.activeGuardians,
    100000,
  );
  assert.equal(peak.registeredUsersForFutureDataset, 1000000);
});

test('calculations include current GPS cadence, polling, invalidations and tenant skew', () => {
  const peak = estimateScenario(workload, 'peak');
  near(peak.workItemsPerSecond.gps, 10000 / 3);
  assert.equal(peak.gpsHistoryEventsPerOperatingDay, 96000000);
  assert.equal(peak.rawHistoryEventsAtDraftRetention, 2880000000);
  near(peak.workItemsPerSecond.guardianRead, (88000 * 2) / 15);
  near(peak.realtimeInvalidationsPerSecondUncoalesced, 88000 / 3);
  near(peak.guardianReadsPerSecondWithUncoalescedInvalidations, 70400);
  near(peak.hottestTenantGpsEventsPerSecond, 2000 / 3);
  near(peak.baselineWorkItemsPerSecond, 15466.6666666667);
  near(estimateScenario(small(), 'pilot').hottestTenantGpsEventsPerSecond, 1);
});

test('reconnect estimates account for captured offline fixes and extra recovery arrivals', () => {
  const result = estimateScenario(workload, 'reconnect');
  assert.equal(result.reconnectBacklogEvents, 1500000);
  assert.equal(result.workItemsPerSecond.catchUp, 5000);
  near(result.baselineWorkItemsPerSecond, 20466.6666666667);
  near(result.reconnectJoinsPerSecondIfAllUsersRejoin, 100000 / 300);
});

test('source cadence and guardian polling are reflected instead of trusting stale documentation', async () => {
  const native = await fs.readFile(
    'apps/mobile/android/app/src/main/java/com/safebusalberta/app/tracking/TrackingCadence.java',
    'utf8',
  );
  const guardian = await fs.readFile('apps/web/src/hooks/useVerifiedGuardianData.ts', 'utf8');
  const gps = Number(
    native.match(/ACTIVE_TRIP_INTERVAL_MS\s*=\s*([\d_]+)L/)[1].replaceAll('_', ''),
  );
  const poll = Number(guardian.match(/REFRESH_INTERVAL_MS\s*=\s*([\d_]+)/)[1].replaceAll('_', ''));
  assert.equal(workload.assumptions.gpsSeconds * 1000, gps);
  assert.equal(workload.assumptions.guardianPollSeconds * 1000, poll);
});

test('invalid, inconsistent or caller-added workload settings fail before a fixture starts', () => {
  for (const change of [
    (w) => {
      w.assumptions.gpsSeconds = 0;
    },
    (w) => {
      w.assumptions.largestTenantShare = NaN;
    },
    (w) => {
      w.scenarios.peak.concurrentUsers = 99999;
    },
    (w) => {
      w.scenarios.pilot.admins = 1000;
    },
    (w) => {
      w.target.url = 'https://example.invalid';
    },
    (w) => {
      w.planningOnly = false;
    },
  ]) {
    const altered = structuredClone(workload);
    change(altered);
    assert.throws(() => validateWorkload(altered));
  }
  assert.throws(() => estimateScenario(workload, '__proto__'), /Unknown/);
});

test('planning reports remain estimates without capacity or hosted security certification', () => {
  const report = planningReport(workload);
  assert.equal(report.scenarios.length, 5);
  assert.equal(report.evidenceType, 'workload_estimate');
  assert.equal(report.applicationCapacityVerified, false);
  assert.equal(report.hostedAuthRlsVerified, false);
  const sampled = sampledRates(workload, 'peak', 0.01);
  near(sampled.gps, 100 / 3);
  assert.throws(() => sampledRates(workload, 'peak', Infinity));
});

test('tenant distribution uses a reproducible seed without changing system randomness', () => {
  const sequence = (seed) => {
    const rng = seededRandom(seed);
    return Array.from({ length: 30 }, rng);
  };
  assert.deepEqual(sequence(42), sequence(42));
  assert.notDeepEqual(sequence(42), sequence(43));
  assert.ok(sequence(42).every((value) => value >= 0 && value < 1));
  assert.throws(() => seededRandom(0));
});

test('local generator enforces duration, rate, request count, in-flight and target boundaries', async () => {
  for (const options of [
    { scenario: 'peak', scale: 1 },
    { durationMs: 30001 },
    { maxInFlight: 33 },
    { scale: 0 },
    { target: 'https://example.invalid' },
    { scale: 1, durationMs: 30000 },
  ])
    await assert.rejects(runLocalSimulation(workload, options));
});

test('healthy local arrivals are fully accounted for and do not become application capacity evidence', async () => {
  const result = await runLocalSimulation(small(), { scale: 1, durationMs: 750 });
  assert.equal(result.generatorPassed, true);
  assert.equal(result.totals.planned, 5);
  assert.equal(result.totals.sent, result.totals.accepted);
  assert.equal(result.totals.unsent + result.totals.clientErrors + result.totals.rejected, 0);
  assert.deepEqual(result.scheduled, result.offered);
  assert.deepEqual(result.offered, result.fixtureReceived);
  assert.equal(result.applicationCapacityVerified, false);
  assert.equal(result.hostedAuthRlsVerified, false);
  assert.equal(result.datasetSeeded, false);
  assert.equal(result.realtimeTested, false);
  assert.equal(result.target, 'owned-loopback-fixture');
  assert.ok(result.latencyMs.p95 >= result.latencyMs.p50);
});

test('fixture rejection is reported without silent retry or a green generator result', async () => {
  const result = await runLocalSimulation(small(), {
    scale: 1,
    durationMs: 750,
    fixtureRejectEvery: 2,
  });
  assert.equal(result.generatorPassed, false);
  assert.equal(result.totals.rejected, Math.floor(result.totals.sent / 2));
  assert.equal(result.statusCounts[503], result.totals.rejected);
  assert.equal(result.totals.sent, result.totals.planned);
});

test('a slow fixture records unsent open-loop arrivals rather than hiding overload behind a growing queue', async () => {
  const result = await runLocalSimulation(workload, {
    scale: 1,
    durationMs: 200,
    fixtureDelayMs: 250,
    maxInFlight: 1,
  });
  assert.equal(result.generatorPassed, false);
  assert.ok(result.totals.unsent > 0);
  assert.equal(result.totals.unsent + result.totals.sent, result.totals.planned);
  assert.equal(result.inFlightPeak, 1);
});

test('CLI refuses hosted URLs, credentials and ambiguous overrides without echoing supplied values', () => {
  for (const args of [
    ['--target=https://user:private-secret@example.invalid'],
    ['--url=http://localhost:9999'],
    ['--headers=private-secret'],
    ['--mode=simulate', '--scale=NaN'],
    ['--mode=model', '--mode=simulate'],
  ]) {
    const result = spawnSync(process.execPath, ['scripts/capacity-workload.mjs', ...args], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.doesNotMatch(result.stderr, /private-secret|example\.invalid/);
  }
});

test('CLI exits nonzero on fixture rejection while retaining honest failure accounting', () => {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/capacity-workload.mjs',
      '--mode=simulate',
      '--duration-seconds=1',
      '--fixture-reject-every=1',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.generatorPassed, false);
  assert.equal(report.totals.accepted, 0);
  assert.equal(report.totals.rejected, report.totals.sent);
  assert.equal(report.applicationCapacityVerified, false);
});

test('local CLI ignores database configuration and ambient HTTP proxy settings', () => {
  const result = JSON.parse(
    execFileSync(
      process.execPath,
      ['scripts/capacity-workload.mjs', '--mode=simulate', '--duration-seconds=1'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          SAFEBUS_DATABASE_URL: 'postgres://example.invalid/no-database',
          VITE_SUPABASE_URL: 'https://example.invalid',
          HTTP_PROXY: 'http://127.0.0.1:9',
          HTTPS_PROXY: 'http://127.0.0.1:9',
          NODE_USE_ENV_PROXY: '1',
        },
      },
    ),
  );
  assert.equal(result.generatorPassed, true);
  assert.equal(result.applicationCapacityVerified, false);
  assert.equal(result.target, 'owned-loopback-fixture');
});
