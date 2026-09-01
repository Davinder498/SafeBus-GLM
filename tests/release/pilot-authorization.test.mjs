import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  collectPilotReleaseEvidence,
  verifyPilotAuthorization,
} from '../../scripts/lib/pilot-authorization.mjs';

const read = (file) => fs.readFile(file, 'utf8');

async function fixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'safebus-pilot-'));
  const files = {
    'apps/web/index.ts': 'export const web = true;\n',
    'apps/mobile/index.ts': 'export const mobile = true;\n',
    'packages/types/index.ts': 'export interface Contract {}\n',
    'scripts/release.mjs': 'export const release = true;\n',
    'supabase/migrations/0001_test.sql': 'select 1;\n',
    '.github/workflows/release-production.yml': 'name: Release production\n',
    'package.json': '{}\n',
    'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    'netlify.toml': '[build]\n',
    'playwright.config.ts': 'export default {};\n',
    'turbo.json': '{}\n',
  };
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return root;
}

function approval(reference) {
  return {
    decision: 'approved',
    approvedAt: '2026-08-20T12:00:00.000Z',
    evidenceReference: reference,
  };
}

async function authorizedFixture(root) {
  const evidence = await collectPilotReleaseEvidence(root);
  return {
    format: 1,
    status: 'authorized',
    pilotId: 'CR1-PILOT-ALBERTA-001',
    approvedEvidenceDigest: evidence.digest,
    approvedAt: '2026-08-21T12:00:00.000Z',
    expiresAt: '2026-12-01T12:00:00.000Z',
    scope: {
      tenantCount: 1,
      busFloor: 25,
      busCeiling: 50,
      supportOperatingDays: 60,
      schoolScopeReference: 'PILOT/SCHOOLS/001',
      participantSelectionReference: 'PILOT/PARTICIPANTS/001',
      agreementReference: 'PILOT/AGREEMENT/001',
    },
    launchGates: Object.fromEntries(
      Array.from({ length: 7 }, (_, index) => [`point${index + 4}`, 'approved']),
    ),
    approvalAssignments: {
      platformAdministrator: 'PILOT/APPROVER/INTERNAL-OWNER-001',
      productOwner: 'PILOT/APPROVER/INTERNAL-OWNER-001',
      securityLead: 'PILOT/APPROVER/INTERNAL-OWNER-001',
      privacyLead: 'PILOT/APPROVER/INTERNAL-OWNER-001',
      operationsLead: 'PILOT/APPROVER/INTERNAL-OWNER-001',
      accessibilityQaLead: 'PILOT/APPROVER/INTERNAL-OWNER-001',
      customerAuthority: 'PILOT/APPROVER/CUSTOMER-AUTHORITY-001',
    },
    approvals: {
      platformAdministrator: approval('APPROVAL/PLATFORM/001'),
      productOwner: approval('APPROVAL/PRODUCT/001'),
      securityLead: approval('APPROVAL/SECURITY/001'),
      privacyLead: approval('APPROVAL/PRIVACY/001'),
      operationsLead: approval('APPROVAL/OPERATIONS/001'),
      accessibilityQaLead: approval('APPROVAL/ACCESSIBILITY-QA/001'),
      customerAuthority: approval('APPROVAL/CUSTOMER/001'),
    },
    rollbackAuthority: {
      immediateSuspension: true,
      immediateApplicationRollback: true,
      primaryContactReference: 'ONCALL/PRIMARY/001',
      backupContactReference: 'ONCALL/BACKUP/001',
    },
  };
}

test('valid pilot authorization is scoped, current, approved, and source-bound', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const authorization = await authorizedFixture(root);

  const result = await verifyPilotAuthorization({
    authorization,
    root,
    now: Date.parse('2026-08-23T12:00:00.000Z'),
  });

  assert.equal(result.pilotId, authorization.pilotId);
  assert.equal(result.evidenceDigest, authorization.approvedEvidenceDigest);
});

test('pilot authorization fails closed when open, expired, or beyond the CR1 ceiling', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const authorization = await authorizedFixture(root);

  await assert.rejects(
    verifyPilotAuthorization({
      authorization: { ...authorization, status: 'not_authorized' },
      root,
    }),
    /not authorized/,
  );
  await assert.rejects(
    verifyPilotAuthorization({
      authorization,
      root,
      now: Date.parse('2027-01-01T00:00:00.000Z'),
    }),
    /invalid, expired/,
  );
  await assert.rejects(
    verifyPilotAuthorization({
      authorization: { ...authorization, scope: { ...authorization.scope, busCeiling: 101 } },
      root,
      now: Date.parse('2026-08-23T12:00:00.000Z'),
    }),
    /CR1 ceiling/,
  );
});

