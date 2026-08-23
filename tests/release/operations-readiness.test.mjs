import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const read = (file) => fs.readFile(file, 'utf8');

test('production health monitoring is scheduled, least-privileged, and production-bound', async () => {
  const workflow = await read('.github/workflows/production-health.yml');

  assert.match(workflow, /name: Production health monitor/);
  assert.match(workflow, /cron: '\*\/15 \* \* \* \*'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /permissions:\s+contents: read/);
  assert.match(workflow, /SAFEBUS_MONITOR_ORIGIN: https:\/\/bussafe\.netlify\.app/);
  assert.match(workflow, /node scripts\/check-production-health\.mjs/);
  assert.match(workflow, /timeout-minutes: 5/);
  assert.doesNotMatch(workflow, /issues: write|pull-requests: write|id-token: write/);
  assert.doesNotMatch(workflow, /continue-on-error|secrets\./);
});

test('production monitor remains public-only and privacy-safe', async () => {
  const [runner, library] = await Promise.all([
    read('scripts/check-production-health.mjs'),
    read('scripts/lib/production-health.mjs'),
  ]);
  const source = `${runner}\n${library}`;

  assert.match(source, /SafeBus-Production-Health\/1\.0/);
  assert.match(source, /redirect: 'error'/);
  assert.match(source, /AbortSignal\.timeout/);
  assert.match(source, /\.netlify\/functions\/map-tile-config/);
  assert.doesNotMatch(source, /SUPABASE_|service_role|secret key|\/rest\/v1|\/auth\/v1/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*(?:body|payload|tileUrl)/);
});

test('Point 9 documentation keeps operating and human evidence open', async () => {
  const [operations, acceptance, milestones] = await Promise.all([
    read('docs/governance/point-9-operational-readiness.md'),
    read('docs/qa/point-9-operations-acceptance.md'),
    read('docs/MILESTONE_STATUS.md'),
  ]);

  assert.match(
    operations,
    /Status: Engineering monitoring foundation implemented; Point 9 remains open/,
  );
  assert.match(operations, /does not query Supabase/i);
  assert.match(operations, /does not establish an SLA/i);
  assert.match(operations, /named on-call owner\s+and backup/);
  assert.match(acceptance, /Do not use real student, guardian,\s+or driver data/);
  assert.match(acceptance, /failure-notification drill/);
  assert.match(milestones, /Commercial Readiness Remediation 7/);
});
