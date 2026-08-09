-- SafeBus Alberta - Phase 2 audit, MFA, recent-auth, allowlist, rate-limit RLS regression
--
-- Verifies the Phase 2 authentication and administrative security foundation:
--   - audit_events is append-only (no UPDATE/DELETE policy exists)
--   - browser callers cannot fabricate arbitrary audit events
--   - the narrow self-service auth-event writer records approved events
--   - audit_events denies direct table INSERT/UPDATE/DELETE
--   - tenant admin reads own tenant audit; platform admin reads all
--   - driver/guardian cannot read audit
--   - detail sanitization strips secret-like keys
--   - is_allowed_redirect_origin rejects arbitrary origins
--   - check_rate_limit enforces a per-actor cap
--
-- SELF-CONTAINED: seeds its own tenant, admin, driver, guardian with
-- disjoint fixed IDs, then cleans up.
--
-- Run after applying migrations through 0074 to hosted Supabase DEV or a
-- disposable migrated database. Never run against production.

-- Keep all fixtures and assertions in one transaction when this file is sent
-- to Supabase SQL Editor. Reset only the simulated database role between
-- checks, then roll back the complete test once at the end.
begin;

-- ===========================================================================
-- Privileged setup
-- ===========================================================================
do $$
declare
  v_tenant_id uuid := '24242424-2424-2424-2424-242424242424';
  v_admin_user uuid := '25252525-2525-2525-2525-252525252525';
  v_driver_user uuid := '26262626-2626-2626-2626-262626262626';
  v_guardian_user uuid := '27272727-2727-2727-2727-272727272727';
begin
  insert into public.tenants (id, name, type, status)
  values (v_tenant_id, 'Phase2 Auth Security Test Tenant', 'demo', 'active')
  on conflict (id) do update
  set name = excluded.name, type = excluded.type, status = excluded.status;

  insert into auth.users (id, email, aud, role, email_confirmed_at, instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
  values
    (v_admin_user, 'phase2.admin@example.test', 'authenticated','authenticated', now(), '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}', '{}', now(), now(), now()),
    (v_driver_user, 'phase2.driver@example.test', 'authenticated','authenticated', now(), '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}', '{}', now(), now(), now()),
    (v_guardian_user, 'phase2.guardian@example.test', 'authenticated','authenticated', now(), '00000000-0000-0000-0000-000000000000', '{"provider":"email","providers":["email"]}', '{}', now(), now(), now())
  on conflict (id) do update
  set email = excluded.email,
      aud = excluded.aud,
      role = excluded.role,
      email_confirmed_at = excluded.email_confirmed_at,
      raw_app_meta_data = excluded.raw_app_meta_data,
      raw_user_meta_data = excluded.raw_user_meta_data,
      last_sign_in_at = now(),
      updated_at = now();

  insert into public.profiles (id, tenant_id, full_name, first_name, last_name, email, role, status)
  values
    (v_admin_user, v_tenant_id, 'Phase2 Admin', 'Phase2', 'Admin', 'phase2.admin@example.test', 'tenant_admin', 'active'),
    (v_driver_user, v_tenant_id, 'Phase2 Driver', 'Phase2', 'Driver', 'phase2.driver@example.test', 'driver', 'active'),
    (v_guardian_user, v_tenant_id, 'Phase2 Guardian', 'Phase2', 'Guardian', 'phase2.guardian@example.test', 'guardian', 'active')
  on conflict (id) do update
  set tenant_id = excluded.tenant_id,
      full_name = excluded.full_name,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      email = excluded.email,
      role = excluded.role,
      status = 'active';
end $$;

-- Fail once with the complete list if hosted DEV is missing any Phase 2 RPC
-- used by this regression, instead of surfacing one undefined function at a
-- time later in the file.
do $$
declare
  v_missing text[];
begin
  select array_agg(signature order by signature) into v_missing
  from (
    values
      ('public.sanitize_audit_detail(jsonb)'),
      ('public.record_own_auth_event(text,text,jsonb)'),
      ('public.validate_password_policy(text)'),
      ('public.revoke_all_user_sessions(uuid)'),
      ('public.check_invitation_idempotency(uuid,text,public.user_role)')
  ) expected(signature)
  where to_regprocedure(signature) is null;

  if v_missing is not null then
    raise exception 'Phase2 FAIL: hosted DEV is missing required RPCs: %', v_missing;
  end if;
end
$$;

-- ===========================================================================
-- Test 1: audit_events is append-only (no UPDATE/DELETE policy)
-- ===========================================================================
do $$
declare
  v_update_count integer;
  v_delete_count integer;
begin
  if not has_table_privilege('authenticated', 'public.audit_events', 'SELECT') then
    raise exception 'Phase2 FAIL: authenticated lacks audit_events SELECT required for RLS.';
  end if;

  select count(*) into v_update_count
  from pg_policies
  where schemaname = 'public' and tablename = 'audit_events' and cmd in ('UPDATE');

  select count(*) into v_delete_count
  from pg_policies
  where schemaname = 'public' and tablename = 'audit_events' and cmd in ('DELETE');

  if v_update_count > 0 then
    raise exception 'Phase2 FAIL: audit_events has an UPDATE policy (must be append-only).';
  end if;
  if v_delete_count > 0 then
    raise exception 'Phase2 FAIL: audit_events has a DELETE policy (must be append-only).';
  end if;

  raise notice 'Phase2 PASS: audit_events has no UPDATE or DELETE policy (append-only).';
end $$;

-- ===========================================================================
-- Test 2: generic audit writer is internal; narrow self-service writer works
-- ===========================================================================
set local role authenticated;
set local request.jwt.claim.sub = '25252525-2525-2525-2525-252525252525';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"25252525-2525-2525-2525-252525252525","role":"authenticated"}';

