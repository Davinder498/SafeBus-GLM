import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import {
  SCHEMA_FINGERPRINT_FORMAT,
  calculateSchemaFingerprint,
  collectSchemaCatalog,
} from '../../scripts/lib/schema-fingerprint.mjs';
import { inspectSchemaDeployment } from '../../scripts/lib/schema-deployment-preflight.mjs';
import { createEnvironmentBinding } from '../../scripts/lib/environment-identity.mjs';
import { sha256 } from '../../scripts/lib/migrations.mjs';

// This owned in-memory fixture has no network, Auth identities, provider jobs or
// customer rows. It does not replay SafeBus migrations or use a hosted target.
const FIXTURE = `
  create role anon;
  create role authenticated;
  create role service_role;
  create role authenticator;
  create role integrity_parent;
  create role integrity_reader;
  create schema safebus_private;
  create schema realtime;
  create schema provider_runtime;
  create table public.integrity_rows(id integer primary key, private_note text);
  alter table public.integrity_rows enable row level security;
  grant select on public.integrity_rows to integrity_reader;
  create policy scoped_read on public.integrity_rows to authenticated using (id > 0);
  create table safebus_private.integrity_rows(id integer);
  alter table safebus_private.integrity_rows enable row level security;
  create table realtime.messages(id integer, topic text);
  alter table realtime.messages enable row level security;
  create policy "safebus tracking broadcast receive" on realtime.messages
    for select to authenticated using (topic = 'fixture');
  create policy safebus_active_session on realtime.messages as restrictive
    to authenticated using (id > 0) with check (id > 0);
  create function safebus_private.integrity_helper() returns boolean
    language sql security definer set search_path=pg_catalog as 'select true';
  revoke all on function safebus_private.integrity_helper() from public;
  create function safebus_private.integrity_trigger() returns trigger
    language plpgsql set search_path=pg_catalog as $$ begin return new; end $$;
  create trigger integrity_trigger before insert on safebus_private.integrity_rows
    for each row execute function safebus_private.integrity_trigger();
  create function safebus_private.integrity_event() returns event_trigger
    language plpgsql set search_path=pg_catalog as $$ begin return; end $$;
  create event trigger integrity_event on ddl_command_end
    execute function safebus_private.integrity_event();
  create view public.integrity_view with (security_invoker=true)
    as select id from public.integrity_rows;
  create type safebus_private.integrity_enum as enum ('active','ended');
  create domain safebus_private.integrity_domain as integer check (value > 0);
  create sequence safebus_private.integrity_sequence;
  create publication integrity_publication for table public.integrity_rows;
  create table provider_runtime.runtime_state(id integer);
`;

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(FIXTURE);
  const client = {
    async query(sql, parameters) {
      const result = await db.query(sql, parameters);
      return { ...result, rowCount: result.rows.length };
    },
  };
  return { db, client };
}

