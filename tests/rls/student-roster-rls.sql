-- SafeBus Alberta - RLS Regression Tests: Student Roster
--
-- Milestone 5A.2: Database/RLS regression test foundation for student roster
-- insert/update policies.
--
-- HOW TO RUN:
--   1. Open the hosted Supabase DEV project.
--   2. Go to SQL Editor.
--   3. Paste the SEED section first and run it to set up test data.
--   4. Then paste each TEST section and run it. Each test uses a local DO
--      block that raises an exception if the assertion fails.
--
-- These tests are MANUAL — they require a live Supabase database with the
-- SafeBus migrations (0001-0017) applied. They cannot be run in CI without
-- a local Supabase instance. See tests/rls/README.md for details.
--
-- IMPORTANT: These tests create and clean up their own test data. They do not
-- modify existing production data. The SEED block uses ON CONFLICT DO NOTHING
-- and a dedicated test tenant prefix to avoid collisions.
--
-- TEST DATA MODEL:
--   - Two tenants: Test Tenant A, Test Tenant B
--   - One school per tenant: Test School A, Test School B
--   - Users: tenant_admin_A, transportation_admin_A, school_admin_A,
--            guardian_A, driver_A (all in Tenant A)
--   - Students: student_A1 (Tenant A), student_B1 (Tenant B)
--   - The tests use `set role authenticated` + `set local request.jwt.claims`
--     to simulate different authenticated users.
--   - NOTE: In Supabase SQL Editor, you may need to run as the `postgres`
--     role (service role) to set custom JWT claims. If `set local
--     request.jwt.claims` is not available, use `set role` with pre-created
--     auth.users entries instead.

-- ===========================================================================
-- SEED: Create test tenants, schools, profiles, students
-- ===========================================================================
-- Run this block once before running the individual test blocks.

-- Clean up any previous test data (safe — only touches test-prefixed rows).
delete from public.student_guardians where tenant_id in (
  select id from public.tenants where name like 'RLS_TEST_%'
);
delete from public.students where tenant_id in (
  select id from public.tenants where name like 'RLS_TEST_%'
);
delete from public.guardians where tenant_id in (
  select id from public.tenants where name like 'RLS_TEST_%'
);
delete from public.drivers where tenant_id in (
  select id from public.tenants where name like 'RLS_TEST_%'
);
delete from public.profiles where email like 'rls_test_%';
delete from public.schools where name like 'RLS_TEST_%';
delete from public.tenants where name like 'RLS_TEST_%';

-- Create test tenants
insert into public.tenants (id, name, type, status)
values
  ('a1000000-0000-0000-0000-000000000001', 'RLS_TEST_Tenant_A', 'school', 'active'),
  ('a1000000-0000-0000-0000-000000000002', 'RLS_TEST_Tenant_B', 'school', 'active')
on conflict (id) do nothing;

-- Create test schools
insert into public.schools (id, tenant_id, name, province, status)
values
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'RLS_TEST_School_A', 'AB', 'active'),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'RLS_TEST_School_B', 'AB', 'active')
on conflict (id) do nothing;

