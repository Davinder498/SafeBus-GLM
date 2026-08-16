-- Point 5: least-privilege authorization surface hardening.
--
-- This migration intentionally separates callable application RPCs from
-- database-internal policy, validation, trigger, and helper routines. Internal
-- routines are moved to a schema that is not exposed by the Supabase Data API.
-- Existing policy/trigger dependencies follow their function OIDs, while
-- qualified calls inside stored function bodies are rewritten in-transaction.

create schema if not exists safebus_private;
comment on schema safebus_private is
  'Database-internal SafeBus routines. Not exposed through the Supabase Data API.';

revoke all on schema safebus_private from public, anon, authenticated;
grant usage on schema safebus_private to authenticated, service_role;

create temporary table safebus_rpc_allowlist (
  function_name text primary key,
  audience text not null check (audience in ('authenticated', 'service_role'))
) on commit drop;

insert into safebus_rpc_allowlist (function_name, audience) values
  ('admin_create_route_shape_version', 'authenticated'),
  ('admin_create_student_onboarding', 'authenticated'),
  ('admin_deactivate_student_guardian', 'authenticated'),
  ('admin_end_bus_route_assignment', 'authenticated'),
  ('admin_end_bus_route_service', 'authenticated'),
  ('admin_finalize_member_invitation', 'authenticated'),
  ('admin_link_student_guardian', 'authenticated'),
  ('admin_process_student_csv_import', 'authenticated'),
  ('admin_publish_route_shape_version', 'authenticated'),
  ('admin_renew_bus_route_assignment', 'authenticated'),
  ('admin_replace_bus_trip_driver', 'authenticated'),
  ('admin_save_route_definition', 'authenticated'),
  ('admin_set_bus_route_service', 'authenticated'),
  ('admin_set_guardian_access_expiry', 'authenticated'),
  ('admin_set_student_bus_service', 'authenticated'),
  ('admin_set_student_bus_service_status', 'authenticated'),
  ('admin_set_student_guardian_status', 'authenticated'),
  ('admin_update_bus_route_assignment', 'authenticated'),
  ('bind_driver_tracking_device', 'authenticated'),
  ('bulk_import_commit', 'authenticated'),
  ('bulk_import_generate_invitations', 'authenticated'),
  ('bulk_import_get_errors', 'authenticated'),
  ('bulk_import_rollback', 'authenticated'),
  ('bulk_import_stage_rows', 'authenticated'),
  ('cancel_driver_trip', 'authenticated'),
  ('check_rate_limit', 'authenticated'),
  ('claim_bulk_invitation_rows', 'authenticated'),
  ('complete_invited_account', 'authenticated'),
  ('confirm_pre_trip', 'authenticated'),
  ('end_driver_trip', 'authenticated'),
  ('enforce_new_password_policy', 'authenticated'),
  ('get_admin_active_trip_operational_statuses', 'authenticated'),
  ('get_admin_bus_qr_credential_status', 'authenticated'),
  ('get_admin_bus_services', 'authenticated'),
  ('get_admin_bus_workspace', 'authenticated'),
  ('get_admin_dashboard_overview', 'authenticated'),
  ('get_admin_guardian_links', 'authenticated'),
  ('get_admin_live_fleet_monitoring', 'authenticated'),
  ('get_admin_live_fleet_monitoring_in_viewport', 'authenticated'),
  ('get_admin_live_route_overlays', 'authenticated'),
  ('get_admin_live_trip_stop_distance_metres', 'authenticated'),
  ('get_admin_paginated_list', 'authenticated'),
  ('get_admin_route_shape_versions', 'authenticated'),
  ('get_admin_route_stop_options', 'authenticated'),
  ('get_admin_student_bus_assignments_page', 'authenticated'),
  ('get_admin_students_page', 'authenticated'),
  ('get_admin_trip_overview', 'authenticated'),
  ('get_bulk_invitation_delivery_summary', 'authenticated'),
  ('get_bus_qr_start_options', 'authenticated'),
  ('get_current_route_shape', 'authenticated'),
  ('get_driver_active_trip_route_shape', 'authenticated'),
  ('get_driver_active_trip_student_manifest', 'authenticated'),
  ('get_driver_completed_trip_history', 'authenticated'),
  ('get_guardian_bus_visibility_v2', 'authenticated'),
  ('get_guardian_notification_preferences', 'authenticated'),
  ('get_platform_first_admin_invitation_status', 'authenticated'),
  ('get_platform_tenant_onboarding_summary_secure', 'authenticated'),
  ('get_tenant_notification_delivery_summary', 'authenticated'),
  ('ingest_driver_location_event', 'authenticated'),
  ('is_allowed_redirect_origin', 'authenticated'),
  ('is_current_user_session_active', 'authenticated'),
  ('manage_bus_qr_credential', 'authenticated'),
  ('mark_student_dropped_off_for_active_trip', 'authenticated'),
  ('mark_student_picked_up_for_active_trip', 'authenticated'),
  ('pause_driver_trip', 'authenticated'),
  ('platform_cancel_first_admin_invitation', 'authenticated'),
  ('platform_emergency_admin_recovery', 'authenticated'),
  ('platform_finalize_tenant_invitation', 'authenticated'),
  ('platform_find_unprofiled_auth_user', 'authenticated'),
  ('platform_is_first_admin_invitation', 'authenticated'),
  ('platform_set_tenant_lifecycle', 'authenticated'),
  ('record_own_auth_event', 'authenticated'),
  ('record_student_record_access', 'authenticated'),
  ('record_trip_exception', 'authenticated'),
  ('register_android_tracking_device', 'authenticated'),
  ('register_current_user_session', 'authenticated'),
  ('replace_bus', 'authenticated'),
  ('resume_driver_trip', 'authenticated'),
  ('revoke_guardian_access', 'authenticated'),
  ('revoke_invitation', 'authenticated'),
  ('search_admin_buses', 'authenticated'),
  ('search_admin_guardians', 'authenticated'),
  ('search_admin_routes', 'authenticated'),
  ('search_admin_students', 'authenticated'),
  ('set_guardian_notification_preferences', 'authenticated'),
  ('set_trip_operational_status', 'authenticated'),
  ('start_bus_tracking_from_qr', 'authenticated'),
  ('substitute_driver', 'authenticated'),
  ('tenant_add_sub_administrator', 'authenticated'),
  ('tenant_change_admin_role', 'authenticated'),
  ('tenant_depart_administrator', 'authenticated'),
  ('tenant_invite_administrator', 'authenticated'),
  ('tenant_restore_administrator', 'authenticated'),
  ('tenant_search_audit_events', 'authenticated'),
  ('tenant_suspend_administrator', 'authenticated'),
  ('tenant_transfer_administrator', 'authenticated'),
  ('update_bus_tracking_location', 'authenticated'),
  ('cancel_guardian_notification_email', 'service_role'),
  ('claim_guardian_notification_email_batch', 'service_role'),
  ('complete_guardian_notification_email', 'service_role'),
  ('expire_stale_invitations', 'service_role'),
  ('fail_guardian_notification_email', 'service_role'),
  ('get_admin_student_qr_credential_status', 'service_role'),
  ('manage_student_qr_credential', 'service_role'),
  ('reconcile_bulk_invitation_delivery', 'service_role'),
  ('resolve_student_qr_for_active_trip', 'service_role'),
  ('resolve_guardian_notification_email_payload', 'service_role'),
  ('retry_guardian_notification_email', 'service_role'),
  ('run_all_retention_deletions', 'service_role'),
  ('server_get_member_invitation_state', 'service_role'),
  ('update_driver_trip_location', 'service_role'),
  ('write_server_audit_event', 'service_role');

