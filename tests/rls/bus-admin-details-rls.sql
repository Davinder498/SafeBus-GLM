-- Internal fleet-number authorization contract.
-- Run only in an approved isolated database after applying the fleet migration.
begin;

do $$
declare
  v_rls_enabled boolean;
  v_policy text;
  v_create_definer boolean;
  v_update_definer boolean;
  v_page_definer boolean;
begin
  if to_regclass('public.bus_admin_details') is null then
    raise exception 'TEST FAILED: bus_admin_details is missing';
  end if;

  select relrowsecurity into v_rls_enabled
  from pg_class
  where oid = 'public.bus_admin_details'::regclass;
  if not v_rls_enabled then
    raise exception 'TEST FAILED: bus_admin_details must have RLS enabled';
  end if;

  select lower(pg_get_expr(polqual, polrelid)) into v_policy
  from pg_policy
  where polrelid = 'public.bus_admin_details'::regclass
    and polcmd = 'r';

  if v_policy is null
    or position('tenant_admin' in v_policy) = 0
    or position('transportation_admin' in v_policy) = 0
    or position('school_admin' in v_policy) = 0
    or position('caller.tenant_id' in v_policy) = 0
    or position('bus.school_id' in v_policy) = 0
    or position('driver' in v_policy) > 0
    or position('guardian' in v_policy) > 0
    or position('platform_super_admin' in v_policy) > 0 then
    raise exception 'TEST FAILED: fleet-number read policy has an unsafe audience or scope';
  end if;

  if has_table_privilege('anon', 'public.bus_admin_details', 'SELECT')
    or has_table_privilege('authenticated', 'public.bus_admin_details', 'INSERT')
    or has_table_privilege('authenticated', 'public.bus_admin_details', 'UPDATE')
    or has_table_privilege('authenticated', 'public.bus_admin_details', 'DELETE') then
    raise exception 'TEST FAILED: fleet metadata has unsafe direct grants';
  end if;
  if not has_table_privilege('authenticated', 'public.bus_admin_details', 'SELECT') then
    raise exception 'TEST FAILED: scoped administrators need SELECT for RLS-protected reads';
  end if;
  if has_table_privilege('authenticated', 'public.buses', 'INSERT')
    or has_table_privilege('authenticated', 'public.buses', 'UPDATE') then
    raise exception 'TEST FAILED: direct bus writes bypass required fleet metadata';
  end if;

  select prosecdef into v_create_definer
  from pg_proc where oid = 'public.admin_create_bus(uuid,text,text,text,integer,text)'::regprocedure;
  select prosecdef into v_update_definer
  from pg_proc where oid = 'public.admin_update_bus(uuid,uuid,text,text,integer,text)'::regprocedure;
  select prosecdef into v_page_definer
  from pg_proc where oid = 'public.get_admin_buses_page(integer,integer,text,text,uuid)'::regprocedure;

  if not v_create_definer or not v_update_definer or v_page_definer then
    raise exception 'TEST FAILED: fleet-number RPC security modes are incorrect';
  end if;

  if has_function_privilege('anon', 'public.admin_create_bus(uuid,text,text,text,integer,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.admin_update_bus(uuid,uuid,text,text,integer,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.admin_create_bus(uuid,text,text,text,integer,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.admin_update_bus(uuid,uuid,text,text,integer,text)', 'EXECUTE') then
    raise exception 'TEST FAILED: fleet-number mutation RPC grants are incorrect';
  end if;
end $$;

rollback;
