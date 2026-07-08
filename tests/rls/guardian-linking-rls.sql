-- SafeBus Alberta - RLS Regression Tests: Guardian-Student Linking
--
-- Milestone 5B fix: tests for admin_link_student_guardian() and
-- admin_deactivate_student_guardian() RPCs and student_guardians write RLS.
--
-- HOW TO RUN:
--   1. First run the SEED block from student-roster-rls.sql to set up test data.
--   2. Then run this file, or run each test transaction in order.
--   3. Run the CLEANUP block from student-roster-rls.sql when done.
--   4. Do not run against production.
--
-- These tests are MANUAL — they require a live Supabase database with all
-- SafeBus migrations (0001-0019) applied.
--
-- Each simulated user assertion runs inside its own explicit transaction with
-- transaction-local role/JWT settings and rollback. The tests set both
-- request.jwt.claim.sub/request.jwt.claim.role and legacy JSON
-- request.jwt.claims, then assert auth.uid() before checking RLS behavior.

-- ===========================================================================
-- TEST 1: Tenant admin CAN link student and guardian in own tenant
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', 'c3000000-0000-0000-0000-000000000001',
    'role', 'authenticated'
  )::text,
  true
);
do $$
declare
  v_link public.student_guardians;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 1 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 1 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  select * into v_link
  from public.admin_link_student_guardian(
    'e5000000-0000-0000-0000-000000000003',  -- unlinked student in Tenant A
    'd4000000-0000-0000-0000-000000000001'   -- guardian_A in Tenant A
  );

  if v_link.tenant_id <> public.current_tenant_id()
     or v_link.status <> 'active'
     or v_link.student_id <> 'e5000000-0000-0000-0000-000000000003'::uuid
     or v_link.guardian_id <> 'd4000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 1 FAILED: unexpected link returned: %', v_link;
  end if;

  raise notice 'TEST 1 PASSED: tenant_admin can link same-tenant student+guardian';
end
$$;
rollback;

-- ===========================================================================
-- TEST 2: Tenant admin CANNOT link own-tenant guardian to other-tenant student
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 2 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 2 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  begin
    perform public.admin_link_student_guardian(
      'e5000000-0000-0000-0000-000000000004',  -- student in Tenant B
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
  end;
end
$$;
rollback;

-- ===========================================================================
-- TEST 3: Tenant admin CANNOT link other-tenant guardian to own-tenant student
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 3 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 3 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  begin
    perform public.admin_link_student_guardian(
      'e5000000-0000-0000-0000-000000000001',
      'd4000000-0000-0000-0000-000000000099'   -- no active guardian in Tenant A
    );
    raise exception 'TEST 3 FAILED: tenant_admin should NOT link other-tenant guardian';
  exception
    when others then
      if sqlerrm like '%Guardian not found%' then
        raise notice 'TEST 3 PASSED: tenant_admin blocked from other-tenant guardian';
      else
        raise exception 'TEST 3 FAILED with unexpected error: %', sqlerrm;
      end if;
  end;
end
$$;
rollback;

-- ===========================================================================
-- TEST 4: Guardian CANNOT call admin_link_student_guardian
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000004'::uuid then
    raise exception 'TEST 4 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 4 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  begin
    perform public.admin_link_student_guardian('e5000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001');
    raise exception 'TEST 4 FAILED: guardian should NOT call admin_link RPC';
  exception
    when others then
      if sqlerrm like '%Only an admin%' then
        raise notice 'TEST 4 PASSED: guardian blocked from admin_link RPC';
      else
        raise exception 'TEST 4 FAILED with unexpected error: %', sqlerrm;
      end if;
  end;
end
$$;
rollback;

-- ===========================================================================
-- TEST 5: Driver CANNOT call admin_link_student_guardian
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text, true);
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000005'::uuid then
    raise exception 'TEST 5 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'driver' then
    raise exception 'TEST 5 FAILED: expected driver, got %', public.current_user_role();
  end if;

  begin
    perform public.admin_link_student_guardian('e5000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001');
    raise exception 'TEST 5 FAILED: driver should NOT call admin_link RPC';
  exception
    when others then
      if sqlerrm like '%Only an admin%' then
        raise notice 'TEST 5 PASSED: driver blocked from admin_link RPC';
      else
        raise exception 'TEST 5 FAILED with unexpected error: %', sqlerrm;
      end if;
  end;
end
$$;
rollback;

-- ===========================================================================
-- TEST 6: Direct INSERT to student_guardians is blocked (RPC-only writes)
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 6 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 6 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  begin
    insert into public.student_guardians (tenant_id, student_id, guardian_id, relationship, status)
    values ('a1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000003', 'd4000000-0000-0000-0000-000000000001', 'guardian', 'active');
    raise exception 'TEST 6 FAILED: direct INSERT should be blocked';
  exception
    when others then
      if sqlerrm like '%permission denied%' or sqlerrm like '%row-level security%' then
        raise notice 'TEST 6 PASSED: direct INSERT blocked';
      else
        raise exception 'TEST 6 FAILED with unexpected error: %', sqlerrm;
      end if;
  end;
