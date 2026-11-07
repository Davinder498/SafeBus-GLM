#!/usr/bin/env node
// Fixed, public GitHub metadata only; no token or credentials are needed.
import { auditPublicMonitorHistory } from './lib/monitor-seven-day-history.mjs';

try {
  if (process.argv.length !== 2) throw new Error('MONITOR_HISTORY_INVALID_INPUT');
  const report = await auditPublicMonitorHistory();
  console.log(JSON.stringify(report));
  if (report.githubCadenceResult !== 'passed') process.exitCode = 2;
} catch {
  console.error('MONITOR_HISTORY_AUDIT_UNAVAILABLE');
  process.exitCode = 1;
}
