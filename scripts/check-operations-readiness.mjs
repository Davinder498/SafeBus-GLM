#!/usr/bin/env node

import fs from 'node:fs/promises';
import {
  DEFAULT_OPERATIONS_READINESS_PATH,
  verifyOperationsReadiness,
} from './lib/operations-readiness.mjs';

const readiness = JSON.parse(await fs.readFile(DEFAULT_OPERATIONS_READINESS_PATH, 'utf8'));
const result = await verifyOperationsReadiness({ readiness, root: process.cwd() });
console.log(
  JSON.stringify({
    result: 'operations_readiness_approved',
    approvalId: result.approvalId,
    expiresAt: result.expiresAt,
    evidenceDigest: result.evidenceDigest,
  }),
);
