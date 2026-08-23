#!/usr/bin/env node

import { collectAndroidReleaseEvidence } from './lib/android-readiness.mjs';

const evidence = await collectAndroidReleaseEvidence(process.cwd());
console.log(JSON.stringify({ algorithm: 'sha256', digest: evidence.digest }));
