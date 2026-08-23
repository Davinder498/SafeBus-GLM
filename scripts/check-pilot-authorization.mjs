#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import process from 'node:process';
import {
  DEFAULT_PILOT_AUTHORIZATION_PATH,
  verifyPilotAuthorization,
} from './lib/pilot-authorization.mjs';

if (process.env.SAFEBUS_DEPLOY_ENV === 'production') {
  if (process.env.GITHUB_ACTIONS !== 'true') {
    throw new Error('Production pilot authorization is verified only in GitHub Actions.');
  }
  const releaseSha = process.env.SAFEBUS_RELEASE_SHA;
  const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!releaseSha || releaseSha !== commitSha) {
    throw new Error('Pilot authorization must be verified against the exact release commit.');
  }
}

const authorization = JSON.parse(await fs.readFile(DEFAULT_PILOT_AUTHORIZATION_PATH, 'utf8'));
const result = await verifyPilotAuthorization({ authorization, root: process.cwd() });
console.log(
  JSON.stringify({
    result: 'pilot_authorized',
    pilotId: result.pilotId,
    expiresAt: result.expiresAt,
    evidenceDigest: result.evidenceDigest,
  }),
);
