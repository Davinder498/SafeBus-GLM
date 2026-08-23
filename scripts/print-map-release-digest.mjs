#!/usr/bin/env node

import { collectMapReleaseEvidence } from './lib/map-readiness.mjs';

const evidence = await collectMapReleaseEvidence(process.cwd());
console.log(JSON.stringify({ algorithm: 'sha256', digest: evidence.digest }));
