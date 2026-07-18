-- SafeBus Alberta - tenant admin student CSV import RLS regression
--
-- SELF-CONTAINED. DEV/STAGING ONLY. Requires migrations through 0044.
-- Fixed fixtures are cleaned before and after the assertions.

delete from public.students
where tenant_id in (
  'a4400000-0000-0000-0000-000000000001',
  'a4400000-0000-0000-0000-000000000002'
);
delete from public.profiles
where id in (
  'c4400000-0000-0000-0000-000000000001',
  'c4400000-0000-0000-0000-000000000002',
  'c4400000-0000-0000-0000-000000000003'
);
delete from auth.users
where id in (
  'c4400000-0000-0000-0000-000000000001',
  'c4400000-0000-0000-0000-000000000002',
  'c4400000-0000-0000-0000-000000000003'
);
delete from public.schools
where tenant_id in (
  'a4400000-0000-0000-0000-000000000001',
  'a4400000-0000-0000-0000-000000000002'
);
delete from public.tenants
where id in (
  'a4400000-0000-0000-0000-000000000001',
  'a4400000-0000-0000-0000-000000000002'
);

insert into public.tenants (id, name, type, status)
values
  ('a4400000-0000-0000-0000-000000000001', 'CSV_IMPORT_TEST_TENANT_A', 'school', 'active'),
  ('a4400000-0000-0000-0000-000000000002', 'CSV_IMPORT_TEST_TENANT_B', 'school', 'active');

insert into public.schools (id, tenant_id, name, province, status)
values
  ('b4400000-0000-0000-0000-000000000001', 'a4400000-0000-0000-0000-000000000001', 'CSV Import School', 'AB', 'active'),
  ('b4400000-0000-0000-0000-000000000002', 'a4400000-0000-0000-0000-000000000002', 'Other Tenant School', 'AB', 'active'),
  ('b4400000-0000-0000-0000-000000000003', 'a4400000-0000-0000-0000-000000000001', 'Ambiguous CSV School', 'AB', 'active'),
  ('b4400000-0000-0000-0000-000000000004', 'a4400000-0000-0000-0000-000000000001', 'Ambiguous CSV School', 'AB', 'active');

