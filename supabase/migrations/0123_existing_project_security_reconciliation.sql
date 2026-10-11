-- Snapshot-specific prerequisite for commercial security migration 0122.
-- The customer approved the sole existing project for controlled prelaunch
-- verification on 2026-10-10. Normal hardened databases need no reconciliation.
-- For this unadopted hosted snapshot, rehearse 0123 BEFORE 0122 in one transaction
-- that always ROLLBACKs. This file does not authorize persistence, historical
-- migration-ledger adoption, production deployment, or blanket migration replay.
set local lock_timeout = '2s';
set local statement_timeout = '30s';

create temporary table safebus_existing_rpc_surface (
  signature text primary key,
  audience text not null check (audience in ('authenticated', 'service_role'))
) on commit drop;
insert into safebus_existing_rpc_surface (signature, audience) values
  ('admin_create_bus(uuid,text,text,text,integer,text)', 'authenticated'),
  ('admin_create_route_shape_version(uuid,jsonb,text,text)', 'authenticated'),
  ('admin_create_student_onboarding(jsonb)', 'authenticated'),
  ('admin_deactivate_student_guardian(uuid)', 'authenticated'),
  ('admin_end_bus_route_assignment(uuid)', 'authenticated'),
  ('admin_end_bus_route_service(uuid[])', 'authenticated'),
  ('admin_finalize_member_invitation(uuid,text,text,text,text,text,jsonb,jsonb)', 'authenticated'),
  ('admin_link_student_guardian(uuid,uuid,text,boolean)', 'authenticated'),
  ('admin_process_student_csv_import(jsonb,boolean,boolean)', 'authenticated'),
  ('admin_publish_route_shape_version(uuid)', 'authenticated'),
  ('admin_renew_bus_route_assignment(uuid,date,date)', 'authenticated'),
  ('admin_replace_bus_trip_driver(uuid,uuid,date,date)', 'authenticated'),
  ('admin_save_route_definition(jsonb,jsonb,jsonb)', 'authenticated'),
  ('admin_set_bus_route_service(uuid,uuid,text,date,date,uuid[])', 'authenticated'),
  ('admin_set_driver_bus_assignment(uuid,uuid,date,date,uuid)', 'authenticated'),
  ('admin_set_guardian_access_expiry(uuid,timestamp with time zone)', 'authenticated'),
  ('admin_set_student_bus_service_status(uuid[],text,boolean)', 'authenticated'),
  ('admin_set_student_bus_service(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,date,date,uuid[])', 'authenticated'),
  ('admin_set_student_guardian_status(uuid,text,text,text)', 'authenticated'),
  ('admin_update_bus_route_assignment(uuid,uuid,uuid,text,date,date)', 'authenticated'),
  ('admin_update_bus_with_fleet_number(uuid,uuid,text,text,integer,text)', 'authenticated'),
  ('admin_update_bus(uuid,uuid,text,text,integer,text)', 'authenticated'),
  ('apply_notification_retention(boolean)', 'service_role'),
  ('archive_user_notifications(uuid[])', 'authenticated'),
  ('billing_begin_mutation(uuid,uuid,uuid,text,text)', 'service_role'),
  ('billing_begin_webhook_event(text,text,text,timestamp with time zone)', 'service_role'),
  ('billing_complete_mutation(uuid,text,text)', 'service_role'),
  ('billing_complete_webhook_event(text,text,text)', 'service_role'),
  ('billing_get_internal_state(uuid)', 'service_role'),
  ('billing_upsert_customer_mapping(uuid,text,text,text,integer)', 'service_role'),
  ('billing_upsert_projection(uuid,text,text,text,text,text,text,integer,text,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone,timestamp with time zone,text,text,integer,text,timestamp with time zone,timestamp with time zone)', 'service_role'),
  ('bind_driver_tracking_device(text,uuid,text)', 'authenticated'),
  ('bulk_import_commit(uuid,boolean)', 'authenticated'),
  ('bulk_import_generate_invitations(uuid)', 'authenticated'),
  ('bulk_import_get_errors(uuid)', 'authenticated'),
  ('bulk_import_rollback(uuid)', 'authenticated'),
  ('bulk_import_stage_rows(text,jsonb,text,boolean)', 'authenticated'),
  ('cancel_driver_trip(uuid,text)', 'authenticated'),
  ('cancel_guardian_notification_email(uuid,text,text)', 'service_role'),
  ('cancel_notification_email(uuid,text,text)', 'service_role'),
  ('cancel_push_notification_delivery(uuid,text)', 'service_role'),
  ('check_rate_limit(text,text,integer,integer)', 'authenticated'),
  ('claim_bulk_invitation_rows(uuid,integer)', 'authenticated'),
  ('claim_guardian_notification_email_batch(integer,integer,integer,integer)', 'service_role'),
  ('claim_notification_email_batch(integer,integer,integer,integer)', 'service_role'),
  ('claim_push_notification_deliveries(text,integer,integer)', 'service_role'),
  ('cleanup_stale_android_push_devices()', 'service_role'),
  ('complete_guardian_notification_email(uuid,text)', 'service_role'),
  ('complete_invited_account()', 'authenticated'),
  ('complete_notification_email(uuid,text)', 'service_role'),
  ('complete_push_notification_delivery(uuid,text,text)', 'service_role'),
  ('confirm_pre_trip(uuid)', 'authenticated'),
  ('end_driver_trip(uuid)', 'authenticated'),
  ('enforce_new_password_policy(text)', 'authenticated'),
  ('expire_stale_invitations()', 'service_role'),
  ('fail_guardian_notification_email(uuid,text,text)', 'service_role'),
  ('fail_notification_email(uuid,text,text)', 'service_role'),
  ('fail_push_notification_delivery(uuid,text,text,text,boolean)', 'service_role'),
  ('get_admin_active_trip_operational_statuses()', 'authenticated'),
  ('get_admin_bus_qr_credential_status(uuid)', 'authenticated'),
  ('get_admin_bus_services()', 'authenticated'),
  ('get_admin_bus_workspace(uuid)', 'authenticated'),
  ('get_admin_buses_page(integer,integer,text,text,uuid)', 'authenticated'),
  ('get_admin_dashboard_overview()', 'authenticated'),
  ('get_admin_guardian_links(uuid)', 'authenticated'),
  ('get_admin_live_fleet_monitoring_in_viewport(double precision,double precision,double precision,double precision)', 'authenticated'),
  ('get_admin_live_fleet_monitoring()', 'authenticated'),
  ('get_admin_live_route_overlays()', 'authenticated'),
  ('get_admin_live_trip_stop_distance_metres(uuid,uuid)', 'authenticated'),
  ('get_admin_paginated_list(text,integer,integer,text,text,uuid)', 'authenticated'),
  ('get_admin_route_shape_versions(uuid)', 'authenticated'),
  ('get_admin_route_stop_options(uuid)', 'authenticated'),
  ('get_admin_student_bus_assignments_page(integer,integer,text,text)', 'authenticated'),
  ('get_admin_student_qr_credential_status(uuid)', 'authenticated'),
  ('get_admin_students_page(integer,integer,text,text,uuid)', 'authenticated'),
  ('get_admin_trip_overview(integer)', 'authenticated'),
  ('get_bulk_invitation_delivery_summary(uuid)', 'authenticated'),
  ('get_bus_qr_start_options(text)', 'authenticated'),
  ('get_current_route_shape(uuid)', 'authenticated'),
  ('get_driver_active_trip_route_shape()', 'authenticated'),
  ('get_driver_active_trip_student_manifest()', 'authenticated'),
  ('get_driver_completed_trip_history(integer)', 'authenticated'),
  ('get_driver_delivery_preferences()', 'authenticated'),
  ('get_guardian_bus_service_lines(text)', 'authenticated'),
  ('get_guardian_bus_visibility_v2()', 'authenticated'),
  ('get_guardian_delivery_preferences_v2()', 'authenticated'),
  ('get_guardian_delivery_preferences_v3()', 'authenticated'),
  ('get_guardian_delivery_preferences()', 'authenticated'),
  ('get_guardian_notification_preferences_v2()', 'authenticated'),
  ('get_guardian_notification_preferences()', 'authenticated'),
  ('get_guardian_student_stops()', 'authenticated'),
  ('get_notification_delivery_health_v2()', 'authenticated'),
  ('get_notification_preferences()', 'authenticated'),
  ('get_platform_first_admin_invitation_status()', 'authenticated'),
  ('get_platform_tenant_billing_detail(uuid)', 'authenticated'),
  ('get_platform_tenant_billing_summaries()', 'authenticated'),
  ('get_platform_tenant_onboarding_summary_secure()', 'authenticated'),
  ('get_support_directory()', 'authenticated'),
  ('get_tenant_notification_delivery_summary(integer)', 'authenticated'),
  ('get_tenant_notification_settings()', 'authenticated'),
  ('get_tenant_subscription()', 'authenticated'),
  ('get_user_notification_detail(uuid)', 'authenticated'),
  ('get_user_notification_unread_count()', 'authenticated'),
  ('get_user_notifications(integer,timestamp with time zone,uuid,boolean,text)', 'authenticated'),
  ('ingest_driver_location_event(text,text,uuid,bigint,timestamp with time zone,double precision,double precision,double precision,double precision,double precision,integer,text)', 'authenticated'),
  ('is_allowed_redirect_origin(text)', 'authenticated'),
  ('is_current_user_session_active()', 'authenticated'),
  ('list_own_push_devices()', 'authenticated'),
  ('manage_bus_qr_credential(uuid,text)', 'authenticated'),
  ('manage_student_qr_credential(uuid,text)', 'authenticated'),
  ('mark_all_user_notifications_read()', 'authenticated'),
  ('mark_student_dropped_off_for_active_trip(uuid)', 'authenticated'),
  ('mark_student_picked_up_for_active_trip(uuid)', 'authenticated'),
  ('mark_user_notifications_read(uuid[],boolean)', 'authenticated'),
  ('pause_driver_trip(uuid)', 'authenticated'),
  ('platform_cancel_first_admin_invitation(uuid)', 'authenticated'),
  ('platform_emergency_admin_recovery(uuid,uuid)', 'authenticated'),
  ('platform_finalize_tenant_invitation(uuid,text,text,text,text,text,text)', 'authenticated'),
  ('platform_find_unprofiled_auth_user(text)', 'authenticated'),
  ('platform_is_first_admin_invitation(uuid)', 'authenticated'),
  ('platform_set_tenant_lifecycle(uuid,text)', 'authenticated'),
  ('reconcile_bulk_invitation_delivery(uuid,uuid,text)', 'service_role'),
  ('record_notification_delivery_incident(uuid,text)', 'service_role'),
  ('record_own_auth_event(text,text,jsonb)', 'authenticated'),
  ('record_student_qr_event_for_active_trip(text,text,uuid)', 'authenticated'),
  ('record_student_record_access(uuid)', 'authenticated'),
  ('record_trip_exception(uuid,text,text)', 'authenticated'),
  ('register_android_byod_tracking_device(uuid,text,text,text)', 'authenticated'),
  ('register_android_push_device(text,text,text,text,text)', 'authenticated'),
  ('register_current_user_session(text,text)', 'authenticated'),
  ('replace_bus(uuid,uuid)', 'authenticated'),
  ('requeue_notification_email_dead_letter(uuid)', 'service_role'),
  ('resolve_guardian_notification_email_payload(uuid)', 'service_role'),
  ('resolve_notification_email_recipient(uuid)', 'service_role'),
  ('resolve_push_notification_delivery(uuid,text)', 'service_role'),
  ('resolve_student_qr_for_active_trip(text)', 'authenticated'),
  ('resume_driver_trip(uuid)', 'authenticated'),
  ('retry_guardian_notification_email(uuid,text,text,integer,integer)', 'service_role'),
  ('retry_notification_email(uuid,text,text,integer,integer)', 'service_role'),
  ('retry_push_notification_delivery(uuid,text,text,text,timestamp with time zone,integer)', 'service_role'),
  ('revoke_driver_tracking_devices(uuid)', 'authenticated'),
  ('revoke_guardian_access(uuid,text)', 'authenticated'),
  ('revoke_invitation(uuid)', 'authenticated'),
  ('revoke_own_push_device(uuid)', 'authenticated'),
  ('run_all_retention_deletions(boolean)', 'service_role'),
  ('search_admin_buses(text,integer)', 'authenticated'),
  ('search_admin_guardians(text,integer)', 'authenticated'),
  ('search_admin_routes(text,integer)', 'authenticated'),
  ('search_admin_students(text,integer)', 'authenticated'),
  ('search_admin_trips(date,date,text,integer,integer)', 'authenticated'),
  ('server_get_member_invitation_state(text)', 'service_role'),
  ('set_driver_delivery_preferences(jsonb)', 'authenticated'),
  ('set_guardian_delivery_preferences_v2(jsonb)', 'authenticated'),
  ('set_guardian_delivery_preferences_v3(jsonb)', 'authenticated'),
  ('set_guardian_delivery_preferences(boolean,boolean)', 'authenticated'),
  ('set_guardian_notification_preferences_v2(uuid,boolean,boolean,boolean,boolean,boolean,boolean)', 'authenticated'),
  ('set_guardian_notification_preferences(uuid,boolean,boolean,boolean)', 'authenticated'),
  ('set_notification_preferences(boolean,boolean,time without time zone,time without time zone,text,boolean,text,jsonb)', 'authenticated'),
  ('set_tenant_notification_delivery_enabled(boolean)', 'authenticated'),
  ('set_tenant_push_notifications_enabled(boolean)', 'authenticated'),
  ('set_trip_operational_status(uuid,text,text)', 'authenticated'),
  ('start_bus_tracking_from_qr(text,uuid)', 'authenticated'),
  ('substitute_driver(uuid,uuid)', 'authenticated'),
  ('tenant_add_sub_administrator(uuid,text,text,text,uuid)', 'authenticated'),
  ('tenant_archive_school(uuid)', 'authenticated'),
  ('tenant_change_admin_role(uuid,text,uuid)', 'authenticated'),
  ('tenant_create_school(text,text)', 'authenticated'),
  ('tenant_depart_administrator(uuid)', 'authenticated'),
  ('tenant_invite_administrator(uuid,uuid,text,text)', 'authenticated'),
  ('tenant_restore_administrator(uuid)', 'authenticated'),
  ('tenant_restore_school(uuid)', 'authenticated'),
  ('tenant_search_audit_events(text,text,uuid,timestamp with time zone,timestamp with time zone,integer,integer)', 'authenticated'),
  ('tenant_suspend_administrator(uuid)', 'authenticated'),
  ('tenant_transfer_administrator(uuid,uuid)', 'authenticated'),
  ('tenant_update_school(uuid,text,text)', 'authenticated'),
  ('update_bus_tracking_location(text,double precision,double precision,double precision,double precision,double precision)', 'authenticated'),
  ('update_driver_trip_location(uuid,double precision,double precision,double precision,double precision,double precision,text)', 'service_role'),
  ('update_platform_support_contact(text,text,text,text,text,text)', 'authenticated'),
  ('update_tenant_support_contact(text,text,text,text,text,text)', 'authenticated'),
  ('write_server_audit_event(uuid,text,text,uuid,text,jsonb)', 'service_role');

