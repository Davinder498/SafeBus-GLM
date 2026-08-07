-- SafeBus Alberta - Hosted RLS execution-context reconciliation
--
-- Hosted DEV validation after 0072 confirmed that current_user_role() returns
-- the correct active platform role, including from a SECURITY DEFINER probe,
-- while the separate platform predicate still returned false from tenant RLS
-- and the retention runner. Keep one canonical profile-role lookup by routing
-- the boolean predicate through current_user_role().
--
-- The hosted audit table also lacked the table-level SELECT grant required for
-- its existing RLS SELECT policies to run. Restore SELECT only; browsers still
-- have no INSERT, UPDATE, or DELETE privilege and writes remain narrow-RPC only.

create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.current_user_role() = 'platform_super_admin'::public.user_role,
    false
  );
$$;

revoke all on function public.is_platform_super_admin() from public, anon;
grant execute on function public.is_platform_super_admin() to authenticated, service_role;

grant select on table public.audit_events to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.audit_events from authenticated;
revoke all on table public.audit_events from anon;

drop policy if exists "tenants select platform admin" on public.tenants;
create policy "tenants select platform admin"
  on public.tenants for select to authenticated
  using (
    coalesce(
      public.current_user_role() = 'platform_super_admin'::public.user_role,
      false
    )
  );

do $$
begin
  if not has_table_privilege('authenticated', 'public.audit_events', 'SELECT') then
    raise exception '0073 assertion failed: authenticated audit SELECT grant is missing.';
  end if;

  if has_table_privilege('authenticated', 'public.audit_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.audit_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.audit_events', 'DELETE') then
    raise exception '0073 assertion failed: browser audit mutation privilege exists.';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and policyname = 'tenants select platform admin'
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
  ) then
    raise exception '0073 assertion failed: tenant lifecycle policy is missing.';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'is_platform_super_admin'
      and p.prosecdef
  ) then
    raise exception '0073 assertion failed: platform predicate is not SECURITY DEFINER.';
  end if;
end
$$;

comment on function public.is_platform_super_admin() is
  'Returns true when the canonical active-profile role lookup resolves the authenticated user as platform_super_admin.';
