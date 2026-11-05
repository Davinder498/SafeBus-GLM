import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { UNSAFE_PUBLIC_DEFAULT_PRIVILEGES_SQL } from '../../scripts/lib/default-privilege-audit.mjs';
import { createHash } from 'node:crypto';
import {
  RESERVED_PROVIDER_BOUNDARY_SQL,
  RESERVED_PROVIDER_FINDINGS,
  verifyReservedProviderBoundary,
  auditReservedProviderDefaults,
} from '../../scripts/lib/reserved-provider-defaults.mjs';

test('default privilege audit checks effective global and schema defaults in PostgreSQL', async (t) => {
  // Owned in-memory database: no hosted connection, customer rows or jobs.
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create role application_owner; create role platform_owner;
    create role client_parent; grant client_parent to authenticated;
    revoke create on schema public from public;
    grant create on schema public to application_owner, platform_owner;
  `);
  // Close unrelated fixture bootstrap/implicit database-owner function defaults.
  const creators = (
    await db.query(`select rolname from pg_roles
    where has_schema_privilege(oid,'public','CREATE')`)
  ).rows;
  for (const { rolname } of creators) {
    if (['application_owner', 'platform_owner'].includes(rolname)) continue;
    await db.exec(`alter default privileges for role "${rolname.replaceAll('"', '""')}"
      revoke execute on functions from public`);
  }
  const findings = async () =>
    (await db.query(UNSAFE_PUBLIC_DEFAULT_PRIVILEGES_SQL)).rows.map((row) => row.object_name);

  await t.test('missing global ACL rows retain built-in PUBLIC function execution', async () => {
    assert.deepEqual(await findings(), [
      'application_owner:<global>:f:PUBLIC:EXECUTE',
      'platform_owner:<global>:f:PUBLIC:EXECUTE',
    ]);
    await db.exec(`set role application_owner;
      create function public.audit_probe() returns integer language sql as 'select 1';
      reset role;`);
    assert.equal(
      (
        await db.query(`select has_function_privilege('anon',
      'public.audit_probe()', 'EXECUTE') as allowed`)
      ).rows[0].allowed,
      true,
    );
  });

  await t.test('schema-only PUBLIC revocation cannot remove global execution', async () => {
    await db.exec(`alter default privileges for role application_owner in schema public
      revoke execute on functions from public`);
    assert.ok((await findings()).includes('application_owner:<global>:f:PUBLIC:EXECUTE'));
    await db.exec(`alter default privileges for role application_owner revoke execute on functions from public;
      alter default privileges for role platform_owner revoke execute on functions from public;`);
    assert.deepEqual(await findings(), []);
    await db.exec(`set role application_owner;
      create function public.closed_probe() returns integer language sql as 'select 1';
      reset role;`);
    assert.deepEqual(
      (
        await db.query(`select has_function_privilege('anon', 'public.closed_probe()', 'EXECUTE') as anon,
        has_function_privilege('authenticated', 'public.closed_probe()', 'EXECUTE') as authenticated`)
      ).rows,
      [{ anon: false, authenticated: false }],
    );
  });

  await t.test('both owners, schema grants and PostgreSQL MAINTAIN are reported', async () => {
    await db.exec(`begin;
      alter default privileges for role application_owner in schema public grant all on tables to anon;
      alter default privileges for role platform_owner in schema public grant all on sequences to authenticated;
      alter default privileges for role platform_owner in schema public grant execute on functions to anon;
      revoke create on schema public from platform_owner;`);
    const actual = await findings();
    assert.ok(actual.includes('application_owner:public:r:anon:MAINTAIN'));
    assert.ok(actual.includes('platform_owner:public:S:authenticated:UPDATE'));
    assert.ok(actual.includes('platform_owner:public:f:anon:EXECUTE'));
    await db.exec('rollback');
    assert.deepEqual(await findings(), []);
  });

  await t.test(
    'global grants inherited by a client are unsafe without schema ACL rows',
    async () => {
      await db.exec(`begin;
      alter default privileges for role application_owner grant select on tables to client_parent;`);
      assert.deepEqual(await findings(), ['application_owner:<global>:r:client_parent:SELECT']);
      await db.exec('rollback');
    },
  );

  await t.test(
    'service defaults and unrelated provider schemas do not fail this public audit',
    async () => {
      await db.exec(`create schema provider_runtime;
      alter default privileges for role platform_owner in schema provider_runtime grant all on tables to anon;
      alter default privileges for role application_owner in schema public grant all on tables to service_role;`);
      assert.deepEqual(await findings(), []);
      // Default changes leave existing function privileges unchanged.
      assert.equal(
        (
          await db.query(`select has_function_privilege('anon',
      'public.audit_probe()', 'EXECUTE') as allowed`)
        ).rows[0].allowed,
        true,
      );
    },
  );
});

test('reserved-provider treatment requires actual catalog and Data API isolation', async (t) => {
  // Owned embedded database only; every injected fault is rolled back.
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create role supabase_admin superuser; create role audit_operator;
    alter role service_role bypassrls;
    revoke create on schema public from public;
    alter default privileges for role postgres revoke execute on functions from public;
    alter default privileges for role pg_database_owner revoke execute on functions from public;
    alter default privileges for role supabase_admin in schema public grant all on tables to postgres,anon,authenticated,service_role;
    alter default privileges for role supabase_admin in schema public grant all on sequences to postgres,anon,authenticated,service_role;
    alter default privileges for role supabase_admin in schema public grant all on functions to postgres,anon,authenticated,service_role;`);
  const client = { query: (sql) => db.query(sql) };
  const options = {
    client,
    binding: { projectRefHash: createHash('sha256').update('ckrkfylsyihwouvesypm').digest('hex') },
    supabaseUrl: 'https://ckrkfylsyihwouvesypm.supabase.co',
    apiKey: 'synthetic-fixture-key',
  };
  const findings = async () =>
    (await db.query(UNSAFE_PUBLIC_DEFAULT_PRIVILEGES_SQL)).rows.map((r) => r.object_name);
  const boundary = async () => (await db.query(RESERVED_PROVIDER_BOUNDARY_SQL)).rows[0].boundary;
  const inspect = async () => verifyReservedProviderBoundary(await findings(), await boundary());
  await db.exec('set role audit_operator');
  assert.deepEqual(await findings(), RESERVED_PROVIDER_FINDINGS);
  const baseline = await boundary();
  assert.deepEqual(await inspect(), ['pg_catalog']);

  await t.test('reports retained defaults and verifies every actual extension schema', async () => {
    const checked = [];
    const result = await auditReservedProviderDefaults({
      ...options,
      findings: await findings(),
      fetchImpl: async (url, request) => {
        assert.equal(url.origin, options.supabaseUrl);
        assert.match(url.pathname, /__safebus_security_schema_probe__$/);
        assert.equal(url.search, '?select=id&limit=0');
        assert.equal(request.method, 'GET');
        assert.equal(request.redirect, 'error');
        assert.equal(request.headers.apikey, options.apiKey);
        checked.push(request.headers['Accept-Profile']);
        return { status: 406, json: async () => ({ code: 'PGRST106' }) };
      },
    });
    assert.deepEqual(result, {
      retainedProviderDefaults: 25,
      verifiedHiddenSchemas: ['pg_catalog'],
    });
    assert.deepEqual(checked, ['pg_catalog']);
  });

  const faults = [
    [
      'application-owned defaults',
      `alter default privileges for role postgres in schema public grant select on tables to anon`,
    ],
    [
      'a public provider table',
      `set role supabase_admin; create table public.provider_probe(id integer); reset role`,
    ],
    [
      'a public provider function',
      `set role supabase_admin; create function public.provider_probe() returns int language sql as 'select 1'; reset role`,
    ],
    [
      'a public extension',
      `update pg_extension set extnamespace='public'::regnamespace where extname='plpgsql'`,
    ],
    [
      'an extension member outside its declared schema',
      `create function public.member_probe() returns int language sql as 'select 1'; alter extension plpgsql add function public.member_probe()`,
    ],
    [
      'inherited schema creation',
      `create role create_parent; grant create on schema public to create_parent; grant create_parent to authenticated`,
    ],
    [
      'transitive provider membership',
      `create role provider_parent; grant supabase_admin to provider_parent; grant provider_parent to authenticated`,
    ],
    [
      'non-inherited SET access to the application owner',
      `grant postgres to authenticated with inherit false, set true`,
    ],
    [
      'non-inherited server-role access',
      `grant service_role to authenticated with inherit false, set true`,
    ],
    [
      'a new creator membership without new default findings',
      `create role another_creator; grant create on schema public to another_creator;
       alter default privileges for role another_creator revoke execute on functions from public;
       grant another_creator to authenticated with inherit false, set true`,
    ],
    ['client role creation', `alter role authenticated createrole`],
    ['client direct login', `alter role anon login`],
    ['server role creation', `alter role service_role createrole`],
    [
      'a changed grant option with the same raw finding set',
      `alter default privileges for role supabase_admin in schema public grant execute on functions to anon with grant option`,
    ],
    [
      'a changed service-role default',
      `alter default privileges for role supabase_admin in schema public revoke execute on functions from service_role`,
    ],
  ];
  for (const [name, sql] of faults) {
    await t.test('rejects ' + name, async () => {
      await db.exec('reset role; begin');
      try {
        await db.exec(sql);
        await db.exec('set local role audit_operator');
        await assert.rejects(inspect(), /RESERVED_PROVIDER_DEFAULT_BOUNDARY_UNVERIFIED/);
      } finally {
        await db.exec('rollback; set role audit_operator');
      }
      assert.deepEqual(await boundary(), baseline);
    });
  }

  await t.test('does not accept missing metadata or a privileged audit operator', async () => {
    for (const key of Object.keys(baseline)) {
      assert.throws(
        () =>
          verifyReservedProviderBoundary(RESERVED_PROVIDER_FINDINGS, {
            ...baseline,
            [key]: undefined,
          }),
        /UNVERIFIED/,
        key,
      );
    }
    await db.exec('reset role');
    await assert.rejects(inspect(), /UNVERIFIED/);
    await db.exec('set role audit_operator');
  });

  await t.test(
    'checks a later extension member schema and rejects partial API isolation',
    async () => {
      await db.exec(`reset role; begin;
      create schema fixture_runtime;
      create function fixture_runtime.extension_probe() returns int language sql as 'select 1';
      alter extension plpgsql add function fixture_runtime.extension_probe();
      set local role audit_operator;`);
      try {
        const checked = [];
        await assert.rejects(
          auditReservedProviderDefaults({
            ...options,
            findings: await findings(),
            fetchImpl: async (_url, request) => {
              const schema = request.headers['Accept-Profile'];
              checked.push(schema);
              return {
                status: schema === 'fixture_runtime' ? 406 : 200,
                json: async () => ({ code: 'PGRST106' }),
              };
            },
          }),
          /API_SCHEMA_REJECTION/,
        );
        assert.deepEqual(checked, ['fixture_runtime', 'pg_catalog']);
      } finally {
        await db.exec('rollback; set role audit_operator');
      }
      assert.deepEqual(await boundary(), baseline);
    },
  );

  await t.test(
    'does not treat credential failures, outages or malformed responses as isolation',
    async () => {
      for (const [status, code] of [
        [200, 'PGRST106'],
        [503, 'PGRST106'],
        [406, undefined],
        [200, undefined],
        [401, undefined],
        [403, undefined],
        [404, 'PGRST205'],
        [503, undefined],
        [406, 'PGRST999'],
      ]) {
        await assert.rejects(
          auditReservedProviderDefaults({
            ...options,
            findings: await findings(),
            fetchImpl: async () => ({
              status,
              json: async () => ({ code, message: 'sensitive-provider-text' }),
            }),
          }),
          (error) =>
            /UNVERIFIED/.test(error.message) && !error.message.includes('sensitive-provider-text'),
        );
      }
      for (const fetchImpl of [
        async () => {
          throw Error('sensitive-provider-text');
        },
        async () => ({
          status: 406,
          json: async () => {
            throw Error('sensitive-provider-text');
          },
        }),
      ]) {
        await assert.rejects(
          auditReservedProviderDefaults({ ...options, findings: await findings(), fetchImpl }),
          /UNVERIFIED/,
        );
      }
    },
  );

  await t.test(
    'binds treatment to BusSafe and keeps a genuinely empty finding set empty',
    async () => {
      await assert.rejects(
        auditReservedProviderDefaults({ ...options, findings: await findings(), binding: {} }),
        /UNVERIFIED/,
      );
      await assert.rejects(
        auditReservedProviderDefaults({
          ...options,
          findings: await findings(),
          supabaseUrl: 'https://another.supabase.co',
        }),
        /UNVERIFIED/,
      );
      assert.deepEqual(await auditReservedProviderDefaults({ findings: [] }), {
        retainedProviderDefaults: 0,
        verifiedHiddenSchemas: [],
      });
    },
  );
});
