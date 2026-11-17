import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  bootstrapBindings,
  schemaDumpArgs,
  normalizeDump,
  assertEmptyTarget,
  assertAppCatalog,
  SOURCE_REF,
  TARGET_REF,
} from '../../scripts/lib/capacity-bootstrap.mjs';
const url = (ref) => `postgresql://postgres:fixture-only@db.${ref}.supabase.co:5432/postgres`;
test('target credential cannot identify production, an unknown project or a transaction pool', () => {
  assert.equal(bootstrapBindings(url(SOURCE_REF), url(TARGET_REF)).target.environment, 'staging');
  for (const target of [
    url(SOURCE_REF),
    url('abcdefghijklmnopqrst'),
    url(TARGET_REF).replace(':5432', ':6543'),
    url(TARGET_REF) + '?sslmode=disable',
  ])
    assert.throws(() => bootstrapBindings(url(SOURCE_REF), target));
  assert.throws(() => bootstrapBindings(url(TARGET_REF), url(SOURCE_REF)));
});
test('dump uses current consistent snapshot, app schemas only, and cannot copy data/jobs/provider objects', () => {
  const args = schemaDumpArgs('00000003-000000AB-1');
  assert.ok(args.includes('--schema-only'));
  assert.deepEqual(
    args.filter((x) => x.startsWith('--schema=')),
    ['--schema=public', '--schema=safebus_private'],
  );
  assert.ok(args.includes('--no-publications'));
  assert.throws(() => schemaDumpArgs('arbitrary --file=output'));
});
test('normalization removes only native guards, existing public schema and timeout overrides', () => {
  const sql =
    '\\restrict abc123\nCREATE SCHEMA public;\nSET statement_timeout = 0;\nCREATE TABLE public.x(id int);\nCREATE FUNCTION public.x() RETURNS int LANGUAGE sql AS $$select 1$$;\n' +
    '-- fixture\n'.repeat(120) +
    '\\unrestrict abc123\n';
  const result = normalizeDump(sql);
  assert.ok(result.includes('CREATE TABLE public.x'));
  assert.ok(!result.includes('CREATE SCHEMA public;'));
  assert.ok(!result.includes('statement_timeout = 0'));
  assert.ok(!result.includes('\\restrict'));
  assert.throws(() => normalizeDump(sql + '\\! command\n'));
  assert.throws(() => normalizeDump('small'));
});
test('existing data, schema, users or secrets block provisioning instead of being erased', () => {
  const empty = { relations: 0, routines: 0, users: 0, objects: 0, buckets: 0, secrets: 0 };
  assert.doesNotThrow(() => assertEmptyTarget(empty));
  for (const key of Object.keys(empty))
    assert.throws(() => assertEmptyTarget({ ...empty, [key]: 1 }));
  assert.throws(() => assertEmptyTarget({}));
});
test('catalog verification checks policies and privileges and does not confuse excluded provider schema with app parity', () => {
  const names = [
    'columns',
    'relations',
    'constraints',
    'indexes',
    'policies',
    'routines',
    'routineGrants',
    'relationGrants',
    'columnGrants',
    'triggers',
    'schemas',
    'types',
    'typeGrants',
    'sequences',
    'eventTriggers',
    'defaultGrants',
  ];
  const source = Object.fromEntries(names.map((name) => [name, []]));
  source.policies = [{ schemaname: 'public', policyname: 'tenant', qual: 'tenant_id = tenant()' }];
  source.routineGrants = [
    { schema_name: 'public', grantee: 'authenticated', privilege_type: 'EXECUTE' },
  ];
  assert.match(assertAppCatalog(source, structuredClone(source)), /^[0-9a-f]{64}$/);
  const changed = structuredClone(source);
  changed.policies[0].qual = 'true';
  assert.throws(() => assertAppCatalog(source, changed), /policies/);
  const grant = structuredClone(source);
  grant.routineGrants[0].grantee = 'PUBLIC';
  assert.throws(() => assertAppCatalog(source, grant), /routineGrants/);
  const provider = structuredClone(source);
  provider.policies.push({ schemaname: 'realtime', policyname: 'provider' });
  assert.doesNotThrow(() => assertAppCatalog(source, provider));
});
test('workflow protects credentials and reports bootstrap separately from load qualification', async () => {
  const workflow = await fs.readFile('.github/workflows/prepare-capacity-target.yml', 'utf8');
  assert.match(workflow, /environment: production/);
  assert.match(
    workflow,
    /SAFEBUS_CAPACITY_DATABASE_URL: \$\{\{ secrets.SAFEBUS_CAPACITY_DATABASE_URL \}\}/,
  );
  assert.match(workflow, /SAFEBUS_CAPACITY_MODE: rehearse/);
  const script = await fs.readFile('scripts/prepare-capacity-target.mjs', 'utf8');
  assert.match(script, /begin isolation level repeatable read read only/);
  assert.match(script, /assertAppCatalog\(sourceCatalog/);
  assert.match(script, /applicationReady: false|applicationReady:false/);
  assert.ok(script.indexOf('assertEmptyTarget') < script.indexOf('await target.query(sql)'));
});

test('quarantine permits only the reviewed schema USAGE removals', () => {
  const names = [
    'columns',
    'relations',
    'constraints',
    'indexes',
    'policies',
    'routines',
    'routineGrants',
    'relationGrants',
    'columnGrants',
    'triggers',
    'schemas',
    'types',
    'typeGrants',
    'sequences',
    'eventTriggers',
    'defaultGrants',
  ];
  const source = Object.fromEntries(names.map((name) => [name, []]));
  source.schemas = [{ nspname: 'public', grantee: 'anon', privilege_type: 'USAGE' }];
  const target = structuredClone(source);
  target.schemas = [];
  assert.throws(() => assertAppCatalog(source, target));
  assert.doesNotThrow(() => assertAppCatalog(source, target, true));
  assert.throws(() => assertAppCatalog(source, source, true));
});
