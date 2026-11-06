import test from 'node:test';
import assert from 'node:assert/strict';
import { sendMonitorAlerts } from '../../scripts/lib/monitor-alert-email.mjs';
import { runScheduledHealth } from '../../apps/web/netlify/functions/production-health-scheduled.mjs';
import { evaluateGeoapifyQuota, quotaAlertChecks } from '../../scripts/lib/geoapify-quota.mjs';

const now = Date.parse('2026-11-05T09:45:00Z');
const env = { SAFEBUS_EMAIL_PROVIDER_API_KEY: 'test-secret', SAFEBUS_EMAIL_FROM: 'alerts@example.com' };
const checks = [{ check: 'github_cadence', result: 'fail', code: 'MONITOR_CADENCE_STALE', detail: 'secret-response' }];

test('operational alerts use fixed destinations and stable per-check six-hour idempotency', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return Response.json({ id: 'accepted-message' });
  };
  for (const at of [now, now + 15*60_000, Date.parse('2026-11-05T12:00:00Z')]) {
    assert.equal((await sendMonitorAlerts({ checks, env, now: at, fetchImpl })).result, 'accepted');
  }
  const [first, retry, next] = requests;
  assert.equal(first.url, 'https://api.resend.com/emails');
  assert.equal(first.options.method, 'POST');
  assert.equal(first.options.redirect, 'error');
  assert.ok(first.options.signal);
  assert.deepEqual(first.body.to, ['info@safebus.kids']);
  assert.equal(first.body.from, 'SafeBus operations <alerts@example.com>');
  assert.equal(first.body.subject, 'SafeBus alert: scheduled monitoring needs attention');
  assert.equal(first.options.headers['Idempotency-Key'], retry.options.headers['Idempotency-Key']);
  assert.equal(first.options.body, retry.options.body);
  assert.notEqual(first.options.headers['Idempotency-Key'], next.options.headers['Idempotency-Key']);
  assert.equal(first.options.body.includes('secret-response'), false);
  assert.equal(first.options.body.includes('test-secret'), false);
});

test('both independent failures are attempted; duplicate and healthy checks do not add messages', async () => {
  const bodies = [];
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body); bodies.push(body);
    if (body.subject.includes('public health')) throw new Error('private-provider-detail');
    return Response.json({ id: 'accepted' });
  };
  await assert.rejects(sendMonitorAlerts({
    env, now, fetchImpl,
    checks: [...checks, ...checks, { check: 'public_health', result: 'fail' }],
  }), { message: 'MONITOR_ALERT_DELIVERY_FAILED' });
  assert.equal(bodies.length, 2);
  assert.equal((await sendMonitorAlerts({ checks: [{check:'public_health', result:'pass'}], env:{}, fetchImpl })).result, 'not_needed');
  assert.equal(bodies.length, 2);
});

test('missing configuration, invalid input and provider failures stay closed and sanitized', async () => {
  let calls = 0;
  for (const badEnv of [{}, {...env, SAFEBUS_EMAIL_FROM:'Name <alerts@example.com>'}, {...env, SAFEBUS_EMAIL_PROVIDER_API_KEY:'secret\r\nheader'}]) {
    await assert.rejects(sendMonitorAlerts({checks, now, env:badEnv, fetchImpl:async()=>{calls++;}}), {message:'MONITOR_ALERT_CONFIGURATION_MISSING'});
  }
  await assert.rejects(sendMonitorAlerts({checks:[{check:'arbitrary-secret',result:'fail'}],env,now}), {message:'MONITOR_ALERT_INVALID_INPUT'});
  await assert.rejects(sendMonitorAlerts({checks,env,now:NaN}), {message:'MONITOR_ALERT_INVALID_INPUT'});
  assert.equal(calls,0);
  for (const fetchImpl of [
    async()=>new Response('private-response',{status:429}),
    async()=>new Response('private-response',{status:409}),
    async()=>new Response('private-response'),
    async()=>Response.json({}),
    async()=>{throw new Error('private-token');},
  ]) await assert.rejects(sendMonitorAlerts({checks,env,now,fetchImpl}), {message:'MONITOR_ALERT_DELIVERY_FAILED'});
});

test('preview and healthy runs never send mail; alert failure cannot mask observation failure', async () => {
  let alerts=0; const logs=[];
  const options={health:async()=>({result:'healthy'}),cadence:async()=>({result:'healthy'}),notify:async()=>{alerts++;throw new Error('provider-secret');},log:line=>logs.push(line)};
  await runScheduledHealth({...options,deploy:{context:'deploy-preview',published:true}});
  await runScheduledHealth({...options,deploy:{context:'production',published:true}});
  assert.equal(alerts,0);
  await assert.rejects(runScheduledHealth({...options,deploy:{context:'production',published:true},cadence:async()=>{throw new Error('MONITOR_CADENCE_STALE');}}),{message:'PRODUCTION_HEALTH_OBSERVATION_FAILED'});
  assert.equal(alerts,1);
  assert.equal(logs.some(line=>line.includes('provider-secret')),false);
  assert.deepEqual(JSON.parse(logs.at(-1)),{event:'production_health_alert',result:'failed',code:'MONITOR_ALERT_DELIVERY_FAILED'});
});


