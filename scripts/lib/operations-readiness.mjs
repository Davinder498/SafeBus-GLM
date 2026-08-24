import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { hashDirectory } from './release-attestation.mjs';

export const OPERATIONS_READINESS_FORMAT = 1;
export const DEFAULT_OPERATIONS_READINESS_PATH = 'docs/governance/operations-readiness.json';

const EVIDENCE_DIRECTORIES = ['apps/web/netlify/functions', 'apps/web/src/services'];

const EVIDENCE_FILES = [
  '.github/workflows/production-health.yml',
  '.github/workflows/release-production.yml',
  'docs/governance/phase-3/breach-response.md',
  'docs/governance/phase-4/rollback-runbook.md',
  'docs/governance/point-9-operational-readiness.md',
  'docs/qa/point-9-operations-acceptance.md',
  'netlify.toml',
  'package.json',
  'pnpm-lock.yaml',
  'scripts/check-operations-readiness.mjs',
  'scripts/check-production-health.mjs',
  'scripts/lib/operations-readiness.mjs',
  'scripts/lib/production-health.mjs',
  'scripts/print-operations-release-digest.mjs',
  'tests/release/operations-authorization.test.mjs',
  'tests/release/operations-readiness.test.mjs',
  'tests/release/production-health.test.mjs',
];

const REQUIRED_ON_CALL_EVIDENCE = [
  'primaryOwner',
  'backupOwner',
  'supportedHours',
  'escalationPath',
];

const REQUIRED_THRESHOLDS = [
  'availability',
  'latency',
  'gpsFreshness',
  'notificationQueue',
  'providerQuota',
  'errorRate',
];

const REQUIRED_ALERT_EVIDENCE = [
  'publicHealthRouting',
  'failureNotificationDrill',
  'applicationErrorMonitoring',
  'errorRedactionDrill',
  'geoapifySeventyPercentAlert',
  'geoapifyNinetyPercentAlert',
];

const REQUIRED_SUPPORT_EVIDENCE = [
  'intakeProcess',
  'severityAndEscalation',
  'customerCommunication',
  'ticketRetention',
];

const REQUIRED_APPROVALS = [
  'platformAdministrator',
  'securityLead',
  'privacyLead',
  'operationsLead',
];

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function hashFile(file) {
  return digest(await fs.readFile(file));
}

function requireNonSecretReference(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,199}$/.test(value)) {
    throw new Error(`${label} must be a non-secret evidence reference.`);
  }
}

function requireApprovedEvidence(evidence, label, approvedAt, now) {
  const evidenceTime = Date.parse(evidence?.approvedAt);
  if (
    evidence?.decision !== 'approved' ||
    !Number.isFinite(evidenceTime) ||
    evidenceTime > approvedAt ||
    evidenceTime > now
  ) {
    throw new Error(`${label} evidence is missing, not approved, or has an invalid date.`);
  }
  requireNonSecretReference(evidence.evidenceReference, label);
}

function requireMeasuredExercise(exercise, label, approvedAt, now) {
  requireApprovedEvidence(exercise, label, approvedAt, now);
  if (
    !Number.isInteger(exercise.recoveryTimeMinutes) ||
    exercise.recoveryTimeMinutes < 0 ||
    exercise.recoveryTimeMinutes > 480
  ) {
    throw new Error(`${label} must include a recovery time from 0 to 480 minutes.`);
  }
}

export async function collectOperationsReleaseEvidence(root = process.cwd()) {
  const directories = {};
  for (const directory of EVIDENCE_DIRECTORIES) {
    directories[directory] = await hashDirectory(path.join(root, directory));
  }

  const files = {};
  for (const file of EVIDENCE_FILES) {
    files[file] = await hashFile(path.join(root, file));
  }

  const evidence = { directories, files };
  return { ...evidence, digest: digest(JSON.stringify(evidence)) };
}

