#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import { calculateSchemaFingerprint } from './lib/schema-fingerprint.mjs';
import { MIGRATION_DIRECTORY, readCommittedManifest } from './lib/migrations.mjs';
import { DEFAULT_ATTESTATION_PATH, verifyReleaseAttestation } from './lib/release-attestation.mjs';
import { inspectSchemaDeployment } from './lib/schema-deployment-preflight.mjs';

const { Client } = pg;
const databaseUrl = process.env.SAFEBUS_DATABASE_URL;
const environment = process.env.SAFEBUS_DEPLOY_ENV;
const releaseSha = process.env.SAFEBUS_RELEASE_SHA;
const confirmation = process.env.SAFEBUS_DEPLOY_CONFIRM;

if (!databaseUrl) throw new Error('SAFEBUS_DATABASE_URL is required.');
if (!['staging', 'production'].includes(environment)) {
  throw new Error('Automated schema deployment is limited to staging or production.');
}
if (confirmation !== `DEPLOY_${environment.toUpperCase()}`) {
  throw new Error(`SAFEBUS_DEPLOY_CONFIRM must be DEPLOY_${environment.toUpperCase()}.`);
}
if (!releaseSha || !/^[0-9a-f]{40}$/i.test(releaseSha)) {
  throw new Error('SAFEBUS_RELEASE_SHA must be the full reviewed Git commit SHA.');
}
if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error(
    'Staging and production schema deployments run only in protected GitHub Actions.',
  );
}

const manifest = await readCommittedManifest();
const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (commitSha !== releaseSha) {
  throw new Error('The checked-out commit does not match SAFEBUS_RELEASE_SHA.');
}
const trackedChanges = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
  encoding: 'utf8',
}).trim();
if (trackedChanges) {
  throw new Error('Tracked files changed after checkout; refusing schema deployment.');
}
const attestationPath = path.join(process.cwd(), DEFAULT_ATTESTATION_PATH);
const attestation = JSON.parse(await fs.readFile(attestationPath, 'utf8'));
await verifyReleaseAttestation({
  attestation,
  environment,
  releaseSha,
  commitSha,
  databaseUrl,
});

const client = new Client({
  connectionString: databaseUrl,
  application_name: 'safebus-schema-deploy',
});

try {
  await client.connect();
  const deploymentLock = await client.query(
    "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy', 0)) as acquired",
  );
  if (deploymentLock.rows[0]?.acquired !== true) {
    throw new Error('Another schema deployment is already running for this database.');
  }
  // Complete every read-only drift/ledger check before the first DDL or DML
  // statement. A populated untracked database is never initialized implicitly.
  await client.query('begin transaction read only');
  let preflight;
  try {
    preflight = await inspectSchemaDeployment(client, manifest);
    await client.query('rollback');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }

  // One transaction covers ledger initialization, every pending migration,
  // fingerprinting, and the deployed release record. Any error rolls it all back.
  await client.query('begin');
  try {
    await client.query(`set local lock_timeout = '10s'`);
    await client.query(`set local statement_timeout = '5min'`);
    await client.query(`
      create schema if not exists safebus_release;
      revoke all on schema safebus_release from public, anon, authenticated;
      create table if not exists safebus_release.migration_checksums (
        filename text primary key,
        version text not null,
        checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
        bytes bigint not null check (bytes > 0),
        release_sha text not null,
        applied_at timestamptz not null default clock_timestamp()
      );
      create table if not exists safebus_release.releases (
        release_sha text primary key,
        environment text not null check (environment in ('staging', 'production')),
        schema_fingerprint text check (schema_fingerprint ~ '^[0-9a-f]{64}$'),
        status text not null check (status in ('deploying', 'deployed', 'failed')),
        deployed_at timestamptz not null default clock_timestamp()
      );
      revoke all on all tables in schema safebus_release from public, anon, authenticated;
    `);
    await client.query(
      `insert into safebus_release.releases (release_sha, environment, status)
       values ($1, $2, 'deploying')
       on conflict (release_sha) do update set environment = excluded.environment,
         status = 'deploying', schema_fingerprint = null, deployed_at = clock_timestamp()`,
      [releaseSha, environment],
    );

    for (const migration of preflight.pending) {
      const sql = await fs.readFile(
        path.join(process.cwd(), MIGRATION_DIRECTORY, migration.filename),
        'utf8',
      );
      console.log(`Applying ${migration.filename}`);
      await client.query(sql);
      await client.query(
        `insert into safebus_release.migration_checksums
           (filename, version, checksum, bytes, release_sha)
         values ($1, $2, $3, $4, $5)`,
        [migration.filename, migration.version, migration.sha256, migration.bytes, releaseSha],
      );
    }

    const fingerprint = await calculateSchemaFingerprint(client);
    await client.query(
      `update safebus_release.releases
        set schema_fingerprint = $2, status = 'deployed', deployed_at = clock_timestamp()
      where release_sha = $1`,
      [releaseSha, fingerprint],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
  console.log(`Schema deployment complete for ${environment}.`);
} finally {
  await client.end().catch(() => {});
}
