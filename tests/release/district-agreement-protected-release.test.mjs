import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scriptPath = 'scripts/release-district-agreements.mjs';
const workflowPath = '.github/workflows/release-district-agreements.yml';

test('protected agreement release runner parses and uses live read-only rehearsal', async () => {
  execFileSync(process.execPath, ['--check', scriptPath], { stdio: 'pipe' });
  const source = await readFile(scriptPath,'utf8');
  assert.match(source, /assertReviewedCheckout\(sha\)/);
  assert.match(source, /assertEnvironmentIdentity\(client,binding\)/);
  assert.match(source, /begin transaction isolation level repeatable read read only/);
  assert.match(source, /createHash\('sha256'\)/);
  assert.match(source, /DISTRICT_AGREEMENT_LIVE_BASELINE_MISMATCH/);
  assert.match(source, /DISTRICT_AGREEMENT_POST_INSTALL_MISMATCH/);
  assert.match(source, /DISTRICT_AGREEMENT_ACCESS_CONTROL_FAILURE/);
  assert.match(source, /validateObservedContract\(contract,manifest,binding\)/);
  assert.match(source, /inspectSecurityInstallation\(c,contract\)/);
  assert.match(source, /pickup_dropoff_event_copies/);
  assert.match(source, /DISTRICT_AGREEMENT_SECURITY_LEDGER_MISMATCH/);
  assert.match(source, /DISTRICT_AGREEMENT_REHEARSAL_BASELINE_DRIFT/);
  assert.match(source, /baselineFingerprint:beforeFingerprint/);
  assert.doesNotMatch(source, /inspectSchemaDeployment/);
  assert.match(source, /calculateSchemaFingerprint\(client\)/);
  assert.match(source, /insert into safebus_release\.releases/);
  assert.match(source, /DISTRICT_AGREEMENT_REGISTERED_SCHEMA_DRIFT/);
  assert.match(source, /RELEASE_EVIDENCE_NOT_CURRENT_OR_INVALID/);
  assert.match(source, /ENCRYPTED_BACKUP_ARTIFACT_MISSING/);
  assert.match(source, /READ_ONLY_REHEARSAL_EVIDENCE_MISSING/);
  assert.match(source, /RESTORE_VERIFIED_OFFSITE/);
  assert.match(source, /client\.query\(sql\)/);
  assert.match(source, /await client\.query\('commit'\)/);
});

test('protected release workflow serializes with production releases and separates rehearsal and installation', async () => {
  const workflow = await readFile(workflowPath,'utf8');
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/options: \[rehearse, install\]/);
  assert.match(workflow,/group: production-release/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
  assert.match(workflow,/inputs\.git_ref == github\.sha/);
  assert.match(workflow,/validate-security-install\.yml/);
  assert.match(workflow,/SAFEBUS_DATABASE_URL: \$\{\{ secrets\.SAFEBUS_DATABASE_URL \}\}/);
  assert.match(workflow,/REHEARSE_DISTRICT_AGREEMENTS/);
  assert.match(workflow,/INSTALL_DISTRICT_AGREEMENTS/);
  assert.match(workflow,/tests\/release\/district-agreement-postgres-replay\.test\.mjs/);
  assert.match(workflow,/node --check scripts\/release-district-agreements\.mjs/);
  assert.doesNotMatch(workflow,/netlify deploy|stripe|APPROVE_CR1_PILOT/i);
});
