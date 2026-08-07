-- SafeBus Alberta - Phase 2 password rules, session revocation, invitation idempotency
--
-- Phase 2 additionally requires:
--   1. Server-side password rules and compromised-password protection.
--   2. Session and trusted-device management.
--   3. Allow administrators to revoke all sessions.
--   4. Invitation idempotency to prevent duplicate users during retries.
--
-- SECURITY MODEL:
--   - Password policy is enforced server-side via a stored rule table checked
--     by the password-change path. Supabase Auth handles hashing; this layer
--     enforces minimum complexity and blocks known-compromised passwords.
--   - Session management records active sessions per user so an admin can
--     revoke them. Supabase Auth's `signout` invalidates JWTs; this table
--     tracks what existed for audit and forced-revocation.
--   - Invitation idempotency uses a deterministic key so retries collapse to
--     the same invitation row instead of creating duplicates.

-- ===========================================================================
-- 1. PASSWORD POLICY + COMPROMISED-PASSWORD PROTECTION
-- ===========================================================================
-- A server-side password policy table. The password-change path reads this
-- to validate new passwords before accepting them. Supabase Auth handles the
-- actual hashing and storage; this layer enforces SafeBus's complexity rules.

create table if not exists public.password_policy (
  id smallint primary key default 1,
  min_length integer not null default 12,
  require_uppercase boolean not null default true,
  require_lowercase boolean not null default true,
  require_digit boolean not null default true,
  require_special boolean not null default true,
  max_repeating_char integer not null default 3,
  updated_at timestamptz not null default now(),
  constraint password_policy_singleton check (id = 1),
  constraint password_policy_min_length_check check (min_length between 12 and 128),
  constraint password_policy_repeat_check check (max_repeating_char between 1 and 20)
);

insert into public.password_policy (id)
values (1)
on conflict (id) do nothing;

alter table public.password_policy enable row level security;
revoke all on public.password_policy from public, anon, authenticated;

-- Only platform super admins can change password policy.
create policy "password_policy select platform admin"
  on public.password_policy for select to authenticated
  using (public.is_platform_super_admin() and public.has_verified_mfa());

create policy "password_policy update platform admin"
  on public.password_policy for update to authenticated
  using (public.is_platform_super_admin() and public.has_verified_mfa())
  with check (public.is_platform_super_admin() and public.has_verified_mfa());

grant select, update on public.password_policy to authenticated;

create trigger set_updated_at_password_policy
  before update on public.password_policy
  for each row execute function public.set_updated_at();