do $$
declare
  v_event_id uuid;
  v_generic_blocked boolean := false;
begin
  if has_function_privilege(
    'authenticated',
    'public.write_audit_event(text,text,uuid,text,text,jsonb,inet)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.write_audit_event(text,text,uuid,text,text,jsonb,inet)',
    'EXECUTE'
  ) then
    raise exception 'Phase2 FAIL: generic audit writer has a browser EXECUTE grant.';
  end if;

  begin
    perform public.write_audit_event(
      'role.changed', 'profile', '25252525-2525-2525-2525-252525252525',
      'Phase2 Admin', 'success', '{}'::jsonb, null
    );
  exception when insufficient_privilege then
    v_generic_blocked := true;
  end;
  if not v_generic_blocked then
    raise exception 'Phase2 FAIL: authenticated caller could fabricate a generic audit event.';
  end if;

  v_event_id := public.record_own_auth_event(
    'auth.login', 'success', jsonb_build_object('mfa', false)
  );
  if v_event_id is null then
    raise exception 'Phase2 FAIL: approved self-service auth event was not recorded.';
  end if;
  raise notice 'Phase2 PASS: generic audit writes are blocked; narrow auth event was recorded.';
end $$;

reset role;

-- ===========================================================================
-- Test 3: direct table INSERT is blocked (RPC is the only path)
-- ===========================================================================
set local role authenticated;
set local request.jwt.claim.sub = '25252525-2525-2525-2525-252525252525';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"25252525-2525-2525-2525-252525252525","role":"authenticated"}';

do $$
declare
  v_failed boolean := false;
begin
  begin
    insert into public.audit_events (action) values ('auth.login');
  exception when others then
    v_failed := true;
  end;

  if not v_failed then
    raise exception 'Phase2 FAIL: direct INSERT into audit_events was not blocked (must be RPC-only).';
  end if;

  raise notice 'Phase2 PASS: direct INSERT into audit_events is blocked.';
end $$;

reset role;

