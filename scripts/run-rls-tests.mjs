#!/usr/bin/env node

import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs/promises';
import pg from 'pg';

const { Client } = pg;

const REQUIRED_CONFIRMATION = 'DEV_ONLY';
const DATABASE_URL_ENV = 'SAFEBUS_RLS_TEST_DATABASE_URL';
const CONFIRM_ENV = 'SAFEBUS_RLS_TEST_CONFIRM';

const DEFAULT_RLS_FILES = [
  'tests/rls/student-roster-rls.sql',
  'tests/rls/guardian-visibility-rls.sql',
  'tests/rls/guardian-linking-rls.sql',
  'tests/rls/guardian-live-trip-visibility-rls.sql',
];

function fail(message) {
  console.error(`\nRLS test runner refused to run: ${message}`);
  process.exitCode = 1;
}

function redactDatabaseUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.username) url.username = '***';
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '<invalid database URL>';
  }
}

function shouldUseSsl(rawUrl) {
  if (process.env.SAFEBUS_RLS_TEST_SSL === 'disable') {
    return false;
  }

  try {
    const { hostname } = new URL(rawUrl);
    return !['localhost', '127.0.0.1', '::1'].includes(hostname);
  } catch {
    return true;
  }
}

function validateEnvironment() {
  const databaseUrl = process.env[DATABASE_URL_ENV];
  const confirmation = process.env[CONFIRM_ENV];

  if (!databaseUrl) {
    fail(`missing ${DATABASE_URL_ENV}.`);
    return null;
  }

  if (confirmation !== REQUIRED_CONFIRMATION) {
    fail(`${CONFIRM_ENV} must be exactly ${REQUIRED_CONFIRMATION}.`);
    return null;
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail(`${DATABASE_URL_ENV} is not a valid URL.`);
    return null;
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    fail(`${DATABASE_URL_ENV} must use postgres:// or postgresql://.`);
    return null;
  }

  return databaseUrl;
}

async function resolveSqlFiles(args) {
  const requestedFiles = args.length > 0 ? args : DEFAULT_RLS_FILES;
  const cwd = process.cwd();
  const rlsRoot = await fs.realpath(path.resolve(cwd, 'tests/rls'));

  const resolved = [];
  for (const file of requestedFiles) {
    if (!file.endsWith('.sql')) {
      throw new Error(`RLS test file must be a .sql file: ${file}`);
    }

    const absolutePath = path.resolve(cwd, file);
    const relativePath = path.relative(cwd, absolutePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`RLS test file must be inside the repository: ${file}`);
    }

    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        throw new Error(`RLS test path is not a file: ${file}`);
      }

      const realPath = await fs.realpath(absolutePath);
      const relativeRlsPath = path.relative(rlsRoot, realPath);
      if (
        relativeRlsPath === ''
        || relativeRlsPath.startsWith('..')
        || path.isAbsolute(relativeRlsPath)
      ) {
        throw new Error(`RLS test file must be inside tests/rls: ${file}`);
      }
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`Missing RLS test file: ${file}`);
      }
      throw error;
    }

    resolved.push({ displayPath: relativePath.replaceAll(path.sep, '/'), absolutePath });
  }

  return resolved;
}

async function runSqlFile(client, file) {
  const sql = await fs.readFile(file.absolutePath, 'utf8');

  console.log(`\n[rls] Running ${file.displayPath}`);
  const startedAt = performance.now();
  await client.query(sql);
  const elapsedMs = Math.round(performance.now() - startedAt);
  console.log(`[rls] PASS ${file.displayPath} (${elapsedMs} ms)`);
}

async function main() {
  const databaseUrl = validateEnvironment();
  if (!databaseUrl) return;

  let files;
  try {
    files = await resolveSqlFiles(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    return;
  }

  console.warn('\nWARNING: This command executes destructive RLS test SQL.');
  console.warn('Run it only against hosted Supabase DEV or a disposable migrated database.');
  console.warn('Never run it against production.');
  console.warn(`Database: ${redactDatabaseUrl(databaseUrl)}`);
  console.warn(`Files: ${files.map((file) => file.displayPath).join(', ')}`);

  const client = new Client({
    connectionString: databaseUrl,
    application_name: 'safebus-rls-test-runner',
    ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();

    for (const file of files) {
      await runSqlFile(client, file);
    }

    console.log(`\n[rls] PASS ${files.length} file(s) completed successfully.`);
  } catch (error) {
    console.error('\n[rls] FAIL');
    console.error(error?.message ?? error);
    if (error?.position) {
      console.error(`SQL position: ${error.position}`);
    }
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

await main();
