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
  'docs/governance/commercial-readiness-requirements.md': 'synthetic review evidence',
  'docs/qa/commercial-readiness-review-2026-10-15.md': 'synthetic review evidence',
  'docs/qa/commercial-readiness-hosted-observation-2026-10-15.json': 'synthetic review evidence',
  'docs/governance/phase-3/README.md': '# Privacy phase\n',
  '.github/workflows/release-production.yml': 'name: Release production\n',
  'apps/web/netlify/functions/safebus-retention-scheduled.mjs': 'export const retention = true;\n',
  'apps/web/src/lib/driverLocationDisclosure.ts': 'export const disclosure = true;\n',
  'apps/web/src/components/layout/DashboardLayout.tsx': 'export const dashboard = true;\n',
  'apps/web/src/components/layout/LegalPageLayout.tsx': 'export const legalLayout = true;\n',
  'apps/web/src/components/privacy/RolePrivacyNotices.tsx': 'export const roleNotices = true;\n',
  'apps/web/src/components/driver/BusQrStartScanner.tsx': 'export const scanner = true;\n',
  'apps/web/src/components/layout/PublicLayout.tsx': 'export const publicLayout = true;\n',
  'apps/web/src/pages/AccountDeletionPage.tsx': 'export const deletion = true;\n',
  'apps/web/src/pages/AccountSettingsPage.tsx': 'export const settings = true;\n',
  'apps/web/src/pages/PrivacyPolicyPage.tsx': 'export const policy = true;\n',
  'apps/web/src/pages/LoginPage.tsx': 'export const login = true;\n',
  'apps/web/src/pages/AcceptInvitationPage.tsx': 'export const invitation = true;\n',
  'apps/web/src/routes/router.tsx': 'export const router = true;\n',
  'apps/mobile/src/routes/router.tsx': 'export const router = true;\n',
  'tests/smoke/privacy-notice-access.spec.ts': '// local browser acceptance\n',
  'tests/mobile-ui/privacy-notice-access.spec.ts': '// local mobile acceptance\n',
  'docs/governance/commercial-release-scope.md': '# CR1\n',
  'docs/governance/data-classification.md': '# Classification\n',
  'docs/governance/google-play-data-safety-notifications.md': '# Data safety\n',
  'docs/governance/risk-register.md': '# Risks\n',
  'docs/governance/role-responsibility-matrix.md': '# Roles\n',
  'netlify.toml': '[build]\n',
  'package.json': '{}\n',
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  'scripts/check-privacy-readiness.mjs': 'export const check = true;\n',
  'scripts/check-android-publication-preflight.mjs': 'export const check = true;\n',
  'scripts/lib/privacy-readiness.mjs': 'export const readiness = true;\n',
  'scripts/print-privacy-release-digest.mjs': 'export const digest = true;\n',
  'supabase/migrations/0069_phase3_retention_foundation.sql': 'select 69;\n',
  'supabase/migrations/pending/20261015212746_fix_retention_column_qualification.sql':
    'select 1;\n',
  'supabase/migrations/0090_phase7_byod_android_tracking.sql': 'select 90;\n',
  'supabase/migrations/0092_end_to_end_notification_system.sql': 'select 92;\n',
  'docs/qa/end-to-end-notification-acceptance.md': '# Notifications\n',
  'tests/release/privacy-readiness.test.mjs': 'export const contract = true;\n',
  'tests/release/retention-qualification-postgres.test.mjs': '// owned PostgreSQL acceptance\n',
  'tests/release/fixtures/retention-installed-function.sql': '-- observed function definition\n',
  'tests/rls/phase3-retention-rls.sql': 'select 1;\n',
};

const legalKeys = [
  'statutoryMapping',
  'safeBusRole',
  'requirementsAssessment',
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
  'publicAccountDeletion',
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
    format: 2,
    status: 'approved',
    approvalId: 'CR1-PRIVACY-ALBERTA-001',
    approvedEvidenceDigest: evidence.digest,
    approvedAt: '2026-08-22T12:00:00.000Z',
    expiresAt: '2027-08-20T12:00:00.000Z',
    legal: {
      ...entries(legalKeys, 'LEGAL'),
      requirementsAssessment: {
        ...approved('LEGAL/REQUIREMENTS-ASSESSMENT'),
        frameworks: [
          'albertaPrivateSector',
          'albertaPublicSector',
          'federalPrivacy',
          'educationAndCommercial',
        ].map((framework) => ({
          framework,
          applicability: 'applicable',
          sourceUrl: 'https://www.alberta.ca/personal-information-protection-act',
          rationaleReference: `LEGAL/${framework}/RATIONALE`,
          evidenceReference: `LEGAL/${framework}/EVIDENCE`,
        })),
      },
    },
    privacyProgram: entries(programKeys, 'PROGRAM'),
    contracts: entries(contractKeys, 'CONTRACT'),
    retention: entries(retentionKeys, 'RETENTION'),
    subprocessors: {
      supabaseHostingAndAuth: processor('SUPABASE'),
      netlifyHostingAndFunctions: processor('NETLIFY'),
      geoapifyMaps: processor('GEOAPIFY'),
      emailDelivery: processor('EMAIL'),
      errorMonitoring: processor('MONITORING'),
      firebaseCloudMessaging: processor('FCM'),
      stripeBilling: processor('STRIPE'),
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
    verifyPrivacyReadiness({
      readiness: {
        ...readiness,
        status: 'not_approved',
        candidateEvidenceDigest: readiness.approvedEvidenceDigest,
      },
      root,
      now,
    }),
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
        approvals: { ...readiness.approvals, privacyLead: null },
      },
      root,
      now,
    }),
    /privacyLead/,
  );

  await fs.appendFile(path.join(root, 'docs/governance/phase-3/README.md'), 'changed\n');
  await assert.rejects(
    verifyPrivacyReadiness({ readiness, root, now }),
    /does not match the current release-controlled source/,
  );
});

