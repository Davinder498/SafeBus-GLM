-- SafeBus Alberta - RLS Regression Tests: Driver Student Trip Events
--
-- Milestone 9A: self-contained DEV/disposable database tests for
-- driver-only pickup/drop-off event RPCs and manifest event state.

-- ===========================================================================
-- PRIVILEGED CLEANUP BEFORE SEED
-- ===========================================================================

delete from public.guardian_notification_outbox where student_trip_event_id in (
  select id from public.student_trip_events where driver_trip_id in (
    '9a200000-0000-0000-0000-000000000001',
    '9a200000-0000-0000-0000-000000000002',
    '9a200000-0000-0000-0000-000000000003'
  )
);

delete from public.student_trip_events where driver_trip_id in (
  '9a200000-0000-0000-0000-000000000001',
  '9a200000-0000-0000-0000-000000000002',
  '9a200000-0000-0000-0000-000000000003'
);

delete from public.driver_trips where id in (
  '9a200000-0000-0000-0000-000000000001',
  '9a200000-0000-0000-0000-000000000002',
  '9a200000-0000-0000-0000-000000000003'
);

delete from public.student_route_assignments where id in (
  '9a190000-0000-0000-0000-000000000001',
  '9a190000-0000-0000-0000-000000000002',
  '9a190000-0000-0000-0000-000000000003'
);

delete from public.route_stops where id in (
  '9a180000-0000-0000-0000-000000000001',
  '9a180000-0000-0000-0000-000000000002',
  '9a180000-0000-0000-0000-000000000003',
  '9a180000-0000-0000-0000-000000000004'
);

delete from public.routes where id in (
  '9a170000-0000-0000-0000-000000000001',
  '9a170000-0000-0000-0000-000000000002',
  '9a170000-0000-0000-0000-000000000003'
);

delete from public.buses where id in (
  '9a160000-0000-0000-0000-000000000001',
  '9a160000-0000-0000-0000-000000000002',
  '9a160000-0000-0000-0000-000000000003'
);

delete from public.students where id in (
  '9a150000-0000-0000-0000-000000000001',
  '9a150000-0000-0000-0000-000000000002',
  '9a150000-0000-0000-0000-000000000003'
);

delete from public.student_guardians where id in (
  '9a145000-0000-0000-0000-000000000001',
  '9a145000-0000-0000-0000-000000000002',
  '9a145000-0000-0000-0000-000000000003',
  '9a145000-0000-0000-0000-000000000004'
);

delete from public.guardians where id in (
  '9a140000-0000-0000-0000-000000000001',
  '9a140000-0000-0000-0000-000000000002',
  '9a140000-0000-0000-0000-000000000003',
  '9a140000-0000-0000-0000-000000000004'
);

delete from public.drivers where id in (
  '9a130000-0000-0000-0000-000000000001',
  '9a130000-0000-0000-0000-000000000002',
  '9a130000-0000-0000-0000-000000000003'
);

delete from public.profiles where id in (
  '9a120000-0000-0000-0000-000000000001',
  '9a120000-0000-0000-0000-000000000002',
  '9a120000-0000-0000-0000-000000000003',
  '9a120000-0000-0000-0000-000000000004',
  '9a120000-0000-0000-0000-000000000005',
  '9a120000-0000-0000-0000-000000000006',
  '9a120000-0000-0000-0000-000000000007',
  '9a120000-0000-0000-0000-000000000008'
);

delete from auth.users where id in (
  '9a120000-0000-0000-0000-000000000001',
  '9a120000-0000-0000-0000-000000000002',
  '9a120000-0000-0000-0000-000000000003',
  '9a120000-0000-0000-0000-000000000004',
  '9a120000-0000-0000-0000-000000000005',
  '9a120000-0000-0000-0000-000000000006',
  '9a120000-0000-0000-0000-000000000007',
  '9a120000-0000-0000-0000-000000000008'
);

delete from public.schools where id in (
  '9a110000-0000-0000-0000-000000000001',
  '9a110000-0000-0000-0000-000000000002'
);

delete from public.tenants where id in (
  '9a100000-0000-0000-0000-000000000001',
  '9a100000-0000-0000-0000-000000000002'
);

-- ===========================================================================
-- PRIVILEGED SEED
-- ===========================================================================

insert into public.tenants (id, name, type, status)
values
  ('9a100000-0000-0000-0000-000000000001', 'M9A_TEST_Tenant_A', 'school', 'active'),
  ('9a100000-0000-0000-0000-000000000002', 'M9A_TEST_Tenant_B', 'school', 'active');

