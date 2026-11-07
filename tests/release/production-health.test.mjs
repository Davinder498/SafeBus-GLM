import assert from 'node:assert/strict';
import test from 'node:test';
import { runProductionHealth } from '../../scripts/lib/production-health.mjs';

const securityHeaders = {
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(self), geolocation=(self), microphone=()',
};

function htmlResponse(status = 200) {
  return new Response('<!doctype html><title>SafeBus</title>', {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...securityHeaders },
  });
}

function mapResponse() {
  return Response.json({
    tileUrl: 'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=redacted',
    attribution: 'Powered by Geoapify, OpenStreetMap contributors',
  });
}

test('production monitor checks only the public shell, login route, and map configuration', async () => {
  const requests = [];
  const result = await runProductionHealth({
    origin: 'https://bussafe.netlify.app',
    retries: 0,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return url.endsWith('/map-tile-config') ? mapResponse() : htmlResponse();
    },
  });

  assert.equal(result.result, 'healthy');
  assert.deepEqual(
    result.checks.map((check) => check.name),
    ['landing_page', 'spa_login_route', 'map_configuration'],
  );
  assert.deepEqual(
    requests.map((request) => request.url),
    [
      'https://bussafe.netlify.app/',
      'https://bussafe.netlify.app/login',
      'https://bussafe.netlify.app/.netlify/functions/map-tile-config',
    ],
  );
  assert.ok(requests.every((request) => request.options.redirect === 'error'));
});

test('production monitor retries a transient response and records the attempt count', async () => {
  let landingAttempts = 0;
  const result = await runProductionHealth({
    origin: 'https://bussafe.netlify.app',
    retries: 1,
    fetchImpl: async (url) => {
      if (url === 'https://bussafe.netlify.app/' && landingAttempts++ === 0) {
        return htmlResponse(503);
      }
      return url.endsWith('/map-tile-config') ? mapResponse() : htmlResponse();
    },
  });

  assert.equal(result.checks[0].attempts, 2);
});

test('production monitor never includes a response body in a failure', async () => {
  const secretBody = 'private-provider-payload-should-not-be-logged';
  await assert.rejects(
    runProductionHealth({
      origin: 'https://bussafe.netlify.app',
      retries: 0,
      fetchImpl: async () => new Response(secretBody, { status: 503 }),
    }),
    (error) => {
      assert.match(error.message, /landing_page: Landing page returned HTTP 503/);
      assert.doesNotMatch(error.message, new RegExp(secretBody));
      return true;
    },
  );
});

test('production monitor rejects credentials, paths, and non-HTTPS origins', async () => {
  for (const origin of [
    'http://bussafe.netlify.app',
    'https://user:pass@bussafe.netlify.app',
    'https://bussafe.netlify.app/login',
    'https://bussafe.netlify.app/?token=secret',
  ]) {
    await assert.rejects(runProductionHealth({ origin, retries: 0 }), /SAFEBUS_MONITOR_ORIGIN/);
  }
});

test('cadence watchdog detects stale, failed, missing and malformed schedules without provider content', async () => {
  const { checkMonitorCadence, MAX_MONITOR_GAP_MS } = await import('../../scripts/lib/monitor-cadence.mjs');
  const now = Date.parse('2026-11-05T08:00:00Z');
  const success = { id: 123, event: 'schedule', head_branch: 'main', created_at: new Date(now - 15*60_000).toISOString(), status: 'completed', conclusion: 'success' };
  const check = (runs) => checkMonitorCadence({ now, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.github.com/repos/Davinder498/SafeBus-GLM/actions/workflows/production-health.yml/runs?event=schedule&per_page=10');
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    assert.equal(options.headers.authorization, undefined);
    return Response.json({ workflow_runs: runs, ignored_secret: 'private-value' });
  } });
  const previous = { ...success, id: 122, created_at: new Date(now - 30*60_000).toISOString() };
  const healthy = await check([previous, success]);
  assert.equal(healthy.runId, 123);
  assert.equal(healthy.observedScheduledRuns, 2);
  assert.equal(healthy.maximumObservedGapMinutes, 15);
  await assert.rejects(check([success]), /INSUFFICIENT_HISTORY/);
  await assert.rejects(check([{ ...success, created_at: new Date(now-MAX_MONITOR_GAP_MS-1).toISOString() }]), /STALE/);
  await assert.rejects(check([{ ...success, id: 124, created_at: new Date(now).toISOString(), conclusion: 'failure' }, success]), /NOT_SUCCESSFUL/);
  await assert.rejects(check([{ ...success, status: 'in_progress', conclusion: null }]), /NOT_SUCCESSFUL/);
  await assert.rejects(check([{ ...success, event: 'workflow_dispatch' }]), /NO_SCHEDULED_RUN/);
  await assert.rejects(check([{ ...success, head_branch: 'preview' }]), /NO_SCHEDULED_RUN/);
  await assert.rejects(check([{ ...success, created_at: 'not-a-date' }]), /INVALID_RESPONSE/);
  await assert.rejects(check([{ ...success, created_at: new Date(now+120_000).toISOString() }]), /INVALID_RESPONSE/);
  // A fresh green run after several missed slots cannot conceal the gap.
  const fresh = { ...success, id: 125, created_at: new Date(now - 2*60_000).toISOString() };
  const old = { ...success, id: 124, created_at: new Date(now - 4*60*60_000).toISOString() };
  await assert.rejects(check([fresh, old]), /MONITOR_CADENCE_GAP/);
  // Manual dispatches cannot fill missing scheduled-run history.
  await assert.rejects(check([fresh, { ...success, id: 999, event: 'workflow_dispatch' }, old]), /MONITOR_CADENCE_GAP/);
  // The latest success also must not conceal an earlier scheduled failure.
  await assert.rejects(check([fresh, { ...previous, conclusion: 'failure' }]), /MONITOR_CADENCE_HISTORY_NOT_SUCCESSFUL/);
});

