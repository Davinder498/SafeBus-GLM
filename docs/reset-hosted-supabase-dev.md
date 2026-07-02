# Reset Hosted Supabase Development Project

This guide is for resetting a SafeBus Alberta development or prototype Supabase project to the clean canonical foundation schema.

Do not run these steps on production. These steps can delete development/prototype app tables and data.

Back up the hosted project first if you are unsure whether any data should be kept.

## Canonical Scope

The clean app schema currently contains only:

- `public.tenants`
- `public.schools`
- `public.profiles`
- `public.students`
- `public.guardians`
- `public.student_guardians`

Supabase system schemas such as `auth`, `storage`, `realtime`, `extensions`, `graphql`, `vault`, and other internal schemas may remain. Do not manually delete Supabase system schemas.

The following app tables are not part of the current milestone and should not exist in a clean canonical app schema yet:

- `buses`
- `drivers`
- `routes`
- `route_stops`
- `trips`
- `live_bus_locations`
- `trip_location_history`
- `student_badges`
- `student_scan_events`
- `student_route_assignments`
- `trip_alerts`
- `notifications`
- `imports`
- consent tables
- GPS tables
- QR tables

## Recommended Reset Options

### Safest: Create A New Clean Dev Project

1. Create a new Supabase project for development.
2. Update local environment files with the new project URL, anon key, and DB connection string.
3. Apply only the active migrations in `supabase/migrations`:
   - `0001_auth_profile_foundation.sql`
   - `0002_foundation_read_grants.sql`
   - `0003_students_guardians_foundation.sql`
4. Create test Supabase Auth users.
5. Insert matching `public.profiles` rows where `profiles.id = auth.users.id`.

This avoids carrying forward old prototype tables, text-ID drift, permissive policies, or legacy columns.

### Acceptable For Dev Only: Reset Existing Prototype Project

Use this only when the hosted project is confirmed to be development/prototype and its public app data can be deleted.

1. Back up first if unsure.
2. Do not delete Supabase system schemas manually.
3. In the Supabase SQL editor or an approved database client, manually run `supabase/dev_only_reset_public_schema.sql`.
4. Apply only the active migrations in `supabase/migrations`.
5. Reload PostgREST schema if needed:

```sql
notify pgrst, 'reload schema';
```

## Applying Clean Migrations

Apply these files in order:

1. `supabase/migrations/0001_auth_profile_foundation.sql`
2. `supabase/migrations/0002_foundation_read_grants.sql`
3. `supabase/migrations/0003_students_guardians_foundation.sql`

Do not apply files from `supabase/legacy` to a clean database.

## Create Test Auth Users And Profiles

Create test users through Supabase Authentication. Do not insert directly into `auth.users`.

For each test user:

1. Copy the user's `auth.users.id` UUID.
2. Insert a matching `public.profiles` row with the same UUID.

Example shape:

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
  '<tenant-id>',
  '<school-id-or-null>',
  'Demo Tenant Admin',
  'tenant-admin@example.test',
  'tenant_admin',
  'active'
);
```

Use fictional demo data only. Do not add Alberta Student Number, student addresses, health data, transportation assignments, GPS data, QR data, or notifications in this milestone.
