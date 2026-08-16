import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const migrationPath = 'supabase/migrations/0089_authorization_surface_hardening.sql';
const byodMigrationPath = 'supabase/migrations/0090_phase7_byod_android_tracking.sql';

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      ['node_modules', 'dist', 'build', 'coverage', '__tests__', 'tests', 'test'].includes(
        entry.name,
      )
    )
      continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(target)));
    else files.push(target);
  }
  return files;
}

test('authorization surface is exact, unique, and audience-separated', async () => {
  const surface = await readJson('config/authorization-surface.json');
  for (const audience of ['authenticated', 'serviceRole']) {
    assert.ok(Array.isArray(surface[audience]));
    assert.ok(surface[audience].length > 0);
    assert.deepEqual(surface[audience], [...surface[audience]].sort());
    assert.equal(new Set(surface[audience]).size, surface[audience].length);
  }
  const authenticated = new Set(surface.authenticated);
  for (const signature of surface.serviceRole) assert.equal(authenticated.has(signature), false);

  for (const studentQrRpc of [
    'get_admin_student_qr_credential_status(uuid)',
    'manage_student_qr_credential(uuid,text)',
    'resolve_student_qr_for_active_trip(text)',
  ]) {
    assert.equal(authenticated.has(studentQrRpc), false);
    assert.ok(surface.serviceRole.includes(studentQrRpc));
  }
});

test('migration chain audiences match the reviewed authorization manifest', async () => {
  const [surface, migration, byodMigration] = await Promise.all([
    readJson('config/authorization-surface.json'),
    fs.readFile(migrationPath, 'utf8'),
    fs.readFile(byodMigrationPath, 'utf8'),
  ]);
  const allowlistInsert = migration.match(
    /insert into safebus_rpc_allowlist[\s\S]*?values([\s\S]*?);/i,
  )?.[1];
  assert.ok(allowlistInsert);
  const entries = [
    ...allowlistInsert.matchAll(/\('([a-z0-9_]+)', '(authenticated|service_role)'\)/g),
  ];
  const actual = new Map(entries.map((match) => [match[1], match[2]]));
  for (const match of byodMigration.matchAll(
    /alter function public\.([a-z0-9_]+)\([^;]+\)\s+set schema safebus_private/gi,
  )) {
    actual.delete(match[1]);
  }
  for (const match of byodMigration.matchAll(
    /grant execute on function public\.([a-z0-9_]+)\([^;]+\)\s+to (authenticated|service_role)/gi,
  )) {
    actual.set(match[1], match[2]);
  }
  const expected = new Map();
  for (const signature of surface.authenticated) {
    expected.set(signature.slice(0, signature.indexOf('(')), 'authenticated');
  }
  for (const signature of surface.serviceRole) {
    expected.set(signature.slice(0, signature.indexOf('(')), 'service_role');
  }
  assert.deepEqual([...actual].sort(), [...expected].sort());
});

test('production application RPC references are all reviewed', async () => {
  const surface = await readJson('config/authorization-surface.json');
  const approved = new Set(
    [...surface.authenticated, ...surface.serviceRole].map((entry) =>
      entry.slice(0, entry.indexOf('(')),
    ),
  );
  const referenced = new Set();
  const sourceRoots = [
    'apps/web/src',
    'apps/web/netlify',
    'apps/mobile/src',
    'apps/mobile/android/app/src/main/java',
  ];
  for (const file of (await Promise.all(sourceRoots.map((root) => walk(root)))).flat()) {
    if (!/\.(?:[cm]?[jt]sx?|java)$/.test(file)) continue;
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) continue;
    const source = await fs.readFile(file, 'utf8');
    for (const match of source.matchAll(/\.rpc\(\s*['"]([a-zA-Z0-9_]+)['"]/g)) {
      referenced.add(match[1]);
    }
    for (const match of source.matchAll(/\/rpc\/([a-zA-Z0-9_]+)/g)) referenced.add(match[1]);
  }
  for (const dynamicName of [
    'cancel_guardian_notification_email',
    'complete_guardian_notification_email',
    'fail_guardian_notification_email',
    'mark_student_dropped_off_for_active_trip',
    'mark_student_picked_up_for_active_trip',
    'retry_guardian_notification_email',
    'search_admin_buses',
    'search_admin_guardians',
    'search_admin_routes',
    'tenant_add_sub_administrator',
    'tenant_invite_administrator',
  ]) {
    referenced.add(dynamicName);
  }
  assert.deepEqual(
    [...referenced].filter((name) => !approved.has(name)),
    [],
  );
});

test('hardening migration removes spare keys and hides internal routines', async () => {
  const migration = await fs.readFile(migrationPath, 'utf8');
  for (const required of [
    /create schema if not exists safebus_private/i,
    /alter function %s set schema safebus_private/i,
    /revoke execute on all functions in schema public from public, anon, authenticated, service_role/i,
    /revoke all on all tables in schema public from anon, authenticated/i,
    /revoke all on all sequences in schema public from anon, authenticated/i,
    /alter default privileges for role postgres in schema public[\s\S]*revoke all on tables/i,
    /alter default privileges for role postgres in schema public[\s\S]*revoke execute on functions/i,
    /create event trigger safebus_enable_public_table_rls/i,
    /set local search_path = pg_catalog, public, safebus_private, auth, extensions, realtime, pg_temp/i,
    /alter function %s set search_path = pg_catalog, public, safebus_private, auth, extensions, realtime, pg_temp/i,
    /user_metadata\|raw_user_meta_data/i,
  ]) {
    assert.match(migration, required);
  }
  assert.doesNotMatch(migration, /grant\s+execute[^;]+\bto\s+anon\b/i);
  assert.doesNotMatch(migration, /grant\s+(?:all|select|insert|update|delete)[^;]+\bto\s+anon\b/i);
});

test('authorization audit is read-only and is a protected release gate', async () => {
  const [audit, workflow, preflight] = await Promise.all([
    fs.readFile('scripts/audit-database-authorization.mjs', 'utf8'),
    fs.readFile('.github/workflows/authorization-audit.yml', 'utf8'),
    fs.readFile('scripts/run-release-preflight.mjs', 'utf8'),
  ]);
  assert.match(audit, /begin transaction read only/i);
  assert.match(audit, /assertEnvironmentIdentity/);
  assert.match(audit, /GITHUB_ACTIONS/);
  assert.match(audit, /application\/openapi\+json/);
  assert.doesNotMatch(
    audit,
    /\b(?:insert|update|delete|alter|create|drop|grant|revoke)\s+(?:into|table|schema|function|on)\b/i,
  );
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /pnpm authorization:audit/);
  assert.match(preflight, /await run\('authorization:audit'\)/);
});
