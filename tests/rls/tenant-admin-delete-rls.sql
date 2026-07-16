-- SafeBus Alberta - RLS Regression Tests: Tenant Admin Delete
--
-- Milestone: Tenant admin hard-delete for routes, students, buses, drivers,
-- and guardians.
--
-- HOW TO RUN:
--   1. Open the hosted Supabase DEV project SQL Editor.
--   2. Run this whole file, or run the sections in order.
--   3. Do not run against production.
--
-- The seed and cleanup blocks run in the privileged SQL Editor context.
-- Every simulated authenticated/anonymous user assertion runs inside its own
-- explicit transaction with transaction-local role/JWT settings and rollback.

-- ===========================================================================
-- PRIVILEGED CLEANUP BEFORE SEED
-- ===========================================================================

delete from public.student_guardians where tenant_id = 'a1000000-0000-0000-0000-000000000001';
delete from public.student_route_assignments where tenant_id = 'a1000000-0000-0000-0000-000000000001';
delete from public.route_stops where tenant_id = 'a1000000-0000-0000-0000-000000000001';
delete from public.routes where tenant_id in ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002');
delete from public.students where tenant_id in ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002');
delete from public.guardians where tenant_id in ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002');
delete from public.drivers where tenant_id in ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002');
delete from public.buses where tenant_id in ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002');

delete from public.profiles where id in (
  'c3000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000002',
  'c3000000-0000-0000-0000-000000000003',
  'c3000000-0000-0000-0000-000000000004'
);

delete from auth.users where id in (
  'c3000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000002',
  'c3000000-0000-0000-0000-000000000003',
  'c3000000-0000-0000-0000-000000000004'
);

