import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  collectPrivacyReleaseEvidence,
  verifyPrivacyReadiness,
} from '../../scripts/lib/privacy-readiness.mjs';

const read = (file) => fs.readFile(file, 'utf8');

const requiredFiles = {
  'docs/governance/phase-3/README.md': '# Privacy phase\n',
  '.github/workflows/release-production.yml': 'name: Release production\n',
  'apps/web/netlify/functions/safebus-retention-scheduled.mjs': 'export const retention = true;\n',
  'apps/web/src/lib/driverLocationDisclosure.ts': 'export const disclosure = true;\n',
  'docs/governance/commercial-release-scope.md': '# CR1\n',
  'docs/governance/data-classification.md': '# Classification\n',
  'docs/governance/risk-register.md': '# Risks\n',
  'docs/governance/role-responsibility-matrix.md': '# Roles\n',
  'netlify.toml': '[build]\n',
  'package.json': '{}\n',
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  'scripts/check-privacy-readiness.mjs': 'export const check = true;\n',
  'scripts/lib/privacy-readiness.mjs': 'export const readiness = true;\n',
  'scripts/print-privacy-release-digest.mjs': 'export const digest = true;\n',
  'supabase/migrations/0069_phase3_retention_foundation.sql': 'select 69;\n',
  'supabase/migrations/0090_phase7_byod_android_tracking.sql': 'select 90;\n',
  'tests/release/privacy-readiness.test.mjs': 'export const contract = true;\n',
  'tests/rls/phase3-retention-rls.sql': 'select 1;\n',
};

const legalKeys = [
  'statutoryMapping',
  'safeBusRole',
  'customerAuthority',
  'privacyImpactAssessment',
];
const programKeys = [
  'namedPrivacyRoles',
  'accessAndCorrection',
  'guardianAuthority',
  'studentProcesses',
  'breachResponse',
  'breachTabletop',
  'legalHoldProcedure',
];
const contractKeys = [
  'masterServicesAgreement',
  'dataProcessingAgreement',
  'securitySchedule',
  'serviceLevelAgreement',
  'acceptableUseTerms',
  'privacyPolicy',
  'dataReturnAndDestruction',
];
const retentionKeys = [
  'approvedSchedule',
  'isolatedEnforcementTest',
  'deletionDryRun',
  'backupRetentionWindow',
];
const residencyKeys = [
  'productionDatabase',
  'databaseBackups',
  'applicationHosting',
  'supportAccess',
  'crossBorderFlows',
];
const noticeKeys = [
  'guardianNotice',
  'driverByodNotice',
  'publicPrivacyPolicy',
  'googlePlayDataSafety',
];

async function fixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'safebus-privacy-readiness-'));
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
  const evidence = await collectPrivacyReleaseEvidence(root);
  const entries = (keys, prefix) =>
    Object.fromEntries(keys.map((key) => [key, approved(`${prefix}/${key}`)]));
  const processor = (reference) => ({
    ...approved(`VENDOR/${reference}/APPROVAL`),
    processingLocationReference: `VENDOR/${reference}/LOCATION`,
    contractReference: `VENDOR/${reference}/CONTRACT`,
    securityReviewReference: `VENDOR/${reference}/SECURITY`,
    crossBorderDecisionReference: `VENDOR/${reference}/CROSS-BORDER`,
  });

  return {
    format: 1,
    status: 'approved',
    approvalId: 'CR1-PRIVACY-ALBERTA-001',
    approvedEvidenceDigest: evidence.digest,
    approvedAt: '2026-08-22T12:00:00.000Z',
    expiresAt: '2027-08-20T12:00:00.000Z',
    legal: entries(legalKeys, 'LEGAL'),
    privacyProgram: entries(programKeys, 'PROGRAM'),
    contracts: entries(contractKeys, 'CONTRACT'),
    retention: entries(retentionKeys, 'RETENTION'),
    subprocessors: {
      supabaseHostingAndAuth: processor('SUPABASE'),
      netlifyHostingAndFunctions: processor('NETLIFY'),
      geoapifyMaps: processor('GEOAPIFY'),
      emailDelivery: processor('EMAIL'),
      errorMonitoring: processor('MONITORING'),
    },
    residency: entries(residencyKeys, 'RESIDENCY'),
    notices: {
      ...entries(noticeKeys, 'NOTICE'),
      publicPrivacyPolicy: {
        ...approved('NOTICE/PUBLIC-PRIVACY'),
        publicUrl: 'https://safebus.example/privacy',
      },
    },
    approvals: {
      platformAdministrator: approved('APPROVAL/PLATFORM'),
      productOwner: approved('APPROVAL/PRODUCT'),
      securityLead: approved('APPROVAL/SECURITY'),
      privacyLead: approved('APPROVAL/PRIVACY'),
      privacyCounsel: approved('APPROVAL/COUNSEL'),
      customerAuthority: approved('APPROVAL/CUSTOMER'),
    },
  };
}

