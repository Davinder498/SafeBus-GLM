# Phase 12 manual acceptance

Use the pull-request deploy preview with hosted Supabase DEV. Do not use production.

## Secure account prerequisite

SafeBus deliberately does not expose Supabase Auth Admin operations or a service-role key in the browser. Before testing, create or invite `Admin One`, `Driver One`, and `Guardian One` through the approved Supabase Auth administration process, then confirm each has an active, tenant-scoped `profiles` row with the correct role. The tenant administrator can connect existing driver and guardian profiles; they cannot create Auth credentials.

## Tenant admin

1. Sign in as `Admin One` and confirm the sidebar contains only Overview, Setup, Operations, People, and More.
2. Open Setup. Create `Bus One`, connect `Driver One`, and create `Route One`.
3. Add `Pickup Stop` and `Drop-off Stop` to Route One with the correct order.
4. Create `Student One` and confirm the student is active.
5. Open Guardians, confirm `Guardian One` is present, and link Student One.
6. Open Student transportation and assign Student One to Route One, selecting Pickup Stop and Drop-off Stop.
7. Open Driver and bus assignments and connect Driver One, Bus One, and Route One.
8. Open Trips and confirm the assignment says `Ready for driver`.
9. After the driver starts, confirm Trips and Live Fleet show the active trip and current location state.

## Driver

1. Sign in as Driver One and confirm the Route One / Bus One assignment appears.
2. Start the trip and open the manifest.
3. Start location sharing and confirm a current update is accepted.
4. Record Student One as picked up, then dropped off.
5. End the trip after guardian checks are complete.

## Guardian

1. Sign in as Guardian One and confirm only Student One is visible.
2. Confirm Route One appears under My Students & Routes.
3. Confirm the active trip appears under Bus Status.
4. Confirm a fresh bus marker appears on Live Bus Map.
5. Confirm pickup and drop-off status appears.
6. After Driver One ends the trip, refresh and confirm the trip and live marker are no longer active.

## Negative checks

- Guardian One and Driver One cannot open `/admin`, `/admin/setup`, `/admin/operations`, or `/admin/trips`.
- Guardian One cannot see an unlinked student.
- Admin One cannot see records belonging to another tenant.
- Inactive students, drivers, buses, routes, or stops are not offered as ready choices.
- A stale or invalid location does not render as a live guardian marker.
- An ended trip is not shown in active trip or live fleet views.
- Missing prerequisites produce a clear next action in Setup or Trips.

Record any failure with the role, page, expected result, actual result, and screenshot. Fix confirmed issues on the same Phase 12 branch and repeat this guide.
