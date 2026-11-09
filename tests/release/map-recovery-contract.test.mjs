import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('provider config fetch is bounded, coalesced and does not cache failure forever', () => {
  const s = read('apps/web/src/services/mapTileConfigService.ts');
  assert.match(s, /AbortSignal\.timeout\(CONFIG_REQUEST_TIMEOUT_MS\)/);
  assert.match(s, /if \(Date\.now\(\) < retryAfter\)/);
  assert.match(s, /configRequest = null;/);
  assert.match(s, /MAP_CONFIG_RETRY_DELAY_MS/);
  const hook = read('apps/web/src/hooks/useMapTileConfig.ts');
  assert.match(hook, /setTimeout\(load, MAP_CONFIG_RETRY_DELAY_MS\)/);
  assert.match(hook, /clearTimeout\(retryTimer\)/);
});

test('guardian and admin operational maps can retry tiles without losing fallback', () => {
  const paths = [
    'apps/web/src/components/guardian/GuardianLiveBusMap.tsx',
    'apps/web/src/components/admin/AdminFleetMap.tsx',
    'apps/web/src/components/admin/AdminRoutesMap.tsx',
    'apps/web/src/components/admin/AdminTripMap.tsx',
    'apps/web/src/components/admin/RouteStopMapEditor.tsx',
    'apps/web/src/components/admin/RoutePathEditor.tsx',
  ];
  for (const path of paths) {
    const s = read(path);
    assert.match(s, /Retry map/, path);
    assert.match(s, /[Tt]ile[Ff]ailed|onFailure|mapFailed/, path);
  }
});

test('subscription summary does not promise unverified tax-exclusive or inclusive amounts', () => {
  const s = read('apps/web/src/components/subscription/SubscriptionOverview.tsx');
  assert.ok(!s.includes('Plan subtotal before discounts and tax'));
  assert.ok(s.includes('the actual invoice'));
  assert.ok(s.includes('does not'));
  assert.equal(JSON.parse(read('docs/governance/map-readiness.json')).status, 'not_approved');
  assert.equal(JSON.parse(read('docs/governance/pilot-authorization.json')).status, 'not_authorized');
});
