import fs from 'node:fs/promises';
import path from 'node:path';
import { createEnvironmentBinding } from './lib/environment-identity.mjs';
import { buildMigrationManifest, readCommittedManifest, sha256 } from './lib/migrations.mjs';
import { readInstallInputs, verifyRecovery } from './lib/existing-security-install.mjs';
import { assertPrivateApiSchemaHidden } from './lib/existing-security-rehearsal.mjs';
import { fileDigest } from './lib/security-backup.mjs';
import {
  readObservedContract,
  validateObservedContract,
  verifyLegacyBaseline,
  registerObservedBaseline,
} from './lib/observed-production-baseline.mjs';
import {
  assertReviewedCheckout,
  downloadWorkflowEvidence,
  verifiedDatabaseClient,
  safeSecurityFailure,
} from './lib/security-workflow-evidence.mjs';

let client,
  committed = false;
try {
  const releaseSha = process.env.SAFEBUS_RELEASE_SHA;
  assertReviewedCheckout(releaseSha);
  const mode = process.env.SAFEBUS_OBSERVED_MODE;
  if (
    !['rehearse', 'adopt'].includes(mode) ||
    process.env.SAFEBUS_OBSERVED_CONFIRM !==
      (mode === 'rehearse'
        ? 'REHEARSE_OBSERVED_BASELINE_ROLLBACK_ONLY'
        : 'ADOPT_OBSERVED_BASELINE_METADATA_ONLY')
  )
    throw new Error('Explicit observed-baseline confirmation required.');
  if (process.env.SAFEBUS_DEPLOY_ENV !== 'production')
    throw new Error('Keep BusSafe production designated.');
  const binding = createEnvironmentBinding({
    environment: 'production',
    databaseUrl: process.env.SAFEBUS_DATABASE_URL,
    supabaseUrl: process.env.SUPABASE_URL,
  });
  const contract = await readObservedContract();
  const manifest = await readCommittedManifest();
  if (JSON.stringify(manifest) !== JSON.stringify(await buildMigrationManifest()))
    throw new Error('Migration checksum drift.');
  validateObservedContract(contract, manifest, binding);
  await verifyLegacyBaseline(process.cwd(), contract);
  const programFiles = [
    'scripts/adopt-observed-production.mjs',
    'scripts/lib/observed-production-baseline.mjs',
    'scripts/lib/environment-identity.mjs',
    'scripts/lib/existing-security-install.mjs',
    'scripts/lib/existing-security-rehearsal.mjs',
    'scripts/lib/schema-fingerprint.mjs',
    'scripts/lib/migrations.mjs',
    'scripts/lib/security-workflow-evidence.mjs',
    'scripts/lib/security-backup.mjs',
    '.github/workflows/adopt-observed-production.yml',
  ];
  const programSha256 = sha256(
    JSON.stringify(
      await Promise.all(
        programFiles.map(async (file) => ({
          file,
          sha256: sha256((await fs.readFile(file, 'utf8')).replaceAll('\r\n', '\n')),
        })),
      ),
    ),
  );
  let recovery;
  if (mode === 'adopt') {
    const directory = path.resolve('.safebus-release/observed-backup');
    const backup = await downloadWorkflowEvidence({
      repository: process.env.GITHUB_REPOSITORY,
      workflow: 'backup-existing-security.yml',
      runId: process.env.SAFEBUS_BACKUP_RUN_ID,
      prefix: 'existing-security-backup-',
      directory,
    });
    const catalog = JSON.parse(
      await fs.readFile(path.join(directory, 'catalog-before.json'), 'utf8'),
    );
    for (const [name, envelope] of [
      ['database', backup.archive],
      ['roles', backup.roles],
    ])
      if ((await fileDigest(path.join(directory, name + '.enc'))) !== envelope?.ciphertextSha256)
        throw new Error('Encrypted backup differs.');
    const rehearsal = await downloadWorkflowEvidence({
      repository: process.env.GITHUB_REPOSITORY,
      workflow: 'adopt-observed-production.yml',
      runId: process.env.SAFEBUS_REHEARSAL_RUN_ID,
      prefix: 'observed-production-baseline-',
      directory: path.resolve('.safebus-release/observed-rehearsal'),
    });
    recovery = {
      backup,
      catalog,
      rehearsal,
      receipt: JSON.parse(process.env.SAFEBUS_SECURITY_RECOVERY_RECEIPT ?? 'null'),
      receiptSha256: process.env.SAFEBUS_RECOVERY_RECEIPT_SHA256,
      inputs: (await readInstallInputs()).inputs,
    };
    verifyRecovery({ ...recovery, binding });
  }
  await assertPrivateApiSchemaHidden(
    process.env.SUPABASE_URL,
    process.env.SAFEBUS_REHEARSAL_API_KEY,
  );
  client = verifiedDatabaseClient(
    process.env.SAFEBUS_DATABASE_URL,
    process.env.SAFEBUS_DATABASE_CA_CERT,
    'safebus-observed-baseline',
  );
  await client.connect();
  const evidence = await registerObservedBaseline(client, {
    contract,
    manifest,
    binding,
    releaseSha,
    runId: process.env.GITHUB_RUN_ID,
    mode,
    recovery,
    programSha256,
  });
  committed = mode === 'adopt';
  const directory = path.resolve('.safebus-release/observed-production-baseline');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, 'evidence.json'),
    JSON.stringify(evidence, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(
    mode === 'rehearse'
      ? 'PASS: observed metadata rehearsed and rolled back.'
      : 'PASS: observed schema registered; only three actual security executions recorded.',
  );
  console.log('No historical migration replay, frontend deployment or commercial launch approval.');
} catch (error) {
  console.error(safeSecurityFailure(error, 'observed-baseline'));
  if (committed || error?.metadataCommitted)
    console.error('Metadata committed; a later check failed. Inspect before retrying.');
  if (error?.message?.includes('commit outcome unknown'))
    console.error('Commit outcome unknown; inspect metadata before retrying.');
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
