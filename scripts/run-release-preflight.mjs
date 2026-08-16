#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createEnvironmentBinding } from './lib/environment-identity.mjs';
import { DEFAULT_ATTESTATION_PATH, createReleaseAttestation } from './lib/release-attestation.mjs';

const environment = process.env.SAFEBUS_DEPLOY_ENV;
const releaseSha = process.env.SAFEBUS_RELEASE_SHA;
const databaseUrl = process.env.SAFEBUS_DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const pnpmCli = process.env.npm_execpath;

if (process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Release preflight runs only in a protected GitHub Actions environment.');
}
if (environment !== 'production') {
  throw new Error('SAFEBUS_DEPLOY_ENV must be production.');
}
if (!releaseSha || !/^[0-9a-f]{40}$/i.test(releaseSha)) {
  throw new Error('SAFEBUS_RELEASE_SHA must be the full reviewed Git commit SHA.');
}
if (!databaseUrl) throw new Error('SAFEBUS_DATABASE_URL is required.');
if (!supabaseUrl) throw new Error('SUPABASE_URL is required.');
if (!pnpmCli) throw new Error('Run release preflight through `pnpm release:preflight`.');

createEnvironmentBinding({ environment, databaseUrl, supabaseUrl });

const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (commitSha !== releaseSha) {
  throw new Error('The checked-out commit does not match SAFEBUS_RELEASE_SHA.');
}

function assertTrackedWorktreeClean() {
  const changes = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
    encoding: 'utf8',
  }).trim();
  if (changes) {
    throw new Error('Tracked files changed after checkout; refusing to attest this release.');
  }
}

assertTrackedWorktreeClean();

function run(script, environmentOverrides = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [pnpmCli, script], {
      cwd: process.cwd(),
      env: { ...process.env, ...environmentOverrides },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Release preflight failed at pnpm ${script} (exit ${code}).`));
    });
  });
}

async function rejectSourceMaps(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await rejectSourceMaps(absolute);
    else if (entry.name.endsWith('.map')) {
      throw new Error(`Public source map found in release artifact: ${absolute}`);
    }
  }
}

await run('migrations:verify');
await run('migrations:preflight');
await run('types:check');
await run('authorization:audit');
await run('typecheck');
await run('lint');
await run('test');
await run('security:audit');
await run('build');
await rejectSourceMaps(path.join(process.cwd(), 'apps'));
await run('test:smoke:release');
assertTrackedWorktreeClean();

const root = process.cwd();
const attestation = await createReleaseAttestation({
  environment,
  releaseSha,
  commitSha,
  databaseUrl,
  supabaseUrl,
  root,
});
const output = path.join(root, DEFAULT_ATTESTATION_PATH);
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(attestation, null, 2)}\n`, { mode: 0o600 });
console.log(`All release preflight gates passed for ${environment} at ${releaseSha}.`);