do $reconcile$
declare
  v_fingerprint text;
  v_missing text;
  v_routine record;
  v_move record;
  v_definition text;
  v_rewritten text;
  v_search_path text;
  v_identity text;
begin
  -- Sequential clean/hardened targets already have the 0089 private baseline.
  -- This forward reconciliation must not overwrite that baseline or its grants.
  if to_regprocedure('public.current_user_role()') is null then
    if to_regprocedure('safebus_private.current_user_role()') is null
       or to_regprocedure('safebus_private.current_tenant_id()') is null
       or to_regprocedure('safebus_private.bus_service_entities_in_tenant(uuid,uuid,uuid)') is null then
      raise exception 'Missing authorization baseline; refusing reconciliation.';
    end if;
    return;
  end if;

  select md5(string_agg(format('%s|%s|%s',
      n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
      pg_get_functiondef(p.oid), coalesce(p.proacl::text, '')), E'\n'
      order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)))
    into v_fingerprint
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'safebus_private') and p.prokind = 'f'
      and not exists (select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid
          and d.refclassid = 'pg_extension'::regclass and d.deptype = 'e');
  if v_fingerprint is distinct from 'ca0c14c046ef2ccc76aceb89bdc19026' then
    raise exception 'Hosted authorization snapshot changed; review a fresh inventory.';
  end if;

  select string_agg(a.signature, ', ' order by a.signature) into v_missing
    from safebus_existing_rpc_surface a
    where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and regexp_replace(p.oid::regprocedure::text, '^public\.', '') = a.signature);
  if v_missing is not null then
    raise exception 'Missing current application RPCs: %', v_missing;
  end if;

  create schema if not exists safebus_private;
  revoke all on schema safebus_private from public, anon, authenticated;
  grant usage on schema safebus_private to authenticated, service_role;
  revoke create on schema public from public, anon, authenticated;

  create temporary table safebus_existing_internal_routines on commit drop as
    select p.oid, p.proname as old_name,
      case when p.proname = 'write_audit_event' then 'write_audit_event_legacy'
           else p.proname end as new_name,
      p.proargtypes
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid
          and d.refclassid = 'pg_extension'::regclass and d.deptype = 'e')
      and not exists (select 1 from safebus_existing_rpc_surface a
        where a.signature = regexp_replace(p.oid::regprocedure::text, '^public\.', ''));

  -- Textual call rewrites cannot choose an overload from its argument types.
  if exists (
    select 1 from safebus_existing_internal_routines i
    join pg_proc p on p.proname = i.old_name
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where not exists (select 1 from safebus_existing_internal_routines j where j.oid = p.oid)
  ) then raise exception 'Mixed internal/API overloads require explicit reconciliation.'; end if;
  if exists (
    select 1 from safebus_existing_internal_routines i
    join pg_proc p on p.proname = i.new_name and p.proargtypes = i.proargtypes
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'safebus_private'
  ) then raise exception 'Private function collision requires explicit reconciliation.'; end if;

  -- The existing private audit wrapper calls the public implementation. Preserve
  -- both OIDs; renaming the implementation avoids replacing the wrapper recursively.
  for v_move in select * from safebus_existing_internal_routines order by oid loop
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
      into v_identity from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.oid = v_move.oid;
    if v_move.new_name <> v_move.old_name then
      execute format('alter function %s rename to %I', v_identity, v_move.new_name);
      select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
        into v_identity from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.oid = v_move.oid;
    end if;
    execute format('alter function %s set schema safebus_private', v_identity);
  end loop;

  -- Policies and triggers follow OIDs. SQL/PLpgSQL string bodies need explicit
  -- qualified-call rewrites. Match the complete function token, not name prefixes.
  for v_routine in
    select p.oid, pg_get_functiondef(p.oid) as definition, p.proconfig,
      format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as identity
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'safebus_private') and p.prokind = 'f'
      and not exists (select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid
          and d.refclassid = 'pg_extension'::regclass and d.deptype = 'e')
    order by p.oid
  loop
    v_definition := v_routine.definition;
    v_rewritten := v_definition;
    for v_move in select distinct old_name, new_name
      from safebus_existing_internal_routines order by old_name loop
      v_rewritten := regexp_replace(v_rewritten,
        '(\mpublic\M|"public")\.[[:space:]]*(' || v_move.old_name || '|' ||
          '"' || v_move.old_name || '")[[:space:]]*\(',
        'safebus_private.' || v_move.new_name || '(', 'g');
    end loop;
    if v_rewritten <> v_definition then execute v_rewritten; end if;
    select substring(setting from length('search_path=') + 1) into v_search_path
      from unnest(v_routine.proconfig) setting where setting like 'search_path=%';
    -- Empty paths are intentional in fully-qualified newer functions.
    if v_search_path is null or v_search_path not in ('', '""') then
      execute format('alter function %s set search_path = pg_catalog, public, safebus_private, auth, extensions, realtime, pg_temp',
        v_routine.identity);
    end if;
  end loop;

  -- Existing private implementations retain their authenticated/service grants.
  -- Remove anonymous/PUBLIC execution everywhere, then explicitly rebuild public
  -- RPC audiences and grants needed by moved policy/invoker helpers.
  for v_routine in
    select p.oid, n.nspname,
      format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as identity,
      a.audience, i.oid is not null as moved
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    left join safebus_existing_rpc_surface a on n.nspname = 'public'
      and a.signature = regexp_replace(p.oid::regprocedure::text, '^public\.', '')
    left join safebus_existing_internal_routines i on i.oid = p.oid
    where n.nspname in ('public', 'safebus_private') and p.prokind = 'f'
      and not exists (select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid
          and d.refclassid = 'pg_extension'::regclass and d.deptype = 'e')
  loop
    execute format('revoke all on function %s from public, anon', v_routine.identity);
    if v_routine.nspname = 'public' then
      execute format('revoke all on function %s from authenticated, service_role', v_routine.identity);
      if v_routine.audience = 'authenticated' then
        execute format('grant execute on function %s to authenticated', v_routine.identity);
      end if;
      execute format('grant execute on function %s to service_role', v_routine.identity);
    elsif v_routine.moved then
      execute format('grant execute on function %s to authenticated, service_role', v_routine.identity);
    end if;
  end loop;
  revoke all on all tables in schema public from public, anon;
  revoke all on all sequences in schema public from anon;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'safebus_private') and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'execute')
  ) then raise exception 'Anonymous function execution remains after reconciliation.'; end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and has_function_privilege('authenticated', p.oid, 'execute')
        is distinct from exists (
          select 1 from safebus_existing_rpc_surface a
          where a.signature = regexp_replace(p.oid::regprocedure::text, '^public\.', '')
            and a.audience = 'authenticated'
        )
  ) then raise exception 'Authenticated RPC audience differs after reconciliation.'; end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  ) then raise exception 'Public application table without RLS; review the baseline.'; end if;
end;
$reconcile$;
