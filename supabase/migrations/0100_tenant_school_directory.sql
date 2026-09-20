-- SafeBus Alberta - tenant-owned nominal school directory
--
-- Schools are tenant-maintained reference information. They do not control
-- tenant lifecycle or transportation access. Only tenant administrators may
-- create, edit, archive, or restore them. Platform administrators have no
-- school visibility or mutation authority.

-- Preserve historical references by representing user-facing deletion as an
-- archive. A physical DELETE would cascade through legacy foreign keys on
-- routes, students, and notification records.
alter table public.schools
  drop constraint if exists schools_status_check;
alter table public.schools
  add constraint schools_status_check check (
    status in ('active', 'suspended', 'disabled', 'archived')
  );

drop policy if exists "schools select platform admin" on public.schools;

-- Platform onboarding creates only the tenant and first tenant administrator.
-- Keep the established signature for rolling-deploy compatibility, but ignore
-- its legacy school fields. The tenant administrator creates schools later.
create or replace function public.platform_finalize_tenant_invitation(
  p_auth_user_id uuid,
  p_tenant_name text,
  p_tenant_type text,
  p_school_name text,
  p_city text,
  p_admin_name text,
  p_admin_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_tenant public.tenants%rowtype;
  v_auth_email text;
  v_tenant_name text := btrim(p_tenant_name);
  v_tenant_type text := btrim(p_tenant_type);
  v_admin_name text := btrim(p_admin_name);
  v_admin_email text := lower(btrim(p_admin_email));
begin
  if not public.is_platform_super_admin() then
    raise exception 'Only an active platform super administrator can finalize tenant onboarding.'
      using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();

  if p_auth_user_id is null
    or nullif(v_tenant_name, '') is null
    or nullif(v_admin_name, '') is null
    or nullif(v_admin_email, '') is null then
    raise exception 'Tenant and administrator details are required.' using errcode = '22023';
  end if;

  if v_tenant_type not in ('school', 'school_group', 'bus_contractor', 'demo')
    or length(v_tenant_name) > 200
    or length(v_admin_name) > 200
    or length(v_admin_email) > 320 then
    raise exception 'Tenant or administrator details are invalid.' using errcode = '22023';
  end if;

  select lower(u.email)
  into v_auth_email
  from auth.users u
  where u.id = p_auth_user_id;

  if v_auth_email is null or v_auth_email <> v_admin_email then
    raise exception 'The invited Auth account does not match the administrator email.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.profiles p
    where p.id = p_auth_user_id or lower(p.email) = v_admin_email
  ) then
    raise exception 'The administrator email is already assigned to a SafeBus profile.'
      using errcode = '23505';
  end if;

  insert into public.tenants (name, type, status)
  values (v_tenant_name, v_tenant_type, 'active')
  returning * into v_tenant;

  insert into public.profiles (
    id, tenant_id, school_id, full_name, email, role, status
  ) values (
    p_auth_user_id, v_tenant.id, null, v_admin_name, v_admin_email,
    'tenant_admin', 'invited'
  );

  insert into public.tenant_onboarding_invitations (
    tenant_id, email, full_name, role, status,
    invited_profile_id, invited_by_profile_id, last_sent_at
  ) values (
    v_tenant.id, v_admin_email, v_admin_name, 'tenant_admin', 'pending',
    p_auth_user_id, auth.uid(), now()
  );

  return jsonb_build_object(
    'tenant', jsonb_build_object(
      'id', v_tenant.id,
      'name', v_tenant.name,
      'status', v_tenant.status
    )
  );
end;
$$;

