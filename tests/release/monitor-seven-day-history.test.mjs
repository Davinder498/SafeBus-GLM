import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditPublicMonitorHistory,
  collectPublicScheduledRuns,
  evaluateScheduledMonitorHistory,
  MAX_CADENCE_GAP_MS,
  REVIEW_DAYS,
} from '../../scripts/lib/monitor-seven-day-history.mjs';

const start = Date.parse('2026-10-30T00:00:00.000Z');
const end = start + 7 * 86_400_000;
const startAt = new Date(start).toISOString();
const endAt = new Date(end).toISOString();
const run = (id, at, overrides = {}) => ({
  id, event: 'schedule', head_branch: 'main',
  created_at: new Date(at).toISOString(),
  status: 'completed', conclusion: 'success', ...overrides,
});
const good = Array.from({ length: 7 * 24 * 4 + 1 },
  (_, i) => run(i + 1, start + i * 15 * 60_000));
const review = (runs) => evaluateScheduledMonitorHistory({ runs, startAt, endAt });

test('full seven-day history stays explicitly short of production approval', () => {
  assert.equal(REVIEW_DAYS, 7);
  assert.equal(MAX_CADENCE_GAP_MS, 45 * 60_000);
  const result = review([...good].reverse());
  assert.equal(result.githubCadenceResult, 'passed');
  assert.equal(result.observedScheduledRuns, 673);
  assert.equal(result.gapsOver45Minutes, 0);
  assert.equal(result.maximumObservedGapMinutes, 15);
  assert.equal(result.unsuccessfulScheduledRuns, 0);
  assert.equal(result.operationsReadiness, 'not_approved');
  assert.equal(result.netlifyScheduleEvidence, 'not_checked');
  assert.equal(result.alertInboxEvidence, 'not_checked');
});
test('new success cannot conceal missing historical scheduled intervals', () => {
  const missing = good.filter((_, i) => ![100, 101, 102, 103].includes(i));
  const result = review(missing);
  assert.equal(result.githubCadenceResult, 'failed');
  assert.equal(result.reason, 'MONITOR_HISTORY_GAPS');
  assert.equal(result.gapsOver45Minutes, 1);
  assert.equal(result.maximumObservedGapMinutes, 75);
});
test('manual runs cannot repair missing schedules and earlier failures stay visible', () => {
  const missing = good.filter((_, i) => ![100, 101, 102, 103].includes(i));
  missing.push(run(777, start + 102 * 15 * 60_000, { event: 'workflow_dispatch' }));
  assert.equal(review(missing).reason, 'MONITOR_HISTORY_GAPS');
  const failed = [...good];
  failed[200] = run(201, start + 200 * 15 * 60_000, { conclusion: 'failure' });
  assert.equal(review(failed).reason, 'MONITOR_HISTORY_UNSUCCESSFUL');
  assert.equal(review(failed).unsuccessfulScheduledRuns, 1);
});
test('missing start/end or missing entire history is not a passing window', () => {
  assert.equal(review([]).reason, 'MONITOR_HISTORY_NO_SCHEDULED_RUNS');
  assert.equal(review(good.slice(10)).reason, 'MONITOR_HISTORY_GAPS');
  assert.equal(review(good.slice(0, -10)).reason, 'MONITOR_HISTORY_GAPS');
});
test('invalid run IDs, dates, duplicates and windows fail closed', () => {
  for (const runs of [
    [run(1, start, { created_at: '2026-02-30T00:00:00Z' })],
    [run(1, start), run(1, start + 60_000)],
    [run(1, start, { status: 3 })],
    [run(1, end + 3 * 60_000)],
    'invalid',
  ]) assert.throws(() => review(runs), /MONITOR_HISTORY_INVALID_(INPUT|RESPONSE)/);
  assert.throws(() => evaluateScheduledMonitorHistory({
    runs: good, startAt, endAt: new Date(end + 1000).toISOString(),
  }), /MONITOR_HISTORY_INVALID_INPUT/);
});
test('public API pagination is read-only and uses no GitHub token', async () => {
  const seen = [];
  const page1 = [...good].reverse().slice(0, 100);
  const page2 = [run(5000, start - 60_000)];
  const fetchImpl = async (uri, options) => {
    const url = new URL(uri);
    seen.push({ url, options });
    return Response.json({
      workflow_runs: url.searchParams.get('page') === '1' ? page1 : page2,
    });
  };
  const runs = await collectPublicScheduledRuns({
    fetchImpl, startAt: new Date(end - 2 * 24 * 60 * 60_000).toISOString(),
  });
  assert.equal(runs.length, 101);
  assert.equal(seen.length, 2);
  assert.ok(seen.every(x => x.options.redirect === 'error' && x.options.signal));
  assert.ok(seen.every(x => x.options.headers.authorization === undefined));
  assert.ok(seen.every(x => x.url.searchParams.get('event') === 'schedule'));
  assert.ok(seen.every(x => x.url.searchParams.get('branch') === 'main'));
});
test('provider errors are sanitized and never turn into healthy audits', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('private-provider-response'); },
    async () => new Response('private-provider-response', { status: 503 }),
    async () => new Response('private-provider-response'),
  ]) {
    await assert.rejects(auditPublicMonitorHistory({ fetchImpl, now: end }),
      e => /^MONITOR_HISTORY_(FETCH_FAILED|INVALID_RESPONSE)$/.test(e.message) &&
        !e.message.includes('private-provider-response'));
  }
});
