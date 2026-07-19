-- Self-contained invitation password activation regression.
-- Run only against hosted Supabase DEV or a disposable migrated database.

delete from public.tenant_onboarding_invitations
where id in (
  'c8000000-0000-0000-0000-000000000101',
  'c8000000-0000-0000-0000-000000000102'
);
delete from public.profiles
where id in (
  'c8000000-0000-0000-0000-000000000001',
  'c8000000-0000-0000-0000-000000000002',
  'c8000000-0000-0000-0000-000000000003'
);
delete from auth.users
where id in (
  'c8000000-0000-0000-0000-000000000001',
  'c8000000-0000-0000-0000-000000000002',
  'c8000000-0000-0000-0000-000000000003'
);
delete from public.tenants
where id = 'c8000000-0000-0000-0000-000000000010';

insert into public.tenants (id, name, type, status)
values (
  'c8000000-0000-0000-0000-000000000010',
  'Invitation Activation Test Tenant',
  'demo',
  'active'
);

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
(
  'c8000000-0000-0000-0000-000000000001',
  'invited_with_password@test.local',
  crypt('StrongPassword!1', gen_salt('bf')),
  now(),
  'authenticated',
  'authenticated',
  '00000000-0000-0000-0000-000000000000',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
),
(
  'c8000000-0000-0000-0000-000000000002',
  'invited_without_password@test.local',
  '',
  now(),
  'authenticated',
  'authenticated',
  '00000000-0000-0000-0000-000000000000',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
),
(
  'c8000000-0000-0000-0000-000000000003',
  'disabled_invitation@test.local',
  crypt('StrongPassword!2', gen_salt('bf')),
  now(),
  'authenticated',
  'authenticated',
  '00000000-0000-0000-0000-000000000000',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

insert into public.profiles (
  id,
  tenant_id,
  school_id,
  full_name,
  email,
  role,
  status
)
values
(
  'c8000000-0000-0000-0000-000000000001',
  'c8000000-0000-0000-0000-000000000010',
  null,
  'Invited With Password',
  'invited_with_password@test.local',
  'tenant_admin',
  'invited'
),
(
  'c8000000-0000-0000-0000-000000000002',
  'c8000000-0000-0000-0000-000000000010',
  null,
  'Invited Without Password',
  'invited_without_password@test.local',
  'driver',
  'invited'
),
(
  'c8000000-0000-0000-0000-000000000003',
  'c8000000-0000-0000-0000-000000000010',
  null,
  'Disabled Invitation',
  'disabled_invitation@test.local',
  'guardian',
  'disabled'
);

insert into public.tenant_onboarding_invitations (
  id,
  tenant_id,
  email,
  full_name,
  role,
  status,
  invited_profile_id,
  last_sent_at
)
values
(
  'c8000000-0000-0000-0000-000000000101',
  'c8000000-0000-0000-0000-000000000010',
  'invited_with_password@test.local',
  'Invited With Password',
  'tenant_admin',
  'pending',
  'c8000000-0000-0000-0000-000000000001',
  now()
),
(
  'c8000000-0000-0000-0000-000000000102',
  'c8000000-0000-0000-0000-000000000010',
  'invited_without_password@test.local',
  'Invited Without Password',
  'driver',
  'resent',
  'c8000000-0000-0000-0000-000000000002',
  now()
);

-- An invited user with a confirmed email and password activates only themself.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c8000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c8000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  v_result jsonb;
begin
  v_result := public.complete_invited_account();
  if v_result ->> 'status' <> 'active' then
    raise exception 'TEST FAILED: invited account did not return active status';
  end if;
  if (select status from public.profiles where id = auth.uid()) <> 'active' then
    raise exception 'TEST FAILED: invited profile was not activated';
  end if;
  if (
    select status
    from public.tenant_onboarding_invitations
    where id = 'c8000000-0000-0000-0000-000000000101'
  ) <> 'activated' then
    raise exception 'TEST FAILED: invitation audit row was not activated';
  end if;
  if (
    select status
    from public.profiles
    where id = 'c8000000-0000-0000-0000-000000000002'
  ) <> 'invited' then
    raise exception 'TEST FAILED: completing one invitation changed another profile';
  end if;
  raise notice 'TEST PASSED: password-backed invitation activates only the caller';
end
$$;
rollback;

-- A confirmed invite session without a password cannot activate.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c8000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c8000000-0000-0000-0000-000000000002","role":"authenticated"}';

do $$
begin
  perform public.complete_invited_account();
  raise exception 'TEST FAILED: password-less invited account was activated';
exception
  when others then
    if sqlerrm = 'TEST FAILED: password-less invited account was activated' then
      raise;
    end if;
    if sqlerrm not like '%Create a password%' then
      raise exception 'TEST FAILED: unexpected password-less rejection: %', sqlerrm;
    end if;
    raise notice 'TEST PASSED: password-less invited account is blocked';
end
$$;
rollback;

-- Suspended or disabled accounts cannot use invitation completion to reactivate.
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'c8000000-0000-0000-0000-000000000003';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c8000000-0000-0000-0000-000000000003","role":"authenticated"}';

do $$
begin
  perform public.complete_invited_account();
  raise exception 'TEST FAILED: disabled account was reactivated through invitation completion';
exception
  when others then
    if sqlerrm = 'TEST FAILED: disabled account was reactivated through invitation completion' then
      raise;
    end if;
    if sqlerrm not like '%not available%' then
      raise exception 'TEST FAILED: unexpected disabled-account rejection: %', sqlerrm;
    end if;
    raise notice 'TEST PASSED: disabled account cannot self-reactivate';
end
$$;
rollback;

-- Anonymous callers have no execute privilege.
begin;
set local role anon;
do $$
begin
  perform public.complete_invited_account();
  raise exception 'TEST FAILED: anonymous caller executed invitation completion';
exception
  when insufficient_privilege then
    raise notice 'TEST PASSED: anonymous invitation completion denied';
end
$$;
rollback;

delete from public.tenant_onboarding_invitations
where id in (
  'c8000000-0000-0000-0000-000000000101',
  'c8000000-0000-0000-0000-000000000102'
);
delete from public.profiles
where id in (
  'c8000000-0000-0000-0000-000000000001',
  'c8000000-0000-0000-0000-000000000002',
  'c8000000-0000-0000-0000-000000000003'
);
delete from auth.users
where id in (
  'c8000000-0000-0000-0000-000000000001',
  'c8000000-0000-0000-0000-000000000002',
  'c8000000-0000-0000-0000-000000000003'
);
delete from public.tenants
where id = 'c8000000-0000-0000-0000-000000000010';
