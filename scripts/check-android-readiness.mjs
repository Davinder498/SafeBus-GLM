#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';
import {
  DEFAULT_ANDROID_READINESS_PATH,
  verifyAndroidReadiness,
} from './lib/android-readiness.mjs';

const readiness = JSON.parse(await fs.readFile(DEFAULT_ANDROID_READINESS_PATH, 'utf8'));
const result = await verifyAndroidReadiness({ readiness, root: process.cwd() });
console.log(
  JSON.stringify({
    result: 'android_readiness_approved',
    approvalId: result.approvalId,
    expiresAt: result.expiresAt,
    sourceCommit: result.sourceCommit,
    evidenceDigest: result.evidenceDigest,
  }),
);