insert into auth.users (
  id, email, encrypted_password, email_confirmed_at, role, aud, instance_id,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('c4400000-0000-0000-0000-000000000001', 'csv_tenant_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c4400000-0000-0000-0000-000000000002', 'csv_transport_admin@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('c4400000-0000-0000-0000-000000000003', 'csv_guardian@test.local', crypt('testpassword', gen_salt('bf')), now(), 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000', '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (id, tenant_id, school_id, full_name, email, role, status)
values
  ('c4400000-0000-0000-0000-000000000001', 'a4400000-0000-0000-0000-000000000001', null, 'CSV Tenant Admin', 'csv_tenant_admin@test.local', 'tenant_admin', 'active'),
  ('c4400000-0000-0000-0000-000000000002', 'a4400000-0000-0000-0000-000000000001', null, 'CSV Transportation Admin', 'csv_transport_admin@test.local', 'transportation_admin', 'active'),
  ('c4400000-0000-0000-0000-000000000003', 'a4400000-0000-0000-0000-000000000001', null, 'CSV Guardian', 'csv_guardian@test.local', 'guardian', 'active');

insert into public.students (
  id, tenant_id, school_id, first_name, last_name, grade, status
)
values (
  'e4400000-0000-0000-0000-000000000001',
  'a4400000-0000-0000-0000-000000000001',
  'b4400000-0000-0000-0000-000000000001',
  'Existing',
  'Student',
  '4',
  'active'
);

-- Preview validates case-insensitive school names, returns duplicate warnings,
-- and never inserts rows.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c4400000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c4400000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_before bigint;
  v_after bigint;
  v_result jsonb;
begin
  select count(*) into v_before
  from public.students
  where tenant_id = public.current_tenant_id();

  v_result := public.admin_process_student_csv_import(
    jsonb_build_array(
      jsonb_build_object(
        'rowNumber', 2,
        'firstName', 'Existing',
        'lastName', 'Student',
        'preferredName', '',
        'grade', '4',
        'schoolName', 'csv import school'
      ),
      jsonb_build_object(
        'rowNumber', 3,
        'firstName', 'New',
        'lastName', 'Student',
        'preferredName', '',
        'grade', '',
        'schoolName', ''
      )
    ),
    false,
    false
  );

  if jsonb_array_length(v_result->'errors') <> 0
     or not (v_result->'warnings') @> '[{"code":"possible_existing_duplicate","rowNumber":2}]'::jsonb
     or (v_result->>'rowCount')::integer <> 2
     or (v_result->>'importedCount')::integer <> 0 then
    raise exception 'CSV TEST 1 FAILED: unexpected preview result %', v_result;
  end if;

  select count(*) into v_after
  from public.students
  where tenant_id = public.current_tenant_id();
  if v_after <> v_before then
    raise exception 'CSV TEST 1 FAILED: preview inserted rows';
  end if;
  raise notice 'CSV TEST 1 PASSED: preview is read-only and tenant-scoped';
end
$$;
rollback;

-- Acknowledged warnings allow one atomic create-only commit.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c4400000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c4400000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_result jsonb;
  v_created bigint;
begin
  v_result := public.admin_process_student_csv_import(
    jsonb_build_array(
      jsonb_build_object(
        'rowNumber', 2,
        'firstName', 'Atomic',
        'lastName', 'One',
        'preferredName', '',
        'grade', '5',
        'schoolName', 'CSV Import School'
      ),
      jsonb_build_object(
        'rowNumber', 3,
        'firstName', 'Atomic',
        'lastName', 'Two',
        'preferredName', 'A.T.',
        'grade', '',
        'schoolName', ''
      )
    ),
    true,
    true
  );

  select count(*) into v_created
  from public.students
  where tenant_id = public.current_tenant_id()
    and first_name = 'Atomic';
  if (v_result->>'importedCount')::integer <> 2
     or jsonb_array_length(v_result->'errors') <> 0
     or v_created <> 2 then
    raise exception 'CSV TEST 2 FAILED: atomic commit result %, created %', v_result, v_created;
  end if;
  raise notice 'CSV TEST 2 PASSED: tenant admin committed all rows';
end
$$;
rollback;

-- One invalid/cross-tenant school blocks the entire file.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c4400000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c4400000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_result jsonb;
  v_created bigint;
begin
  v_result := public.admin_process_student_csv_import(
    jsonb_build_array(
      jsonb_build_object(
        'rowNumber', 2,
        'firstName', 'MustNot',
        'lastName', 'Persist',
        'preferredName', '',
        'grade', '',
        'schoolName', ''
      ),
      jsonb_build_object(
        'rowNumber', 3,
        'firstName', 'Cross',
        'lastName', 'Tenant',
        'preferredName', '',
        'grade', '',
        'schoolName', 'Other Tenant School'
      )
    ),
    true,
    true
  );

  select count(*) into v_created
  from public.students
  where tenant_id = public.current_tenant_id()
    and first_name in ('MustNot', 'Cross');
  if not (v_result->'errors') @> '[{"code":"school_not_found","rowNumber":3}]'::jsonb
     or (v_result->>'importedCount')::integer <> 0
     or v_created <> 0 then
    raise exception 'CSV TEST 3 FAILED: invalid file was partially saved: %', v_result;
  end if;
  raise notice 'CSV TEST 3 PASSED: invalid file creates zero rows';
end
$$;
rollback;

-- Ambiguous schools, unknown fields, and unacknowledged duplicate warnings
-- fail closed.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c4400000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c4400000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_ambiguous jsonb;
  v_unknown jsonb;
  v_warning jsonb;
begin
  v_ambiguous := public.admin_process_student_csv_import(
    jsonb_build_array(jsonb_build_object(
      'rowNumber', 2, 'firstName', 'Ambiguous', 'lastName', 'School',
      'preferredName', '', 'grade', '', 'schoolName', 'Ambiguous CSV School'
    )),
    true,
    true
  );
  if not (v_ambiguous->'errors') @> '[{"code":"ambiguous_school","rowNumber":2}]'::jsonb then
    raise exception 'CSV TEST 4 FAILED: ambiguous school accepted: %', v_ambiguous;
  end if;

  v_unknown := public.admin_process_student_csv_import(
    jsonb_build_array(jsonb_build_object(
      'rowNumber', 2, 'firstName', 'Unknown', 'lastName', 'Field',
      'preferredName', '', 'grade', '', 'schoolName', '', 'extraField', 'blocked'
    )),
    true,
    true
  );
  if not (v_unknown->'errors') @> '[{"code":"unknown_field","rowNumber":2}]'::jsonb then
    raise exception 'CSV TEST 4 FAILED: unknown field accepted: %', v_unknown;
  end if;

  v_warning := public.admin_process_student_csv_import(
    jsonb_build_array(jsonb_build_object(
      'rowNumber', 2, 'firstName', 'Existing', 'lastName', 'Student',
      'preferredName', '', 'grade', '4', 'schoolName', 'CSV Import School'
    )),
    true,
    false
  );
  if not (v_warning->'errors') @> '[{"code":"warnings_not_acknowledged"}]'::jsonb
     or (v_warning->>'importedCount')::integer <> 0 then
    raise exception 'CSV TEST 4 FAILED: warning acknowledgement not enforced: %', v_warning;
  end if;
  raise notice 'CSV TEST 4 PASSED: validation and acknowledgement fail closed';
end
$$;
rollback;

-- The server rejects more than 5,000 rows before any write.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c4400000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c4400000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$
declare
  v_result jsonb;
begin
  select public.admin_process_student_csv_import(
    jsonb_agg(jsonb_build_object(
      'rowNumber', n + 1,
      'firstName', 'Limit',
      'lastName', n::text,
      'preferredName', '',
      'grade', '',
      'schoolName', ''
    )),
    true,
    true
  )
  into v_result
  from generate_series(1, 5001) n;

  if not (v_result->'errors') @> '[{"code":"row_limit"}]'::jsonb
     or (v_result->>'importedCount')::integer <> 0 then
    raise exception 'CSV TEST 5 FAILED: row limit not enforced: %', v_result;
  end if;
  raise notice 'CSV TEST 5 PASSED: row limit enforced';
end
$$;
rollback;

-- Non-tenant-admin authenticated roles cannot call the import RPC.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c4400000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c4400000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$
begin
  begin
    perform public.admin_process_student_csv_import('[]'::jsonb, false, false);
    raise exception 'CSV TEST 6 FAILED: transportation admin called import RPC';
  exception
    when insufficient_privilege then null;
  end;
  raise notice 'CSV TEST 6 PASSED: transportation admin denied';
end
$$;
rollback;

begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c4400000-0000-0000-0000-000000000003';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c4400000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$
begin
  begin
    perform public.admin_process_student_csv_import('[]'::jsonb, false, false);
    raise exception 'CSV TEST 7 FAILED: guardian called import RPC';
  exception
    when insufficient_privilege then null;
  end;
  raise notice 'CSV TEST 7 PASSED: guardian denied';
end
$$;
rollback;

begin;
set local role anon;
do $$
begin
  begin
    perform public.admin_process_student_csv_import('[]'::jsonb, false, false);
    raise exception 'CSV TEST 8 FAILED: anonymous caller executed import RPC';
  exception
    when insufficient_privilege then null;
  end;
  raise notice 'CSV TEST 8 PASSED: anonymous caller denied';
end
$$;
rollback;

reset role;
delete from public.students
where tenant_id in (
  'a4400000-0000-0000-0000-000000000001',
  'a4400000-0000-0000-0000-000000000002'
);
delete from public.profiles
where id in (
  'c4400000-0000-0000-0000-000000000001',
  'c4400000-0000-0000-0000-000000000002',
  'c4400000-0000-0000-0000-000000000003'
);
delete from auth.users
where id in (
  'c4400000-0000-0000-0000-000000000001',
  'c4400000-0000-0000-0000-000000000002',
  'c4400000-0000-0000-0000-000000000003'
);
delete from public.schools
where tenant_id in (
  'a4400000-0000-0000-0000-000000000001',
  'a4400000-0000-0000-0000-000000000002'
);
delete from public.tenants
where id in (
  'a4400000-0000-0000-0000-000000000001',
  'a4400000-0000-0000-0000-000000000002'
);
