// Check effective privileges, including PostgreSQL's grants to PUBLIC.
// The receiver authenticates claims before invoking its one trusted entry point.
export async function receiverDatabaseRoleAllowed(connection) {
  const { rows } = await connection.query(`
    with receiver as (
      select oid from pg_catalog.pg_roles
      where rolname = 'safebus_gps_receiver'
        and rolname = current_user and rolname = session_user
        and rolcanlogin
        and not (rolsuper or rolinherit or rolcreaterole or rolcreatedb or rolreplication or rolbypassrls)
    ), wrapper as (
      select pg_catalog.to_regprocedure('safebus_private.ingest_verified_driver_location_batch(jsonb)') as oid
    ), user_schema as (
      select oid from pg_catalog.pg_namespace n
      where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
    ), accessible_schema as (
      select s.oid from user_schema s, receiver r
      where pg_catalog.has_schema_privilege(r.oid, s.oid, 'USAGE')
    )
    select exists (
      select 1 from receiver r, wrapper w
      join pg_catalog.pg_proc p on p.oid = w.oid
      where p.prosecdef and p.proowner <> r.oid
        and pg_catalog.has_schema_privilege(r.oid, p.pronamespace, 'USAGE')
        and pg_catalog.has_function_privilege(r.oid, p.oid, 'EXECUTE')
        and not pg_catalog.has_database_privilege(r.oid, current_database(), 'CREATE')
        and not exists (select 1 from pg_catalog.pg_auth_members m where m.member = r.oid)
        and not exists (
          select 1 from pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
          where a.privilege_type = 'EXECUTE'
            and (a.grantee not in (r.oid, p.proowner) or (a.grantee = r.oid and a.is_grantable))
        )
        and not exists (
          select 1 from user_schema s
          where pg_catalog.has_schema_privilege(r.oid, s.oid, 'CREATE')
        )
        and not exists (
          select 1 from pg_catalog.pg_proc f join accessible_schema s on s.oid = f.pronamespace
          where f.oid <> w.oid and pg_catalog.has_function_privilege(r.oid, f.oid, 'EXECUTE')
        )
        and not exists (
          select 1 from pg_catalog.pg_class c join accessible_schema s on s.oid = c.relnamespace
          where
            (c.relkind in ('r', 'p', 'v', 'm', 'f') and (
              pg_catalog.has_table_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN')
              or pg_catalog.has_any_column_privilege(r.oid, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')
            ))
            or (case when c.relkind = 'S'
              then pg_catalog.has_sequence_privilege(r.oid, c.oid, 'USAGE, SELECT, UPDATE')
              else false end)
        )
    ) as allowed
  `);
  return rows[0]?.allowed === true;
}
