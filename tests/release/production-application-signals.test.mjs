import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APPLICATION_SIGNAL_NAMES,
  runApplicationSignals,
  validApplicationChecks,
} from '../../scripts/lib/production-application-signals.mjs';

const NOW = Date.parse('2026-11-06T19:00:00Z');
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SECRET_KEY: 'synthetic-jwt-free-credential-for-test-only',
};
const publicTileKey = 'synthetic-public-tile-key-for-test';

function fakeBackend({
  active = 0,
  fresh = 0,
  oldEmail = 0,
  oldPush = 0,
  failedEmail = 0,
  failedPush = 0,
  failTables = [],
  tileStatus = 200,
  configStatus = 200,
  contentRangeInvalid = false,
} = {}) {
  const seen = [];
  const counts = {
    driver_trips: active,
    driver_trip_current_locations: fresh,
    guardian_notification_outbox: null,
    push_notification_outbox: null,
  };
  return {
    seen,
    fetchImpl: async (requestUrl, options) => {
      const url = new URL(requestUrl);
      seen.push({ url, options });
      if (url.hostname === 'example.supabase.co') {
        assert.equal(options.method, 'HEAD');
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers.apikey, env.SUPABASE_SECRET_KEY);
        assert.equal(options.headers.prefer, 'count=exact');
        assert.equal(options.headers.range, '0-0');
        assert.equal(options.headers.authorization, undefined);
        assert.equal(url.pathname.startsWith('/rest/v1/'), true);
        const table = url.pathname.split('/').at(-1);
        assert.equal(Object.hasOwn(counts, table), true);
        if (failTables.includes(table)) return new Response(null, { status: 503 });
        let count = counts[table];
        if (table === 'guardian_notification_outbox')
          count = url.searchParams.get('status') === 'eq.failed' ? failedEmail : oldEmail;
        if (table === 'push_notification_outbox')
          count = url.searchParams.get('status') === 'eq.failed' ? failedPush : oldPush;
        const range = contentRangeInvalid ? 'PRIVATE-SECRET-CONTENT' : (count ? '0-0/' + count : '*/0');
        return new Response(null, {
          status: count > 0 ? 206 : 200,
          headers: { 'content-range': range },
        });
      }
      if (url.href === 'https://safebus.kids/.netlify/functions/map-tile-config') {
        assert.equal(options.method, 'GET');
        return Response.json({
          tileUrl: 'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey=' + publicTileKey,
          attribution: 'Geoapify, OpenStreetMap',
        }, { status: configStatus });
      }
      if (url.hostname === 'maps.geoapify.com') {
        assert.equal(options.headers.referer, 'https://safebus.kids/');
        assert.equal(url.pathname, '/v1/tile/osm-bright/1/0/0.png');
        assert.equal(url.searchParams.get('apiKey'), publicTileKey);
        return new Response(null, {
          status: tileStatus,
          headers: { 'content-type': tileStatus === 200 ? 'image/png' : 'application/json' },
        });
      }
      throw new Error('unexpected host and secret response');
    },
  };
}

test('idle production snapshot is healthy without any synthetic trips or notifications', async () => {
  const fake = fakeBackend();
  const checks = await runApplicationSignals({ env, now: NOW, fetchImpl: fake.fetchImpl });
  assert.equal(validApplicationChecks(checks), true);
  assert.deepEqual(checks.map(x => x.check), APPLICATION_SIGNAL_NAMES);
  assert.equal(checks.some(x => x.result === 'fail'), false);
  assert.deepEqual(checks[1], { check: 'app_gps_freshness', result: 'pass', mode: 'idle' });
  assert.equal(fake.seen.filter(x => x.options.method === 'HEAD').length, 4);
  for (const observed of fake.seen) {
    assert.equal(observed.options.redirect, 'error');
    assert.ok(observed.options.signal);
  }
});

