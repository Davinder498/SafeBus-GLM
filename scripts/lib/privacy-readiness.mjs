import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { hashDirectory } from './release-attestation.mjs';

export const PRIVACY_READINESS_FORMAT = 1;
export const DEFAULT_PRIVACY_READINESS_PATH = 'docs/governance/privacy-readiness.json';

const EVIDENCE_DIRECTORIES = ['docs/governance/phase-3'];

const EVIDENCE_FILES = [
  '.github/workflows/release-production.yml',
  'apps/web/netlify/functions/safebus-retention-scheduled.mjs',
  'apps/web/src/lib/driverLocationDisclosure.ts',
  'docs/governance/commercial-release-scope.md',
  'docs/governance/data-classification.md',
  'docs/governance/risk-register.md',
  'docs/governance/role-responsibility-matrix.md',
  'netlify.toml',
  'package.json',
  'pnpm-lock.yaml',
  'scripts/check-privacy-readiness.mjs',
  'scripts/lib/privacy-readiness.mjs',
  'scripts/print-privacy-release-digest.mjs',
  'supabase/migrations/0069_phase3_retention_foundation.sql',
  'supabase/migrations/0090_phase7_byod_android_tracking.sql',
  'tests/release/privacy-readiness.test.mjs',
  'tests/rls/phase3-retention-rls.sql',
];

const REQUIRED_LEGAL_EVIDENCE = [
  'statutoryMapping',
  'safeBusRole',
  'customerAuthority',
  'privacyImpactAssessment',
];

const REQUIRED_PROGRAM_EVIDENCE = [
  'namedPrivacyRoles',
  'accessAndCorrection',
  'guardianAuthority',
  'studentProcesses',
  'breachResponse',
  'breachTabletop',
  'legalHoldProcedure',
];

const REQUIRED_CONTRACTS = [
  'masterServicesAgreement',
  'dataProcessingAgreement',
  'securitySchedule',
  'serviceLevelAgreement',
  'acceptableUseTerms',
  'privacyPolicy',
  'dataReturnAndDestruction',
];

const REQUIRED_RETENTION_EVIDENCE = [
  'approvedSchedule',
  'isolatedEnforcementTest',
  'deletionDryRun',
  'backupRetentionWindow',
];

const REQUIRED_SUBPROCESSORS = [
  'supabaseHostingAndAuth',
  'netlifyHostingAndFunctions',
  'geoapifyMaps',
  'emailDelivery',
  'errorMonitoring',
];

const REQUIRED_RESIDENCY_EVIDENCE = [
  'productionDatabase',
  'databaseBackups',
  'applicationHosting',
  'supportAccess',
  'crossBorderFlows',
];

const REQUIRED_NOTICES = [
  'guardianNotice',
  'driverByodNotice',
  'publicPrivacyPolicy',
  'googlePlayDataSafety',
];

const REQUIRED_APPROVALS = [
  'platformAdministrator',
  'productOwner',
  'securityLead',
  'privacyLead',
  'privacyCounsel',
  'customerAuthority',
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

export async function collectPrivacyReleaseEvidence(root = process.cwd()) {
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

export async function verifyPrivacyReadiness({ readiness, root, now = Date.now() }) {
  if (readiness?.format !== PRIVACY_READINESS_FORMAT) {
    throw new Error('Privacy readiness has an unsupported format.');
  }
  if (readiness.status !== 'approved') {
    throw new Error('Commercial Release 1 privacy and legal readiness is not approved.');
  }
  if (
    typeof readiness.approvalId !== 'string' ||
    !/^CR1-PRIVACY-[A-Z0-9-]{3,40}$/.test(readiness.approvalId)
  ) {
    throw new Error('Privacy readiness must contain a valid approval ID.');
  }

  const approvedAt = Date.parse(readiness.approvedAt);
  const expiresAt = Date.parse(readiness.expiresAt);
  if (
    !Number.isFinite(approvedAt) ||
    !Number.isFinite(expiresAt) ||
    approvedAt > now ||
    expiresAt <= now ||
    expiresAt - approvedAt > 366 * 24 * 60 * 60 * 1000
  ) {
    throw new Error('Privacy readiness dates are invalid, expired, or exceed 366 days.');
  }

  for (const item of REQUIRED_LEGAL_EVIDENCE) {
    requireApprovedEvidence(readiness.legal?.[item], `Legal ${item}`, approvedAt, now);
  }
  for (const item of REQUIRED_PROGRAM_EVIDENCE) {
    requireApprovedEvidence(
      readiness.privacyProgram?.[item],
      `Privacy program ${item}`,
      approvedAt,
      now,
    );
  }
  for (const item of REQUIRED_CONTRACTS) {
    requireApprovedEvidence(readiness.contracts?.[item], `Contract ${item}`, approvedAt, now);
  }
  for (const item of REQUIRED_RETENTION_EVIDENCE) {
    requireApprovedEvidence(readiness.retention?.[item], `Retention ${item}`, approvedAt, now);
  }

  for (const processor of REQUIRED_SUBPROCESSORS) {
    const evidence = readiness.subprocessors?.[processor];
    requireApprovedEvidence(evidence, `Subprocessor ${processor}`, approvedAt, now);
    requireNonSecretReference(
      evidence.processingLocationReference,
      `${processor} processing location`,
    );
    requireNonSecretReference(evidence.contractReference, `${processor} contract`);
    requireNonSecretReference(evidence.securityReviewReference, `${processor} security review`);
    requireNonSecretReference(
      evidence.crossBorderDecisionReference,
      `${processor} cross-border decision`,
    );
  }

  for (const item of REQUIRED_RESIDENCY_EVIDENCE) {
    requireApprovedEvidence(readiness.residency?.[item], `Residency ${item}`, approvedAt, now);
  }
  for (const item of REQUIRED_NOTICES) {
    requireApprovedEvidence(readiness.notices?.[item], `Notice ${item}`, approvedAt, now);
  }

  const policyUrl = readiness.notices?.publicPrivacyPolicy?.publicUrl;
  if (
    typeof policyUrl !== 'string' ||
    !/^https:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?$/.test(policyUrl)
  ) {
    throw new Error('The approved public privacy policy must have an HTTPS URL.');
  }

  for (const role of REQUIRED_APPROVALS) {
    requireApprovedEvidence(readiness.approvals?.[role], `${role} approval`, approvedAt, now);
  }

  const currentEvidence = await collectPrivacyReleaseEvidence(root);
  if (readiness.approvedEvidenceDigest !== currentEvidence.digest) {
    throw new Error('Privacy readiness does not match the current release-controlled source.');
  }

  return {
    approvalId: readiness.approvalId,
    expiresAt: readiness.expiresAt,
    evidenceDigest: currentEvidence.digest,
  };
}
