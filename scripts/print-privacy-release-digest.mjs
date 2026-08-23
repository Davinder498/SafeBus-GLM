#!/usr/bin/env node

import { collectPrivacyReleaseEvidence } from './lib/privacy-readiness.mjs';

const evidence = await collectPrivacyReleaseEvidence(process.cwd());
console.log(JSON.stringify({ algorithm: 'sha256', digest: evidence.digest }));
