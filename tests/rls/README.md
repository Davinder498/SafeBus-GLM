# SafeBus RLS Regression Tests

These SQL scripts are manual security regression tests for the most critical
SafeBus database boundaries: tenant isolation, roster writes, guardian-scoped
visibility, and role behavior that UI smoke tests cannot prove.

Do not run these scripts against production. They are intended only for hosted
Supabase DEV or a disposable database with SafeBus migrations applied.

## Files

- `student-roster-rls.sql`: seeds shared fixed-ID test data, tests student
  roster INSERT/UPDATE RLS, and includes safe cleanup before and after tests.
- `guardian-visibility-rls.sql`: uses the student-roster seed data to test
  `get_guardian_student_route_visibility()` and guardian SELECT policies.
- `guardian-linking-rls.sql`: tests the `admin_link_student_guardian()` and
  `admin_deactivate_student_guardian()` RPCs — cross-tenant blocking, duplicate
  prevention, reactivation, direct-write blocking, and guardian/driver denial.
- `guardian-live-trip-visibility-rls.sql`: SELF-CONTAINED tests for
  `get_guardian_live_trip_visibility()` (Milestone 6A) — seeds its own
  buses/routes/stops/trips/locations with disjoint fixed IDs, then verifies
  guardian-scoped live bus status: active-link-only visibility, no inactive
  links, no other-guardian students, no cross-tenant students/trips, completed
  trips not shown as active, no historical location trail, driver/admin/anon
  denial, and that the existing guardian route visibility + linking RLS still
  hold.

## `pnpm test:rls`

`pnpm test:rls` is a structural check only. It verifies that the RLS SQL files
and this README exist, then prints a manual-test notice.

It does not connect to Supabase, does not execute SQL, and must not be reported
as proof that the RLS assertions passed.

## `pnpm test:rls:dev`

`pnpm test:rls:dev` executes the RLS SQL scripts against a configured hosted
Supabase DEV database or a disposable migrated database. It is the automated
replacement for copy/paste SQL Editor runs.

This command is intentionally guarded. It refuses to run unless both
environment variables are set:

```bash
SAFEBUS_RLS_TEST_DATABASE_URL=postgresql://...
SAFEBUS_RLS_TEST_CONFIRM=DEV_ONLY
```

Never point `SAFEBUS_RLS_TEST_DATABASE_URL` at production. Never use frontend
Supabase anon keys or service-role API keys here. Use a Postgres connection URL
for hosted Supabase DEV or a disposable migrated database only.

Hosted Supabase connections use SSL by default. For a local disposable database
only, set `SAFEBUS_RLS_TEST_SSL=disable`.

Run all RLS scripts in deterministic order:

```bash
pnpm test:rls:dev
```

Run one SQL file:

```bash
pnpm test:rls:dev -- tests/rls/guardian-live-trip-visibility-rls.sql
```

Single-file and multi-file arguments are limited to `.sql` files under
`tests/rls`. The runner intentionally refuses migrations, legacy SQL, and other
repository SQL files.

The runner stops on the first failing SQL file, prints per-file pass/fail
output, closes the database connection, and exits non-zero on failure. A pass
means the SQL scripts completed successfully against the configured database.

The default execution order is:

1. `tests/rls/student-roster-rls.sql`
2. `tests/rls/guardian-visibility-rls.sql`
3. `tests/rls/guardian-linking-rls.sql`
4. `tests/rls/guardian-live-trip-visibility-rls.sql`

The database must be safe for fixed-ID seeded test data. The scripts create
test data and clean up after themselves where designed. If a run fails midway,
use the cleanup guidance below.

## Required Database Context

Run these scripts from a privileged SQL Editor/session in hosted Supabase DEV
or a disposable database. The setup inserts fixed test rows into:

- `auth.users`
- `public.tenants`
- `public.schools`
- `public.profiles`
- `public.guardians`
- `public.drivers`
- `public.students`
- `public.student_guardians`

The `guardian-live-trip-visibility-rls.sql` script additionally inserts fixed
test rows into:

- `public.buses`
- `public.routes`
- `public.route_stops`
- `public.student_route_assignments`
- `public.driver_trips`
- `public.driver_trip_current_locations`
- `public.driver_trip_location_updates` (privileged history seed rows)

The SQL Editor user must be allowed to insert/delete these test rows, including
direct inserts into `auth.users`.

## Transaction-Scoped User Simulation

Every simulated role test follows this pattern:

```sql
begin;
set local role authenticated;
set local request.jwt.claim.sub = '<user-id>';
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"<user-id>","role":"authenticated"}';

do $$
begin
  if auth.uid() <> '<user-id>'::uuid then
    raise exception 'auth.uid() simulation failed';
  end if;

  if public.current_user_role() <> '<expected_role>' then
    raise exception 'role simulation failed';
  end if;

  -- RLS assertion here.
end
$$;

rollback;
```

