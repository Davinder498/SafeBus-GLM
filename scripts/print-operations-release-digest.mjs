#!/usr/bin/env node

import { collectOperationsReleaseEvidence } from './lib/operations-readiness.mjs';

const evidence = await collectOperationsReleaseEvidence(process.cwd());
console.log(JSON.stringify({ algorithm: 'sha256', digest: evidence.digest }));
