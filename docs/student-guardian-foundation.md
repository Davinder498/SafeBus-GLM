# Student And Guardian Foundation

Milestone 3B adds the first student and guardian data foundation for SafeBus Alberta. This is a read-only foundation for the web app and a forward-only Supabase migration. It does not add transportation operations features.

## Scope

Created tables:

- `public.students`
- `public.guardians`
- `public.student_guardians`

The migration also adds indexes, `updated_at` triggers, RLS select policies, a `current_guardian_id()` helper, and `authenticated` role `select` grants for these three tables.

Not included:

- buses, routes, route stops, trips, GPS, QR badges, scan events, notifications, CSV imports, maps, PowerSchool, or SchoolEngage
- frontend create, edit, delete, import, or linking workflows
- Alberta Student Number
- home addresses, medical details, or other sensitive child data

## Table Notes

`students` stores minimal school-visible child records:

- tenant and school references
- first name, last name, optional preferred name
- optional grade
- optional local `school_student_number`
- status

`guardians` stores guardian contact records linked to an existing profile:

- tenant reference
- `profile_id` pointing to `public.profiles.id`
- full name, email, optional phone
- status

`student_guardians` links students to guardians:

- tenant reference
- student and guardian references
- relationship label
- notification eligibility flag for future workflows
- status

`school_student_number` is a local school identifier only. Do not store Alberta Student Number in this field or anywhere else in this project.

## RLS Model

RLS remains enabled on all three tables.

Read access is granted through policies for:

- platform super admins
- tenant admins within their tenant
- transportation admins within their tenant
- school admins for students and guardians connected to their school
- guardians for their own active student links

The migration grants `select` to the Supabase `authenticated` role so RLS policies can evaluate. It does not grant `insert`, `update`, or `delete` to `authenticated`, and it does not grant access to `anon`.

## Frontend

The admin portal includes read-only pages:

- `/admin/students`
- `/admin/guardians`

These pages use the authenticated Supabase client and display only records returned by RLS. They include loading, error, empty, and local search states. Create, edit, delete, import, and linking workflows are intentionally deferred.

The parent dashboard reads the signed-in guardian's RLS-visible linked students from Supabase. Bus, trip, map, and timeline details remain mock placeholders because transportation operations tables are not part of this milestone.

## Manual Hosted Seed Example

Use fake data only. Create Supabase Auth users through Supabase Studio first, then insert matching `profiles` rows as described in `docs/local-auth-smoke-test.md`.

After a tenant, school, and guardian profile exist, seed demo student and guardian data with IDs from your hosted project:

```sql
-- Replace these values with IDs from your hosted Supabase project.
with demo_ids as (
  select
    '00000000-0000-0000-0000-000000000001'::uuid as tenant_id,
    '00000000-0000-0000-0000-000000000002'::uuid as school_id,
    '00000000-0000-0000-0000-000000000003'::uuid as guardian_profile_id
),
demo_student as (
  insert into public.students (
    tenant_id,
    school_id,
    first_name,
    last_name,
    preferred_name,
    grade,
    school_student_number,
    status
  )
  select
    tenant_id,
    school_id,
    'Demo',
    'Student',
    null,
    '4',
    'LOCAL-1001',
    'active'
  from demo_ids
  returning id, tenant_id
),
demo_guardian as (
  insert into public.guardians (
    tenant_id,
    profile_id,
    full_name,
    email,
    phone,
    status
  )
  select
    tenant_id,
    guardian_profile_id,
    'Demo Guardian',
    'demo.guardian@example.test',
    '555-0100',
    'active'
  from demo_ids
  returning id, tenant_id
)
insert into public.student_guardians (
  tenant_id,
  student_id,
  guardian_id,
  relationship,
  can_receive_notifications,
  status
)
select
  demo_student.tenant_id,
  demo_student.id,
  demo_guardian.id,
  'guardian',
  true,
  'active'
from demo_student
cross join demo_guardian;
```

Do not insert into `auth.users` directly from project seed scripts. Use Supabase Studio or the Supabase Auth API so password handling and auth metadata stay under Supabase Auth.

## Privacy Guardrails

- Do not use real student data in development or staging projects.
- Do not use Alberta Student Number.
- Do not add address, health, custody, or transportation assignment details to these tables.
- Do not put Supabase service-role or secret keys in frontend `.env` files.
- Use only the publishable/anon key in the Vite frontend.
