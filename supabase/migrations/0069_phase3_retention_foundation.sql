-- SafeBus Alberta - Phase 3 retention and deletion foundation
--
-- Destructive execution is never automatic merely because this migration is
-- applied. Browser calls default to dry-run, require a platform super admin,
-- AAL2, and recent authentication. The scheduled server path is service-role
-- only and must explicitly pass p_dry_run = false.

create table public.retention_policies (
  policy_key text primary key,
  data_class text not null,
  retention_days integer not null,
  expiry_action text not null,
  active boolean not null default true,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retention_policies_days_check check (retention_days between 1 and 3650),
  constraint retention_policies_action_check check (expiry_action in ('delete', 'anonymize'))
);

insert into public.retention_policies
  (policy_key, data_class, retention_days, expiry_action, description)
values
  ('invitations', 'Tenant-member invitations', 90, 'delete', 'Terminal invitation records.'),
  ('student_records', 'Inactive student transportation records', 395, 'delete', 'Inactive, transferred, or archived student rows and dependent links/events.'),
  ('guardian_relationships', 'Inactive guardian-student relationships', 395, 'delete', 'Inactive or archived guardian relationship links.'),
  ('driver_records', 'Inactive driver directory records', 395, 'anonymize', 'Driver and public profile identity fields; Auth-account deletion remains an Auth Admin workflow.'),
  ('bus_tracking_sessions', 'Expired bus tracking session tokens', 30, 'delete', 'Ended or revoked hashed bus-tracking sessions.'),
  ('bus_run_dispatches', 'Completed bus dispatch records', 395, 'delete', 'Completed or cancelled dispatch records; deleted before parent trips.'),
  ('trip_records', 'Completed trip records', 395, 'delete', 'Completed or cancelled trip lifecycle and cascading event/location history.'),
  ('raw_location_history', 'Raw bus location history', 30, 'delete', 'Raw driver_trip_location_updates rows.'),
  ('notifications', 'Terminal guardian notification outbox', 90, 'delete', 'Delivered, failed, or cancelled notification metadata.'),
  ('audit_records', 'Security audit trail', 730, 'anonymize', 'Actor, target, network, and detail fields; action/outcome/time are retained.'),
  ('rate_limit_buckets', 'Abuse-prevention counters', 2, 'delete', 'Expired rate-limit windows.'),
  ('user_sessions', 'SafeBus session mirror', 90, 'delete', 'Revoked or stale session-mirror metadata.')
on conflict (policy_key) do nothing;

create trigger set_updated_at_retention_policies
  before update on public.retention_policies
  for each row execute function public.set_updated_at();

-- Dual control for destructive execution. This row starts disabled and is not
-- browser-writable. Counsel approval is activated only through a reviewed
-- forward migration; the scheduled server flag alone can never enable deletes.
create table public.retention_execution_control (
  id smallint primary key default 1,
  destructive_enabled boolean not null default false,
  approval_reference text,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint retention_execution_control_singleton check (id = 1),
  constraint retention_execution_control_approval_check check (
    not destructive_enabled
    or (nullif(trim(approval_reference), '') is not null and approved_at is not null)
  )
);

insert into public.retention_execution_control(id, destructive_enabled)
values (1, false)
on conflict (id) do nothing;

create trigger set_updated_at_retention_execution_control
  before update on public.retention_execution_control
  for each row execute function public.set_updated_at();

create table public.retention_deletion_runs (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null references public.retention_policies(policy_key) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  dry_run boolean not null,
  affected_rows bigint not null default 0,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_code text,
  constraint retention_deletion_runs_status_check check (status in ('running', 'completed', 'failed')),
  constraint retention_deletion_runs_completion_check check (
    (status = 'running' and completed_at is null)
    or (status in ('completed', 'failed') and completed_at is not null)
  )
);

create index retention_deletion_runs_policy_started_idx
  on public.retention_deletion_runs(policy_key, started_at desc);

alter table public.retention_policies enable row level security;
alter table public.retention_execution_control enable row level security;
alter table public.retention_deletion_runs enable row level security;
revoke all on public.retention_policies from public, anon, authenticated;
revoke all on public.retention_execution_control from public, anon, authenticated;
revoke all on public.retention_deletion_runs from public, anon, authenticated;

create policy "retention_policies select admins"
  on public.retention_policies for select to authenticated
  using (
    public.current_user_role() in (
      'platform_super_admin', 'tenant_admin', 'school_admin', 'transportation_admin'
    )
    and public.has_verified_mfa()
  );

create policy "retention_deletion_runs select platform admin"
  on public.retention_deletion_runs for select to authenticated
  using (public.is_platform_super_admin() and public.has_verified_mfa());

create policy "retention_execution_control select platform admin"
  on public.retention_execution_control for select to authenticated
  using (public.is_platform_super_admin() and public.has_verified_mfa());

grant select on public.retention_policies, public.retention_execution_control,
  public.retention_deletion_runs to authenticated;

create or replace function public.get_retention_policies()
returns table (
  policy_key text,
  data_class text,
  retention_days integer,
  expiry_action text,
  active boolean,
  description text,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select rp.policy_key, rp.data_class, rp.retention_days, rp.expiry_action,
         rp.active, rp.description, rp.updated_at
  from public.retention_policies rp
  order by rp.policy_key;
$$;

revoke all on function public.get_retention_policies() from public, anon;
grant execute on function public.get_retention_policies() to authenticated;

create or replace function public.run_retention_deletion(
  p_key text,
  p_dry_run boolean default true
)
returns table (
  run_id uuid,
  policy_key text,
  expiry_action text,
  affected_rows bigint,
  dry_run boolean,
  completed_at timestamptz,
  status text,
  error_code text
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
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
    if not public.is_platform_super_admin() then
      raise exception 'Only a platform super administrator can run retention.' using errcode = '42501';
    end if;
    perform public.enforce_mfa_if_required();
    perform public.enforce_recent_auth_for_sensitive_action();
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
      perform public.write_audit_event(
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
      perform public.write_audit_event(
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
$$;

revoke all on function public.run_retention_deletion(text, boolean) from public, anon;
grant execute on function public.run_retention_deletion(text, boolean) to authenticated, service_role;

create or replace function public.run_all_retention_deletions(p_dry_run boolean default true)
returns table (
  run_id uuid,
  policy_key text,
  expiry_action text,
  affected_rows bigint,
  dry_run boolean,
  completed_at timestamptz,
  status text,
  error_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
begin
  -- Dependency order matters: token sessions and dispatches must be removed
  -- before their parent trips; notifications/links may cascade with students.
  foreach v_key in array array[
    'invitations', 'notifications', 'guardian_relationships', 'student_records',
    'bus_tracking_sessions', 'bus_run_dispatches', 'raw_location_history',
    'trip_records', 'driver_records', 'audit_records', 'rate_limit_buckets', 'user_sessions'
  ]
  loop
    return query select * from public.run_retention_deletion(v_key, p_dry_run);
  end loop;
end;
$$;

revoke all on function public.run_all_retention_deletions(boolean) from public, anon;
grant execute on function public.run_all_retention_deletions(boolean) to authenticated, service_role;

comment on table public.retention_policies is
  'Draft retention ceilings. Approval and changes require counsel, a decision-log entry, and a forward migration.';
comment on table public.retention_execution_control is
  'Database-side destructive-retention latch. Starts disabled and has no browser write policy.';
comment on table public.retention_deletion_runs is
  'Append-only-to-callers retention execution evidence; no personal data is stored.';
