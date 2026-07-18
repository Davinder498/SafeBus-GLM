-- HOSTED DEV / disposable QA tenant only. Never run in production.
-- Replace the UUID below with the target QA tenant, then run in a transaction first.
-- This creates 10,000 synthetic students without addresses, health data, or Alberta Student Numbers.

do $$
declare
  v_tenant uuid := '00000000-0000-0000-0000-000000000000';
begin
  if v_tenant = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Set v_tenant to a disposable hosted DEV tenant before running';
  end if;
  if not exists (select 1 from public.tenants where id = v_tenant) then
    raise exception 'QA tenant does not exist';
  end if;

  insert into public.students (tenant_id, first_name, last_name, preferred_name, grade, status)
  select v_tenant, 'QA' || n::text, 'ScaleStudent' || lpad(n::text, 5, '0'), null,
    ((n % 13) + 1)::text, 'active'
  from generate_series(1, 10000) n
  where not exists (
    select 1
    from public.students s
    where s.tenant_id = v_tenant
      and s.last_name = 'ScaleStudent' || lpad(n::text, 5, '0')
  );
end $$;

-- Suggested checks (run with EXPLAIN (ANALYZE, BUFFERS)):
-- select public.get_admin_paginated_list('students', 1, 50, 'ScaleStudent', 'active', null);
-- select public.get_admin_dashboard_overview();
