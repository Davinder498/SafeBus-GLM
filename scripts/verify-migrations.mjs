#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  MANIFEST_PATH,
  buildMigrationManifest,
  readCommittedManifest,
  stableManifestJson,
} from './lib/migrations.mjs';

const write = process.argv.includes('--write');
const root = process.cwd();
const actual = await buildMigrationManifest(root);

if (write) {
  await fs.writeFile(path.join(root, MANIFEST_PATH), stableManifestJson(actual), 'utf8');
  console.log(`Updated ${MANIFEST_PATH} (${actual.migrations.length} migrations).`);
  process.exit(0);
}

let committed;
try {
  committed = await readCommittedManifest(root);
} catch (error) {
  console.error(`Migration verification failed: ${error.message}`);
  console.error('Run pnpm migrations:checksums after reviewing the migration set.');
  process.exit(1);
}

if (stableManifestJson(actual) !== stableManifestJson(committed)) {
  console.error(
    'Migration verification failed: migration files do not match the checksum manifest.',
  );
  console.error('Never edit an applied migration. Add a forward migration instead.');
  console.error('If the change is a reviewed new migration, run pnpm migrations:checksums.');
  process.exit(1);
}

console.log(`Migration verification passed (${actual.migrations.length} immutable files).`);