do $$
declare
  v_missing text;
begin
  select string_agg(a.function_name, ', ' order by a.function_name)
    into v_missing
    from safebus_rpc_allowlist a
   where not exists (
     select 1
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = a.function_name
        and p.prokind = 'f'
   );

  if v_missing is not null then
    raise exception 'Authorization hardening expected missing public RPCs: %', v_missing;
  end if;
end;
$$;

create temporary table safebus_internal_routines on commit drop as
select p.oid, p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prokind = 'f'
   and not exists (
     select 1
       from pg_depend d
      where d.classid = 'pg_proc'::regclass
        and d.objid = p.oid
        and d.refclassid = 'pg_extension'::regclass
        and d.deptype = 'e'
   )
   and not exists (
     select 1 from safebus_rpc_allowlist a where a.function_name = p.proname
   );

do $$
declare
  v_routine record;
begin
  for v_routine in
    select p.oid,
           format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as identity
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join safebus_internal_routines i on i.oid = p.oid
     order by p.oid
  loop
    execute format('alter function %s set schema safebus_private', v_routine.identity);
  end loop;
end;
$$;

-- CREATE OR REPLACE validation below must be able to resolve both moved
-- helpers and the trusted Supabase schemas used by legacy SQL bodies.
set local search_path = pg_catalog, public, safebus_private, auth, extensions, realtime, pg_temp;

