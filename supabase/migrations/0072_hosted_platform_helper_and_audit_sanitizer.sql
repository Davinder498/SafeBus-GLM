-- SafeBus Alberta - Hosted platform helper and audit sanitizer reconciliation
--
-- Hosted DEV validation found two older/partial definitions:
--   1. sanitize_audit_detail(jsonb) was absent.
--   2. Platform identity resolved correctly at the caller, but the legacy
--      invoker helper failed when nested inside tenant RLS and the retention
--      SECURITY DEFINER function.
--
-- Restore the recursive sanitizer and make the platform-role predicate a
-- direct SECURITY DEFINER lookup. The predicate still requires the exact
-- authenticated profile id, platform_super_admin role, and active status.

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
          v_result := v_result || jsonb_build_object(
            v_key,
            public.sanitize_audit_detail(v_child)
          );
        end if;
      end loop;
      return v_result;
    when 'array' then
      select coalesce(
        jsonb_agg(public.sanitize_audit_detail(value)),
        '[]'::jsonb
      )
      into v_result
      from jsonb_array_elements(p_value);
      return v_result;
    else
      return p_value;
  end case;
end;
$$;

revoke all on function public.sanitize_audit_detail(jsonb)
  from public, anon, authenticated;

-- If the older hosted audit table lacks the defensive constraint, enforce it
-- for all new/changed rows without rejecting the migration because of legacy
-- rows that still require a separate review.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.audit_events'::regclass
      and conname = 'audit_events_no_secret_keys'
  ) then
    alter table public.audit_events
      add constraint audit_events_no_secret_keys
      check (public.sanitize_audit_detail(detail) = detail)
      not valid;
  end if;
end
$$;

create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'platform_super_admin'
      and p.status = 'active'
  );
$$;

do $$
begin
  if to_regprocedure('public.sanitize_audit_detail(jsonb)') is null then
    raise exception '0072 assertion failed: audit sanitizer is missing.';
  end if;

  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'is_platform_super_admin'
      and p.prosecdef
  ) then
    raise exception '0072 assertion failed: platform predicate is not SECURITY DEFINER.';
  end if;
end
$$;

comment on function public.sanitize_audit_detail(jsonb) is
  'Internal recursive sanitizer that removes secret-like JSON keys before audit persistence.';

comment on function public.is_platform_super_admin() is
  'Returns true only for the active authenticated profile whose exact role is platform_super_admin; SECURITY DEFINER makes nested RLS/RPC evaluation deterministic.';
