-- SafeBus Alberta - manual RLS regression tests for migration 0042
--
-- DEV/STAGING ONLY. Apply migrations through 0042, then run the SEED block
-- from student-roster-rls.sql before this file. Every write test rolls back.

-- Fail fast with a useful message when the shared RLS fixtures were not
-- seeded. The RPC intentionally returns no tenant context for an unknown,
-- inactive, or tenant-less profile.
do $$
begin
  if not exists (
    select 1
    from public.profiles p
    join public.tenants t on t.id = p.tenant_id
    where p.id = 'c3000000-0000-0000-0000-000000000001'
      and p.role = 'tenant_admin'
      and p.status = 'active'
      and t.id = 'a1000000-0000-0000-0000-000000000001'
      and t.status = 'active'
  ) then
    raise exception
      'ONBOARDING TEST SETUP MISSING: run lines 21-144 of tests/rls/student-roster-rls.sql in hosted Supabase DEV, then rerun this file.';
  end if;

  if not exists (
    select 1 from public.schools
    where id = 'b2000000-0000-0000-0000-000000000001'
      and tenant_id = 'a1000000-0000-0000-0000-000000000001'
      and status = 'active'
  ) or not exists (
    select 1 from public.guardians
    where id = 'd4000000-0000-0000-0000-000000000001'
      and tenant_id = 'a1000000-0000-0000-0000-000000000001'
      and status = 'active'
  ) then
    raise exception
      'ONBOARDING TEST FIXTURES INCOMPLETE: rerun lines 21-144 of tests/rls/student-roster-rls.sql in hosted Supabase DEV.';
  end if;
end
$$;

-- Tenant admin can create the complete workflow atomically.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_result jsonb;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid
     or public.current_user_role() <> 'tenant_admin'
     or public.current_tenant_id() <> 'a1000000-0000-0000-0000-000000000001'::uuid then
    raise exception
      'TEST 1 SETUP FAILED: uid=%, role=%, tenant=%. Rerun the shared seed.',
      auth.uid(), public.current_user_role(), public.current_tenant_id();
  end if;

  v_result := public.admin_create_student_onboarding(
    jsonb_build_object(
      'student', jsonb_build_object(
        'firstName', 'RLS_Onboarding',
        'lastName', 'Complete',
        'grade', '5',
        'schoolId', 'b2000000-0000-0000-0000-000000000001'
      ),
      'guardian', jsonb_build_object(
        'id', 'd4000000-0000-0000-0000-000000000001',
        'relationship', 'guardian'
      ),
      'transportation', jsonb_build_object(
        'enabled', true,
        'route', jsonb_build_object(
          'name', 'RLS Onboarding Route',
          'code', 'RLS-ONBOARD-42',
          'type', 'morning'
        ),
        'bus', jsonb_build_object(
          'number', 'RLS-ONBOARD-42',
          'licensePlate', 'RLS42',
          'capacity', '48'
        ),
        'pickupStop', jsonb_build_object(
          'mode', 'new',
          'name', 'RLS Community Centre',
          'plannedTime', '07:30'
        ),
        'dropoffStop', jsonb_build_object(
          'mode', 'new',
          'name', 'RLS Test School',
          'plannedTime', '08:00'
        ),
        'tripType', 'morning',
        'effectiveFrom', current_date::text
      )
    )
  );

  if v_result->>'studentId' is null
     or v_result->>'guardianLinkId' is null
     or v_result->>'routeId' is null
     or v_result->>'busId' is null
     or v_result->>'studentBusAssignmentId' is null
     or v_result->>'pickupStopId' is null
     or v_result->>'dropoffStopId' is null then
    raise exception 'TEST 1 FAILED: incomplete onboarding result: %', v_result;
  end if;

  if not exists (
    select 1
    from public.student_bus_assignments sba
    join public.bus_route_assignments bra on bra.id = sba.bus_route_assignment_id
    where sba.id = (v_result->>'studentBusAssignmentId')::uuid
      and sba.tenant_id = public.current_tenant_id()
      and bra.tenant_id = public.current_tenant_id()
  ) then
    raise exception 'TEST 1 FAILED: tenant-scoped bus assignment missing';
  end if;

  raise notice 'TEST 1 PASSED: complete onboarding created atomically';
end
$$;
rollback;

-- Cross-tenant school input is rejected and the student insert is rolled back.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_before bigint;
  v_after bigint;
begin
  select count(*) into v_before
  from public.students
  where tenant_id = public.current_tenant_id()
    and first_name = 'RLS_Onboarding_CrossTenant';

  begin
    perform public.admin_create_student_onboarding(
      jsonb_build_object(
        'student', jsonb_build_object(
          'firstName', 'RLS_Onboarding_CrossTenant',
          'lastName', 'Blocked',
          'schoolId', 'b2000000-0000-0000-0000-000000000002'
        ),
        'guardian', jsonb_build_object('id', null),
        'transportation', jsonb_build_object('enabled', false)
      )
    );
    raise exception 'TEST 2 FAILED: cross-tenant school was accepted';
  exception
    when others then
      if sqlerrm not like '%School not found in your tenant%' then
        raise exception 'TEST 2 FAILED with unexpected error: %', sqlerrm;
      end if;
  end;

  select count(*) into v_after
  from public.students
  where tenant_id = public.current_tenant_id()
    and first_name = 'RLS_Onboarding_CrossTenant';
  if v_after <> v_before then
    raise exception 'TEST 2 FAILED: partial student row was saved';
  end if;
  raise notice 'TEST 2 PASSED: cross-tenant school blocked without partial writes';
end
$$;
rollback;

-- A guardian cannot call the tenant-admin onboarding RPC.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000004';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
begin
  begin
    perform public.admin_create_student_onboarding(
      jsonb_build_object(
        'student', jsonb_build_object('firstName', 'Blocked', 'lastName', 'Guardian'),
        'guardian', jsonb_build_object('id', null),
        'transportation', jsonb_build_object('enabled', false)
      )
    );
    raise exception 'TEST 3 FAILED: guardian called tenant-admin RPC';
  exception
    when others then
      if sqlerrm not like '%Only a tenant administrator%' then
        raise exception 'TEST 3 FAILED with unexpected error: %', sqlerrm;
      end if;
  end;
  raise notice 'TEST 3 PASSED: guardian blocked from onboarding RPC';
end
$$;
rollback;

-- A transportation admin also cannot use this tenant-admin-only workflow.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
begin
  begin
    perform public.admin_create_student_onboarding(
      jsonb_build_object(
        'student', jsonb_build_object('firstName', 'Blocked', 'lastName', 'TransportationAdmin'),
        'guardian', jsonb_build_object('id', null),
        'transportation', jsonb_build_object('enabled', false)
      )
    );
    raise exception 'TEST 4 FAILED: transportation admin called tenant-admin RPC';
  exception
    when others then
      if sqlerrm not like '%Only a tenant administrator%' then
        raise exception 'TEST 4 FAILED with unexpected error: %', sqlerrm;
      end if;
  end;
  raise notice 'TEST 4 PASSED: transportation admin blocked from tenant-admin workflow';
end
$$;
rollback;

-- Search endpoints require tenant-admin context and return bounded results.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.search_admin_guardians('RLS Test', 500);
  if v_count < 1 or v_count > 50 then
    raise exception 'TEST 5 FAILED: guardian search result count was %', v_count;
  end if;
  raise notice 'TEST 5 PASSED: guardian search is tenant-scoped and capped';
end
$$;
rollback;