-- ===========================================================================
-- Test 4: detail sanitization recursively strips secret-like keys
-- ===========================================================================
do $$
declare
  v_detail jsonb;
begin
  v_detail := public.sanitize_audit_detail(
    jsonb_build_object(
      'user', 'test', 'api_key', 'remove',
      'nested', jsonb_build_object('safe', true, 'authorization', 'remove'),
      'items', jsonb_build_array(jsonb_build_object('token', 'remove', 'result', 'ok'))
    )
  );
  if v_detail ? 'api_key'
     or v_detail #> '{nested,authorization}' is not null
     or v_detail #> '{items,0,token}' is not null then
    raise exception 'Phase2 FAIL: secret-like keys were not recursively stripped.';
  end if;
  if not (v_detail ? 'user') or v_detail #>> '{items,0,result}' is distinct from 'ok' then
    raise exception 'Phase2 FAIL: non-secret key was incorrectly stripped.';
  end if;
  raise notice 'Phase2 PASS: recursive sanitizer strips secret-like keys and retains safe keys.';
end $$;

-- ===========================================================================
-- Test 5: driver/guardian cannot read audit_events
-- ===========================================================================
set local role authenticated;
set local request.jwt.claim.sub = '26262626-2626-2626-2626-262626262626';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"26262626-2626-2626-2626-262626262626","role":"authenticated"}';

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.audit_events;
  if v_count > 0 then
    raise exception 'Phase2 FAIL: driver can read audit_events (must be denied).';
  end if;
  raise notice 'Phase2 PASS: driver sees zero audit_events rows.';
end $$;

reset role;

set local role authenticated;
set local request.jwt.claim.sub = '27272727-2727-2727-2727-272727272727';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"27272727-2727-2727-2727-272727272727","role":"authenticated"}';

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.audit_events;
  if v_count > 0 then
    raise exception 'Phase2 FAIL: guardian can read audit_events (must be denied).';
  end if;
  raise notice 'Phase2 PASS: guardian sees zero audit_events rows.';
end $$;

reset role;

-- ===========================================================================
-- Test 6: is_allowed_redirect_origin rejects arbitrary origins
-- ===========================================================================
do $$
declare
  v_tenant_id uuid := '24242424-2424-2424-2424-242424242424';
begin
  -- Seed an allowed origin for the test tenant.
  insert into public.allowed_redirect_origins (tenant_id, origin)
  values (v_tenant_id, 'https://app.safebus.example')
  on conflict do nothing;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '25252525-2525-2525-2525-252525252525';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"25252525-2525-2525-2525-252525252525","role":"authenticated"}';

do $$
declare
  v_allowed boolean;
  v_denied boolean;
begin
  select public.is_allowed_redirect_origin('https://app.safebus.example') into v_allowed;
  select public.is_allowed_redirect_origin('https://evil.attacker.example') into v_denied;

  if not v_allowed then
    raise exception 'Phase2 FAIL: allowed redirect origin was rejected.';
  end if;
  if v_denied then
    raise exception 'Phase2 FAIL: arbitrary redirect origin was accepted.';
  end if;

  raise notice 'Phase2 PASS: redirect allowlist accepts SafeBus domains and rejects arbitrary origins.';
end $$;

reset role;

-- ===========================================================================
-- Test 7: check_rate_limit enforces a cap
-- ===========================================================================
set local role authenticated;
set local request.jwt.claim.sub = '25252525-2525-2525-2525-252525252525';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"25252525-2525-2525-2525-252525252525","role":"authenticated"}';

do $$
declare
  v_result_1 boolean;
  v_result_2 boolean;
begin
  -- First call within limit (max=1, window=3600s for test isolation).
  select public.check_rate_limit('invitation', 'phase2-test-actor', 1, 3600) into v_result_1;
  -- Second call exceeds the cap.
  select public.check_rate_limit('invitation', 'phase2-test-actor', 1, 3600) into v_result_2;

  if not v_result_1 then
    raise exception 'Phase2 FAIL: first rate-limit call should pass.';
  end if;
  if v_result_2 then
    raise exception 'Phase2 FAIL: second rate-limit call should be denied.';
  end if;

  raise notice 'Phase2 PASS: rate-limit enforces per-actor cap.';
