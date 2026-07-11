
## Milestone 9A — Guardian Pickup/Drop-off Notification Outbox Foundation

- Added a backend-only, tenant-scoped guardian notification outbox foundation for future pickup/drop-off notifications.
- Driver pickup/drop-off RPCs now enqueue pending outbox rows only after valid events and only for active linked same-tenant guardians.
- No SMS, email, push, realtime delivery, provider integration, worker, guardian notification UI, or admin notification UI exists.
- Added RLS regression coverage for outbox creation, deduplication, rejected event attempts, tenant/guardian scoping, and blocked direct browser-style outbox access.

# SafeBus Alberta - Milestone Status

> Source of truth for repository milestone progress. Update this file whenever
> a milestone or QA hardening pass lands on `main`.

## Current Checkout State

- Current working branch: `main`.
- Current workflow for recent QA fixes: implementation is being pushed directly
  to latest `main`; Codex reviews latest `main`.
- Hosted Supabase DEV is used for database smoke/RLS execution. Do not run RLS
  SQL against production.
- SQL migrations are kept in `supabase/migrations` and are applied manually to
  hosted Supabase DEV through the SQL Editor.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS
- React Router
- Supabase Auth + Postgres + RLS
- pnpm workspaces + Turborepo
- Playwright smoke tests
- Netlify deployment target

## Completed Milestones

| Milestone                                                    | Evidence in repo                                                                                                                                            | Status                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 2A/2B - Auth & Profile Foundation                            | `0001_auth_profile_foundation.sql`, `0002_foundation_read_grants.sql`                                                                                       | Completed                          |
| 3B - Students & Guardians Foundation                         | `0003_students_guardians_foundation.sql`                                                                                                                    | Completed                          |
| 3C - Transportation Structure Foundation                     | `0004_transportation_structure_foundation.sql`                                                                                                              | Completed                          |
| 3D - Transportation Admin Write Foundation                   | `0005_transportation_admin_write_foundation.sql`                                                                                                            | Completed                          |
| 4A - Driver Trip Operations Foundation                       | `0006_driver_trips_foundation.sql`, driver trip service/UI smoke coverage                                                                                   | Completed                          |
| 4B/4C - Admin Live Trip Monitoring Foundation + Hardening    | `0007_driver_location_update_foundation.sql` through `0014_enforce_assignment_only_trip_start.sql`                                                          | Completed                          |
| 5A - Guardian Student & Route Visibility Foundation          | `0015_guardian_student_route_visibility_foundation.sql`, guardian route page/service/smoke coverage                                                         | Completed                          |
| 5A.1 - Tenant Admin Student Roster Foundation                | `0016_student_roster_admin_write_foundation.sql`, `0017_fix_student_roster_school_scope.sql`, `0018_fix_students_rls_update_recursion.sql`                  | Completed                          |
| 5A.2 - Supabase RLS Regression Test Foundation               | `tests/rls/student-roster-rls.sql`, `tests/rls/guardian-visibility-rls.sql`, `tests/rls/README.md`                                                          | Completed                          |
| 5B - Tenant Admin Guardian Management & Linking UX Hardening | `0019_secure_guardian_student_linking_rpc.sql`, `tests/rls/guardian-linking-rls.sql`                                                                        | Completed                          |
| 6A - Guardian Live Trip Visibility Security Foundation       | `0020_guardian_live_trip_visibility_foundation.sql`, `0021_harden_guardian_live_trip_visibility_rpc.sql`, `tests/rls/guardian-live-trip-visibility-rls.sql` | Completed, reviewed, and fixed     |
| QA-1 - Automated Supabase RLS Test Runner                    | `scripts/run-rls-tests.mjs`, `pnpm test:rls:dev`, path-safety fix in latest `main`                                                                          | Completed and review blocker fixed |
| 7A/7B QA - Driver Event Manual Fixture                       | `docs/qa/driver-event-flow-manual-test.md`, `scripts/seed-driver-event-qa-fixture.mjs`, `pnpm qa:seed:driver-events`                                        | DEV-only QA helper                 |
| 8A - Guardian Student Trip Event Visibility Security Foundation | `0024_guardian_student_trip_event_visibility.sql`, `tests/rls/guardian-student-trip-event-visibility-rls.sql`                                             | In progress                        |

## Current Milestone

Milestone 8A is active on a feature branch. It adds a backend-only, guardian
RPC/RLS foundation for safe pickup/drop-off event status visibility.

Do not start the next product milestone until it is explicitly selected.

## RLS Test Workflow

`pnpm test:rls` is structural only. It checks that the expected SQL files and
README exist, but it does not connect to Supabase and does not execute SQL.
Do not report `pnpm test:rls` as proof that SQL assertions passed.

`pnpm test:rls:dev` executes SQL against a configured hosted Supabase DEV or
disposable migrated database. It requires:

```bash
SAFEBUS_RLS_TEST_DATABASE_URL=postgresql://...
SAFEBUS_RLS_TEST_CONFIRM=DEV_ONLY
```

The automated runner executes the default RLS files in deterministic order:

1. `tests/rls/student-roster-rls.sql`
2. `tests/rls/guardian-visibility-rls.sql`
3. `tests/rls/guardian-linking-rls.sql`
4. `tests/rls/guardian-live-trip-visibility-rls.sql`
5. `tests/rls/driver-active-trip-student-manifest-rls.sql`
6. `tests/rls/driver-student-trip-events-rls.sql`
7. `tests/rls/guardian-student-trip-event-visibility-rls.sql`

Single-file and multi-file runner arguments are restricted to `.sql` files
under `tests/rls`. The runner must not be used for migrations, legacy SQL, or
arbitrary repository SQL.

Never run manual or automated RLS SQL against production.

## Driver Event QA Fixture

Milestone 7C adds a DEV-only manual QA helper for the driver active-trip
manifest and pickup/drop-off event flow:

- Playbook: `docs/qa/driver-event-flow-manual-test.md`
- Seed script: `pnpm qa:seed:driver-events`
- Required guards:
  - `SAFEBUS_QA_SEED_DATABASE_URL=postgresql://...`
  - `SAFEBUS_QA_SEED_CONFIRM=DEV_ONLY`

Run the seed only against hosted Supabase DEV or a disposable migrated database,
never production. The fixture uses fake `@example.test` data and does not create
a production dummy-data UI.

## Scope-Control Notes

- Track the bus, not the child.
- No Alberta Student Number, `asn`, or `alberta_student_number` fields are part
  of the approved data model.
- QR codes, student badges, pickup/drop-off scan events, notifications, SMS,
  maps APIs, CSV import, and external SIS integrations remain future scope
  unless a future milestone explicitly approves them.
- Future-scope Edge Function/API scaffolds for QR scan, badge generation, and
  notification dispatch have been removed from current `main`.

## Privacy Reminder

- No student home address is collected or stored.
- No student health data is collected or stored.
- Guardians can only see their linked students.
- Drivers should only see their own or assigned transportation data.
- No service role keys in frontend code.
- No public RLS policies.