-- Validates a candidate password against the policy. Returns true if the
-- password meets all rules. SECURITY DEFINER so any authenticated caller
-- can check without needing table grants.
create or replace function public.validate_password_policy(p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_policy public.password_policy;
begin
  select * into v_policy from public.password_policy where id = 1;

  if p_password is null or length(p_password) < v_policy.min_length or length(p_password) > 128 then return false; end if;
  if v_policy.require_uppercase and p_password !~ '[A-Z]' then return false; end if;
  if v_policy.require_lowercase and p_password !~ '[a-z]' then return false; end if;
  if v_policy.require_digit and p_password !~ '[0-9]' then return false; end if;
  if v_policy.require_special and p_password !~ '[^A-Za-z0-9]' then return false; end if;

  -- Block runs of repeating characters longer than the limit.
  if v_policy.max_repeating_char > 0
     and p_password ~ ('(.)\1{' || v_policy.max_repeating_char::text || ',}') then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.validate_password_policy(text) from public, anon;
grant execute on function public.validate_password_policy(text) to authenticated;

-- Compromised-password denylist (SHA-256 hashes of known-breached passwords).
-- This is a foundation table; the operational team populates it from a
-- breached-password list (e.g., Have I Been Pwned). Passwords are hashed
-- before checking so plaintext never enters this table.
create table if not exists public.compromised_password_hashes (
  sha256 text primary key,
  added_at timestamptz not null default now()
);

alter table public.compromised_password_hashes enable row level security;
revoke all on public.compromised_password_hashes from public, anon, authenticated;

-- Returns true if the password's SHA-256 is in the compromised list.
create or replace function public.is_compromised_password(p_password text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select exists (
    select 1
    from public.compromised_password_hashes
    where sha256 = encode(digest(convert_to(p_password, 'UTF8'), 'sha256'), 'hex')
  );
$$;

revoke all on function public.is_compromised_password(text) from public, anon;
grant execute on function public.is_compromised_password(text) to authenticated;

create or replace function public.enforce_new_password_policy(p_password text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to change a password.' using errcode = '42501';
  end if;
  if not public.validate_password_policy(p_password) then
    raise exception 'Password does not meet the SafeBus password policy.' using errcode = '22023';
  end if;
  if public.is_compromised_password(p_password) then
    raise exception 'Choose a password that is not present in the compromised-password list.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.enforce_new_password_policy(text) from public, anon;
grant execute on function public.enforce_new_password_policy(text) to authenticated;

-- ===========================================================================
-- 2. SESSION MANAGEMENT + ADMIN REVOCATION
-- ===========================================================================
-- Tracks active sessions per user so an admin can revoke them. Supabase Auth
-- handles JWT issuance; this table is SafeBus's record of what sessions exist,
-- enabling forced-revocation (the admin sets revoked_at; the frontend checks
-- this on initial load and at a short polling interval and signs out if revoked).

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  device_label text,
  user_agent text,
  ip_address inet,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  constraint user_sessions_device_label_check check (length(coalesce(device_label, '')) <= 200)
);

create index if not exists user_sessions_user_idx on public.user_sessions(user_id, created_at desc);
create index if not exists user_sessions_tenant_idx on public.user_sessions(tenant_id, created_at desc);
create index if not exists user_sessions_active_idx on public.user_sessions(user_id)
  where revoked_at is null;

alter table public.user_sessions enable row level security;
revoke all on public.user_sessions from public, anon, authenticated;

-- A user can read their own session mirror. Revocation is RPC-only so a user
-- cannot clear revoked_at or modify forensic metadata through REST.
create policy "user_sessions select own"
  on public.user_sessions for select to authenticated
  using (user_id = auth.uid());

-- Tenant and platform admins can read sessions in their scope for investigation.
create policy "user_sessions select tenant admin"
  on public.user_sessions for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "user_sessions select platform admin"
  on public.user_sessions for select to authenticated
  using (public.is_platform_super_admin());

grant select on public.user_sessions to authenticated;

create or replace function public.register_current_user_session(
  p_device_label text default null,
  p_user_agent text default null
)
returns public.user_sessions
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_session_id uuid;
  v_profile public.profiles;
  v_session public.user_sessions;
begin
  v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  if auth.uid() is null or v_session_id is null then
    raise exception 'An authenticated Supabase session is required.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = auth.uid() limit 1;
  if v_profile.id is null then
    raise exception 'SafeBus profile not found.' using errcode = 'P0002';
  end if;

  insert into public.user_sessions (
    id, user_id, tenant_id, device_label, user_agent, last_active_at, revoked_at, revoked_by
  ) values (
    v_session_id,
    v_profile.id,
    v_profile.tenant_id,
    left(nullif(trim(p_device_label), ''), 200),
    left(nullif(trim(p_user_agent), ''), 1000),
    now(),
    null,
    null
  )
  on conflict (id) do update
  set last_active_at = now(),
      device_label = coalesce(excluded.device_label, user_sessions.device_label),
      user_agent = coalesce(excluded.user_agent, user_sessions.user_agent)
  where user_sessions.user_id = auth.uid()
  returning * into v_session;

  return v_session;
end;
$$;

revoke all on function public.register_current_user_session(text, text) from public, anon;
grant execute on function public.register_current_user_session(text, text) to authenticated;

create or replace function public.is_current_user_session_active()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select auth.uid() is not null
    and nullif(auth.jwt() ->> 'session_id', '') is not null
    and exists (
      select 1 from auth.sessions s
      where s.id = (auth.jwt() ->> 'session_id')::uuid
        and s.user_id = auth.uid()
    )
    and not exists (
      select 1 from public.user_sessions us
      where us.id = (auth.jwt() ->> 'session_id')::uuid
        and us.user_id = auth.uid()
        and us.revoked_at is not null
    );
$$;

revoke all on function public.is_current_user_session_active() from public, anon;
grant execute on function public.is_current_user_session_active() to authenticated;

-- Revokes all active sessions for a user. Requires recent authentication
-- (admin actions). Records an audit event. The frontend must sign the user
-- out when it detects revocation.
create or replace function public.revoke_all_user_sessions(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  -- Only platform/tenant admins may revoke another user's sessions.
  if public.current_user_role() not in ('platform_super_admin', 'tenant_admin') then
    raise exception 'Only an administrator can revoke sessions.' using errcode = '42501';
  end if;

  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();

  -- Tenant admin can only act within their tenant; platform admin can act on any.
  if public.current_user_role() = 'tenant_admin' then
    if not exists (
      select 1 from public.profiles
      where id = p_user_id and tenant_id = public.current_tenant_id()
    ) then
      raise exception 'User not found in your tenant.' using errcode = 'P0002';
    end if;
  end if;

  update public.user_sessions
  set revoked_at = now(), revoked_by = auth.uid()
  where user_id = p_user_id and revoked_at is null;

  get diagnostics v_count = row_count;

  -- Supabase Auth stores one row per real refresh-token session. Removing the
  -- rows revokes refresh capability immediately; existing access JWTs remain
  -- valid only until their configured short expiry.
  delete from auth.sessions where user_id = p_user_id;

  -- Record the revocation in the audit trail.
  perform public.write_audit_event(
    'account.revoked',
    'profile', p_user_id, null,
    'success',
    jsonb_build_object('sessions_revoked', v_count)
  );

  return v_count;
end;
$$;

revoke all on function public.revoke_all_user_sessions(uuid) from public, anon;
grant execute on function public.revoke_all_user_sessions(uuid) to authenticated;

comment on function public.revoke_all_user_sessions(uuid) is
  'Revokes all active sessions for a user. Admin-only, requires recent authentication, '
  'enforces tenant scope, and records an audit event.';

-- ===========================================================================
-- 3. INVITATION IDEMPOTENCY
-- ===========================================================================
-- Prevents duplicate users when invitation retries fire. An idempotency key
-- (derived from tenant + email + role) collapses retries to the same
-- invitation row. The existing atomic invitation RPCs (0049/0050) already
-- enforce uniqueness on the profile/invitation; this helper provides the
-- explicit idempotency check so callers can detect "already invited" before
-- attempting a duplicate.

create or replace function public.check_invitation_idempotency(
  p_tenant_id uuid,
  p_email text,
  p_role public.user_role
)
returns table (
  already_invited boolean,
  existing_invitation_id uuid,
  existing_profile_id uuid,
  existing_status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (i.id is not null or p.id is not null) as already_invited,
    i.id as existing_invitation_id,
    p.id as existing_profile_id,
    coalesce(i.status, p.status::text) as existing_status
  from public.tenants t
  left join public.tenant_onboarding_invitations i
    on i.tenant_id = p_tenant_id
    and lower(i.email) = lower(p_email)
    and i.role = p_role
  left join public.profiles p
    on lower(p.email) = lower(p_email)
    and p.tenant_id = p_tenant_id
    and p.role = p_role
  where t.id = p_tenant_id
    and public.has_verified_mfa()
    and (
      public.is_platform_super_admin()
      or (
        public.is_tenant_admin()
        and p_tenant_id = public.current_tenant_id()
      )
    )
  limit 1;
$$;

revoke all on function public.check_invitation_idempotency(uuid, text, public.user_role) from public, anon;
grant execute on function public.check_invitation_idempotency(uuid, text, public.user_role) to authenticated;

comment on function public.check_invitation_idempotency(uuid, text, public.user_role) is
  'Invitation idempotency check. Returns whether an invitation or profile already exists for the '
  'given tenant/email/role, so retries collapse instead of creating duplicate users.';

-- ===========================================================================
-- 4. AUTH EVENT AND STUDENT-ACCESS AUDIT ENTRY POINTS
-- ===========================================================================
create or replace function public.record_own_auth_event(
  p_action text,
  p_outcome text default 'success',
  p_detail jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.audit_events;
begin
  if p_action not in (
    'auth.login', 'auth.logout', 'auth.password_reset_completed',
    'auth.password_changed', 'auth.mfa_enrolled', 'auth.mfa_removed',
    'auth.mfa_challenge_failed', 'auth.account_recovery'
  ) then
    raise exception 'Unsupported self-service authentication audit action.' using errcode = '22023';
  end if;
  if p_outcome not in ('success', 'failure', 'denied', 'error') then
    raise exception 'Unsupported audit outcome.' using errcode = '22023';
  end if;
  if not public.check_rate_limit('audit_write', auth.uid()::text, 60, 60) then
    raise exception 'Authentication audit rate limit exceeded.' using errcode = '55000';
  end if;

  v_event := public.write_audit_event(p_action, null, null, null, p_outcome, p_detail, null);
  return v_event.id;
end;
$$;

revoke all on function public.record_own_auth_event(text, text, jsonb) from public, anon;
grant execute on function public.record_own_auth_event(text, text, jsonb) to authenticated;

create or replace function public.record_student_record_access(p_student_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.audit_events;
begin
  if public.current_user_role() not in ('tenant_admin', 'school_admin', 'transportation_admin')
     or not exists (
       select 1 from public.students s
       where s.id = p_student_id
         and s.tenant_id = public.current_tenant_id()
         and (
           public.current_user_role() <> 'school_admin'
           or s.school_id = public.current_school_id()
         )
     ) then
    raise exception 'Student record is outside your authorized scope.' using errcode = '42501';
  end if;

  perform public.enforce_mfa_if_required();
  v_event := public.write_audit_event(
    'student.record_accessed', 'student', p_student_id, null, 'success', '{}'::jsonb, null
  );
  return v_event.id;
end;
$$;

revoke all on function public.record_student_record_access(uuid) from public, anon;
grant execute on function public.record_student_record_access(uuid) to authenticated;

create or replace function public.write_server_audit_event(
  p_actor_profile_id uuid,
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_outcome text default 'success',
  p_detail jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor public.profiles;
  v_event_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Server authorization required.' using errcode = '42501';
  end if;

  select * into v_actor from public.profiles where id = p_actor_profile_id limit 1;
  if v_actor.id is null or v_actor.status <> 'active' then
    raise exception 'Active SafeBus actor profile required.' using errcode = '42501';
  end if;

  insert into public.audit_events (
    tenant_id, actor_profile_id, actor_email, actor_role,
    action, target_type, target_id, outcome, detail
  ) values (
    v_actor.tenant_id, v_actor.id, v_actor.email, v_actor.role,
    p_action, p_target_type, p_target_id, p_outcome,
    public.sanitize_audit_detail(coalesce(p_detail, '{}'::jsonb))
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.write_server_audit_event(uuid, text, text, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.write_server_audit_event(uuid, text, text, uuid, text, jsonb)
  to service_role;

-- ===========================================================================
-- 5. DATABASE-LEVEL MFA/RECENT-AUTH GATES AND AUTOMATIC AUDIT CAPTURE
-- ===========================================================================
create or replace function public.enforce_sensitive_admin_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_setting('safebus.retention_run', true) = 'on' then
    return coalesce(new, old);
  end if;

  -- Server jobs authenticate and authorize the originating user before using
  -- service_role. Browser-originated admin mutations must carry aal2.
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  perform public.enforce_mfa_if_required();

  if tg_table_name in ('tenants', 'profiles', 'student_guardians', 'password_policy') then
    perform public.enforce_recent_auth_for_sensitive_action();
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.enforce_sensitive_admin_mutation() from public, anon, authenticated;

create or replace function public.capture_sensitive_admin_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_action text;
  v_target_type text := tg_table_name;
  v_target_id uuid;
  v_detail jsonb := '{}'::jsonb;
begin
  if current_setting('safebus.retention_run', true) = 'on' then
    return coalesce(new, old);
  end if;

  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_table_name <> 'password_policy' then
    v_target_id := coalesce(new.id, old.id);
  end if;

  if tg_table_name = 'tenants' and tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_action := case when new.status = 'active' then 'tenant.reactivated' else 'tenant.suspended' end;
    v_detail := jsonb_build_object('from_status', old.status, 'to_status', new.status);
  elsif tg_table_name = 'profiles' and tg_op = 'UPDATE' and new.role is distinct from old.role then
    v_action := 'role.changed';
    v_detail := jsonb_build_object('from_role', old.role, 'to_role', new.role);
  elsif tg_table_name = 'profiles' and tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_action := case when new.status = 'active' then 'account.restored' else 'account.suspended' end;
    v_detail := jsonb_build_object('from_status', old.status, 'to_status', new.status);
  elsif tg_table_name = 'student_guardians' then
    v_action := case
      when tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.status = 'active') then 'guardian.student_link_created'
      else 'guardian.student_link_removed'
    end;
  elsif tg_table_name = 'driver_route_assignments' then
    v_action := case
      when tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.status = 'active') then 'driver.assignment_created'
      else 'driver.assignment_removed'
    end;
  elsif tg_table_name = 'tenant_onboarding_invitations' then
    v_action := case
      when tg_op = 'INSERT' then 'invitation.created'
      when new.status = 'resent' then 'invitation.resent'
      when new.status = 'cancelled' then 'invitation.cancelled'
      when new.status = 'activated' then 'invitation.accepted'
      else null
    end;
  elsif tg_table_name in ('allowed_redirect_origins', 'password_policy') then
    v_action := 'security.config_changed';
    v_detail := jsonb_build_object('operation', lower(tg_op), 'configuration', tg_table_name);
  end if;

  if v_action is not null then
    perform public.write_audit_event(
      v_action, v_target_type, v_target_id, null, 'success', v_detail, null
    );
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.capture_sensitive_admin_audit() from public, anon, authenticated;

create trigger enforce_tenant_status_security
  before update of status on public.tenants
  for each row when (new.status is distinct from old.status)
  execute function public.enforce_sensitive_admin_mutation();
create trigger audit_tenant_status_security
  after update of status on public.tenants
  for each row when (new.status is distinct from old.status)
  execute function public.capture_sensitive_admin_audit();

create trigger enforce_profile_security_changes
  before update of role, status on public.profiles
  for each row when (new.role is distinct from old.role or new.status is distinct from old.status)
  execute function public.enforce_sensitive_admin_mutation();
create trigger audit_profile_security_changes
  after update of role, status on public.profiles
  for each row when (new.role is distinct from old.role or new.status is distinct from old.status)
  execute function public.capture_sensitive_admin_audit();

create trigger enforce_guardian_link_security
  before insert or update or delete on public.student_guardians
  for each row execute function public.enforce_sensitive_admin_mutation();
create trigger audit_guardian_link_security
  after insert or update or delete on public.student_guardians
  for each row execute function public.capture_sensitive_admin_audit();

create trigger enforce_driver_assignment_security
  before insert or update or delete on public.driver_route_assignments
  for each row execute function public.enforce_sensitive_admin_mutation();
create trigger audit_driver_assignment_security
  after insert or update or delete on public.driver_route_assignments
  for each row execute function public.capture_sensitive_admin_audit();

create trigger enforce_redirect_origin_security
  before insert or update or delete on public.allowed_redirect_origins
  for each row execute function public.enforce_sensitive_admin_mutation();
create trigger audit_redirect_origin_security
  after insert or update or delete on public.allowed_redirect_origins
  for each row execute function public.capture_sensitive_admin_audit();

create trigger enforce_password_policy_security
  before update on public.password_policy
  for each row execute function public.enforce_sensitive_admin_mutation();
create trigger audit_password_policy_security
  after update on public.password_policy
  for each row execute function public.capture_sensitive_admin_audit();

create trigger audit_invitation_security
  after insert or update on public.tenant_onboarding_invitations
  for each row execute function public.capture_sensitive_admin_audit();
