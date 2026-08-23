#!/usr/bin/env node

import fs from 'node:fs/promises';
import { DEFAULT_MAP_READINESS_PATH, verifyMapReadiness } from './lib/map-readiness.mjs';

const readiness = JSON.parse(await fs.readFile(DEFAULT_MAP_READINESS_PATH, 'utf8'));
const result = await verifyMapReadiness({ readiness, root: process.cwd() });
console.log(
  JSON.stringify({
    result: 'map_readiness_approved',
    approvalId: result.approvalId,
    expiresAt: result.expiresAt,
    evidenceDigest: result.evidenceDigest,
  }),
);
