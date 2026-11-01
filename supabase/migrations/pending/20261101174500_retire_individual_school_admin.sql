-- SafeBus School District-only role model. PREPARED / NOT APPLIED.
-- District is the tenant; individual schools are optional reference records.
-- Keep the historical enum label for existing rows, migration replay and audit.
-- DO NOT auto-promote school_admin accounts to district-level privileges.
-- Adoption requires protected migration authorization, isolated multi-role
-- RLS tests, audit review and a rollback plan.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
begin
  if to_regprocedure('safebus_private.current_user_role()') is null then
    raise exception 'Approved private role helper baseline is required.';
  end if;
  if to_regclass('public.profiles') is null
    or to_regclass('public.tenant_onboarding_invitations') is null then
    raise exception 'SafeBus account and invitation tables are required.';
  end if;
end;
$$;

-- Immediately suspend legacy active/invited individual-school accounts.
-- This never changes their role, tenant or school and never grants privileges.
update public.profiles
set status = 'suspended'
where role::text = 'school_admin' and status::text in ('active', 'invited');

-- Retire pending legacy invitations without deleting any audit/history.
update public.tenant_onboarding_invitations
set status = 'revoked'
where role::text = 'school_admin'
  and status in ('queued', 'pending', 'resent', 'failed');

-- Extra defense: even if another privileged function interprets the legacy
-- enum as an admin role, the central helper must not return it as authorized.
create or replace function safebus_private.current_user_role()
returns public.user_role
language sql stable security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
  select p.role
  from public.profiles p
  left join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid()
    and p.status = 'active'
    and p.role::text <> 'school_admin'
    and (p.role = 'platform_super_admin' or t.status = 'active')
    and public.is_current_user_session_active()
  limit 1;
$$;

-- Guard the actual persisted roles, including direct calls to existing
-- SECURITY DEFINER onboarding RPCs. Legacy suspended/disabled rows remain
-- editable for audit/recovery, but can never become active/invited again.
create or replace function safebus_private.prevent_individual_school_admin()
returns trigger
language plpgsql security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.role::text = 'school_admin' then
    if tg_op = 'INSERT' then
      raise exception 'Individual-school administration is retired. Only district administrators are supported.'
        using errcode = '42501';
    end if;
    if old.role is distinct from new.role
       or new.status::text in ('active', 'invited') then
      raise exception 'Individual-school administration is retired. Existing accounts cannot be reactivated.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_individual_school_admin on public.profiles;
create trigger prevent_individual_school_admin
  before insert or update on public.profiles
  for each row execute function safebus_private.prevent_individual_school_admin();

-- Also reject any new (or reactivated) invitations for this retired role.
create or replace function safebus_private.prevent_individual_school_invitation()
returns trigger
language plpgsql security invoker
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.role::text = 'school_admin' then
    if tg_op = 'INSERT' then
      raise exception 'Individual-school administrator invitations are retired.'
        using errcode = '42501';
    end if;
    if old.role is distinct from new.role
       or new.status in ('queued', 'pending', 'resent', 'failed') then
      raise exception 'Individual-school administrator invitations cannot be activated.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_individual_school_invitation on public.tenant_onboarding_invitations;
create trigger prevent_individual_school_invitation
  before insert or update on public.tenant_onboarding_invitations
  for each row execute function safebus_private.prevent_individual_school_invitation();

-- No browser needs direct execution of these internal trigger functions.
revoke all on function safebus_private.prevent_individual_school_admin()
  from public, anon, authenticated;
revoke all on function safebus_private.prevent_individual_school_invitation()
  from public, anon, authenticated;

notify pgrst, 'reload schema';
