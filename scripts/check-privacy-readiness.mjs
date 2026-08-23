#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import process from 'node:process';
import {
  DEFAULT_PRIVACY_READINESS_PATH,
  verifyPrivacyReadiness,
} from './lib/privacy-readiness.mjs';

if (process.env.SAFEBUS_DEPLOY_ENV === 'production') {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    throw new Error('Production privacy readiness is verified only in GitHub Actions.');
  }
  const releaseSha = process.env.SAFEBUS_RELEASE_SHA;
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!releaseSha || releaseSha !== commitSha) {
    throw new Error('Privacy readiness must be verified against the exact release commit.');
  }
}

const readiness = JSON.parse(await fs.readFile(DEFAULT_PRIVACY_READINESS_PATH, 'utf8'));
const result = await verifyPrivacyReadiness({ readiness, root: process.cwd() });
console.log(
  JSON.stringify({
    result: 'privacy_readiness_approved',
    approvalId: result.approvalId,
    expiresAt: result.expiresAt,
    evidenceDigest: result.evidenceDigest,
  }),
);
