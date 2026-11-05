import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const PROJECT = 'ckrkfylsyihwouvesypm';
const ROLES = ['anon', 'authenticated', 'postgres', 'service_role'];
const TYPES = { S: 'rwU', f: 'X', r: 'arwdDxtm' };
const TABLE_PRIVILEGES = [
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
  'MAINTAIN',
];
export const RESERVED_PROVIDER_FINDINGS = [
  'supabase_admin:<global>:f:PUBLIC:EXECUTE',
  ...['anon', 'authenticated'].flatMap((role) => [
    ...TABLE_PRIVILEGES.map((privilege) => `supabase_admin:public:r:${role}:${privilege}`),
    ...['SELECT', 'UPDATE', 'USAGE'].map(
      (privilege) => `supabase_admin:public:S:${role}:${privilege}`,
    ),
    `supabase_admin:public:f:${role}:EXECUTE`,
  ]),
].sort();
const EXPECTED_ACLS = Object.entries(TYPES).map(([kind, privileges]) => ({
  kind,
  acl: ROLES.map((role) => `${role}=${privileges}/supabase_admin`).sort(),
}));

// Catalog metadata only. Extension member schemas matter even when extnamespace
// differs (for example pg_net and pg_cron). There are no probe objects or writes.
export const RESERVED_PROVIDER_BOUNDARY_SQL = `
select jsonb_build_object(
  'provider_is_superuser',(select rolsuper from pg_roles where rolname='supabase_admin'),
  'operator_is_superuser',(select rolsuper from pg_roles where rolname=current_user),
  'operator_can_use_provider',pg_has_role(current_user,'supabase_admin','MEMBER'),
  'client_privileged_roles',(select count(*) from pg_roles r
    where r.rolname in ('anon','authenticated','service_role') and
      (r.rolsuper or r.rolcreaterole or r.rolcanlogin
       or (r.rolname <> 'service_role' and r.rolbypassrls)
       or pg_has_role(r.oid,'supabase_admin','MEMBER'))),
  'client_roles_found',(select count(*) from pg_roles where rolname in ('anon','authenticated','service_role')),
  'client_privileged_memberships',(select count(*) from pg_roles r cross join pg_roles owner_role
    where r.rolname in ('anon','authenticated','service_role')
    and owner_role.oid <> r.oid
    and (owner_role.rolsuper or owner_role.rolcreaterole or owner_role.rolbypassrls
      or has_schema_privilege(owner_role.oid,'public','CREATE'))
    and pg_has_role(r.oid,owner_role.oid,'MEMBER')),
  'public_creators',(select count(*) from pg_roles r where r.rolname in ('anon','authenticated','service_role')
    and has_schema_privilege(r.oid,'public','CREATE')),
  'provider_public_objects',(
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relowner='supabase_admin'::regrole)
    +(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proowner='supabase_admin'::regrole)),
  'public_extensions',(select count(*) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where n.nspname='public'),
  'public_extension_members',(select count(*) from pg_depend d where d.refclassid='pg_extension'::regclass and d.deptype='e'
    and ((d.classid='pg_class'::regclass and exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.oid=d.objid and n.nspname='public'))
      or (d.classid='pg_proc'::regclass and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid=d.objid and n.nspname='public')))),
  'global_acl_rows',(select count(*) from pg_default_acl where defaclrole='supabase_admin'::regrole and defaclnamespace=0),
  'public_acls',(select jsonb_agg(jsonb_build_object('kind',d.defaclobjtype::text,
      'acl',array(select a::text from unnest(d.defaclacl) a order by a::text collate "C")) order by d.defaclobjtype)
    from pg_default_acl d where d.defaclrole='supabase_admin'::regrole and d.defaclnamespace='public'::regnamespace),
  'extension_schemas',(select jsonb_agg(schema_name order by schema_name collate "C") from (
    select n.nspname as schema_name from pg_extension e join pg_namespace n on n.oid=e.extnamespace
    union
    select n.nspname from pg_depend d join pg_class c on d.classid='pg_class'::regclass and c.oid=d.objid
      join pg_namespace n on n.oid=c.relnamespace where d.refclassid='pg_extension'::regclass and d.deptype='e'
    union
    select n.nspname from pg_depend d join pg_proc p on d.classid='pg_proc'::regclass and p.oid=d.objid
      join pg_namespace n on n.oid=p.pronamespace where d.refclassid='pg_extension'::regclass and d.deptype='e'
  ) schemas)
) as boundary`;

const fail = (reason = 'METADATA') => {
  throw new Error('RESERVED_PROVIDER_DEFAULT_BOUNDARY_UNVERIFIED:' + reason);
};
export function verifyReservedProviderBoundary(findings, boundary) {
  if (
    !Array.isArray(findings) ||
    !isDeepStrictEqual([...findings].sort(), RESERVED_PROVIDER_FINDINGS)
  )
    fail('FINDINGS');
  if (
    boundary?.provider_is_superuser !== true ||
    boundary.operator_is_superuser !== false ||
    boundary.operator_can_use_provider !== false ||
    boundary.client_roles_found !== 3
  )
    fail('ROLE');
  for (const key of [
    'client_privileged_roles',
    'client_privileged_memberships',
    'public_creators',
    'provider_public_objects',
    'public_extensions',
    'public_extension_members',
    'global_acl_rows',
  ]) {
    if (boundary[key] !== 0) fail('CONTROL_' + key.toUpperCase());
  }
  if (!isDeepStrictEqual(boundary.public_acls, EXPECTED_ACLS)) fail('ACLS');
  if (
    !Array.isArray(boundary.extension_schemas) ||
    !boundary.extension_schemas.length ||
    boundary.extension_schemas.some(
      (name) => typeof name !== 'string' || !/^[a-z_][a-z0-9_]*$/.test(name) || name === 'public',
    )
  )
    fail('EXTENSION_SCHEMAS');
  return [...new Set(boundary.extension_schemas)].sort();
}

export async function auditReservedProviderDefaults({
  client,
  findings,
  binding,
  supabaseUrl,
  apiKey,
  fetchImpl = fetch,
}) {
  if (!Array.isArray(findings)) fail();
  if (!findings.length) return { retainedProviderDefaults: 0, verifiedHiddenSchemas: [] };
  if (
    binding?.projectRefHash !== createHash('sha256').update(PROJECT).digest('hex') ||
    supabaseUrl !== `https://${PROJECT}.supabase.co` ||
    !apiKey
  )
    fail('TARGET');
  const boundary = (await client.query(RESERVED_PROVIDER_BOUNDARY_SQL)).rows[0]?.boundary;
  const schemas = verifyReservedProviderBoundary(findings, boundary);
  for (const schema of schemas) {
    let response, body;
    try {
      response = await fetchImpl(
        new URL('/rest/v1/__safebus_security_schema_probe__?select=id&limit=0', supabaseUrl),
        {
          method: 'GET',
          redirect: 'error',
          headers: { apikey: apiKey, 'Accept-Profile': schema },
          signal: AbortSignal.timeout(10000),
        },
      );
      body = await response.json();
    } catch {
      fail('API_RESPONSE');
    }
    if (response.status !== 406 || body?.code !== 'PGRST106') fail('API_SCHEMA_REJECTION');
  }
  return { retainedProviderDefaults: findings.length, verifiedHiddenSchemas: schemas };
}