test('pilot authorization rejects missing approvals, gates, rollback authority, and changed source', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const authorization = await authorizedFixture(root);
  const now = Date.parse('2026-08-23T12:00:00.000Z');

  await assert.rejects(
    verifyPilotAuthorization({
      authorization: {
        ...authorization,
        approvalAssignments: {
          ...authorization.approvalAssignments,
          customerAuthority: null,
        },
      },
      root,
      now,
    }),
    /customerAuthority assignment/,
  );
  await assert.rejects(
    verifyPilotAuthorization({
      authorization: {
        ...authorization,
        approvals: { ...authorization.approvals, privacyLead: undefined },
      },
      root,
      now,
    }),
    /privacyLead/,
  );
  await assert.rejects(
    verifyPilotAuthorization({
      authorization: {
        ...authorization,
        approvals: { ...authorization.approvals, accessibilityQaLead: undefined },
      },
      root,
      now,
    }),
    /accessibilityQaLead/,
  );
  await assert.rejects(
    verifyPilotAuthorization({
      authorization: {
        ...authorization,
        launchGates: { ...authorization.launchGates, point9: 'open' },
      },
      root,
      now,
    }),
    /point9/,
  );
  await assert.rejects(
    verifyPilotAuthorization({
      authorization: {
        ...authorization,
        rollbackAuthority: {
          ...authorization.rollbackAuthority,
          immediateApplicationRollback: false,
        },
      },
      root,
      now,
    }),
    /suspension and rollback/,
  );

  await fs.appendFile(path.join(root, 'apps/web/index.ts'), 'export const changed = true;\n');
  await assert.rejects(
    verifyPilotAuthorization({ authorization, root, now }),
    /does not match the current release-controlled source/,
  );
});

test('production release is gated before database or application deployment', async () => {
  const [workflow, packageJson, currentAuthorization] = await Promise.all([
    read('.github/workflows/release-production.yml'),
    read('package.json').then(JSON.parse),
    read('docs/governance/pilot-authorization.json').then(JSON.parse),
  ]);

  assert.match(workflow, /pilot_confirmation:/);
  assert.match(workflow, /AUTHORIZE_CR1_PILOT/);
  assert.match(workflow, /Verify active CR1 pilot authorization\s+run: pnpm pilot:verify/);
  assert.ok(workflow.indexOf('pnpm pilot:verify') < workflow.indexOf('pnpm release:preflight'));
  assert.ok(workflow.indexOf('pnpm pilot:verify') < workflow.indexOf('pnpm migrations:deploy'));
  assert.ok(workflow.indexOf('pnpm pilot:verify') < workflow.indexOf('netlify deploy --prod'));
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.equal(packageJson.scripts['pilot:verify'], 'node scripts/check-pilot-authorization.mjs');
  assert.equal(currentAuthorization.status, 'not_authorized');
  assert.ok(Object.values(currentAuthorization.launchGates).every((status) => status === 'open'));
  const internalAssignments = Object.entries(currentAuthorization.approvalAssignments)
    .filter(([role]) => role !== 'customerAuthority')
    .map(([, reference]) => reference);
  assert.equal(new Set(internalAssignments).size, 1);
  assert.equal(internalAssignments[0], 'PILOT/APPROVER/INTERNAL-OWNER-001');
  assert.equal(currentAuthorization.approvalAssignments.customerAuthority, null);
  assert.deepEqual(currentAuthorization.approvals, {});
  assert.equal(
    currentAuthorization.rollbackAuthority.primaryContactReference,
    'OPS/ONCALL/PRIMARY-001',
  );
  assert.equal(
    currentAuthorization.rollbackAuthority.backupContactReference,
    'OPS/ONCALL/BACKUP-001',
  );
});

test('Point 11 records preserve human approval and operating evidence as open', async () => {
  const [governance, acceptance, milestone] = await Promise.all([
    read('docs/governance/point-11-pilot-authorization.md'),
    read('docs/qa/point-11-pilot-acceptance.md'),
    read('docs/MILESTONE_STATUS.md'),
  ]);

  assert.match(
    governance,
    /Status: Fail-closed engineering gate implemented; Point 11 remains open/,
  );
  assert.match(governance, /does not\s+authorize a pilot/i);
  assert.match(governance, /one to three approved public-school-authority tenants/);
  assert.match(governance, /immediate suspension and rollback authority/);
  assert.match(acceptance, /Do not place student, guardian, or\s+driver data/);
  assert.match(acceptance, /Points 4 through 10/);
  assert.match(acceptance, /Customer Authority must be an\s+authorized representative/);
  assert.match(milestone, /Commercial Readiness Remediation 9/);
});
