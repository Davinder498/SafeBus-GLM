import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  estimateScenario,
  estimateViewerSensitivity,
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
  assert.equal(peak.gpsUpdatesPerOperatingDay, 96000000);
  assert.equal(Object.hasOwn(peak, 'rawHistoryEventsAtDraftRetention'), false);
  near(peak.workItemsPerSecond.guardianRead, (88000 * 2) / 15);
  near(peak.realtimeInvalidationsPerSecondUncoalesced, 88000 / 3);
  near(peak.guardianReadsPerSecondWithUncoalescedInvalidations, 70400);
  near(peak.guardianMapReadsPerSecondWithLocationHints, 35200);
  near(peak.workItemsPerSecond.adminRead, (2000 * 2) / 15);
  near(peak.hottestTenantGpsEventsPerSecond, 2000 / 3);
  near(peak.baselineWorkItemsPerSecond, 22167);
  near(estimateScenario(small(), 'pilot').hottestTenantGpsEventsPerSecond, 1);
});

test('reconnect estimates account for captured offline fixes and extra recovery arrivals', () => {
  const result = estimateScenario(workload, 'reconnect');
  assert.equal(result.reconnectBacklogEvents, 1500000);
  assert.equal(result.workItemsPerSecond.catchUp, 5000);
  near(result.baselineWorkItemsPerSecond, 27167);
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
      w.assumptions.historyDaysForSensitivity = 30;
    },
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
  assert.equal(report.scenarios.length, 6);
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

test('viewer-mix samples preserve dispatcher and reconnect rates alongside notification demand', () => {
  const historical = sampledRates(workload, 'reconnect', 0.004);
  const light = sampledRates(workload, 'reconnect', 0.004, 'light_viewing');
  const noViewers = sampledRates(workload, 'reconnect', 0.004, 'notification_only');
  for (const kind of ['gps', 'adminRead', 'login', 'catchUp']) {
    near(light[kind], historical[kind]);
    near(noViewers[kind], historical[kind]);
  }
  near(light.guardianMapPosition, (50_000 / 3) * 0.004);
  near(light.guardianMapDetail, (50_000 / 15) * 0.004);
  near(light.guardianSummary, ((50_000 * 2) / 30) * 0.004);
  near(light.notification, ((500_000 * 2 * 3) / 900) * 0.004);
  assert.equal(noViewers.notification, light.notification);
  assert.equal(noViewers.guardianMapPosition + noViewers.guardianMapDetail + noViewers.guardianSummary, 0);
  assert.throws(() => sampledRates(workload, 'pilot', 0.004, 'light_viewing'), /Viewer mix is unavailable/);
  assert.throws(() => sampledRates(workload, 'peak', 0.004, 'unknown'), /Viewer mix is unavailable/);
});

test('local CLI delivers a bounded sample of the current viewer mix', () => {
  const report = JSON.parse(execFileSync(process.execPath, [
    'scripts/capacity-workload.mjs', '--mode=simulate', '--scenario=normal',
    '--viewer-mix=light_viewing', '--scale=0.001', '--duration-seconds=1',
  ], { encoding: 'utf8' }));
  assert.equal(report.viewerMix, 'light_viewing');
  assert.equal(report.generatorPassed, true);
  assert.equal(report.applicationCapacityVerified, false);
  assert.equal(report.providerDeliveriesTested, false);
  assert.equal(report.fixtureReceived.guardianMapPosition, 16);
  assert.equal(report.fixtureReceived.guardianMapDetail, 3);
  assert.equal(report.fixtureReceived.guardianSummary, 3);
  assert.equal(report.fixtureReceived.notification, 3);
  assert.deepEqual(report.fixtureReceived, report.scheduled);
});

test('local generator enforces duration, rate, request count, in-flight and target boundaries', async () => {
  for (const options of [
    { scenario: 'peak', scale: 1 },
    { scenario: 'peak', scale: 1, viewerMix: 'light_viewing' },
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
    scale: 0.5,
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
    ['--mode=model', '--viewer-mix=light_viewing'],
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

test('5,000-bus stage and home traffic are modeled without claiming qualification', async () => {
  const mid = estimateScenario(workload, 'fleet5000');
  assert.equal(mid.population.buses, 5000);
  near(mid.workItemsPerSecond.gps, 5000 / 3);
  near(mid.guardianHomeReadsPerSecondIfAllGuardiansOnHome, (44500 * 2) / 30);
  const peak = estimateScenario(workload, 'peak');
  near(peak.guardianHomeReadsPerSecondIfAllGuardiansOnHome, (88000 * 2) / 30);
  const closure = JSON.parse(await fs.readFile('config/commercial-launch-closure.json', 'utf8'));
  assert.equal(closure.scope.buses, workload.target.activeBuses);
  assert.equal(closure.scope.minimumTargetBuses, mid.population.buses);
  assert.equal(closure.scope.commercialLaunchApproved, false);
  const hook = await fs.readFile('apps/web/src/hooks/useGuardianHomeData.ts', 'utf8');
  assert.match(hook, /intervalMs: 30_000/);
  assert.match(hook, /liveMinIntervalMs: 30_000/);
});

test('viewer mixes preserve notification demand at 500, 5000 and 10000 buses', () => {
  const rows = estimateViewerSensitivity(workload);
  assert.equal(rows.length, 15);
  for (const buses of [500, 5000, 10000]) {
    const group = rows.filter((row) => row.buses === buses);
    const none = group.find((row) => row.mix === 'notification_only');
    assert.equal(none.notificationOnlyGuardians, buses * 50);
    assert.equal(none.guardianRpcsPerSecond.total, 0);
    assert.equal(none.proposedViewerReconnectsPerSecond, 0);
    assert.ok(none.notificationChannelDeliveriesPerSecond > 0);
    for (const row of group) {
      assert.equal(
        row.eligibleGuardians,
        row.mapViewers + row.summaryViewers + row.notificationOnlyGuardians,
      );
      assert.equal(
        row.notificationChannelDeliveriesPerSecond,
        none.notificationChannelDeliveriesPerSecond,
      );
      near(row.gpsUpdatesPerSecond, buses / 3);
    }
    near(
      group.find((row) => row.mix === 'all_on_map').guardianRpcsPerSecond.total,
      buses * 50 * (1 / 3 + 1 / 15),
    );
    near(
      group.find((row) => row.mix === 'all_on_summary').guardianRpcsPerSecond.total,
      (buses * 50 * 2) / 30,
    );
  }
  const light = rows.find((row) => row.buses === 10000 && row.mix === 'light_viewing');
  near(light.guardianRpcsPerSecond.total, 23333.33333333333);
  assert.equal(light.reconnectBacklogEvents, 1500000);
  assert.equal(planningReport(workload).viewerSensitivity.length, 15);
});

test('viewer workload rejects invalid or overlapping populations and hidden target settings', () => {
  for (const mutate of [
    (v) => {
      v.mixes[0].mapShare = 0.8;
      v.mixes[0].summaryShare = 0.8;
    },
    (v) => {
      v.mixes[0].mapShare = NaN;
    },
    (v) => {
      v.mixes[0].name = v.mixes[1].name;
    },
    (v) => {
      v.mapPositionSeconds = 0;
    },
    (v) => {
      v.buses = [500, 500, 10000];
    },
    (v) => {
      v.enabledChannelsPerGuardian = 4;
    },
    (v) => {
      v.url = 'https://example.invalid';
    },
  ]) {
    const altered = structuredClone(workload);
    mutate(altered.viewerSensitivity);
    assert.throws(() => estimateViewerSensitivity(altered));
  }
});

test('current viewer cadence model follows source budgets and keeps independent notification assumptions', async () => {
  const position = await fs.readFile('apps/web/src/hooks/useGuardianLiveBusLocations.ts', 'utf8');
  const detail = await fs.readFile('apps/web/src/pages/GuardianLiveMapPage.tsx', 'utf8');
  const home = await fs.readFile('apps/web/src/hooks/useGuardianHomeData.ts', 'utf8');
  const v = workload.viewerSensitivity;
  assert.equal(
    v.mapPositionSeconds * 1000,
    Number(
      position.match(/liveMinIntervalMs: surface === 'map' \? ([\d_]+)/)[1].replaceAll('_', ''),
    ),
  );
  assert.equal(
    v.mapDetailSeconds * 1000,
    Number(detail.match(/liveMinIntervalMs: ([\d_]+)/)[1].replaceAll('_', '')),
  );
  assert.equal(
    v.summarySeconds * 1000,
    Number(home.match(/liveMinIntervalMs: ([\d_]+)/)[1].replaceAll('_', '')),
  );
  assert.equal(v.summaryRpcsPerRefresh, 2);
  const altered = structuredClone(workload);
  altered.viewerSensitivity.eventsPerGuardianPerWave = 4;
  assert.equal(
    estimateViewerSensitivity(altered)[0].notificationChannelDeliveriesPerSecond,
    estimateViewerSensitivity(workload)[0].notificationChannelDeliveriesPerSecond * 2,
  );
});
