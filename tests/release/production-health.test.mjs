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
  return new Response('<!doctype html><title>SafeBus Alberta</title>', {
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
