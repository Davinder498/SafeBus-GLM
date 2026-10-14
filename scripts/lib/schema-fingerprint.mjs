import { sha256 } from './migrations.mjs';

// v2 deliberately invalidates older, public-only fingerprints. Never silently
// replace a stored fingerprint: historical adoption/reconciliation is reviewed.
export const SCHEMA_FINGERPRINT_FORMAT = 2;

const relationScope = `(n.nspname in ('public', 'safebus_private')
  or (n.nspname = 'realtime' and c.relname = 'messages'))`;
const roleScope = `with recursive seeds(role_oid) as (
  select oid from pg_roles where rolname in ('anon','authenticated','service_role','authenticator')
  union select nspowner from pg_namespace where nspname in ('public','safebus_private','realtime')
  union select c.relowner from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where ${relationScope}
  union select p.proowner from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','safebus_private')
  union select acl.grantee from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(c.relacl) acl where ${relationScope}
  union select acl.grantee from pg_attribute a join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(a.attacl) acl where ${relationScope}
  union select acl.grantee from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(p.proacl) acl where n.nspname in ('public','safebus_private')
  union select acl.grantee from pg_namespace n cross join lateral aclexplode(n.nspacl) acl
    where n.nspname in ('public','safebus_private','realtime')
  union select t.typowner from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where n.nspname in ('public','safebus_private')
  union select acl.grantee from pg_type t join pg_namespace n on n.oid=t.typnamespace
    cross join lateral aclexplode(t.typacl) acl where n.nspname in ('public','safebus_private')
  union select d.defaclrole from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
    where d.defaclnamespace=0 or n.nspname in ('public','safebus_private','realtime')
  union select acl.grantee from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) acl
    where d.defaclnamespace=0 or n.nspname in ('public','safebus_private','realtime')
), relevant(role_oid) as (
  select role_oid from seeds
  union select m.roleid from pg_auth_members m join relevant r on m.member=r.role_oid
)`;

