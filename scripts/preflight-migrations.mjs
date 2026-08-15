#!/usr/bin/env node

import process from 'node:process';
import pg from 'pg';
import { createEnvironmentBinding } from './lib/environment-identity.mjs';
import { readCommittedManifest } from './lib/migrations.mjs';
import { inspectSchemaDeployment } from './lib/schema-deployment-preflight.mjs';

const { Client } = pg;
const databaseUrl = process.env.SAFEBUS_DATABASE_URL;
const environment = process.env.SAFEBUS_DEPLOY_ENV;
const supabaseUrl = process.env.SUPABASE_URL;

if (!databaseUrl) throw new Error('SAFEBUS_DATABASE_URL is required.');
if (!supabaseUrl) throw new Error('SUPABASE_URL is required.');
if (environment !== 'production') {
  throw new Error('Schema deployment preflight is limited to production.');
}
if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Schema deployment preflight runs only in protected GitHub Actions.');
}

const manifest = await readCommittedManifest();
const binding = createEnvironmentBinding({ environment, databaseUrl, supabaseUrl });
const client = new Client({
  connectionString: databaseUrl,
  application_name: 'safebus-schema-preflight',
});

try {
  await client.connect();
  await client.query('begin transaction read only');
  const result = await inspectSchemaDeployment(client, manifest, binding);
  if (result.pending.length > 0) {
    throw new Error(
      'Schema-changing releases are blocked in single-production-database mode. ' +
        'Approve an isolated test database or branch before adding migrations.',
    );
  }
  await client.query('rollback');
  console.log(
    `Schema preflight passed for ${environment}: ${result.applied.size} applied, ` +
      `${result.pending.length} pending. No database changes were made.`,
  );
} catch (error) {
  await client.query('rollback').catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
}
