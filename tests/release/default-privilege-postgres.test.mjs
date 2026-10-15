import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { UNSAFE_PUBLIC_DEFAULT_PRIVILEGES_SQL } from '../../scripts/lib/default-privilege-audit.mjs';

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
