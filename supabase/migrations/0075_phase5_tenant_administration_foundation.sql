-- SafeBus Alberta - Phase 5 tenant administration foundation
--
-- Phase 5 requires a tenant to operate independently with multiple
-- administrators, defined sub-administrator permissions, administrator
-- transfer, emergency recovery, departure workflows, final-admin protection,
-- and tenant-level audit search.
--
-- SECURITY MODEL:
--   - All RPCs are SECURITY DEFINER, derive identity from auth.uid(), and
--     enforce role + tenant + active-status checks internally.
--   - Platform super-admins continue to use narrow summary RPCs; they cannot
--     read tenant-user profiles directly (enforced by 0065 RLS).
--   - Audit actions are appended to the existing append-only audit_events
--     table; the action CHECK constraint is extended atomically.

-- ---------------------------------------------------------------------------
-- 1. Extend audit_events action constraint for Phase 5 actions
-- ---------------------------------------------------------------------------
alter table public.audit_events drop constraint if exists audit_events_action_check;

alter table public.audit_events add constraint audit_events_action_check check (
  action in (
    -- Phase 2/3 actions (preserved)
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
    'student.record_accessed',
    'data.exported',
    'tenant.suspended', 'tenant.reactivated', 'tenant.lifecycle_changed',
    'account.revoked', 'account.suspended', 'account.restored',
    'security.config_changed',
    'rate_limit.exceeded',
    'retention.deletion_run',
    -- Phase 5 actions
    'admin.invited', 'admin.activated', 'admin.deactivated',
    'admin.transferred', 'admin.recovered', 'admin.departed',
    'admin.role_changed',
    'bulk_import.created', 'bulk_import.validated', 'bulk_import.committed',
    'bulk_import.rolled_back', 'bulk_import.invitations_queued',
    'audit.searched'
  )
);

-- ---------------------------------------------------------------------------
-- 2. Final tenant administrator protection (DB-level trigger)
-- ---------------------------------------------------------------------------
create or replace function public.count_active_tenant_admins(p_tenant_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.profiles
  where tenant_id = p_tenant_id
    and role = 'tenant_admin'
    and status = 'active';
$$;

revoke all on function public.count_active_tenant_admins(uuid) from public, anon, authenticated;
grant execute on function public.count_active_tenant_admins(uuid) to service_role;

comment on function public.count_active_tenant_admins(uuid) is
  'Counts active tenant administrators. Used by the final-admin protection trigger and RPCs.';

create or replace function public.protect_final_tenant_admin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active_count integer;
  v_tenant uuid;
  v_tenant_status text;
begin
  v_tenant := old.tenant_id;

  -- Serialize all final-admin decisions for a tenant so two concurrent
  -- demotions/departures cannot both observe the same active count.
  if old.role = 'tenant_admin' and old.status = 'active' then
    perform pg_advisory_xact_lock(hashtextextended(v_tenant::text, 0));
  end if;

  -- Tenant-wide suspension is permitted after the lifecycle RPC has locked
  -- and changed the tenant row. It is not an administrator departure.
  if tg_op = 'UPDATE'
     and old.role = 'tenant_admin'
     and old.status = 'active'
     and new.role = 'tenant_admin'
     and new.status = 'suspended' then
    select status into v_tenant_status from public.tenants where id = v_tenant;
    if v_tenant_status in ('suspended', 'disabled') then
      return new;
    end if;
  end if;

  -- Protect status changes, role changes, and deletion of the last active
  -- tenant administrator at the database layer.
  if (tg_op = 'DELETE' and old.role = 'tenant_admin' and old.status = 'active')
     or (tg_op = 'UPDATE'
         and old.role = 'tenant_admin'
         and old.status = 'active'
         and (new.role <> 'tenant_admin' or new.status <> 'active')) then
    select public.count_active_tenant_admins(v_tenant) into v_active_count;
    if v_active_count <= 1 then
      raise exception 'Cannot remove or deactivate the final tenant administrator. Add another administrator first.'
        using errcode = '23001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.protect_final_tenant_admin() from public, anon, authenticated;

drop trigger if exists protect_final_tenant_admin_delete on public.profiles;
drop trigger if exists protect_final_tenant_admin_update on public.profiles;

create trigger protect_final_tenant_admin_delete
  before delete on public.profiles
  for each row execute function public.protect_final_tenant_admin();

create trigger protect_final_tenant_admin_update
  before update of status, role on public.profiles
  for each row execute function public.protect_final_tenant_admin();

-- Private lifecycle snapshots preserve the exact account states that were
-- changed by a tenant suspension. No browser role receives table privileges.
create table if not exists public.tenant_lifecycle_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  previous_tenant_status text not null,
  suspended_status text not null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  restored_at timestamptz,
  constraint tenant_lifecycle_snapshot_status_check
    check (suspended_status in ('suspended', 'disabled'))
);

