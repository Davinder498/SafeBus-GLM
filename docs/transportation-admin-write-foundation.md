# Transportation Admin Write Foundation

Milestone 3D adds secure admin create/edit workflows for the existing transportation structure. It covers buses, driver records, routes, route stops, and student route assignments.

This milestone does not add live trips, GPS, maps, QR codes, badge scans, notifications, SMS, CSV import, PowerSchool integration, SchoolEngage integration, or production deployment.

## Tables Affected

- `public.buses`
- `public.drivers`
- `public.routes`
- `public.route_stops`
- `public.student_route_assignments`

## Write RLS Rules

Migration `supabase/migrations/0005_transportation_admin_write_foundation.sql` adds helper functions and insert/update policies for authenticated admin users only.

Allowed write roles:

- `platform_super_admin`
- `tenant_admin`
- `school_admin`
- `transportation_admin`

Driver and guardian roles do not receive insert or update policies for these transportation structure tables.

Tenant and school scoping:

- Platform super admins can insert/update rows across tenants.
- Tenant admins can insert/update rows in their current tenant.
- Transportation admins can insert/update tenant transportation rows in their current tenant.
- School admins can insert/update school-scoped rows for their current school.
- Driver records must link to an existing `profiles` row with role `driver`.
- Route stops must belong to a writable route in the same tenant.
- Student route assignments must keep student, route, and pickup/dropoff stops in the same tenant, and pickup/dropoff stops must belong to the selected route.

## Deletes Are Not Enabled

No delete grants or delete policies are added. Records should be made inactive, archived, retired, suspended, or maintenance-statused depending on the table. This preserves auditability and avoids accidental loss of operational history.

## Frontend Service Role Use

The frontend continues to use only the normal Supabase authenticated client configured with:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

No service role key is used in frontend code. RLS remains the security boundary.

## Hosted Supabase DEV SQL Editor Apply Instructions

Do not run Docker, `supabase start`, or `supabase db reset`.

1. Open the hosted Supabase DEV project.
2. Go to SQL Editor.
3. Open `supabase/migrations/0005_transportation_admin_write_foundation.sql`.
4. Paste and run the full migration.
5. Confirm the helper functions, policies, and authenticated insert/update grants were created.
6. Log in as a tenant/admin user.
7. Try creating and editing a bus, driver record, route, stop, and student route assignment.
8. Log in as a driver or guardian and confirm admin write routes and controls are unavailable or blocked by RLS.

## Manual Smoke-Test Checklist

- Admin can open `/admin/buses`, add a bus, edit the bus, and set status to inactive/maintenance/retired.
- Admin can open `/admin/drivers`, link a visible existing driver profile, and edit driver phone/status.
- Admin can open `/admin/routes`, add a route for a visible school, and edit code/name/type/status.
- Admin can open `/admin/stops`, add a stop to a visible route, edit order/time/coordinates/status, and cannot save invalid coordinates.
- Admin can open `/admin/assignments`, assign a visible student to a visible route, choose route-specific pickup/dropoff stops, and edit dates/status.
- School admin cannot write records outside their current school.
- Tenant or transportation admin cannot write records outside their current tenant.
- Driver user cannot create or update transportation structure rows.
- Guardian user cannot browse route/passenger lists and cannot create or update transportation structure rows.
- RLS errors are displayed as useful save errors in the UI.

## Privacy Reminders

- Do not add Alberta Student Number.
- Do not add `asn`.
- Do not add `alberta_student_number`.
- Do not collect or store student home address.
- Do not collect or store health data.
- Do not expose full student lists to guardian users.
- Guardians must only see their linked students.
- Stop coordinates are stop coordinates only.
