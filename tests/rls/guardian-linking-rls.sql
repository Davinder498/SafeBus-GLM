-- SafeBus Alberta - RLS Regression Tests: Guardian-Student Linking
--
-- Milestone 5B fix: tests for admin_link_student_guardian() and
-- admin_deactivate_student_guardian() RPCs and student_guardians write RLS.
--
-- HOW TO RUN:
--   1. First run the SEED block from student-roster-rls.sql to set up test data.
--   2. Run each test block below individually in Supabase SQL Editor.
--      Each test is wrapped in BEGIN; ... ROLLBACK; so changes are undone.
--   3. Run the CLEANUP block from student-roster-rls.sql when done.
--
-- These tests are MANUAL — they require a live Supabase database with all
-- SafeBus migrations (0001-0019) applied.
--
-- IMPORTANT: Each test block uses BEGIN; ... ROLLBACK; so that SET LOCAL and
-- set_config(..., true) take effect for the duration of the transaction.
-- Do NOT split a test block across separate SQL Editor runs — the whole block
-- from BEGIN to ROLLBACK must be executed as one statement.

-- Test user UUIDs (from student-roster-rls.sql seed):
--   c3000000-...-000000000001 = tenant_admin (Tenant A)
--   c3000000-...-000000000002 = transportation_admin (Tenant A)
--   c3000000-...-000000000003 = school_admin (Tenant A)
--   c3000000-...-000000000004 = guardian (Tenant A)
--   c3000000-...-000000000005 = driver (Tenant A)

-- ===========================================================================
-- TEST 1: Tenant admin CAN link student and guardian in own tenant
-- ===========================================================================
begin;
set local role to 'authenticated';
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

-- Sanity check
do $$
begin
  if auth.uid() is null then raise exception 'AUTH SANITY FAILED: auth.uid() is null'; end if;
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then raise exception 'AUTH SANITY FAILED: wrong auth.uid(): %', auth.uid(); end if;
  if current_setting('role', true) <> 'authenticated' then raise exception 'AUTH SANITY FAILED: role is %', current_setting('role', true); end if;
end $$;

do $$
begin
  perform public.admin_link_student_guardian(
    'e5000000-0000-0000-0000-000000000001',
    'd4000000-0000-0000-0000-000000000001'
  );
  raise notice 'TEST 1 PASSED: tenant_admin can link same-tenant student+guardian';
exception
  when others then raise exception 'TEST 1 FAILED: %', sqlerrm;
end
$$;
rollback;

-- ===========================================================================
-- TEST 2: Tenant admin CANNOT link own-tenant guardian to other-tenant student
-- ===========================================================================
begin;
set local role to 'authenticated';
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

do $$
begin
  if auth.uid() is null then raise exception 'AUTH SANITY FAILED: auth.uid() is null'; end if;
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then raise exception 'AUTH SANITY FAILED: wrong auth.uid(): %', auth.uid(); end if;
end $$;

do $$
begin
  perform public.admin_link_student_guardian(
    'e5000000-0000-0000-0000-000000000002',
    'd4000000-0000-0000-0000-000000000001'
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
rollback;

-- ===========================================================================
-- TEST 3: Tenant admin CANNOT link other-tenant guardian to own-tenant student
-- ===========================================================================
begin;
set local role to 'authenticated';
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

do $$
begin
  if auth.uid() is null then raise exception 'AUTH SANITY FAILED: auth.uid() is null'; end if;
end $$;

do $$
begin
  perform public.admin_link_student_guardian(
    'e5000000-0000-0000-0000-000000000001',
    'd4000000-0000-0000-0000-000000000002'
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
rollback;

-- ===========================================================================
-- TEST 4: Guardian CANNOT call admin_link_student_guardian
-- ===========================================================================
begin;
set local role to 'authenticated';
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);

do $$
begin
  if auth.uid() is null then raise exception 'AUTH SANITY FAILED: auth.uid() is null'; end if;
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000004'::uuid then raise exception 'AUTH SANITY FAILED: wrong auth.uid(): %', auth.uid(); end if;
end $$;

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
rollback;

-- ===========================================================================
-- TEST 5: Driver CANNOT call admin_link_student_guardian
-- ===========================================================================
begin;
set local role to 'authenticated';
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text, true);

do $$
begin
  if auth.uid() is null then raise exception 'AUTH SANITY FAILED: auth.uid() is null'; end if;
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000005'::uuid then raise exception 'AUTH SANITY FAILED: wrong auth.uid(): %', auth.uid(); end if;
end $$;

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
rollback;

-- ===========================================================================
-- TEST 6: Direct INSERT to student_guardians is blocked (RPC-only writes)
-- ===========================================================================
begin;
set local role to 'authenticated';
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