export async function verifyOperationsReadiness({ readiness, root, now = Date.now() }) {
  if (readiness?.format !== OPERATIONS_READINESS_FORMAT) {
    throw new Error('Operations readiness has an unsupported format.');
  }
  if (readiness.status !== 'approved') {
    throw new Error('Commercial Release 1 operational readiness is not approved.');
  }
  if (
    typeof readiness.approvalId !== 'string' ||
    !/^CR1-OPS-[A-Z0-9-]{3,40}$/.test(readiness.approvalId)
  ) {
    throw new Error('Operations readiness must contain a valid approval ID.');
  }

  const approvedAt = Date.parse(readiness.approvedAt);
  const expiresAt = Date.parse(readiness.expiresAt);
  if (
    !Number.isFinite(approvedAt) ||
    !Number.isFinite(expiresAt) ||
    approvedAt > now ||
    expiresAt <= now ||
    expiresAt - approvedAt > 90 * 24 * 60 * 60 * 1000
  ) {
    throw new Error('Operations readiness dates are invalid, expired, or exceed 90 days.');
  }

  for (const item of REQUIRED_ON_CALL_EVIDENCE) {
    requireApprovedEvidence(readiness.onCall?.[item], `On-call ${item}`, approvedAt, now);
  }
  for (const item of REQUIRED_THRESHOLDS) {
    requireApprovedEvidence(
      readiness.thresholds?.[item],
      `Operations threshold ${item}`,
      approvedAt,
      now,
    );
  }
  for (const item of REQUIRED_ALERT_EVIDENCE) {
    requireApprovedEvidence(readiness.alerting?.[item], `Alerting ${item}`, approvedAt, now);
  }
  for (const item of REQUIRED_SUPPORT_EVIDENCE) {
    requireApprovedEvidence(readiness.support?.[item], `Support ${item}`, approvedAt, now);
  }

  requireMeasuredExercise(
    readiness.exercises?.applicationRollback,
    'Application rollback exercise',
    approvedAt,
    now,
  );
  requireMeasuredExercise(
    readiness.exercises?.backupRestore,
    'Backup restore exercise',
    approvedAt,
    now,
  );
  if (
    readiness.exercises.backupRestore.isolatedCanadianTarget !== true ||
    !Number.isInteger(readiness.exercises.backupRestore.recoveryPointMinutes) ||
    readiness.exercises.backupRestore.recoveryPointMinutes < 0 ||
    readiness.exercises.backupRestore.recoveryPointMinutes > 1_440
  ) {
    throw new Error(
      'Backup restore evidence requires an isolated Canadian target and a 0 to 1440 minute recovery point.',
    );
  }
  requireApprovedEvidence(
    readiness.exercises?.p1OutageTabletop,
    'P1 outage tabletop',
    approvedAt,
    now,
  );
  requireApprovedEvidence(
    readiness.exercises?.privacyIncidentTabletop,
    'Privacy incident tabletop',
    approvedAt,
    now,
  );

  const observation = readiness.observation;
  const startedAt = Date.parse(observation?.startedAt);
  const endedAt = Date.parse(observation?.endedAt);
  if (
    observation?.result !== 'passed' ||
    !Number.isFinite(startedAt) ||
    !Number.isFinite(endedAt) ||
    endedAt > approvedAt ||
    endedAt > now ||
    endedAt - startedAt < 7 * 24 * 60 * 60 * 1000 ||
    !Number.isInteger(observation.scheduledRunsObserved) ||
    observation.scheduledRunsObserved < 1 ||
    observation.unexplainedMonitoringGaps !== 0 ||
    observation.unresolvedP1OrP2Incidents !== 0
  ) {
    throw new Error(
      'Operations readiness requires seven observed days without unexplained gaps or unresolved P1/P2 incidents.',
    );
  }
  requireNonSecretReference(observation.evidenceReference, 'Operations observation');

  for (const role of REQUIRED_APPROVALS) {
    requireApprovedEvidence(
      readiness.approvals?.[role],
      `${role} operations approval`,
      approvedAt,
      now,
    );
  }

  const currentEvidence = await collectOperationsReleaseEvidence(root);
  if (readiness.approvedEvidenceDigest !== currentEvidence.digest) {
    throw new Error('Operations readiness does not match the current release-controlled source.');
  }

  return {
    approvalId: readiness.approvalId,
    expiresAt: readiness.expiresAt,
    evidenceDigest: currentEvidence.digest,
  };
}
