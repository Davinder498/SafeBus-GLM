-- SafeBus Alberta - manual RLS regression tests for migration 0043
--
-- DEV/STAGING ONLY. Apply migrations through 0043, then run the SEED block
-- from student-roster-rls.sql before this file. Every write test rolls back.

-- Tenant admin can maintain same-tenant driver compliance details.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$
declare
  v_driver public.drivers;
begin
  update public.drivers
  set
    phone = '780-555-0142',
    license_number = 'RLS-AB-0043',
    license_issue_date = date '2025-01-01',
    license_expiry_date = date '2030-01-01',
    license_class = '2',
    address_line1 = '100 Test Avenue',
    city = 'Edmonton',
    province = 'AB',
    postal_code = 'T5J 0N3'
  where id = 'd4000000-0000-0000-0000-000000000002'
  returning * into v_driver;

  if v_driver.id is null
     or v_driver.tenant_id <> public.current_tenant_id()
     or v_driver.license_number <> 'RLS-AB-0043' then
    raise exception 'TEST 1 FAILED: same-tenant driver update was not saved';
  end if;
  raise notice 'TEST 1 PASSED: tenant admin maintained driver compliance details';
end
$$;
rollback;

-- Guardians cannot enumerate driver directory or compliance data.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"c3000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.drivers;
  if v_count <> 0 then
    raise exception 'TEST 2 FAILED: guardian saw % driver records', v_count;
  end if;
  raise notice 'TEST 2 PASSED: guardian cannot enumerate driver records';
end
$$;
rollback;

-- A driver can see only their own record under the existing RLS policy.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"c3000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.drivers
  where profile_id = auth.uid();
  if v_count <> 1 then
    raise exception 'TEST 3 FAILED: driver own-record count was %', v_count;
  end if;
  if exists (
    select 1 from public.drivers where profile_id <> auth.uid()
  ) then
    raise exception 'TEST 3 FAILED: driver saw another driver record';
  end if;
  raise notice 'TEST 3 PASSED: driver visibility remains self-only';
end
$$;
rollback;

-- The retired student school number can no longer store a value.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
do $$
begin
  begin
    update public.students
    set school_student_number = 'BLOCKED-0043'
    where id = 'e5000000-0000-0000-0000-000000000001';
    raise exception 'TEST 4 FAILED: retired school number accepted a value';
  exception
    when check_violation then
      if sqlerrm not like '%students_school_student_number_retired_check%' then
        raise exception 'TEST 4 FAILED with unexpected constraint error: %', sqlerrm;
      end if;
  end;
  raise notice 'TEST 4 PASSED: retired school number storage is blocked';
end
$$;
rollback;