test('GPS freshness counts only established active trips and never returns identifiers or coordinates', async () => {
  const f = fakeBackend({ active: 3, fresh: 2 });
  const checks = await runApplicationSignals({ env, now: NOW, fetchImpl: f.fetchImpl });
  assert.deepEqual(checks[1], { check: 'app_gps_freshness', result: 'fail', code: 'ACTIVE_GPS_STALE' });
  const [active] = f.seen.filter(x => x.url.pathname.endsWith('/driver_trips'));
  assert.equal(active.url.searchParams.get('status'), 'eq.active');
  assert.ok(active.url.searchParams.get('started_at')?.startsWith('lt.'));
  const loc = f.seen.find(x => x.url.pathname.endsWith('/driver_trip_current_locations'));
  assert.equal(loc.url.searchParams.get('driver_trips.status'), 'eq.active');
  assert.equal(loc.url.searchParams.get('select'), 'driver_trip_id,driver_trips!inner(id)');
  assert.equal(loc.url.searchParams.has('latitude'), false);
  assert.equal(JSON.stringify(checks).includes('example.supabase.co'), false);
  assert.equal(JSON.stringify(checks).includes(env.SUPABASE_SECRET_KEY), false);
  assert.equal(JSON.stringify(checks).includes('driver_trip_id'), false);
});

test('fresh active locations do not trigger an alert', async () => {
  const f = fakeBackend({ active: 4, fresh: 4 });
  const checks = await runApplicationSignals({ env, now: NOW, fetchImpl: f.fetchImpl });
  assert.deepEqual(checks[1], { check: 'app_gps_freshness', result: 'pass' });
});

test('separate email/push queues and recent failure spike are detected', async () => {
  const f = fakeBackend({ oldEmail: 1, oldPush: 4, failedEmail: 5, failedPush: 6 });
  const checks = await runApplicationSignals({ env, now: NOW, fetchImpl: f.fetchImpl });
  assert.deepEqual(checks.slice(2, 5), [
    { check: 'app_email_backlog', result: 'fail', code: 'EMAIL_QUEUE_OLD' },
    { check: 'app_push_backlog', result: 'fail', code: 'PUSH_QUEUE_OLD' },
    { check: 'app_delivery_failures', result: 'fail', code: 'DELIVERY_FAILURE_SPIKE' },
  ]);
  assert.equal(f.seen.filter(x => x.url.pathname.includes('notification_outbox')).length, 4);
});

test('missing backend credentials or REST response fails closed without leaking credentials', async () => {
  const f = fakeBackend({ contentRangeInvalid: true });
  const a = await runApplicationSignals({ env, now: NOW, fetchImpl: f.fetchImpl });
  assert.deepEqual(a[0], { check: 'app_database', result: 'fail', code: 'DATABASE_CHECK_UNAVAILABLE' });
  assert.equal(a.filter(x => x.result === 'fail').length >= 5, true);
  const b = await runApplicationSignals({ env: {}, now: NOW, fetchImpl: f.fetchImpl });
  assert.equal(b.filter(x => x.result === 'fail').length, 5);
  assert.deepEqual(b[5], { check: 'app_map_tiles', result: 'pass' });
  assert.doesNotMatch(JSON.stringify(b), /PRIVATE-SECRET-CONTENT/);
});

test('map probe detects a failed tile despite healthy configuration and does not log public tile key', async () => {
  const f = fakeBackend({ tileStatus: 403 });
  const checks = await runApplicationSignals({ env, now: NOW, fetchImpl: f.fetchImpl });
  assert.deepEqual(checks[5], { check: 'app_map_tiles', result: 'fail', code: 'MAP_TILE_CHECK_UNAVAILABLE' });
  assert.doesNotMatch(JSON.stringify(checks), /synthetic-public-tile-key/);
});

test('invalid or inconsistent snapshots stay within fixed, sanitized monitor outputs', async () => {
  const f = fakeBackend({ active: 1, fresh: 2 });
  const checks = await runApplicationSignals({ env, now: NOW, fetchImpl: f.fetchImpl });
  assert.deepEqual(checks[1], { check: 'app_gps_freshness', result: 'fail', code: 'GPS_CHECK_UNAVAILABLE' });
  assert.equal(validApplicationChecks(checks), true);
  assert.equal(validApplicationChecks([{ check: 'app_database', result: 'pass', customer: 'sensitive' }]), false);
  await assert.rejects(runApplicationSignals({ env, now: NaN }), { message: 'APP_MONITOR_INVALID_INPUT' });
});
