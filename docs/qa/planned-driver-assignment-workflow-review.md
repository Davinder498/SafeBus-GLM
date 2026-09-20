# Planned driver assignment workflow review

Reviewed September 17, 2026. The reported save failure is confirmed in the
production Postgres log at 18:31:52 America/Edmonton. Production inspection was
read-only; no assignment was submitted or changed during the investigation.

## Cause and repair

`public.admin_set_driver_bus_assignment` initializes its tenant with
`safebus_private.current_tenant_id()` and checks the role through
`safebus_private.current_user_role()`. Neither private helper exists. The
canonical, active-profile/active-tenant helpers are `public.current_tenant_id()`
and `public.current_user_role()`. The first call raises SQLSTATE `42883` before
input validation or any assignment insert. Both the bus workspace and driver
detail form call this RPC and are affected.

The inspected driver and driver profile were active and belonged to the same
tenant. The bus was active; its route was active and ready, with reviewed
outbound and return patterns. The requested September 18 through December 31
dates were within the service's August 20 through December 31 window. Neither
direction had a saved driver plan. Changing these selections cannot repair the
missing helper.

Migration `0098_fix_planned_driver_assignment_context.sql` replaces only the
two helper schema references in the existing function. It preserves its
signature, execute grants, tenant and role checks, transaction behavior,
active-trip protection, and history rules. Migration 0093 remains immutable.
The frontend now distinguishes an unavailable planning backend from invalid
dates or insufficient permissions, without exposing database internals.

## Workflow traced

| Stage                   | Current contract and review result                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Driver onboarding       | An active driver record and active profile are required. The selected driver satisfied these checks.                                                                                                                                                                                                                                                      |
| Bus and route setup     | Assign an active bus to a ready route and reviewed named direction, with effective dates. Both bus directions were configured.                                                                                                                                                                                                                            |
| Admin planning          | Bus workspace and driver detail use the same atomic RPC. The wrong helper schemas are the confirmed save blocker.                                                                                                                                                                                                                                         |
| Dates                   | Plans must fit inside the bus service window. Both planning forms now default the end date from the service. The bus form now validates that window before sending the RPC.                                                                                                                                                                               |
| Replacement and overlap | Editing identifies the existing plan. Future replacement cuts the old plan off the previous day; other replacement marks it inactive. A different overlapping plan for the same route pattern is rejected by the database trigger. Corrected misleading UI text that claimed every overlapping plan would be deactivated.                                 |
| Audit and notifications | Successful inserts/updates invoke the existing audit and driver-notification triggers. The reported request never reached these steps. End-to-end database execution remains unverified.                                                                                                                                                                  |
| Driver dashboard        | Reads only the driver's RLS-scoped active, unexpired assignment rows. Plans are guidance and do not start trips.                                                                                                                                                                                                                                          |
| Start and operate       | Driver scans the bus QR, selects an effective bus-route direction, and starts the actual trip. The QR flow uses the correct public identity helpers and independently checks the active driver, tenant, bus, route and service. A plan is not a hard dispatch restriction: existing product behavior allows a driver to scan another eligible tenant bus. |
| Manifest and guardians  | Student manifest/event access and guardian bus visibility depend on the active trip and student bus-service links, not solely on the planned driver assignment. A successful plan alone does not start tracking or make a bus live.                                                                                                                       |

## Additional findings requiring follow-up

- Upcoming plan labels: the dashboard requests future plans, but bus and route
  RLS allows driver metadata reads only for plans effective today or an active
  trip. A future-only plan can therefore display `Unknown bus` / `Unknown
route` until its start date. The repair does not broaden these policies.
- Date boundaries use UTC-derived frontend dates and database `current_date`,
  rather than consistently using the tenant's Alberta timezone. Around local
  evening, a default date may already be tomorrow. This is separate from the
  `42883` save failure and needs a coordinated frontend/backend date change.
- The original contract tests matched unqualified helper names and inspected
  SQL text; they did not execute a successful tenant-admin save. New tests check
  schema-qualified helper resolution and include a non-production executable
  initialization regression. Browser tests use mocked responses and cannot
  establish that database triggers execute successfully.

## Validation and release boundary

Passed `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, and
`pnpm migrations:verify` (99 immutable migrations). All 122 targeted browser
tests passed across desktop and mobile Chromium: 30 admin workspace / driver
dashboard tests and 92 manifest, trip history, guardian map and event-status
tests. Coverage includes driver detail planning, QR route choice and the
active-trip workflow. These tests use synthetic mock responses and do not write
production data; they do not establish native Android or live database success.

The SQL regression in `tests/rls/planned-driver-bus-assignments-rls.sql` must run
only on an explicitly approved isolated target after migration 0098. Before
release, also exercise successful same-tenant create/replace, wrong-role and
cross-tenant denials, out-of-window dates, overlapping plans, active-trip edit
blocking, history, and notification creation with synthetic fixtures. No such
database is currently approved; these runtime cases remain a release gate.

Do not apply the migration directly to production or report the live issue as
fixed merely because local checks pass. AGENTS.md requires isolated migration
validation and the protected approved adoption/release workflow, and human
approval before merging the review PR.

The existing `scripts/deploy-migrations.mjs` also explicitly blocks every pending
migration in single-production-database mode. Approving the isolated target and
validating the repair must precede an explicitly reviewed schema-release path;
merging this PR or rerunning the current application-release workflow alone will
not apply migration 0098.