`SET LOCAL` is transaction-scoped. Do not split role/JWT setup and assertions
into separate SQL Editor runs unless the explicit transaction remains open.

Both JWT GUC formats are set intentionally:

- `request.jwt.claim.sub` / `request.jwt.claim.role`
- JSON `request.jwt.claims`

Hosted Supabase/PostgREST helper behavior can differ by version. The mandatory
`auth.uid()` sanity assertion confirms which path works in the target database.

## How To Run

1. Confirm you are connected to hosted Supabase DEV or a disposable database,
   never production.
2. Confirm migrations `0001` through the latest repository migration are
   applied.
3. Open `tests/rls/student-roster-rls.sql`.
4. Run the whole file, or run sections in order:
   - privileged cleanup-before-seed
   - privileged seed
   - individual test transactions
   - privileged cleanup-after-tests
5. To run guardian visibility tests separately, run the cleanup-before-seed and
   seed sections from `student-roster-rls.sql`, then run
   `guardian-visibility-rls.sql`, then run the cleanup-after-tests section from
   `student-roster-rls.sql`.
6. To run guardian live trip visibility tests, run
   `guardian-live-trip-visibility-rls.sql` — it is self-contained (own seed +
   own cleanup) and does NOT depend on the student-roster seed.

The project workflow currently forbids Docker-based local startup, `supabase
start`, and `supabase db reset`, so those are not part of this test workflow.

## Recovery And Cleanup

The cleanup blocks delete only fixed test IDs created by these scripts. If a
run fails midway, reconnect as the privileged SQL Editor user and run the
cleanup-after-tests section from `student-roster-rls.sql`.

Do not manually delete broad tenant, school, student, guardian, profile, or auth
tables. The cleanup is intentionally fixed-ID only.

## Student Roster Coverage

The roster script verifies:

- Tenant admin can create NULL-school and same-tenant-school students.
- Tenant admin can update own-tenant student fields, status, and NULL-school to
  same-tenant school.
- Tenant admin cannot use cross-tenant school IDs, move a student to another
  tenant, or update another tenant's student.
- Transportation admin can create/update own-tenant students, including
  NULL-school students.
- Transportation admin cannot write another tenant's student or use another
  tenant's school.
- School admin can create/update only own-school students.
- School admin cannot create NULL-school students, update to NULL school,
  create/update another school's students, or update NULL-school students.
- Guardian, driver, and anonymous contexts cannot write student roster data.
- Anonymous cannot read the protected roster.

## Guardian Visibility Coverage

The guardian script seeds and verifies:

- Guardian A.
- Guardian B.
- Guardian A active linked student.
- Guardian A inactive linked student.
- Unlinked same-tenant student.
- Cross-tenant student.
- Guardian B active linked student.

Assertions check exact returned student IDs, not just row counts. Guardian A
must receive exactly Guardian A's active linked student from the RPC and must
not receive inactive-link, unlinked, cross-tenant, or Guardian B rows. Guardian
B must receive exactly Guardian B's active linked student. Driver and tenant
admin contexts must receive no guardian RPC rows. Guardian A's
`student_guardians` SELECT policy must expose exactly Guardian A's own active
and inactive links, and hide Guardian B's link.

## Guardian Live Trip Visibility Coverage (Milestone 6A)

The `guardian-live-trip-visibility-rls.sql` script is self-contained and
verifies `get_guardian_live_trip_visibility()`:

- Guardian A sees live trip visibility ONLY for actively linked Student A, with
  `has_active_trip = true` and a current location.
- Guardian A cannot see a student held only via an INACTIVE link.
- Guardian A cannot see a student linked to another guardian (Guardian B).
- Guardian A cannot see students from another tenant.
- Guardian A cannot see trips/routes from another tenant.
- Guardian B sees Student B but a COMPLETED trip on that route is NOT shown as
  active (`has_active_trip = false`, null location).
- Guardian A cannot see a historical location trail — even after history rows
  are inserted, the RPC returns exactly one location row per active trip.
- Malformed cross-tenant stop references are not exposed through pickup/dropoff
  stop names.
- Malformed same-tenant but wrong-route stop references are not exposed through
  pickup/dropoff stop names.
- An active trip malformed to point at a cross-tenant bus is not treated as a
  valid active guardian-visible live trip.
- Current-location rows whose route or bus does not match the selected active
  trip are not exposed.
- Driver cannot call the guardian RPC (zero rows).
- Tenant admin cannot call the guardian RPC (zero rows, default deny).
- Anonymous access is denied (execute revoked, zero rows).
- The existing `get_guardian_student_route_visibility()` RPC still works.
- Guardian-linking `student_guardians` SELECT isolation still holds.

## Why Playwright Smoke Tests Are Not Enough

Playwright smoke tests verify UI behavior with mocked Supabase responses. They
do not execute real Postgres RLS policies, helper functions, or SECURITY
DEFINER RPC logic. These manual SQL tests exercise the actual database
authorization paths that mocks cannot validate.
