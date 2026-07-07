-- SafeBus Alberta - RLS Regression Tests: Guardian Visibility
--
-- Milestone 5A.2: Database/RLS regression test for guardian student route
-- visibility RPC and RLS policies.
--
-- HOW TO RUN:
--   1. First run the SEED block from student-roster-rls.sql to set up test data.
--   2. Then run each test block below.
--   3. Run the CLEANUP block from student-roster-rls.sql when done.
--
-- These tests are MANUAL — they require a live Supabase database.
--
-- TEST MODEL:
--   - Guardian_A is linked to Student_A1 (active link) in Tenant A
--   - Guardian_A has an inactive link to Student_B1 (Tenant B, but the link
--     was created in Tenant A — this simulates a deactivated link)
--   - Student_A1 is in Tenant A; Student_B1 is in Tenant B
--   - The get_guardian_student_route_visibility() RPC should return only
--     Student_A1 for Guardian_A.

-- ===========================================================================
-- TEST 1: Guardian CAN see actively linked student via RPC
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000004';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.get_guardian_student_route_visibility();
  if v_count < 1 then
    raise exception 'TEST 1 FAILED: guardian should see at least 1 linked student via RPC. Got: %', v_count;
  else
    raise notice 'TEST 1 PASSED: guardian sees % linked student(s) via RPC', v_count;
  end if;
end
$$;

-- ===========================================================================
-- TEST 2: Guardian sees ONLY actively linked students (not inactive links)
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000004';

do $$
declare
  v_result record;
  v_count int;
begin
  -- The RPC should return only Student_A1 (active link), not Student_B1
  -- (inactive link in Tenant A).
  select count(*) into v_count from public.get_guardian_student_route_visibility()
  where student_id = 'e5000000-0000-0000-0000-000000000002';
  if v_count > 0 then
    raise exception 'TEST 2 FAILED: guardian should NOT see student from inactive link';
  else
    raise notice 'TEST 2 PASSED: guardian does not see inactive-link student';
  end if;
end
$$;

-- ===========================================================================
-- TEST 3: Guardian CANNOT see students from another tenant via RPC
-- ===========================================================================
-- The RPC filters by current_tenant_id(), so a guardian in Tenant A should
-- never see Tenant B students.
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000004';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.get_guardian_student_route_visibility()
  where student_id = 'e5000000-0000-0000-0000-000000000002';
  if v_count > 0 then
    raise exception 'TEST 3 FAILED: guardian should NOT see cross-tenant student via RPC';
  else
    raise notice 'TEST 3 PASSED: guardian does not see cross-tenant student via RPC';
  end if;
end
$$;

-- ===========================================================================
-- TEST 4: Driver CANNOT use guardian visibility RPC
-- ===========================================================================
-- The RPC checks current_user_role() = 'guardian'. A driver should get 0 rows.
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000005';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.get_guardian_student_route_visibility();
  if v_count > 0 then
    raise exception 'TEST 4 FAILED: driver should NOT get results from guardian RPC. Got: %', v_count;
  else
    raise notice 'TEST 4 PASSED: driver gets 0 rows from guardian RPC';
  end if;
end
$$;

-- ===========================================================================
-- TEST 5: Tenant admin CANNOT use guardian RPC as a broad roster query
-- ===========================================================================
-- The RPC checks current_user_role() = 'guardian'. A tenant admin should get
-- 0 rows (the function returns nothing for non-guardian roles).
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.get_guardian_student_route_visibility();
  if v_count > 0 then
    raise exception 'TEST 5 FAILED: tenant_admin should NOT get results from guardian RPC. Got: %', v_count;
  else
    raise notice 'TEST 5 PASSED: tenant_admin gets 0 rows from guardian RPC';
  end if;
end
$$;

-- ===========================================================================
-- TEST 6: Guardian CAN read own student_guardians links (active + inactive)
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000004';

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.student_guardians
  where guardian_id = 'd4000000-0000-0000-0000-000000000001';
  if v_count < 2 then
    raise exception 'TEST 6 FAILED: guardian should see own active + inactive links. Got: %', v_count;
  else
    raise notice 'TEST 6 PASSED: guardian sees % own link(s)', v_count;
  end if;
end
$$;

-- ===========================================================================
-- TEST 7: Guardian CANNOT read other guardian's student_guardians links
-- ===========================================================================
-- Create a second guardian with a link, then verify Guardian_A cannot see it.
-- (Requires a second guardian — this test uses a subquery to check RLS scoping.)
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000004';

do $$
declare
  v_count int;
begin
  -- Guardian_A should only see links where guardian_id = their own guardian id.
  -- Any link not belonging to them should be invisible.
  select count(*) into v_count from public.student_guardians
  where guardian_id != 'd4000000-0000-0000-0000-000000000001';
  if v_count > 0 then
    raise exception 'TEST 7 FAILED: guardian should NOT see other guardian''s links. Got: %', v_count;
  else
    raise notice 'TEST 7 PASSED: guardian sees 0 links belonging to other guardians';
  end if;
end
$$;