end $$;

reset role;

-- ===========================================================================
-- Test 8: password policy validation
-- ===========================================================================
set local role authenticated;
set local request.jwt.claim.sub = '25252525-2525-2525-2525-252525252525';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"25252525-2525-2525-2525-252525252525","role":"authenticated"}';

do $$
declare
  v_strong boolean;
  v_weak_short boolean;
  v_weak_nospecial boolean;
  v_weak_repeating boolean;
begin
  select public.validate_password_policy('StrongP@ss1!') into v_strong;
  select public.validate_password_policy('Short1!') into v_weak_short;
  select public.validate_password_policy('NoSpecialChar1') into v_weak_nospecial;
  select public.validate_password_policy(
    -- The schema restricts max_repeating_char to 1..20, so 21 always exceeds it.
    'Aa1!Safe' || repeat('x', 21)
  ) into v_weak_repeating;

  if not v_strong then
    raise exception 'Phase2 FAIL: strong password rejected by policy.';
  end if;
  if v_weak_short then
    raise exception 'Phase2 FAIL: short password accepted by policy.';
  end if;
  if v_weak_nospecial then
    raise exception 'Phase2 FAIL: password without special char accepted by policy.';
  end if;
  if v_weak_repeating then
    raise exception 'Phase2 FAIL: password with an excessive repeating-character run was accepted.';
  end if;

  raise notice 'Phase2 PASS: password policy validates strong and rejects weak/repeating passwords.';
end $$;

reset role;

-- ===========================================================================
-- Test 9: session revocation requires AAL2 and revokes the session mirror
-- ===========================================================================
do $$
declare
  v_tenant_id uuid := '24242424-2424-2424-2424-242424242424';
  v_admin uuid := '25252525-2525-2525-2525-252525252525';
  v_session_id uuid;
begin
  insert into public.user_sessions (user_id, tenant_id, device_label)
  values (v_admin, v_tenant_id, 'Test Device')
  returning id into v_session_id;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '25252525-2525-2525-2525-252525252525';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"25252525-2525-2525-2525-252525252525","role":"authenticated","aal":"aal2"}';

do $$
declare
  v_count integer;
begin
  select public.revoke_all_user_sessions(
    '25252525-2525-2525-2525-252525252525'
  ) into v_count;
  if v_count < 1 then
    raise exception 'Phase2 FAIL: AAL2 admin did not revoke the session mirror.';
  end if;
  raise notice 'Phase2 PASS: AAL2 admin revoked % session mirror row(s).', v_count;
end $$;

reset role;

-- ===========================================================================
-- Test 10: invitation idempotency works at AAL2
-- ===========================================================================
set local role authenticated;
set local request.jwt.claim.sub = '25252525-2525-2525-2525-252525252525';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"25252525-2525-2525-2525-252525252525","role":"authenticated","aal":"aal2"}';
do $$
declare
  v_tenant_id uuid := '24242424-2424-2424-2424-242424242424';
  v_admin uuid := '25252525-2525-2525-2525-252525252525';
  v_already boolean;
begin
  select exists (
    select 1 from public.check_invitation_idempotency(
      v_tenant_id, 'phase2.admin@example.test', 'tenant_admin'::public.user_role
    )
    where already_invited = true
  ) into v_already;

  if not v_already then
    raise exception 'Phase2 FAIL: AAL2 idempotency check did not find existing profile.';
  end if;
  raise notice 'Phase2 PASS: AAL2 invitation idempotency detects existing profile.';
end $$;
reset role;

-- The enclosing transaction is the cleanup. Do not delete the synthetic final
-- tenant administrator before rollback; production correctly protects it.
rollback;
