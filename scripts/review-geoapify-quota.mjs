#!/usr/bin/env node
// Evaluate a locally held, redacted, operator-reviewed project Statistics
// snapshot. No network connection, secrets, email or provider write occurs.
import { readFile } from 'node:fs/promises';
import { evaluateGeoapifyQuota, quotaAlertChecks } from './lib/geoapify-quota.mjs';

async function main() {
  if (process.argv.length !== 3 || !process.argv[2] ||
      process.argv[2].startsWith('-')) throw new Error('MAP_QUOTA_INPUT_REQUIRED');
  const buffer = await readFile(process.argv[2]);
  if (buffer.length > 1024) throw new Error('MAP_QUOTA_INVALID');
  const assessment = evaluateGeoapifyQuota(JSON.parse(buffer.toString('utf8')));
  const checks = quotaAlertChecks(assessment);
  console.log(JSON.stringify({
    result: checks.length ? 'threshold_reached' : 'below_threshold',
    usageDate: assessment.usageDate,
    usedCredits: assessment.usedCredits,
    limitCredits: assessment.limitCredits,
    percentUsed: assessment.percentUsed,
    level: assessment.level,
    evidenceStatus: assessment.evidenceStatus,
    alertCode: checks[0]?.check ?? null,
    alertSent: false,
    automatedMonitoringEnabled: false,
  }));
  if (checks.length) process.exitCode = 2;
}
try { await main(); } catch {
  console.error('MAP_QUOTA_REVIEW_FAILED: missing, invalid or stale redacted Geoapify project totals');
  process.exitCode = 1;
}