-- Create test auth users (if not already present)
-- NOTE: In Supabase, auth.users must be created via the Auth API or admin panel.
-- For SQL Editor testing, you can insert directly into auth.users if you have
-- service-role access:
insert into auth.users (id, email, encrypted_password, email_confirmed_at, role, aud, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('c3000000-0000-0000-0000-000000000001', 'rls_test_tenant_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3000000-0000-0000-0000-000000000002', 'rls_test_transportation_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3000000-0000-0000-0000-000000000003', 'rls_test_school_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3000000-0000-0000-0000-000000000004', 'rls_test_guardian@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3000000-0000-0000-0000-000000000005', 'rls_test_driver@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

-- Create test profiles
insert into public.profiles (id, tenant_id, school_id, full_name, email, role, status)
values
  ('c3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS Test Tenant Admin', 'rls_test_tenant_admin@test.local', 'tenant_admin', 'active'),
  ('c3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS Test Transportation Admin', 'rls_test_transportation_admin@test.local', 'transportation_admin', 'active'),
  ('c3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS Test School Admin', 'rls_test_school_admin@test.local', 'school_admin', 'active'),
  ('c3000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', null, 'RLS Test Guardian', 'rls_test_guardian@test.local', 'guardian', 'active'),
  ('c3000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', null, 'RLS Test Driver', 'rls_test_driver@test.local', 'driver', 'active')
on conflict (id) do nothing;

-- Create test guardian record
insert into public.guardians (id, tenant_id, profile_id, full_name, email, status)
values ('d4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000004', 'RLS Test Guardian', 'rls_test_guardian@test.local', 'active')
on conflict (id) do nothing;

-- Create test driver record
insert into public.drivers (id, tenant_id, profile_id, status)
values ('d4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000005', 'active')
on conflict (id) do nothing;

-- Create test students
insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
values
  ('e5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS_Test', 'Student_A1', 'active'),
  ('e5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'RLS_Test', 'Student_B1', 'active')
on conflict (id) do nothing;

-- Create active guardian-student link
insert into public.student_guardians (id, tenant_id, student_id, guardian_id, relationship, status)
values ('f6000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000001', 'd4000000-0000-0000-0000-000000000001', 'guardian', 'active')
on conflict (id) do nothing;

-- Create inactive guardian-student link (for guardian visibility negative test)
insert into public.student_guardians (id, tenant_id, student_id, guardian_id, relationship, status)
values ('f6000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'e5000000-0000-0000-0000-000000000002', 'd4000000-0000-0000-0000-000000000001', 'guardian', 'inactive')
on conflict (id) do nothing;

-- ===========================================================================
-- HELPER: Simulate an authenticated user by setting the JWT claims
-- ===========================================================================
-- In Supabase SQL Editor (running as postgres/service role), you can simulate
-- an authenticated user by setting the local JWT claims. The RLS policies use
-- auth.uid() which reads the "sub" claim from request.jwt.claims.
--
-- Usage before each test block:
--   set local request.jwt.claims.role to 'authenticated';
--   set local request.jwt.claims.sub to '<profile_id>';
--   set local role to 'authenticated';
--
-- Then run the INSERT/UPDATE/SELECT statement. If RLS blocks it, you'll get
-- an error (new row violates row-level security / permission denied).

-- ===========================================================================
-- TEST 1: Tenant admin CAN create student with school_id IS NULL
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

do $$
begin
  -- Should succeed: tenant_admin creating NULL-school student in own tenant
  insert into public.students (tenant_id, school_id, first_name, last_name, status)
  values ('a1000000-0000-0000-0000-000000000001', null, 'TestNull', 'SchoolStudent', 'active');
  raise notice 'TEST 1 PASSED: tenant_admin can create NULL-school student';
exception
  when others then
    raise exception 'TEST 1 FAILED: tenant_admin should be able to create NULL-school student. Error: %', sqlerrm;
end
$$;

-- Cleanup
delete from public.students where first_name = 'TestNull' and last_name = 'SchoolStudent';

-- ===========================================================================
-- TEST 2: Tenant admin CAN create student with same-tenant school_id
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

do $$
begin
  insert into public.students (tenant_id, school_id, first_name, last_name, status)
  values ('a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'TestSame', 'SchoolStudent', 'active');
  raise notice 'TEST 2 PASSED: tenant_admin can create same-tenant school student';
exception
  when others then
    raise exception 'TEST 2 FAILED: tenant_admin should be able to create same-tenant school student. Error: %', sqlerrm;
end
$$;

-- Cleanup
delete from public.students where first_name = 'TestSame' and last_name = 'SchoolStudent';

-- ===========================================================================
-- TEST 3: Tenant admin CANNOT create student with cross-tenant school_id
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

do $$
begin
  insert into public.students (tenant_id, school_id, first_name, last_name, status)
  values ('a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'TestCross', 'TenantSchool', 'active');
  raise exception 'TEST 3 FAILED: tenant_admin should NOT be able to create student with cross-tenant school_id';
exception
  when others then
    if sqlerrm like '%row-level security%' or sqlerrm like '%new row violates%' then
      raise notice 'TEST 3 PASSED: tenant_admin blocked from cross-tenant school_id';
    else
      raise exception 'TEST 3 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;

-- ===========================================================================
-- TEST 4: Tenant admin CAN update same-tenant student basic fields
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

do $$
begin
  update public.students set first_name = 'UpdatedName' where id = 'e5000000-0000-0000-0000-000000000001';
  raise notice 'TEST 4 PASSED: tenant_admin can update same-tenant student';
exception
  when others then
    raise exception 'TEST 4 FAILED: tenant_admin should be able to update same-tenant student. Error: %', sqlerrm;
end
$$;

-- Restore
update public.students set first_name = 'RLS_Test' where id = 'e5000000-0000-0000-0000-000000000001';

-- ===========================================================================
-- TEST 5: Tenant admin CANNOT update student to cross-tenant school_id
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

do $$
begin
  update public.students set school_id = 'b2000000-0000-0000-0000-000000000002' where id = 'e5000000-0000-0000-0000-000000000001';
  raise exception 'TEST 5 FAILED: tenant_admin should NOT be able to update student to cross-tenant school_id';
exception
  when others then
    if sqlerrm like '%row-level security%' or sqlerrm like '%new row violates%' then
      raise notice 'TEST 5 PASSED: tenant_admin blocked from updating to cross-tenant school_id';
    else
      raise exception 'TEST 5 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;

-- ===========================================================================
-- TEST 6: Tenant admin CANNOT update another tenant's student
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000001';

do $$
declare
  v_count int;
begin
  update public.students set first_name = 'HackedName' where id = 'e5000000-0000-0000-0000-000000000002';
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise exception 'TEST 6 FAILED: tenant_admin should NOT be able to update another tenant''s student';
  else
    raise notice 'TEST 6 PASSED: tenant_admin blocked from updating other tenant''s student (0 rows affected)';
  end if;
end
$$;

-- ===========================================================================
-- TEST 7: School admin CANNOT create student with school_id IS NULL
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000003';

do $$
begin
  insert into public.students (tenant_id, school_id, first_name, last_name, status)
  values ('a1000000-0000-0000-0000-000000000001', null, 'TestSchool', 'AdminNull', 'active');
  raise exception 'TEST 7 FAILED: school_admin should NOT be able to create NULL-school student';
exception
  when others then
    if sqlerrm like '%row-level security%' or sqlerrm like '%new row violates%' then
      raise notice 'TEST 7 PASSED: school_admin blocked from creating NULL-school student';
    else
      raise exception 'TEST 7 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;

-- ===========================================================================
-- TEST 8: School admin CAN create student with own school_id
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000003';

do $$
begin
  insert into public.students (tenant_id, school_id, first_name, last_name, status)
  values ('a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'TestSchool', 'AdminOwn', 'active');
  raise notice 'TEST 8 PASSED: school_admin can create student with own school_id';
exception
  when others then
    raise exception 'TEST 8 FAILED: school_admin should be able to create student with own school_id. Error: %', sqlerrm;
end
$$;

-- Cleanup
delete from public.students where first_name = 'TestSchool' and last_name = 'AdminOwn';

-- ===========================================================================
-- TEST 9: School admin CANNOT create student with another school's school_id
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000003';

do $$
begin
  insert into public.students (tenant_id, school_id, first_name, last_name, status)
  values ('a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'TestSchool', 'AdminOther', 'active');
  raise exception 'TEST 9 FAILED: school_admin should NOT be able to create student with another school''s school_id';
exception
  when others then
    if sqlerrm like '%row-level security%' or sqlerrm like '%new row violates%' then
      raise notice 'TEST 9 PASSED: school_admin blocked from creating student with other school_id';
    else
      raise exception 'TEST 9 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;

-- ===========================================================================
-- TEST 10: Guardian CANNOT insert students
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000004';

do $$
begin
  insert into public.students (tenant_id, school_id, first_name, last_name, status)
  values ('a1000000-0000-0000-0000-000000000001', null, 'TestGuardian', 'Insert', 'active');
  raise exception 'TEST 10 FAILED: guardian should NOT be able to insert students';
exception
  when others then
    if sqlerrm like '%row-level security%' or sqlerrm like '%new row violates%' then
      raise notice 'TEST 10 PASSED: guardian blocked from inserting students';
    else
      raise exception 'TEST 10 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;

-- ===========================================================================
-- TEST 11: Guardian CANNOT update students
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000004';

do $$
declare
  v_count int;
begin
  update public.students set first_name = 'HackedByGuardian' where id = 'e5000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise exception 'TEST 11 FAILED: guardian should NOT be able to update students';
  else
    raise notice 'TEST 11 PASSED: guardian blocked from updating students (0 rows affected)';
  end if;
end
$$;

-- ===========================================================================
-- TEST 12: Driver CANNOT insert students
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000005';

do $$
begin
  insert into public.students (tenant_id, school_id, first_name, last_name, status)
  values ('a1000000-0000-0000-0000-000000000001', null, 'TestDriver', 'Insert', 'active');
  raise exception 'TEST 12 FAILED: driver should NOT be able to insert students';
exception
  when others then
    if sqlerrm like '%row-level security%' or sqlerrm like '%new row violates%' then
      raise notice 'TEST 12 PASSED: driver blocked from inserting students';
    else
      raise exception 'TEST 12 FAILED with unexpected error: %', sqlerrm;
    end if;
end
$$;

-- ===========================================================================
-- TEST 13: Driver CANNOT update students
-- ===========================================================================
set local role to 'authenticated';
set local request.jwt.claims.role to 'authenticated';
set local request.jwt.claims.sub to 'c3000000-0000-0000-0000-000000000005';

do $$
declare
  v_count int;
begin
  update public.students set first_name = 'HackedByDriver' where id = 'e5000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise exception 'TEST 13 FAILED: driver should NOT be able to update students';
  else
    raise notice 'TEST 13 PASSED: driver blocked from updating students (0 rows affected)';
  end if;
end
$$;

-- ===========================================================================
-- CLEANUP: Remove all test data
-- ===========================================================================
-- Run this after all tests are complete.
set local role to 'postgres';
set local request.jwt.claims.role to '';
set local request.jwt.claims.sub to '';

delete from public.student_guardians where tenant_id in (
  select id from public.tenants where name like 'RLS_TEST_%'
);
delete from public.students where tenant_id in (
  select id from public.tenants where name like 'RLS_TEST_%'
);
delete from public.guardians where tenant_id in (
  select id from public.tenants where name like 'RLS_TEST_%'
);
delete from public.drivers where tenant_id in (
  select id from public.tenants where name like 'RLS_TEST_%'
);
delete from public.profiles where email like 'rls_test_%';
delete from auth.users where email like 'rls_test_%';
delete from public.schools where name like 'RLS_TEST_%';
delete from public.tenants where name like 'RLS_TEST_%';
