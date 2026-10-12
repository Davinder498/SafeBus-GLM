import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const read = (file) => fs.readFile(file, 'utf8');

test('Point 10 is a named, blocking browser verification gate', async () => {
  const [packageJson, workflow, browserConfig, mobileConfig] = await Promise.all([
    read('package.json').then(JSON.parse),
    read('.github/workflows/ci.yml'),
    read('playwright.config.ts'),
    read('playwright.mobile-ui.config.ts'),
  ]);

  assert.match(packageJson.scripts['test:product-verification'], /commercial-authenticated-e2e/);
  assert.match(packageJson.scripts['test:product-verification'], /commercial-resilience/);
  assert.match(packageJson.scripts['test:product-verification'], /commercial-accessibility/);
  assert.match(packageJson.scripts['test:product-verification'], /product-load/);
  assert.match(
    packageJson.scripts['test:product-verification'],
    /&& playwright test --config playwright\.mobile-ui\.config\.ts/,
  );
  assert.match(packageJson.scripts['test:product-verification'], /commercial-product\.spec\.ts/);
  assert.match(
    packageJson.scripts['test:product-verification'],
    /guardian-verification-recovery\.spec\.ts/,
  );
  assert.match(workflow, /name: Browser smoke tests/);
  assert.match(workflow, /pnpm exec playwright test --workers=4/);
  assert.match(workflow, /pnpm test:mobile-ui/);
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.match(browserConfig, /testMatch:\s*'\*\*\/\*\.spec\.ts'/);
  for (const config of [browserConfig, mobileConfig])
    assert.match(config, /serviceWorkers:\s*'block'/);
  assert.match(packageJson.scripts['test:accessibility'], /commercial-product\.spec\.ts/);
});

test('authenticated, resilience, and load checks stay synthetic and bounded', async () => {
  const [authenticated, resilience, mobile, load] = await Promise.all([
    read('tests/smoke/commercial-authenticated-e2e.spec.ts'),
    read('tests/smoke/commercial-resilience.spec.ts'),
    read('tests/mobile-ui/commercial-product.spec.ts'),
    read('tests/release/product-load.spec.ts'),
  ]);

  assert.match(authenticated, /tenant administrator can review transportation/);
  assert.match(mobile, /driver can start and end/);
  assert.match(mobile, /guardian sees only the linked-student/);
  assert.match(mobile, /role guards keep a/);
  assert.match(mobile, /session registration failure blocks driver operations/);
  assert.match(resilience, /rawBackendError/);
  assert.match(resilience, /map outage preserves the authoritative/);
  assert.match(load, /const REQUESTS_PER_PATH = 12/);
  assert.match(load, /const CONCURRENCY = 10/);
  assert.match(load, /localhost/);
  assert.doesNotMatch(
    `${authenticated}\n${resilience}\n${mobile}\n${load}`,
    /bussafe\.netlify\.app/,
  );
  assert.doesNotMatch(
    `${authenticated}\n${resilience}\n${mobile}\n${load}`,
    /SUPABASE_SERVICE_ROLE|service_role/,
  );
});

test('critical commercial browser journeys cannot silently become skipped evidence', async () => {
  for (const file of [
    'tests/smoke/commercial-authenticated-e2e.spec.ts',
    'tests/smoke/commercial-resilience.spec.ts',
    'tests/smoke/commercial-accessibility.spec.ts',
    'tests/mobile-ui/commercial-product.spec.ts',
    'tests/mobile-ui/guardian-verification-recovery.spec.ts',
  ]) {
    assert.doesNotMatch(await read(file), /\b(?:test|describe)\.(?:skip|fixme|only)\s*\(/, file);
  }
});

test('Point 10 documentation does not overstate automated or launch evidence', async () => {
  const [governance, acceptance, milestone, authContext] = await Promise.all([
    read('docs/governance/point-10-product-verification.md'),
    read('docs/qa/point-10-product-verification-acceptance.md'),
    read('docs/MILESTONE_STATUS.md'),
    read('apps/web/src/contexts/AuthContext.tsx'),
  ]);

  assert.match(
    governance,
    /Status: Repository-controlled automated verification complete; Point 10 remains open/,
  );
  assert.match(governance, /does not prove hosted\s+Supabase Auth or RLS/i);
  assert.match(governance, /does not establish production capacity or an SLA/i);
  assert.match(
    acceptance,
    /Do not create test accounts or fixtures\s+in the sole production database/,
  );
  assert.match(acceptance, /NVDA/);
  assert.match(acceptance, /approved isolated target/);
  assert.match(milestone, /Commercial Readiness Remediation 8/);
  assert.doesNotMatch(authContext, /getProfileErrorMessage\(error\?\.message\)/);
});