-- Private bridge for SECURITY DEFINER Phase 5 RPCs. The generic browser audit
-- writer is intentionally not executable directly; this bridge binds the
-- supplied actor to auth.uid() and preserves target labels.
create or replace function public.phase5_write_audit_event(
  p_actor_profile_id uuid,
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_target_label text,
  p_detail jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_event public.audit_events;
  v_actor public.profiles;
  v_tenant_id uuid;
begin
  if auth.uid() is null or p_actor_profile_id is distinct from auth.uid() then
    raise exception 'Audit actor must match the authenticated profile.' using errcode = '42501';
  end if;
  select * into v_actor from public.profiles
  where id = p_actor_profile_id and status = 'active';
  if v_actor.id is null then
    raise exception 'Active audit actor profile required.' using errcode = '42501';
  end if;
  v_tenant_id := v_actor.tenant_id;
  if v_tenant_id is null and p_target_type = 'tenant' then
    v_tenant_id := p_target_id;
  elsif v_tenant_id is null and nullif(p_detail ->> 'tenant_id', '') is not null then
    v_tenant_id := (p_detail ->> 'tenant_id')::uuid;
  end if;

  insert into public.audit_events (
    tenant_id, actor_profile_id, actor_email, actor_role,
    action, target_type, target_id, target_label, outcome, detail
  ) values (
    v_tenant_id, v_actor.id, v_actor.email, v_actor.role,
    p_action, p_target_type, p_target_id, p_target_label, 'success',
    public.sanitize_audit_detail(coalesce(p_detail, '{}'::jsonb))
  ) returning * into v_event;
  return v_event.id;
end;
$$;
revoke all on function public.phase5_write_audit_event(uuid, text, text, uuid, text, jsonb)
  from public, anon, authenticated, service_role;

create table if not exists public.tenant_lifecycle_snapshot_entries (
  snapshot_id uuid not null references public.tenant_lifecycle_snapshots(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  previous_status text not null,
  primary key (snapshot_id, entity_type, entity_id),
  constraint tenant_lifecycle_snapshot_entity_check
    check (entity_type in ('profile', 'driver', 'guardian'))
);

create unique index if not exists tenant_lifecycle_one_open_snapshot_idx
  on public.tenant_lifecycle_snapshots (tenant_id)
  where restored_at is null;

alter table public.tenant_lifecycle_snapshots enable row level security;
alter table public.tenant_lifecycle_snapshot_entries enable row level security;
revoke all on public.tenant_lifecycle_snapshots from public, anon, authenticated;
revoke all on public.tenant_lifecycle_snapshot_entries from public, anon, authenticated;

-- Put the legacy onboarding summary behind an MFA-gated wrapper. The result
-- remains aggregate-only except for the first administrator whom platform
-- onboarding invited directly.
revoke all on function public.get_platform_tenant_onboarding_summary()
  from public, anon, authenticated;
create or replace function public.get_platform_tenant_onboarding_summary_secure()
returns table (
  tenant_id uuid,
  tenant_name text,
  tenant_type text,
  tenant_status text,
  tenant_created_at timestamptz,
  first_tenant_admin_profile_id uuid,
  first_tenant_admin_name text,
  first_tenant_admin_email text,
  tenant_admin_status text,
  active_tenant_admin_count bigint,
  latest_invitation_status text,
  latest_invitation_at timestamptz,
  setup_readiness text,
  has_buses boolean,
  has_drivers boolean,
  has_routes boolean,
  has_students boolean,
  last_onboarding_activity_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select summary.*
  from public.get_platform_tenant_onboarding_summary() summary
  where public.is_platform_super_admin() and public.has_verified_mfa();
$$;
revoke all on function public.get_platform_tenant_onboarding_summary_secure()
  from public, anon, authenticated;
grant execute on function public.get_platform_tenant_onboarding_summary_secure()
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Platform atomic tenant lifecycle RPC
-- ---------------------------------------------------------------------------
create or replace function public.platform_set_tenant_lifecycle(
  p_tenant_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_tenant public.tenants;
  v_previous_status text;
  v_action text;
  v_snapshot_id uuid;
begin
  if auth.uid() is null or not public.is_platform_super_admin() then
    raise exception 'Only a platform super administrator can change tenant lifecycle.'
      using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'suspended', 'disabled') then
    raise exception 'Unsupported tenant status.' using errcode = '22023';
  end if;

  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));

  select * into v_tenant from public.tenants where id = p_tenant_id for update;
  if v_tenant.id is null then
    raise exception 'Tenant not found.' using errcode = 'P0002';
  end if;

  v_previous_status := v_tenant.status;
  if v_previous_status = p_status then
    return jsonb_build_object('status', p_status, 'previous_status', v_previous_status, 'changed', false);
  end if;

  if p_status = 'active' then
    select id into v_snapshot_id
    from public.tenant_lifecycle_snapshots
    where tenant_id = p_tenant_id and restored_at is null
    order by created_at desc
    limit 1
    for update;

    update public.tenants set status = 'active' where id = p_tenant_id;

    if v_snapshot_id is not null then
      update public.profiles p
      set status = e.previous_status::public.profile_status
      from public.tenant_lifecycle_snapshot_entries e
      where e.snapshot_id = v_snapshot_id
        and e.entity_type = 'profile'
        and e.entity_id = p.id
        and p.tenant_id = p_tenant_id
        and p.status = 'suspended';

      update public.drivers d
      set status = e.previous_status
      from public.tenant_lifecycle_snapshot_entries e
      where e.snapshot_id = v_snapshot_id
        and e.entity_type = 'driver'
        and e.entity_id = d.id
        and d.tenant_id = p_tenant_id
        and d.status = 'suspended';

      update public.guardians g
      set status = e.previous_status
      from public.tenant_lifecycle_snapshot_entries e
      where e.snapshot_id = v_snapshot_id
        and e.entity_type = 'guardian'
        and e.entity_id = g.id
        and g.tenant_id = p_tenant_id
        and g.status = 'suspended';

      update public.tenant_lifecycle_snapshots
      set restored_at = now()
      where id = v_snapshot_id;
    end if;
    v_action := 'tenant.reactivated';
  else
    select id into v_snapshot_id
    from public.tenant_lifecycle_snapshots
    where tenant_id = p_tenant_id and restored_at is null
    order by created_at desc
    limit 1
    for update;

    -- Moving between suspended and disabled does not create a second snapshot
    -- or overwrite the original account states.
    if v_snapshot_id is not null then
      update public.tenant_lifecycle_snapshots
      set suspended_status = p_status
      where id = v_snapshot_id;
      update public.tenants set status = p_status where id = p_tenant_id;
      v_action := 'tenant.suspended';
  perform public.phase5_write_audit_event(
        auth.uid(), v_action, 'tenant', p_tenant_id, v_tenant.name,
        jsonb_build_object('status', p_status, 'previous_status', v_previous_status)
      );
      return jsonb_build_object(
        'status', p_status, 'previous_status', v_previous_status, 'changed', true
      );
    end if;

    insert into public.tenant_lifecycle_snapshots (
      tenant_id, previous_tenant_status, suspended_status, created_by_profile_id
    ) values (p_tenant_id, v_previous_status, p_status, auth.uid())
    returning id into v_snapshot_id;

    insert into public.tenant_lifecycle_snapshot_entries
      (snapshot_id, entity_type, entity_id, previous_status)
    select v_snapshot_id, 'profile', id, status::text
    from public.profiles
    where tenant_id = p_tenant_id and role <> 'platform_super_admin' and status = 'active';

    insert into public.tenant_lifecycle_snapshot_entries
      (snapshot_id, entity_type, entity_id, previous_status)
    select v_snapshot_id, 'driver', id, status
    from public.drivers
    where tenant_id = p_tenant_id and status = 'active';

    insert into public.tenant_lifecycle_snapshot_entries
      (snapshot_id, entity_type, entity_id, previous_status)
    select v_snapshot_id, 'guardian', id, status
    from public.guardians
    where tenant_id = p_tenant_id and status = 'active';

    update public.tenants set status = p_status where id = p_tenant_id;
    update public.profiles set status = 'suspended'
    where tenant_id = p_tenant_id and role <> 'platform_super_admin' and status = 'active';
    update public.drivers set status = 'suspended'
    where tenant_id = p_tenant_id and status = 'active';
    update public.guardians set status = 'suspended'
    where tenant_id = p_tenant_id and status = 'active';
    update public.driver_trips set status = 'cancelled', ended_at = now()
    where tenant_id = p_tenant_id and status = 'active';
    v_action := 'tenant.suspended';
  end if;

  perform public.phase5_write_audit_event(
    auth.uid(), v_action, 'tenant', p_tenant_id, v_tenant.name,
    jsonb_build_object('status', p_status, 'previous_status', v_previous_status)
  );

  return jsonb_build_object('status', p_status, 'previous_status', v_previous_status, 'changed', true);
end;
$$;

revoke all on function public.platform_set_tenant_lifecycle(uuid, text) from public, anon, authenticated;
grant execute on function public.platform_set_tenant_lifecycle(uuid, text) to authenticated;

comment on function public.platform_set_tenant_lifecycle(uuid, text) is
  'Atomic, audited tenant lifecycle change. Suspends/reactivates all tenant records in one transaction. Platform super-admin only.';

-- ---------------------------------------------------------------------------
-- 4. Tenant administrator invitation (supports multiple admins)
-- ---------------------------------------------------------------------------
create or replace function public.tenant_invite_administrator(
  p_tenant_id uuid,
  p_auth_user_id uuid,
  p_full_name text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_target_tenant_id uuid;
  v_full_name text := trim(p_full_name);
  v_email text := lower(trim(p_email));
  v_auth_email text;
begin
  select * into v_caller from public.profiles where id = auth.uid() and status = 'active';
  if v_caller.id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if v_caller.role <> 'tenant_admin' then
    raise exception 'Only a tenant administrator can invite additional administrators.'
      using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();
  v_target_tenant_id := v_caller.tenant_id;

  if p_tenant_id is not null and p_tenant_id is distinct from v_target_tenant_id then
    raise exception 'You can only invite administrators within your tenant.' using errcode = '42501';
  end if;

  if v_target_tenant_id is null
    or nullif(v_full_name, '') is null
    or nullif(v_email, '') is null
    or length(v_full_name) > 200
    or length(v_email) > 320 then
    raise exception 'Tenant, full name, and valid email are required.' using errcode = '22023';
  end if;

  select lower(u.email) into v_auth_email from auth.users u where u.id = p_auth_user_id;
  if v_auth_email is null or v_auth_email <> v_email then
    raise exception 'The invited Auth account does not match the administrator email.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.profiles
    where lower(email) = v_email and tenant_id is distinct from v_target_tenant_id
  ) then
    raise exception 'That email is already linked to a different SafeBus tenant.' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.profiles
    where id = p_auth_user_id
      and (
        tenant_id is distinct from v_target_tenant_id
        or role <> 'tenant_admin'
        or status <> 'invited'
        or lower(email) <> v_email
      )
  ) then
    raise exception 'This Auth account is already linked to a different or active SafeBus profile.'
      using errcode = '23505';
  end if;

  insert into public.profiles (id, tenant_id, school_id, full_name, email, role, status)
  values (p_auth_user_id, v_target_tenant_id, null, v_full_name, v_email, 'tenant_admin', 'invited')
  on conflict (id) do update
  set tenant_id = excluded.tenant_id,
      role = excluded.role,
      full_name = excluded.full_name,
      email = excluded.email,
      status = case when public.profiles.status = 'invited' then 'invited' else public.profiles.status end;

  update public.tenant_onboarding_invitations
  set status = 'resent', last_sent_at = now(), cancelled_at = null
  where id = (
    select i.id from public.tenant_onboarding_invitations i
    where i.invited_profile_id = p_auth_user_id and i.status in ('pending', 'resent', 'failed')
    order by i.created_at desc, i.id desc limit 1
  );
  if not found then
    insert into public.tenant_onboarding_invitations (
    tenant_id, email, full_name, role, status, invited_profile_id, invited_by_profile_id, last_sent_at
    ) values (
      v_target_tenant_id, v_email, v_full_name, 'tenant_admin', 'pending',
      p_auth_user_id, auth.uid(), now()
    );
  end if;

  perform public.phase5_write_audit_event(
    auth.uid(), 'admin.invited', 'profile', p_auth_user_id, v_full_name,
    jsonb_build_object('tenant_id', v_target_tenant_id, 'role', 'tenant_admin')
  );

  return jsonb_build_object('profileId', p_auth_user_id, 'tenantId', v_target_tenant_id, 'status', 'invited');
