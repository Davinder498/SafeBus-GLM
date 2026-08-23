import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { hashDirectory } from './release-attestation.mjs';

export const MAP_READINESS_FORMAT = 1;
export const DEFAULT_MAP_READINESS_PATH = 'docs/governance/map-readiness.json';

const EVIDENCE_DIRECTORIES = ['apps/web/src/components/admin', 'apps/web/src/components/guardian'];

const EVIDENCE_FILES = [
  '.github/workflows/release-production.yml',
  'apps/web/netlify/functions/map-tile-config.mjs',
  'apps/web/src/services/mapTileConfigService.ts',
  'docs/governance/point-8-map-readiness.md',
  'docs/qa/point-8-map-readiness-acceptance.md',
  'netlify.toml',
  'package.json',
  'pnpm-lock.yaml',
  'scripts/check-map-readiness.mjs',
  'scripts/lib/map-readiness.mjs',
  'scripts/print-map-release-digest.mjs',
  'tests/release/map-authorization.test.mjs',
  'tests/release/map-readiness.test.mjs',
  'tests/smoke/admin-live-trip-monitoring.spec.ts',
  'tests/smoke/admin-simple-workflow.spec.ts',
  'tests/smoke/guardian-live-bus-map.spec.ts',
];

const REQUIRED_PROVIDER_EVIDENCE = [
  'providerSelection',
  'paidPlanAndSla',
  'restrictedProductionKey',
  'securityReview',
  'privacyAndCrossBorderApproval',
];

const REQUIRED_QUOTA_EVIDENCE = [
  'seventyPercentAlert',
  'ninetyPercentAlert',
  'alertRoutingDrill',
  'pilotCapacityReview',
];

const REQUIRED_ACCEPTANCE_EVIDENCE = [
  'productionWeb',
  'supportedAndroid',
  'guardianPrivacy',
  'adminFleet',
  'routeAndStopEditor',
  'providerOutage',
  'providerRecovery',
  'attribution',
];

const REQUIRED_APPROVALS = [
  'platformAdministrator',
  'productOwner',
  'securityLead',
  'privacyLead',
  'operationsLead',
  'qaLead',
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

export async function collectMapReleaseEvidence(root = process.cwd()) {
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

export async function verifyMapReadiness({ readiness, root, now = Date.now() }) {
  if (readiness?.format !== MAP_READINESS_FORMAT) {
    throw new Error('Map readiness has an unsupported format.');
  }
  if (readiness.status !== 'approved') {
    throw new Error('Commercial Release 1 map readiness is not approved.');
  }
  if (
    typeof readiness.approvalId !== 'string' ||
    !/^CR1-MAPS-[A-Z0-9-]{3,40}$/.test(readiness.approvalId)
  ) {
    throw new Error('Map readiness must contain a valid approval ID.');
  }
  if (readiness.provider !== 'geoapify') {
    throw new Error('Map readiness must use the approved Geoapify provider.');
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
    throw new Error('Map readiness dates are invalid, expired, or exceed 90 days.');
  }

  for (const item of REQUIRED_PROVIDER_EVIDENCE) {
    requireApprovedEvidence(
      readiness.providerEvidence?.[item],
      `Map provider ${item}`,
      approvedAt,
      now,
    );
  }
  for (const item of REQUIRED_QUOTA_EVIDENCE) {
    requireApprovedEvidence(readiness.quotaEvidence?.[item], `Map quota ${item}`, approvedAt, now);
  }
  for (const item of REQUIRED_ACCEPTANCE_EVIDENCE) {
    requireApprovedEvidence(
      readiness.acceptance?.[item],
      `Map acceptance ${item}`,
      approvedAt,
      now,
    );
  }

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
    observation.unexplainedProviderFailures !== 0 ||
    observation.quotaExhaustions !== 0
  ) {
    throw new Error(
      'Map readiness requires a passed seven-day observation without unexplained failures or quota exhaustion.',
    );
  }
  requireNonSecretReference(observation.evidenceReference, 'Map seven-day observation');

  for (const role of REQUIRED_APPROVALS) {
    requireApprovedEvidence(readiness.approvals?.[role], `${role} map approval`, approvedAt, now);
  }

  const currentEvidence = await collectMapReleaseEvidence(root);
  if (readiness.approvedEvidenceDigest !== currentEvidence.digest) {
    throw new Error('Map readiness does not match the current release-controlled source.');
  }

  return {
    approvalId: readiness.approvalId,
    expiresAt: readiness.expiresAt,
    evidenceDigest: currentEvidence.digest,
  };
}