test('cadence errors with bad HTTP or JSON remain sanitized', async () => {
  const { checkMonitorCadence } = await import('../../scripts/lib/monitor-cadence.mjs');
  for (const fetchImpl of [
    async () => { throw new Error('private-value'); },
    async () => new Response('private-value', { status: 403 }),
    async () => new Response('private-value'),
  ]) {
    await assert.rejects(checkMonitorCadence({fetchImpl}), (error) => !error.message.includes('private-value') && /^MONITOR_CADENCE_/.test(error.message));
  }
});

test('scheduled production monitoring skips previews and checks health and cadence independently', async () => {
  const { runScheduledHealth } = await import('../../apps/web/netlify/functions/production-health-scheduled.mjs');
  let healthCalls = 0; let cadenceCalls = 0; const logs = [];
  const options = {
    health: async (input) => { healthCalls++; assert.deepEqual(input, {origin:'https://safebus.kids',retries:0,timeoutMs:6000}); return {result:'healthy'}; },
    cadence: async () => { cadenceCalls++; return {result:'healthy'}; },
    log: (value) => logs.push(JSON.parse(value)),
  };
  await assert.rejects(runScheduledHealth(options), /MONITOR_DEPLOY_CONTEXT_MISSING/);
  for (const deploy of [{context:'deploy-preview',published:true}, {context:'production',published:false}]) {
    assert.equal((await runScheduledHealth({...options,deploy})).result, 'skipped');
  }
  assert.equal(healthCalls,0); assert.equal(cadenceCalls,0);
  assert.equal((await runScheduledHealth({...options,deploy:{context:'production',published:true}})).result,'healthy');
  assert.equal(healthCalls,1); assert.equal(cadenceCalls,1); assert.equal(logs[0].result,'healthy');
});

test('scheduled failures expose only fixed codes while preserving both independent observations', async () => {
  const { runScheduledHealth } = await import('../../apps/web/netlify/functions/production-health-scheduled.mjs');
  const logs=[]; let healthChecked=false; let alertChecks;
  await assert.rejects(runScheduledHealth({
    deploy:{context:'production',published:true},
    health:async()=>{healthChecked=true;throw new Error('secret-map-key');},
    cadence:async()=>{throw new Error('MONITOR_CADENCE_PRIVATE_VALUE');},
    notify:async({checks})=>{alertChecks=checks;return {result:'accepted'};},
    log:(line)=>logs.push(line),
  }), {message:'PRODUCTION_HEALTH_OBSERVATION_FAILED'});
  assert.equal(healthChecked,true);
  assert.deepEqual(alertChecks.map(check=>check.check),['public_health','github_cadence']);
  assert.equal(JSON.parse(logs[1]).result,'provider_accepted');
  assert.equal(logs[0].includes('secret-map-key'),false);assert.equal(logs[0].includes('PRIVATE_VALUE'),false);
  assert.equal(JSON.parse(logs[0]).checks.length,2);
});

