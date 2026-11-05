import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import {
  digest,
  snapshotDefaults,
  verifyDefaults,
  rehearseDefaults,
  SESSION_POLICY_TABLES,
  SESSION_POLICIES_SQL,
} from '../../scripts/lib/default-privilege-rollout.mjs';

test('policy role lists use the same array representation in the release database driver', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role authenticated;
    create schema safebus_private;
    create table safebus_private.authority_announcements(id integer);
    create policy safebus_active_session on safebus_private.authority_announcements
      as restrictive for all to authenticated using(true);`);
  const result = await db.query(SESSION_POLICIES_SQL);
  const field = result.fields.find((entry) => entry.name === 'roles');
  const wire = (
    await db.query(`select roles::text as value from pg_policies
    where schemaname='safebus_private' and tablename='authority_announcements'`)
  ).rows[0].value;
  // Reproduce the actual pg decoding that PGlite's native results do not exercise.
  assert.equal(pg.types.getTypeParser(1003)(wire), '{authenticated}');
  assert.deepEqual(pg.types.getTypeParser(field.dataTypeID)(wire), ['authenticated']);
  assert.deepEqual(result.rows.find((row) => row.policyname).roles, ['authenticated']);
});

test('application default repair rehearses exact recovery and leaves managed findings visible', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const client = { query: async (sql) => (await db.exec(sql)).at(-1) ?? { rows: [] } };
  // This owned in-memory database never connects to a hosted project.
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create role supabase_admin superuser; revoke create on schema public from public;
    grant create on schema public to postgres,supabase_admin;
    create schema provider_runtime;
    alter default privileges for role postgres in schema provider_runtime grant execute on functions to authenticated;
    alter default privileges for role postgres in schema public grant all on tables to postgres,anon,authenticated,service_role;
    alter default privileges for role postgres in schema public grant all on sequences to postgres,anon,authenticated,service_role;
    alter default privileges for role postgres in schema public grant all on functions to postgres,anon,authenticated,service_role;
    alter default privileges for role supabase_admin in schema public grant all on tables to postgres,anon,authenticated,service_role;
    alter default privileges for role supabase_admin in schema public grant all on sequences to postgres,anon,authenticated,service_role;
    alter default privileges for role supabase_admin in schema public grant all on functions to postgres,anon,authenticated,service_role;
    create table public.existing_data(id integer primary key);
    insert into public.existing_data values(1);
    alter table public.existing_data enable row level security;
    create policy existing_reader on public.existing_data for select to authenticated using(true);
    create function public.existing_api() returns integer language sql as 'select 1';
    revoke all on function public.existing_api() from public,anon,service_role;
    grant execute on function public.existing_api() to authenticated;`);
  const production = JSON.parse(
    await fs.readFile('config/pending/application-default-privileges.json', 'utf8'),
  );
  await db.exec(`create schema safebus_private;
    grant usage on schema safebus_private to authenticated;
    create function public.is_current_user_session_active() returns boolean language sql
      as $$ select current_setting('safebus.test_session',true)='active' $$;`);
  for (const table of SESSION_POLICY_TABLES) {
    await db.exec(`create table safebus_private.${table}(id integer primary key);
      insert into safebus_private.${table} values(1);
      alter table safebus_private.${table} enable row level security;
      create policy fixture_reader on safebus_private.${table} for select to authenticated using(true);
      grant select on safebus_private.${table} to authenticated;`);
  }
  const defaultsSql = (await fs.readFile(production.migration, 'utf8')).replaceAll('\r', '');
  const guardSql = (await fs.readFile(production.guardMigration, 'utf8')).replaceAll('\r', '');
  const forward = defaultsSql + '\n' + guardSql;
  const restore = (await fs.readFile(production.restoreFile, 'utf8')).replaceAll('\r', '');
  assert.equal(digest(defaultsSql), production.migrationSha256);
  assert.equal(digest(guardSql), production.guardMigrationSha256);
  assert.equal(digest(forward), production.forwardSha256);
  assert.equal(digest(restore), production.restoreSha256);
  const before = await snapshotDefaults(client);
  assert.equal(before.findings.length, 51);
  await db.exec(forward);
  const after = await snapshotDefaults(client);
  assert.equal(after.guardHash, before.guardHash);
  assert.equal(after.findings.length, 25);
  assert.equal(before.sessionPolicies.filter((p) => p.policyname).length, 0);
  assert.equal(after.sessionPolicies.length, 10);
  assert.ok(
    after.sessionPolicies.every(
      (p) =>
        p.policyname === 'safebus_active_session' &&
        p.permissive === 'RESTRICTIVE' &&
        p.roles.join(',') === 'authenticated',
    ),
  );
  assert.ok(after.findings.every((f) => f.startsWith('supabase_admin:')));
  assert.deepEqual(
    after.defaults.filter((r) => r.owner === 'supabase_admin'),
    before.defaults.filter((r) => r.owner === 'supabase_admin'),
  );
  assert.deepEqual(
    after.defaults.filter((r) => r.schema === 'provider_runtime'),
    before.defaults.filter((r) => r.schema === 'provider_runtime'),
  );
  await db.exec(restore);
  assert.deepEqual(await snapshotDefaults(client), before);
  const config = { guardHash: before.guardHash, before, after };
  await rehearseDefaults(client, forward, restore, config);
  assert.deepEqual(await snapshotDefaults(client), before);
  await assert.rejects(rehearseDefaults(client, forward + '\nselect 1/0;', restore, config));
  assert.deepEqual(await snapshotDefaults(client), before);
  assert.throws(() => verifyDefaults({ ...after, guardHash: 'changed' }, config, 'after'), {
    message: 'DEFAULT_PRIVILEGE_SNAPSHOT_CHANGED',
    snapshotPhase: 'after',
    snapshotSection: 'guardHash',
  });
  assert.throws(() => verifyDefaults({ ...after, findings: [] }, config, 'after'), {
    message: 'DEFAULT_PRIVILEGE_SNAPSHOT_CHANGED',
    snapshotPhase: 'after',
    snapshotSection: 'findings',
  });
  assert.throws(
    () =>
      verifyDefaults(
        {
          ...after,
          sessionPolicies: after.sessionPolicies.map((p) => ({ ...p, roles: '{authenticated}' })),
        },
        config,
        'after',
      ),
    {
      message: 'DEFAULT_PRIVILEGE_SNAPSHOT_CHANGED',
      snapshotPhase: 'after',
      snapshotSection: 'sessionPolicies',
    },
  );
  await db.exec(forward);
  await db.exec(`create table public.future_data(id serial primary key);
    create function public.future_api() returns integer language sql as 'select 2';
    set role pg_database_owner;
    create function public.future_owner_api() returns integer language sql as 'select 3';
    reset role;`);
  for (const role of ['anon', 'authenticated']) {
    const row = (
      await db.query(
        `select has_table_privilege($1,'public.future_data','SELECT') as table_access,
      has_sequence_privilege($1,'public.future_data_id_seq','USAGE') as sequence_access,
      has_function_privilege($1,'public.future_api()','EXECUTE') as function_access,
      has_function_privilege($1,'public.future_owner_api()','EXECUTE') as owner_function_access`,
        [role],
      )
    ).rows[0];
    assert.deepEqual(row, {
      table_access: false,
      sequence_access: false,
      function_access: false,
      owner_function_access: false,
    });
  }
  const retained = (
    await db.query(`select
    has_function_privilege('authenticated','public.existing_api()','EXECUTE') as existing_access,
    has_function_privilege('service_role','public.future_api()','EXECUTE') as service_access,
    (select count(*)::integer from public.existing_data) as records`)
  ).rows[0];
  assert.deepEqual(retained, { existing_access: true, service_access: true, records: 1 });
  await db.exec("set role authenticated;set safebus.test_session='inactive'");
  assert.equal(
    (
      await db.query(
        'select count(*)::integer as count from safebus_private.authority_announcements',
      )
    ).rows[0].count,
    0,
  );
  await db.exec("set safebus.test_session='active'");
  assert.equal(
    (
      await db.query(
        'select count(*)::integer as count from safebus_private.authority_announcements',
      )
    ).rows[0].count,
    1,
  );
  await db.exec('reset role');
});

