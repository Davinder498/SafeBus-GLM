-- SafeBus Alberta - Phase 2 append-only audit system
--
-- Phase 2 requires an append-only audit system for:
--   - Authentication events
--   - Invitations
--   - Role changes
--   - Guardian/student links
--   - Driver assignments
--   - Student record access
--   - Data exports
--   - Tenant suspension
--   - Security configuration changes
--
-- Audit events identify WHO, WHAT, WHEN, TENANT, TARGET, and OUTCOME without
-- recording secrets or unnecessary student data.
--
-- SECURITY MODEL:
--   - INSERT-only via a SECURITY DEFINER RPC that derives actor identity from
--     auth.uid(). No UPDATE or DELETE policy is ever created on this table.
--   - SELECT is tenant-scoped for tenant admins (their own audit trail) and
--     platform-scoped for platform super admins (security investigations only).
--   - The table stores no secrets, no message bodies, and no health data.
--   - Retention is governed by Phase 3; Phase 2 records only.
--
-- This is intentionally the first Phase 2 migration because later MFA,
-- rate-limit, and invitation-allowlist migrations record into this table.

-- ---------------------------------------------------------------------------
-- Table: audit_events
-- ---------------------------------------------------------------------------
create or replace function public.sanitize_audit_detail(p_value jsonb)
returns jsonb
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_child jsonb;
  v_result jsonb;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      v_result := '{}'::jsonb;
      for v_key, v_child in select key, value from jsonb_each(p_value)
      loop
        if lower(v_key) !~ '(password|secret|api.?key|service.?role|token|authorization|cookie|credential)' then
          v_result := v_result || jsonb_build_object(v_key, public.sanitize_audit_detail(v_child));
        end if;
      end loop;
      return v_result;
    when 'array' then
      select coalesce(jsonb_agg(public.sanitize_audit_detail(value)), '[]'::jsonb)
      into v_result
      from jsonb_array_elements(p_value);
      return v_result;
    else
      return p_value;
  end case;
end;
$$;

revoke all on function public.sanitize_audit_detail(jsonb) from public, anon, authenticated;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  actor_role public.user_role,
  action text not null,
  target_type text,
  target_id uuid,
  target_label text,
  outcome text not null default 'success',
  detail jsonb not null default '{}'::jsonb,
  ip_address inet,
  created_at timestamptz not null default now(),
  constraint audit_events_action_check check (
    action in (
      'auth.login', 'auth.logout', 'auth.password_reset_requested',
      'auth.password_reset_completed', 'auth.password_changed',
      'auth.mfa_enrolled', 'auth.mfa_removed', 'auth.mfa_challenge_failed',
      'auth.account_recovery', 'auth.recent_auth_required',
      'invitation.created', 'invitation.resent', 'invitation.cancelled',
      'invitation.accepted', 'invitation.password_activated', 'invitation.redirect_blocked',
      'role.changed', 'role.escalation_blocked',
      'guardian.student_link_created', 'guardian.student_link_removed',
      'driver.assignment_created', 'driver.assignment_removed',
      'student.record_accessed',
      'data.exported',
      'tenant.suspended', 'tenant.reactivated',
      'account.revoked', 'account.suspended', 'account.restored',
      'security.config_changed',
      'rate_limit.exceeded',
      'retention.deletion_run'
    )
  ),
  constraint audit_events_outcome_check check (
    outcome in ('success', 'failure', 'denied', 'error')
  ),
  constraint audit_events_detail_size_check check (octet_length(detail::text) <= 8192),
  constraint audit_events_target_label_size_check check (length(coalesce(target_label, '')) <= 300),
  constraint audit_events_no_secret_keys check (public.sanitize_audit_detail(detail) = detail)
);

create index if not exists audit_events_tenant_created_idx
  on public.audit_events (tenant_id, created_at desc);
create index if not exists audit_events_actor_idx
  on public.audit_events (actor_profile_id, created_at desc);
create index if not exists audit_events_action_idx
  on public.audit_events (action, created_at desc);
create index if not exists audit_events_target_idx
  on public.audit_events (target_type, target_id, created_at desc)
  where target_id is not null;

alter table public.audit_events enable row level security;

revoke all on public.audit_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- INSERT RPC: append-only audit writer. No UPDATE/DELETE policy is ever
-- created on this table, so RLS makes it append-only for all authenticated
-- callers. The RPC is SECURITY DEFINER so it can insert regardless of the
-- caller's table-level grants; it derives actor identity from auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.write_audit_event(
  p_action text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_target_label text default null,
  p_outcome text default 'success',
  p_detail jsonb default '{}'::jsonb,
  p_ip_address inet default null
)
returns public.audit_events
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.audit_events;
  v_profile public.profiles;
  v_sanitized_detail jsonb;
begin
  -- Derive actor identity from the authenticated user only.
  select * into v_profile
  from public.profiles
  where id = auth.uid()
  limit 1;

  if v_profile.id is null then
    -- Unauthenticated callers cannot write audit events.
    raise exception 'Authentication is required to write an audit event.'
      using errcode = '42501';
  end if;

  -- Sanitize detail recursively: strip any key whose name looks like a secret.
  -- Defense-in-depth on top of the CHECK constraint.
  v_sanitized_detail := public.sanitize_audit_detail(coalesce(p_detail, '{}'::jsonb));

  insert into public.audit_events (
    tenant_id, actor_profile_id, actor_email, actor_role,
    action, target_type, target_id, target_label, outcome,
    detail, ip_address
  )
  values (
    v_profile.tenant_id, v_profile.id, v_profile.email, v_profile.role,
    p_action, p_target_type, p_target_id, p_target_label, p_outcome,
    coalesce(v_sanitized_detail, '{}'::jsonb), p_ip_address
  )
  returning * into v_event;

  return v_event;
end;
$$;

revoke all on function public.write_audit_event(
  text, text, uuid, text, text, jsonb, inet
) from public, anon, authenticated;

comment on function public.write_audit_event(
  text, text, uuid, text, text, jsonb, inet
) is
  'Internal append-only audit writer used by trusted RPCs and triggers. SECURITY DEFINER derives actor identity from auth.uid(); browsers cannot invoke it directly. Detail is recursively sanitized to strip secret-like keys.';

-- ---------------------------------------------------------------------------
-- SELECT policies: tenant-scoped for tenant admins, platform-scoped for
-- platform super admins (security investigation only). Drivers and guardians
-- do not read audit events.
-- ---------------------------------------------------------------------------
create policy "audit_events select tenant admin"
  on public.audit_events for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "audit_events select school or transportation admin"
  on public.audit_events for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "audit_events select platform super admin"
  on public.audit_events for select to authenticated
  using (public.is_platform_super_admin());

-- Grant SELECT so the RLS SELECT policies above are effective. Without this
-- table-level grant, the RLS policies cannot return rows even when they match.
grant select on public.audit_events to authenticated;

-- No INSERT policy on the table itself: writes go exclusively through the
-- SECURITY DEFINER RPC, which is the only path that can insert.
-- No UPDATE policy, ever. No DELETE policy, ever.

comment on table public.audit_events is
  'Append-only security audit trail. Records who, what, when, tenant, target, '
  'and outcome for sensitive administrative and authentication actions. No '
  'secrets, message bodies, or health data are stored. Writes are RPC-only; '
  'the table has no UPDATE or DELETE policy.';