test('fulfilled but malformed health results fail closed without logging provider content', async () => {
  const { runScheduledHealth } = await import('../../apps/web/netlify/functions/production-health-scheduled.mjs');
  const deploy = { context: 'production', published: true };
  for (const which of ['health', 'cadence']) {
    const logs = []; let notified;
    const opts = {
      deploy,
      health: async () => ({ result: 'healthy' }),
      cadence: async () => ({ result: 'healthy' }),
      notify: async ({ checks }) => { notified = checks; return { result: 'accepted' }; },
      log: line => logs.push(line),
    };
    opts[which] = async () => ({ result: 'unhealthy', detail: 'private-provider-token' });
    await assert.rejects(runScheduledHealth(opts), { message: 'PRODUCTION_HEALTH_OBSERVATION_FAILED' });
    const event = JSON.parse(logs[0]);
    const failed = event.checks.filter(item => item.result === 'fail');
    assert.equal(failed.length, 1);
    assert.equal(failed[0].check, which === 'health' ? 'public_health' : 'github_cadence');
    assert.equal(failed[0].code, which === 'health' ? 'PUBLIC_HEALTH_FAILED' : 'MONITOR_CADENCE_INVALID_RESPONSE');
    assert.ok(notified);
    assert.doesNotMatch(logs.join(' '), /private-provider-token/);
  }
});

test('operational monitor requires explicit provider acceptance before logging accepted delivery', async () => {
  const { runScheduledHealth } = await import('../../apps/web/netlify/functions/production-health-scheduled.mjs');
  const logs = [];
  await assert.rejects(runScheduledHealth({
    deploy: { context: 'production', published: true },
    health: async () => ({ result: 'healthy' }),
    cadence: async () => { throw new Error('MONITOR_CADENCE_GAP'); },
    notify: async () => ({ result: 'not_needed', detail: 'private-provider-message' }),
    log: line => logs.push(line),
  }), { message: 'PRODUCTION_HEALTH_OBSERVATION_FAILED' });
  const event = JSON.parse(logs[0]);
  assert.deepEqual(event.checks, [
    { check: 'public_health', result: 'pass' },
    { check: 'github_cadence', result: 'fail', code: 'MONITOR_CADENCE_GAP' },
  ]);
  assert.deepEqual(JSON.parse(logs[1]), {
    event: 'production_health_alert', result: 'failed', code: 'MONITOR_ALERT_DELIVERY_FAILED',
  });
  assert.doesNotMatch(logs.join(' '), /private-provider-message/);
});

test('staged application signals do not run before explicit production activation', async () => {
  const { runScheduledHealth } = await import('../../apps/web/netlify/functions/production-health-scheduled.mjs');
  let calls = 0;
  const log = [];
  const result = await runScheduledHealth({
    deploy: { context: 'production', published: true },
    applicationEnabled: false,
    applicationSignals: async () => { calls++; return []; },
    health: async () => ({ result: 'healthy' }),
    cadence: async () => ({ result: 'healthy' }),
    log: (line) => log.push(JSON.parse(line)),
  });
  assert.equal(result.result, 'healthy');
  assert.equal(calls, 0);
  assert.equal(log[0].checks.length, 2);
});

test('activated application monitoring distinguishes idle trips from failure and alerts on fixed categories', async () => {
  const { runScheduledHealth } = await import('../../apps/web/netlify/functions/production-health-scheduled.mjs');
  let sent;
  const events = [];
  await assert.rejects(
    runScheduledHealth({
      deploy: { context: 'production', published: true },
      applicationEnabled: true,
      health: async () => ({ result: 'healthy' }),
      cadence: async () => ({ result: 'healthy' }),
      applicationSignals: async () => [
        { check: 'app_database', result: 'pass' },
        { check: 'app_gps_freshness', result: 'pass', mode: 'idle' },
        { check: 'app_email_backlog', result: 'pass' },
        { check: 'app_push_backlog', result: 'fail', code: 'PUSH_QUEUE_OLD' },
        { check: 'app_delivery_failures', result: 'pass' },
        { check: 'app_map_tiles', result: 'pass' },
      ],
      notify: async ({ checks }) => { sent = checks; return { result: 'accepted' }; },
      log: (line) => events.push(JSON.parse(line)),
    }),
    { message: 'PRODUCTION_HEALTH_OBSERVATION_FAILED' },
  );
  assert.equal(sent.length, 8);
  assert.deepEqual(sent.filter((x) => x.result === 'fail'), [
    { check: 'app_push_backlog', result: 'fail', code: 'PUSH_QUEUE_OLD' },
  ]);
  assert.equal(events[0].checks.length, 8);
  assert.equal(events[0].checks[3].mode, 'idle');
  assert.equal(events[1].result, 'provider_accepted');
});

