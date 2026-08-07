-- SafeBus Alberta - Phase 0-3 hosted DEV validation reconciliation
--
-- Forward-only correction for schema/ACL drift discovered while executing the
-- Phase 1-3 RLS regressions against hosted Supabase DEV. This migration:
--   1. Restores the platform control-plane tenant lifecycle read policy.
--   2. Reasserts that the generic audit writer is internal-only.
--
-- It does not grant platform access to profiles or operational data and does
-- not weaken tenant, guardian, driver, MFA, or retention boundaries.

-- Platform super administrators require tenant lifecycle metadata for the
-- control plane. SELECT remains RLS-protected; operational table policies are
-- intentionally not restored.
grant select on table public.tenants to authenticated;

drop policy if exists "tenants select platform admin" on public.tenants;
create policy "tenants select platform admin"
  on public.tenants for select to authenticated
  using (public.is_platform_super_admin());

-- Browsers must use narrow, purpose-specific wrappers such as
-- record_own_auth_event(). The generic SECURITY DEFINER writer is used only by
-- trusted functions/triggers and must never be directly executable through
-- the authenticated or anonymous API roles.
revoke all on function public.write_audit_event(
  text, text, uuid, text, text, jsonb, inet
) from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and policyname = 'tenants select platform admin'
      and cmd = 'SELECT'
      and roles @> array['authenticated']::name[]
  ) then
    raise exception '0070 assertion failed: platform tenant lifecycle policy is missing.';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.write_audit_event(text,text,uuid,text,text,jsonb,inet)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.write_audit_event(text,text,uuid,text,text,jsonb,inet)',
    'EXECUTE'
  ) then
    raise exception '0070 assertion failed: generic audit writer is browser-executable.';
  end if;
end
$$;

comment on function public.write_audit_event(
  text, text, uuid, text, text, jsonb, inet
) is
  'Internal append-only audit writer. Browser roles have no EXECUTE privilege; use narrow audited wrappers.';
