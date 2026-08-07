-- SafeBus Alberta - Phase 3 retention security regression
-- Run only after migrations through 0074 have been applied to hosted Supabase
-- DEV or a disposable migrated database. Never run against production.

-- Keep all fixtures and assertions in one transaction when this file is sent
-- to Supabase SQL Editor. Reset only the simulated database role between
-- checks, then roll back the complete test once at the end.
begin;

do $$
declare
  v_tenant_id uuid := '31313131-3131-3131-3131-313131313131';
  v_platform_id uuid := '32323232-3232-3232-3232-323232323232';
  v_driver_id uuid := '33333333-3333-3333-3333-333333333333';
begin
  insert into public.tenants (id, name, type, status)
  values (v_tenant_id, 'Phase3 Retention Test Tenant', 'demo', 'active')
  on conflict (id) do update
  set name = excluded.name, type = excluded.type, status = excluded.status;

  insert into auth.users
    (id, email, aud, role, email_confirmed_at, instance_id,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
  values
    (v_platform_id, 'phase3.platform@example.test', 'authenticated', 'authenticated', now(),
     '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}',
     '{}', now(), now(), now()),
    (v_driver_id, 'phase3.driver@example.test', 'authenticated', 'authenticated', now(),
     '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}',
     '{}', now(), now(), now())
  on conflict (id) do update
  set email = excluded.email,
      aud = excluded.aud,
      role = excluded.role,
      email_confirmed_at = excluded.email_confirmed_at,
      raw_app_meta_data = excluded.raw_app_meta_data,
      raw_user_meta_data = excluded.raw_user_meta_data,
      last_sign_in_at = now(),
      updated_at = now();

  insert into public.profiles
    (id, tenant_id, full_name, first_name, last_name, email, role, status)
  values
    (v_platform_id, null, 'Phase3 Platform Admin', 'Phase3', 'Platform Admin',
     'phase3.platform@example.test', 'platform_super_admin', 'active'),
    (v_driver_id, v_tenant_id, 'Phase3 Driver', 'Phase3', 'Driver',
     'phase3.driver@example.test', 'driver', 'active')
  on conflict (id) do update
  set tenant_id = excluded.tenant_id,
      full_name = excluded.full_name,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      email = excluded.email,
      role = excluded.role,
      status = 'active';
end $$;

do $$
declare
  v_write_policies integer;
  v_action_constraint text;
begin
  select count(*) into v_write_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'retention_policies', 'retention_execution_control', 'retention_deletion_runs'
    )
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  if v_write_policies <> 0 then
    raise exception 'Phase3 FAIL: retention tables expose % write policies.', v_write_policies;
  end if;

  select pg_get_constraintdef(c.oid) into v_action_constraint
  from pg_constraint c
  where c.conrelid = 'public.audit_events'::regclass
    and c.conname = 'audit_events_action_check';
  if v_action_constraint is null
     or position('retention.deletion_run' in v_action_constraint) = 0 then
    raise exception 'Phase3 FAIL: audit action constraint rejects retention events.';
  end if;
  raise notice 'Phase3 PASS: retention tables expose no browser write policies.';
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","aal":"aal1"}';
do $$
declare
  v_policies integer;
  v_runs integer;
begin
  select count(*) into v_policies from public.retention_policies;
  select count(*) into v_runs from public.retention_deletion_runs;
  if v_policies <> 0 or v_runs <> 0 then
    raise exception 'Phase3 FAIL: driver read retention data.';
  end if;
  raise notice 'Phase3 PASS: driver cannot read retention data.';
end $$;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '32323232-3232-3232-3232-323232323232';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"32323232-3232-3232-3232-323232323232","role":"authenticated","aal":"aal1"}';
do $$
declare
  v_blocked boolean := false;
begin
  if auth.uid() <> '32323232-3232-3232-3232-323232323232'::uuid
     or public.current_user_role() <> 'platform_super_admin'
     or not public.is_platform_super_admin() then
    raise exception 'Phase3 FAIL: platform AAL1 simulation failed (uid %, role %, predicate %).',
      auth.uid(), public.current_user_role(), public.is_platform_super_admin();
  end if;

  begin
    perform public.run_retention_deletion('rate_limit_buckets', true);
  exception when sqlstate '55006' then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Phase3 FAIL: AAL1 platform administrator could run retention.';
  end if;
  raise notice 'Phase3 PASS: AAL1 platform administrator is blocked.';
end $$;
reset role;

-- A server key cannot bypass the database-side approval latch.
set local role service_role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare
  v_blocked boolean := false;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Phase3 FAIL: service-role simulation failed (auth.role %).', auth.role();
  end if;

  begin
    perform public.run_retention_deletion('rate_limit_buckets', false);
  exception when sqlstate '55006' then
    v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'Phase3 FAIL: service role bypassed destructive approval latch.';
  end if;
  raise notice 'Phase3 PASS: destructive approval latch blocks service execution.';
end $$;
reset role;

-- The server-only execution path supports a count-only dry run and an
-- explicit deletion. The file-level transaction rolls back all fixture changes.
insert into public.rate_limit_buckets
  (bucket_key, actor_identifier, action, window_start, count)
values ('phase3-expired', md5('phase3-actor'), 'login', now() - interval '3 days', 1);
update public.retention_execution_control
set destructive_enabled = true,
    approval_reference = 'transactional-test-only',
    approved_at = now()
where id = 1;

set local role service_role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare
  v_count bigint;
  v_remaining integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Phase3 FAIL: service-role execution simulation failed (auth.role %).', auth.role();
  end if;

  select affected_rows into v_count
  from public.run_retention_deletion('rate_limit_buckets', true);
  select count(*) into v_remaining
  from public.rate_limit_buckets where bucket_key = 'phase3-expired';
  if v_count < 1 or v_remaining <> 1 then
    raise exception 'Phase3 FAIL: dry run did not count without deleting.';
  end if;

  select affected_rows into v_count
  from public.run_retention_deletion('rate_limit_buckets', false);
  select count(*) into v_remaining
  from public.rate_limit_buckets where bucket_key = 'phase3-expired';
  if v_count < 1 or v_remaining <> 0 then
    raise exception 'Phase3 FAIL: explicit execution did not delete expired bucket.';
  end if;
  raise notice 'Phase3 PASS: dry run and explicit deletion behave correctly.';
end $$;
reset role;

do $$
begin
  delete from public.profiles
  where id in ('32323232-3232-3232-3232-323232323232', '33333333-3333-3333-3333-333333333333');
  delete from auth.users
  where id in ('32323232-3232-3232-3232-323232323232', '33333333-3333-3333-3333-333333333333');
  delete from public.tenants where id = '31313131-3131-3131-3131-313131313131';
  raise notice 'Phase3 retention RLS regression completed.';
end $$;

rollback;
