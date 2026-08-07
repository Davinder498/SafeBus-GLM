-- SafeBus Alberta - Phase 2 MFA enforcement, recent authentication, and
-- invitation redirect allowlist
--
-- Phase 2 requires:
--   1. MFA enforcement for platform/tenant/school/transportation admins.
--      Supabase Auth provides MFA factors (auth.mfa_factors) and AAL
--      (auth.mfa_claims). This migration adds server-side gating functions
--      that sensitive RPCs call before proceeding.
--   2. Recent-authentication requirements for security-sensitive actions
--      (role changes, tenant suspension, data exports, account revocation,
--      guardian access assignment). Uses auth.users.last_sign_in_at.
--   3. Invitation redirect allowlist. Stop trusting arbitrary origins.
--   4. Rate-limit foundation via a per-actor action counter table.
--
-- SECURITY MODEL:
--   - MFA and recent-auth helpers are STABLE SQL functions read by gated RPCs.
--   - No service-role keys or secrets are introduced.
--   - All enforcement is server-side; the browser cannot bypass it because
--     gated RPCs are SECURITY DEFINER and check before mutating.

-- ===========================================================================
-- 1. MFA ENFORCEMENT HELPERS
-- ===========================================================================
-- Supabase Auth signs the current authenticator assurance level into the JWT.
-- The JWT is the server-authoritative proof that this session completed an MFA
-- challenge; browser callers cannot forge it.

-- Returns true only when the current Supabase session is AAL2.
create or replace function public.has_verified_mfa()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- Returns true if the authenticated user is permitted to perform
-- administrative actions that require MFA. Platform super admins must have
-- MFA (phishing-resistant preferred, enforced operationally); tenant, school,
-- and transportation admins must have MFA. Drivers and guardians are not
-- gated by this function (they do not perform admin actions).
create or replace function public.requires_mfa_for_admin_action()
returns boolean
language sql
stable
as $$
  select public.current_user_role() in (
    'platform_super_admin', 'tenant_admin', 'school_admin', 'transportation_admin'
  );
$$;

-- Gate: raises if MFA is required and not present. Gated RPCs call this first.
create or replace function public.enforce_mfa_if_required()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.requires_mfa_for_admin_action() and not public.has_verified_mfa() then
    raise exception 'Multi-factor authentication is required for this administrative action.'
      using errcode = '55006';
  end if;
end;
$$;

-- ===========================================================================
-- 2. RECENT-AUTHENTICATION GATE
-- ===========================================================================
-- Sensitive actions (role changes, tenant suspension, data exports, account
-- revocation, guardian access assignment) require the caller to have
-- authenticated recently (within the configured window). This mitigates
-- session-hijack impact: even with a stolen session, the attacker cannot
-- perform these actions without a fresh login.

-- Default recent-auth window: 15 minutes. Overridable by config in a later
-- migration; hardcoded here for the foundation.
create or replace function public.recent_auth_window_seconds()
returns integer
language sql
stable
as $$
  select 900;
$$;

-- Returns true if the authenticated user signed in within the recent-auth
-- window. Uses auth.users.last_sign_in_at, which Supabase updates on each
-- successful sign-in.
create or replace function public.has_recent_authentication()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and u.last_sign_in_at is not null
      and u.last_sign_in_at >= now() - make_interval(secs => public.recent_auth_window_seconds())
  );
$$;

-- Gate: raises if recent authentication is required and absent.
-- Actions gated: role changes, tenant suspension, data exports, account
-- revocation, guardian access assignment.
create or replace function public.enforce_recent_auth_for_sensitive_action()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_recent_authentication() then
    raise exception 'Recent authentication is required for this sensitive action. Please sign in again.'
      using errcode = '55006';
  end if;
end;
$$;

-- ===========================================================================
-- 3. INVITATION REDIRECT ALLOWLIST
-- ===========================================================================
-- Phase 2: stop trusting arbitrary request origins for invitation redirects.
-- Use a configured allowlist of SafeBus domains.
--
-- The allowlist is stored in a small config table so it can be updated without
-- a migration. Each tenant can have its own allowed redirect origins, plus
-- platform-level defaults.

create table if not exists public.allowed_redirect_origins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  origin text not null,
  created_at timestamptz not null default now(),
  constraint allowed_redirect_origins_origin_check check (
    origin = lower(origin)
    and origin ~ '^((https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]+)?)|(http://(localhost|127\.0\.0\.1)(:[0-9]+)?))$'
  )
);

-- Platform-level default origins have tenant_id = null.
-- Tenant-level origins scope to a specific tenant.
create unique index if not exists allowed_redirect_origins_tenant_origin_unique
  on public.allowed_redirect_origins (coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), origin);

alter table public.allowed_redirect_origins enable row level security;
revoke all on public.allowed_redirect_origins from public, anon, authenticated;

-- Only platform super admins and tenant admins may manage/read allowlist.
create policy "allowed_redirect_origins select platform admin"
  on public.allowed_redirect_origins for select to authenticated
  using (public.is_platform_super_admin());

create policy "allowed_redirect_origins select tenant admin"
  on public.allowed_redirect_origins for select to authenticated
  using (
    public.is_tenant_admin()
    and (tenant_id = public.current_tenant_id() or tenant_id is null)
  );

create policy "allowed_redirect_origins insert platform admin"
  on public.allowed_redirect_origins for insert to authenticated
  with check (public.is_platform_super_admin() and public.has_verified_mfa());

create policy "allowed_redirect_origins update platform admin"
  on public.allowed_redirect_origins for update to authenticated
  using (public.is_platform_super_admin() and public.has_verified_mfa())
  with check (public.is_platform_super_admin() and public.has_verified_mfa());