delete from public.schools where id in (
  'b2000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000002'
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
  ('a1000000-0000-0000-0000-000000000001', 'RLS_DELETE_Tenant_A', 'school', 'active'),
  ('a1000000-0000-0000-0000-000000000002', 'RLS_DELETE_Tenant_B', 'school', 'active');

insert into public.schools (id, tenant_id, name, province, status)
values
  ('b2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'RLS_DELETE_School_A1', 'AB', 'active'),
  ('b2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'RLS_DELETE_School_B1', 'AB', 'active');

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
  ('c3000000-0000-0000-0000-000000000001', 'rls_delete_tenant_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3000000-0000-0000-0000-000000000002', 'rls_delete_transportation_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3000000-0000-0000-0000-000000000003', 'rls_delete_guardian@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c3000000-0000-0000-0000-000000000004', 'rls_delete_driver@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, tenant_id, school_id, full_name, email, role, status)
values
  ('c3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS Delete Tenant Admin', 'rls_delete_tenant_admin@test.local', 'tenant_admin', 'active'),
  ('c3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'RLS Delete Transportation Admin', 'rls_delete_transportation_admin@test.local', 'transportation_admin', 'active'),
  ('c3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', null, 'RLS Delete Guardian', 'rls_delete_guardian@test.local', 'guardian', 'active'),
  ('c3000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', null, 'RLS Delete Driver', 'rls_delete_driver@test.local', 'driver', 'active');

insert into public.buses (id, tenant_id, bus_number, status)
values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'DEL-001', 'active'),
  ('e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'DEL-002', 'active');

insert into public.drivers (id, tenant_id, profile_id, status)
values
  ('e2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000004', 'active'),
  ('e2000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000004', 'active');

insert into public.routes (id, tenant_id, school_id, route_name, route_code, route_type, status)
values
  ('e3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'DEL Route A', 'DEL-A', 'morning', 'active'),
  ('e3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'DEL Route B', 'DEL-B', 'morning', 'active');

insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
values
  ('e4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000001', 'DEL', 'Student_A', 'active'),
  ('e4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'DEL', 'Student_B', 'active');

insert into public.guardians (id, tenant_id, profile_id, full_name, email, status)
values
  ('e5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'c3000000-0000-0000-0000-000000000003', 'DEL Guardian A', 'rls_delete_guardian@test.local', 'active'),
  ('e5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', 'c3000000-0000-0000-0000-000000000003', 'DEL Guardian B', 'rls_delete_guardian@test.local', 'active');

-- ===========================================================================
-- TEST 1: Tenant admin CAN delete own-tenant bus
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
    raise exception 'TEST 1 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 1 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  delete from public.buses where id = 'e1000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'TEST 1 FAILED: expected 1 deleted row, got %', v_count;
  end if;
  raise notice 'TEST 1 PASSED: tenant_admin can delete own-tenant bus';
end
$$;
rollback;

-- ===========================================================================
-- TEST 2: Tenant admin CANNOT delete another tenant's bus
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
    raise exception 'TEST 2 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;

  delete from public.buses where id = 'e1000000-0000-0000-0000-000000000002';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 2 FAILED: expected 0 cross-tenant deleted rows, got %', v_count;
  end if;
  raise notice 'TEST 2 PASSED: tenant_admin cannot delete cross-tenant bus';
end
$$;
rollback;

-- ===========================================================================
-- TEST 3: Transportation admin CANNOT delete (not a delete admin)
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
    raise exception 'TEST 3 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'transportation_admin' then
    raise exception 'TEST 3 FAILED: expected transportation_admin, got %', public.current_user_role();
  end if;

  delete from public.buses where id = 'e1000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 3 FAILED: transportation_admin should not delete, got % rows', v_count;
  end if;
  raise notice 'TEST 3 PASSED: transportation_admin cannot delete bus';
end
$$;
rollback;

-- ===========================================================================
-- TEST 4: Guardian CANNOT delete bus
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
    raise exception 'TEST 4 FAILED: auth.uid() simulation failed: %', auth.uid();
  end if;
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 4 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  delete from public.buses where id = 'e1000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 4 FAILED: guardian should not delete, got % rows', v_count;
  end if;
  raise notice 'TEST 4 PASSED: guardian cannot delete bus';
end
$$;
rollback;

-- ===========================================================================
-- TEST 5: Tenant admin CAN delete own-tenant driver
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
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 5 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  delete from public.drivers where id = 'e2000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'TEST 5 FAILED: expected 1 deleted row, got %', v_count;
  end if;
  raise notice 'TEST 5 PASSED: tenant_admin can delete own-tenant driver';
end
$$;
rollback;

-- ===========================================================================
-- TEST 6: Tenant admin CANNOT delete cross-tenant driver
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
  delete from public.drivers where id = 'e2000000-0000-0000-0000-000000000002';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 6 FAILED: expected 0 cross-tenant deleted rows, got %', v_count;
  end if;
  raise notice 'TEST 6 PASSED: tenant_admin cannot delete cross-tenant driver';
end
$$;
rollback;

-- ===========================================================================
-- TEST 7: Tenant admin CAN delete own-tenant route
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
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 7 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  delete from public.routes where id = 'e3000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'TEST 7 FAILED: expected 1 deleted row, got %', v_count;
  end if;
  raise notice 'TEST 7 PASSED: tenant_admin can delete own-tenant route';
end
$$;
rollback;

-- ===========================================================================
-- TEST 8: Tenant admin CANNOT delete cross-tenant route
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
  delete from public.routes where id = 'e3000000-0000-0000-0000-000000000002';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 8 FAILED: expected 0 cross-tenant deleted rows, got %', v_count;
  end if;
  raise notice 'TEST 8 PASSED: tenant_admin cannot delete cross-tenant route';
end
$$;
rollback;

-- ===========================================================================
-- TEST 9: Tenant admin CAN delete own-tenant student
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
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 9 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  delete from public.students where id = 'e4000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'TEST 9 FAILED: expected 1 deleted row, got %', v_count;
  end if;
  raise notice 'TEST 9 PASSED: tenant_admin can delete own-tenant student';
end
$$;
rollback;

-- ===========================================================================
-- TEST 10: Tenant admin CANNOT delete cross-tenant student
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
  delete from public.students where id = 'e4000000-0000-0000-0000-000000000002';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 10 FAILED: expected 0 cross-tenant deleted rows, got %', v_count;
  end if;
  raise notice 'TEST 10 PASSED: tenant_admin cannot delete cross-tenant student';
end
$$;
rollback;

-- ===========================================================================
-- TEST 11: Tenant admin CAN delete own-tenant guardian
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
  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'TEST 11 FAILED: expected tenant_admin, got %', public.current_user_role();
  end if;

  delete from public.guardians where id = 'e5000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'TEST 11 FAILED: expected 1 deleted row, got %', v_count;
  end if;
  raise notice 'TEST 11 PASSED: tenant_admin can delete own-tenant guardian';
end
$$;
rollback;

-- ===========================================================================
-- TEST 12: Tenant admin CANNOT delete cross-tenant guardian
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
  delete from public.guardians where id = 'e5000000-0000-0000-0000-000000000002';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 12 FAILED: expected 0 cross-tenant deleted rows, got %', v_count;
  end if;
  raise notice 'TEST 12 PASSED: tenant_admin cannot delete cross-tenant guardian';
end
$$;
rollback;

-- ===========================================================================
-- TEST 13: Guardian CANNOT delete own guardian record
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
  if public.current_user_role() <> 'guardian' then
    raise exception 'TEST 13 FAILED: expected guardian, got %', public.current_user_role();
  end if;

  delete from public.guardians where id = 'e5000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 13 FAILED: guardian should not delete, got % rows', v_count;
  end if;
  raise notice 'TEST 13 PASSED: guardian cannot delete own record';
end
$$;
rollback;

-- ===========================================================================
-- TEST 14: Anonymous CANNOT delete any record
-- ===========================================================================
begin;
set local role anon;
do $$
declare
  v_count int;
begin
  if auth.uid() is not null then
    raise exception 'TEST 14 FAILED: expected anonymous auth.uid() NULL, got %', auth.uid();
  end if;

  delete from public.buses where id = 'e1000000-0000-0000-0000-000000000001';
  get diagnostics v_count = row_count;
  if v_count <> 0 then
    raise exception 'TEST 14 FAILED: anonymous should not delete bus, got % rows', v_count;
  end if;
  raise notice 'TEST 14 PASSED: anonymous cannot delete any record';
end
$$;
rollback;

-- ===========================================================================
-- PRIVILEGED CLEANUP AFTER TESTS
-- ===========================================================================

delete from public.student_guardians where tenant_id = 'a1000000-0000-0000-0000-000000000001';
delete from public.student_route_assignments where tenant_id = 'a1000000-0000-0000-0000-000000000001';
delete from public.route_stops where tenant_id = 'a1000000-0000-0000-0000-000000000001';
delete from public.routes where tenant_id in ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002');
delete from public.students where tenant_id in ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002');
delete from public.guardians where tenant_id in ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002');
delete from public.drivers where tenant_id in ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002');
delete from public.buses where tenant_id in ('a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002');

delete from public.profiles where id in (
  'c3000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000002',
  'c3000000-0000-0000-0000-000000000003',
  'c3000000-0000-0000-0000-000000000004'
);

delete from auth.users where id in (
  'c3000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000002',
  'c3000000-0000-0000-0000-000000000003',
  'c3000000-0000-0000-0000-000000000004'
);

delete from public.schools where id in (
  'b2000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000002'
);

delete from public.tenants where id in (
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002'
);