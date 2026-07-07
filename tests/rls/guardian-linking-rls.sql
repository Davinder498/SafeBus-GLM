-- SafeBus Alberta - RLS Regression Tests: Guardian-Student Linking
--
-- Milestone 5B fix: tests for admin_link_student_guardian() and
-- admin_deactivate_student_guardian() RPCs and student_guardians write RLS.
--
-- HOW TO RUN:
--   1. First run the SEED block from student-roster-rls.sql to set up test data.
--   2. Then run each test block below.
--   3. Run the CLEANUP block from student-roster-rls.sql when done.
--
-- These tests are MANUAL — they require a live Supabase database with all
-- SafeBus migrations (0001-0019) applied.

-- ===========================================================================
-- TEST 1: Tenant admin CAN link student and guardian in own tenant
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

do $$
begin
  perform public.admin_link_student_guardian(
    'e5000000-0000-0000-0000-000000000001',  -- student_A1 in Tenant A
    'd4000000-0000-0000-0000-000000000001'   -- guardian_A in Tenant A
  );
  raise notice 'TEST 1 PASSED: tenant_admin can link same-tenant student+guardian';
exception
  when others then
    raise exception 'TEST 1 FAILED: %', sqlerrm;
end
$$;

-- Cleanup: deactivate the link we just created
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';
delete from public.student_guardians where student_id = 'e5000000-0000-0000-0000-000000000001' and guardian_id = 'd4000000-0000-0000-0000-000000000001' and status = 'active' and id != 'f6000000-0000-0000-0000-000000000001';

-- ===========================================================================
-- TEST 2: Tenant admin CANNOT link own-tenant guardian to other-tenant student
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

do $$
begin
  perform public.admin_link_student_guardian(
    'e5000000-0000-0000-0000-000000000002',  -- student_B1 in Tenant B
    'd4000000-0000-0000-0000-000000000001'   -- guardian_A in Tenant A
  );
  raise exception 'TEST 2 FAILED: tenant_admin should NOT link other-tenant student';
exception
  when others then
    if sqlerrm like '%Student not found%' then
      raise notice 'TEST 2 PASSED: tenant_admin blocked from other-tenant student';
    else
      raise exception 'TEST 2 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;

-- ===========================================================================
-- TEST 3: Tenant admin CANNOT link other-tenant guardian to own-tenant student
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

do $$
begin
  perform public.admin_link_student_guardian(
    'e5000000-0000-0000-0000-000000000001',  -- student_A1 in Tenant A
    'd4000000-0000-0000-0000-000000000002'   -- a guardian ID that doesn't exist in Tenant A
  );
  raise exception 'TEST 3 FAILED: tenant_admin should NOT link other-tenant guardian';
exception
  when others then
    if sqlerrm like '%Guardian not found%' then
      raise notice 'TEST 3 PASSED: tenant_admin blocked from other-tenant guardian';
    else
      raise exception 'TEST 3 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;

-- ===========================================================================
-- TEST 4: Guardian CANNOT call admin_link_student_guardian
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000004';

do $$
begin
  perform public.admin_link_student_guardian(
    'e5000000-0000-0000-0000-000000000001',
    'd4000000-0000-0000-0000-000000000001'
  );
  raise exception 'TEST 4 FAILED: guardian should NOT call admin_link RPC';
exception
  when others then
    if sqlerrm like '%Only an admin%' then
      raise notice 'TEST 4 PASSED: guardian blocked from admin_link RPC';
    else
      raise exception 'TEST 4 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;

-- ===========================================================================
-- TEST 5: Driver CANNOT call admin_link_student_guardian
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000005';

do $$
begin
  perform public.admin_link_student_guardian(
    'e5000000-0000-0000-0000-000000000001',
    'd4000000-0000-0000-0000-000000000001'
  );
  raise exception 'TEST 5 FAILED: driver should NOT call admin_link RPC';
exception
  when others then
    if sqlerrm like '%Only an admin%' then
      raise notice 'TEST 5 PASSED: driver blocked from admin_link RPC';
    else
      raise exception 'TEST 5 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;

-- ===========================================================================
-- TEST 6: Direct INSERT to student_guardians is blocked (RPC-only writes)
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