-- Stored PL/pgSQL and SQL bodies are text. Update every schema-qualified call
-- to a routine that was moved above. Policies, views, constraints, defaults,
-- and triggers retain OID dependencies and require no textual rewrite.
do $$
declare
  v_routine record;
  v_internal record;
  v_definition text;
  v_rewritten text;
begin
  for v_routine in
    select p.oid, pg_get_functiondef(p.oid) as definition
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'safebus_private')
       and p.prokind = 'f'
       and not exists (
         select 1
           from pg_depend d
          where d.classid = 'pg_proc'::regclass
            and d.objid = p.oid
            and d.refclassid = 'pg_extension'::regclass
            and d.deptype = 'e'
       )
     order by p.oid
  loop
    v_definition := v_routine.definition;
    v_rewritten := v_definition;

    for v_internal in
      select distinct proname from safebus_internal_routines order by proname
    loop
      v_rewritten := replace(
        v_rewritten,
        format('public.%I', v_internal.proname),
        format('safebus_private.%I', v_internal.proname)
      );
    end loop;

    if v_rewritten <> v_definition then
      execute v_rewritten;
    end if;
  end loop;
end;
$$;

-- Revoke inherited/default execution first, then rebuild the two reviewed API
-- audiences explicitly. Authenticated callers can execute private helpers for
-- policy and SECURITY INVOKER evaluation, but PostgREST does not expose the
-- private schema as an RPC surface.
revoke execute on all functions in schema public from public, anon, authenticated, service_role;
revoke execute on all functions in schema safebus_private from public, anon, authenticated, service_role;
grant execute on all functions in schema safebus_private to authenticated, service_role;

do $$
declare
  v_routine record;
begin
  for v_routine in
    select p.oid,
           a.audience,
           format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as identity
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      join safebus_rpc_allowlist a on a.function_name = p.proname
     where n.nspname = 'public'
       and p.prokind = 'f'
     order by p.oid
  loop
    if v_routine.audience = 'authenticated' then
      execute format('grant execute on function %s to authenticated', v_routine.identity);
    end if;
    execute format('grant execute on function %s to service_role', v_routine.identity);
  end loop;
end;
$$;

-- Anonymous traffic has no direct table or sequence capability. Rebuild the
-- authenticated CRUD surface from the RLS policy commands that actually exist.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

do $$
declare
  v_grant record;
begin
  for v_grant in
    with applicable_policies as (
      select distinct
        n.nspname,
        c.relname,
        case p.polcmd
          when 'r' then 'select'
          when 'a' then 'insert'
          when 'w' then 'update'
          when 'd' then 'delete'
          when '*' then 'select, insert, update, delete'
        end as privileges
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and (
          0::oid = any(p.polroles)
          or (select oid from pg_roles where rolname = 'authenticated') = any(p.polroles)
        )
    )
    select * from applicable_policies order by nspname, relname, privileges
  loop
    execute format(
      'grant %s on table %I.%I to authenticated',
      v_grant.privileges,
      v_grant.nspname,
      v_grant.relname
    );
  end loop;
end;
$$;

do $$
declare
  v_sequence record;
begin
  for v_sequence in
    select distinct sequence_ns.nspname, sequence_class.relname
      from pg_policy policy
      join pg_class table_class on table_class.oid = policy.polrelid
      join pg_namespace table_ns on table_ns.oid = table_class.relnamespace
      join pg_attribute column_def
        on column_def.attrelid = table_class.oid
       and column_def.attnum > 0
       and not column_def.attisdropped
      join pg_depend dependency
        on dependency.refobjid = table_class.oid
       and dependency.refobjsubid = column_def.attnum
       and dependency.deptype in ('a', 'i')
      join pg_class sequence_class
        on sequence_class.oid = dependency.objid
       and sequence_class.relkind = 'S'
      join pg_namespace sequence_ns on sequence_ns.oid = sequence_class.relnamespace
     where table_ns.nspname = 'public'
       and policy.polcmd in ('a', '*')
       and (
         0::oid = any(policy.polroles)
         or (select oid from pg_roles where rolname = 'authenticated') = any(policy.polroles)
       )
  loop
    execute format(
      'grant usage, select on sequence %I.%I to authenticated',
      v_sequence.nspname,
      v_sequence.relname
    );
  end loop;