end;
$$;

revoke all on function public.tenant_invite_administrator(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.tenant_invite_administrator(uuid, uuid, text, text) to authenticated;

comment on function public.tenant_invite_administrator(uuid, uuid, text, text) is
  'Invites an additional administrator within the calling tenant. Tenant-admin only; multiple admins supported.';

-- ---------------------------------------------------------------------------
-- 5. Add sub-administrator (school_admin / transportation_admin)
-- ---------------------------------------------------------------------------
create or replace function public.tenant_add_sub_administrator(
  p_auth_user_id uuid,
  p_role text,
  p_full_name text,
  p_email text,
  p_school_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_tenant_id uuid;
  v_full_name text := trim(p_full_name);
  v_email text := lower(trim(p_email));
  v_role text := lower(trim(p_role));
  v_auth_email text;
begin
  select * into v_caller from public.profiles where id = auth.uid() and status = 'active';
  if v_caller.id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if v_caller.role <> 'tenant_admin' then
    raise exception 'Only a tenant administrator can add sub-administrators.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();
  v_tenant_id := v_caller.tenant_id;

  if v_role is null or v_role not in ('school_admin', 'transportation_admin') then
    raise exception 'Only school_admin or transportation_admin roles are supported here.' using errcode = '22023';
  end if;
  if v_role = 'school_admin' and p_school_id is null then
    raise exception 'A school assignment is required for a school administrator.' using errcode = '22023';
  end if;
  if nullif(v_full_name, '') is null or nullif(v_email, '') is null then
    raise exception 'Full name and valid email are required.' using errcode = '22023';
  end if;
  if p_school_id is not null and not exists (
    select 1 from public.schools
    where id = p_school_id and tenant_id = v_tenant_id and status = 'active'
  ) then
    raise exception 'The selected school is not active in this tenant.' using errcode = '22023';
  end if;

  select lower(u.email) into v_auth_email from auth.users u where u.id = p_auth_user_id;
  if v_auth_email is null or v_auth_email <> v_email then
    raise exception 'The invited Auth account does not match the email.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.profiles where lower(email) = v_email and tenant_id is distinct from v_tenant_id
  ) then
    raise exception 'That email is already linked to a different SafeBus tenant.' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.profiles
    where id = p_auth_user_id
      and (
        tenant_id is distinct from v_tenant_id
        or role::text <> v_role
        or status <> 'invited'
        or lower(email) <> v_email
      )
  ) then
    raise exception 'This Auth account is already linked to a different or active SafeBus profile.'
      using errcode = '23505';
  end if;

  insert into public.profiles (id, tenant_id, school_id, full_name, email, role, status)
  values (p_auth_user_id, v_tenant_id, p_school_id, v_full_name, v_email, v_role::public.user_role, 'invited')
  on conflict (id) do update
  set school_id = excluded.school_id,
      role = excluded.role,
      full_name = excluded.full_name,
      email = excluded.email,
      status = case when public.profiles.status = 'invited' then 'invited' else public.profiles.status end;

  update public.tenant_onboarding_invitations
  set status = 'resent', last_sent_at = now(), cancelled_at = null
  where id = (
    select i.id from public.tenant_onboarding_invitations i
    where i.invited_profile_id = p_auth_user_id and i.status in ('pending', 'resent', 'failed')
    order by i.created_at desc, i.id desc limit 1
  );
  if not found then
    insert into public.tenant_onboarding_invitations (
    tenant_id, email, full_name, role, status, invited_profile_id, invited_by_profile_id, last_sent_at
    ) values (
      v_tenant_id, v_email, v_full_name, v_role, 'pending',
      p_auth_user_id, auth.uid(), now()
    );
  end if;

  perform public.phase5_write_audit_event(
    auth.uid(), 'admin.invited', 'profile', p_auth_user_id, v_full_name,
    jsonb_build_object('tenant_id', v_tenant_id, 'role', v_role, 'school_id', p_school_id)
  );

  return jsonb_build_object('profileId', p_auth_user_id, 'tenantId', v_tenant_id, 'status', 'invited');
