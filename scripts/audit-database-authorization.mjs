#!/usr/bin/env node

import fs from 'node:fs/promises';
import process from 'node:process';
import pg from 'pg';
import {
  assertEnvironmentIdentity,
  createEnvironmentBinding,
} from './lib/environment-identity.mjs';

const { Client } = pg;
const databaseUrl = process.env.SAFEBUS_DATABASE_URL;
const environment = process.env.SAFEBUS_DEPLOY_ENV;
const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!databaseUrl) throw new Error('SAFEBUS_DATABASE_URL is required.');
if (!supabaseUrl) throw new Error('SUPABASE_URL is required.');
if (!secretKey) throw new Error('SUPABASE_SECRET_KEY is required.');
if (!['development', 'staging', 'production'].includes(environment)) {
  throw new Error('SAFEBUS_DEPLOY_ENV must be development, staging, or production.');
}
if (environment === 'production' && process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Production authorization audits may run only in protected GitHub Actions.');
}

const surface = JSON.parse(await fs.readFile('config/authorization-surface.json', 'utf8'));
const authenticated = new Set(surface.authenticated);
const serviceRole = new Set(surface.serviceRole);
const allPublic = new Set([...authenticated, ...serviceRole]);
const binding = createEnvironmentBinding({ environment, databaseUrl, supabaseUrl });

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function difference(actual, expected) {
  return sorted([...actual].filter((entry) => !expected.has(entry)));
}

function assertExactSurface(label, actualValues, expected) {
  const actual = new Set(actualValues);
  const unexpected = difference(actual, expected);
  const missing = difference(expected, actual);
  if (unexpected.length || missing.length) {
    throw new Error(
      `${label} differs from the approved allowlist. ` +
        `Unexpected: ${unexpected.join(', ') || 'none'}. ` +
        `Missing: ${missing.join(', ') || 'none'}.`,
    );
  }
}

function assertNoRows(label, result) {
  if (result.rowCount > 0) {
    const objects = result.rows.map((row) => row.object_name).join(', ');
    throw new Error(`${label}: ${objects}`);
  }
}

const client = new Client({
  connectionString: databaseUrl,
  application_name: 'safebus-authorization-audit',
});

