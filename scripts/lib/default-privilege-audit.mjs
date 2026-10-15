// Schema defaults ADD to global defaults. Missing global rows mean PostgreSQL's
// built-in ACL applies (not an empty ACL), including PUBLIC function EXECUTE.
// Inspect catalog metadata only; do not create probe objects in production.
export const UNSAFE_PUBLIC_DEFAULT_PRIVILEGES_SQL = `
  with owners as (
    select oid from pg_roles where has_schema_privilege(oid, 'public', 'CREATE')
    union
    select defaclrole from pg_default_acl where defaclnamespace = 'public'::regnamespace
  ), defaults as (
    select owner.oid as owner_oid, '<global>'::text as scope, kind.type,
           coalesce(d.defaclacl, acldefault(kind.type, owner.oid)) as acl
      from owners owner
      cross join (values ('r'::"char"), ('S'::"char"), ('f'::"char")) kind(type)
      left join pg_default_acl d on d.defaclrole = owner.oid
        and d.defaclnamespace = 0 and d.defaclobjtype = kind.type
    union all
    select d.defaclrole, 'public', d.defaclobjtype, d.defaclacl
      from pg_default_acl d
     where d.defaclnamespace = 'public'::regnamespace
       and d.defaclobjtype in ('r', 'S', 'f')
  )
  select format('%s:%s:%s:%s:%s', owner_role.rolname, d.scope, d.type,
                case when acl.grantee = 0 then 'PUBLIC' else grantee_role.rolname end,
                acl.privilege_type) as object_name
    from defaults d
    join pg_roles owner_role on owner_role.oid = d.owner_oid
    cross join lateral aclexplode(d.acl) acl
    left join pg_roles grantee_role on grantee_role.oid = acl.grantee
   where exists (
     select 1 from pg_roles client where client.rolname in ('anon', 'authenticated')
       and case when acl.grantee = 0 then true
                else pg_has_role(client.oid, acl.grantee, 'USAGE') end
   )
   order by object_name
`;