test('application monitor returns fixed failures for unexpected or rejected provider output', async () => {
  const { runScheduledHealth } = await import('../../apps/web/netlify/functions/production-health-scheduled.mjs');
  for (const applicationSignals of [
    async () => ({ result: 'healthy', student: 'private-identity' }),
    async () => { throw new Error('secret database response and token'); },
  ]) {
    const log = [];
    let checks;
    await assert.rejects(runScheduledHealth({
      deploy: { context: 'production', published: true },
      applicationEnabled: true,
      health: async () => ({ result: 'healthy' }),
      cadence: async () => ({ result: 'healthy' }),
      applicationSignals,
      notify: async ({ checks: observed }) => { checks = observed; return { result: 'accepted' }; },
      log: line => log.push(line),
    }), { message: 'PRODUCTION_HEALTH_OBSERVATION_FAILED' });
    assert.equal(checks.length, 8);
    assert.equal(checks.filter(x => x.result === 'fail').length, 6);
    assert.doesNotMatch(log.join(' '), /private-identity|secret database response|token/);
  }
});

test('observation-only mode records real backend failures but sends no application alerts', async () => {
  const { runScheduledHealth } = await import('../../apps/web/netlify/functions/production-health-scheduled.mjs');
  let alerts = 0;
  const logs = [];
  const observed = await runScheduledHealth({
    deploy: { context: 'production', published: true },
    applicationMode: 'observe',
    health: async () => ({ result: 'healthy' }),
    cadence: async () => ({ result: 'healthy' }),
    applicationSignals: async () => [
      { check: 'app_database', result: 'fail', code: 'DATABASE_CHECK_UNAVAILABLE' },
      { check: 'app_gps_freshness', result: 'pass', mode: 'idle' },
      { check: 'app_email_backlog', result: 'pass' },
      { check: 'app_push_backlog', result: 'pass' },
      { check: 'app_delivery_failures', result: 'pass' },
      { check: 'app_map_tiles', result: 'pass' },
    ],
    notify: async () => { alerts++; return { result: 'accepted' }; },
    log: line => logs.push(JSON.parse(line)),
  });
  assert.deepEqual(observed, { result: 'healthy', applicationObservation: 'degraded' });
  assert.equal(alerts, 0);
  assert.deepEqual(logs.map(x => x.event), [
    'production_application_signals_observation', 'production_health_observation',
  ]);
  assert.deepEqual(logs[0].checks[0], {
    check: 'app_database', result: 'fail', code: 'DATABASE_CHECK_UNAVAILABLE',
  });
  assert.equal(logs[0].mode, 'observe');
  assert.deepEqual(logs[1].checks, [
    { check: 'public_health', result: 'pass' },
    { check: 'github_cadence', result: 'pass' },
  ]);
});

test('observation-only mode does not hide real public-health failures or their alerts', async () => {
  const { runScheduledHealth } = await import('../../apps/web/netlify/functions/production-health-scheduled.mjs');
  let notified;
  const logs = [];
  await assert.rejects(runScheduledHealth({
    deploy: { context: 'production', published: true },
    applicationMode: 'observe',
    health: async () => { throw new Error('provider-secret-content'); },
    cadence: async () => ({ result: 'healthy' }),
    applicationSignals: async () => { throw new Error('private-student-GPS-and-token'); },
    notify: async ({ checks }) => { notified = checks; return { result: 'accepted' }; },
    log: line => logs.push(line),
  }), { message: 'PRODUCTION_HEALTH_OBSERVATION_FAILED' });
  assert.deepEqual(notified, [
    { check: 'public_health', result: 'fail', code: 'PUBLIC_HEALTH_FAILED' },
    { check: 'github_cadence', result: 'pass' },
  ]);
  const app = JSON.parse(logs[0]);
  assert.equal(app.result, 'degraded');
  assert.equal(app.checks.length, 6);
  assert.doesNotMatch(logs.join(' '), /private-student-GPS-and-token|provider-secret-content/);
});

test('application mode must be explicit and only recognized values are accepted', async () => {
  const { runScheduledHealth } = await import('../../apps/web/netlify/functions/production-health-scheduled.mjs');
  let checksCalled = 0;
  await assert.rejects(runScheduledHealth({
    deploy: { context: 'production', published: true },
    applicationMode: 'enable-new-alerts',
    applicationSignals: async () => { checksCalled++; },
  }), { message: 'APP_MONITOR_MODE_INVALID' });
  assert.equal(checksCalled, 0);
  assert.equal((await runScheduledHealth({
    deploy: { context: 'deploy-preview', published: true },
    applicationMode: 'observe',
    applicationSignals: async () => { checksCalled++; },
  })).result, 'skipped');
  assert.equal(checksCalled, 0);
});