try {
  await client.connect();
  await client.query('begin transaction read only');
  await assertEnvironmentIdentity(client, binding);

  const publicFunctions = await client.query(`
    select regexp_replace(p.oid::regprocedure::text, '^public\\.', '') as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_proc'::regclass
            and d.objid = p.oid
            and d.refclassid = 'pg_extension'::regclass
            and d.deptype = 'e'
       )
     order by signature
  `);
  assertExactSurface(
    'Public RPC surface',
    publicFunctions.rows.map((row) => row.signature),
    allPublic,
  );

  const authenticatedFunctions = await client.query(`
    select regexp_replace(p.oid::regprocedure::text, '^public\\.', '') as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     order by signature
  `);
  assertExactSurface(
    'Authenticated RPC surface',
    authenticatedFunctions.rows.map((row) => row.signature),
    authenticated,
  );

  const serviceFunctions = await client.query(`
    select regexp_replace(p.oid::regprocedure::text, '^public\\.', '') as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and has_function_privilege('service_role', p.oid, 'EXECUTE')
     order by signature
  `);
  assertExactSurface(
    'Service-role RPC surface',
    serviceFunctions.rows.map((row) => row.signature),
    allPublic,
  );

  const anonymousFunctions = await client.query(`
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as object_name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'safebus_private')
       and has_function_privilege('anon', p.oid, 'EXECUTE')
     order by object_name
  `);
  assertNoRows('Anonymous function execution is present', anonymousFunctions);

  const publicFunctionGrants = await client.query(`
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as object_name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
     where n.nspname in ('public', 'safebus_private')
       and acl.grantee = 0
       and acl.privilege_type = 'EXECUTE'
     order by object_name
  `);
  assertNoRows('PUBLIC function execution is present', publicFunctionGrants);

  const rlsDisabled = await client.query(`
    select format('%I.%I', n.nspname, c.relname) as object_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and not c.relrowsecurity
     order by object_name
  `);
  assertNoRows('Public tables without RLS', rlsDisabled);

  const anonymousPolicies = await client.query(`
    select format('%I.%I:%I', n.nspname, c.relname, p.polname) as object_name
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and (
         0::oid = any(p.polroles)
         or (select oid from pg_roles where rolname = 'anon') = any(p.polroles)
       )
     order by object_name
  `);
  assertNoRows('Anonymous or PUBLIC RLS policies are present', anonymousPolicies);

  const anonymousRelations = await client.query(`
    select format('%I.%I', n.nspname, c.relname) as object_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm')
       and (
         has_table_privilege('anon', c.oid, 'SELECT')
         or has_table_privilege('anon', c.oid, 'INSERT')
         or has_table_privilege('anon', c.oid, 'UPDATE')
         or has_table_privilege('anon', c.oid, 'DELETE')
       )
     order by object_name
  `);
  assertNoRows('Anonymous relation privileges are present', anonymousRelations);

  const anonymousSequences = await client.query(`
    select format('%I.%I', n.nspname, c.relname) as object_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'S'
       and (
         has_sequence_privilege('anon', c.oid, 'USAGE')
         or has_sequence_privilege('anon', c.oid, 'SELECT')
         or has_sequence_privilege('anon', c.oid, 'UPDATE')
       )
     order by object_name
  `);
  assertNoRows('Anonymous sequence privileges are present', anonymousSequences);

  const unmatchedAuthenticatedGrants = await client.query(`
    with operations(operation, polcmd) as (
      values ('SELECT', 'r'::"char"), ('INSERT', 'a'::"char"),
             ('UPDATE', 'w'::"char"), ('DELETE', 'd'::"char")
    )
    select format('%I.%I:%s', n.nspname, c.relname, operation.operation) as object_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      cross join operations operation
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and has_table_privilege('authenticated', c.oid, operation.operation)
       and not exists (
         select 1 from pg_policy p
          where p.polrelid = c.oid
            and p.polcmd in (operation.polcmd, '*'::"char")
            and (
              0::oid = any(p.polroles)
              or (select oid from pg_roles where rolname = 'authenticated') = any(p.polroles)
            )
       )
     order by object_name
  `);
  assertNoRows(
    'Authenticated table grants without matching RLS policies',
    unmatchedAuthenticatedGrants,
  );

  const unsafeViews = await client.query(`
    select format('%I.%I', n.nspname, c.relname) as object_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('v', 'm')
       and (
         has_table_privilege('anon', c.oid, 'SELECT')
         or has_table_privilege('authenticated', c.oid, 'SELECT')
       )
       and not ('security_invoker=true' = any(coalesce(c.reloptions, array[]::text[])))
     order by object_name
  `);
  assertNoRows('Client-readable views can bypass RLS', unsafeViews);

  const mutableSearchPaths = await client.query(`
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as object_name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'safebus_private')
       and p.prokind = 'f'
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, array[]::text[])) setting
          where setting like 'search_path=%'
       )
       and not exists (
         select 1 from pg_depend d
          where d.classid = 'pg_proc'::regclass
            and d.objid = p.oid
            and d.refclassid = 'pg_extension'::regclass
            and d.deptype = 'e'
       )
     order by object_name
  `);
  assertNoRows('Functions with mutable search_path are present', mutableSearchPaths);

  const editableMetadataReferences = await client.query(`
    select object_name from (
      select format('policy:%I.%I:%I', n.nspname, c.relname, p.polname) as object_name
        from pg_policy p
        join pg_class c on c.oid = p.polrelid
        join pg_namespace n on n.oid = c.relnamespace
       where coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~* 'user_metadata|raw_user_meta_data'
          or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~* 'user_metadata|raw_user_meta_data'
      union all
      select format('function:%I.%I', n.nspname, p.proname)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'safebus_private')
         and p.prosrc ~* 'user_metadata|raw_user_meta_data'
    ) references_found
    order by object_name
  `);
  assertNoRows('Authorization references editable user metadata', editableMetadataReferences);

  const unsafeDefaults = await client.query(`
    select format('%s:%s:%s', owner_role.rolname, d.defaclobjtype, acl.privilege_type) as object_name
      from pg_default_acl d
      join pg_roles owner_role on owner_role.oid = d.defaclrole
      cross join lateral aclexplode(d.defaclacl) acl
      left join pg_roles grantee_role on grantee_role.oid = acl.grantee
     where d.defaclnamespace = 'public'::regnamespace
       and d.defaclobjtype in ('r', 'S', 'f')
       and (acl.grantee = 0 or grantee_role.rolname in ('anon', 'authenticated'))
     order by object_name
  `);
  assertNoRows('Unsafe default privileges are present', unsafeDefaults);

  const schemaCreate = await client.query(`
    select role_name as object_name
      from (values ('anon'), ('authenticated')) roles(role_name)
     where has_schema_privilege(role_name, 'public', 'CREATE')
     order by object_name
  `);
  assertNoRows('Client roles can create objects in public', schemaCreate);

  const response = await fetch(new URL('/rest/v1/', supabaseUrl), {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/openapi+json',
    },
  });
  if (!response.ok) throw new Error(`Supabase OpenAPI audit failed with HTTP ${response.status}.`);
  const openApi = await response.json();
  const advertised = new Set(
    Object.keys(openApi.paths ?? {})
      .filter((entry) => entry.startsWith('/rpc/'))
      .map((entry) => entry.slice('/rpc/'.length)),
  );
  const expectedNames = new Set(
    [...allPublic].map((signature) => signature.slice(0, signature.indexOf('('))),
  );
  assertExactSurface('Advertised Data API RPC names', advertised, expectedNames);

  const privateSchemaResponse = await fetch(new URL('/rest/v1/', supabaseUrl), {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/openapi+json',
      'Accept-Profile': 'safebus_private',
    },
  });
  if (privateSchemaResponse.ok) {
    throw new Error('safebus_private is exposed through the Supabase Data API.');
  }

  await client.query('rollback');
  console.log(
    `Authorization audit passed for ${environment}: ${allPublic.size} reviewed RPC signatures, ` +
      `${authenticated.size} authenticated and ${serviceRole.size} service-only.`,
  );
} catch (error) {
  await client.query('rollback').catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
}