do $$
begin
  insert into public.student_guardians (tenant_id, student_id, guardian_id, relationship, status)
  values ('a1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'guardian', 'active');
  raise exception 'TEST 6 FAILED: direct INSERT should be blocked';
exception
  when others then
    if sqlerrm like '%permission denied%' or sqlerrm like '%row-level security%' then
      raise notice 'TEST 6 PASSED: direct INSERT blocked by RLS';
    else
      raise exception 'TEST 6 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;

-- ===========================================================================
-- TEST 7: Direct UPDATE to student_guardians is blocked (RPC-only writes)
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

do $$
declare
  v_count int;
begin
  update public.student_guardians set status = 'inactive' where id = 'f6000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise exception 'TEST 7 FAILED: direct UPDATE should be blocked';
  else
    raise notice 'TEST 7 PASSED: direct UPDATE blocked (0 rows affected)';
  end if;
end
$$;

-- ===========================================================================
-- TEST 8: Duplicate active links are prevented
-- ===========================================================================
-- First, ensure the active link exists via RPC
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

-- The seed already has an active link f6000000... for student_A1 + guardian_A.
-- Try to link the same pair again.
do $$
begin
  perform public.admin_link_student_guardian(
    'e5000000-0000-0000-0000-000000000001',
    'd4000000-0000-0000-0000-000000000001'
  );
  raise exception 'TEST 8 FAILED: duplicate active link should be prevented';
exception
  when others then
    if sqlerrm like '%already linked%' then
      raise notice 'TEST 8 PASSED: duplicate active link prevented';
    else
      raise exception 'TEST 8 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;

-- ===========================================================================
-- TEST 9: Inactive same-tenant link CAN be reactivated
-- ===========================================================================
-- Deactivate the existing link first, then try to re-link.
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

do $$
begin
  -- Deactivate via RPC
  perform public.admin_deactivate_student_guardian('f6000000-0000-0000-0000-000000000001');
  -- Now re-link (should reactivate)
  perform public.admin_link_student_guardian(
    'e5000000-0000-0000-0000-000000000001',
    'd4000000-0000-0000-0000-000000000001'
  );
  raise notice 'TEST 9 PASSED: inactive link reactivated successfully';
exception
  when others then
    raise exception 'TEST 9 FAILED: %', sqlerrm;
end
$$;

-- ===========================================================================
-- TEST 10: Guardian visibility RPC still scoped (unchanged)
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
    raise exception 'TEST 10 FAILED: guardian should see at least 1 linked student';
  else
    raise notice 'TEST 10 PASSED: guardian sees % linked student(s)', v_count;
  end if;
end
$$;

-- ===========================================================================
-- TEST 11: Cross-tenant inactive link CANNOT be reactivated
-- ===========================================================================
-- Setup: use postgres role to create an inactive link row in Tenant B for
-- student_B1 + guardian_A (a mismatched-tenant row). Then switch to
-- tenant_admin_A and try to reactivate it via the RPC. The RPC's tenant
-- filter on the existing-link lookup should NOT find this row (it belongs to
-- Tenant B), so it would attempt an INSERT which would hit the unique
-- constraint — but student_B1 is not in Tenant A, so the student validation
-- should reject it first.
set local role to 'postgres';
set local request.jwt.claims.role to '';
set local request.jwt.claims.sub to '';

-- Clean up any prior test row
delete from public.student_guardians
where student_id = 'e5000000-0000-0000-0000-000000000002'
  and guardian_id = 'd4000000-0000-0000-0000-000000000001';

-- Create the mismatched-tenant inactive link
insert into public.student_guardians (tenant_id, student_id, guardian_id, relationship, status)
values ('a1000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000001', 'guardian', 'inactive')
on conflict do nothing;

-- Now switch to tenant_admin_A and try to link guardian_A to student_B1
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

do $$
begin
  perform public.admin_link_student_guardian(
    'e5000000-0000-0000-0000-000000000002',  -- student_B1 (Tenant B)
    'd4000000-0000-0000-0000-000000000001'   -- guardian_A (Tenant A)
  );
  raise exception 'TEST 11 FAILED: should not reactivate cross-tenant link';
exception
  when others then
    if sqlerrm like '%Student not found%' then
      raise notice 'TEST 11 PASSED: cross-tenant link reactivation blocked (student not in tenant)';
    else
      raise exception 'TEST 11 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;

-- Cleanup the mismatched test row
set local role to 'postgres';
set local request.jwt.claims.role to '';
set local request.jwt.claims.sub to '';
delete from public.student_guardians
where student_id = 'e5000000-0000-0000-0000-000000000002'
  and guardian_id = 'd4000000-0000-0000-0000-000000000001';

-- ===========================================================================
-- TEST 12: Guardian CANNOT call admin_deactivate_student_guardian
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000004';

do $$
begin
  perform public.admin_deactivate_student_guardian('f6000000-0000-0000-0000-000000000001');
  raise exception 'TEST 12 FAILED: guardian should NOT call admin_deactivate RPC';
exception
  when others then
    if sqlerrm like '%Only an admin%' then
      raise notice 'TEST 12 PASSED: guardian blocked from admin_deactivate RPC';
    else
      raise exception 'TEST 12 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;

-- ===========================================================================
-- TEST 13: Driver CANNOT call admin_deactivate_student_guardian
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000005';

do $$
begin
  perform public.admin_deactivate_student_guardian('f6000000-0000-0000-0000-000000000001');
  raise exception 'TEST 13 FAILED: driver should NOT call admin_deactivate RPC';
exception
  when others then
    if sqlerrm like '%Only an admin%' then
      raise notice 'TEST 13 PASSED: driver blocked from admin_deactivate RPC';
    else
      raise exception 'TEST 13 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;
