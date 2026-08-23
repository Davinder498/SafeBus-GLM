#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { collectAndroidReleaseEvidence } from './lib/android-readiness.mjs';

const [aabPath, outputPath] = process.argv.slice(2);
if (!aabPath || !outputPath) {
  throw new Error('Usage: create-android-release-manifest.mjs <aab-path> <output-path>');
}

const sourceCommit = process.env.SAFEBUS_RELEASE_SHA;
const signingCertificateSha256 = process.env.SAFEBUS_ANDROID_SIGNING_CERT_SHA256;
const versionCode = Number(process.env.SAFEBUS_ANDROID_VERSION_CODE);
const versionName = process.env.SAFEBUS_ANDROID_VERSION_NAME;
if (!/^[a-f0-9]{40}$/.test(sourceCommit ?? '')) {
  throw new Error('SAFEBUS_RELEASE_SHA must be a full lowercase commit SHA.');
}
if (!/^[a-f0-9]{64}$/.test(signingCertificateSha256 ?? '')) {
  throw new Error('SAFEBUS_ANDROID_SIGNING_CERT_SHA256 must be a lowercase SHA-256 digest.');
}
if (!Number.isInteger(versionCode) || versionCode < 1 || !versionName) {
  throw new Error('Android version code and version name are required.');
}

const aab = await fs.readFile(aabPath);
const sourceEvidence = await collectAndroidReleaseEvidence(process.cwd());
const manifest = {
  format: 1,
  artifactType: 'android-app-bundle',
  applicationId: 'com.safebusalberta.app',
  versionCode,
  versionName,
  sourceCommit,
  sourceEvidenceDigest: sourceEvidence.digest,
  aabSha256: createHash('sha256').update(aab).digest('hex'),
  signingCertificateSha256,
  workflowRunReference: `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY ?? 'unknown/unknown'}/actions/runs/${process.env.GITHUB_RUN_ID ?? 'unknown'}`,
  generatedAt: new Date().toISOString(),
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
console.log(
  JSON.stringify({ result: 'android_release_manifest_created', aabSha256: manifest.aabSha256 }),
);