test('real PostgreSQL fingerprints detect security/schema changes and recover after rollback', async (t) => {
  const { db, client } = await fixture(t);
  const baseline = await calculateSchemaFingerprint(client);
  assert.equal(baseline, await calculateSchemaFingerprint(client));

  const changes = [
    [
      'private helper body',
      `create or replace function safebus_private.integrity_helper()
      returns boolean language sql security definer set search_path=pg_catalog as 'select false'`,
    ],
    [
      'private helper search path',
      'alter function safebus_private.integrity_helper() set search_path=public',
    ],
    [
      'private helper ownership',
      'alter function safebus_private.integrity_helper() owner to integrity_parent',
    ],
    [
      'private helper execution grant',
      'grant execute on function safebus_private.integrity_helper() to anon',
    ],
    [
      'private table structure',
      'alter table safebus_private.integrity_rows add column extra integer',
    ],
    ['private table grant', 'grant select on safebus_private.integrity_rows to authenticated'],
    [
      'private RLS disabled',
      'alter table safebus_private.integrity_rows disable row level security',
    ],
    ['private schema grant', 'grant usage on schema safebus_private to anon'],
    ['column disclosure', 'grant select(private_note) on public.integrity_rows to authenticated'],
    [
      'column grant option',
      'grant select(private_note) on public.integrity_rows to authenticated with grant option',
    ],
    [
      'scoped future grants',
      'alter default privileges in schema public grant select on tables to authenticated',
    ],
    ['global future execution', 'alter default privileges revoke execute on functions from public'],
    ['view invoker mode', 'alter view public.integrity_view set (security_invoker=false)'],
    [
      'view result definition',
      'create or replace view public.integrity_view as select id from public.integrity_rows where id > 1',
    ],
    [
      'private trigger disabled',
      'alter table safebus_private.integrity_rows disable trigger integrity_trigger',
    ],
    ['RLS policy predicate', 'alter policy scoped_read on public.integrity_rows using (true)'],
    [
      'realtime session policy',
      'alter policy safebus_active_session on realtime.messages using (true)',
    ],
    ['realtime relation grant', 'grant select on realtime.messages to anon'],
    ['realtime forced RLS', 'alter table realtime.messages force row level security'],
    ['private enum', "alter type safebus_private.integrity_enum rename value 'active' to 'paused'"],
    [
      'private domain',
      'alter domain safebus_private.integrity_domain drop constraint integrity_domain_check',
    ],
    [
      'private sequence settings',
      'alter sequence safebus_private.integrity_sequence increment by 2',
    ],
    ['event trigger disabled', 'alter event trigger integrity_event disable'],
    ['publication operation', "alter publication integrity_publication set (publish='insert')"],
    [
      'publication membership/filter',
      'alter publication integrity_publication set table public.integrity_rows where (id > 1)',
    ],
    [
      'API session hook',
      "alter role authenticator set pgrst.db_pre_request='safebus_private.integrity_helper'",
    ],
    [
      'API schema exposure',
      "alter role authenticator set pgrst.db_schemas='public,safebus_private'",
    ],
    ['client bypass privilege', 'alter role authenticated bypassrls'],
    ['direct grantee bypass privilege', 'alter role integrity_reader bypassrls'],
    ['inherited role', 'grant integrity_parent to authenticated'],
    ['membership options', 'grant integrity_parent to authenticated with inherit false, set false'],
    [
      'public column definition',
      'alter table public.integrity_rows alter column private_note set not null',
    ],
    ['public index', 'create index integrity_note_idx on public.integrity_rows(private_note)'],
  ];

  for (const [name, sql] of changes) {
    await t.test(name, async () => {
      await db.exec('begin');
      try {
        await db.exec(sql);
        assert.notEqual(await calculateSchemaFingerprint(client), baseline, name);
      } finally {
        await db.exec('rollback');
      }
      assert.equal(await calculateSchemaFingerprint(client), baseline, name + ' rollback');
    });
  }
});

test('catalog hashing reads only metadata and ignores row/sequence/provider runtime activity', async (t) => {
  const { db, client } = await fixture(t);
  const baseline = await calculateSchemaFingerprint(client);
  await db.exec(`insert into public.integrity_rows values (1,'synthetic');
    insert into realtime.messages values (1,'fixture');
    select nextval('safebus_private.integrity_sequence');
    alter table provider_runtime.runtime_state add column harmless integer;
    create table realtime.managed_partition_placeholder(id integer)`);
  assert.equal(await calculateSchemaFingerprint(client), baseline);

  const statements = [];
  await db.exec('begin transaction read only');
  try {
    const catalog = await collectSchemaCatalog({
      async query(sql) {
        statements.push(sql);
        assert.match(sql.trim(), /^(select|with recursive)\b/i);
        return client.query(sql);
      },
    });
    assert.equal(catalog.format, SCHEMA_FINGERPRINT_FORMAT);
    assert.equal(catalog.format, 2);
    assert.ok(catalog.catalog.routines.some((r) => r.schema_name === 'safebus_private'));
    assert.ok(catalog.catalog.policies.some((p) => p.policyname === 'safebus_active_session'));
    assert.ok(statements.length >= 20);
    assert.equal(JSON.stringify(catalog).includes('synthetic'), false);
    assert.equal(baseline, sha256(JSON.stringify(catalog)));
    assert.notEqual(baseline, sha256(JSON.stringify(Object.values(catalog.catalog))));
  } finally {
    await db.exec('rollback');
  }
});

