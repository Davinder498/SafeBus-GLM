import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const read = (file) => fs.readFile(file, 'utf8');

test('map configuration is server-managed and locked to the approved provider', async () => {
  const [serverConfig, clientConfig, frontendExample] = await Promise.all([
    read('apps/web/netlify/functions/map-tile-config.mjs'),
    read('apps/web/src/services/mapTileConfigService.ts'),
    read('apps/web/.env.example'),
  ]);

  assert.match(serverConfig, /process\.env\.GEOAPIFY_API_KEY/);
  assert.match(
    serverConfig,
    /^\s*'https:\/\/maps\.geoapify\.com\/v1\/tile\/osm-bright\/\{z\}\/\{x\}\/\{y\}\.png';\s*$/m,
  );
  assert.match(
    clientConfig,
    /^const GEOAPIFY_TILE_ORIGIN = 'https:\/\/maps\.geoapify\.com';$/m,
  );
  assert.doesNotMatch(frontendExample, /VITE_MAP_/);
  assert.match(frontendExample, /GEOAPIFY_API_KEY=.*server-managed config/);
});

test('every interactive map minimizes referrer data and fails safely on tile errors', async () => {
  const mapFiles = [
    'apps/web/src/components/guardian/GuardianLiveBusMap.tsx',
    'apps/web/src/components/admin/AdminFleetMap.tsx',
    'apps/web/src/components/admin/AdminRoutesMap.tsx',
    'apps/web/src/components/admin/RouteStopMapEditor.tsx',
  ];

  for (const file of mapFiles) {
    const source = await read(file);
    assert.match(source, /referrerPolicy="strict-origin"/, file);
    assert.match(source, /tileerror/, file);
    assert.match(source, /tileFailed/, file);
  }

  const [guardianSmoke, fleetSmoke, routeSmoke] = await Promise.all([
    read('tests/smoke/guardian-live-bus-map.spec.ts'),
    read('tests/smoke/admin-live-trip-monitoring.spec.ts'),
    read('tests/smoke/admin-simple-workflow.spec.ts'),
  ]);
  for (const smoke of [guardianSmoke, fleetSmoke, routeSmoke]) {
    assert.match(smoke, /installMapProviderOutage/);
  }
  assert.match(routeSmoke, /route-stop-map-tile-error/);
});

test('Point 8 records the provider decision without overstating launch readiness', async () => {
  const [evidence, decisions, risks, provider] = await Promise.all([
    read('docs/governance/point-8-map-readiness.md'),
    read('docs/governance/decision-log.md'),
    read('docs/governance/risk-register.md'),
    read('docs/map-provider.md'),
  ]);

  assert.match(evidence, /Engineering controls complete/);
  assert.match(evidence, /Paid provider plan\/SLA \| _pending_/i);
  assert.match(decisions, /### DL-018 — Select Geoapify for Commercial Release 1 maps/);
  assert.match(decisions, /reliability\s+is\s+paramount/i);
  assert.match(risks, /R-018/);
  assert.match(provider, /must be\s+activated before the first real school operation/i);
  assert.doesNotMatch(evidence, /Point 8 is complete/);
});
