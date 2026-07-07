-- SafeBus Alberta - RLS Regression Tests: Guardian Visibility
--
-- Milestone 5A.2: manual database/RLS regression tests for the guardian
-- student route visibility RPC and guardian-scoped student_guardians SELECT.
--
-- HOW TO RUN:
--   1. Run the seed section in tests/rls/student-roster-rls.sql first.
--   2. Run this file, or run each test transaction in order.
--   3. Run the cleanup section in tests/rls/student-roster-rls.sql when done.
--   4. Do not run against production.
--
-- Each simulated user assertion runs inside its own explicit transaction with
-- transaction-local role/JWT settings and rollback. The tests set both
-- request.jwt.claim.sub/request.jwt.claim.role and legacy JSON
-- request.jwt.claims, then assert auth.uid() before checking RLS behavior.

-- ===========================================================================
-- TEST 1: Guardian A sees exactly the actively linked active student via RPC
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000004';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
declare
  v_student_ids uuid[];
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000004'::uuid then
    raise exception 'TEST 1 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 1 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select coalesce(array_agg(student_id order by student_id), array[]::uuid[])
  into v_student_ids
  from public.get_guardian_student_route_visibility();

  if v_student_ids <> array['e5000000-0000-0000-0000-000000000001'::uuid] then
    raise exception 'TEST 1 FAILED: unexpected Guardian A RPC rows: %', v_student_ids;
  end if;

  raise notice 'TEST 1 PASSED: Guardian A RPC returned exactly the active linked student';
end
$$;
rollback;

-- ===========================================================================
-- TEST 2: Guardian A RPC excludes inactive, unlinked, cross-tenant, Guardian B
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000004';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
declare
  v_hidden_ids uuid[];
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000004'::uuid then
    raise exception 'TEST 2 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 2 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select coalesce(array_agg(student_id order by student_id), array[]::uuid[])
  into v_hidden_ids
  from public.get_guardian_student_route_visibility()
  where student_id in (
    'e5000000-0000-0000-0000-000000000002',
    'e5000000-0000-0000-0000-000000000003',
    'e5000000-0000-0000-0000-000000000004',
    'e5000000-0000-0000-0000-000000000005'
  );

  if v_hidden_ids <> array[]::uuid[] then
    raise exception 'TEST 2 FAILED: Guardian A saw hidden RPC rows: %', v_hidden_ids;
  end if;

  raise notice 'TEST 2 PASSED: Guardian A RPC excludes all hidden students';
end
$$;
rollback;

-- ===========================================================================
-- TEST 3: Guardian B sees exactly Guardian B's actively linked student
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000006';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000006","role":"authenticated"}';
do $$
declare
  v_student_ids uuid[];
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000006'::uuid then
    raise exception 'TEST 3 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 3 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select coalesce(array_agg(student_id order by student_id), array[]::uuid[])
  into v_student_ids
  from public.get_guardian_student_route_visibility();

  if v_student_ids <> array['e5000000-0000-0000-0000-000000000005'::uuid] then
    raise exception 'TEST 3 FAILED: unexpected Guardian B RPC rows: %', v_student_ids;
  end if;

  raise notice 'TEST 3 PASSED: Guardian B RPC returned exactly Guardian B linked student';
end
$$;
rollback;

-- ===========================================================================
-- TEST 4: Driver CANNOT use guardian visibility RPC
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000005';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000005","role":"authenticated"}';
do $$
declare
  v_student_ids uuid[];
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000005'::uuid then
    raise exception 'TEST 4 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'driver' then
    raise exception 'TEST 4 FAILED: expected driver, got %', public.current_user_role();
  end if;

  select coalesce(array_agg(student_id order by student_id), array[]::uuid[])
  into v_student_ids
  from public.get_guardian_student_route_visibility();

  if v_student_ids <> array[]::uuid[] then
    raise exception 'TEST 4 FAILED: driver got guardian RPC rows: %', v_student_ids;
  end if;

  raise notice 'TEST 4 PASSED: driver gets no rows from guardian RPC';
end
$$;
rollback;

-- ===========================================================================
-- TEST 5: Tenant admin CANNOT use guardian RPC as broad roster query
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_student_ids uuid[];
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 5 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 5 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  select coalesce(array_agg(student_id order by student_id), array[]::uuid[])
  into v_student_ids
  from public.get_guardian_student_route_visibility();

  if v_student_ids <> array[]::uuid[] then
    raise exception 'TEST 5 FAILED: tenant_admin got guardian RPC rows: %', v_student_ids;
  end if;

  raise notice 'TEST 5 PASSED: tenant_admin gets no rows from guardian RPC';
end
$$;
rollback;

-- ===========================================================================
-- TEST 6: Guardian A sees exact own student_guardians link IDs/count
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000004';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
declare
  v_link_ids uuid[];
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000004'::uuid then
    raise exception 'TEST 6 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 6 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select coalesce(array_agg(id order by id), array[]::uuid[])
  into v_link_ids
  from public.student_guardians;

  if v_link_ids <> array[
    'f6000000-0000-0000-0000-000000000001'::uuid,
    'f6000000-0000-0000-0000-000000000002'::uuid
  ] then
    raise exception 'TEST 6 FAILED: unexpected Guardian A student_guardians rows: %', v_link_ids;
  end if;

  raise notice 'TEST 6 PASSED: Guardian A sees exactly own active and inactive links';
end
$$;
rollback;

-- ===========================================================================
-- TEST 7: Guardian A CANNOT read Guardian B's student_guardians link
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000004';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000004'::uuid then
    raise exception 'TEST 7 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 7 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select count(*)
  into v_count
  from public.student_guardians
  where id = 'f6000000-0000-0000-0000-000000000003';

  if v_count <> 0 then
    raise exception 'TEST 7 FAILED: Guardian A saw Guardian B link count %', v_count;
  end if;

  raise notice 'TEST 7 PASSED: Guardian A cannot read Guardian B link';
end
$$;
rollback;
