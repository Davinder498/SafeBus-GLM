#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pg from 'pg';
import {
  createEnvironmentBinding,
  registerEnvironmentIdentity,
} from './lib/environment-identity.mjs';

const { Client } = pg;
const environment = 'development';
const databaseUrl = process.env.SAFEBUS_DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const releaseSha = process.env.SAFEBUS_RELEASE_SHA;

if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Development registration runs only in GitHub Actions.');
}
if (process.env.SAFEBUS_REGISTER_CONFIRM !== 'REGISTER_DEVELOPMENT') {
  throw new Error('SAFEBUS_REGISTER_CONFIRM must be REGISTER_DEVELOPMENT.');
}
if (!databaseUrl || !supabaseUrl) {
  throw new Error('SAFEBUS_DATABASE_URL and SUPABASE_URL are required.');
}
if (!releaseSha || !/^[0-9a-f]{40}$/i.test(releaseSha)) {
  throw new Error('SAFEBUS_RELEASE_SHA must be a full Git commit SHA.');
}
const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (commitSha !== releaseSha) throw new Error('Checked-out commit does not match release SHA.');

const binding = createEnvironmentBinding({ environment, databaseUrl, supabaseUrl });
const client = new Client({
  connectionString: databaseUrl,
  application_name: 'safebus-development-registration',
});
try {
  await client.connect();
  await client.query('begin');
  try {
    const existing = await client.query(
      `select to_regclass('safebus_release.environment_identity') is not null as exists`,
    );
    if (existing.rows[0].exists) {
      throw new Error('Database environment identity already exists.');
    }
    await registerEnvironmentIdentity(client, binding, releaseSha);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
} finally {
  await client.end().catch(() => {});
}

const output = path.join(process.cwd(), '.safebus-release/development-registration.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(
  output,
  `${JSON.stringify(
    {
      format: 1,
      environment,
      releaseSha,
      databaseTarget: binding.databaseTarget,
      projectRefHash: binding.projectRefHash,
      publicApiOriginHash: binding.publicApiOriginHash,
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
  { mode: 0o600 },
);
console.log('Development database identity registered.');
