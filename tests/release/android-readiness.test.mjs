import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import {
  collectAndroidReleaseEvidence,
  verifyAndroidReadiness,
} from '../../scripts/lib/android-readiness.mjs';

const execFileAsync = promisify(execFile);
const read = (file) => fs.readFile(file, 'utf8');

const requiredFiles = {
  'apps/mobile/index.ts': 'export const mobile = true;\n',
  'packages/types/index.ts': 'export interface Contract {}\n',
  '.github/workflows/ci.yml': 'name: CI\n',
  '.github/workflows/release-android.yml': 'name: Android release\n',
  'apps/web/src/components/driver/BusQrStartScanner.tsx': 'export const Scanner = true;\n',
  'apps/web/src/lib/driverLocationDisclosure.ts': 'export const notice = true;\n',
  'package.json': '{}\n',
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  'scripts/check-android-readiness.mjs': 'export const check = true;\n',
  'scripts/create-android-release-manifest.mjs': 'export const manifest = true;\n',
  'scripts/lib/android-readiness.mjs': 'export const readiness = true;\n',
  'scripts/print-android-release-digest.mjs': 'export const digest = true;\n',
  'supabase/migrations/0086_phase7_production_driver_tracking.sql': 'select 86;\n',
  'supabase/migrations/0090_phase7_byod_android_tracking.sql': 'select 90;\n',
  'tests/release/android-byod-contract.test.mjs': 'export const byodContract = true;\n',
  'tests/release/android-readiness.test.mjs': 'export const readinessContract = true;\n',
};

async function fixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'safebus-android-readiness-'));
  for (const [name, content] of Object.entries(requiredFiles)) {
    const target = path.join(root, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return root;
}

function passed(reference) {
  return {
    result: 'passed',
    executedAt: '2026-08-20T12:00:00.000Z',
    evidenceReference: reference,
  };
}

function approval(reference) {
  return {
    decision: 'approved',
    approvedAt: '2026-08-21T12:00:00.000Z',
    evidenceReference: reference,
  };
}

async function approvedFixture(root) {
  const evidence = await collectAndroidReleaseEvidence(root);
  const scenarioNames = [
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
  return {
    format: 1,
    status: 'approved',
    approvalId: 'CR1-ANDROID-ALBERTA-001',
    approvedEvidenceDigest: evidence.digest,
    approvedAt: '2026-08-22T12:00:00.000Z',
    expiresAt: '2026-11-01T12:00:00.000Z',
    signedBundle: {
      sourceCommit: 'a'.repeat(40),
      sourceEvidenceDigest: evidence.digest,
      aabSha256: 'b'.repeat(64),
      signingCertificateSha256: 'c'.repeat(64),
      workflowRunReference: 'GITHUB/RUNS/12345',
      applicationId: 'com.safebusalberta.app',
      versionCode: 42,
      versionName: '1.0.42',
    },
    approvedLimits: {
      batteryPercentagePointsMax: 20,
      mobileDataMbMax: 25,
      missingRequiredEventsMax: 0,
      offlineRecoveryMinutesMax: 15,
    },
    measuredResults: {
      batteryPercentagePoints: 12,
      mobileDataMb: 9.5,
      missingRequiredEvents: 0,
      offlineRecoveryMinutes: 8,
      offTripLocationRows: 0,
      evidenceReference: 'ANDROID/MEASUREMENTS/001',
    },
    supportedDevices: ['Google', 'Samsung', 'Motorola'].map((manufacturerClass, index) => ({
      manufacturerClass,
      modelClass: `${manufacturerClass} supported class`,
      androidMajor: 14 + (index % 2),
      ...passed(`ANDROID/DEVICE/${index + 1}`),
    })),
    fieldScenarios: Object.fromEntries(
      scenarioNames.map((name) => [name, passed(`ANDROID/SCENARIO/${name}`)]),
    ),
    googlePlay: {
      backgroundLocationDeclaration: passed('PLAY/BACKGROUND/001'),
      reviewVideo: passed('PLAY/VIDEO/001'),
      dataSafetyForm: passed('PLAY/DATA-SAFETY/001'),
      testAccount: passed('PLAY/TEST-ACCOUNT/001'),
      publicPrivacyPolicy: passed('PLAY/PRIVACY/001'),
    },
    customerControls: {
      byodPolicy: passed('CUSTOMER/BYOD/001'),
      supportAndReimbursement: passed('CUSTOMER/SUPPORT/001'),
      lostDeviceProcess: passed('CUSTOMER/LOST-DEVICE/001'),
      driverConsentNotice: passed('CUSTOMER/DRIVER-NOTICE/001'),
    },
    approvals: {
      platformAdministrator: approval('APPROVAL/PLATFORM/001'),
      productOwner: approval('APPROVAL/PRODUCT/001'),
      securityLead: approval('APPROVAL/SECURITY/001'),
      privacyLead: approval('APPROVAL/PRIVACY/001'),
      operationsLead: approval('APPROVAL/OPERATIONS/001'),
      qaLead: approval('APPROVAL/QA/001'),
      driverRepresentative: approval('APPROVAL/DRIVER/001'),
    },
  };
}

test('valid Android readiness is current, measured, approved, and source-bound', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);

  const result = await verifyAndroidReadiness({
    readiness,
    root,
    now: Date.parse('2026-08-23T12:00:00.000Z'),
  });

  assert.equal(result.approvalId, readiness.approvalId);
  assert.equal(result.evidenceDigest, readiness.approvedEvidenceDigest);
});