test('protected default repair binds recovery before installation and does not waive the full audit', async () => {
  const workflow = await fs.readFile(
    '.github/workflows/release-application-default-privileges.yml',
    'utf8',
  );
  const script = await fs.readFile('scripts/release-application-default-privileges.mjs', 'utf8');
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/validate-security-install\.yml/);
  assert.match(workflow, /group: production-release/);
  assert.ok(
    workflow.indexOf('Retain recovery before persistent installation') <
      workflow.indexOf('Install application-owned future defaults and private session guards'),
  );
  for (const invariant of [
    'assertReviewedCheckout(releaseSha)',
    'assertEnvironmentIdentity(client, binding)',
    'envelope.ciphertextSha256',
    'envelope.plaintextSha256',
    'rehearseDefaults(client, forward, restore, config)',
    'fullAuthorizationAuditPassed: false',
  ])
    assert.ok(script.includes(invariant), invariant);
  assert.doesNotMatch(
    script,
    /set role supabase_admin|alter role .*superuser|process\.env\.GITHUB_ACTIONS\s*=/i,
  );
  const config = JSON.parse(
    await fs.readFile('config/pending/application-default-privileges.json', 'utf8'),
  );
  assert.equal(config.before.findings.length, 51);
  assert.equal(config.after.findings.length, 25);
  assert.equal(config.before.sessionPolicies.filter((p) => p.policyname).length, 0);
  assert.equal(
    config.after.sessionPolicies.filter((p) => p.policyname === 'safebus_active_session').length,
    10,
  );
  assert.ok(config.after.findings.every((f) => f.startsWith('supabase_admin:')));
  const audit = await fs.readFile('scripts/audit-database-authorization.mjs', 'utf8');
  assert.match(audit, /client\.query\(UNSAFE_PUBLIC_DEFAULT_PRIVILEGES_SQL\)/);
  assert.match(audit, /await auditReservedProviderDefaults\(/);
  assert.match(audit, /retainedFindings: unsafeDefaults\.rows/);
});
