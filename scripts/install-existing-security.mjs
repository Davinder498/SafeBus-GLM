import fs from 'node:fs/promises';
import path from 'node:path';
import {
  installBinding,
  readInstallInputs,
  installExistingSecurity,
  assertRecent,
  verifyRecovery,
} from './lib/existing-security-install.mjs';
import { digest, assertPrivateApiSchemaHidden } from './lib/existing-security-rehearsal.mjs';
import { fileDigest } from './lib/security-backup.mjs';
import {
  assertReviewedCheckout,
  downloadWorkflowEvidence,
  safeSecurityFailure,
  verifiedDatabaseClient,
} from './lib/security-workflow-evidence.mjs';

let client;
let stage = 'preflight';
let installed = false;
try {
  const releaseSha = process.env.SAFEBUS_RELEASE_SHA;
  assertReviewedCheckout(releaseSha);
  const binding = installBinding({
    environment: process.env.SAFEBUS_DEPLOY_ENV,
    databaseUrl: process.env.SAFEBUS_DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    confirmation: process.env.SAFEBUS_INSTALL_CONFIRM,
  });
  const plan = await readInstallInputs();
  const output = path.resolve('.safebus-release/existing-security-install');
  const backupDirectory = path.resolve('.safebus-release/install-backup-evidence');
  const backup = await downloadWorkflowEvidence({
    repository: process.env.GITHUB_REPOSITORY,
    workflow: 'backup-existing-security.yml',
    runId: process.env.SAFEBUS_BACKUP_RUN_ID,
    prefix: 'existing-security-backup-',
    directory: backupDirectory,
  });
  const catalog = JSON.parse(
    await fs.readFile(path.join(backupDirectory, 'catalog-before.json'), 'utf8'),
  );
  for (const [name, envelope] of [
    ['database', backup.archive],
    ['roles', backup.roles],
  ]) {
    if (
      (await fileDigest(path.join(backupDirectory, name + '.enc'))) !== envelope?.ciphertextSha256
    )
      throw new Error('Backup encrypted archive checksum differs.');
  }
  const rehearsal = await downloadWorkflowEvidence({
    repository: process.env.GITHUB_REPOSITORY,
    workflow: 'rehearse-existing-security.yml',
    runId: process.env.SAFEBUS_REHEARSAL_RUN_ID,
    prefix: 'existing-security-rehearsal-',
    directory: path.resolve('.safebus-release/install-rehearsal-evidence'),
  });
  assertRecent(rehearsal.createdAt);
  if (
    rehearsal.format !== 1 ||
    rehearsal.mode !== 'rollback-only' ||
    rehearsal.environment !== 'production' ||
    rehearsal.catalogRestored !== true ||
    rehearsal.persistentMigrationApplied !== false ||
    rehearsal.fixtureWrites !== false ||
    rehearsal.projectRefHash !== binding.projectRefHash ||
    rehearsal.catalogSha256 !== digest(JSON.stringify(catalog.authorization)) ||
    JSON.stringify(rehearsal.inputs) !== JSON.stringify(plan.inputs)
  )
    throw new Error('Successful matching rollback rehearsal is required.');
  const receipt = JSON.parse(process.env.SAFEBUS_SECURITY_RECOVERY_RECEIPT ?? 'null');
  verifyRecovery({
    backup,
    catalog,
    receipt,
    receiptSha256: process.env.SAFEBUS_RECOVERY_RECEIPT_SHA256,
    binding,
    inputs: plan.inputs,
  });
  stage = 'api-isolation';
  await assertPrivateApiSchemaHidden(
    process.env.SUPABASE_URL,
    process.env.SAFEBUS_REHEARSAL_API_KEY,
  );
  stage = 'database';
  client = verifiedDatabaseClient(
    process.env.SAFEBUS_DATABASE_URL,
    process.env.SAFEBUS_DATABASE_CA_CERT,
    'safebus-existing-security-install',
  );
  await client.connect();
  stage = 'bounded-installation';
  const evidence = await installExistingSecurity(client, {
    plan,
    binding,
    backup,
    catalog,
    receipt,
    receiptSha256: process.env.SAFEBUS_RECOVERY_RECEIPT_SHA256,
    releaseSha,
    installationRunId: process.env.GITHUB_RUN_ID,
    rehearsalRunId: process.env.SAFEBUS_REHEARSAL_RUN_ID,
  });
  installed = true;
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', {
    mode: 0o600,
  });
  stage = 'post-install-api-isolation';
  await assertPrivateApiSchemaHidden(
    process.env.SUPABASE_URL,
    process.env.SAFEBUS_REHEARSAL_API_KEY,
  );
  console.log(
    'PASS: 0123, 0122 and 0124 installed atomically; only executed security migrations recorded.',
  );
  console.log(
    'Historical baseline adoption, real signed-session acceptance, frontend deployment and commercial launch remain pending.',
  );
} catch (error) {
  console.error(safeSecurityFailure(error, stage));
  if (installed)
    console.error(
      'Installation committed; a later check or evidence write failed. Inspect the ledger before retrying.',
    );
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
