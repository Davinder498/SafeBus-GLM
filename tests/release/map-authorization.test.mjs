import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { collectMapReleaseEvidence, verifyMapReadiness } from '../../scripts/lib/map-readiness.mjs';

const read = (file) => fs.readFile(file, 'utf8');

const requiredFiles = {
  'apps/web/src/components/admin/AdminMap.tsx': 'export const adminMap = true;\n',
  'apps/web/src/components/guardian/GuardianMap.tsx': 'export const guardianMap = true;\n',
  '.github/workflows/release-production.yml': 'name: Release production\n',
  'apps/web/netlify/functions/map-tile-config.mjs': 'export const mapConfig = true;\n',
  'apps/web/src/services/mapTileConfigService.ts': 'export const mapService = true;\n',
  'docs/governance/point-8-map-readiness.md': '# Point 8\n',
  'docs/qa/point-8-map-readiness-acceptance.md': '# Acceptance\n',
  'netlify.toml': '[build]\n',
  'package.json': '{}\n',
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  'scripts/check-map-readiness.mjs': 'export const check = true;\n',
  'scripts/lib/map-readiness.mjs': 'export const readiness = true;\n',
  'scripts/print-map-release-digest.mjs': 'export const digest = true;\n',
  'tests/release/map-authorization.test.mjs': 'export const authorization = true;\n',
  'tests/release/map-readiness.test.mjs': 'export const mapContract = true;\n',
  'tests/smoke/admin-live-trip-monitoring.spec.ts': 'export const adminSmoke = true;\n',
  'tests/smoke/admin-simple-workflow.spec.ts': 'export const routeSmoke = true;\n',
  'tests/smoke/guardian-live-bus-map.spec.ts': 'export const guardianSmoke = true;\n',
};

const providerKeys = [
  'providerSelection',
  'paidPlanAndSla',
  'restrictedProductionKey',
  'securityReview',
  'privacyAndCrossBorderApproval',
];
const quotaKeys = [
  'seventyPercentAlert',
  'ninetyPercentAlert',
  'alertRoutingDrill',
  'pilotCapacityReview',
];
const acceptanceKeys = [
  'productionWeb',
  'supportedAndroid',
  'guardianPrivacy',
  'adminFleet',
  'routeAndStopEditor',
  'providerOutage',
  'providerRecovery',
  'attribution',
];

async function fixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'safebus-map-readiness-'));
  for (const [name, content] of Object.entries(requiredFiles)) {
    const target = path.join(root, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return root;
}

function approved(reference) {
  return {
    decision: 'approved',
    approvedAt: '2026-08-20T12:00:00.000Z',
    evidenceReference: reference,
  };
}

async function approvedFixture(root) {
  const evidence = await collectMapReleaseEvidence(root);
  const entries = (keys, prefix) =>
    Object.fromEntries(keys.map((key) => [key, approved(`${prefix}/${key}`)]));
  return {
    format: 1,
    status: 'approved',
    approvalId: 'CR1-MAPS-ALBERTA-001',
    provider: 'geoapify',
    approvedEvidenceDigest: evidence.digest,
    approvedAt: '2026-08-22T12:00:00.000Z',
    expiresAt: '2026-11-01T12:00:00.000Z',
    providerEvidence: entries(providerKeys, 'MAP/PROVIDER'),
    quotaEvidence: entries(quotaKeys, 'MAP/QUOTA'),
    acceptance: entries(acceptanceKeys, 'MAP/ACCEPTANCE'),
    observation: {
      result: 'passed',
      startedAt: '2026-08-12T12:00:00.000Z',
      endedAt: '2026-08-20T12:00:00.000Z',
      unexplainedProviderFailures: 0,
      quotaExhaustions: 0,
      evidenceReference: 'MAP/OBSERVATION/001',
    },
    approvals: {
      platformAdministrator: approved('APPROVAL/PLATFORM'),
      productOwner: approved('APPROVAL/PRODUCT'),
      securityLead: approved('APPROVAL/SECURITY'),
      privacyLead: approved('APPROVAL/PRIVACY'),
      operationsLead: approved('APPROVAL/OPERATIONS'),
      qaLead: approved('APPROVAL/QA'),
    },
  };
}

test('valid Point 8 readiness is provider-locked, observed, approved, and source-bound', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);
  const result = await verifyMapReadiness({
    readiness,
    root,
    now: Date.parse('2026-08-23T12:00:00.000Z'),
  });
  assert.equal(result.approvalId, readiness.approvalId);
  assert.equal(result.evidenceDigest, readiness.approvedEvidenceDigest);
});

