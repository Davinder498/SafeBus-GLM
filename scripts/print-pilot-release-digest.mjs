#!/usr/bin/env node

import { collectPilotReleaseEvidence } from './lib/pilot-authorization.mjs';

const evidence = await collectPilotReleaseEvidence(process.cwd());
console.log(JSON.stringify({ algorithm: 'sha256', digest: evidence.digest }));
