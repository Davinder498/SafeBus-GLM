# Bus QR tracking sessions

This milestone replaces the driver route-assignment chooser with a bus-first start flow.

## Operational flow

1. An admin assigns a named route trip to a bus and assigns students to that bus service.
2. The admin selects **Make next run** for the exact route-trip pattern.
3. The admin generates and prints the bus QR once, then mounts it inside the bus.
4. Any logged-in, active driver in the same tenant scans that QR.
5. The server resolves the bus from the hashed QR credential, claims the one ready run, creates the trip, and returns a short-lived tracking-session token.
6. The phone sends location with only that session token and GPS values. The server derives tenant, driver, bus, route, and trip identity.
7. Ending the trip stops the tracking session and completes the prepared run.

The driver is an authentication and audit boundary, not a preassigned route choice. Driver accounts remain under the admin People area, but route-driver assignment is no longer part of the active bus workspace or driver start flow.

## Guardian boundary

Guardians do not choose or browse routes. Existing guardian visibility continues to require an active guardian-student link and an exact match between the student's bus-service assignment and the active trip's bus, route, and trip pattern. A bus used for another task or route therefore does not become visible to that guardian.

## Security properties

- The QR contains a random opaque credential, not a bus UUID or route data.
- Only its SHA-256 hash is stored in the database.
- Scanning also requires a logged-in, active driver in the same tenant.
- A run must have been prepared by an authorized transportation admin for the current service date.
- Only one ready/active run and one active tracking session can exist per bus.
- GPS writes accept no client-supplied bus, route, trip, driver, or tenant identifier.
- Replacing or revoking a QR invalidates active tracking sessions issued from that credential.
- The raw QR credential is returned only when generated or replaced and cannot be retrieved later.

## Hosted DEV rollout

Apply `supabase/migrations/0059_bus_qr_tracking_sessions.sql` manually in the hosted Supabase DEV SQL Editor. Then run `tests/rls/bus-qr-tracking-sessions-rls.sql` there. Do not apply either file to production as part of this milestone.

## Current device limitation

The app keeps one location watcher alive while the driver navigates between SafeBus screens. Browser and Android WebView operating systems can still suspend JavaScript after the app is backgrounded or the phone is locked. Guaranteed locked-screen tracking requires a later native Android foreground-location service; this milestone does not claim that capability.

## Fleet identity note

The operational bus number is treated as the stable student-facing service number. Once the bus has a service assignment, the database blocks changes to that number; admins change the physical vehicle plate instead. QR-started trips also snapshot the stable bus number. The current model still stores both values on one `buses` record, so a separate physical-vehicle history model remains a later milestone.