end;
$$;

revoke create on schema public from public, anon, authenticated;

-- Objects created by future migrations begin private. A later migration must
-- opt into a reviewed role grant and policy deliberately.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Give every SafeBus routine one explicit trusted search path. This both fixes
-- mutable paths and keeps unqualified legacy calls working after helpers move
-- out of public. Client roles cannot create objects in any listed schema, and
-- pg_temp remains last.
do $$
declare
  v_routine record;
begin
  for v_routine in
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as identity
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'safebus_private')
       and p.prokind = 'f'
       and not exists (
         select 1
           from pg_depend d
          where d.classid = 'pg_proc'::regclass
            and d.objid = p.oid
            and d.refclassid = 'pg_extension'::regclass
            and d.deptype = 'e'
       )
  loop
    execute format(
      'alter function %s set search_path = pg_catalog, public, safebus_private, auth, extensions, realtime, pg_temp',
      v_routine.identity
    );
  end loop;
end;
$$;

-- Defense in depth for future public tables created by raw SQL.
create or replace function safebus_private.enable_rls_on_public_tables()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_command record;
begin
  for v_command in
    select * from pg_event_trigger_ddl_commands()
     where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
       and object_type in ('table', 'partitioned table')
  loop
    if v_command.schema_name = 'public' then
      execute format('alter table if exists %s enable row level security', v_command.object_identity);
    end if;
  end loop;
end;
$$;

revoke execute on function safebus_private.enable_rls_on_public_tables()
  from public, anon, authenticated, service_role;

drop event trigger if exists safebus_enable_public_table_rls;
create event trigger safebus_enable_public_table_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function safebus_private.enable_rls_on_public_tables();

-- Migration-time assertions. Hosted destructive identity tests remain a final
-- prelaunch gate and must run only on an isolated branch.
do $$
declare
  v_problem text;
begin
  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_problem
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and not exists (
       select 1
         from pg_depend d
        where d.classid = 'pg_proc'::regclass
          and d.objid = p.oid
          and d.refclassid = 'pg_extension'::regclass
          and d.deptype = 'e'
     )
     and not exists (
       select 1 from safebus_rpc_allowlist a where a.function_name = p.proname
     );
  if v_problem is not null then
    raise exception 'Unexpected public functions remain after hardening: %', v_problem;
  end if;

  select string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text)
    into v_problem
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'safebus_private')
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  if v_problem is not null then
    raise exception 'Anonymous function execution remains after hardening: %', v_problem;
  end if;

  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by n.nspname, c.relname)
    into v_problem
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and not c.relrowsecurity;
  if v_problem is not null then
    raise exception 'Public tables without RLS remain after hardening: %', v_problem;
  end if;

  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by n.nspname, c.relname)
    into v_problem
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm')
     and (
       has_table_privilege('anon', c.oid, 'SELECT')
       or (c.relkind in ('r', 'p', 'v') and (
         has_table_privilege('anon', c.oid, 'INSERT')
         or has_table_privilege('anon', c.oid, 'UPDATE')
         or has_table_privilege('anon', c.oid, 'DELETE')
       ))
     );
  if v_problem is not null then
    raise exception 'Anonymous relation access remains after hardening: %', v_problem;
  end if;

  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by n.nspname, c.relname)
    into v_problem
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'S'
     and (
       has_sequence_privilege('anon', c.oid, 'USAGE')
       or has_sequence_privilege('anon', c.oid, 'SELECT')
       or has_sequence_privilege('anon', c.oid, 'UPDATE')
     );
  if v_problem is not null then
    raise exception 'Anonymous sequence access remains after hardening: %', v_problem;
  end if;

  if exists (
    select 1
      from pg_policy p
     where coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~* 'user_metadata|raw_user_meta_data'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~* 'user_metadata|raw_user_meta_data'
  ) or exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'safebus_private')
       and p.prosrc ~* 'user_metadata|raw_user_meta_data'
  ) then
    raise exception 'User-editable metadata is referenced by database authorization code.';
  end if;
end;
$$;