test('deployment preflight rejects real private drift without replacing the saved fingerprint', async (t) => {
  const { db, client } = await fixture(t);
  const binding = createEnvironmentBinding({
    environment: 'production',
    databaseUrl:
      'postgresql://postgres:synthetic@db.abcdefghijklmnopqrst.supabase.co:5432/postgres',
    supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
  });
  await db.exec(`create schema safebus_release;
    create table safebus_release.environment_identity(singleton boolean,
      environment text,database_target text,project_ref_hash text,public_api_origin_hash text);
    create table safebus_release.migration_checksums(filename text,checksum text);
    create table safebus_release.releases(schema_fingerprint text,status text,deployed_at timestamptz);
    insert into safebus_release.migration_checksums values ('0001_fixture.sql','checksum')`);
  await db.query('insert into safebus_release.environment_identity values (true,$1,$2,$3,$4)', [
    binding.environment,
    binding.databaseTarget,
    binding.projectRefHash,
    binding.publicApiOriginHash,
  ]);
  const baseline = await calculateSchemaFingerprint(client);
  await db.query("insert into safebus_release.releases values ($1,'deployed',now())", [baseline]);
  const manifest = { migrations: [{ filename: '0001_fixture.sql', sha256: 'checksum' }] };
  assert.equal((await inspectSchemaDeployment(client, manifest, binding)).pending.length, 0);

  await db.exec('grant select(private_note) on public.integrity_rows to authenticated');
  await db.exec('begin transaction read only');
  try {
    await assert.rejects(inspectSchemaDeployment(client, manifest, binding), /authorization drift/);
  } finally {
    await db.exec('rollback');
  }
  assert.equal(
    (await db.query('select schema_fingerprint from safebus_release.releases')).rows[0]
      .schema_fingerprint,
    baseline,
  );
});

test('drift and authorization entry points preserve bounded rollback-only production reads', async () => {
  const drift = await fs.readFile('scripts/check-migration-drift.mjs', 'utf8');
  const audit = await fs.readFile('scripts/audit-database-authorization.mjs', 'utf8');
  for (const source of [drift, audit]) {
    assert.match(source, /begin transaction read only/);
    assert.match(source, /set transaction isolation level repeatable read/);
    assert.match(source, /set local statement_timeout/);
    assert.match(source, /set local lock_timeout/);
    assert.match(source, /query\('rollback'\)/);
    assert.match(source, /GITHUB_ACTIONS/);
  }
  assert.match(audit, /await assertPrivateApiSchemaHidden\(supabaseUrl, secretKey\)/);
  assert.match(audit, /AbortSignal\.timeout\(10000\)/);
  assert.doesNotMatch(audit, /privateSchemaResponse\.ok/);
});

test('obsolete historical adoption refuses before connecting even with legacy confirmations', () => {
  const result = spawnSync(process.execPath, ['scripts/adopt-existing-production.mjs'], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      GITHUB_ACTIONS: 'true',
      SAFEBUS_DEPLOY_ENV: 'production',
      SAFEBUS_ADOPTION_CONFIRM: 'ADOPT_EXISTING_PRODUCTION',
      SAFEBUS_BACKUP_CONFIRM: 'BACKUP_VERIFIED',
      SAFEBUS_SERVICE_TIER_CONFIRM: 'FREE_PRELAUNCH_ONLY',
      SAFEBUS_REGION_CONFIRM: 'CA_CENTRAL_1_VERIFIED',
      SAFEBUS_BACKUP_EVIDENCE_REFERENCE: 'TEST/UNVERIFIED-REFERENCE',
      SAFEBUS_RELEASE_SHA: 'a'.repeat(40),
      SAFEBUS_DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/postgres',
      SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    },
    timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Historical production adoption is blocked/);
  assert.match(result.stderr, /No database connection was made/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|synthetic@|127\.0\.0\.1/);
});
