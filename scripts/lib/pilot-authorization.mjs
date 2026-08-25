import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { hashDirectory } from './release-attestation.mjs';

export const PILOT_AUTHORIZATION_FORMAT = 1;
export const DEFAULT_PILOT_AUTHORIZATION_PATH = 'docs/governance/pilot-authorization.json';

const EVIDENCE_DIRECTORIES = [
  'apps/web',
  'apps/mobile',
  'packages',
  'scripts',
  'supabase/migrations',
];

const EVIDENCE_FILES = [
  '.github/workflows/release-production.yml',
  'package.json',
  'pnpm-lock.yaml',
  'netlify.toml',
  'playwright.config.ts',
  'turbo.json',
];

const REQUIRED_LAUNCH_GATES = [
  'point4',
  'point5',
  'point6',
  'point7',
  'point8',
  'point9',
  'point10',
];

const REQUIRED_APPROVALS = [
  'platformAdministrator',
  'productOwner',
  'securityLead',
  'privacyLead',
  'operationsLead',
  'accessibilityQaLead',
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

export async function collectPilotReleaseEvidence(root = process.cwd()) {
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

export async function verifyPilotAuthorization({ authorization, root, now = Date.now() }) {
  if (authorization?.format !== PILOT_AUTHORIZATION_FORMAT) {
    throw new Error('Pilot authorization has an unsupported format.');
  }
  if (authorization.status !== 'authorized') {
    throw new Error('Commercial Release 1 pilot is not authorized.');
  }
  if (
    typeof authorization.pilotId !== 'string' ||
    !/^CR1-PILOT-[A-Z0-9-]{3,40}$/.test(authorization.pilotId)
  ) {
    throw new Error('Pilot authorization must contain a valid pilot ID.');
  }

  const approvedAt = Date.parse(authorization.approvedAt);
  const expiresAt = Date.parse(authorization.expiresAt);
  if (
    !Number.isFinite(approvedAt) ||
    !Number.isFinite(expiresAt) ||
    approvedAt > now ||
    expiresAt <= now ||
    expiresAt - approvedAt > 180 * 24 * 60 * 60 * 1000
  ) {
    throw new Error('Pilot authorization dates are invalid, expired, or exceed 180 days.');
  }

  const scope = authorization.scope;
  if (
    !Number.isInteger(scope?.tenantCount) ||
    scope.tenantCount < 1 ||
    scope.tenantCount > 3 ||
    !Number.isInteger(scope?.busFloor) ||
    scope.busFloor < 25 ||
    !Number.isInteger(scope?.busCeiling) ||
    scope.busCeiling < scope.busFloor ||
    scope.busCeiling > 100 ||
    !Number.isInteger(scope?.supportOperatingDays) ||
    scope.supportOperatingDays < 60
  ) {
    throw new Error('Pilot scope exceeds or does not meet the approved CR1 ceiling.');
  }
  for (const [key, label] of [
    ['schoolScopeReference', 'School scope'],
    ['participantSelectionReference', 'Participant selection'],
    ['agreementReference', 'Pilot agreement'],
  ]) {
    requireNonSecretReference(scope[key], label);
  }

  for (const gate of REQUIRED_LAUNCH_GATES) {
    if (authorization.launchGates?.[gate] !== 'approved') {
      throw new Error(`Pilot launch gate is not approved: ${gate}.`);
    }
  }

  for (const role of REQUIRED_APPROVALS) {
    requireNonSecretReference(
      authorization.approvalAssignments?.[role],
      `${role} assignment`,
    );
    const approval = authorization.approvals?.[role];
    const approvalTime = Date.parse(approval?.approvedAt);
    if (
      approval?.decision !== 'approved' ||
      !Number.isFinite(approvalTime) ||
      approvalTime > approvedAt ||
      approvalTime > now
    ) {
      throw new Error(`Pilot approval is missing or invalid: ${role}.`);
    }
    requireNonSecretReference(approval.evidenceReference, `${role} approval`);
  }

  if (
    authorization.rollbackAuthority?.immediateSuspension !== true ||
    authorization.rollbackAuthority?.immediateApplicationRollback !== true
  ) {
    throw new Error('Pilot authorization must grant immediate suspension and rollback authority.');
  }
  requireNonSecretReference(
    authorization.rollbackAuthority?.primaryContactReference,
    'Primary rollback contact',
  );
  requireNonSecretReference(
    authorization.rollbackAuthority?.backupContactReference,
    'Backup rollback contact',
  );

  const currentEvidence = await collectPilotReleaseEvidence(root);
  if (authorization.approvedEvidenceDigest !== currentEvidence.digest) {
    throw new Error('Pilot authorization does not match the current release-controlled source.');
  }

  return {
    pilotId: authorization.pilotId,
    expiresAt: authorization.expiresAt,
    evidenceDigest: currentEvidence.digest,
  };
}
