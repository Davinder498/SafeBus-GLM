#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import {
  assertEnvironmentIdentity,
  createEnvironmentBinding,
  registerEnvironmentIdentity,
} from './lib/environment-identity.mjs';
import { readCommittedManifest } from './lib/migrations.mjs';
import { calculateSchemaFingerprint } from './lib/schema-fingerprint.mjs';

const { Client } = pg;
const databaseUrl = process.env.SAFEBUS_DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const contractDatabaseUrl = process.env.SAFEBUS_CONTRACT_DATABASE_URL;
const contractSupabaseUrl = process.env.SAFEBUS_CONTRACT_SUPABASE_URL;
const releaseSha = process.env.SAFEBUS_RELEASE_SHA;

if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Production adoption runs only in protected GitHub Actions.');
}
if (process.env.SAFEBUS_DEPLOY_ENV !== 'production') {
  throw new Error('Existing database adoption is limited to production.');
}
if (process.env.SAFEBUS_ADOPTION_CONFIRM !== 'ADOPT_EXISTING_PRODUCTION') {
  throw new Error('SAFEBUS_ADOPTION_CONFIRM must be ADOPT_EXISTING_PRODUCTION.');
}
if (process.env.SAFEBUS_BACKUP_CONFIRM !== 'BACKUP_VERIFIED') {
  throw new Error('A current backup must be verified before adoption.');
}
if (process.env.SAFEBUS_REGION_CONFIRM !== 'CA_CENTRAL_1_VERIFIED') {
  throw new Error('The approved Canadian Supabase region must be verified before adoption.');
}
if (!databaseUrl || !supabaseUrl || !contractDatabaseUrl || !contractSupabaseUrl) {
  throw new Error('Production and promoted staging database/API targets are required.');
}
if (!releaseSha || !/^[0-9a-f]{40}$/i.test(releaseSha)) {
  throw new Error('SAFEBUS_RELEASE_SHA must be the full reviewed Git commit SHA.');
}

const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (commitSha !== releaseSha) throw new Error('Checked-out commit does not match release SHA.');
if (
  execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    encoding: 'utf8',
  }).trim()
) {
  throw new Error('Tracked files changed after checkout; refusing production adoption.');
}

const environment = 'production';
const manifest = await readCommittedManifest();
const binding = createEnvironmentBinding({ environment, databaseUrl, supabaseUrl });
const contractBinding = createEnvironmentBinding({
  environment: 'staging',
  databaseUrl: contractDatabaseUrl,
  supabaseUrl: contractSupabaseUrl,
});
if (binding.projectRefHash === contractBinding.projectRefHash) {
  throw new Error('Production and promoted staging must be different Supabase projects.');
}
const client = new Client({
  connectionString: databaseUrl,
  application_name: 'safebus-production-adoption',
});
const contractClient = new Client({
  connectionString: contractDatabaseUrl,
  application_name: 'safebus-production-adoption-contract',
});

let fingerprint;
try {
  await client.connect();
  await contractClient.connect();
  await assertEnvironmentIdentity(contractClient, contractBinding);
  await contractClient.query('begin transaction isolation level repeatable read read only');
  let contractFingerprint;
  try {
    contractFingerprint = await calculateSchemaFingerprint(contractClient);
    await contractClient.query('commit');
  } catch (error) {
    await contractClient.query('rollback');
    throw error;
  }

  const deploymentLock = await client.query(
    "select pg_try_advisory_lock(hashtextextended('safebus-schema-deploy', 0)) as acquired",
  );
  if (deploymentLock.rows[0]?.acquired !== true) {
    throw new Error('Another schema operation is already running for this database.');
  }

  await client.query('begin transaction read only');
  try {
    const state = await client.query(`
      select
        to_regclass('safebus_release.environment_identity') is not null as has_identity,
        to_regclass('safebus_release.migration_checksums') is not null as has_checksums,
        to_regclass('safebus_release.releases') is not null as has_releases,
        (select count(*)::integer
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p')) as public_table_count
    `);
    const current = state.rows[0];
    if (current.has_identity || current.has_checksums || current.has_releases) {
      throw new Error('Production adoption is one-time; release metadata already exists.');
    }
    if (Number(current.public_table_count) === 0) {
      throw new Error('Refusing adoption: the existing production candidate has no public tables.');
    }
    const testIdentities = await client.query(`
      select count(*)::integer as count
        from (
          select id from auth.users where lower(email) like '%@example.test'
          union
          select id from public.profiles where lower(email) like '%@example.test'
        ) detected
    `);
    if (Number(testIdentities.rows[0].count) > 0) {
      throw new Error(
        'Production adoption found @example.test QA identities. Remove approved test data first.',
      );
    }
    fingerprint = await calculateSchemaFingerprint(client);
    if (fingerprint !== contractFingerprint) {
      throw new Error(
        'Existing production schema does not exactly match the promoted staging schema.',
      );
    }
    await client.query('rollback');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }

  await client.query('begin');
  try {
    await client.query(`set local lock_timeout = '10s'`);
    await client.query(`set local statement_timeout = '5min'`);
    const tables = await client.query(`
      select format('%I.%I', n.nspname, c.relname) as qualified_name
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p')
       order by c.relname
    `);
    if (tables.rows.length > 0) {
      await client.query(
        `lock table ${tables.rows.map((row) => row.qualified_name).join(', ')} in access share mode`,
      );
    }
    const lockedFingerprint = await calculateSchemaFingerprint(client);
    if (lockedFingerprint !== fingerprint) {
      throw new Error('Public schema changed during adoption preflight.');
    }

    await registerEnvironmentIdentity(client, binding, releaseSha);
    await client.query(`
      create table safebus_release.migration_checksums (
        filename text primary key,
        version text not null,
        checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
        bytes bigint not null check (bytes > 0),
        release_sha text not null,
        applied_at timestamptz not null default clock_timestamp()
      );
      create table safebus_release.releases (
        release_sha text primary key,
        environment text not null check (environment in ('staging', 'production')),
        schema_fingerprint text check (schema_fingerprint ~ '^[0-9a-f]{64}$'),
        status text not null check (status in ('deploying', 'deployed', 'failed')),
        deployed_at timestamptz not null default clock_timestamp()
      );
      revoke all on all tables in schema safebus_release from public, anon, authenticated;
    `);
    for (const migration of manifest.migrations) {
      await client.query(
        `insert into safebus_release.migration_checksums
           (filename, version, checksum, bytes, release_sha)
         values ($1, $2, $3, $4, $5)`,
        [migration.filename, migration.version, migration.sha256, migration.bytes, releaseSha],
      );
    }
    await client.query(
      `insert into safebus_release.releases
         (release_sha, environment, schema_fingerprint, status)
       values ($1, 'production', $2, 'deployed')`,
      [releaseSha, fingerprint],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
} finally {
  await contractClient.end().catch(() => {});
  await client.end().catch(() => {});
}

const evidence = {
  format: 1,
  environment,
  releaseSha,
  databaseTarget: binding.databaseTarget,
  projectRefHash: binding.projectRefHash,
  publicApiOriginHash: binding.publicApiOriginHash,
  contractProjectRefHash: contractBinding.projectRefHash,
  contractSchemaFingerprint: fingerprint,
  schemaFingerprint: fingerprint,
  adoptedMigrationCount: manifest.migrations.length,
  createdAt: new Date().toISOString(),
};
const output = path.join(process.cwd(), '.safebus-release/adoption.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
console.log(
  `Existing production schema adopted without changing public tables or data; ` +
    `${manifest.migrations.length} migration checksums recorded.`,
);
