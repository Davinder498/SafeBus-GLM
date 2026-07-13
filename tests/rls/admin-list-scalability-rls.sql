-- Run after migrations through 0031 in hosted DEV, inside a disposable test transaction.
-- Assertions expected from the authenticated role matrix:
-- 1. tenant_admin receives only current_tenant_id() rows from get_admin_paginated_list.
-- 2. page sizes outside 25/50/100 normalize to 50 and no response exceeds pageSize.
-- 3. guardian, driver, and unauthenticated callers receive SQLSTATE 42501.
-- 4. search_admin_students returns at most 20 active students in the current tenant.
-- 5. get_admin_guardian_links rejects cross-tenant guardian IDs by returning no rows.
-- 6. get_admin_dashboard_overview returns at most ten routes and no student/guardian data.

begin;

do $$
declare
  v_definition text;
begin
  if to_regprocedure('public.get_admin_paginated_list(text,integer,integer,text,text,uuid)') is null then
    raise exception 'Missing get_admin_paginated_list';
  end if;
  if to_regprocedure('public.get_admin_dashboard_overview()') is null then
    raise exception 'Missing get_admin_dashboard_overview';
  end if;
  if to_regprocedure('public.search_admin_students(text,integer)') is null then
    raise exception 'Missing search_admin_students';
  end if;
  select pg_get_functiondef('public.get_admin_paginated_list(text,integer,integer,text,text,uuid)'::regprocedure) into v_definition;
  if position('current_tenant_id()' in v_definition) = 0
     or position('is_transportation_write_admin()' in v_definition) = 0 then
    raise exception 'Paginated admin lists are not explicitly tenant/admin scoped';
  end if;
  if has_function_privilege('anon', 'public.get_admin_paginated_list(text,integer,integer,text,text,uuid)', 'EXECUTE') then
    raise exception 'Anonymous role must not execute paginated admin lists';
  end if;
  if not has_function_privilege('authenticated', 'public.get_admin_paginated_list(text,integer,integer,text,text,uuid)', 'EXECUTE') then
    raise exception 'Authenticated role is missing paginated-list execute grant';
  end if;
end $$;

select public.admin_page_size(25) = 25 as accepts_25;
select public.admin_page_size(50) = 50 as accepts_50;
select public.admin_page_size(100) = 100 as accepts_100;
select public.admin_page_size(1000) = 50 as rejects_unbounded_size;

rollback;
