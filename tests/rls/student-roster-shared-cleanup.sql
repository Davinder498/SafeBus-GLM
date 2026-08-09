-- SafeBus Alberta - shared student-roster RLS fixture cleanup.
--
-- Run after student-roster, guardian-visibility, and guardian-linking suites.
-- This file contains only fixed-ID destructive cleanup for hosted DEV or a
-- disposable migrated database. Never run it against production.

begin;

-- The complete synthetic tenant reset intentionally removes its final active
-- tenant administrator. Keep this exception scoped to the privileged,
-- transactional DEV-test cleanup and restore the production guard immediately.
alter table public.profiles
  disable trigger protect_final_tenant_admin_delete;

delete from public.student_guardians where id in (
  'f6000000-0000-0000-0000-000000000001',
  'f6000000-0000-0000-0000-000000000002',
  'f6000000-0000-0000-0000-000000000003'
);

delete from public.students where id in (
  'e5000000-0000-0000-0000-000000000001',
  'e5000000-0000-0000-0000-000000000002',
  'e5000000-0000-0000-0000-000000000003',
  'e5000000-0000-0000-0000-000000000004',
  'e5000000-0000-0000-0000-000000000005',
  'e5000000-0000-0000-0000-000000000006',
  'e5000000-0000-0000-0000-000000000007',
  'e5100000-0000-0000-0000-000000000001',
  'e5100000-0000-0000-0000-000000000002',
  'e5100000-0000-0000-0000-000000000003',
  'e5100000-0000-0000-0000-000000000010',
  'e5100000-0000-0000-0000-000000000011',
  'e5100000-0000-0000-0000-000000000012',
  'e5100000-0000-0000-0000-000000000013',
  'e5100000-0000-0000-0000-000000000015',
  'e5100000-0000-0000-0000-000000000017',
  'e5100000-0000-0000-0000-000000000018',
  'e5100000-0000-0000-0000-000000000019'
);

delete from public.guardians where id in (
  'd4000000-0000-0000-0000-000000000001',
  'd4000000-0000-0000-0000-000000000003'
);

delete from public.drivers where id = 'd4000000-0000-0000-0000-000000000002';

delete from public.profiles where id in (
  'c3000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000002',
  'c3000000-0000-0000-0000-000000000003',
  'c3000000-0000-0000-0000-000000000004',
  'c3000000-0000-0000-0000-000000000005',
  'c3000000-0000-0000-0000-000000000006'
);

delete from auth.users where id in (
  'c3000000-0000-0000-0000-000000000001',
  'c3000000-0000-0000-0000-000000000002',
  'c3000000-0000-0000-0000-000000000003',
  'c3000000-0000-0000-0000-000000000004',
  'c3000000-0000-0000-0000-000000000005',
  'c3000000-0000-0000-0000-000000000006'
);

delete from public.schools where id in (
  'b2000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000002',
  'b2000000-0000-0000-0000-000000000003'
);

delete from public.tenants where id in (
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002'
);

alter table public.profiles
  enable trigger protect_final_tenant_admin_delete;

commit;

select 'Shared student-roster RLS fixtures cleaned up' as result;
