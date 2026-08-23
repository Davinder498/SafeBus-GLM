import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { hashDirectory } from './release-attestation.mjs';

export const ANDROID_READINESS_FORMAT = 1;
export const DEFAULT_ANDROID_READINESS_PATH = 'docs/governance/android-readiness.json';

const EVIDENCE_DIRECTORIES = ['apps/mobile', 'packages/types'];

const EVIDENCE_FILES = [
  '.github/workflows/ci.yml',
  '.github/workflows/release-android.yml',
  'apps/web/src/components/driver/BusQrStartScanner.tsx',
  'apps/web/src/lib/driverLocationDisclosure.ts',
  'package.json',
  'pnpm-lock.yaml',
  'scripts/check-android-readiness.mjs',
  'scripts/create-android-release-manifest.mjs',
  'scripts/lib/android-readiness.mjs',
  'scripts/print-android-release-digest.mjs',
  'supabase/migrations/0086_phase7_production_driver_tracking.sql',
  'supabase/migrations/0090_phase7_byod_android_tracking.sql',
  'tests/release/android-byod-contract.test.mjs',
  'tests/release/android-readiness.test.mjs',
];

const REQUIRED_FIELD_SCENARIOS = [
  'screenLocked',
  'appBackgrounded',
  'networkLoss',
  'crashRestart',
  'deviceReboot',
  'sharedGuardianDriverBinary',
  'byodSecurity',
  'vendorBatteryControls',
  'lowBattery',
  'ruralConnectivity',
  'eightHourDay',
  'remoteTripEnd',
  'forgeryCrossDriver',
];

const REQUIRED_PLAY_EVIDENCE = [
  'backgroundLocationDeclaration',
  'reviewVideo',
  'dataSafetyForm',
  'testAccount',
  'publicPrivacyPolicy',
];

const REQUIRED_CUSTOMER_EVIDENCE = [
  'byodPolicy',
  'supportAndReimbursement',
  'lostDeviceProcess',
  'driverConsentNotice',
];

const REQUIRED_APPROVALS = [
  'platformAdministrator',
  'productOwner',
  'securityLead',
  'privacyLead',
  'operationsLead',
  'qaLead',
  'driverRepresentative',
];

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function hashFile(file) {
  return digest(await fs.readFile(file));
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
}

function requireNonSecretReference(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/#-]{2,199}$/.test(value)) {
    throw new Error(`${label} must be a non-secret evidence reference.`);
  }
}

function requirePassedEvidence(evidence, label, approvedAt, now) {
  const executedAt = Date.parse(evidence?.executedAt);
  if (
    evidence?.result !== 'passed' ||
    !Number.isFinite(executedAt) ||
    executedAt > approvedAt ||
    executedAt > now
  ) {
    throw new Error(`${label} evidence is missing, not passed, or has an invalid date.`);
  }
  requireNonSecretReference(evidence.evidenceReference, label);
}