test('Point 8 fails closed when open, expired, or using another provider', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);
  const now = Date.parse('2026-08-23T12:00:00.000Z');

  await assert.rejects(
    verifyMapReadiness({ readiness: { ...readiness, status: 'not_approved' }, root, now }),
    /not approved/,
  );
  await assert.rejects(
    verifyMapReadiness({ readiness: { ...readiness, provider: 'other' }, root, now }),
    /approved Geoapify provider/,
  );
  await assert.rejects(
    verifyMapReadiness({ readiness, root, now: Date.parse('2027-01-01T00:00:00.000Z') }),
    /invalid, expired/,
  );
});

test('Point 8 rejects evidence gaps, short observations, approvals, and source drift', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);
  const now = Date.parse('2026-08-23T12:00:00.000Z');

  await assert.rejects(
    verifyMapReadiness({
      readiness: {
        ...readiness,
        providerEvidence: { ...readiness.providerEvidence, paidPlanAndSla: null },
      },
      root,
      now,
    }),
    /paidPlanAndSla/,
  );
  await assert.rejects(
    verifyMapReadiness({
      readiness: {
        ...readiness,
        observation: { ...readiness.observation, startedAt: '2026-08-15T12:00:00.000Z' },
      },
      root,
      now,
    }),
    /seven-day observation/,
  );
  await assert.rejects(
    verifyMapReadiness({
      readiness: { ...readiness, approvals: { ...readiness.approvals, operationsLead: null } },
      root,
      now,
    }),
    /operationsLead/,
  );

  await fs.appendFile(path.join(root, 'apps/web/src/components/admin/AdminMap.tsx'), 'changed\n');
  await assert.rejects(
    verifyMapReadiness({ readiness, root, now }),
    /does not match the current release-controlled source/,
  );
});

test('production release verifies Point 8 before pilot, database, or application actions', async () => {
  const [workflow, packageJson, currentReadiness] = await Promise.all([
    read('.github/workflows/release-production.yml'),
    read('package.json').then(JSON.parse),
    read('docs/governance/map-readiness.json').then(JSON.parse),
  ]);

  assert.match(workflow, /Verify active Point 8 map readiness/);
  assert.ok(workflow.indexOf('pnpm map:verify') < workflow.indexOf('pnpm pilot:verify'));
  assert.ok(workflow.indexOf('pnpm map:verify') < workflow.indexOf('pnpm migrations:deploy'));
  assert.ok(workflow.indexOf('pnpm map:verify') < workflow.indexOf('netlify deploy --prod'));
  assert.equal(packageJson.scripts['map:verify'], 'node scripts/check-map-readiness.mjs');
  assert.equal(currentReadiness.status, 'not_approved');
  assert.equal(currentReadiness.provider, 'geoapify');
});

test('Point 8 governance keeps external and operating evidence open', async () => {
  const [governance, acceptance, milestone] = await Promise.all([
    read('docs/governance/point-8-map-readiness.md'),
    read('docs/qa/point-8-map-readiness-acceptance.md'),
    read('docs/MILESTONE_STATUS.md'),
  ]);

  assert.match(governance, /commercial operating evidence pending/i);
  assert.match(governance, /map-readiness\.json/);
  assert.match(acceptance, /Pending execution/);
  assert.match(milestone, /Commercial Readiness Remediation 12/);
});