test('Point 6 binds role notices and their web/mobile access paths to approval', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);
  const now = Date.parse('2026-08-23T12:00:00.000Z');
  for (const file of [
    'apps/web/src/components/privacy/RolePrivacyNotices.tsx',
    'apps/web/src/components/layout/LegalPageLayout.tsx',
    'apps/web/src/pages/LoginPage.tsx',
    'apps/mobile/src/routes/router.tsx',
  ]) {
    await fs.appendFile(path.join(root, file), 'changed notice or access\n');
    await assert.rejects(
      verifyPrivacyReadiness({ readiness, root, now }),
      /does not match the current release-controlled source/,
    );
    await fs.writeFile(path.join(root, file), requiredFiles[file]);
  }
  await verifyPrivacyReadiness({ readiness, root, now });
});

test('Point 6 v2 uses sourced legal evidence without requiring counsel, support contact or a customer signature', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);
  const now = Date.parse('2026-08-23T12:00:00.000Z');
  assert.equal(readiness.approvals.privacyCounsel, undefined);
  assert.equal(readiness.approvals.customerAuthority, undefined);
  await verifyPrivacyReadiness({ readiness, root, now });
  await assert.rejects(
    verifyPrivacyReadiness({
      readiness: {
        ...readiness,
        subprocessors: { ...readiness.subprocessors, stripeBilling: null },
      },
      root,
      now,
    }),
    /Subprocessor stripeBilling/,
  );
  // Contacting a vendor or hiring counsel does not replace actual legal evidence.
  await assert.rejects(
    verifyPrivacyReadiness({
      readiness: {
        ...readiness,
        supportTicket: approved('SUPPORT/TICKET'),
        approvals: { ...readiness.approvals, privacyCounsel: approved('APPROVAL/COUNSEL') },
        legal: { ...readiness.legal, requirementsAssessment: null },
      },
      root,
      now,
    }),
    /Legal requirementsAssessment/,
  );
  for (const frameworks of [
    [],
    readiness.legal.requirementsAssessment.frameworks.slice(1),
    readiness.legal.requirementsAssessment.frameworks.map((entry) => ({
      ...entry,
      sourceUrl: 'https://example.com/legal',
    })),
    readiness.legal.requirementsAssessment.frameworks.map((entry) => ({
      ...entry,
      applicability: 'unknown',
    })),
  ]) {
    await assert.rejects(
      verifyPrivacyReadiness({
        readiness: {
          ...readiness,
          legal: {
            ...readiness.legal,
            requirementsAssessment: {
              ...readiness.legal.requirementsAssessment,
              frameworks,
            },
          },
        },
        root,
        now,
      }),
      /requirements assessment|government or privacy-regulator/,
    );
  }
  await assert.rejects(
    verifyPrivacyReadiness({ readiness: { ...readiness, format: 1 }, root, now }),
    /unsupported format/,
  );
  await fs.appendFile(
    path.join(root, 'docs/qa/commercial-readiness-review-2026-10-15.md'),
    'changed findings',
  );
  await assert.rejects(verifyPrivacyReadiness({ readiness, root, now }), /does not match/);
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

test('Point 6 records keep actual legal, vendor, customer, retention, and publication evidence open', async () => {
  const [governance, phase, milestone] = await Promise.all([
    read('docs/governance/point-6-privacy-readiness.md'),
    read('docs/governance/phase-3/README.md'),
    read('docs/MILESTONE_STATUS.md'),
  ]);

  assert.match(governance, /Point 6 remains open/);
  assert.match(governance, /does not constitute legal advice/i);
  assert.match(governance, /does not publish an unapproved privacy policy/i);
  assert.match(phase, /final evidence\/approval pending/);
  assert.doesNotMatch(phase, /Contracts and notices approved by counsel/);
  assert.match(milestone, /Commercial Readiness Remediation 11/);
});
