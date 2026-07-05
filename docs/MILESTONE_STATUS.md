# SafeBus Alberta — Milestone Status

> Source of truth for milestone progress. Update after each milestone is merged.
> "assumed from project handoff, verify in repo" marks items inferred from the
> repo state rather than a confirmed roadmap entry.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS
- React Router
- Supabase (Auth + Postgres + RLS)
- pnpm 11 workspaces + Turborepo
- Playwright (smoke tests)
- Hosted Supabase DEV for smoke testing (migrations applied manually via SQL Editor)

## Completed Milestones

| Milestone | Summary | Migration(s) | Status |
|---|---|---|---|
| 2A/2B — Auth & Profile Foundation | `tenants`, `schools`, `profiles`, user roles, RLS helper functions | `0001_auth_profile_foundation.sql`, `0002_foundation_read_grants.sql` | ✅ (assumed from project handoff, verify in repo) |
| 3B — Students & Guardians Foundation | `students`, `guardians`, `student_guardians`, guardian-scoped read RLS | `0003_students_guardians_foundation.sql` | ✅ (assumed from project handoff, verify in repo) |
| 3C — Transportation Structure Foundation | `buses`, `drivers`, `routes`, `route_stops`, `student_route_assignments`, read RLS | `0004_transportation_structure_foundation.sql` | ✅ (assumed from project handoff, verify in repo) |
| 3D — Transportation Admin Write Foundation | Admin insert/update policies for transportation tables; write helper functions | `0005_transportation_admin_write_foundation.sql` | ✅ (assumed from project handoff, verify in repo) |
| 4A — Driver Trip Operations Foundation | `driver_trips` table, trip start/end, driver dashboard UI, Playwright smoke tests | `0006_driver_trips_foundation.sql` | ✅ This milestone |

## Current Milestone

### Milestone 4A — Driver Trip Operations Foundation

**Goal:** Establish the driver-side trip/session model so a driver can start and end a trip. Live GPS, maps, parent tracking, QR, and notifications are explicitly out of scope and reserved for later milestones.

**What was delivered:**

- Database: `public.driver_trips` table with tenant/driver/bus/route foreign keys, `trip_type` (morning/evening), `status` (active/completed/cancelled), `service_date`, `started_at`, `ended_at`. Partial unique indexes enforce at most one active trip per driver and per bus. Check constraints keep `ended_at` consistent with `status`.
- New helpers: `current_driver_id()`, `driver_trip_entities_in_tenant()`, and the `end_driver_trip(uuid)` RPC.
- Ending a trip is locked down: there is **no UPDATE policy** and **no UPDATE grant** on `driver_trips`. The only path that mutates a trip is the `end_driver_trip(p_trip_id)` security-definer RPC, which sets ONLY `status='completed'` and `ended_at=now()`. A driver cannot mutate `tenant_id`, `driver_id`, `bus_id`, `route_id`, `trip_type`, `service_date`, `started_at`, or `created_at`. The RPC enforces caller role, tenant, ownership, and active status server-side.
- RLS: tenant isolation; drivers read/create only their own trips; admins read tenant trips. Driver read policies added (additively) on `buses` and `routes` so a driver can select a bus and route.
- Service layer: `driverTripService.ts` — `fetchDriverTripContext`, `fetchActiveDriverTrip`, `startDriverTrip`, `endDriverTrip` (calls the RPC). `tenant_id`/`driver_id` are derived server-side, never trusted from the client.
- UI: `DriverDashboardPage` uses live Supabase data. Labels accurately say "available in your organization" (not "assigned") because no driver-bus/route assignment table exists yet. Shows driver profile, bus/route selectors, trip-type radio group, start/end actions, active-trip card, loading/empty/error states, accessible labels. Success messages persist across the silent data refresh that follows start/end.
- Route protection: `/driver` remains behind `ProtectedRoute allowedRoles={['driver']}` (unchanged).
- Playwright smoke tests under `tests/smoke/`:
  - Unauthenticated: protected-route behavior, landing page rendering, mobile viewport layout.
  - Authenticated (via a mocked Supabase layer in `tests/smoke/fixtures/supabase-mock.ts` — no production credentials, no test backdoors, all Supabase traffic intercepted by `page.route`): driver dashboard rendering, bus/route controls, morning/evening selector, start trip, active trip display, end trip, refresh persistence, mobile layout.

**Validation results (after review fixes):**

- `pnpm install` — pass
- `pnpm lint` — pass
- `pnpm typecheck` — pass (4 packages)
- `pnpm build` — pass (`@safebus/web`, 116 modules)
- `pnpm test` — pass (vitest, no unit test files yet)
- `pnpm test:smoke` — pass (22 tests: 11 desktop-chromium + 11 mobile-chromium; 6 authenticated + 5 unauthenticated per project)

**Known limitations:**

- No driver↔bus/route assignment table exists yet; the driver selects a bus and route from their organization's active set. The UI is labeled "available in your organization" to reflect this. A formal driver-assignment model is a candidate for a future milestone.
- `cancelled` status is supported by the schema and the RPC could be extended to allow it, but no UI action cancels a trip in this milestone (only start and end/completed).
- The authenticated Playwright tests use a mocked Supabase layer (deterministic in-memory responses). They do not exercise real Postgres RLS; the RLS/RPC guarantees are verified by the manual smoke-test checklist against hosted Supabase DEV.

## Next Recommended Milestone

> Placeholder — the next milestone is chosen by the project manager from the
> SafeBus master roadmap, not by the implementer.

Candidates consistent with the roadmap (decision deferred to PM):

- Driver↔bus/route assignment model (so a driver sees a pre-assigned bus/route instead of selecting from the tenant list).
- Live GPS pings attached to `driver_trips` (Phase 5).
- Parent live bus visibility during an active trip (Phase 6).
- QR scan / pickup-dropoff confirmation attached to a trip (Phase 7).
- Admin trips monitoring page (read-only view of active `driver_trips` per tenant).

## Privacy Reminder

- No Alberta Student Number (ASN) collected or stored.
- No student home address collected or stored.
- No student health data collected or stored.
- Guardians see only their linked students (enforced in migration 0003).
- Drivers see only their own trips (enforced in migration 0006).
- No service role keys in frontend code.
- No public RLS policies.
