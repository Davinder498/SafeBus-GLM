# SafeBus Alberta Local Auth Smoke Test

Use this guide to verify the local Supabase-backed admin organization/profile foundation. This is a local-only smoke test for Milestone 3A.

Do not use production credentials. Do not put a Supabase secret/service role key in frontend `.env` files. Use only the local publishable/anon key in the web app.

## 1. Start Supabase Locally

From the repo root:

```powershell
pnpm exec supabase start
```

If this is a fresh local database, reset and apply migrations:

```powershell
pnpm exec supabase db reset
```

The CLI output includes local service URLs and keys. You need the API URL and anon key for the frontend.

## 2. Configure the Web App Env

Create `apps/web/.env`:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local-anon-key-from-supabase-start>
```

Use the anon/publishable key only. Never use the service role key in `apps/web/.env`.

## 3. Start the Web App

From the repo root:

```powershell
pnpm --filter @safebus/web dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## 4. Create Local Auth Users

Open Supabase Studio from the local CLI output, usually:

```text
http://127.0.0.1:54323
```

Go to Authentication and create three local test users:

- `tenant-admin@example.test`
- `driver@example.test`
- `guardian@example.test`

Set local test passwords you can use from the login page. After each user is created, copy the user's UUID from `auth.users.id`.

## 5. Insert Demo Tenant And School

In Supabase Studio SQL editor, run:

```sql
insert into public.tenants (id, name, type, status)
values (
  '00000000-0000-0000-0000-000000000100',
  'Maple Creek School Division',
  'school',
  'active'
)
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

## 6. Insert Matching Profiles

Important identity rule:

```text
public.profiles.id = auth.users.id
```

Replace each `<...-auth-user-id>` below with the matching UUID copied from Supabase Auth.

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
values
(
  '<tenant-admin-auth-user-id>',
  '00000000-0000-0000-0000-000000000100',
  null,
  'Demo Tenant Admin',
  'tenant-admin@example.test',
  'tenant_admin',
  'active'
),
(
  '<driver-auth-user-id>',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000200',
  'Demo Driver',
  'driver@example.test',
  'driver',
  'active'
),
(
  '<guardian-auth-user-id>',
  '00000000-0000-0000-0000-000000000100',
  '00000000-0000-0000-0000-000000000200',
  'Demo Guardian',
  'guardian@example.test',
  'guardian',
  'active'
);
```

If you need to rerun with changed UUIDs:

```sql
delete from public.profiles
where email in (
  'tenant-admin@example.test',
  'driver@example.test',
  'guardian@example.test'
);
```

## 7. Test Login Redirects

Use `/login` in the web app.

Expected redirects:

- `tenant_admin` -> `/admin`
- `driver` -> `/driver`
- `guardian` -> `/parent`

Admin-style roles that should route to `/admin`:

- `platform_super_admin`
- `tenant_admin`
- `school_admin`
- `transportation_admin`

## 8. Admin Smoke Checks

Sign in as `tenant-admin@example.test`, then verify:

- `/admin/settings` shows the current user, tenant, and profile context.
- `/admin/schools` shows `Maple Creek School`.
- `/admin/users` shows the profiles visible through RLS.

If `/admin/users` shows fewer rows than expected, verify the signed-in admin role and profile tenant assignment.

## Troubleshooting

### Missing Profile

Symptom: login succeeds but the app shows a profile setup error.

Check that `public.profiles.id` exactly matches the Supabase Auth user UUID. Do not use a separate generated profile UUID.

### Wrong Role

Symptom: login redirects to the wrong portal or shows a wrong-portal message.

Check `public.profiles.role`. Valid values are:

- `platform_super_admin`
- `tenant_admin`
- `school_admin`
- `transportation_admin`
- `driver`
- `guardian`

### Missing Env Vars

Symptom: login page shows Supabase is not configured.

Check `apps/web/.env` contains:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Restart the Vite dev server after changing `.env`.

### RLS Returns Empty Rows

Symptom: admin pages load but show empty lists.

Check:

- The signed-in profile has `status = 'active'`.
- The profile has the expected `tenant_id`.
- School-scoped profiles have the expected `school_id`.
- The local rows were inserted into the same Supabase instance used by the frontend.

### Supabase Not Running

Symptom: network errors or failed auth requests.

Run:

```powershell
pnpm exec supabase status
```

Start it again if needed:

```powershell
pnpm exec supabase start
```

### Wrong Local Key Used

Symptom: auth requests fail even though Supabase is running.

Use the local anon/publishable key from `pnpm exec supabase start`. Do not use the service role key. Do not use production credentials for local development.

## Security And Privacy Notes

- Do not expose the Supabase service role key to the frontend.
- Use only the publishable/anon key in `apps/web/.env`.
- Do not use production credentials in local development.
- Do not use real student data.
- Do not use Alberta Student Number in QR, mock data, profile records, or test records.
- SafeBus Alberta tracks the bus, not the child.
