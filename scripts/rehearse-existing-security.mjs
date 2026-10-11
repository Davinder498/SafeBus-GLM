#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import {
  ACCEPTANCE_FILE,
  RECONCILIATION_FILE,
  SECURITY_FILE,
  digest,
  assertPrivateApiSchemaHidden,
  formatRehearsalFailure,
  runRollbackRehearsal,
  validateRehearsalTarget,
} from './lib/existing-security-rehearsal.mjs';
import { buildMigrationManifest, readCommittedManifest } from './lib/migrations.mjs';

if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Existing-project schema rehearsal runs only in protected GitHub Actions.');
}
const releaseSha = process.env.SAFEBUS_RELEASE_SHA;
if (!/^[0-9a-f]{40}$/.test(releaseSha ?? ''))
  throw new Error('Exact reviewed commit SHA is required.');
const actualSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (actualSha !== releaseSha) throw new Error('Checkout differs from the reviewed commit.');
if (
  execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    encoding: 'utf8',
  }).trim()
) {
  throw new Error('Tracked files changed after checkout.');
}
const binding = validateRehearsalTarget({
  environment: process.env.SAFEBUS_DEPLOY_ENV,
  databaseUrl: process.env.SAFEBUS_DATABASE_URL,
  supabaseUrl: process.env.SUPABASE_URL,
  confirmation: process.env.SAFEBUS_REHEARSAL_CONFIRM,
});
const manifest = await readCommittedManifest();
if (JSON.stringify(await buildMigrationManifest()) !== JSON.stringify(manifest)) {
  throw new Error('Migration files differ from the committed checksums.');
}
const inputs = await Promise.all(
  [RECONCILIATION_FILE, SECURITY_FILE, ACCEPTANCE_FILE].map((file) => fs.readFile(file, 'utf8')),
);
const client = new pg.Client({
  connectionString: process.env.SAFEBUS_DATABASE_URL,
  application_name: 'safebus-existing-security-rollback-rehearsal',
  connectionTimeoutMillis: 10000,
});
let result;
let stage = 'api-boundary';
try {
  console.log('Checking private API schema isolation with the public API key.');
  await assertPrivateApiSchemaHidden(
    process.env.SUPABASE_URL,
    process.env.SAFEBUS_REHEARSAL_API_KEY,
  );
  console.log('PASS: private schema rejected with HTTP 406 / PGRST106.');
  stage = 'database-connection';
  await client.connect();
  console.log('Database connected; starting rollback-only rehearsal.');
  stage = 'rollback-rehearsal';
  result = await runRollbackRehearsal(client, {
    reconciliation: inputs[0],
    security: inputs[1],
    acceptance: inputs[2],
  });
} catch (error) {
  // Never log connection strings, raw SQL, provider details, or credentials.
  console.error(formatRehearsalFailure(error, stage));
  process.exitCode = 1;
} finally {
  await client.end();
}
if (result) {
  const output = path.resolve('.safebus-release/existing-security-rehearsal');
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(
    path.join(output, 'catalog-before.json'),
    JSON.stringify(result.before, null, 2) + '\n',
    { mode: 0o600 },
  );
  const evidence = {
    format: 1,
    environment: 'production',
    mode: 'rollback-only',
    releaseSha,
    projectRefHash: binding.projectRefHash,
    createdAt: new Date().toISOString(),
    catalogRestored: result.restored,
    acceptance: result.acceptance,
    persistentMigrationApplied: false,
    fixtureWrites: false,
    realApiAcceptance: false,
    inputs: [RECONCILIATION_FILE, SECURITY_FILE, ACCEPTANCE_FILE].map((file, i) => ({
      file,
      sha256: digest(inputs[i].replaceAll('\r\n', '\n')),
    })),
    catalogSha256: digest(JSON.stringify(result.before)),
  };
  await fs.writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', {
    mode: 0o600,
  });
  console.log(
    'PASS: reconciliation and security catalog checks rehearsed; catalog restored after rollback.',
  );
  console.log(
    'Persistent migration, real signed-session acceptance, and launch approval remain pending.',
  );
}