test('Android readiness fails closed for open, expired, or over-limit evidence', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);

  await assert.rejects(
    verifyAndroidReadiness({ readiness: { ...readiness, status: 'not_approved' }, root }),
    /not approved/,
  );
  await assert.rejects(
    verifyAndroidReadiness({
      readiness,
      root,
      now: Date.parse('2027-01-01T00:00:00.000Z'),
    }),
    /invalid, expired/,
  );
  await assert.rejects(
    verifyAndroidReadiness({
      readiness: {
        ...readiness,
        measuredResults: { ...readiness.measuredResults, mobileDataMb: 25.1 },
      },
      root,
      now: Date.parse('2026-08-23T12:00:00.000Z'),
    }),
    /exceed an approved limit/,
  );
});

test('Android readiness rejects incomplete devices, Play evidence, approvals, and source drift', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const readiness = await approvedFixture(root);
  const now = Date.parse('2026-08-23T12:00:00.000Z');

  await assert.rejects(
    verifyAndroidReadiness({ readiness: { ...readiness, supportedDevices: [] }, root, now }),
    /at least three supported device classes/,
  );
  await assert.rejects(
    verifyAndroidReadiness({
      readiness: {
        ...readiness,
        googlePlay: { ...readiness.googlePlay, dataSafetyForm: null },
      },
      root,
      now,
    }),
    /Google Play dataSafetyForm/,
  );
  await assert.rejects(
    verifyAndroidReadiness({
      readiness: {
        ...readiness,
        approvals: { ...readiness.approvals, privacyLead: null },
      },
      root,
      now,
    }),
    /privacyLead/,
  );

  await fs.appendFile(path.join(root, 'apps/mobile/index.ts'), 'export const changed = true;\n');
  await assert.rejects(
    verifyAndroidReadiness({ readiness, root, now }),
    /does not match the current release-controlled source/,
  );
});

test('signed Android workflow emits a source-bound bundle provenance manifest', async () => {
  const [workflow, packageJson] = await Promise.all([
    read('.github/workflows/release-android.yml'),
    read('package.json').then(JSON.parse),
  ]);

  assert.match(workflow, /jarsigner -verify -verbose -certs/);
  assert.match(workflow, /SAFEBUS_ANDROID_SIGNING_CERT_SHA256/);
  assert.match(workflow, /create-android-release-manifest\.mjs/);
  assert.match(workflow, /safebus-android-provenance\.json/);
  assert.doesNotMatch(workflow, /printf '%s\\n' "\$SIGNATURE_OUTPUT"/);
  assert.equal(
    packageJson.scripts['android:readiness:verify'],
    'node scripts/check-android-readiness.mjs',
  );
});

test('provenance generator records exact commit, source, artifact, certificate, and version', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const aabPath = path.join(root, 'candidate.aab');
  const outputPath = path.join(root, 'artifact', 'provenance.json');
  await fs.writeFile(aabPath, 'signed-aab-fixture');

  const script = path.resolve('scripts/create-android-release-manifest.mjs');
  await execFileAsync(process.execPath, [script, aabPath, outputPath], {
    cwd: root,
    env: {
      ...process.env,
      SAFEBUS_RELEASE_SHA: 'd'.repeat(40),
      SAFEBUS_ANDROID_SIGNING_CERT_SHA256: 'e'.repeat(64),
      SAFEBUS_ANDROID_VERSION_CODE: '51',
      SAFEBUS_ANDROID_VERSION_NAME: '1.0.51',
      GITHUB_SERVER_URL: 'https://github.com',
      GITHUB_REPOSITORY: 'SafeBus/test',
      GITHUB_RUN_ID: '9876',
    },
  });
  const manifest = JSON.parse(await read(outputPath));

  assert.equal(manifest.sourceCommit, 'd'.repeat(40));
  assert.equal(manifest.signingCertificateSha256, 'e'.repeat(64));
  assert.equal(manifest.applicationId, 'com.safebusalberta.app');
  assert.equal(manifest.versionCode, 51);
  assert.match(manifest.aabSha256, /^[a-f0-9]{64}$/);
  assert.match(manifest.sourceEvidenceDigest, /^[a-f0-9]{64}$/);
  assert.equal(manifest.workflowRunReference, 'https://github.com/SafeBus/test/actions/runs/9876');
});

test('Point 7 remains open until physical-device, Play, customer, and human evidence passes', async () => {
  const [governance, currentReadiness, milestone] = await Promise.all([
    read('docs/governance/point-7-android-readiness.md'),
    read('docs/governance/android-readiness.json').then(JSON.parse),
    read('docs/MILESTONE_STATUS.md'),
  ]);

  assert.equal(currentReadiness.status, 'not_approved');
  assert.equal(currentReadiness.supportedDevices.length, 0);
  assert.match(governance, /Point 7 remains open/);
  assert.match(governance, /does not approve Android production use/i);
  assert.match(governance, /sole hosted Supabase project/i);
  assert.match(milestone, /Commercial Readiness Remediation 10/);
});