test('valid Point 6 readiness is complete, current, approved, and source-bound', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);

  const result = await verifyPrivacyReadiness({
    readiness,
    root,
    now: Date.parse('2026-08-23T12:00:00.000Z'),
  });

  assert.equal(result.approvalId, readiness.approvalId);
  assert.equal(result.evidenceDigest, readiness.approvedEvidenceDigest);
});

test('Point 6 fails closed when open, expired, or missing legal and contract evidence', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);
  const now = Date.parse('2026-08-23T12:00:00.000Z');

  await assert.rejects(
    verifyPrivacyReadiness({ readiness: { ...readiness, status: 'not_approved' }, root, now }),
    /not approved/,
  );
  await assert.rejects(
    verifyPrivacyReadiness({
      readiness,
      root,
      now: Date.parse('2028-01-01T00:00:00.000Z'),
    }),
    /invalid, expired/,
  );
  await assert.rejects(
    verifyPrivacyReadiness({
      readiness: { ...readiness, legal: { ...readiness.legal, safeBusRole: null } },
      root,
      now,
    }),
    /Legal safeBusRole/,
  );
  await assert.rejects(
    verifyPrivacyReadiness({
      readiness: {
        ...readiness,
        contracts: { ...readiness.contracts, dataProcessingAgreement: null },
      },
      root,
      now,
    }),
    /Contract dataProcessingAgreement/,
  );
});

test('Point 6 rejects vendor gaps, non-HTTPS policy, approvals, and source drift', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);
  const now = Date.parse('2026-08-23T12:00:00.000Z');

  await assert.rejects(
    verifyPrivacyReadiness({
      readiness: {
        ...readiness,
        subprocessors: { ...readiness.subprocessors, geoapifyMaps: null },
      },
      root,
      now,
    }),
    /Subprocessor geoapifyMaps/,
  );
  await assert.rejects(
    verifyPrivacyReadiness({
      readiness: {
        ...readiness,
        notices: {
          ...readiness.notices,
          publicPrivacyPolicy: {
            ...readiness.notices.publicPrivacyPolicy,
            publicUrl: 'http://unsafe.example/privacy',
          },
        },
      },
      root,
      now,
    }),
    /HTTPS URL/,
  );
  await assert.rejects(
    verifyPrivacyReadiness({
      readiness: {
        ...readiness,
        approvals: { ...readiness.approvals, privacyCounsel: null },
      },
      root,
      now,
    }),
    /privacyCounsel/,
  );

  await fs.appendFile(path.join(root, 'docs/governance/phase-3/README.md'), 'changed\n');
  await assert.rejects(
    verifyPrivacyReadiness({ readiness, root, now }),
    /does not match the current release-controlled source/,
  );
});

test('production release verifies Point 6 before every deploy or database action', async () => {
  const [workflow, packageJson, currentReadiness] = await Promise.all([
    read('.github/workflows/release-production.yml'),
    read('package.json').then(JSON.parse),
    read('docs/governance/privacy-readiness.json').then(JSON.parse),
  ]);

  assert.match(workflow, /Verify active Point 6 privacy and legal approval/);
  assert.match(workflow, /run: pnpm privacy:verify/);
  assert.ok(workflow.indexOf('pnpm privacy:verify') < workflow.indexOf('pnpm pilot:verify'));
  assert.ok(workflow.indexOf('pnpm privacy:verify') < workflow.indexOf('pnpm release:preflight'));
  assert.ok(workflow.indexOf('pnpm privacy:verify') < workflow.indexOf('pnpm migrations:deploy'));
  assert.ok(workflow.indexOf('pnpm privacy:verify') < workflow.indexOf('netlify deploy --prod'));
  assert.doesNotMatch(workflow, /continue-on-error/);
  assert.equal(packageJson.scripts['privacy:verify'], 'node scripts/check-privacy-readiness.mjs');
  assert.equal(currentReadiness.status, 'not_approved');
});

test('Point 6 records keep counsel, vendor, customer, retention, and publication evidence open', async () => {
  const [governance, phase, milestone] = await Promise.all([
    read('docs/governance/point-6-privacy-readiness.md'),
    read('docs/governance/phase-3/README.md'),
    read('docs/MILESTONE_STATUS.md'),
  ]);

  assert.match(governance, /Point 6 remains open/);
  assert.match(governance, /does not constitute legal advice/i);
  assert.match(governance, /does not publish an unapproved privacy policy/i);
  assert.match(phase, /Drafted for counsel and privacy-professional review/);
  assert.match(milestone, /Commercial Readiness Remediation 11/);
});
