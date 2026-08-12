import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createReleaseAttestation,
  REQUIRED_PREFLIGHT_GATES,
  verifyReleaseAttestation,
} from '../../scripts/lib/release-attestation.mjs';
import { inspectSchemaDeployment } from '../../scripts/lib/schema-deployment-preflight.mjs';

const read = (file) => fs.readFile(file, 'utf8');
const databaseUrl = 'postgresql://postgres.test:password@db.test.supabase.co:5432/postgres';

async function fixtureRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'safebus-attestation-'));
  const files = {
    'package.json': '{}\n',
    'pnpm-lock.yaml': 'lockfileVersion: 9\n',
    'supabase/migration-checksums.json': '{}\n',
    'supabase/migrations/0001_test.sql': 'select 1;\n',
    'packages/types/src/database.generated.ts': 'export interface Database {}\n',
    'apps/web/dist/index.html': '<!doctype html>\n',
  };
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return root;
}

test('release attestation is bound to every gate, migration, input, and web artifact', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const releaseSha = 'a'.repeat(40);
  const attestation = await createReleaseAttestation({
    environment: 'production',
    releaseSha,
    commitSha: releaseSha,
    databaseUrl,
    root,
  });

  assert.deepEqual(Object.keys(attestation.gates), REQUIRED_PREFLIGHT_GATES);
  await verifyReleaseAttestation({
    attestation,
    environment: 'production',
    releaseSha,
    commitSha: releaseSha,
    databaseUrl,
    root,
  });

  await fs.appendFile(path.join(root, 'supabase/migrations/0001_test.sql'), 'select 2;\n');
  await assert.rejects(
    verifyReleaseAttestation({
      attestation,
      environment: 'production',
      releaseSha,
      commitSha: releaseSha,
      databaseUrl,
      root,
    }),
    /changed after preflight/,
  );
});

test('release attestation rejects stale evidence and a different commit', async (t) => {
  const root = await fixtureRoot();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const releaseSha = 'b'.repeat(40);
  const attestation = await createReleaseAttestation({
    environment: 'staging',
    releaseSha,
    commitSha: releaseSha,
    databaseUrl,
    root,
  });

  await assert.rejects(
    verifyReleaseAttestation({
      attestation,
      environment: 'staging',
      releaseSha,
      commitSha: 'c'.repeat(40),
      databaseUrl,
      root,
    }),
    /does not match/,
  );
  await assert.rejects(
    verifyReleaseAttestation({
      attestation,
      environment: 'staging',
      releaseSha,
      commitSha: releaseSha,
      databaseUrl,
      root,
      now: Date.parse(attestation.createdAt) + 2 * 60 * 60 * 1000 + 1,
    }),
    /older than two hours/,
  );
  await assert.rejects(
    verifyReleaseAttestation({
      attestation,
      environment: 'staging',
      releaseSha,
      commitSha: releaseSha,
      databaseUrl: 'postgresql://postgres.other:password@pooler.example.test:5432/postgres',
      root,
    }),
    /different database/,
  );
});

test('database preflight refuses to initialize a populated untracked database', async () => {
  const queries = [];
  const client = {
    async query(sql) {
      queries.push(sql);
      return {
        rows: [{ has_checksums: false, has_releases: false, public_table_count: 48 }],
      };
    },
  };

  await assert.rejects(inspectSchemaDeployment(client, { migrations: [] }), /populated database/);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /^\s*select/i);
});

test('database preflight permits initialization only when public schema is empty', async () => {
  const migrations = [{ filename: '0001_test.sql' }];
  const client = {
    async query() {
      return { rows: [{ has_checksums: false, has_releases: false, public_table_count: 0 }] };
    },
  };

  const result = await inspectSchemaDeployment(client, { migrations });
  assert.equal(result.initialized, false);
  assert.deepEqual(result.pending, migrations);
});

test('protected workflows complete preflight before the first schema mutation', async () => {
  for (const file of [
    '.github/workflows/release-staging.yml',
    '.github/workflows/release-production.yml',
  ]) {
    const workflow = await read(file);
    const preflight = workflow.indexOf('pnpm release:preflight');
    const migration = workflow.indexOf('pnpm migrations:deploy');
    const application = workflow.indexOf('netlify deploy --prod');

    assert.ok(preflight >= 0, `${file} must run release preflight`);
    assert.ok(preflight < migration, `${file} must preflight before migrations`);
    assert.ok(migration < application, `${file} must deploy schema before the application`);
    assert.match(workflow, /test "\$REQUESTED_SHA" = "\$ACTUAL_SHA"/);
  }
});

test('schema deploy verifies evidence before connecting and applies one atomic release', async () => {
  const deploy = await read('scripts/deploy-migrations.mjs');
  const verify = deploy.indexOf('await verifyReleaseAttestation');
  const connect = deploy.indexOf('await client.connect()');
  const inspect = deploy.indexOf('await inspectSchemaDeployment');
  const mutation = deploy.indexOf('create schema if not exists safebus_release');

  assert.ok(verify >= 0 && verify < connect);
  assert.ok(connect < inspect && inspect < mutation);
  assert.equal(deploy.match(/await client\.query\('begin'\)/g)?.length, 1);
  assert.match(deploy, /for \(const migration of preflight\.pending\)/);
  assert.match(deploy, /Any error rolls it all back/);
});

test('the preflight runner executes every required gate before writing evidence', async () => {
  const runner = await read('scripts/run-release-preflight.mjs');
  const attestation = runner.indexOf('await createReleaseAttestation');
  const orderedChecks = [
    "await run('migrations:verify')",
    "await run('migrations:preflight')",
    "await run('types:check')",
    "await run('typecheck')",
    "await run('lint')",
    "await run('test')",
    "await run('security:audit')",
    "await run('build')",
    "await rejectSourceMaps(path.join(process.cwd(), 'apps'))",
    "await run('test:smoke:release')",
  ];

  let previous = -1;
  for (const check of orderedChecks) {
    const current = runner.indexOf(check);
    assert.ok(current > previous, `${check} must be present in release order`);
    assert.ok(current < attestation, `${check} must finish before attestation`);
    previous = current;
  }
});

test('Point 3 safe-release decision is approved and recorded', async () => {
  const decisions = await read('docs/governance/decision-log.md');

  assert.match(decisions, /### DL-012 — Enforce fail-closed, attested releases/);
  assert.match(decisions, /- Owner: Platform Administrator/);
  assert.match(decisions, /- Approved by: Platform Administrator/);
  assert.match(decisions, /- Status: Accepted on 2026-08-12/);
  assert.match(decisions, /populated database without an approved SafeBus release ledger/);
});
