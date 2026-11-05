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
  assert.equal((await check([success])).runId, 123);
  await assert.rejects(check([{ ...success, created_at: new Date(now-MAX_MONITOR_GAP_MS-1).toISOString() }]), /STALE/);
  await assert.rejects(check([{ ...success, id: 124, created_at: new Date(now).toISOString(), conclusion: 'failure' }, success]), /NOT_SUCCESSFUL/);
  await assert.rejects(check([{ ...success, status: 'in_progress', conclusion: null }]), /NOT_SUCCESSFUL/);
  await assert.rejects(check([{ ...success, event: 'workflow_dispatch' }]), /NO_SCHEDULED_RUN/);
  await assert.rejects(check([{ ...success, head_branch: 'preview' }]), /NO_SCHEDULED_RUN/);
  await assert.rejects(check([{ ...success, created_at: 'not-a-date' }]), /INVALID_RESPONSE/);
  await assert.rejects(check([{ ...success, created_at: new Date(now+120_000).toISOString() }]), /INVALID_RESPONSE/);
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
    notify:async({checks})=>{alertChecks=checks;},
    log:(line)=>logs.push(line),
  }), {message:'PRODUCTION_HEALTH_OBSERVATION_FAILED'});
  assert.equal(healthChecked,true);
  assert.deepEqual(alertChecks.map(check=>check.check),['public_health','github_cadence']);
  assert.equal(JSON.parse(logs[1]).result,'provider_accepted');
  assert.equal(logs[0].includes('secret-map-key'),false);assert.equal(logs[0].includes('PRIVATE_VALUE'),false);
  assert.equal(JSON.parse(logs[0]).checks.length,2);
});
