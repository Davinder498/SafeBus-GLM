import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  collectOperationsReleaseEvidence,
  verifyOperationsReadiness,
} from '../../scripts/lib/operations-readiness.mjs';

const read = (file) => fs.readFile(file, 'utf8');

const requiredFiles = {
  'docs/operations/complete-automatic-disposal.md': 'synthetic complete disposal evidence\n',
  'config/pending/complete-disposal.json': 'synthetic complete disposal evidence\n',
  'config/pending/complete-disposal-authorization.json': 'synthetic complete disposal evidence\n',
  'supabase/migrations/pending/20261105172229_retention_lifecycle.sql':
    'synthetic complete disposal evidence\n',
  'supabase/migrations/pending/20261105194609_complete_automatic_disposal.sql':
    'synthetic complete disposal evidence\n',
  'apps/web/netlify/functions/disposal-accounts.mjs': 'synthetic complete disposal evidence\n',
  'apps/web/netlify/functions/disposal-records.mjs': 'synthetic complete disposal evidence\n',
  'apps/web/netlify/functions/retention-lifecycle-scheduled.mjs':
    'synthetic complete disposal evidence\n',
  'apps/web/src/pages/RecordsDisposalPage.tsx': 'synthetic complete disposal evidence\n',
  'apps/web/src/services/disposalService.ts': 'synthetic complete disposal evidence\n',
  'tests/release/complete-disposal-postgres.test.mjs': 'synthetic complete disposal evidence\n',
  'tests/smoke/records-disposal.spec.ts': 'synthetic complete disposal evidence\n',

  'apps/web/src/__tests__/safebus-retention-scheduled.test.mjs': 'synthetic runner contract\n',
  'docs/operations/operating-observation-2026-11-05.json': 'synthetic operating observation\n',
  'docs/operations/support-incident-runbook.md': 'synthetic acceptance evidence\n',
  'docs/operations/managed-onboarding.md': 'synthetic acceptance evidence\n',
  'docs/operations/privacy-operations-evidence-2026-11-05.md': 'synthetic acceptance evidence\n',
  'docs/governance/phase-3/supplier-review-2026-11-05.md': 'synthetic acceptance evidence\n',
  'docs/governance/phase-3/retention-schedule.md': 'synthetic acceptance evidence\n',
  'docs/governance/phase-3/retention-observation-2026-11-05.json':
    'synthetic acceptance evidence\n',
  'scripts/lib/retention-verification.mjs': 'synthetic acceptance evidence\n',
  'apps/web/src/__tests__/retention-scheduled.test.mjs': 'synthetic acceptance evidence\n',

  'docs/governance/commercial-readiness-requirements.md': 'synthetic review evidence',
  'docs/qa/commercial-readiness-review-2026-10-15.md': 'synthetic review evidence',
  'docs/qa/commercial-readiness-hosted-observation-2026-10-15.json': 'synthetic review evidence',
  'apps/web/netlify/functions/guardian-notification-email.mjs':
    'export const notification = true;\n',
  'apps/web/src/services/adminLiveMonitoringService.ts': 'export const monitoring = true;\n',
  '.github/workflows/production-health.yml': 'name: Production health monitor\n',
  '.github/workflows/release-production.yml': 'name: Release production\n',
  'docs/governance/phase-3/breach-response.md': '# Breach response\n',
  'docs/governance/phase-4/rollback-runbook.md': '# Rollback\n',
  'docs/governance/point-9-operational-readiness.md': '# Point 9\n',
  'docs/qa/point-9-operations-acceptance.md': '# Acceptance\n',
  'netlify.toml': '[build]\n',
  'package.json': '{}\n',
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  'scripts/check-operations-readiness.mjs': 'export const check = true;\n',
  'scripts/check-production-health.mjs': 'export const health = true;\n',
  'scripts/lib/operations-readiness.mjs': 'export const readiness = true;\n',
  'scripts/lib/production-health.mjs': 'export const productionHealth = true;\n',
  'scripts/lib/monitor-cadence.mjs': 'export const cadence = true;\n',
  'scripts/lib/monitor-alert-email.mjs': 'export const alerts = true;\n',
  'scripts/lib/production-application-signals.mjs': 'export const applicationSignals = true;\n',
  'scripts/print-operations-release-digest.mjs': 'export const digest = true;\n',
  'tests/release/operations-authorization.test.mjs': 'export const authorization = true;\n',
  'tests/release/operations-readiness.test.mjs': 'export const contract = true;\n',
  'tests/release/production-health.test.mjs': 'export const healthTest = true;\n',
  'tests/release/production-application-signals.test.mjs': 'export const applicationSignalsTest = true;\n',
  'tests/release/monitor-alert-email.test.mjs': 'export const alertTest = true;\n',
};

