#!/usr/bin/env node

import process from 'node:process';
import pg from 'pg';
import { calculateSchemaFingerprint } from './lib/schema-fingerprint.mjs';
import { readCommittedManifest } from './lib/migrations.mjs';

const { Client } = pg;
const databaseUrl = process.env.SAFEBUS_DATABASE_URL;
const environment = process.env.SAFEBUS_DEPLOY_ENV;

if (!databaseUrl) throw new Error('SAFEBUS_DATABASE_URL is required.');
if (!['development', 'staging', 'production'].includes(environment)) {
  throw new Error('SAFEBUS_DEPLOY_ENV must be development, staging, or production.');
}
if (environment === 'production' && process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Production drift checks may run only in protected GitHub Actions.');
}

const manifest = await readCommittedManifest();
const expected = new Map(manifest.migrations.map((migration) => [migration.filename, migration]));
const client = new Client({
  connectionString: databaseUrl,
  application_name: 'safebus-drift-check',
});

try {
  await client.connect();
  const ledger = await client.query(
    `select filename, checksum from safebus_release.migration_checksums order by filename`,
  );
  const actual = new Map(ledger.rows.map((row) => [row.filename, row.checksum]));

  for (const [filename, migration] of expected) {
    if (!actual.has(filename)) throw new Error(`Database is missing migration ${filename}.`);
    if (actual.get(filename) !== migration.sha256) {
      throw new Error(`Checksum drift detected for ${filename}.`);
    }
  }
  for (const filename of actual.keys()) {
    if (!expected.has(filename)) throw new Error(`Database has unknown migration ${filename}.`);
  }

  const releases = await client.query(
    `select schema_fingerprint from safebus_release.releases
      where status = 'deployed' order by deployed_at desc limit 1`,
  );
  if (releases.rowCount !== 1) throw new Error('No deployed release fingerprint is recorded.');

  const fingerprint = await calculateSchemaFingerprint(client);
  if (fingerprint !== releases.rows[0].schema_fingerprint) {
    throw new Error(
      'Authoritative public schema drift detected. Deploy a reviewed forward migration.',
    );
  }

  console.log(
    `Drift check passed for ${environment}: ${actual.size} migrations and schema fingerprint match.`,
  );
} finally {
  await client.end().catch(() => {});
}