end;
$$;

revoke all on function public.tenant_add_sub_administrator(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.tenant_add_sub_administrator(uuid, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Administrator transfer (make an existing user a tenant_admin)
-- ---------------------------------------------------------------------------
create or replace function public.tenant_transfer_administrator(
  p_profile_id uuid,
  p_tenant_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_target public.profiles;
  v_tenant_id uuid;
  v_previous_role public.user_role;
begin
  select * into v_caller from public.profiles where id = auth.uid() and status = 'active';
  if v_caller.id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if v_caller.role <> 'tenant_admin' then
    raise exception 'Only a tenant administrator can transfer administrator rights.'
      using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();

  select * into v_target from public.profiles where id = p_profile_id for update;
  if v_target.id is null then
    raise exception 'Target profile not found.' using errcode = 'P0002';
  end if;

  v_tenant_id := v_caller.tenant_id;
  if v_tenant_id is null then
    raise exception 'A target tenant is required for the transfer.' using errcode = '22023';
  end if;

  if v_target.tenant_id is distinct from v_caller.tenant_id
     or (p_tenant_id is not null and p_tenant_id is distinct from v_caller.tenant_id) then
    raise exception 'Tenant administrators can only transfer within their own tenant.' using errcode = '42501';
  end if;

  v_previous_role := v_target.role;

  update public.profiles
  set role = 'tenant_admin',
      tenant_id = v_tenant_id,
      school_id = null
  where id = p_profile_id;

  perform public.phase5_write_audit_event(
    auth.uid(), 'admin.transferred', 'profile', p_profile_id, v_target.full_name,
    jsonb_build_object('tenant_id', v_tenant_id, 'previous_role', v_previous_role::text, 'new_role', 'tenant_admin')
  );

  return jsonb_build_object(
    'profileId', p_profile_id,
    'tenantId', v_tenant_id,
    'previousRole', v_previous_role::text,
    'newRole', 'tenant_admin'
  );
end;
$$;

revoke all on function public.tenant_transfer_administrator(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tenant_transfer_administrator(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Emergency recovery (platform super-admin)
-- ---------------------------------------------------------------------------
create or replace function public.platform_emergency_admin_recovery(
  p_profile_id uuid,
  p_tenant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_target public.profiles;
  v_tenant public.tenants;
begin
  select * into v_caller from public.profiles where id = auth.uid() and status = 'active';
  if v_caller.id is null or v_caller.role <> 'platform_super_admin' then
    raise exception 'Only a platform super administrator can perform emergency recovery.'
      using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();

  select * into v_tenant from public.tenants where id = p_tenant_id for update;
  if v_tenant.id is null then
    raise exception 'Tenant not found.' using errcode = 'P0002';
  end if;

  if v_tenant.status <> 'active' then
    raise exception 'Reactivate the tenant through the lifecycle workflow before emergency administrator recovery.'
      using errcode = '22023';
  end if;

  select * into v_target from public.profiles
  where id = p_profile_id and tenant_id = p_tenant_id
    and role = 'tenant_admin'
  for update;
  if v_target.id is null then
    raise exception 'Tenant administrator not found in this tenant.' using errcode = 'P0002';
  end if;
  if v_target.id is distinct from (
    select p.id from public.profiles p
    where p.tenant_id = p_tenant_id and p.role = 'tenant_admin'
    order by p.created_at, p.id limit 1
  ) then
    raise exception 'Platform emergency recovery is limited to the first tenant administrator.'
      using errcode = '42501';
  end if;

  update public.profiles
  set status = 'active', school_id = null
  where id = p_profile_id;

  perform public.phase5_write_audit_event(
    auth.uid(), 'admin.recovered', 'profile', p_profile_id, v_target.full_name,
    jsonb_build_object('tenant_id', p_tenant_id, 'emergency', true)
  );

  return jsonb_build_object(
    'profileId', p_profile_id,
    'tenantId', p_tenant_id,
    'status', 'active',
    'role', 'tenant_admin'
  );
end;
$$;

revoke all on function public.platform_emergency_admin_recovery(uuid, uuid) from public, anon, authenticated;
grant execute on function public.platform_emergency_admin_recovery(uuid, uuid) to authenticated;

comment on function public.platform_emergency_admin_recovery(uuid, uuid) is
  'Emergency recovery: platform super-admin reactivates only the first tenant administrator after the tenant lifecycle has been restored.';

-- ---------------------------------------------------------------------------
-- 8. Administrator role change
-- ---------------------------------------------------------------------------
create or replace function public.tenant_change_admin_role(
  p_profile_id uuid,
  p_new_role text,
  p_school_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_target public.profiles;
  v_previous_role public.user_role;
  v_new_role text := lower(trim(p_new_role));
begin
  select * into v_caller from public.profiles where id = auth.uid() and status = 'active';
  if v_caller.id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if v_caller.role <> 'tenant_admin' then
    raise exception 'Only an administrator can change roles.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();
  if v_new_role is null or v_new_role not in ('tenant_admin', 'school_admin', 'transportation_admin') then
    raise exception 'Only administrative roles are supported here.' using errcode = '22023';
  end if;

  select * into v_target from public.profiles where id = p_profile_id for update;
  if v_target.id is null then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
  if v_caller.role = 'tenant_admin' and v_target.tenant_id is distinct from v_caller.tenant_id then
    raise exception 'You can only change roles within your tenant.' using errcode = '42501';
  end if;
  if v_target.role not in ('tenant_admin', 'school_admin', 'transportation_admin') then
    raise exception 'Only existing administrators can have their role changed here.' using errcode = '22023';
  end if;

  v_previous_role := v_target.role;

  if v_previous_role = 'tenant_admin' and v_new_role <> 'tenant_admin' and v_target.status = 'active' then
    if public.count_active_tenant_admins(v_target.tenant_id) <= 1 then
      raise exception 'Cannot demote the final tenant administrator. Add another administrator first.'
        using errcode = '23001';
    end if;
  end if;

  if v_new_role = 'school_admin' and p_school_id is null then
    raise exception 'A school assignment is required for a school administrator.' using errcode = '22023';
  end if;
  if v_new_role = 'school_admin' and not exists (
    select 1 from public.schools
    where id = p_school_id and tenant_id = v_target.tenant_id and status = 'active'
  ) then
    raise exception 'The selected school is not active in this tenant.' using errcode = '22023';
  end if;

  update public.profiles
  set role = v_new_role::public.user_role,
      school_id = case when v_new_role = 'school_admin' then p_school_id else null end
  where id = p_profile_id;

  perform public.phase5_write_audit_event(
    auth.uid(), 'admin.role_changed', 'profile', p_profile_id, v_target.full_name,
    jsonb_build_object('previous_role', v_previous_role::text, 'new_role', v_new_role, 'school_id', p_school_id)
  );

  return jsonb_build_object(
    'profileId', p_profile_id,
    'previousRole', v_previous_role::text,
    'newRole', v_new_role
  );
end;
$$;

revoke all on function public.tenant_change_admin_role(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.tenant_change_admin_role(uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Administrator suspension and departure workflows
-- ---------------------------------------------------------------------------
create or replace function public.tenant_suspend_administrator(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_target public.profiles;
begin
  select * into v_caller from public.profiles where id = auth.uid() and status = 'active';
  if v_caller.id is null or v_caller.role <> 'tenant_admin' then
    raise exception 'Only a tenant administrator can suspend administrators.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();
  select * into v_target from public.profiles where id = p_profile_id for update;
  if v_target.id is null or v_target.tenant_id is distinct from v_caller.tenant_id then
    raise exception 'Administrator not found in this tenant.' using errcode = 'P0002';
  end if;
  if v_target.id = v_caller.id then
    raise exception 'You cannot suspend your own administrator account.' using errcode = '22023';
  end if;
  if v_target.status = 'suspended' then
    return jsonb_build_object(
      'profileId', p_profile_id, 'status', 'suspended', 'changed', false
    );
  end if;
  if v_target.role not in ('tenant_admin', 'school_admin', 'transportation_admin')
     or v_target.status <> 'active' then
    raise exception 'Only an active administrator can be suspended.' using errcode = '22023';
  end if;
  update public.profiles set status = 'suspended' where id = p_profile_id;
  perform public.phase5_write_audit_event(
    auth.uid(), 'account.suspended', 'profile', p_profile_id, null,
    jsonb_build_object('role', v_target.role::text, 'tenant_id', v_target.tenant_id)
  );
  return jsonb_build_object('profileId', p_profile_id, 'status', 'suspended');
end;
$$;
revoke all on function public.tenant_suspend_administrator(uuid)
  from public, anon, authenticated;
grant execute on function public.tenant_suspend_administrator(uuid) to authenticated;

create or replace function public.tenant_depart_administrator(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_target public.profiles;
begin
  select * into v_caller from public.profiles where id = auth.uid() and status = 'active';
  if v_caller.id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if v_caller.role <> 'tenant_admin' then
    raise exception 'Only an administrator can process departures.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();

  select * into v_target from public.profiles where id = p_profile_id for update;
  if v_target.id is null then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
  if v_target.id = v_caller.id then
    raise exception 'You cannot depart your own administrator account. Ask another administrator.'
      using errcode = '22023';
  end if;
  if v_caller.role = 'tenant_admin' and v_target.tenant_id is distinct from v_caller.tenant_id then
    raise exception 'You can only depart administrators within your tenant.' using errcode = '42501';
  end if;
  if v_target.role not in ('tenant_admin', 'school_admin', 'transportation_admin') then
    raise exception 'Only existing administrators can be departed here.' using errcode = '22023';
  end if;
  if v_target.status = 'disabled' then
    return jsonb_build_object(
      'profileId', p_profile_id, 'status', 'disabled', 'changed', false
    );
  end if;
  if v_target.role = 'tenant_admin' and v_target.status = 'active' then
    if public.count_active_tenant_admins(v_target.tenant_id) <= 1 then
      raise exception 'Cannot depart the final tenant administrator. Add another administrator first.'
        using errcode = '23001';
    end if;
  end if;

  update public.profiles set status = 'disabled' where id = p_profile_id;

  perform public.phase5_write_audit_event(
    auth.uid(), 'admin.departed', 'profile', p_profile_id, v_target.full_name,
    jsonb_build_object('previous_role', v_target.role::text, 'tenant_id', v_target.tenant_id)
  );

  return jsonb_build_object('profileId', p_profile_id, 'status', 'disabled');
end;
$$;

revoke all on function public.tenant_depart_administrator(uuid) from public, anon, authenticated;
grant execute on function public.tenant_depart_administrator(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Tenant-level audit search RPC
-- ---------------------------------------------------------------------------
-- Audit data can contain tenant-user labels and operational identifiers.
-- Remove the legacy platform/sub-administrator table policies and require MFA
-- for the tenant administrator's direct tenant-scoped view.
drop policy if exists "audit_events select tenant admin" on public.audit_events;
drop policy if exists "audit_events select school or transportation admin" on public.audit_events;
drop policy if exists "audit_events select platform super admin" on public.audit_events;
create policy "audit_events select tenant admin"
  on public.audit_events for select to authenticated
  using (
    public.is_tenant_admin()
    and public.has_verified_mfa()
    and tenant_id = public.current_tenant_id()
  );

create or replace function public.tenant_search_audit_events(
  p_action text default null,
  p_target_type text default null,
  p_actor_profile_id uuid default null,
  p_from_date timestamptz default null,
  p_to_date timestamptz default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  created_at timestamptz,
  actor_profile_id uuid,
  actor_email text,
  actor_role text,
  action text,
  target_type text,
  target_id uuid,
  target_label text,
  outcome text,
  detail jsonb,
  tenant_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid;
  v_max_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if public.is_tenant_admin() then
    v_tenant_id := public.current_tenant_id();
  else
    raise exception 'Only a tenant administrator can search tenant audit events.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();

  perform public.phase5_write_audit_event(
    auth.uid(), 'audit.searched', 'audit_events', null, null,
    jsonb_build_object(
      'filter_action', p_action,
      'filter_target_type', p_target_type,
      'filter_actor', p_actor_profile_id,
      'result_limit', v_max_limit
    )
  );

  return query
  select
    ae.id, ae.created_at, ae.actor_profile_id, ae.actor_email, ae.actor_role::text,
    ae.action, ae.target_type, ae.target_id, ae.target_label, ae.outcome, ae.detail,
    ae.tenant_id
  from public.audit_events ae
  where ae.tenant_id = v_tenant_id
    and (p_action is null or ae.action = p_action)
    and (p_target_type is null or ae.target_type = p_target_type)
    and (p_actor_profile_id is null or ae.actor_profile_id = p_actor_profile_id)
    and (p_from_date is null or ae.created_at >= p_from_date)
    and (p_to_date is null or ae.created_at <= p_to_date)
  order by ae.created_at desc
  limit v_max_limit
  offset v_offset;
end;
$$;

revoke all on function public.tenant_search_audit_events(text, text, uuid, timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.tenant_search_audit_events(text, text, uuid, timestamptz, timestamptz, integer, integer) to authenticated;

comment on function public.tenant_search_audit_events(text, text, uuid, timestamptz, timestamptz, integer, integer) is
  'Tenant-level audit search for the active tenant administrator. Platform personnel and sub-administrators are excluded.';