revoke all on function public.platform_finalize_tenant_invitation(
  uuid, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.platform_finalize_tenant_invitation(
  uuid, text, text, text, text, text, text
) to authenticated;

comment on function public.platform_finalize_tenant_invitation(
  uuid, text, text, text, text, text, text
) is
  'Atomically creates a tenant and invited first tenant administrator. Legacy school arguments are ignored; school setup is exclusively tenant-owned.';

create or replace function public.tenant_create_school(
  p_name text,
  p_city text default null
)
returns public.schools
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_school public.schools;
  v_name text := btrim(p_name);
  v_city text := nullif(btrim(p_city), '');
begin
  select * into v_caller
  from public.profiles
  where id = auth.uid() and status = 'active';

  if v_caller.id is null or v_caller.role <> 'tenant_admin' or v_caller.tenant_id is null then
    raise exception 'Only an active tenant administrator can add schools.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();

  if nullif(v_name, '') is null or length(v_name) > 200
    or length(coalesce(v_city, '')) > 100 then
    raise exception 'Enter a school name up to 200 characters and an optional city up to 100 characters.'
      using errcode = '22023';
  end if;

  insert into public.schools (tenant_id, name, city, province, status)
  values (v_caller.tenant_id, v_name, v_city, 'AB', 'active')
  returning * into v_school;

  perform public.phase5_write_audit_event(
    auth.uid(), 'school.created', 'school', v_school.id, v_school.name,
    jsonb_build_object('tenant_id', v_caller.tenant_id)
  );

  return v_school;
end;
$$;

create or replace function public.tenant_update_school(
  p_school_id uuid,
  p_name text,
  p_city text default null
)
returns public.schools
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_school public.schools;
  v_previous_name text;
  v_name text := btrim(p_name);
  v_city text := nullif(btrim(p_city), '');
begin
  select * into v_caller
  from public.profiles
  where id = auth.uid() and status = 'active';

  if v_caller.id is null or v_caller.role <> 'tenant_admin' or v_caller.tenant_id is null then
    raise exception 'Only an active tenant administrator can edit schools.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();

  if p_school_id is null or nullif(v_name, '') is null or length(v_name) > 200
    or length(coalesce(v_city, '')) > 100 then
    raise exception 'Enter a valid school and name, with an optional city up to 100 characters.'
      using errcode = '22023';
  end if;

  select * into v_school
  from public.schools
  where id = p_school_id and tenant_id = v_caller.tenant_id
  for update;

  if v_school.id is null then
    raise exception 'School not found in this tenant.' using errcode = 'P0002';
  end if;
  if v_school.status = 'archived' then
    raise exception 'Restore the school before editing it.' using errcode = '22023';
  end if;

  v_previous_name := v_school.name;
  update public.schools
  set name = v_name, city = v_city, province = 'AB'
  where id = v_school.id
  returning * into v_school;

  perform public.phase5_write_audit_event(
    auth.uid(), 'school.updated', 'school', v_school.id, v_school.name,
    jsonb_build_object('tenant_id', v_caller.tenant_id, 'previous_name', v_previous_name)
  );

  return v_school;
end;
$$;

create or replace function public.tenant_archive_school(p_school_id uuid)
returns public.schools
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_school public.schools;
begin
  select * into v_caller
  from public.profiles
  where id = auth.uid() and status = 'active';

  if v_caller.id is null or v_caller.role <> 'tenant_admin' or v_caller.tenant_id is null then
    raise exception 'Only an active tenant administrator can delete schools.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();

  select * into v_school
  from public.schools
  where id = p_school_id and tenant_id = v_caller.tenant_id
  for update;

  if v_school.id is null then
    raise exception 'School not found in this tenant.' using errcode = 'P0002';
  end if;
  if v_school.status = 'archived' then
    return v_school;
  end if;

  update public.schools
  set status = 'archived'
  where id = v_school.id
  returning * into v_school;

  perform public.phase5_write_audit_event(
    auth.uid(), 'school.archived', 'school', v_school.id, v_school.name,
    jsonb_build_object('tenant_id', v_caller.tenant_id)
  );

  return v_school;
end;
$$;

create or replace function public.tenant_restore_school(p_school_id uuid)
returns public.schools
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_school public.schools;
begin
  select * into v_caller
  from public.profiles
  where id = auth.uid() and status = 'active';

  if v_caller.id is null or v_caller.role <> 'tenant_admin' or v_caller.tenant_id is null then
    raise exception 'Only an active tenant administrator can restore schools.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();

  select * into v_school
  from public.schools
  where id = p_school_id and tenant_id = v_caller.tenant_id
  for update;

  if v_school.id is null then
    raise exception 'School not found in this tenant.' using errcode = 'P0002';
  end if;
  if v_school.status <> 'archived' then
    return v_school;
  end if;

  update public.schools
  set status = 'active'
  where id = v_school.id
  returning * into v_school;

  perform public.phase5_write_audit_event(
    auth.uid(), 'school.restored', 'school', v_school.id, v_school.name,
    jsonb_build_object('tenant_id', v_caller.tenant_id)
  );

  return v_school;
end;
$$;

revoke all on function public.tenant_create_school(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.tenant_update_school(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.tenant_archive_school(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.tenant_restore_school(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.tenant_create_school(text, text) to authenticated;
grant execute on function public.tenant_update_school(uuid, text, text) to authenticated;
grant execute on function public.tenant_archive_school(uuid) to authenticated;
grant execute on function public.tenant_restore_school(uuid) to authenticated;

-- Preserve the complete audit action allowlist and add school directory events.
alter table public.audit_events drop constraint if exists audit_events_action_check;
alter table public.audit_events add constraint audit_events_action_check check (
  action in (
    'auth.login', 'auth.logout', 'auth.password_reset_requested',
    'auth.password_reset_completed', 'auth.password_changed',
    'auth.mfa_enrolled', 'auth.mfa_removed', 'auth.mfa_challenge_failed',
    'auth.account_recovery', 'auth.recent_auth_required',
    'invitation.created', 'invitation.resent', 'invitation.cancelled',
    'invitation.accepted', 'invitation.password_activated', 'invitation.redirect_blocked',
    'invitation.revoked', 'invitation.expired',
    'role.changed', 'role.escalation_blocked',
    'guardian.student_link_created', 'guardian.student_link_removed',
    'driver.assignment_created', 'driver.assignment_removed',
    'student.record_accessed', 'data.exported',
    'tenant.suspended', 'tenant.reactivated', 'tenant.lifecycle_changed',
    'account.revoked', 'account.suspended', 'account.restored',
    'security.config_changed', 'rate_limit.exceeded', 'retention.deletion_run',
    'admin.invited', 'admin.activated', 'admin.deactivated',
    'admin.transferred', 'admin.recovered', 'admin.departed', 'admin.role_changed',
    'bulk_import.created', 'bulk_import.validated', 'bulk_import.committed',
    'bulk_import.rolled_back', 'bulk_import.invitations_queued', 'audit.searched',
    'billing.subscription_created', 'billing.subscription_updated',
    'billing.quantity_changed',
    'billing.cancellation_scheduled', 'billing.renewal_resumed',
    'billing.subscription_reconciled', 'billing.portal_opened',
    'school.created', 'school.updated', 'school.archived', 'school.restored'
  )
);

comment on table public.schools is
  'Tenant-owned nominal school directory. School lifecycle never controls tenant or transportation access.';
comment on function public.tenant_create_school(text, text) is
  'Creates an Alberta school reference row for the authenticated tenant. Tenant-admin only.';
comment on function public.tenant_update_school(uuid, text, text) is
  'Updates nominal school details within the authenticated tenant. Tenant-admin only.';
comment on function public.tenant_archive_school(uuid) is
  'Archives a school reference without deleting or disabling operational records. Tenant-admin only.';
comment on function public.tenant_restore_school(uuid) is
  'Restores an archived school reference. Tenant-admin only.';

do $$
begin
  if to_regprocedure('public.platform_finalize_tenant_invitation(uuid,text,text,text,text,text,text)') is null
    or to_regprocedure('public.tenant_create_school(text,text)') is null
    or to_regprocedure('public.tenant_update_school(uuid,text,text)') is null
    or to_regprocedure('public.tenant_archive_school(uuid)') is null
    or to_regprocedure('public.tenant_restore_school(uuid)') is null then
    raise exception 'Tenant school directory RPC surface is incomplete.';
  end if;
end
$$;
