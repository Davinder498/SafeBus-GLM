CREATE OR REPLACE FUNCTION safebus_private.run_retention_deletion(p_key text, p_dry_run boolean DEFAULT true)
 RETURNS TABLE(run_id uuid, policy_key text, expiry_action text, affected_rows bigint, dry_run boolean, completed_at timestamp with time zone, status text, error_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare
  v_policy public.retention_policies;
  v_run_id uuid;
  v_affected bigint := 0;
  v_cutoff timestamptz;
  v_actor uuid := auth.uid();
  v_is_service boolean := auth.role() = 'service_role';
  v_error_code text;
begin
  if not v_is_service then
    if not safebus_private.is_platform_super_admin() then
      raise exception 'Only a platform super administrator can run retention.' using errcode = '42501';
    end if;
    perform safebus_private.enforce_mfa_if_required();
    perform safebus_private.enforce_recent_auth_for_sensitive_action();
  end if;

  select * into v_policy
  from public.retention_policies
  where retention_policies.policy_key = p_key and active;
  if v_policy.policy_key is null then
    raise exception 'Unknown or inactive retention policy.' using errcode = '22023';
  end if;

  if not p_dry_run and not exists (
    select 1 from public.retention_execution_control
    where id = 1 and destructive_enabled
  ) then
    raise exception 'Destructive retention is disabled pending recorded approval.'
      using errcode = '55006';
  end if;

  if not pg_try_advisory_xact_lock(hashtext('safebus-retention:' || p_key)) then
    raise exception 'A retention run for this policy is already active.' using errcode = '55P03';
  end if;

  v_cutoff := now() - make_interval(days => v_policy.retention_days);
  insert into public.retention_deletion_runs(policy_key, actor_profile_id, dry_run)
  values (p_key, case when v_is_service then null else v_actor end, p_dry_run)
  returning id into v_run_id;

  -- Suppress per-row security-audit triggers during a retention batch. The
  -- batch emits one aggregate event with counts and no personal data.
  perform set_config('safebus.retention_run', 'on', true);

  begin
    case p_key
      when 'invitations' then
        if p_dry_run then
          select count(*) into v_affected from public.tenant_onboarding_invitations
          where status in ('activated', 'cancelled', 'failed') and updated_at < v_cutoff;
        else
          delete from public.tenant_onboarding_invitations
          where status in ('activated', 'cancelled', 'failed') and updated_at < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'student_records' then
        if p_dry_run then
          select count(*) into v_affected from public.students
          where status in ('inactive', 'transferred', 'archived') and updated_at < v_cutoff;
        else
          delete from public.students
          where status in ('inactive', 'transferred', 'archived') and updated_at < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'guardian_relationships' then
        if p_dry_run then
          select count(*) into v_affected from public.student_guardians
          where status in ('inactive', 'archived') and updated_at < v_cutoff;
        else
          delete from public.student_guardians
          where status in ('inactive', 'archived') and updated_at < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'driver_records' then
        select count(*) into v_affected from public.drivers
        where status in ('inactive', 'suspended', 'archived') and updated_at < v_cutoff;
        if not p_dry_run then
          with candidates as (
            select id, profile_id from public.drivers
            where status in ('inactive', 'suspended', 'archived') and updated_at < v_cutoff
          ), anonymized_drivers as (
            update public.drivers d
            set employee_number = null,
                phone = null,
                license_number = null,
                license_issue_date = null,
                license_expiry_date = null,
                license_class = null,
                address_line1 = null,
                address_line2 = null,
                city = null,
                province = null,
                postal_code = null,
                status = 'archived'
            from candidates c where d.id = c.id
            returning c.profile_id
          )
          update public.profiles p
          set first_name = 'Deleted',
              last_name = 'Driver',
              full_name = 'Deleted Driver',
              email = 'deleted+' || replace(p.id::text, '-', '') || '@invalid.safebus.local',
              status = 'disabled'
          where p.id in (select profile_id from anonymized_drivers);
        end if;

      when 'bus_tracking_sessions' then
        if p_dry_run then
          select count(*) into v_affected from public.bus_tracking_sessions
          where status in ('ended', 'revoked') and coalesce(ended_at, expires_at) < v_cutoff;
        else
          delete from public.bus_tracking_sessions
          where status in ('ended', 'revoked') and coalesce(ended_at, expires_at) < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'bus_run_dispatches' then
        if p_dry_run then
          select count(*) into v_affected from public.bus_run_dispatches
          where status in ('completed', 'cancelled')
            and coalesce(completed_at, cancelled_at, prepared_at) < v_cutoff;
        else
          delete from public.bus_run_dispatches
          where status in ('completed', 'cancelled')
            and coalesce(completed_at, cancelled_at, prepared_at) < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'trip_records' then
        if p_dry_run then
          select count(*) into v_affected from public.driver_trips
          where status in ('completed', 'cancelled') and ended_at < v_cutoff
            and not exists (
              select 1 from public.bus_run_dispatches d
              where d.driver_trip_id = driver_trips.id
            );
        else
          delete from public.driver_trips
          where status in ('completed', 'cancelled') and ended_at < v_cutoff
            and not exists (
              select 1 from public.bus_run_dispatches d
              where d.driver_trip_id = driver_trips.id
            );
          get diagnostics v_affected = row_count;
        end if;

      when 'raw_location_history' then
        if p_dry_run then
          select count(*) into v_affected from public.driver_trip_location_updates
          where recorded_at < v_cutoff;
        else
          delete from public.driver_trip_location_updates where recorded_at < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'notifications' then
        if p_dry_run then
          select count(*) into v_affected from public.guardian_notification_outbox
          where status in ('delivered', 'failed', 'cancelled')
            and coalesce(delivered_at, failed_at, updated_at, created_at) < v_cutoff;
        else
          delete from public.guardian_notification_outbox
          where status in ('delivered', 'failed', 'cancelled')
            and coalesce(delivered_at, failed_at, updated_at, created_at) < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'audit_records' then
        select count(*) into v_affected from public.audit_events
        where created_at < v_cutoff
          and (actor_profile_id is not null or actor_email is not null or target_id is not null
               or target_label is not null or detail <> '{}'::jsonb or ip_address is not null);
        if not p_dry_run then
          update public.audit_events
          set actor_profile_id = null,
              actor_email = null,
              target_id = null,
              target_label = null,
              detail = '{}'::jsonb,
              ip_address = null
          where created_at < v_cutoff
            and (actor_profile_id is not null or actor_email is not null or target_id is not null
                 or target_label is not null or detail <> '{}'::jsonb or ip_address is not null);
        end if;

      when 'rate_limit_buckets' then
        if p_dry_run then
          select count(*) into v_affected from public.rate_limit_buckets where window_start < v_cutoff;
        else
          delete from public.rate_limit_buckets where window_start < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'user_sessions' then
        if p_dry_run then
          select count(*) into v_affected from public.user_sessions
          where coalesce(revoked_at, last_active_at) < v_cutoff;
        else
          delete from public.user_sessions where coalesce(revoked_at, last_active_at) < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;
      else
        raise exception 'Retention policy has no implementation.' using errcode = '0A000';
    end case;

    update public.retention_deletion_runs
    set affected_rows = v_affected, status = 'completed', completed_at = now()
    where id = v_run_id;

    if v_is_service then
      insert into public.audit_events(action, outcome, detail)
      values (
        'retention.deletion_run', 'success',
        jsonb_build_object('policy_key', p_key, 'affected_rows', v_affected, 'dry_run', p_dry_run)
      );
    else
      perform safebus_private.write_audit_event_legacy(
        'retention.deletion_run', 'retention_policy', null, null, 'success',
        jsonb_build_object('policy_key', p_key, 'affected_rows', v_affected, 'dry_run', p_dry_run), null
      );
    end if;
  exception when others then
    v_error_code := sqlstate;
    update public.retention_deletion_runs
    set status = 'failed', completed_at = now(), error_code = v_error_code
    where id = v_run_id;

    if v_is_service then
      insert into public.audit_events(action, outcome, detail)
      values (
        'retention.deletion_run', 'error',
        jsonb_build_object('policy_key', p_key, 'dry_run', p_dry_run, 'error_code', v_error_code)
      );
    else
      perform safebus_private.write_audit_event_legacy(
        'retention.deletion_run', 'retention_policy', null, null, 'error',
        jsonb_build_object('policy_key', p_key, 'dry_run', p_dry_run, 'error_code', v_error_code), null
      );
    end if;

    return query
      select v_run_id, p_key, v_policy.expiry_action, 0::bigint, p_dry_run,
             now(), 'failed'::text, v_error_code;
    return;
  end;

  return query
    select v_run_id, p_key, v_policy.expiry_action, v_affected, p_dry_run,
           now(), 'completed'::text, null::text;
end;
$function$
