-- Self-contained guardian/driver invitation atomicity regression.
-- Run only against hosted Supabase DEV after migration 0050.

begin;

insert into public.tenants (id, name, type, status)
values
(
  'ca000000-0000-0000-0000-000000000010',
  'Atomic Member Tenant',
  'demo',
  'active'
),
(
  'ca000000-0000-0000-0000-000000000020',
  'Atomic Member Other Tenant',
  'demo',
  'active'
);

insert into public.schools (id, tenant_id, name, city, province, status)
values
(
  'ca000000-0000-0000-0000-000000000011',
  'ca000000-0000-0000-0000-000000000010',
  'Atomic Member School',
  'Red Deer',
  'AB',
  'active'
),
(
  'ca000000-0000-0000-0000-000000000021',
  'ca000000-0000-0000-0000-000000000020',
  'Atomic Other School',
  'Calgary',
  'AB',
  'active'
);

insert into public.students (
  id,
  tenant_id,
  school_id,
  first_name,
  last_name,
  grade,
  status
)
values
(
  'ca000000-0000-0000-0000-000000000012',
  'ca000000-0000-0000-0000-000000000010',
  'ca000000-0000-0000-0000-000000000011',
  'Linked',
  'Student',
  '5',
  'active'
),
(
  'ca000000-0000-0000-0000-000000000022',
  'ca000000-0000-0000-0000-000000000020',
  'Other',
  'Student',
  '6',
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
  'ca000000-0000-0000-0000-000000000001',
  'atomic-member-admin@test.local',
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
  'ca000000-0000-0000-0000-000000000002',
  'atomic-guardian@test.local',
  '',
  null,
  'authenticated',
  'authenticated',
  '00000000-0000-0000-0000-000000000000',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
),
(
  'ca000000-0000-0000-0000-000000000003',
  'atomic-invalid-guardian@test.local',
  '',
  null,
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
  first_name,
  last_name,
  full_name,
  email,
  role,
  status
)
values (
  'ca000000-0000-0000-0000-000000000001',
  'ca000000-0000-0000-0000-000000000010',
  null,
  'Atomic',
  'Member Admin',
  'Atomic Member Admin',
  'atomic-member-admin@test.local',
  'tenant_admin',
  'active'
);

set local role service_role;
set local request.jwt.claim.role = 'service_role';
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare
  v_state jsonb;
begin
  v_state := public.server_get_member_invitation_state(
    'ATOMIC-GUARDIAN@test.local'
  );
  if v_state ->> 'authUserId' <> 'ca000000-0000-0000-0000-000000000002'
    or (v_state ->> 'profileId') is not null then
    raise exception 'TEST FAILED: server member lookup did not return the orphan Auth user';
  end if;
  raise notice 'TEST PASSED: service-only member lookup returns minimum exact-email state';
end
$$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'ca000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"ca000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  v_result jsonb;
begin
  v_result := public.admin_finalize_member_invitation(
    'ca000000-0000-0000-0000-000000000002',
    'guardian',
    'Atomic',
    'Guardian',
    'atomic-guardian@test.local',
    '5878940568',
    null,
    '[{"studentId":"ca000000-0000-0000-0000-000000000012","relationship":"mother"}]'::jsonb
  );
  if (v_result ->> 'profileId') <> 'ca000000-0000-0000-0000-000000000002'
    or nullif(v_result ->> 'guardianId', '') is null then
    raise exception 'TEST FAILED: guardian finalizer did not return committed identifiers';
  end if;
  raise notice 'TEST PASSED: tenant admin finalized guardian invitation';
end
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = 'ca000000-0000-0000-0000-000000000002'
      and p.tenant_id = 'ca000000-0000-0000-0000-000000000010'
      and p.role = 'guardian'
      and p.status = 'invited'
  ) then
    raise exception 'TEST FAILED: invited guardian profile was not committed';
  end if;
  if not exists (
    select 1
    from public.student_guardians sg
    join public.guardians g on g.id = sg.guardian_id
    where g.profile_id = 'ca000000-0000-0000-0000-000000000002'
      and sg.student_id = 'ca000000-0000-0000-0000-000000000012'
      and sg.relationship = 'mother'
      and sg.status = 'active'
  ) then
    raise exception 'TEST FAILED: guardian and student link were not committed together';
  end if;
  if not exists (
    select 1
    from public.tenant_onboarding_invitations i
    where i.invited_profile_id = 'ca000000-0000-0000-0000-000000000002'
      and i.status = 'pending'
  ) then
    raise exception 'TEST FAILED: guardian invitation audit was not committed';
  end if;
  raise notice 'TEST PASSED: profile, guardian, link, and audit committed atomically';
end
$$;

set local role authenticated;
set local request.jwt.claim.sub = 'ca000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"ca000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
begin
  perform public.admin_finalize_member_invitation(
    'ca000000-0000-0000-0000-000000000003',
    'guardian',
    'Invalid',
    'Guardian',
    'atomic-invalid-guardian@test.local',
    '5878940569',
    null,
    '[{"studentId":"ca000000-0000-0000-0000-000000000022","relationship":"guardian"}]'::jsonb
  );
  raise exception 'TEST FAILED: cross-tenant student link unexpectedly succeeded';
exception
  when others then
    if sqlerrm = 'TEST FAILED: cross-tenant student link unexpectedly succeeded' then
      raise;
    end if;
    raise notice 'TEST PASSED: cross-tenant student link rejected';
end
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from public.profiles p
    where p.id = 'ca000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'TEST FAILED: failed member finalization left a profile';
  end if;
  if exists (
    select 1
    from public.guardians g
    where g.profile_id = 'ca000000-0000-0000-0000-000000000003'
  ) then
    raise exception 'TEST FAILED: failed member finalization left a guardian';
  end if;
  raise notice 'TEST PASSED: invalid guardian finalization rolled back every write';
end
$$;

set local role authenticated;
set local request.jwt.claim.sub = 'ca000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"ca000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
begin
  perform public.server_get_member_invitation_state(
    'atomic-guardian@test.local'
  );
  raise exception 'TEST FAILED: browser-authenticated caller read Auth state';
exception
  when insufficient_privilege then
    raise notice 'TEST PASSED: member Auth lookup remains server-only';
end
$$;

reset role;
set local role anon;

do $$
begin
  perform public.admin_finalize_member_invitation(
    'ca000000-0000-0000-0000-000000000003',
    'guardian',
    'Anonymous',
    'Guardian',
    'atomic-invalid-guardian@test.local',
    '5878940569',
    null,
    '[]'::jsonb
  );
  raise exception 'TEST FAILED: anonymous caller finalized a member invitation';
exception
  when insufficient_privilege then
    raise notice 'TEST PASSED: anonymous member finalization denied';
end
$$;

rollback;
