#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import { calculateSchemaFingerprint } from './lib/schema-fingerprint.mjs';
import { MIGRATION_DIRECTORY, readCommittedManifest } from './lib/migrations.mjs';

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
if (!releaseSha || !/^[0-9a-f]{7,40}$/i.test(releaseSha)) {
  throw new Error('SAFEBUS_RELEASE_SHA must be the reviewed Git commit SHA.');
}
if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error(
    'Staging and production schema deployments run only in protected GitHub Actions.',
  );
}

const manifest = await readCommittedManifest();
const client = new Client({
  connectionString: databaseUrl,
  application_name: 'safebus-schema-deploy',
});

try {
  await client.connect();
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

  const existingResult = await client.query(
    `select filename, checksum from safebus_release.migration_checksums`,
  );
  const existing = new Map(existingResult.rows.map((row) => [row.filename, row.checksum]));
  const expectedNames = new Set(manifest.migrations.map((migration) => migration.filename));

  for (const [filename, checksum] of existing) {
    const local = manifest.migrations.find((migration) => migration.filename === filename);
    if (!local) throw new Error(`Refusing deploy: database has unknown migration ${filename}.`);
    if (local.sha256 !== checksum)
      throw new Error(`Refusing deploy: checksum drift in ${filename}.`);
  }
  for (const filename of existing.keys()) {
    if (!expectedNames.has(filename)) throw new Error(`Unknown migration ${filename}.`);
  }

  const lastRelease = await client.query(
    `select schema_fingerprint from safebus_release.releases
      where status = 'deployed' order by deployed_at desc limit 1`,
  );
  if (existing.size > 0 && lastRelease.rowCount !== 1) {
    throw new Error('Refusing deploy: tracked migrations exist without a release fingerprint.');
  }
  if (lastRelease.rowCount === 1) {
    const currentFingerprint = await calculateSchemaFingerprint(client);
    if (currentFingerprint !== lastRelease.rows[0].schema_fingerprint) {
      throw new Error('Refusing deploy: out-of-band public schema drift was detected.');
    }
  }

  await client.query(
    `insert into safebus_release.releases (release_sha, environment, status)
     values ($1, $2, 'deploying')
     on conflict (release_sha) do update set environment = excluded.environment,
       status = 'deploying', schema_fingerprint = null, deployed_at = clock_timestamp()`,
    [releaseSha, environment],
  );

  for (const migration of manifest.migrations) {
    if (existing.has(migration.filename)) continue;

    const sql = await fs.readFile(
      path.join(process.cwd(), MIGRATION_DIRECTORY, migration.filename),
      'utf8',
    );
    console.log(`Applying ${migration.filename}`);
    await client.query('begin');
    try {
      await client.query(`set local lock_timeout = '10s'`);
      await client.query(`set local statement_timeout = '5min'`);
      await client.query(sql);
      await client.query(
        `insert into safebus_release.migration_checksums
           (filename, version, checksum, bytes, release_sha)
         values ($1, $2, $3, $4, $5)`,
        [migration.filename, migration.version, migration.sha256, migration.bytes, releaseSha],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      await client.query(
        `update safebus_release.releases set status = 'failed' where release_sha = $1`,
        [releaseSha],
      );
      throw error;
    }
  }

  const fingerprint = await calculateSchemaFingerprint(client);
  await client.query(
    `update safebus_release.releases
        set schema_fingerprint = $2, status = 'deployed', deployed_at = clock_timestamp()
      where release_sha = $1`,
    [releaseSha, fingerprint],
  );
  console.log(`Schema deployment complete for ${environment}.`);
} finally {
  await client.end().catch(() => {});
}