export async function collectAndroidReleaseEvidence(root = process.cwd()) {
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

export async function verifyAndroidReadiness({ readiness, root, now = Date.now() }) {
  if (readiness?.format !== ANDROID_READINESS_FORMAT) {
    throw new Error('Android readiness has an unsupported format.');
  }
  if (readiness.status !== 'approved') {
    throw new Error('Commercial Release 1 Android readiness is not approved.');
  }
  if (
    typeof readiness.approvalId !== 'string' ||
    !/^CR1-ANDROID-[A-Z0-9-]{3,40}$/.test(readiness.approvalId)
  ) {
    throw new Error('Android readiness must contain a valid approval ID.');
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
    throw new Error('Android readiness dates are invalid, expired, or exceed 90 days.');
  }

  const artifact = readiness.signedBundle;
  if (!/^[a-f0-9]{40}$/.test(artifact?.sourceCommit ?? '')) {
    throw new Error('Signed Android bundle must identify its exact source commit.');
  }
  requireDigest(artifact.sourceEvidenceDigest, 'Signed bundle source evidence');
  requireDigest(artifact.aabSha256, 'Signed Android bundle');
  requireDigest(artifact.signingCertificateSha256, 'Android signing certificate');
  requireNonSecretReference(artifact.workflowRunReference, 'Signed bundle workflow run');
  if (
    artifact.applicationId !== 'com.safebusalberta.app' ||
    !Number.isInteger(artifact.versionCode) ||
    artifact.versionCode < 1 ||
    typeof artifact.versionName !== 'string' ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(artifact.versionName)
  ) {
    throw new Error('Signed Android bundle identity or version is invalid.');
  }

  const limits = readiness.approvedLimits;
  if (
    limits?.batteryPercentagePointsMax !== 20 ||
    limits?.mobileDataMbMax !== 25 ||
    limits?.missingRequiredEventsMax !== 0 ||
    limits?.offlineRecoveryMinutesMax !== 15
  ) {
    throw new Error('Android operating limits do not match the approved CR1 ceilings.');
  }

  const measurements = readiness.measuredResults;
  if (
    typeof measurements?.batteryPercentagePoints !== 'number' ||
    measurements.batteryPercentagePoints < 0 ||
    measurements.batteryPercentagePoints > limits.batteryPercentagePointsMax ||
    typeof measurements?.mobileDataMb !== 'number' ||
    measurements.mobileDataMb < 0 ||
    measurements.mobileDataMb > limits.mobileDataMbMax ||
    measurements?.missingRequiredEvents !== 0 ||
    typeof measurements?.offlineRecoveryMinutes !== 'number' ||
    measurements.offlineRecoveryMinutes < 0 ||
    measurements.offlineRecoveryMinutes > limits.offlineRecoveryMinutesMax ||
    measurements?.offTripLocationRows !== 0
  ) {
    throw new Error(
      'Android measured results exceed an approved limit or contain missing/off-trip data.',
    );
  }
  requireNonSecretReference(measurements.evidenceReference, 'Android measured results');

  const supportedDevices = readiness.supportedDevices;
  const manufacturerClasses = new Set();
  if (!Array.isArray(supportedDevices) || supportedDevices.length < 3) {
    throw new Error('Android readiness requires at least three supported device classes.');
  }
  for (const [index, device] of supportedDevices.entries()) {
    if (
      typeof device?.manufacturerClass !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{1,39}$/.test(device.manufacturerClass) ||
      typeof device?.modelClass !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9 ._/-]{1,79}$/.test(device.modelClass) ||
      !Number.isInteger(device.androidMajor) ||
      device.androidMajor < 10
    ) {
      throw new Error(`Supported Android device ${index + 1} is invalid.`);
    }
    manufacturerClasses.add(device.manufacturerClass.toLowerCase());
    requirePassedEvidence(device, `Supported Android device ${index + 1}`, approvedAt, now);
  }
  if (manufacturerClasses.size < 3) {
    throw new Error('Android readiness requires three distinct manufacturer classes.');
  }

  for (const scenario of REQUIRED_FIELD_SCENARIOS) {
    requirePassedEvidence(
      readiness.fieldScenarios?.[scenario],
      `Android field scenario ${scenario}`,
      approvedAt,
      now,
    );
  }

  for (const item of REQUIRED_PLAY_EVIDENCE) {
    requirePassedEvidence(readiness.googlePlay?.[item], `Google Play ${item}`, approvedAt, now);
  }

  for (const item of REQUIRED_CUSTOMER_EVIDENCE) {
    requirePassedEvidence(
      readiness.customerControls?.[item],
      `Customer control ${item}`,
      approvedAt,
      now,
    );
  }

  for (const role of REQUIRED_APPROVALS) {
    const approval = readiness.approvals?.[role];
    const approvalTime = Date.parse(approval?.approvedAt);
    if (
      approval?.decision !== 'approved' ||
      !Number.isFinite(approvalTime) ||
      approvalTime > approvedAt ||
      approvalTime > now
    ) {
      throw new Error(`Android readiness approval is missing or invalid: ${role}.`);
    }
    requireNonSecretReference(approval.evidenceReference, `${role} approval`);
  }

  const currentEvidence = await collectAndroidReleaseEvidence(root);
  if (
    readiness.approvedEvidenceDigest !== currentEvidence.digest ||
    artifact.sourceEvidenceDigest !== currentEvidence.digest
  ) {
    throw new Error('Android readiness does not match the current release-controlled source.');
  }

  return {
    approvalId: readiness.approvalId,
    expiresAt: readiness.expiresAt,
    sourceCommit: artifact.sourceCommit,
    evidenceDigest: currentEvidence.digest,
  };
}
