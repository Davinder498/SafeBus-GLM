import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { UNSAFE_PUBLIC_DEFAULT_PRIVILEGES_SQL } from './default-privilege-audit.mjs';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const DEFAULT_ACLS_SQL = `select r.rolname as owner,n.nspname as schema,
  d.defaclobjtype::text as kind,
  array(select a::text from unnest(d.defaclacl) a order by a::text collate "C") as acl
  from pg_default_acl d join pg_roles r on r.oid=d.defaclrole
  left join pg_namespace n on n.oid=d.defaclnamespace
  order by r.rolname collate "C",n.nspname collate "C" nulls first,d.defaclobjtype`;

// Metadata only: no customer rows, probes, new objects or external effects.
export const EXISTING_GUARDS_SQL = `select md5(jsonb_build_object(
  'functions',(select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,p.proconfig,
    replace(pg_get_functiondef(p.oid),chr(13),'')) order by p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','safebus_private') and p.prokind='f'),
  'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity) order by c.oid)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','safebus_private')),
  'policies',(select jsonb_agg(to_jsonb(p) order by p.oid) from pg_policy p
    join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','safebus_private')),
  'columnGrants',(select jsonb_agg(jsonb_build_array(a.attrelid,a.attnum,a.attacl) order by a.attrelid,a.attnum)
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','safebus_private') and a.attnum>0 and not a.attisdropped),
  'schemas',(select jsonb_agg(jsonb_build_array(n.oid,n.nspowner,n.nspacl) order by n.oid) from pg_namespace n),
  'hooks',(select jsonb_agg(jsonb_build_array(e.oid,e.evtenabled,e.evttags,
    replace(pg_get_functiondef(e.evtfoid),chr(13),'')) order by e.oid) from pg_event_trigger e),
  'roles',(select jsonb_agg(jsonb_build_array(r.oid,r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,
    r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolbypassrls) order by r.oid) from pg_roles r),
  'memberships',(select jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor) from pg_auth_members m)
  )::text) as hash`;

export async function snapshotDefaults(client) {
  const defaults = (await client.query(DEFAULT_ACLS_SQL)).rows;
  const guardHash = (await client.query(EXISTING_GUARDS_SQL)).rows[0].hash;
  const findings = (await client.query(UNSAFE_PUBLIC_DEFAULT_PRIVILEGES_SQL)).rows.map(
    (r) => r.object_name,
  );
  return { defaults, guardHash, findings };
}

export function verifyDefaults(snapshot, config, phase) {
  if (
    !['before', 'after'].includes(phase) ||
    !isDeepStrictEqual(snapshot.defaults, config[phase].defaults) ||
    !isDeepStrictEqual(snapshot.findings, config[phase].findings) ||
    snapshot.guardHash !== config.guardHash
  )
    throw new Error('DEFAULT_PRIVILEGE_SNAPSHOT_CHANGED');
  return {
    applicationDefaultsHardened: phase === 'after',
    remainingManagedFindings: snapshot.findings.length,
    fullAuthorizationAuditPassed: false,
  };
}

export async function readOnly(client, work) {
  await client.query('begin transaction read only isolation level repeatable read');
  try {
    await client.query(
      "set local statement_timeout='10s';set local lock_timeout='2s';set local search_path=pg_catalog,public,safebus_private,auth,extensions,realtime,pg_temp",
    );
    return await work();
  } finally {
    await client.query('rollback');
  }
}

export async function rehearseDefaults(client, forward, restore, config) {
  const before = await readOnly(client, () => snapshotDefaults(client));
  verifyDefaults(before, config, 'before');
  await client.query('begin isolation level repeatable read');
  try {
    await client.query(
      "set local statement_timeout='5s';set local lock_timeout='1s';set local search_path=pg_catalog,public,safebus_private,auth,extensions,realtime,pg_temp",
    );
    verifyDefaults(await snapshotDefaults(client), config, 'before');
    await client.query(forward);
    verifyDefaults(await snapshotDefaults(client), config, 'after');
    await client.query(restore);
    verifyDefaults(await snapshotDefaults(client), config, 'before');
  } finally {
    await client.query('rollback');
    if (!isDeepStrictEqual(before, await readOnly(client, () => snapshotDefaults(client))))
      throw new Error('DEFAULT_PRIVILEGE_ROLLBACK_CHANGED');
  }
}
