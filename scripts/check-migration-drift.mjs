#!/usr/bin/env node
import process from 'node:process';
import pg from 'pg';
import {
  assertDatabaseEnvironmentIdentity,
  databaseTargetId,
} from './lib/environment-identity.mjs';
import { readCommittedManifest } from './lib/migrations.mjs';
import { inspectSchemaDeployment } from './lib/schema-deployment-preflight.mjs';

const databaseUrl = process.env.SAFEBUS_DATABASE_URL;
const environment = process.env.SAFEBUS_DEPLOY_ENV;
if (!databaseUrl) throw new Error('SAFEBUS_DATABASE_URL is required.');
if (!['development', 'staging', 'production'].includes(environment))
  throw new Error('Valid deployment environment required.');
if (environment === 'production' && process.env.GITHUB_ACTIONS !== 'true')
  throw new Error('Production drift checks may run only in protected GitHub Actions.');
const manifest = await readCommittedManifest();
const client = new pg.Client({
  connectionString: databaseUrl,
  application_name: 'safebus-drift-check',
});
try {
  await client.connect();
  await client.query('begin transaction read only');
  await client.query('set transaction isolation level repeatable read');
  await client.query("set local statement_timeout='15s'");
  await client.query("set local lock_timeout='3s'");
  await assertDatabaseEnvironmentIdentity(client, { environment, databaseUrl });
  const identity = (
    await client.query(
      'select project_ref_hash,public_api_origin_hash from safebus_release.environment_identity where singleton=true',
    )
  ).rows[0];
  const result = await inspectSchemaDeployment(client, manifest, {
    environment,
    databaseTarget: databaseTargetId(databaseUrl),
    projectRefHash: identity.project_ref_hash,
    publicApiOriginHash: identity.public_api_origin_hash,
  });
  if (result.pending.length)
    throw new Error('Database is missing reviewed migration dispositions or executions.');
  await client.query('rollback');
  console.log(
    'Drift check passed: ' +
      result.applied.size +
      ' verified executions; ' +
      (result.inherited?.size ?? 0) +
      ' frozen historical inputs; schema fingerprint matches.',
  );
} catch (error) {
  await client.query('rollback').catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
}
