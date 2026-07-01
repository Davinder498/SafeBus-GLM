# SafeBus Alberta Supabase Auth Setup

This is a clean pre-production migration baseline for Milestone 2A/2B authentication and profile access only. It intentionally does not include transportation business tables or student records.

For an end-to-end local login and admin-page smoke test, see `docs/local-auth-smoke-test.md`.

## Frontend Environment Variables

The web app needs these Vite variables:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Do not put a Supabase service role key in the frontend app or in `apps/web/.env.example`. The service role key must never be exposed to browser code.

## Apply Migrations

When the Supabase CLI is installed, run migrations from the repo root:

```powershell
supabase db push
```

For local development, start Supabase first if needed:

```powershell
supabase start
supabase db reset
```

`db reset` recreates the local database and reapplies all migrations. Use it only for local/demo data. This migration set is pre-production and assumes no real database depends on the earlier prototype migrations.

## Create Test Auth Users

Create users from Supabase Studio or the Supabase dashboard under Authentication. Disable public signup for this project.

After each auth user exists, copy its `auth.users.id` UUID and insert a matching `public.profiles` row where `profiles.id` equals that auth user ID.

The clean identity model is:

```text
public.profiles.id = auth.users.id
```

There is no separate `auth_user_id` column.

## Minimal Demo Identity Rows

Create one tenant and one school for local/demo accounts:

```sql
insert into public.tenants (id, name, type, status)
values ('00000000-0000-0000-0000-000000000100', 'Maple Creek School Division', 'school', 'active')
on conflict (id) do nothing;

insert into public.schools (id, tenant_id, name, city, province, status)
values (
  '00000000-0000-0000-0000-000000000200',
  '00000000-0000-0000-0000-000000000100',
  'Maple Creek School',
  'Red Deer',
  'AB',
  'active'
)
on conflict (id) do nothing;
```

Replace each profile UUID below with a real Supabase auth user ID.

### Tenant Admin Profile

```sql
insert into public.profiles (
  id,
  tenant_id,
  school_id,
  full_name,
  email,
  role,
  status
)
values (
  '<auth-user-id>',
  '00000000-0000-0000-0000-000000000100',
  null,
  'Demo Tenant Admin',
  'tenant-admin@example.test',
  'tenant_admin',
  'active'
);
```

### Driver Profile

```sql
insert into public.profiles (
  id,
  tenant_id,
  school_id,
  full_name,
  email,
  role,
  status
)
values (
  '<auth-user-id>',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000200',
  'Demo Driver',
  'driver@example.test',
  'driver',
  'active'
);
```

### Guardian Profile

```sql
insert into public.profiles (
  id,
  tenant_id,
  school_id,
  full_name,
  email,
  role,
  status
)
values (
  '<auth-user-id>',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000200',
  'Demo Guardian',
  'guardian@example.test',
  'guardian',
  'active'
);
```

## Privacy Reminders

Use fictional demo users only.

Do not add real student data in this milestone.

Do not use Alberta Student Number in QR payloads, mock data, profile records, or test records.

SafeBus Alberta tracks the bus, not the child.
