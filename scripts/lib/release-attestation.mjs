import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createEnvironmentBinding } from './environment-identity.mjs';

export const ATTESTATION_FORMAT = 3;
export const DEFAULT_ATTESTATION_PATH = '.safebus-release/preflight.json';
export const REQUIRED_PREFLIGHT_GATES = [
  'migration_manifest',
  'database_preflight',
  'database_types',
  'typecheck',
  'lint',
  'unit_contract_tests',
  'dependency_audit',
  'browser_smoke',
  'production_build',
  'source_map_rejection',
];

const EVIDENCE_FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'supabase/migration-checksums.json',
  'packages/types/src/database.generated.ts',
];

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function hashFile(file) {
  return digest(await fs.readFile(file));
}

async function filesBelow(directory, base = directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'en'))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesBelow(absolute, base)));
    else if (entry.isFile()) files.push(path.relative(base, absolute).replaceAll('\\', '/'));
  }
  return files;
}

export async function hashDirectory(directory) {
  const files = await filesBelow(directory);
  const records = [];
  for (const file of files) {
    records.push(`${file}\0${await hashFile(path.join(directory, file))}`);
  }
  return digest(records.join('\n'));
}

export async function collectReleaseEvidence(root = process.cwd()) {
  const files = {};
  for (const file of EVIDENCE_FILES) {
    files[file] = await hashFile(path.join(root, file));
  }
  return {
    files,
    migrations: await hashDirectory(path.join(root, 'supabase/migrations')),
    webArtifact: await hashDirectory(path.join(root, 'apps/web/dist')),
  };
}

export async function createReleaseAttestation({
  environment,
  releaseSha,
  commitSha,
  databaseUrl,
  supabaseUrl,
  root,
}) {
  const binding = createEnvironmentBinding({ environment, databaseUrl, supabaseUrl });
  return {
    format: ATTESTATION_FORMAT,
    environment,
    releaseSha,
    commitSha,
    databaseTarget: binding.databaseTarget,
    projectRefHash: binding.projectRefHash,
    publicApiOriginHash: binding.publicApiOriginHash,
    createdAt: new Date().toISOString(),
    gates: Object.fromEntries(REQUIRED_PREFLIGHT_GATES.map((gate) => [gate, 'passed'])),
    evidence: await collectReleaseEvidence(root),
  };
}

export async function verifyReleaseAttestation({
  attestation,
  environment,
  releaseSha,
  commitSha,
  databaseUrl,
  supabaseUrl,
  root = process.cwd(),
  now = Date.now(),
}) {
  if (attestation?.format !== ATTESTATION_FORMAT) {
    throw new Error('Release preflight attestation has an unsupported format.');
  }
  if (attestation.environment !== environment) {
    throw new Error('Release preflight attestation targets a different environment.');
  }
  if (attestation.releaseSha !== releaseSha || attestation.commitSha !== commitSha) {
    throw new Error('Release preflight attestation does not match the checked-out commit.');
  }
  const binding = createEnvironmentBinding({ environment, databaseUrl, supabaseUrl });
  if (
    attestation.databaseTarget !== binding.databaseTarget ||
    attestation.projectRefHash !== binding.projectRefHash ||
    attestation.publicApiOriginHash !== binding.publicApiOriginHash
  ) {
    throw new Error('Release preflight attestation targets a different Supabase environment.');
  }
  const createdAt = Date.parse(attestation.createdAt);
  if (!Number.isFinite(createdAt) || createdAt > now || now - createdAt > 2 * 60 * 60 * 1000) {
    throw new Error('Release preflight attestation is invalid or older than two hours.');
  }
  for (const gate of REQUIRED_PREFLIGHT_GATES) {
    if (attestation.gates?.[gate] !== 'passed') {
      throw new Error(`Release preflight gate is missing or failed: ${gate}.`);
    }
  }

  const currentEvidence = await collectReleaseEvidence(root);
  if (JSON.stringify(attestation.evidence) !== JSON.stringify(currentEvidence)) {
    throw new Error('Release inputs or the tested web artifact changed after preflight.');
  }
}
