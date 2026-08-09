-- SafeBus Alberta - Phase 5 exit-gate regression suite
-- Run only against hosted Supabase DEV or a disposable migrated database
-- after migrations through 0078. The transaction is always rolled back.

begin;

-- Keep repeated hosted-DEV runs deterministic. Fixed Phase 5 fixtures may
-- already exist after an interrupted run, so ON CONFLICT updates can execute
-- the sensitive-profile triggers during setup. Supply the same verified
-- platform-admin context used by the lifecycle assertions before seeding.
select set_config('request.jwt.claim.sub', '55555550-5555-5555-5555-555555555550', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"55555550-5555-5555-5555-555555555550","role":"authenticated","aal":"aal2"}', true);

do $$ begin raise notice 'STAGE: Phase 5 fixture seed'; end $$;

do $$
declare
  v_tenant_id uuid := '55555555-5555-5555-5555-555555555555';
  v_platform_id uuid := '55555550-5555-5555-5555-555555555550';
  v_admin_1 uuid := '55555551-5555-5555-5555-555555555551';
  v_admin_2 uuid := '55555552-5555-5555-5555-555555555552';
  v_school_admin uuid := '55555553-5555-5555-5555-555555555553';
begin
  insert into public.tenants (id, name, type, status)
  values (v_tenant_id, 'Phase 5 Exit Gate Tenant', 'demo', 'active')
  on conflict (id) do update set name = excluded.name, status = 'active';

  insert into public.schools (id, tenant_id, name, status)
  values (
    '55555559-5555-5555-5555-555555555559', v_tenant_id,
    'Phase 5 Exit Gate School', 'active'
  )
  on conflict (id) do update set name = excluded.name, status = 'active';

  insert into auth.users (
    id, email, aud, role, email_confirmed_at, last_sign_in_at, instance_id,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values
    (v_platform_id, 'phase5.platform@example.test', 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (v_admin_1, 'phase5.admin1@example.test', 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (v_admin_2, 'phase5.admin2@example.test', 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    (v_school_admin, 'phase5.school@example.test', 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}', '{}', now(), now())
  on conflict (id) do update set email = excluded.email, last_sign_in_at = now(), updated_at = now();

  insert into public.profiles (
    id, tenant_id, full_name, first_name, last_name, email, role, status
  ) values
    (v_platform_id, null, 'Phase5 Platform', 'Phase5', 'Platform', 'phase5.platform@example.test', 'platform_super_admin', 'active'),
    (v_admin_1, v_tenant_id, 'Phase5 Admin One', 'Phase5', 'Admin One', 'phase5.admin1@example.test', 'tenant_admin', 'active'),
    (v_admin_2, v_tenant_id, 'Phase5 Admin Two', 'Phase5', 'Admin Two', 'phase5.admin2@example.test', 'tenant_admin', 'active'),
    (v_school_admin, v_tenant_id, 'Phase5 School Admin', 'Phase5', 'School Admin', 'phase5.school@example.test', 'school_admin', 'suspended')
  on conflict (id) do update set
    tenant_id = excluded.tenant_id, full_name = excluded.full_name,
    first_name = excluded.first_name, last_name = excluded.last_name,
    email = excluded.email, role = excluded.role, status = excluded.status;
end $$;

-- Final-admin protection covers status, role, and delete paths.
do $$ begin raise notice 'STAGE: Phase 5 final-admin protection'; end $$;
do $$
declare
  v_admin_1 uuid := '55555551-5555-5555-5555-555555555551';
  v_admin_2 uuid := '55555552-5555-5555-5555-555555555552';
begin
  update public.profiles set status = 'disabled' where id = v_admin_2;
  begin
    update public.profiles set role = 'school_admin' where id = v_admin_1;
    raise exception 'Phase5 FAIL: final administrator role change was allowed.';
  exception when sqlstate '23001' then null;
  end;
  begin
    delete from public.profiles where id = v_admin_1;
    raise exception 'Phase5 FAIL: final administrator delete was allowed.';
  exception when sqlstate '23001' then null;
  end;
  update public.profiles set status = 'active' where id = v_admin_2;
end $$;

-- Atomic tenant lifecycle preserves individual pre-existing suspension state.
set local role authenticated;
select set_config('request.jwt.claim.sub', '55555550-5555-5555-5555-555555555550', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"55555550-5555-5555-5555-555555555550","role":"authenticated","aal":"aal2"}', true);

do $$
begin
  if auth.uid() is distinct from '55555550-5555-5555-5555-555555555550'::uuid
     or not public.has_verified_mfa() then
    raise exception 'Phase5 FAIL: platform MFA test context was not established (uid %, claims %).',
      auth.uid(), auth.jwt();
  end if;
  raise notice 'STAGE: Phase 5 tenant lifecycle';
end $$;

select public.platform_set_tenant_lifecycle(
  '55555555-5555-5555-5555-555555555555', 'suspended'
);
do $$
begin
  if exists (
    select 1 from public.profiles
    where tenant_id = '55555555-5555-5555-5555-555555555555' and status = 'active'
  ) then raise exception 'Phase5 FAIL: lifecycle suspension left active profiles.'; end if;
end $$;
select public.platform_set_tenant_lifecycle(
  '55555555-5555-5555-5555-555555555555', 'active'
);
do $$
begin
  if (select status from public.profiles where id = '55555551-5555-5555-5555-555555555551') <> 'active'
     or (select status from public.profiles where id = '55555552-5555-5555-5555-555555555552') <> 'active' then
    raise exception 'Phase5 FAIL: lifecycle did not restore active tenant administrators.';
  end if;
  if (select status from public.profiles where id = '55555553-5555-5555-5555-555555555553') <> 'suspended' then
    raise exception 'Phase5 FAIL: lifecycle incorrectly restored a previously suspended account.';
  end if;
end $$;
reset role;

-- 10,000 synthetic students validate and commit atomically.
set local role authenticated;
select set_config('request.jwt.claim.sub', '55555551-5555-5555-5555-555555555551', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"55555551-5555-5555-5555-555555555551","role":"authenticated","aal":"aal2"}', true);

do $$
declare
  v_rows jsonb;
  v_result jsonb;
  v_batch_id uuid;
begin
  select jsonb_agg(jsonb_build_object(
    'first_name', 'Phase5Synthetic' || lpad(g::text, 5, '0'),
    'last_name', 'Rider', 'grade', 'K',
    'school_id', '55555559-5555-5555-5555-555555555559'
  )) into v_rows from generate_series(1, 10000) g;
  v_result := public.bulk_import_stage_rows('student', v_rows, 'phase5-10000.csv', false);
  if (v_result ->> 'validRows')::integer <> 10000 or (v_result ->> 'errorRows')::integer <> 0 then
    raise exception 'Phase5 FAIL: 10k validation returned %', v_result;
  end if;
  v_batch_id := (v_result ->> 'batchId')::uuid;
  v_result := public.bulk_import_commit(v_batch_id, true);
  if (v_result ->> 'committed')::integer <> 10000 then
    raise exception 'Phase5 FAIL: 10k commit returned %', v_result;
  end if;
  if (select count(*) from public.students where tenant_id = '55555555-5555-5555-5555-555555555555' and first_name like 'Phase5Synthetic%') <> 10000 then
    raise exception 'Phase5 FAIL: 10k committed row count mismatch.';
  end if;
end $$;

-- Duplicate rows are reported and never reach live tables.
do $$
declare v_result jsonb;
begin
  v_result := public.bulk_import_stage_rows(
    'guardian',
    '[{"first_name":"Duplicate","last_name":"One","email":"phase5.duplicate@example.test","phone":"7805550100"},{"first_name":"Duplicate","last_name":"Two","email":"phase5.duplicate@example.test","phone":"7805550101"}]'::jsonb,
    'phase5-duplicates.csv', true
  );
  if (v_result ->> 'validRows')::integer <> 1 or (v_result ->> 'errorRows')::integer <> 1 then
    raise exception 'Phase5 FAIL: duplicate detection returned %', v_result;
  end if;
  if exists (select 1 from public.guardians where email = 'phase5.duplicate@example.test') then
    raise exception 'Phase5 FAIL: dry-run duplicate created a guardian.';
  end if;
end $$;

-- Explicit pre-commit rollback creates no live record.
do $$
declare v_result jsonb; v_batch_id uuid;
begin
  v_result := public.bulk_import_stage_rows(
    'student', '[{"first_name":"Phase5Rollback","last_name":"Student","grade":"1","school_name":"Phase 5 Exit Gate School"}]'::jsonb,
    'phase5-rollback.csv', false
  );
  v_batch_id := (v_result ->> 'batchId')::uuid;
  perform public.bulk_import_rollback(v_batch_id);
  if exists (select 1 from public.students where first_name = 'Phase5Rollback') then
    raise exception 'Phase5 FAIL: rolled-back batch created a live student.';
  end if;
end $$;

-- A conflict introduced after validation rolls back the whole commit.
do $$
declare v_result jsonb; v_batch_id uuid;
begin
  v_result := public.bulk_import_stage_rows(
    'student',
    '[{"first_name":"Phase5Race","last_name":"One","grade":"2","school_id":"55555559-5555-5555-5555-555555555559"},{"first_name":"Phase5Race","last_name":"Two","grade":"2","school_id":"55555559-5555-5555-5555-555555555559"}]'::jsonb,
    'phase5-race.csv', false
  );
  v_batch_id := (v_result ->> 'batchId')::uuid;
  insert into public.students (tenant_id, school_id, first_name, last_name, grade, status)
  values (
    '55555555-5555-5555-5555-555555555555',
    '55555559-5555-5555-5555-555555555559',
    'Phase5Race', 'One', '2', 'active'
  );
  begin
    perform public.bulk_import_commit(v_batch_id, true);
    raise exception 'Phase5 FAIL: post-validation duplicate commit succeeded.';
  exception when unique_violation then null;
  end;
  if exists (select 1 from public.students where first_name = 'Phase5Race' and last_name = 'Two') then
    raise exception 'Phase5 FAIL: failed commit partially inserted its second row.';
  end if;
end $$;

-- Guardian import queues every invitation idempotently; students are absent.
do $$
declare v_result jsonb; v_batch_id uuid; v_queue jsonb;
begin
  v_result := public.bulk_import_stage_rows(
    'guardian',
    '[{"first_name":"Queue","last_name":"One","email":"phase5.queue1@example.test","phone":"7805550201"},{"first_name":"Queue","last_name":"Two","email":"phase5.queue2@example.test","phone":"7805550202"}]'::jsonb,
    'phase5-queue.csv', false
  );
  v_batch_id := (v_result ->> 'batchId')::uuid;
  perform public.bulk_import_commit(v_batch_id, true);
  v_queue := public.bulk_import_generate_invitations(v_batch_id);
  perform public.bulk_import_generate_invitations(v_batch_id);
  if (v_queue ->> 'totalInvitations')::integer <> 2
     or (select count(*) from public.tenant_onboarding_invitations where bulk_batch_id = v_batch_id) <> 2 then
    raise exception 'Phase5 FAIL: bulk invitation queue is not complete and idempotent.';
  end if;
  if exists (
    select 1 from public.tenant_onboarding_invitations
    where bulk_batch_id = v_batch_id and row_to_json(tenant_onboarding_invitations)::text ilike '%student%'
  ) then
    raise exception 'Phase5 FAIL: student information appeared in a bulk invitation.';
  end if;
end $$;

-- Tenant audit search works, while the platform role cannot invoke it.
select count(*) from public.tenant_search_audit_events(
  null, null, null, null, null, 100, 0
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '55555550-5555-5555-5555-555555555550', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims', '{"sub":"55555550-5555-5555-5555-555555555550","role":"authenticated","aal":"aal2"}', true);
do $$
begin
  if (select count(*) from public.bulk_import_batches) <> 0
     or (select count(*) from public.bulk_import_staging) <> 0
     or (select count(*) from public.tenant_onboarding_invitations) <> 0
     or (select count(*) from public.audit_events where tenant_id is not null) <> 0 then
    raise exception 'Phase5 FAIL: platform personnel can inspect imported tenant records.';
  end if;
  begin
    perform * from public.tenant_search_audit_events(null, null, null, null, null, 10, 0);
    raise exception 'Phase5 FAIL: platform personnel searched tenant audit records.';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