create policy "allowed_redirect_origins delete platform admin"
  on public.allowed_redirect_origins for delete to authenticated
  using (public.is_platform_super_admin() and public.has_verified_mfa());

create policy "allowed_redirect_origins insert tenant admin"
  on public.allowed_redirect_origins for insert to authenticated
  with check (
    public.is_tenant_admin()
    and public.has_verified_mfa()
    and tenant_id = public.current_tenant_id()
  );

create policy "allowed_redirect_origins update tenant admin"
  on public.allowed_redirect_origins for update to authenticated
  using (
    public.is_tenant_admin()
    and public.has_verified_mfa()
    and tenant_id = public.current_tenant_id()
  )
  with check (
    public.is_tenant_admin()
    and public.has_verified_mfa()
    and tenant_id = public.current_tenant_id()
  );

create policy "allowed_redirect_origins delete tenant admin"
  on public.allowed_redirect_origins for delete to authenticated
  using (
    public.is_tenant_admin()
    and public.has_verified_mfa()
    and tenant_id = public.current_tenant_id()
  );

grant select, insert, update, delete on public.allowed_redirect_origins to authenticated;

-- Validates a redirect target against the allowlist. Returns true if the
-- origin is explicitly allowed for the caller's tenant (or is a platform default).
create or replace function public.is_allowed_redirect_origin(p_origin text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.allowed_redirect_origins aro
    where aro.origin = p_origin
      and (
        aro.tenant_id is null
        or aro.tenant_id = public.current_tenant_id()
      )
  );
$$;

revoke all on function public.is_allowed_redirect_origin(text) from public, anon;
grant execute on function public.is_allowed_redirect_origin(text) to authenticated;

comment on function public.is_allowed_redirect_origin(text) is
  'Validates an invitation/password-reset redirect origin against the SafeBus domain allowlist. '
  'Platform defaults (tenant_id NULL) and tenant-specific origins are both accepted. '
  'Arbitrary origins are rejected.';

-- ===========================================================================
-- 4. RATE-LIMIT FOUNDATION (per-actor action counter)
-- ===========================================================================
-- A lightweight per-actor, per-action, time-windowed counter. Sensitive
-- endpoints (login, invitation, password-reset, onboarding) check this before
-- proceeding. This is a database-level foundation; Supabase Auth / Netlify
-- edge rate-limiting can supplement it.

create table if not exists public.rate_limit_buckets (
  id uuid primary key default gen_random_uuid(),
  bucket_key text not null,
  actor_identifier text not null,
  action text not null,
  window_start timestamptz not null default now(),
  count integer not null default 1,
  constraint rate_limit_buckets_action_check check (
    action in ('login', 'invitation', 'password_reset', 'onboarding', 'audit_write')
  )
);

create unique index if not exists rate_limit_buckets_key_action_actor_window_unique
  on public.rate_limit_buckets (bucket_key, action, actor_identifier, window_start);

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from public, anon, authenticated;

-- Check-and-increment: returns true if the action is within the limit, false
-- if rate-limited. SECURITY DEFINER so it can write the counter row.
-- bucket_key lets callers partition (e.g. by IP + action).
create or replace function public.check_rate_limit(
  p_action text,
  p_actor_identifier text,
  p_max integer default 10,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_actor_hash text;
  v_bucket text;
  v_count integer;
begin
  if p_action not in ('login', 'invitation', 'password_reset', 'onboarding', 'audit_write')
     or nullif(trim(p_actor_identifier), '') is null
     or p_max < 1 or p_max > 10000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit parameters.' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  v_actor_hash := md5(p_actor_identifier);
  v_bucket := p_action || ':' || left(v_actor_hash, 16) || ':' || extract(epoch from v_window_start)::bigint::text;

  insert into public.rate_limit_buckets (bucket_key, action, actor_identifier, window_start, count)
  values (v_bucket, p_action, v_actor_hash, v_window_start, 1)
  on conflict (bucket_key, action, actor_identifier, window_start)
  do update set count = rate_limit_buckets.count + 1
  returning count into v_count;

  if v_count > p_max then
    -- Record the rate-limit event in audit (best-effort, no failure if audit fails).
    begin
      if auth.uid() is not null then
        perform public.write_audit_event(
          'rate_limit.exceeded',
          null, null, null,
          'denied',
          jsonb_build_object('action', p_action, 'count', v_count, 'max', p_max),
          null
        );
      end if;
    exception when others then null;
    end;
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, text, integer, integer) from public, anon;
grant execute on function public.check_rate_limit(text, text, integer, integer) to authenticated;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;

comment on function public.check_rate_limit(text, text, integer, integer) is
  'Per-actor, per-action, time-windowed rate limiter. Returns true if within limit, false if exceeded. '
  'Records rate-limit denials in the audit trail.';

-- Audit data is a security-investigation surface. Admin SELECT therefore
-- requires the same aal2 session as other administrative capabilities.
drop policy if exists "audit_events select tenant admin" on public.audit_events;
create policy "audit_events select tenant admin"
  on public.audit_events for select to authenticated
  using (
    public.is_tenant_admin()
    and public.has_verified_mfa()
    and tenant_id = public.current_tenant_id()
  );

drop policy if exists "audit_events select school or transportation admin" on public.audit_events;
create policy "audit_events select school or transportation admin"
  on public.audit_events for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and public.has_verified_mfa()
    and tenant_id = public.current_tenant_id()
  );

drop policy if exists "audit_events select platform super admin" on public.audit_events;
create policy "audit_events select platform super admin"
  on public.audit_events for select to authenticated
  using (public.is_platform_super_admin() and public.has_verified_mfa());
