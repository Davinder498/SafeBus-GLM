# Phase 6 Transportation Operations Acceptance

Run this acceptance only against hosted Supabase DEV after a human applies
`0079_phase6_transportation_operations_completion.sql` through the SQL Editor.
Do not use production data. Create synthetic people and routes only.

## Preconditions

- Migration checksum verification passes.
- Tenant admin, school admin, transportation admin, driver, guardian, and Platform Super Admin test accounts use MFA where required.
- Two synthetic schools, two buses, and two drivers exist in one DEV tenant.
- No test field contains a real student name, address, health, custody, contact, or other personal information.

## Synthetic operational day

1. As tenant admin, create both schools, active buses, drivers, a guardian, and synthetic students.
2. Create a route with at least two stops, outbound/return stop times, and weekday service days.
3. Link the guardian to only the authorized synthetic student.
4. Assign the student to the route/bus stops and assign a driver and bus to the route.
5. Prepare and start a run through the existing bus start workflow.
6. As driver, confirm the pre-trip inspection, record a controlled exception, pause, resume, and complete the trip.
7. Prepare another run and cancel it. Confirm the trip, tracking session, and dispatch are no longer active.
8. Before a later run starts, substitute the driver and replace the bus. Confirm the earlier assignment rows remain inactive history and new rows are active.
9. Set the active run to Late and Missing bus using controlled dispatch reasons, then return it to Normal. Confirm the screen states that these values do not calculate ETA.
10. Add controlled operational notes to the route, bus, driver, and trip. Attempt notes containing `ASN`, asthma medication, custody, and a synthetic street address; each must be rejected.
11. Revoke the guardian link with a controlled reason. Confirm the guardian can no longer see that student's transportation data.
12. Review trip history, pre-trip confirmation, exceptions, operational notes, and audit search evidence.

## Role boundaries

- Tenant admin can see and operate records across both tenant schools.
- School admin can see only their assigned school's routes, trips, service days, status, notes, and guardian links.
- Transportation admin remains tenant operationally scoped.
- Driver sees only their own/open trip and driver history.
- Guardian sees only actively linked students.
- Platform Super Admin cannot open tenant transportation operations or read Phase 6 operational tables.

## Acceptance evidence

- Record the DEV migration application time and tester names without credentials.
- Save pass/fail results for the SQL RLS suite and browser suite.
- Confirm no Phase 6 screen or status derives a new ETA.
- Human approval is required before merge; do not modify production.
