-- SafeBus Alberta - RLS Regression Tests: Student Roster
--
-- Milestone 5A.2: manual database/RLS regression tests for student roster
-- INSERT/UPDATE policies.
--
-- HOW TO RUN:
--   1. Open the hosted Supabase DEV project SQL Editor.
--   2. Run this whole file, or run the sections in order.
--   3. Do not run against production.
--
-- The seed and cleanup blocks run in the privileged SQL Editor context.
-- Every simulated authenticated/anonymous user assertion runs inside its own
-- explicit transaction with transaction-local role/JWT settings and rollback.
--
-- JWT compatibility note:
--   The tests set both request.jwt.claim.sub/request.jwt.claim.role and the
--   legacy JSON request.jwt.claims GUC. Hosted Supabase projects may differ by
--   PostgREST/Auth helper version. Each test asserts auth.uid() so a broken
--   simulation fails before the RLS assertion.

-- ===========================================================================
-- PRIVILEGED CLEANUP BEFORE SEED
-- ===========================================================================

delete from public.student_guardians where id in (
  'f6000000-0000-0000-0000-000000000001',
  'f6000000-0000-0000-0000-000000000002',
  'f6000000-0000-0000-0000-000000000003'
);

delete from public.students where id in (
  'e5000000-0000-0000-0000-000000000001',
  'e5000000-0000-0000-0000-000000000002',
  'e5000000-0000-0000-0000-000000000003',
  'e5000000-0000-0000-0000-000000000004',
  'e5000000-0000-0000-0000-000000000005',
  'e5000000-0000-0000-0000-000000000006',
  'e5000000-0000-0000-0000-000000000007'
);

delete from public.guardians where id in (
  'd4000000-0000-0000-0000-000000000001',
  'd4000000-0000-0000-0000-000000000003'
);

delete from public.drivers where id = 'd4000000-0000-0000-0000-000000000002';

delete from public.profiles where id in (
  'c3000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000002',
  'c3000000-0000-0000-0000-000000000003',
  'c3000000-0000-0000-0000-000000000004',
  'c3000000-0000-0000-0000-000000000005',
  'c3000000-0000-0000-0000-000000000006'
);

delete from auth.users where id in (
  'c3000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000002',
  'c3000000-0000-0000-0000-000000000003',
  'c3000000-0000-0000-0000-000000000004',
  'c3000000-0000-0000-0000-000000000005',
  'c3000000-0000-0000-0000-000000000006'
);

delete from public.schools where id in (
  'b2000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000002',
  'b2000000-0000-0000-0000-000000000003'
);

delete from public.tenants where id in (
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002'
);

-- ===========================================================================
-- PRIVILEGED SEED
-- ===========================================================================

insert into public.tenants (id, name, type, status)
values
  ('a1000000-0000-0000-0000-000000000001', 'RLS_TEST_Tenant_A', 'school', 'active'),
  ('a1000000-0000-0000-0000-000000000002', 'RLS_TEST_Tenant_B', 'school', 'active');

