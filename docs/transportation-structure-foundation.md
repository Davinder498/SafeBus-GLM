# Transportation Structure Foundation

Milestone 3C adds the read-only transportation structure foundation for SafeBus Alberta. The source of truth is `supabase/migrations/0004_transportation_structure_foundation.sql`.

## Tables Created

- `buses`: tenant-scoped bus records with optional school assignment, bus number, license plate, capacity, and status.
- `drivers`: tenant-scoped driver records linked to `profiles`.
- `routes`: tenant and school-scoped route records with route code, route name, type, and status.
- `route_stops`: tenant-scoped stops linked to routes, with stop order, planned arrival time, and optional stop coordinates.
- `student_route_assignments`: tenant-scoped links between students, routes, and optional pickup/dropoff stops.

The migration adds useful indexes, unique constraints for tenant bus numbers and tenant route codes, update triggers using `public.set_updated_at()`, and SELECT grants for authenticated users only.

## RLS Access Rules

RLS is enabled on every new table. This milestone only adds SELECT policies.

- Platform super admins can read all transportation structure rows.
- Tenant admins can read rows in their tenant.
- Transportation admins can read rows in their tenant.
- School admins can read school-scoped bus, route, stop, and assignment rows for their school where a school scope exists.
- Drivers can read only their own `drivers` record.
- Guardians are not granted transportation browsing access in this milestone.

The frontend uses the normal Supabase client and relies on RLS. It does not use a service-role key.

## Privacy Decisions

This milestone follows the product principle: track the bus, not the child.

- No Alberta Student Number field is added.
- No `asn` or `alberta_student_number` field is added.
- No student home address fields are added.
- Stop latitude/longitude are route stop coordinates only, not home addresses.
- Guardians cannot browse routes, stops, assignments, or route passenger lists.
- Admin pages show only rows returned by RLS.

## Excluded Features

Trips, live GPS, live maps, Google Maps, Mapbox, QR codes, badges, pickup/dropoff events, scan events, notifications, CSV imports, create/edit/delete UI, and external SIS integrations are excluded from this milestone. Those features require separate data models, privacy review, and operational workflows.

## Hosted Supabase DEV Apply Steps

Do not run Docker, `supabase start`, or `supabase db reset`.

1. Open the Supabase Dashboard for the hosted DEV project.
2. Go to SQL Editor.
3. Open `supabase/migrations/0004_transportation_structure_foundation.sql` from this repository.
4. Paste the full migration into SQL Editor.
5. Run the SQL once.
6. Confirm these tables exist in the public schema: `buses`, `drivers`, `routes`, `route_stops`, and `student_route_assignments`.
7. Confirm RLS is enabled on all five tables.
8. Confirm authenticated SELECT grants exist.
9. Insert fake demo data only if needed.
10. Restart Vite only if environment variables changed.

Do not run destructive SQL against hosted DEV.

## Safe Demo Data Guidance

Use fake tenants, schools, students, guardians, drivers, buses, routes, and stops. Do not use real student data, real student home addresses, health data, or Alberta Student Numbers.

Acceptable examples:

- Bus number: `Demo-12`
- Route code: `AM-01`
- Stop name: `Community Centre Stop`
- Student names: `Demo Student One`
- Driver names: `Demo Driver One`

Avoid using real child records or production transportation data in DEV.
