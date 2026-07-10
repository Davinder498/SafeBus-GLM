# Driver Event Flow Manual QA Playbook

This playbook verifies the Milestone 7A/7B driver manifest and pickup/drop-off
flow with fake DEV data only.

Do not use real children. Do not run this fixture or any seed SQL against
production. The fixture is a QA/developer helper, not a product feature.

## Preconditions

- Use hosted Supabase DEV or a disposable migrated database only.
- Apply repository migrations through the latest migration in
  `supabase/migrations`.
- Configure the web app with only:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Do not place service-role keys in frontend env files, docs, logs, or
  screenshots.
- Confirm the target database is not production before running any seed command.

## DEV Fixture Script

The guarded fixture script creates this fake dataset:

- `QA Test Tenant`
- `QA Test School`
- `QA Test Driver` (`qa-test-driver@example.test`)
- `QA Test Route`
- `QA Pickup Stop`
- `QA Dropoff Stop`
- `QA Test Student One`
- `QA Test Student Two`
- one active driver assignment
- one active driver trip

It does not seed guardians, guardian contact data, student addresses, health
data, Alberta Student Numbers, QR codes, notifications, map data, or event rows.
Pickup/drop-off events must be created through the existing driver RPCs by using
the `/driver/manifest` UI.

Run only with a DEV/disposable Postgres connection URL:

```bash
SAFEBUS_QA_SEED_CONFIRM=DEV_ONLY SAFEBUS_QA_SEED_DATABASE_URL=<DEV_DATABASE_URL> pnpm qa:seed:driver-events
```

Hosted Supabase usually requires SSL, which the script enables by default. For a
local disposable database only, use:

```bash
SAFEBUS_QA_SEED_SSL=disable SAFEBUS_QA_SEED_CONFIRM=DEV_ONLY SAFEBUS_QA_SEED_DATABASE_URL=<LOCAL_DATABASE_URL> pnpm qa:seed:driver-events
```

The script refuses to run without `SAFEBUS_QA_SEED_CONFIRM=DEV_ONLY` and
`SAFEBUS_QA_SEED_DATABASE_URL`. It never reads `VITE_SUPABASE_URL` or
`VITE_SUPABASE_ANON_KEY` as mutation authority.

The script uses deterministic fixture IDs and deletes/recreates only the
fixture rows on rerun. Rerunning should not create unlimited duplicate fake
students, trips, assignments, or events.

Default fixture login:

```text
Email: qa-test-driver@example.test
Password: SafeBusQaDriver7C!
```

If a hosted Supabase Auth schema rejects direct fixture auth insertion, create a
fake Auth user manually in Supabase Dashboard with an `@example.test` email, then
rerun the script with:

```bash
SAFEBUS_QA_DRIVER_AUTH_USER_ID=<AUTH_USER_UUID> SAFEBUS_QA_DRIVER_EMAIL=<fake-driver@example.test> SAFEBUS_QA_SEED_CONFIRM=DEV_ONLY SAFEBUS_QA_SEED_DATABASE_URL=<DEV_DATABASE_URL> pnpm qa:seed:driver-events
```

## Manual Setup Without The Script

If the script cannot be used, create or identify these records manually in DEV
with obviously fake values:

1. Test tenant: `QA Test Tenant`
2. Test school: `QA Test School`
3. Test driver Auth user and matching `public.profiles` row with role `driver`
4. Matching active `public.drivers` row for the profile
5. Active bus: `QA-BUS-7C`
6. Active route: `QA Test Route`
7. Active stops: `QA Pickup Stop` and `QA Dropoff Stop`
8. Active students: `QA Test Student One` and `QA Test Student Two`
9. Active `student_route_assignments` rows for both students on the route
10. Active `driver_route_assignments` row for the driver, bus, and route
11. Active `driver_trips` row for the same driver, bus, and route

Do not create event rows manually for this QA check. The event flow must be
exercised through the driver manifest UI and the approved RPC path.

## Manual Verification Steps

1. Start the web app against hosted Supabase DEV.
2. Sign in as the fake driver.
3. Open `/driver`.
4. Confirm the driver dashboard loads and shows an active trip for
   `QA Test Route`.
5. Open `/driver/manifest`.
6. Confirm the manifest shows `QA Test Student One` and
   `QA Test Student Two`.
7. Confirm each student initially shows `Not picked up`.
8. Click `Mark picked up` for one fake student.
9. Confirm the same student changes to `Picked up`.
10. Click `Mark dropped off` for that fake student.
11. Confirm the same student changes to `Dropped off`.
12. Repeat pickup/drop-off for the second fake student if needed.
13. Refresh `/driver/manifest` and confirm the status remains visible.
14. Spot-check existing guardian, admin, and driver pages still load.

## Expected Status Sequence

Each fake student should move through this sequence:

```text
Not picked up -> Picked up -> Dropped off
```

The UI should not allow drop-off before pickup because the drop-off button only
appears after pickup. The backend RPC also enforces that ordering.

## What Not To Expect

- no map
- no ETA
- no QR code
- no camera access
- no SMS/email/push notification
- no guardian event timeline
- no realtime subscription
- no driver location changes
- no production dummy-data generator

## Acceptance Checklist

- The QA seed was run only against hosted Supabase DEV or a disposable database,
  or it was skipped because no safe database URL was available.
- All fixture data is fake and uses reserved-domain email only.
- `/driver/manifest` shows the fake students assigned to the active trip.
- The fake driver can mark a fake student picked up.
- The fake driver can mark the same fake student dropped off.
- Status updates are visible on the manifest page.
- No production UI was added for dummy data.
- No broad RLS policy or public policy was added.
- No direct browser writes to `student_trip_events` were added.