// Catalog metadata only. No application/Auth rows, role passwords, JWT settings,
// sequence current values, provider jobs or realtime message contents are read.
const CATALOG_QUERIES = {
  columns: `select n.nspname as schema_name, c.relname as relation_name,
    a.attname as column_name, a.attnum as ordinal_position,
    format_type(a.atttypid,a.atttypmod) as data_type,
    a.attnotnull, a.attidentity, a.attgenerated,
    pg_get_expr(d.adbin,d.adrelid) as default_expression,
    coalesce(cn.nspname || '.' || coll.collname,'') as collation
    from pg_attribute a join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    left join pg_collation coll on coll.oid=a.attcollation
    left join pg_namespace cn on cn.oid=coll.collnamespace
    where ${relationScope} and c.relkind in ('r','p','v','m')
      and a.attnum>0 and not a.attisdropped
    order by n.nspname,c.relname,a.attnum`,
  relations: `select n.nspname as schema_name,c.relname,c.relkind,
    pg_get_userbyid(c.relowner) as owner,c.relrowsecurity,c.relforcerowsecurity,
    c.relpersistence,c.relreplident,c.reloptions,
    case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,false) end as view_definition,
    case when c.relkind='p' then pg_get_partkeydef(c.oid) end as partition_key,
    pg_get_expr(c.relpartbound,c.oid) as partition_bound,
    (select array_agg(pn.nspname || '.' || parent.relname order by i.inhseqno)
      from pg_inherits i join pg_class parent on parent.oid=i.inhparent
      join pg_namespace pn on pn.oid=parent.relnamespace where i.inhrelid=c.oid) as parents
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where ${relationScope} and c.relkind in ('r','p','v','m','S')
    order by n.nspname,c.relname`,
  constraints: `select n.nspname as schema_name,c.relname,con.conname,
    pg_get_constraintdef(con.oid,false) as definition,con.convalidated
    from pg_constraint con join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace where ${relationScope}
    order by n.nspname,c.relname,con.conname`,
  indexes: `select n.nspname as schema_name,c.relname as relation_name,
    idx.relname as index_name,pg_get_indexdef(i.indexrelid) as definition,
    i.indisvalid,i.indisready,i.indisclustered,i.indisreplident,idx.reloptions
    from pg_index i join pg_class c on c.oid=i.indrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_class idx on idx.oid=i.indexrelid where ${relationScope}
    order by n.nspname,c.relname,idx.relname`,
  policies: `select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    from pg_policies where schemaname in ('public','safebus_private')
      or (schemaname='realtime' and tablename='messages')
    order by schemaname,tablename,policyname`,
  // Includes 'safebus tracking broadcast receive' and all restrictive session policies.
  routines: `select n.nspname as schema_name,p.proname,p.prokind,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proleakproof,
    p.provolatile,p.proparallel,p.proisstrict,p.proconfig,
    case when p.prokind<>'a' then pg_get_functiondef(p.oid) end as definition,
    case when p.prokind='a' then jsonb_build_object(
      'transition',agg.aggtransfn::regprocedure::text,
      'final',agg.aggfinalfn::regprocedure::text,
      'combine',agg.aggcombinefn::regprocedure::text,
      'serial',agg.aggserialfn::regprocedure::text,
      'deserial',agg.aggdeserialfn::regprocedure::text,
      'state_type',format_type(agg.aggtranstype,null),
      'initial',agg.agginitval) end as aggregate_definition
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    left join pg_aggregate agg on agg.aggfnoid=p.oid
    where n.nspname in ('public','safebus_private')
    order by n.nspname,p.proname,arguments`,
  routineGrants: `select n.nspname as schema_name,p.proname,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_userbyid(acl.grantor) as grantor,
    coalesce(pg_get_userbyid(nullif(acl.grantee,0)),'PUBLIC') as grantee,
    acl.privilege_type,acl.is_grantable
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    where n.nspname in ('public','safebus_private')
    order by n.nspname,p.proname,arguments,grantor,grantee,privilege_type`,
  relationGrants: `select n.nspname as schema_name,c.relname,
    pg_get_userbyid(acl.grantor) as grantor,
    coalesce(pg_get_userbyid(nullif(acl.grantee,0)),'PUBLIC') as grantee,
    acl.privilege_type,acl.is_grantable
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl,
      acldefault(case when c.relkind='S' then 's'::"char" else 'r'::"char" end,c.relowner))) acl
    where ${relationScope} and c.relkind in ('r','p','v','m','S')
    order by n.nspname,c.relname,grantor,grantee,privilege_type`,
  columnGrants: `select n.nspname as schema_name,c.relname,a.attname,
    pg_get_userbyid(acl.grantor) as grantor,
    coalesce(pg_get_userbyid(nullif(acl.grantee,0)),'PUBLIC') as grantee,
    acl.privilege_type,acl.is_grantable
    from pg_attribute a join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(a.attacl) acl
    where ${relationScope} and a.attnum>0 and not a.attisdropped
    order by n.nspname,c.relname,a.attname,grantor,grantee,privilege_type`,
  triggers: `select n.nspname as schema_name,c.relname,t.tgname,t.tgenabled,
    pg_get_triggerdef(t.oid,false) as definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where ${relationScope} and not t.tgisinternal
    order by n.nspname,c.relname,t.tgname`,
  schemas: `select n.nspname,pg_get_userbyid(n.nspowner) as owner,
    pg_get_userbyid(acl.grantor) as grantor,
    coalesce(pg_get_userbyid(nullif(acl.grantee,0)),'PUBLIC') as grantee,
    acl.privilege_type,acl.is_grantable
    from pg_namespace n
    cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) acl
    where n.nspname in ('public','safebus_private','realtime')
    order by n.nspname,grantor,grantee,privilege_type`,
  defaultGrants: `select pg_get_userbyid(d.defaclrole) as owner,
    coalesce(n.nspname,'<global>') as schema_name,d.defaclobjtype,
    pg_get_userbyid(acl.grantor) as grantor,
    coalesce(pg_get_userbyid(nullif(acl.grantee,0)),'PUBLIC') as grantee,
    acl.privilege_type,acl.is_grantable
    from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) acl
    where d.defaclnamespace=0 or n.nspname in ('public','safebus_private','realtime')
    order by owner,schema_name,d.defaclobjtype,grantor,grantee,privilege_type`,
  types: `select n.nspname as schema_name,t.typname,t.typtype,
    pg_get_userbyid(t.typowner) as owner,
    case when t.typtype='d' then format_type(t.typbasetype,t.typtypmod) end as base_type,
    t.typnotnull,t.typdefault,
    (select array_agg(e.enumlabel order by e.enumsortorder) from pg_enum e
      where e.enumtypid=t.oid) as enum_labels,
    (select array_agg(pg_get_constraintdef(con.oid,false) order by con.conname)
      from pg_constraint con where con.contypid=t.oid) as domain_constraints,
    (select array_agg(a.attname || ':' || format_type(a.atttypid,a.atttypmod) order by a.attnum)
      from pg_attribute a where t.typtype='c' and a.attrelid=t.typrelid
        and a.attnum>0 and not a.attisdropped) as composite_fields
    from pg_type t join pg_namespace n on n.oid=t.typnamespace
    where n.nspname in ('public','safebus_private') and t.typtype in ('e','d','c')
    order by n.nspname,t.typname`,
  typeGrants: `select n.nspname as schema_name,t.typname,
    pg_get_userbyid(acl.grantor) as grantor,
    coalesce(pg_get_userbyid(nullif(acl.grantee,0)),'PUBLIC') as grantee,
    acl.privilege_type,acl.is_grantable
    from pg_type t join pg_namespace n on n.oid=t.typnamespace
    cross join lateral aclexplode(coalesce(t.typacl,acldefault('T',t.typowner))) acl
    where n.nspname in ('public','safebus_private') and t.typtype in ('e','d','c')
    order by n.nspname,t.typname,grantor,grantee,privilege_type`,
  sequences: `select n.nspname as schema_name,c.relname,
    format_type(s.seqtypid,null) as data_type,s.seqstart::text,s.seqincrement::text,
    s.seqmax::text,s.seqmin::text,s.seqcache::text,s.seqcycle
    from pg_sequence s join pg_class c on c.oid=s.seqrelid
    join pg_namespace n on n.oid=c.relnamespace where ${relationScope}
    order by n.nspname,c.relname`,
  eventTriggers: `select e.evtname,e.evtevent,pg_get_userbyid(e.evtowner) as owner,
    n.nspname as function_schema,p.proname,
    pg_get_function_identity_arguments(p.oid) as arguments,e.evtenabled,e.evttags
    from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','safebus_private') order by e.evtname`,
  publications: `select p.pubname,p.puballtables,p.pubinsert,p.pubupdate,p.pubdelete,
    p.pubtruncate,p.pubviaroot,pg_get_userbyid(p.pubowner) as owner
    from pg_publication p where p.puballtables or exists (
      select 1 from pg_publication_tables t where t.pubname=p.pubname
        and (t.schemaname in ('public','safebus_private')
          or (t.schemaname='realtime' and t.tablename='messages')))
    order by p.pubname`,
  publicationTables: `select pubname,schemaname,tablename,attnames,rowfilter
    from pg_publication_tables where schemaname in ('public','safebus_private')
      or (schemaname='realtime' and tablename='messages')
    order by pubname,schemaname,tablename`,
  apiSettings: `select coalesce(d.datname,'<all>') as database_name,
    coalesce(r.rolname,'<all>') as role_name,setting
    from pg_db_role_setting s left join pg_database d on d.oid=s.setdatabase
    left join pg_roles r on r.oid=s.setrole
    cross join lateral unnest(s.setconfig) settings(setting)
    where s.setdatabase in (0,(select oid from pg_database where datname=current_database()))
      and (setting like 'pgrst.db_pre_request=%' or setting like 'pgrst.db_schemas=%'
        or setting like 'pgrst.db_extra_search_path=%')
    order by database_name,role_name,setting`,
  roleAttributes: `${roleScope} select r.rolname,r.rolsuper,r.rolinherit,r.rolcreaterole,
    r.rolcreatedb,r.rolcanlogin,r.rolreplication,r.rolbypassrls
    from pg_roles r join relevant on relevant.role_oid=r.oid order by r.rolname`,
  roleMemberships: `${roleScope} select member_role.rolname as member,
    parent_role.rolname as parent,pg_get_userbyid(m.grantor) as grantor,
    m.admin_option,m.inherit_option,m.set_option
    from pg_auth_members m join relevant on relevant.role_oid=m.member
    join pg_roles member_role on member_role.oid=m.member
    join pg_roles parent_role on parent_role.oid=m.roleid
    order by member,parent,grantor`,
};

export async function collectSchemaCatalog(client) {
  const catalog = {};
  for (const [section, query] of Object.entries(CATALOG_QUERIES)) {
    const result = await client.query(query);
    catalog[section] = result.rows;
  }
  return { format: SCHEMA_FINGERPRINT_FORMAT, catalog };
}

export async function calculateSchemaFingerprint(client) {
  return sha256(JSON.stringify(await collectSchemaCatalog(client)));
}