insert into public.schools (id, tenant_id, name, province, status)
values
  ('9a110000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', 'M9A_TEST_School_A', 'AB', 'active'),
  ('9a110000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000002', 'M9A_TEST_School_B', 'AB', 'active');

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, role, aud, instance_id,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('9a120000-0000-0000-0000-000000000001', 'm9a_driver_a@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('9a120000-0000-0000-0000-000000000002', 'm9a_driver_other@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('9a120000-0000-0000-0000-000000000003', 'm9a_driver_b@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('9a120000-0000-0000-0000-000000000004', 'm9a_guardian@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('9a120000-0000-0000-0000-000000000006', 'm9a_guardian_two@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('9a120000-0000-0000-0000-000000000007', 'm9a_guardian_inactive@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('9a120000-0000-0000-0000-000000000008', 'm9a_guardian_b@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('9a120000-0000-0000-0000-000000000005', 'm9a_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, tenant_id, school_id, full_name, email, role, status)
values
  ('9a120000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', null, 'M9A Driver A', 'm9a_driver_a@test.local', 'driver', 'active'),
  ('9a120000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', null, 'M9A Other Driver', 'm9a_driver_other@test.local', 'driver', 'active'),
  ('9a120000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000002', null, 'M9A Driver B', 'm9a_driver_b@test.local', 'driver', 'active'),
  ('9a120000-0000-0000-0000-000000000004', '9a100000-0000-0000-0000-000000000001', null, 'M9A Guardian', 'm9a_guardian@test.local', 'guardian', 'active'),
  ('9a120000-0000-0000-0000-000000000006', '9a100000-0000-0000-0000-000000000001', null, 'M9A Guardian Two', 'm9a_guardian_two@test.local', 'guardian', 'active'),
  ('9a120000-0000-0000-0000-000000000007', '9a100000-0000-0000-0000-000000000001', null, 'M9A Guardian Inactive', 'm9a_guardian_inactive@test.local', 'guardian', 'active'),
  ('9a120000-0000-0000-0000-000000000008', '9a100000-0000-0000-0000-000000000002', null, 'M9A Guardian B', 'm9a_guardian_b@test.local', 'guardian', 'active'),
  ('9a120000-0000-0000-0000-000000000005', '9a100000-0000-0000-0000-000000000001', null, 'M9A Admin', 'm9a_admin@test.local', 'tenant_admin', 'active');

insert into public.drivers (id, tenant_id, profile_id, status)
values
  ('9a130000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', '9a120000-0000-0000-0000-000000000001', 'active'),
  ('9a130000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', '9a120000-0000-0000-0000-000000000002', 'active'),
  ('9a130000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000002', '9a120000-0000-0000-0000-000000000003', 'active');

insert into public.guardians (id, tenant_id, profile_id, full_name, email, status)
values
  ('9a140000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', '9a120000-0000-0000-0000-000000000004', 'M9A Guardian', 'm9a_guardian@test.local', 'active'),
  ('9a140000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', '9a120000-0000-0000-0000-000000000006', 'M9A Guardian Two', 'm9a_guardian_two@test.local', 'active'),
  ('9a140000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000001', '9a120000-0000-0000-0000-000000000007', 'M9A Inactive Link Guardian', 'm9a_guardian_inactive@test.local', 'active'),
  ('9a140000-0000-0000-0000-000000000004', '9a100000-0000-0000-0000-000000000002', '9a120000-0000-0000-0000-000000000008', 'M9A Cross Tenant Guardian', 'm9a_guardian_b@test.local', 'active');

insert into public.buses (id, tenant_id, bus_number, status)
values
  ('9a160000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', 'M9A-BUS-A1', 'active'),
  ('9a160000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', 'M9A-BUS-A2', 'active'),
  ('9a160000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000002', 'M9A-BUS-B1', 'active');

insert into public.routes (id, tenant_id, school_id, route_name, route_code, route_type, status)
values
  ('9a170000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', '9a110000-0000-0000-0000-000000000001', 'M9A Route A Own', 'M9A-A1', 'morning', 'active'),
  ('9a170000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', '9a110000-0000-0000-0000-000000000001', 'M9A Route A Other', 'M9A-A2', 'morning', 'active'),
  ('9a170000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000002', '9a110000-0000-0000-0000-000000000002', 'M9A Route B CrossTenant', 'M9A-B1', 'morning', 'active');

insert into public.route_stops (id, tenant_id, route_id, stop_name, stop_order, status)
values
  ('9a180000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', '9a170000-0000-0000-0000-000000000001', 'M9A Own Pickup', 1, 'active'),
  ('9a180000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', '9a170000-0000-0000-0000-000000000001', 'M9A Own Dropoff', 2, 'active'),
  ('9a180000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000001', '9a170000-0000-0000-0000-000000000002', 'M9A Other Pickup', 1, 'active'),
  ('9a180000-0000-0000-0000-000000000004', '9a100000-0000-0000-0000-000000000002', '9a170000-0000-0000-0000-000000000003', 'M9A CrossTenant Pickup', 1, 'active');

insert into public.students (id, tenant_id, school_id, first_name, last_name, status)
values
  ('9a150000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', '9a110000-0000-0000-0000-000000000001', 'M9A', 'OwnStudent', 'active'),
  ('9a150000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', '9a110000-0000-0000-0000-000000000001', 'M9A', 'OtherDriverStudent', 'active'),
  ('9a150000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000002', '9a110000-0000-0000-0000-000000000002', 'M9A', 'CrossTenantStudent', 'active');

insert into public.student_route_assignments (id, tenant_id, student_id, route_id, pickup_stop_id, dropoff_stop_id, status)
values
  ('9a190000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', '9a150000-0000-0000-0000-000000000001', '9a170000-0000-0000-0000-000000000001', '9a180000-0000-0000-0000-000000000001', '9a180000-0000-0000-0000-000000000002', 'active'),
  ('9a190000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', '9a150000-0000-0000-0000-000000000002', '9a170000-0000-0000-0000-000000000002', '9a180000-0000-0000-0000-000000000003', null, 'active'),
  ('9a190000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000002', '9a150000-0000-0000-0000-000000000003', '9a170000-0000-0000-0000-000000000003', '9a180000-0000-0000-0000-000000000004', null, 'active');

insert into public.driver_trips (id, tenant_id, driver_id, bus_id, route_id, trip_type, status, service_date, started_at)
values
  ('9a200000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', '9a130000-0000-0000-0000-000000000001', '9a160000-0000-0000-0000-000000000001', '9a170000-0000-0000-0000-000000000001', 'morning', 'active', current_date, now() - interval '20 minutes'),
  ('9a200000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', '9a130000-0000-0000-0000-000000000002', '9a160000-0000-0000-0000-000000000002', '9a170000-0000-0000-0000-000000000002', 'morning', 'active', current_date, now() - interval '15 minutes'),
  ('9a200000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000002', '9a130000-0000-0000-0000-000000000003', '9a160000-0000-0000-0000-000000000003', '9a170000-0000-0000-0000-000000000003', 'morning', 'active', current_date, now() - interval '10 minutes');


insert into public.student_guardians (id, tenant_id, student_id, guardian_id, relationship, can_receive_notifications, status)
values
  ('9a145000-0000-0000-0000-000000000001', '9a100000-0000-0000-0000-000000000001', '9a150000-0000-0000-0000-000000000001', '9a140000-0000-0000-0000-000000000001', 'guardian', true, 'active'),
  ('9a145000-0000-0000-0000-000000000002', '9a100000-0000-0000-0000-000000000001', '9a150000-0000-0000-0000-000000000001', '9a140000-0000-0000-0000-000000000002', 'guardian', true, 'active'),
  ('9a145000-0000-0000-0000-000000000003', '9a100000-0000-0000-0000-000000000001', '9a150000-0000-0000-0000-000000000001', '9a140000-0000-0000-0000-000000000003', 'guardian', true, 'inactive'),
  ('9a145000-0000-0000-0000-000000000004', '9a100000-0000-0000-0000-000000000002', '9a150000-0000-0000-0000-000000000003', '9a140000-0000-0000-0000-000000000004', 'guardian', true, 'active');

-- TEST 1-6: Valid pickup creates one row per active linked same-tenant guardian only.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '9a120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"9a120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin perform public.mark_student_picked_up_for_active_trip('9a150000-0000-0000-0000-000000000001'); end $$;
reset role;
do $$
declare v_count int;
begin
  select count(*) into v_count from public.guardian_notification_outbox where tenant_id = '9a100000-0000-0000-0000-000000000001' and student_id = '9a150000-0000-0000-0000-000000000001' and notification_type = 'student_picked_up';
  if v_count <> 2 then raise exception 'TEST 1-3 FAILED: expected 2 active linked guardian pickup rows, got %', v_count; end if;
  if exists (select 1 from public.guardian_notification_outbox where guardian_id in ('9a140000-0000-0000-0000-000000000003','9a140000-0000-0000-0000-000000000004')) then raise exception 'TEST 4-6 FAILED: inactive/unlinked/cross-tenant guardian received outbox row'; end if;
  raise notice 'TEST 1-6 PASSED: valid pickup enqueues only active linked same-tenant guardians';
end $$;
rollback;

-- TEST 2/3: Valid drop-off creates one row per active linked guardian.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '9a120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"9a120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin perform public.mark_student_picked_up_for_active_trip('9a150000-0000-0000-0000-000000000001'); perform public.mark_student_dropped_off_for_active_trip('9a150000-0000-0000-0000-000000000001'); end $$;
reset role;
do $$ declare v_count int; begin
  select count(*) into v_count from public.guardian_notification_outbox where student_id = '9a150000-0000-0000-0000-000000000001' and notification_type = 'student_dropped_off';
  if v_count <> 2 then raise exception 'TEST 2/3 FAILED: expected 2 drop-off rows, got %', v_count; end if;
  raise notice 'TEST 2/3 PASSED: valid drop-off enqueues active linked guardians';
end $$;
rollback;

-- TEST 7/8: Duplicate attempts do not create duplicate outbox rows.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '9a120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"9a120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  perform public.mark_student_picked_up_for_active_trip('9a150000-0000-0000-0000-000000000001');
  begin perform public.mark_student_picked_up_for_active_trip('9a150000-0000-0000-0000-000000000001'); exception when unique_violation then null; end;
  perform public.mark_student_dropped_off_for_active_trip('9a150000-0000-0000-0000-000000000001');
  begin perform public.mark_student_dropped_off_for_active_trip('9a150000-0000-0000-0000-000000000001'); exception when unique_violation then null; end;
end $$;
reset role;
do $$ declare v_count int; begin
  select count(*) into v_count from public.guardian_notification_outbox where student_id = '9a150000-0000-0000-0000-000000000001';
  if v_count <> 4 then raise exception 'TEST 7/8 FAILED: expected 4 total rows after duplicate attempts, got %', v_count; end if;
  raise notice 'TEST 7/8 PASSED: duplicate event attempts do not duplicate outbox';
end $$;
rollback;

-- TEST 9: Drop-off before pickup creates no outbox row.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '9a120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"9a120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin begin perform public.mark_student_dropped_off_for_active_trip('9a150000-0000-0000-0000-000000000001'); raise exception 'TEST 9 FAILED: drop-off before pickup allowed'; exception when check_violation then null; end; end $$;
reset role;
do $$ begin if exists (select 1 from public.guardian_notification_outbox) then raise exception 'TEST 9 FAILED: outbox row created for rejected drop-off'; end if; raise notice 'TEST 9 PASSED: rejected drop-off creates no outbox'; end $$;
rollback;

-- TEST 10-12: Wrong role, cross-driver, and cross-tenant attempts create no outbox rows.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '9a120000-0000-0000-0000-000000000004';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"9a120000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$ begin begin perform public.mark_student_picked_up_for_active_trip('9a150000-0000-0000-0000-000000000001'); raise exception 'TEST 10 FAILED: guardian recorded event'; exception when insufficient_privilege then null; end; end $$;
reset role;
do $$ begin if exists (select 1 from public.guardian_notification_outbox) then raise exception 'TEST 10 FAILED: wrong-role outbox row created'; end if; raise notice 'TEST 10 PASSED: wrong role creates no outbox'; end $$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '9a120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"9a120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin begin perform public.mark_student_picked_up_for_active_trip('9a150000-0000-0000-0000-000000000002'); raise exception 'TEST 11 FAILED: cross-driver event allowed'; exception when no_data_found then null; end; begin perform public.mark_student_picked_up_for_active_trip('9a150000-0000-0000-0000-000000000003'); raise exception 'TEST 12 FAILED: cross-tenant event allowed'; exception when no_data_found then null; end; end $$;
reset role;
do $$ begin if exists (select 1 from public.guardian_notification_outbox) then raise exception 'TEST 11/12 FAILED: rejected driver attempt created outbox'; end if; raise notice 'TEST 11/12 PASSED: cross-driver/cross-tenant attempts create no outbox'; end $$;
rollback;

-- TEST 13/14: Direct browser-style SELECT and INSERT are blocked.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '9a120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"9a120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare v_count int; begin
  begin select count(*) into v_count from public.guardian_notification_outbox; raise exception 'TEST 13 FAILED: direct outbox SELECT was allowed'; exception when insufficient_privilege then null; end;
  begin insert into public.guardian_notification_outbox (tenant_id, guardian_id, student_id, student_trip_event_id, notification_type) values ('9a100000-0000-0000-0000-000000000001','9a140000-0000-0000-0000-000000000001','9a150000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','student_picked_up'); raise exception 'TEST 14 FAILED: direct outbox INSERT was allowed'; exception when insufficient_privilege then null; end;
  raise notice 'TEST 13/14 PASSED: direct outbox access is blocked';
end $$;
rollback;

-- TEST 15: Existing 7B behavior still records event state in driver manifest.
begin;
set local role authenticated;
set local request.jwt.claim.sub = '9a120000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"9a120000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare v_status text; begin
  perform public.mark_student_picked_up_for_active_trip('9a150000-0000-0000-0000-000000000001');
  select student_trip_status into v_status from public.get_driver_active_trip_student_manifest() where student_id = '9a150000-0000-0000-0000-000000000001';
  if v_status <> 'picked_up' then raise exception 'TEST 15 FAILED: expected picked_up, got %', v_status; end if;
  raise notice 'TEST 15 PASSED: existing driver event behavior still works';
end $$;
rollback;
-- ===========================================================================
-- PRIVILEGED CLEANUP AFTER TESTS
-- ===========================================================================

delete from public.guardian_notification_outbox where student_trip_event_id in (select id from public.student_trip_events where driver_trip_id in ('9a200000-0000-0000-0000-000000000001','9a200000-0000-0000-0000-000000000002','9a200000-0000-0000-0000-000000000003'));

delete from public.student_trip_events where driver_trip_id in (
  '9a200000-0000-0000-0000-000000000001',
  '9a200000-0000-0000-0000-000000000002',
  '9a200000-0000-0000-0000-000000000003'
);

delete from public.driver_trips where id in (
  '9a200000-0000-0000-0000-000000000001',
  '9a200000-0000-0000-0000-000000000002',
  '9a200000-0000-0000-0000-000000000003'
);

delete from public.student_route_assignments where id in (
  '9a190000-0000-0000-0000-000000000001',
  '9a190000-0000-0000-0000-000000000002',
  '9a190000-0000-0000-0000-000000000003'
);

delete from public.route_stops where id in (
  '9a180000-0000-0000-0000-000000000001',
  '9a180000-0000-0000-0000-000000000002',
  '9a180000-0000-0000-0000-000000000003',
  '9a180000-0000-0000-0000-000000000004'
);

delete from public.routes where id in (
  '9a170000-0000-0000-0000-000000000001',
  '9a170000-0000-0000-0000-000000000002',
  '9a170000-0000-0000-0000-000000000003'
);

delete from public.buses where id in (
  '9a160000-0000-0000-0000-000000000001',
  '9a160000-0000-0000-0000-000000000002',
  '9a160000-0000-0000-0000-000000000003'
);

delete from public.students where id in (
  '9a150000-0000-0000-0000-000000000001',
  '9a150000-0000-0000-0000-000000000002',
  '9a150000-0000-0000-0000-000000000003'
);

delete from public.student_guardians where id in ('9a145000-0000-0000-0000-000000000001','9a145000-0000-0000-0000-000000000002','9a145000-0000-0000-0000-000000000003','9a145000-0000-0000-0000-000000000004');

delete from public.guardians where id in ('9a140000-0000-0000-0000-000000000001','9a140000-0000-0000-0000-000000000002','9a140000-0000-0000-0000-000000000003','9a140000-0000-0000-0000-000000000004');

delete from public.drivers where id in (
  '9a130000-0000-0000-0000-000000000001',
  '9a130000-0000-0000-0000-000000000002',
  '9a130000-0000-0000-0000-000000000003'
);

delete from public.profiles where id in (
  '9a120000-0000-0000-0000-000000000001',
  '9a120000-0000-0000-0000-000000000002',
  '9a120000-0000-0000-0000-000000000003',
  '9a120000-0000-0000-0000-000000000004',
  '9a120000-0000-0000-0000-000000000005','9a120000-0000-0000-0000-000000000006','9a120000-0000-0000-0000-000000000007','9a120000-0000-0000-0000-000000000008'
);

delete from auth.users where id in (
  '9a120000-0000-0000-0000-000000000001',
  '9a120000-0000-0000-0000-000000000002',
  '9a120000-0000-0000-0000-000000000003',
  '9a120000-0000-0000-0000-000000000004',
  '9a120000-0000-0000-0000-000000000005','9a120000-0000-0000-0000-000000000006','9a120000-0000-0000-0000-000000000007','9a120000-0000-0000-0000-000000000008'
);

delete from public.schools where id in (
  '9a110000-0000-0000-0000-000000000001',
  '9a110000-0000-0000-0000-000000000002'
);

delete from public.tenants where id in (
  '9a100000-0000-0000-0000-000000000001',
  '9a100000-0000-0000-0000-000000000002'
);
