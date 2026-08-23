import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const read = (file) => fs.readFile(file, 'utf8');

test('Point 10 is a named, blocking browser verification gate', async () => {
  const [packageJson, workflow] = await Promise.all([
    read('package.json').then(JSON.parse),
    read('.github/workflows/ci.yml'),
  ]);

  assert.match(packageJson.scripts['test:product-verification'], /commercial-authenticated-e2e/);
  assert.match(packageJson.scripts['test:product-verification'], /commercial-resilience/);
  assert.match(packageJson.scripts['test:product-verification'], /commercial-accessibility/);
  assert.match(packageJson.scripts['test:product-verification'], /product-load/);
  assert.match(workflow, /name: Browser smoke tests/);
  assert.match(workflow, /pnpm exec playwright test --workers=4/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});

test('authenticated, resilience, and load checks stay synthetic and bounded', async () => {
  const [authenticated, resilience, load] = await Promise.all([
    read('tests/smoke/commercial-authenticated-e2e.spec.ts'),
    read('tests/smoke/commercial-resilience.spec.ts'),
    read('tests/release/product-load.spec.ts'),
  ]);

  assert.match(authenticated, /tenant administrator can review transportation/);
  assert.match(authenticated, /driver can start and end/);
  assert.match(authenticated, /guardian sees only the linked-student/);
  assert.match(authenticated, /role guards keep guardian and driver accounts out/);
  assert.match(resilience, /rawBackendError/);
  assert.match(resilience, /map outage preserves the authoritative/);
  assert.match(load, /const REQUESTS_PER_PATH = 12/);
  assert.match(load, /const CONCURRENCY = 10/);
  assert.match(load, /localhost/);
  assert.doesNotMatch(`${authenticated}\n${resilience}\n${load}`, /bussafe\.netlify\.app/);
  assert.doesNotMatch(
    `${authenticated}\n${resilience}\n${load}`,
    /SUPABASE_SERVICE_ROLE|service_role/,
  );
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