do $$
begin
  if auth.uid() is null then raise exception 'AUTH SANITY FAILED: auth.uid() is null'; end if;
end $$;

do $$
begin
  insert into public.student_guardians (tenant_id, student_id, guardian_id, relationship, status)
  values ('a1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'guardian', 'active');
  raise exception 'TEST 6 FAILED: direct INSERT should be blocked';
exception
  when others then
    if sqlerrm like '%permission denied%' or sqlerrm like '%row-level security%' or sqlerrm like '%new row violates%' then
      raise notice 'TEST 6 PASSED: direct INSERT blocked by RLS';
    else
      raise exception 'TEST 6 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;
rollback;

-- ===========================================================================
-- TEST 7: Direct UPDATE to student_guardians is blocked (RPC-only writes)
-- ===========================================================================
begin;
set local role to 'authenticated';
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

do $$
begin
  if auth.uid() is null then raise exception 'AUTH SANITY FAILED: auth.uid() is null'; end if;
end $$;

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
rollback;

-- ===========================================================================
-- TEST 8: Duplicate active links are prevented
-- ===========================================================================
-- The seed has an active link f6000000... for student_A1 + guardian_A.
-- Try to link the same pair again — should get "already linked" error.
begin;
set local role to 'authenticated';
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

do $$
begin
  if auth.uid() is null then raise exception 'AUTH SANITY FAILED: auth.uid() is null'; end if;
end $$;

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
rollback;

-- ===========================================================================
-- TEST 9: Inactive same-tenant link CAN be reactivated
-- ===========================================================================
-- Deactivate the existing link first, then try to re-link.
begin;
set local role to 'authenticated';
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

do $$
begin
  if auth.uid() is null then raise exception 'AUTH SANITY FAILED: auth.uid() is null'; end if;
end $$;

do $$
begin
  perform public.admin_deactivate_student_guardian('f6000000-0000-0000-0000-000000000001');
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
rollback;

-- ===========================================================================
-- TEST 10: Guardian visibility RPC still scoped (unchanged)
-- ===========================================================================
begin;
set local role to 'authenticated';
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);

do $$
begin
  if auth.uid() is null then raise exception 'AUTH SANITY FAILED: auth.uid() is null'; end if;
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000004'::uuid then raise exception 'AUTH SANITY FAILED: wrong auth.uid(): %', auth.uid(); end if;
end $$;

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
rollback;

-- ===========================================================================
-- TEST 11: Cross-tenant inactive link CANNOT be reactivated
-- ===========================================================================
-- Setup: create a mismatched-tenant inactive link row using postgres role.
-- Then switch to tenant_admin_A and try to link student_B1 + guardian_A.
-- The RPC should reject because student_B1 is not in Tenant A.
begin;
-- Setup as postgres (privileged)
set local role to 'postgres';
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '{}'::text, true);

delete from public.student_guardians
where student_id = 'e5000000-0000-0000-0000-000000000002'
  and guardian_id = 'd4000000-0000-0000-0000-000000000001';

insert into public.student_guardians (tenant_id, student_id, guardian_id, relationship, status)
values ('a1000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000001', 'guardian', 'inactive')
on conflict do nothing;

-- Now switch to tenant_admin_A
set local role to 'authenticated';
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

do $$
begin
  if auth.uid() is null then raise exception 'AUTH SANITY FAILED: auth.uid() is null'; end if;
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then raise exception 'AUTH SANITY FAILED: wrong auth.uid(): %', auth.uid(); end if;
end $$;

do $$
begin
  perform public.admin_link_student_guardian(
    'e5000000-0000-0000-0000-000000000002',
    'd4000000-0000-0000-0000-000000000001'
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
rollback;

-- ===========================================================================
-- TEST 12: Guardian CANNOT call admin_deactivate_student_guardian
-- ===========================================================================
begin;
set local role to 'authenticated';
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);

do $$
begin
  if auth.uid() is null then raise exception 'AUTH SANITY FAILED: auth.uid() is null'; end if;
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000004'::uuid then raise exception 'AUTH SANITY FAILED: wrong auth.uid(): %', auth.uid(); end if;
end $$;

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
rollback;

-- ===========================================================================
-- TEST 13: Driver CANNOT call admin_deactivate_student_guardian
-- ===========================================================================
begin;
set local role to 'authenticated';
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text, true);

do $$
begin
  if auth.uid() is null then raise exception 'AUTH SANITY FAILED: auth.uid() is null'; end if;
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000005'::uuid then raise exception 'AUTH SANITY FAILED: wrong auth.uid(): %', auth.uid(); end if;
end $$;

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
rollback;