const onCallKeys = ['primaryOwner', 'backupOwner', 'supportedHours', 'escalationPath'];
const thresholdKeys = [
  'availability',
  'latency',
  'gpsFreshness',
  'notificationQueue',
  'providerQuota',
  'errorRate',
];
const alertKeys = [
  'publicHealthRouting',
  'failureNotificationDrill',
  'applicationErrorMonitoring',
  'errorRedactionDrill',
  'geoapifySeventyPercentAlert',
  'geoapifyNinetyPercentAlert',
];
const supportKeys = [
  'intakeProcess',
  'severityAndEscalation',
  'customerCommunication',
  'ticketRetention',
];

async function fixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'safebus-operations-readiness-'));
  for (const [name, content] of Object.entries(requiredFiles)) {
    const target = path.join(root, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return root;
}

function approved(reference, extra = {}) {
  return {
    decision: 'approved',
    approvedAt: '2026-08-20T12:00:00.000Z',
    evidenceReference: reference,
    ...extra,
  };
}

function approvedEntries(keys, prefix) {
  return Object.fromEntries(keys.map((key) => [key, approved(`${prefix}/${key}`)]));
}

async function approvedFixture(root) {
  const evidence = await collectOperationsReleaseEvidence(root);
  return {
    format: 2,
    status: 'approved',
    approvalId: 'CR1-OPS-ALBERTA-001',
    approvedEvidenceDigest: evidence.digest,
    approvedAt: '2026-08-22T12:00:00.000Z',
    expiresAt: '2026-11-01T12:00:00.000Z',
    onCall: approvedEntries(onCallKeys, 'OPS/ONCALL'),
    thresholds: approvedEntries(thresholdKeys, 'OPS/THRESHOLD'),
    alerting: approvedEntries(alertKeys, 'OPS/ALERT'),
    exercises: {
      p1OutageTabletop: approved('OPS/EXERCISE/P1'),
      privacyIncidentTabletop: approved('OPS/EXERCISE/PRIVACY'),
    },
    support: approvedEntries(supportKeys, 'OPS/SUPPORT'),
    observation: {
      result: 'passed',
      startedAt: '2026-08-12T12:00:00.000Z',
      endedAt: '2026-08-20T12:00:00.000Z',
      scheduledRunsObserved: 745,
      unexplainedMonitoringGaps: 0,
      unresolvedP1OrP2Incidents: 0,
      evidenceReference: 'OPS/OBSERVATION/001',
    },
    approvals: {
      platformAdministrator: approved('OPS/APPROVAL/PLATFORM'),
      securityLead: approved('OPS/APPROVAL/SECURITY'),
      privacyLead: approved('OPS/APPROVAL/PRIVACY'),
      operationsLead: approved('OPS/APPROVAL/OPERATIONS'),
    },
  };
}

test('valid Point 9 readiness is measured, observed, approved, and source-bound', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);
  const result = await verifyOperationsReadiness({
    readiness,
    root,
    now: Date.parse('2026-08-23T12:00:00.000Z'),
  });
  assert.equal(result.approvalId, readiness.approvalId);
  assert.equal(result.evidenceDigest, readiness.approvedEvidenceDigest);
});

test('Point 9 fails closed when open or expired', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);
  const now = Date.parse('2026-08-23T12:00:00.000Z');

  await assert.rejects(
    verifyOperationsReadiness({
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
    verifyOperationsReadiness({
      readiness,
      root,
      now: Date.parse('2027-01-01T00:00:00.000Z'),
    }),
    /invalid, expired/,
  );
});

test('Point 9 rejects evidence gaps, missing incident response, short observation, and source drift', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);
  const now = Date.parse('2026-08-23T12:00:00.000Z');

  await assert.rejects(
    verifyOperationsReadiness({
      readiness: {
        ...readiness,
        alerting: { ...readiness.alerting, errorRedactionDrill: null },
      },
      root,
      now,
    }),
    /errorRedactionDrill/,
  );
  await assert.rejects(
    verifyOperationsReadiness({
      readiness: {
        ...readiness,
        exercises: {
          ...readiness.exercises,
          privacyIncidentTabletop: null,
        },
      },
      root,
      now,
    }),
    /Privacy incident tabletop/,
  );
  await assert.rejects(
    verifyOperationsReadiness({
      readiness: {
        ...readiness,
        observation: { ...readiness.observation, startedAt: '2026-08-15T12:00:00.000Z' },
      },
      root,
      now,
    }),
    /seven observed days/,
  );

  await fs.appendFile(
    path.join(root, 'apps/web/src/services/adminLiveMonitoringService.ts'),
    'changed\n',
  );
  await assert.rejects(
    verifyOperationsReadiness({ readiness, root, now }),
    /does not match the current release-controlled source/,
  );
});

