-- Run only after 0121 has been approved/applied through the protected release.
-- No fixtures, record changes, schema changes, or external effects.
begin transaction read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';

do $$
begin
  if not exists (
    select 1 from pg_proc
    where oid = 'public.search_admin_trips(date,date,text,integer,integer)'::regprocedure
      and not prosecdef and provolatile = 's'
  ) then raise exception 'FAIL: search must be stable and security invoker'; end if;
  if has_function_privilege('anon', 'public.search_admin_trips(date,date,text,integer,integer)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.search_admin_trips(date,date,text,integer,integer)', 'EXECUTE') then
    raise exception 'FAIL: search has an unexpected audience';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.search_admin_trips();
    raise exception 'FAIL: missing identity was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Simulate existing active identities only, transaction-locally. Validate each
-- result against the caller-visible RLS relations and explicit school scope.
do $$
declare
  v_profile record;
  v_result jsonb;
  v_date date;
  v_tested integer := 0;
begin
  for v_profile in
    select distinct on (p.role, p.tenant_id, p.school_id)
      p.id, p.role, p.tenant_id, p.school_id
    from public.profiles p join public.tenants t on t.id = p.tenant_id
    where p.status = 'active' and t.status = 'active'
      and p.role in ('tenant_admin', 'school_admin', 'transportation_admin', 'driver', 'guardian')
    order by p.role, p.tenant_id, p.school_id, p.id limit 12
  loop
    perform set_config('request.jwt.claim.sub', v_profile.id::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object(
      'sub', v_profile.id, 'role', 'authenticated', 'aal', 'aal2'
    )::text, true);
    execute 'set local role authenticated';
    if v_profile.role in ('driver', 'guardian') then
      begin
        perform public.search_admin_trips();
        raise exception 'FAIL: non-admin identity was accepted';
      exception when insufficient_privilege then null;
      end;
    else
      v_result := public.search_admin_trips();
      if jsonb_array_length(v_result->'rows') > 25 or (v_result->>'totalCount')::bigint < 0 then
        raise exception 'FAIL: unbounded or invalid search result';
      end if;
      if exists (
        select 1 from jsonb_array_elements(v_result->'rows') item
        where not exists (
          select 1 from public.driver_trips dt join public.routes r
            on r.id = dt.route_id and r.tenant_id = dt.tenant_id
          where dt.id = (item->>'trip_id')::uuid and dt.tenant_id = v_profile.tenant_id
            and (v_profile.role <> 'school_admin' or r.school_id = v_profile.school_id)
        )
      ) then raise exception 'FAIL: result escaped caller RLS or tenant/school scope'; end if;
      if (v_result->>'totalCount')::bigint > (
        select count(*) from public.driver_trips dt join public.routes r
          on r.id = dt.route_id and r.tenant_id = dt.tenant_id
        where dt.tenant_id = v_profile.tenant_id
          and dt.status in ('active','paused','completed','cancelled')
          and (v_profile.role <> 'school_admin' or r.school_id = v_profile.school_id)
      ) then raise exception 'FAIL: total count escaped caller scope'; end if;
      select min(dt.service_date) into v_date from public.driver_trips dt
        where dt.tenant_id = v_profile.tenant_id;
      if v_date is not null then
        v_result := public.search_admin_trips(v_date, v_date, null, 1, 25);
        if exists (select 1 from jsonb_array_elements(v_result->'rows') item
          where (item->>'service_date')::date <> v_date) then
          raise exception 'FAIL: historical date filter';
        end if;
      end if;
      begin
        perform public.search_admin_trips(date '2026-01-02', date '2026-01-01');
        raise exception 'FAIL: reversed range was accepted';
      exception when invalid_parameter_value then null;
      end;
    end if;
    execute 'reset role';
    v_tested := v_tested + 1;
  end loop;
  if v_tested = 0 then raise exception 'FAIL: no active identities available for verification'; end if;
  raise notice 'PASS: % existing role/scope samples checked; coverage depends on available identities', v_tested;
end $$;

rollback;