insert into public.schools (id, tenant_id, name, province, status)
values
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'RLS_TEST_School_A1', 'AB', 'active'),
  ('b2000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'RLS_TEST_School_A2', 'AB', 'active'),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'RLS_TEST_School_B1', 'AB', 'active');

insert into auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  role,
  aud,
  instance_id,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('c3000000-0000-0000-0000-000000000001', 'rls_test_tenant_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3000000-0000-0000-0000-000000000002', 'rls_test_transportation_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3000000-0000-0000-0000-000000000003', 'rls_test_school_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3000000-0000-0000-0000-000000000004', 'rls_test_guardian_a@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3000000-0000-0000-0000-000000000005', 'rls_test_driver@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3000000-0000-0000-0000-000000000006', 'rls_test_guardian_b@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, tenant_id, school_id, full_name, email, role, status)
values
  ('c3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS Test Tenant Admin', 'rls_test_tenant_admin@test.local', 'tenant_admin', 'active'),
  ('c3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS Test Transportation Admin', 'rls_test_transportation_admin@test.local', 'transportation_admin', 'active'),
  ('c3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS Test School Admin', 'rls_test_school_admin@test.local', 'school_admin', 'active'),
  ('c3000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', null, 'RLS Test Guardian A', 'rls_test_guardian_a@test.local', 'guardian', 'active'),
  ('c3000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', null, 'RLS Test Driver', 'rls_test_driver@test.local', 'driver', 'active'),
  ('c3000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001', null, 'RLS Test Guardian B', 'rls_test_guardian_b@test.local', 'guardian', 'active');

insert into public.guardians (id, tenant_id, profile_id, full_name, email, status)
values
  ('d4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000004', 'RLS Test Guardian A', 'rls_test_guardian_a@test.local', 'active'),
  ('d4000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000006', 'RLS Test Guardian B', 'rls_test_guardian_b@test.local', 'active');

insert into public.drivers (id, tenant_id, profile_id, status)
values ('d4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000005', 'active');

insert into public.students (id, tenant_id, school_id, first_name, last_name, grade, status)
values
  ('e5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS_Test', 'Active_Linked_A', '5', 'active'),
  ('e5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS_Test', 'Inactive_Link_A', '5', 'active'),
  ('e5000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS_Test', 'Unlinked_A', '5', 'active'),
  ('e5000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'RLS_Test', 'Cross_Tenant_B', '5', 'active'),
  ('e5000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS_Test', 'Guardian_B_Linked', '5', 'active'),
  ('e5000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000001', null, 'RLS_Test', 'Null_School_A', '5', 'active'),
  ('e5000000-0000-0000-0000-000000000007', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000003', 'RLS_Test', 'Other_School_A', '5', 'active');

insert into public.student_guardians (id, tenant_id, student_id, guardian_id, relationship, status)
values
  ('f6000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'guardian', 'active'),
  ('f6000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000001', 'guardian', 'inactive'),
  ('f6000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000005', 'd4000000-0000-0000-0000-000000000003', 'guardian', 'active');

-- ===========================================================================
-- TEST 1: Tenant admin CAN create student with school_id IS NULL
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 1 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 1 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
  values ('e5100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', null, 'RLS_Insert', 'TenantAdminNullSchool', 'active');
  raise notice 'TEST 1 PASSED: tenant_admin can create NULL-school student';
end
$$;
rollback;

-- ===========================================================================
-- TEST 2: Tenant admin CAN create student with same-tenant school_id
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 2 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 2 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
  values ('e5100000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS_Insert', 'TenantAdminSameSchool', 'active');
  raise notice 'TEST 2 PASSED: tenant_admin can create same-tenant school student';
end
$$;
rollback;

-- ===========================================================================
-- TEST 3: Tenant admin CANNOT create student with another tenant's school_id
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 3 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 3 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  begin
    insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
    values ('e5100000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'RLS_Insert', 'TenantAdminCrossSchool', 'active');
    raise exception 'TEST 3 FAILED: cross-tenant school insert was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 3 PASSED: tenant_admin blocked from cross-tenant school_id';
  end;
end
$$;
rollback;

-- ===========================================================================
-- TEST 4: Tenant admin CAN update same-tenant student basic fields
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 4 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 4 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  update public.students
  set preferred_name = 'RosterEdit'
  where id = 'e5000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'TEST 4 FAILED: expected 1 updated row, got %', v_count;
  end if;
  raise notice 'TEST 4 PASSED: tenant_admin can update same-tenant student';
end
$$;
rollback;

-- ===========================================================================
-- TEST 5: Tenant admin CAN update NULL-school student to same-tenant school
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 5 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 5 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  update public.students
  set school_id = 'b2000000-0000-0000-0000-000000000001'
  where id = 'e5000000-0000-0000-0000-000000000006';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'TEST 5 FAILED: expected 1 updated row, got %', v_count;
  end if;
  raise notice 'TEST 5 PASSED: tenant_admin can move NULL-school student to same-tenant school';
end
$$;
rollback;

-- ===========================================================================
-- TEST 6: Tenant admin CAN update status active/inactive
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 6 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 6 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  update public.students
  set status = 'inactive'
  where id = 'e5000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'TEST 6 FAILED: expected 1 updated row, got %', v_count;
  end if;
  raise notice 'TEST 6 PASSED: tenant_admin can update student status';
end
$$;
rollback;

-- ===========================================================================
-- TEST 7: Tenant admin CANNOT update student to another tenant's school_id
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 7 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 7 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  begin
    update public.students
    set school_id = 'b2000000-0000-0000-0000-000000000002'
    where id = 'e5000000-0000-0000-0000-000000000001';
    raise exception 'TEST 7 FAILED: cross-tenant school update was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 7 PASSED: tenant_admin blocked from cross-tenant school_id update';
  end;
end
$$;
rollback;

-- ===========================================================================
-- TEST 8: Tenant admin CANNOT update student's tenant_id to another tenant
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 8 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 8 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  begin
    update public.students
    set tenant_id = 'a1000000-0000-0000-0000-000000000002',
        school_id = 'b2000000-0000-0000-0000-000000000002'
    where id = 'e5000000-0000-0000-0000-000000000001';
    raise exception 'TEST 8 FAILED: tenant_id reassignment was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 8 PASSED: tenant_admin blocked from tenant_id reassignment';
  end;
end
$$;
rollback;

-- ===========================================================================
-- TEST 9: Tenant admin CANNOT update another tenant's student
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'TEST 9 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 9 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  update public.students
  set first_name = 'RLS_Hacked'
  where id = 'e5000000-0000-0000-0000-000000000004';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 9 FAILED: expected 0 updated rows, got %', v_count;
  end if;
  raise notice 'TEST 9 PASSED: tenant_admin cannot update another tenant student';
end
$$;
rollback;

-- ===========================================================================
-- TEST 10: Transportation admin CAN create/update own-tenant NULL-school student
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 10 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'transportation_admin' then
    raise exception 'TEST 10 FAILED: expected transportation_admin, got %', public.current_user_role();
  end if;

  insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
  values ('e5100000-0000-0000-0000-000000000010', 'a1000000-0000-0000-0000-000000000001', null, 'RLS_Insert', 'TransportationAdminNullSchool', 'active');

  update public.students
  set preferred_name = 'TransportEdit'
  where id = 'e5100000-0000-0000-0000-000000000010';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'TEST 10 FAILED: expected 1 updated row, got %', v_count;
  end if;
  raise notice 'TEST 10 PASSED: transportation_admin can create/update own-tenant NULL-school student';
end
$$;
rollback;

-- ===========================================================================
-- TEST 11: Transportation admin CANNOT write another tenant's student/school
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'TEST 11 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'transportation_admin' then
    raise exception 'TEST 11 FAILED: expected transportation_admin, got %', public.current_user_role();
  end if;

  begin
    insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
    values ('e5100000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'RLS_Insert', 'TransportationAdminCrossSchool', 'active');
    raise exception 'TEST 11 FAILED: transportation_admin cross-tenant school insert was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 11 PASSED: transportation_admin blocked from cross-tenant school insert';
  end;

  update public.students
  set first_name = 'RLS_Hacked'
  where id = 'e5000000-0000-0000-0000-000000000004';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 11 FAILED: expected 0 cross-tenant updated rows, got %', v_count;
  end if;
end
$$;
rollback;

-- ===========================================================================
-- TEST 12: School admin CAN create/update own-school student
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000003'::uuid then
    raise exception 'TEST 12 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'school_admin' then
    raise exception 'TEST 12 FAILED: expected school_admin, got %', public.current_user_role();
  end if;

  insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
  values ('e5100000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS_Insert', 'SchoolAdminOwnSchool', 'active');

  update public.students
  set preferred_name = 'SchoolEdit'
  where id = 'e5100000-0000-0000-0000-000000000012';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'TEST 12 FAILED: expected 1 updated row, got %', v_count;
  end if;
  raise notice 'TEST 12 PASSED: school_admin can create/update own-school student';
end
$$;
rollback;

-- ===========================================================================
-- TEST 13: School admin CANNOT create with NULL school_id
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000003'::uuid then
    raise exception 'TEST 13 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'school_admin' then
    raise exception 'TEST 13 FAILED: expected school_admin, got %', public.current_user_role();
  end if;

  begin
    insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
    values ('e5100000-0000-0000-0000-000000000013', 'a1000000-0000-0000-0000-000000000001', null, 'RLS_Insert', 'SchoolAdminNullSchool', 'active');
    raise exception 'TEST 13 FAILED: school_admin NULL-school insert was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 13 PASSED: school_admin blocked from NULL-school insert';
  end;
end
$$;
rollback;

-- ===========================================================================
-- TEST 14: School admin CANNOT update own-school student to NULL school_id
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000003'::uuid then
    raise exception 'TEST 14 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'school_admin' then
    raise exception 'TEST 14 FAILED: expected school_admin, got %', public.current_user_role();
  end if;

  begin
    update public.students
    set school_id = null
    where id = 'e5000000-0000-0000-0000-000000000001';
    raise exception 'TEST 14 FAILED: school_admin own-school to NULL update was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 14 PASSED: school_admin blocked from updating to NULL school_id';
  end;
end
$$;
rollback;

-- ===========================================================================
-- TEST 15: School admin CANNOT create/update with another school_id
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000003'::uuid then
    raise exception 'TEST 15 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'school_admin' then
    raise exception 'TEST 15 FAILED: expected school_admin, got %', public.current_user_role();
  end if;

  begin
    insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
    values ('e5100000-0000-0000-0000-000000000015', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000003', 'RLS_Insert', 'SchoolAdminOtherSchool', 'active');
    raise exception 'TEST 15 FAILED: school_admin other-school insert was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 15 PASSED: school_admin blocked from other-school insert';
  end;

  update public.students
  set preferred_name = 'OtherSchoolEdit'
  where id = 'e5000000-0000-0000-0000-000000000007';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 15 FAILED: expected 0 other-school updated rows, got %', v_count;
  end if;
end
$$;
rollback;

-- ===========================================================================
-- TEST 16: School admin CANNOT update tenant-wide NULL-school students
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000003';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000003'::uuid then
    raise exception 'TEST 16 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'school_admin' then
    raise exception 'TEST 16 FAILED: expected school_admin, got %', public.current_user_role();
  end if;

  update public.students
  set preferred_name = 'NullSchoolEdit'
  where id = 'e5000000-0000-0000-0000-000000000006';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 16 FAILED: expected 0 NULL-school updated rows, got %', v_count;
  end if;
  raise notice 'TEST 16 PASSED: school_admin cannot update NULL-school students';
end
$$;
rollback;

-- ===========================================================================
-- TEST 17: Guardian CANNOT insert/update students
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
    raise exception 'TEST 17 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 17 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  begin
    insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
    values ('e5100000-0000-0000-0000-000000000017', 'a1000000-0000-0000-0000-000000000001', null, 'RLS_Insert', 'GuardianInsert', 'active');
    raise exception 'TEST 17 FAILED: guardian insert was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 17 PASSED: guardian blocked from insert';
  end;

  update public.students
  set first_name = 'RLS_Hacked'
  where id = 'e5000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 17 FAILED: expected 0 guardian updated rows, got %', v_count;
  end if;
end
$$;
rollback;

-- ===========================================================================
-- TEST 18: Driver CANNOT insert/update students
-- ===========================================================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c3000000-0000-0000-0000-000000000005';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c3000000-0000-0000-0000-000000000005","role":"authenticated"}';
do $$
declare
  v_count int;
begin
  if auth.uid() <> 'c3000000-0000-0000-0000-000000000005'::uuid then
    raise exception 'TEST 18 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'driver' then
    raise exception 'TEST 18 FAILED: expected driver, got %', public.current_user_role();
  end if;

  begin
    insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
    values ('e5100000-0000-0000-0000-000000000018', 'a1000000-0000-0000-0000-000000000001', null, 'RLS_Insert', 'DriverInsert', 'active');
    raise exception 'TEST 18 FAILED: driver insert was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 18 PASSED: driver blocked from insert';
  end;

  update public.students
  set first_name = 'RLS_Hacked'
  where id = 'e5000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 18 FAILED: expected 0 driver updated rows, got %', v_count;
  end if;
end
$$;
rollback;

-- ===========================================================================
-- TEST 19: Anonymous CANNOT insert/update/read protected roster
-- ===========================================================================
begin;
set local role anon;
do $$
begin
  if auth.uid() is not null then
    raise exception 'TEST 19 FAILED: expected anonymous auth.uid() NULL, got %', auth.uid();
  end if;

  begin
    insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
    values ('e5100000-0000-0000-0000-000000000019', 'a1000000-0000-0000-0000-000000000001', null, 'RLS_Insert', 'AnonInsert', 'active');
    raise exception 'TEST 19 FAILED: anonymous insert was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 19 PASSED: anonymous blocked from insert';
  end;

  begin
    update public.students
    set first_name = 'RLS_Hacked'
    where id = 'e5000000-0000-0000-0000-000000000001';
    raise exception 'TEST 19 FAILED: anonymous update was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 19 PASSED: anonymous blocked from update';
  end;

  begin
    perform 1 from public.students limit 1;
    raise exception 'TEST 19 FAILED: anonymous protected roster read was allowed';
  exception
    when insufficient_privilege then
      raise notice 'TEST 19 PASSED: anonymous blocked from protected roster read';
  end;
end
$$;
rollback;

-- ===========================================================================
-- PRIVILEGED CLEANUP AFTER TESTS
-- ===========================================================================

delete from public.student_guardians where id in (
  'f6000000-0000-0000-0000-000000000001',
  'f6000000-0000-0000-0000-000000000002',
  'f6000000-0000-0000-0000-000000000003'
);

delete from public.students where id in (
  'e5000000-0000-0000-0000-000000000001',
  'e5000000-0000-0000-0000-000000000002',
  'e5000000-0000-0000-0000-000000000003',
  'e5000000-0000-0000-0000-000000000004',
  'e5000000-0000-0000-0000-000000000005',
  'e5000000-0000-0000-0000-000000000006',
  'e5000000-0000-0000-0000-000000000007',
  'e5100000-0000-0000-0000-000000000001',
  'e5100000-0000-0000-0000-000000000002',
  'e5100000-0000-0000-0000-000000000003',
  'e5100000-0000-0000-0000-000000000010',
  'e5100000-0000-0000-0000-000000000011',
  'e5100000-0000-0000-0000-000000000012',
  'e5100000-0000-0000-0000-000000000013',
  'e5100000-0000-0000-0000-000000000015',
  'e5100000-0000-0000-0000-000000000017',
  'e5100000-0000-0000-0000-000000000018',
  'e5100000-0000-0000-0000-000000000019'
);

delete from public.guardians where id in (
  'd4000000-0000-0000-0000-000000000001',
  'd4000000-0000-0000-0000-000000000003'
);

delete from public.drivers where id = 'd4000000-0000-0000-0000-000000000002';

delete from public.profiles where id in (
  'c3000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000002',
  'c3000000-0000-0000-0000-000000000003',
  'c3000000-0000-0000-0000-000000000004',
  'c3000000-0000-0000-0000-000000000005',
  'c3000000-0000-0000-0000-000000000006'
);

delete from auth.users where id in (
  'c3000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000002',
  'c3000000-0000-0000-0000-000000000003',
  'c3000000-0000-0000-0000-000000000004',
  'c3000000-0000-0000-0000-000000000005',
  'c3000000-0000-0000-0000-000000000006'
);

delete from public.schools where id in (
  'b2000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000002',
  'b2000000-0000-0000-0000-000000000003'
);

delete from public.tenants where id in (
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002'
);