test('Point 9 v2 needs no restore, rollback drill or recovery-time evidence, but retains operating safeguards', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);
  const now = Date.parse('2026-08-23T12:00:00.000Z');
  assert.equal(readiness.exercises.backupRestore, undefined);
  assert.equal(readiness.exercises.applicationRollback, undefined);
  await verifyOperationsReadiness({ readiness, root, now });
  for (const [group, key] of [
    ['onCall', 'primaryOwner'],
    ['thresholds', 'errorRate'],
    ['alerting', 'applicationErrorMonitoring'],
    ['support', 'intakeProcess'],
    ['approvals', 'securityLead'],
  ]) {
    await assert.rejects(
      verifyOperationsReadiness({
        readiness: { ...readiness, [group]: { ...readiness[group], [key]: null } },
        root,
        now,
      }),
      /evidence is missing/,
    );
  }
  await assert.rejects(
    verifyOperationsReadiness({ readiness: { ...readiness, format: 1 }, root, now }),
    /unsupported format/,
  );
  await fs.appendFile(
    path.join(root, 'docs/qa/commercial-readiness-review-2026-10-15.md'),
    'changed findings',
  );
  await assert.rejects(verifyOperationsReadiness({ readiness, root, now }), /does not match/);
});

test('production release verifies Point 9 before pilot, database, or application actions', async () => {
  const [workflow, packageJson, currentReadiness] = await Promise.all([
    read('.github/workflows/release-production.yml'),
    read('package.json').then(JSON.parse),
    read('docs/governance/operations-readiness.json').then(JSON.parse),
  ]);

  assert.match(workflow, /Verify active Point 9 operational readiness/);
  assert.ok(workflow.indexOf('pnpm map:verify') < workflow.indexOf('pnpm operations:verify'));
  assert.ok(workflow.indexOf('pnpm operations:verify') < workflow.indexOf('pnpm pilot:verify'));
  assert.ok(
    workflow.indexOf('pnpm operations:verify') < workflow.indexOf('pnpm migrations:deploy'),
  );
  assert.ok(workflow.indexOf('pnpm operations:verify') < workflow.indexOf('netlify deploy --prod'));
  assert.equal(
    packageJson.scripts['operations:verify'],
    'node scripts/check-operations-readiness.mjs',
  );
  assert.equal(currentReadiness.status, 'not_approved');
});

test('Point 9 governance keeps operating and human evidence open', async () => {
  const [governance, acceptance, milestone] = await Promise.all([
    read('docs/governance/point-9-operational-readiness.md'),
    read('docs/qa/point-9-operations-acceptance.md'),
    read('docs/MILESTONE_STATUS.md'),
  ]);

  assert.match(governance, /operating and human evidence pending/i);
  assert.match(governance, /operations-readiness\.json/);
  assert.match(acceptance, /Partially executed/);
  assert.match(milestone, /Commercial Readiness Remediation 13/);
});

test('current supplier, retention and response evidence changes invalidate approval', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);
  const now = Date.parse('2026-08-23T12:00:00.000Z');
  for (const file of [
    'docs/operations/support-incident-runbook.md',
    'docs/operations/managed-onboarding.md',
    'docs/operations/privacy-operations-evidence-2026-11-05.md',
    'docs/governance/phase-3/supplier-review-2026-11-05.md',
    'docs/governance/phase-3/retention-schedule.md',
    'docs/governance/phase-3/retention-observation-2026-11-05.json',
    'scripts/lib/retention-verification.mjs',
    'apps/web/src/__tests__/retention-scheduled.test.mjs',
  ]) {
    await fs.appendFile(path.join(root, file), 'changed evidence\n');
    await assert.rejects(
      verifyOperationsReadiness({ readiness, root, now }),
      /does not match the current release-controlled source/,
    );
    await fs.writeFile(path.join(root, file), requiredFiles[file]);
  }
  await verifyOperationsReadiness({ readiness, root, now });
});
