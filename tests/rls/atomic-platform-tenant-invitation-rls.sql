-- Self-contained platform tenant invitation atomicity regression.
-- Run only against hosted Supabase DEV after migration 0049.

begin;

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
  'c9000000-0000-0000-0000-000000000001',
  'atomic-platform-admin@test.local',
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
  'c9000000-0000-0000-0000-000000000002',
  'atomic-invited-admin@test.local',
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
  'c9000000-0000-0000-0000-000000000003',
  'atomic-non-platform@test.local',
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

insert into public.tenants (id, name, type, status)
values
(
  'c9000000-0000-0000-0000-000000000010',
  'Atomic Empty Orphan Attempt',
  'demo',
  'active'
),
(
  'c9000000-0000-0000-0000-000000000011',
  'Atomic Non-Platform Tenant',
  'demo',
  'active'
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
  'c9000000-0000-0000-0000-000000000001',
  null,
  null,
  'Atomic Platform Admin',
  'atomic-platform-admin@test.local',
  'platform_super_admin',
  'active'
),
(
  'c9000000-0000-0000-0000-000000000003',
  'c9000000-0000-0000-0000-000000000011',
  null,
  'Atomic Non Platform',
  'atomic-non-platform@test.local',
  'tenant_admin',
  'active'
);

set local role authenticated;
set local request.jwt.claim.sub = 'c9000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c9000000-0000-0000-0000-000000000001","role":"authenticated"}';

do $$
declare
  v_orphan jsonb;
  v_result jsonb;
begin
  v_orphan := public.platform_find_unprofiled_auth_user(
    'ATOMIC-INVITED-ADMIN@test.local'
  );
  if v_orphan ->> 'id' <> 'c9000000-0000-0000-0000-000000000002' then
    raise exception 'TEST FAILED: exact-email orphan Auth account was not recovered';
  end if;

  v_result := public.platform_finalize_tenant_invitation(
    'c9000000-0000-0000-0000-000000000002',
    'Atomic Successful Tenant',
    'bus_contractor',
    'Atomic School',
    'Red Deer',
    'Atomic Invited Admin',
    'atomic-invited-admin@test.local'
  );
  if (v_result #>> '{tenant,id}')::uuid is null then
    raise exception 'TEST FAILED: atomic finalizer did not return a tenant';
  end if;
  raise notice 'TEST PASSED: platform caller finalized the invitation';
end
$$;

reset role;

do $$
declare
  v_created_tenant_id uuid;
begin
  select t.id
  into v_created_tenant_id
  from public.tenants t
  where t.name = 'Atomic Successful Tenant';

  if v_created_tenant_id is null then
    raise exception 'TEST FAILED: atomic finalizer did not commit a tenant';
  end if;
  if not exists (
    select 1
    from public.profiles p
    where p.id = 'c9000000-0000-0000-0000-000000000002'
      and p.tenant_id = v_created_tenant_id
      and p.role = 'tenant_admin'
      and p.status = 'invited'
  ) then
    raise exception 'TEST FAILED: invited tenant-admin profile was not committed';
  end if;
  if not exists (
    select 1
    from public.tenant_onboarding_invitations i
    where i.tenant_id = v_created_tenant_id
      and i.invited_profile_id = 'c9000000-0000-0000-0000-000000000002'
      and i.status = 'pending'
  ) then
    raise exception 'TEST FAILED: invitation audit was not committed';
  end if;
  if not exists (
    select 1
    from public.schools s
    where s.tenant_id = v_created_tenant_id
      and s.name = 'Atomic School'
  ) then
    raise exception 'TEST FAILED: optional school was not committed';
  end if;
  if not exists (
    select 1
    from public.get_platform_tenant_onboarding_summary() s
    where s.tenant_id = v_created_tenant_id
  ) then
    raise exception 'TEST FAILED: successful tenant is missing from platform summary';
  end if;
  if exists (
    select 1
    from public.get_platform_tenant_onboarding_summary() s
    where s.tenant_id = 'c9000000-0000-0000-0000-000000000010'
  ) then
    raise exception 'TEST FAILED: empty orphan tenant attempt remains visible';
  end if;

  raise notice 'TEST PASSED: invitation finalization is atomic and successful tenant is visible';
end
$$;

-- A validation failure rolls back every row created inside the finalizer.
do $$
declare
  v_before bigint;
  v_after bigint;
begin
  select count(*) into v_before
  from public.tenants
  where name = 'Atomic Invalid Tenant';

  begin
    perform public.platform_finalize_tenant_invitation(
      'c9000000-0000-0000-0000-000000000002',
      'Atomic Invalid Tenant',
      'invalid_type',
      null,
      null,
      'Invalid Admin',
      'atomic-invited-admin@test.local'
    );
    raise exception 'TEST FAILED: invalid finalization unexpectedly succeeded';
  exception
    when others then
      if sqlerrm = 'TEST FAILED: invalid finalization unexpectedly succeeded' then
        raise;
      end if;
  end;

  select count(*) into v_after
  from public.tenants
  where name = 'Atomic Invalid Tenant';
  if v_after <> v_before then
    raise exception 'TEST FAILED: invalid finalization left a tenant row';
  end if;
  raise notice 'TEST PASSED: validation failure leaves no tenant';
end
$$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'c9000000-0000-0000-0000-000000000003';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"c9000000-0000-0000-0000-000000000003","role":"authenticated"}';

do $$
begin
  perform public.platform_find_unprofiled_auth_user(
    'atomic-invited-admin@test.local'
  );
  raise exception 'TEST FAILED: tenant admin inspected orphan Auth state';
exception
  when others then
    if sqlerrm = 'TEST FAILED: tenant admin inspected orphan Auth state' then
      raise;
    end if;
    raise notice 'TEST PASSED: non-platform caller cannot inspect orphan Auth state';
end
$$;

reset role;
set local role anon;

do $$
begin
  perform public.platform_finalize_tenant_invitation(
    'c9000000-0000-0000-0000-000000000002',
    'Anonymous Tenant',
    'demo',
    null,
    null,
    'Anonymous Admin',
    'atomic-invited-admin@test.local'
  );
  raise exception 'TEST FAILED: anonymous caller executed tenant finalization';
exception
  when insufficient_privilege then
    raise notice 'TEST PASSED: anonymous tenant finalization denied';
end
$$;

rollback;