test('live retention saturation sends fixed minimal content to the existing operations inbox', async () => {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    requests.push({ headers: options.headers, body: JSON.parse(options.body) });
    return Response.json({ id: 'accepted' });
  };
  const input = [{ check: 'retention_backlog', result: 'fail', detail: 'secret GPS payload' }];
  assert.equal((await sendMonitorAlerts({ checks: input, env, now, fetchImpl })).result, 'accepted');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.to, ['info@safebus.kids']);
  assert.equal(requests[0].body.subject, 'SafeBus alert: retention disposal backlog needs attention');
  assert.match(requests[0].headers['Idempotency-Key'], /^safebus-monitor-v1\/retention_backlog\/[0-9]+$/);
  assert.equal(JSON.stringify(requests).includes('secret GPS payload'), false);
  assert.equal(JSON.stringify(requests).includes('test-secret'), true); // Authorization header only, never message body.
  assert.equal(requests[0].body.text.includes('test-secret'), false);
});


test('Geoapify quota evaluation uses full project credits and exact 70/90 boundaries', () => {
  const now = Date.parse('2026-11-06T18:00:00Z');
  const observation = (usedCredits, limitCredits = 3000) => ({
    source: 'geoapify-project-statistics',
    scope: 'project-total',
    usageDate: '2026-11-06',
    usedCredits,
    limitCredits,
  });
  assert.deepEqual(quotaAlertChecks(evaluateGeoapifyQuota(observation(0), { now })), []);
  assert.deepEqual(quotaAlertChecks(evaluateGeoapifyQuota(observation(2099.99), { now })), []);
  assert.deepEqual(quotaAlertChecks(evaluateGeoapifyQuota(observation(2100), { now })), [
    { check: 'geoapify_quota_70', result: 'fail' },
  ]);
  assert.deepEqual(quotaAlertChecks(evaluateGeoapifyQuota(observation(2699.99), { now })), [
    { check: 'geoapify_quota_70', result: 'fail' },
  ]);
  assert.deepEqual(quotaAlertChecks(evaluateGeoapifyQuota(observation(2700), { now })), [
    { check: 'geoapify_quota_90', result: 'fail' },
  ]);
  assert.deepEqual(quotaAlertChecks(evaluateGeoapifyQuota(observation(10000, 10000), { now })), [
    { check: 'geoapify_quota_90', result: 'fail' },
  ]);
  const result = evaluateGeoapifyQuota(observation(3001), { now });
  assert.equal(result.level, 'critical');
  assert.equal(result.percentUsed > 100, true);
});

test('quota assessor fails closed on stale or unverifiable provider statistics', () => {
  const now = Date.parse('2026-11-06T18:00:00Z');
  const valid = {
    source: 'geoapify-project-statistics', scope: 'project-total',
    usageDate: '2026-11-06', usedCredits: 0, limitCredits: 3000,
  };
  for (const modified of [
    { scope: 'api-key' },
    { source: 'estimated-tile-count' },
    { limitCredits: 0 },
    { usedCredits: -1 },
    { usedCredits: '2000' },
    { usedCredits: Infinity },
    { usageDate: '2026-11-01' },
    { usageDate: '2026-11-09' },
    { usageDate: '2026-02-30' },
    { apiKey: 'must-never-enter-secrets' },
  ]) {
    assert.throws(() => evaluateGeoapifyQuota({ ...valid, ...modified }, { now }), /MAP_QUOTA_(INVALID|STALE)/);
  }
  assert.throws(() => evaluateGeoapifyQuota(valid, { now: Number.NaN }), /MAP_QUOTA_INVALID/);
});

test('prepared Geoapify operations alerts contain only fixed subjects and instructions', async () => {
  const sent = [];
  const fetchImpl = async (_url, opts) => {
    sent.push({ headers: opts.headers, payload: JSON.parse(opts.body) });
    return Response.json({ id: 'accepted' });
  };
  for (const check of ['geoapify_quota_70', 'geoapify_quota_90']) {
    assert.equal((await sendMonitorAlerts({
      checks: [{ check, result: 'fail', detail: 'private-key-must-not-appear' }],
      env, now, fetchImpl,
    })).result, 'accepted');
  }
  assert.equal(sent.length, 2);
  for (const entry of sent) {
    assert.deepEqual(entry.payload.to, ['info@safebus.kids']);
    assert.equal(entry.payload.text.includes('private-key-must-not-appear'), false);
    assert.equal(entry.payload.text.includes('test-secret'), false);
    assert.match(entry.headers['Idempotency-Key'], /geoapify_quota_(70|90)/);
    assert.match(entry.payload.text, /project/i);
  }
});
