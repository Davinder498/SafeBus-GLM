-- Execute ONLY against an approved non-production SafeBus database AFTER applying
-- pending/20261101174500_retire_individual_school_admin.sql.
-- Structural assertions are not a substitute for authenticated, MFA-backed
-- district A vs district B role-isolation tests.
do $$
declare
  v_role_definition text;
  v_guard_definition text;
begin
  select pg_get_functiondef('safebus_private.current_user_role()'::regprocedure)
    into v_role_definition;
  select pg_get_functiondef('safebus_private.prevent_individual_school_admin()'::regprocedure)
    into v_guard_definition;

  if position('p.role::text <> ''school_admin''' in v_role_definition) = 0 then
    raise exception 'Legacy school-admin role is authorized by the role helper';
  end if;
  if position('old.role is distinct from new.role' in lower(v_guard_definition)) = 0
     or position('new.status::text in (''active'', ''invited'')' in lower(v_guard_definition)) = 0 then
    raise exception 'Legacy roles can be created or reactivated';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.profiles'::regclass
      and tgname='prevent_individual_school_admin'
      and tgenabled <> 'D'
  ) then
    raise exception 'Legacy admin profile guard is missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.tenant_onboarding_invitations'::regclass
      and tgname='prevent_individual_school_invitation'
      and tgenabled <> 'D'
  ) then
    raise exception 'Legacy invitation guard is missing';
  end if;
  if exists (
    select 1 from public.profiles
    where role::text='school_admin' and status::text in ('active','invited')
  ) then
    raise exception 'Unretired active/invited school administrator found';
  end if;
  if exists (
    select 1 from public.tenant_onboarding_invitations
    where role::text='school_admin' and status in ('queued','pending','resent','failed')
  ) then
    raise exception 'Unretired school-admin invitation found';
  end if;
  raise notice 'PASS: legacy school administration is retired structurally';
end;
$$;