end
$$;
rollback;

-- ===========================================================================
-- TEST 7: Direct UPDATE to student_guardians is blocked (RPC-only writes)
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 7 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 7 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  begin
    update public.student_guardians set status = 'inactive' where id = 'f6000000-0000-0000-0000-000000000001';
    raise exception 'TEST 7 FAILED: direct UPDATE should be blocked';
  exception
    when others then
      if sqlerrm like '%permission denied%' or sqlerrm like '%row-level security%' then
        raise notice 'TEST 7 PASSED: direct UPDATE blocked';
      else
        raise exception 'TEST 7 FAILED with unexpected error: %', sqlerrm;
      end if;
  end;
end
$$;
rollback;

-- ===========================================================================
-- TEST 8: Duplicate active links are prevented
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 8 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 8 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  begin
    perform public.admin_link_student_guardian('e5000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001');
    raise exception 'TEST 8 FAILED: duplicate active link should be prevented';
  exception
    when others then
      if sqlerrm like '%already linked%' then
        raise notice 'TEST 8 PASSED: duplicate active link prevented';
      else
        raise exception 'TEST 8 FAILED with unexpected error: %', sqlerrm;
      end if;
  end;
end
$$;
rollback;

-- ===========================================================================
-- TEST 9: Inactive same-tenant link CAN be reactivated
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
do $$
declare
  v_link public.student_guardians;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 9 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 9 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  select * into v_link
  from public.admin_link_student_guardian('e5000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000001');

  if v_link.id <> 'f6000000-0000-0000-0000-000000000002'::uuid or v_link.status <> 'active' then
    raise exception 'TEST 9 FAILED: expected inactive seed link to reactivate, got %', v_link;
  end if;

  raise notice 'TEST 9 PASSED: inactive link reactivated successfully';
end
$$;
rollback;

-- ===========================================================================
-- TEST 10: Guardian visibility RPC still scoped (unchanged)
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
do $$
declare
  v_count int;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000004'::uuid then
    raise exception 'TEST 10 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 10 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  select count(*) into v_count from public.get_guardian_student_route_visibility();
  if v_count < 1 then
    raise exception 'TEST 10 FAILED: guardian should see at least 1 linked student';
  end if;

  raise notice 'TEST 10 PASSED: guardian sees % linked student(s)', v_count;
end
$$;
rollback;

-- ===========================================================================
-- TEST 11: Cross-tenant inactive link CANNOT be reactivated
-- ===========================================================================
-- Privileged setup: create an inactive mismatched-tenant row. This setup runs
-- outside simulated authenticated context and is cleaned up after the test.
delete from public.student_guardians
where student_id = 'e5000000-0000-0000-0000-000000000004'
  and guardian_id = 'd4000000-0000-0000-0000-000000000001';

insert into public.student_guardians (tenant_id, student_id, guardian_id, relationship, status)
values ('a1000000-0000-0000-0000-000000000002', 'e5000000-0000-0000-0000-000000000004', 'd4000000-0000-0000-0000-000000000001', 'guardian', 'inactive')
on conflict do nothing;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 11 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 11 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  begin
    perform public.admin_link_student_guardian(
      'e5000000-0000-0000-0000-000000000004',  -- student in Tenant B
      'd4000000-0000-0000-0000-000000000001'   -- guardian_A in Tenant A
    );
    raise exception 'TEST 11 FAILED: should not reactivate cross-tenant link';
  exception
    when others then
      if sqlerrm like '%Student not found%' then
        raise notice 'TEST 11 PASSED: cross-tenant link reactivation blocked';
      else
        raise exception 'TEST 11 FAILED with unexpected error: %', sqlerrm;
      end if;
  end;
end
$$;
rollback;

delete from public.student_guardians
where student_id = 'e5000000-0000-0000-0000-000000000004'
  and guardian_id = 'd4000000-0000-0000-0000-000000000001';

-- ===========================================================================
-- TEST 12: Guardian CANNOT call admin_deactivate_student_guardian
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000004'::uuid then
    raise exception 'TEST 12 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 12 FAILED: expected guardian, got %', public.current_user_role();
  end if;

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
  end;
end
$$;
rollback;

-- ===========================================================================
-- TEST 13: Driver CANNOT call admin_deactivate_student_guardian
-- ===========================================================================
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c3000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-000000000005', 'role', 'authenticated')::text, true);
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000005'::uuid then
    raise exception 'TEST 13 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'driver' then
    raise exception 'TEST 13 FAILED: expected driver, got %', public.current_user_role();
  end if;

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
  end;
end
$$;
rollback;
