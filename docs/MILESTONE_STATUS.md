## Milestone 9A — Guardian Pickup/Drop-off Notification Outbox Foundation

- Added a backend-only, tenant-scoped guardian notification outbox foundation for future pickup/drop-off notifications.
- Driver pickup/drop-off RPCs now enqueue pending outbox rows only after valid events and only for active linked same-tenant guardians.
- No SMS, email, push, realtime delivery, provider integration, worker, guardian notification UI, or admin notification UI exists.
- Added RLS regression coverage for outbox creation, deduplication, rejected event attempts, tenant/guardian scoping, and blocked direct browser-style outbox access.

# SafeBus Alberta - Milestone Status

> Source of truth for repository milestone progress. Update this file whenever
> a milestone or QA hardening pass lands on `main`.

## Current Checkout State

- Current working branch: `phase-3-alberta-privacy-legal-readiness`.
- Phase 15A was merged through PR #52 and is on `main`.
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

## Phase 0 — Product and Governance Baseline

Status: Drafted on `phase-0-product-and-governance-baseline` for product-owner sign-off. Governance-only: no code, no migration, no RLS, no RPC, no dependency, and no environment change.

Phase 0 freezes the product boundary and establishes how every future milestone is approved. It is grounded in the actual repo state, including the migration identifier collisions (`0042`, `0043`, `0058`) and the scope-drift findings (student QR badges, bus QR sessions, Safe ETA, notifications).

Added `docs/governance/`:

- `README.md` — index and precedence rule.
- `product-scope.md` — transportation platform, not an SIS; "track the bus, not the child"; prohibited data; platform-isolation rule.
- `data-classification.md` — Restricted/Confidential/Internal/Public tiers mapped to real tables.
- `feature-inventory.md` — current vs. future functionality; scope-drift reconciliation table (D1–D7).
- `first-customer-profile.md` — first customer is an Alberta public school authority.
- `capacity-assumptions.md` — precise "500,000 users" definition; 20,000-bus worst case; Phase 12 staging ceilings.
- `role-responsibility-matrix.md` — product and delivery roles; data and system owners; separation of duties.
- `risk-register.md` — R-001 through R-015, including migration collisions and scope drift.
- `decision-log.md` — DL-001 through DL-007, including the no-rename migration rule.
- `development-workflow.md` — feature branches only; one milestone at a time; GLM builds, Codex reviews, human merges.

Exit gate: all six Phase 0 deliverables are drafted and await product-owner sign-off; "no future milestones mixed into current work" is reconciled through `feature-inventory.md` D1–D7.

## Phase 1 — Critical Database and Authorization Repair

Status: Implemented on `phase-1-database-authorization-repair` for review. Applies to hosted Supabase DEV after manual SQL Editor application of `0065_phase1_authorization_reconciliation.sql`. Not merged and not accepted.

Phase 1 eliminates confirmed privacy-leak risks and establishes a trustworthy database foundation. It is grounded in the migration collision and scope-drift findings recorded in Phase 0.

### Migration integrity

- Created the authoritative migration ledger at `docs/migration-ledger.md`, reconciling the duplicate `0042`, `0043`, and `0058` identifiers.
- Archived the losing duplicates to `supabase/legacy/` with `_archived` suffixes and a `README.md`:
  - `0042_fix_guardian_live_bus_location_uuid_aggregate.sql` → archived (RPC redefined by `0053`/`0054`, revoked by `0061`).
  - `0043_secure_student_qr_boarding_foundation.sql` → archived (scope-drift D1 student badges).
- `0058` pair kept as canonical (independent non-conflicting objects).
- Added corrective migration `0065_phase1_authorization_reconciliation.sql` with a collision-assertion block so drift is detectable on any environment.
- Per `decision-log.md` DL-005, no applied migration was renamed in-place.

### Platform isolation

- `0065` drops the platform-admin SELECT policy on `profiles` and `route_shapes` and any remaining platform-admin read policies on operational tables.
- Platform admins retain only: `tenants` lifecycle read, `get_platform_tenant_onboarding_summary()` control-plane RPC.
- Verified by `tests/rls/phase1-platform-isolation-rls.sql`.

### Driver authorization tightening

- `0065` drops the over-broad `buses select driver tenant active` and `routes select driver tenant active` policies that let any active driver read ALL active tenant buses/routes.
- Replaced with assignment-derived `buses select assigned driver` and `routes select assigned driver` that require an active `driver_route_assignment` or active `driver_trip`.
- Assignment-derived access expires automatically when the assignment ends (status/effective-window gate).
- Verified by `tests/rls/phase1-driver-authorization-rls.sql`.

### Obsolete location-ingestion quarantine

- `0065` retires `update_driver_trip_location()` into an always-raising stub; the authoritative path is the session-bound `update_bus_tracking_location()` from migration `0059`.

### RLS test coverage

- `tests/rls/phase1-platform-isolation-rls.sql`: retired-policy absence, zero-row enforcement on protected tables, retained tenant/summary access.
- `tests/rls/phase1-driver-authorization-rls.sql`: retired over-broad policy absence, new assignment-derived policies present, assigned-driver sees only assigned bus/route, unassigned driver sees zero, retired RPC raises.
- Registered both in `pnpm test:rls` structural check.

### Exit gate (pending hosted-DEV execution)

- No critical/high authorization findings: code-complete pending hosted-DEV RLS execution.
- Clean database rebuild: documented in `docs/migration-ledger.md` §4.
- All RLS tests execute against approved non-production DB: run `pnpm test:rls:dev -- tests/rls/phase1-platform-isolation-rls.sql tests/rls/phase1-driver-authorization-rls.sql` after applying `0065`.
- Hosted DEV matches canonical schema: `0065` assertion block enforces this.
- Independent security review of tenant boundary: pending.

## Phase 2 — Authentication and Administrative Security

Status: Repository implementation complete for review on the current feature branch. Applies to hosted Supabase DEV after manual SQL Editor application of migrations `0066` through `0068`. Not merged or accepted; hosted-DEV and operational exit gates remain.

Phase 2 protects high-value accounts and makes security-relevant actions traceable. It delivers the append-only audit system, MFA enforcement helpers, recent-authentication gates, the invitation redirect allowlist, and the rate-limit foundation.

### Append-only audit system (`0066`)

- `audit_events` table with who/what/when/tenant/target/outcome; no secrets, message bodies, or health data.
- Write path is a SECURITY DEFINER RPC `write_audit_event()` that derives actor identity from `auth.uid()`. No INSERT policy on the table itself means direct REST/database INSERT is blocked.
- No UPDATE or DELETE policy exists, ever — the table is append-only for all callers.
- Detail JSONB is sanitized: secret-like keys (`password`, `secret`, `api_key`, `service_role`, `token`, `authorization`) are stripped by the RPC and blocked by a CHECK constraint.
- SELECT: tenant-scoped for tenant/school/transportation admins (own audit); platform super admin reads all (security investigation). Drivers and guardians see nothing.
- Action enum covers: auth events, invitations, role changes, guardian/student links, driver assignments, student record access, data exports, tenant suspension/revocation, security config changes, rate-limit denials.

### MFA enforcement (`0067`)

- `has_verified_mfa()` requires the server-signed AAL2 claim proving the current session completed MFA; enrollment state is managed by Supabase Auth.
- `requires_mfa_for_admin_action()` identifies admin roles subject to MFA (platform_super_admin, tenant_admin, school_admin, transportation_admin).
- `enforce_mfa_if_required()` gate raises if MFA is required and absent. Sensitive RPCs call this before proceeding.

### Recent-authentication gate (`0067`)

- `has_recent_authentication()` checks `auth.users.last_sign_in_at` against a 15-minute window.
- `enforce_recent_auth_for_sensitive_action()` gate raises if the caller has not authenticated recently. Gates: role changes, tenant suspension, data exports, account revocation, guardian access assignment.

### Invitation redirect allowlist (`0067`)

- `allowed_redirect_origins` table stores platform defaults (tenant_id NULL) and tenant-specific origins.
- `is_allowed_redirect_origin()` validates a redirect target against the allowlist. Arbitrary origins are rejected. Stops open-redirect abuse of invitation/password-reset links.
- RLS: platform and tenant admins can manage/read; all others denied.

### Rate-limit foundation (`0067`)

- `rate_limit_buckets` per-actor, per-action, time-windowed counter.
- `check_rate_limit()` returns true/false and records rate-limit denials in the audit trail.
- Covers: login, invitation, password_reset, onboarding, audit_write. Supabase Auth/Netlify edge rate-limiting can supplement this database-level foundation.

### Password rules + compromised-password protection (`0068`)

- `password_policy` singleton table (min 12 chars, uppercase, lowercase, digit, special, max repeating char).
- `validate_password_policy()` server-side gate for password changes.
- `compromised_password_hashes` denylist table (SHA-256 of breached passwords; populated operationally from a breached-password list).
- `is_compromised_password()` checks a candidate password against the denylist.

### Session management + admin revocation (`0068`)

- `user_sessions` table tracks active sessions per user (device label, IP, user agent, timestamps).
- RLS: users read their own session mirror; tenant/platform admins read within investigative scope. Revocation is RPC-only and deletes real `auth.sessions` refresh sessions.
- `revoke_all_user_sessions()` — admin-only, requires recent authentication, enforces tenant scope, records an audit event, and revokes all active sessions for a target user.

### Invitation idempotency (`0068`)

- `check_invitation_idempotency()` returns whether an invitation or profile already exists for a given tenant/email/role, so retries collapse instead of creating duplicate users. Complements the existing atomic invitation RPCs (0049/0050).

### RLS test coverage

- `tests/rls/phase2-auth-security-rls.sql`: 10 tests covering append-only verification, RPC write/read, direct INSERT blocked, secret sanitization, driver/guardian denied, allowlist acceptance/rejection, rate-limit cap enforcement, password policy validation, session revocation, and invitation idempotency. Registered in `pnpm test:rls` (38 files).

### Exit gate (pending hosted-DEV execution)

- MFA technically enforced: code-complete (helpers ready for gated RPCs; Supabase Auth MFA enrollment is an operational step).
- Account recovery tested: pending (operational test).
- Rate-limit and abuse tests pass: RLS regression ready for hosted-DEV execution.
- Sensitive tenant/profile/link/assignment/invitation/security-config mutations are covered by database triggers; supported server account/invitation actions use the service-only audit writer; student detail access uses a scoped audit RPC.
- Security admins can investigate without impersonating: audit SELECT + platform summary RPC provide read-only investigation.

## Phase 3 — Alberta Privacy and Legal Readiness

Status: Engineering and draft governance artifacts are complete for review.
The phase is **not accepted** until counsel, customer, vendor, hosted-DEV, and
tabletop gates in `docs/governance/phase-3/README.md` are completed.

- Draft statutory/legal-role analysis uses the current POPA/ATIA/PIPA framing
  and authoritative Alberta/OIPC starting sources; legal conclusions remain
  counsel-owned.
- PIA, data inventory/flow, access/correction, student/guardian authority,
  breach, privacy program, subprocessor, contract, and guardian/driver notice
  artifacts are present under `docs/governance/phase-3/`.
- Migration `0069` materializes 12 draft retention policies, protected
  deletion/anonymization functions, dependency ordering, run evidence, and
  success/failure audit events.
- A daily Netlify scheduled function defaults to dry-run. Destructive execution
  requires the server-only `SAFEBUS_RETENTION_EXECUTE=true` flag after approval.
- `tests/rls/phase3-retention-rls.sql` covers browser write-policy absence,
  driver denial, AAL1 denial, and transactional service dry-run/deletion.

Pending exit gates: product-owner Phase 0 sign-off; migrations `0065`–`0074`
applied to hosted DEV; clean rebuild and RLS evidence; independent security
review; real MFA/recovery abuse testing; counsel-approved PIA/contracts/notices
and retention periods; verified Canadian vendor/backup terms; breach tabletop.

## Completed Milestones

| Milestone                                                            | Evidence in repo                                                                                                                                                                                                                                                                   | Status                                            |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 2A/2B - Auth & Profile Foundation                                    | `0001_auth_profile_foundation.sql`, `0002_foundation_read_grants.sql`                                                                                                                                                                                                              | Completed                                         |
| 3B - Students & Guardians Foundation                                 | `0003_students_guardians_foundation.sql`                                                                                                                                                                                                                                           | Completed                                         |
| 3C - Transportation Structure Foundation                             | `0004_transportation_structure_foundation.sql`                                                                                                                                                                                                                                     | Completed                                         |
| 3D - Transportation Admin Write Foundation                           | `0005_transportation_admin_write_foundation.sql`                                                                                                                                                                                                                                   | Completed                                         |
| 4A - Driver Trip Operations Foundation                               | `0006_driver_trips_foundation.sql`, driver trip service/UI smoke coverage                                                                                                                                                                                                          | Completed                                         |
| 4B/4C - Admin Live Trip Monitoring Foundation + Hardening            | `0007_driver_location_update_foundation.sql` through `0014_enforce_assignment_only_trip_start.sql`                                                                                                                                                                                 | Completed                                         |
| 5A - Guardian Student & Route Visibility Foundation                  | `0015_guardian_student_route_visibility_foundation.sql`, guardian route page/service/smoke coverage                                                                                                                                                                                | Completed                                         |
| 5A.1 - Tenant Admin Student Roster Foundation                        | `0016_student_roster_admin_write_foundation.sql`, `0017_fix_student_roster_school_scope.sql`, `0018_fix_students_rls_update_recursion.sql`                                                                                                                                         | Completed                                         |
| 5A.2 - Supabase RLS Regression Test Foundation                       | `tests/rls/student-roster-rls.sql`, `tests/rls/guardian-visibility-rls.sql`, `tests/rls/README.md`                                                                                                                                                                                 | Completed                                         |
| 5B - Tenant Admin Guardian Management & Linking UX Hardening         | `0019_secure_guardian_student_linking_rpc.sql`, `tests/rls/guardian-linking-rls.sql`                                                                                                                                                                                               | Completed                                         |
| 6A - Guardian Live Trip Visibility Security Foundation               | `0020_guardian_live_trip_visibility_foundation.sql`, `0021_harden_guardian_live_trip_visibility_rpc.sql`, `tests/rls/guardian-live-trip-visibility-rls.sql`                                                                                                                        | Completed, reviewed, and fixed                    |
| QA-1 - Automated Supabase RLS Test Runner                            | `scripts/run-rls-tests.mjs`, `pnpm test:rls:dev`, path-safety fix in latest `main`                                                                                                                                                                                                 | Completed and review blocker fixed                |
| 7A/7B QA - Driver Event Manual Fixture                               | `docs/qa/driver-event-flow-manual-test.md`, `scripts/seed-driver-event-qa-fixture.mjs`, `pnpm qa:seed:driver-events`                                                                                                                                                               | DEV-only QA helper                                |
| 8A - Guardian Student Trip Event Visibility Security Foundation      | `0024_guardian_student_trip_event_visibility.sql`, `tests/rls/guardian-student-trip-event-visibility-rls.sql`                                                                                                                                                                      | In progress                                       |
| 11A - Guardian Live Bus Map Security Foundation                      | `0027_guardian_live_bus_location_security_foundation.sql`, `tests/rls/guardian-live-bus-location-rls.sql`                                                                                                                                                                          | Completed                                         |
| 11B/11C/11D - Guardian Live Bus Map Experience                       | `apps/web/src/pages/GuardianLiveMapPage.tsx`, `GuardianLiveBusMap.tsx`, `useGuardianLiveBusLocations.ts`, `tests/smoke/guardian-live-bus-map.spec.ts`                                                                                                                              | Completed                                         |
| Phase 12 - Simple Admin Setup and Manual Workflow                    | Task-oriented admin navigation, readiness-based Overview/Setup, Operations and Trips pages, manual acceptance guide                                                                                                                                                                | Ready for manual acceptance                       |
| Phase 15A - Guardian Event Email Notification Delivery Foundation    | `0038_guardian_email_notification_delivery_foundation.sql`, `apps/web/netlify/functions/guardian-notification-email.mjs`, `docs/qa/phase-15a-guardian-email-notification-delivery-acceptance.md`                                                                                   | Merged via PR #52                                 |
| Phase 15B - Notification Delivery Validation & Operational Hardening | `0039_notification_delivery_hardening_tenant_timezone_summary.sql`, `apps/web/netlify/functions/guardian-notification-email-scheduled.mjs`, `apps/web/src/components/admin/NotificationDeliverySummaryCard.tsx`, `docs/qa/phase-15b-notification-delivery-hardening-acceptance.md` | Implemented for review; manual acceptance pending |

## Current Milestone

Phase 0–3 remediation is implemented on `phase-3-alberta-privacy-legal-readiness` for review. Repository validation and review are required before a draft PR; hosted-DEV migration/RLS execution and all human/legal gates remain pending. Do not merge without human approval.

## Tenant Admin Student CSV Import

Status: Implemented for review; hosted-DEV migration and manual acceptance pending.

- Adds a tenant-admin-only, student-only CSV import workflow to the Students page.
- Accepts up to 5,000 UTF-8 rows using the strict template fields `first_name`,
  `last_name`, `preferred_name`, `grade`, and `school_name`.
- Performs local CSV parsing plus server-authoritative tenant, role, active-school,
  field, limit, and duplicate-warning validation.
- Uses one `security invoker` RPC for read-only preview and atomic create-only
  commit. Invalid files create no student rows.
- Does not retain uploaded files or import history and does not import guardians,
  transportation, student identifiers, addresses, or health data.
- Acceptance guide: `docs/qa/tenant-admin-student-csv-import-acceptance.md`.

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
8. `tests/rls/guardian-notification-outbox-rls.sql`
9. `tests/rls/admin-live-fleet-map-rls.sql`
10. `tests/rls/guardian-live-bus-location-rls.sql`

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
- Student QR badges and pickup/drop-off scans are quarantined. Previously
  approved bus-session QR and guardian email MVP milestones remain current;
  SMS, push, broader notifications, production map providers, and external SIS
  integrations remain future scope.
- CSV import is limited to the approved tenant-admin student-only workflow; it
  does not import guardian, transportation, or external SIS data.
- Future-scope Edge Function/API scaffolds for QR scan, badge generation, and
  notification dispatch have been removed from current `main`.

## Privacy Reminder

- No student home address is collected or stored.
- No student health data is collected or stored.
- Guardians can only see their linked students.
- Drivers should only see their own or assigned transportation data.
- No service role keys in frontend code.
- No public RLS policies.

## Milestone 10A — Admin Live Fleet Map & Speed Monitoring

Status: Implemented on `milestone-10a-admin-live-fleet-map-speed` for review.

- Enhanced `/admin/live-trips` into an admin-only live fleet monitoring page with summary counts, a lightweight coordinate map panel, manual refresh, and an operational fleet table.
- Added `get_admin_live_fleet_monitoring()` as a narrow authenticated admin RPC that returns tenant-scoped active fleet display fields, current coordinates, speed when available, and server-derived live/stale/missing GPS status without exposing student, guardian, contact, tenant ID, or raw internal ID fields.
- Added smoke coverage for unauthenticated/guardian/driver blocking, admin access, map markers, missing/stale GPS, speed display/unavailable state, and sensitive value suppression.
- Added an RLS structural check for the new admin live fleet RPC grants and return shape.

Not included in this milestone: guardian map, ETA, notifications, QR, realtime subscriptions, driver workflow changes, speed enforcement, or production SQL execution.

## Milestone 10B — Admin Live Fleet Map Hardening & Map Provider Foundation

Status: Implemented on `milestone-10b-admin-live-fleet-map-hardening` for review.

- Replaced the Milestone 10A coordinate-only admin fleet map presentation with a provider-neutral Leaflet/react-leaflet foundation that reads public browser map tile configuration from `VITE_MAP_TILE_URL` and `VITE_MAP_TILE_ATTRIBUTION`.
- These map values are public frontend deployment configuration, not secrets. `VITE_MAP_TILE_URL` must be an XYZ-compatible Leaflet tile URL template such as `https://tiles.example.com/{z}/{x}/{y}.png`; `VITE_MAP_TILE_ATTRIBUTION` must satisfy the selected data and tile provider's attribution requirements.
- No production map provider is selected by this milestone. Netlify deployments must receive the tile URL and attribution through Netlify environment configuration when an approved provider is chosen.
- The app intentionally keeps summary cards, refresh controls, and the active fleet table functional when tile configuration is missing, partial, or when tiles fail to load.
- Public OpenStreetMap standard tile servers are not assumed or documented as a production-scale commercial tile backend. OpenStreetMap data and the public OpenStreetMap tile service are separate concerns.
- Before pilot production traffic, SafeBus must select a suitable commercial provider, hosted provider, or self-hosted tile solution and review provider terms, attribution, rate limits, availability, privacy, and commercial-use requirements.

Example local or deployment values using a placeholder provider:

```env
VITE_MAP_TILE_URL=https://tiles.example.com/{z}/{x}/{y}.png
VITE_MAP_TILE_ATTRIBUTION=Map data and tiles provided under the selected provider terms
```

## Milestone 11A - Guardian Live Bus Map Security Foundation

Status: Implemented on `milestone-11a-guardian-live-bus-map-security-foundation` for review.

- Added `get_guardian_student_live_bus_location_state()` as a narrow guardian RPC. It accepts no arguments and derives caller identity exclusively from `auth.uid()` through the existing profile, tenant, role, and active guardian helpers.
- The RPC enforces active guardian role, active guardian identity, active student, active guardian-student link, tenant isolation, applicable active route assignment, active trip, same-tenant active bus/driver, and matching current-location trip/tenant/route/bus/driver relationships before returning any location state.
- The result is one row per eligible linked student and includes only `student_id`, `location_state`, `latitude`, `longitude`, `location_recorded_at`, and `location_age_seconds`.
- `location_state` is controlled to `fresh`, `stale`, `missing`, or `invalid`. Freshness mirrors the accepted admin fleet threshold of 2 minutes.
- `fresh` exposes valid coordinates. `stale` withholds coordinates while allowing timestamp/age. `missing` and `invalid` expose no displayable coordinates, and unsafe future timestamps cannot produce negative age.
- Ambiguous multiple active trips for one student fail closed as a single `invalid` row instead of arbitrarily selecting a bus.
- Direct guardian reads from live-location tables remain denied; no broad guardian RLS policy or table-level location grant was added.
- Added a dedicated self-contained SQL regression file and registered it with the structural RLS check and guarded QA-1 runner order.
- No guardian map UI, Leaflet guardian component, ETA, realtime subscription, polling change, notification delivery, history, trip replay, address/stop exposure, manifest exposure, pickup/drop-off exposure, driver change, admin map change, or speed visibility was added.

## Phase 11 — Guardian Live Bus Map Experience (Milestones 11B/11C/11D)

Status: Completed on `phase-11-guardian-live-bus-map-experience`.

### Milestone 11B — Guardian Live Bus Map UI Foundation

- Added the first guardian-facing map experience at `/guardian/live-map`, integrated into the existing guardian navigation alongside the existing text-only Bus Status, Pickup & Drop-off, and Students & Routes pages.
- The page calls only the secured Milestone 11A RPC `get_guardian_student_live_bus_location_state()` through `apps/web/src/services/guardianLiveBusLocationService.ts`. It does not query any live-location table directly, does not query tenant-wide fleet data, and does not subscribe to realtime changes.
- Student names are joined client-side by the already-authorized `student_id` from `get_guardian_student_route_visibility()`. No additional student, guardian, driver, route, trip, bus, or stop data is exposed.
- A reusable `GuardianLiveBusMap` component renders a live bus marker ONLY when `location_state === "fresh"` and valid coordinates are present. Stale, missing, invalid, loading, and error states produce no marker. Siblings sharing the same coordinates render one grouped marker with a popup listing the linked students it applies to.
- Non-technical guardian-facing labels are used throughout: current location available, location update is delayed, location has not been received, location is temporarily unavailable, and no active bus trip is currently available. Technical database terms (`fresh`, `stale`, `missing`, `invalid`) are never shown to guardians.
- Tile configuration reuses the accepted provider-neutral `VITE_MAP_TILE_URL` and `VITE_MAP_TILE_ATTRIBUTION`. When tile configuration is absent, the map degrades to a controlled map-unavailable message while student and trip-status information remains usable. No provider is hard-coded and raw environment variable names are not exposed in the UI.
- Full state coverage: loading, empty, RPC failure, permission-denied/role denial, stale, missing, invalid, tile-configuration fallback, keyboard-accessible nav, screen-reader status text, and responsive desktop/mobile layout.

### Milestone 11C — Safe Guardian Location Refresh and Resilience

- Added safe periodic refresh through the `useGuardianLiveBusLocations` hook.
- Refresh interval is 15 seconds, appropriate for a school-bus guardian map and well below the 2-minute freshness threshold enforced by the secured RPC. No user-configurable high-frequency refresh setting exists.
- Overlapping in-flight calls are prevented via a `fetchingRef` guard. Timers are cleaned up on unmount. Auto-refresh pauses while the document is hidden and refreshes promptly when the page becomes visible again.
- Race conditions are prevented with a monotonically increasing request token: older responses can never replace newer results.
- Fail-safe behavior: the server-provided state is authoritative. A previously fresh coordinate cannot remain on the map looking live when the latest secured response becomes stale, missing, invalid, unauthorized, or unavailable. A refresh-error banner explains the state without presenting cached coordinates as a current live position.

### Milestone 11D — Guardian Map QA and Release Hardening

- Strengthened Playwright coverage across desktop and mobile, including: one student fresh, multiple students, siblings sharing coordinates, mixed fresh/stale/missing/invalid states, no active trip, no eligible students, RPC failure, role denial, tile-configuration missing, refresh transitions (fresh-to-stale/missing/invalid/error), marker removal after safe-state changes, no direct location-table browser request, existing guardian route and event status UI remains usable, and no horizontal overflow on mobile.
- Accessibility and responsive review: visible focus handling via existing design conventions, screen-reader-friendly status text, no reliance on marker color alone, readable empty/error states, and controlled map container sizing.
- Security review confirmed: all location reads use the Milestone 11A RPC; no direct live-location table access; no guardian-controlled identifier used as authorization scope; no tenant-wide location read; no stale/invalid coordinates rendered; no speed, driver identity, stop, address, history, or route geometry exposed; no sensitive values logged; raw RPC errors are not leaked to guardians.

### Out of scope

This phase still does NOT provide: ETA, route lines, traffic, realtime subscriptions, location history, trip replay, geofencing, route-deviation alerts, actual notification delivery, or QR workflows.

## Phase 12 — Simple Tenant Admin Setup and Complete Manual Workflow

Status: Ready for product-owner manual acceptance on `phase-12-simple-admin-setup-and-manual-workflow`.

- Replaced the fragmented admin sidebar with five task-oriented choices: Overview, Setup, Operations, People, and More. Existing focused CRUD pages remain available through contextual actions.
- Replaced the mock admin overview with tenant-scoped setup counts, missing-step guidance, and active-trip status.
- Added a reusable guided Setup page covering buses, drivers, routes with their ordered stops, students, guardians, guardian links, student route/stop assignments, and driver/bus assignments. Stops are part of route setup rather than a separate setup domain.
- Replaced the Trips placeholder with assignment readiness, active trips, and recently completed trips.
- Preserved the existing driver-created trip model: admins prepare assignments and monitor; drivers securely start and end their own trips.
- Hidden unfinished Imports, Alerts, and Reports placeholders from primary navigation. Schools, Users, and Settings are grouped under More.
- No schema, RLS, RPC, dependency, map, guardian visibility, or driver workflow changes were required.
- Auth account provisioning remains an external secure administration prerequisite. No service-role or Auth Admin capability was added to the browser.
- Manual acceptance instructions are in `docs/qa/phase-12-manual-acceptance.md`.

## Phase 14B - Safe ETA Validation and Reliability Hardening

Status: Implemented on feature branch; automated checks and hosted-DEV validation are required before manual acceptance. Not merged and not product-owner accepted yet.

- Secure real-time tracking remains implemented through server-side driver location RPCs, coordinate-free invalidations, secured refetch RPCs, and polling fallback.
- Safe ETA foundation remains implemented as conservative server-side helper/RPC logic. Phase 14B does not add road-network routing, traffic, notifications, QR, child-specific GPS, or a production-facing dummy-data UI.
- Phase 14B adds a DEV-only deterministic Safe ETA fixture, scenario helper, acceptance guide, and function-level hardening for future timestamps, invalid math gating, and Platform Super Admin operational ETA separation.
- Validation states are tracked separately: code implemented on branch, SQL/RLS scripts available for hosted DEV, deploy preview/manual product-owner acceptance pending.

## Phase 15A — Guardian Event Email Notification Delivery Foundation

Status: Merged through PR #52 and on `main`.

- Builds on Milestone 9A's backend-only `guardian_notification_outbox` instead of duplicating event-to-outbox enqueue logic.
- Adds server-side email delivery through a secured Netlify Function using Supabase service-role access and Resend transactional email API configuration.
- Adds atomic outbox claiming with `processing`, attempt count, claim leases, provider message references, normalized failure categories, bounded batches, retry scheduling, terminal failure, and cancellation for revoked eligibility.
- Revalidates active tenant, guardian, profile, student, active guardian-student link, notification flag, matching pickup/drop-off event, and recipient email immediately before sending.
- Reuses `student_guardians.can_receive_notifications` as the existing event-notification consent flag for this email MVP; no channel-specific preferences center was added.
- Uses the server-side guardian/profile email source only; recipient email and provider credentials are not exposed to browser code and are not copied into the outbox.
- Uses minimal first-name-only UTC email content and explicitly states that messages are recorded transportation events, not live child tracking.
- Safe DEV testing uses `SAFEBUS_DEV_EMAIL_RECIPIENT_OVERRIDE` in non-production Netlify contexts after original eligibility revalidation.
- Tenant-admin operational visibility remains SQL/trusted QA only for this phase; no notification dashboard or Platform Super Admin tenant notification access was added.
- Known limitations before acceptance: hosted-DEV SQL execution, Resend sandbox/provider test, Netlify deploy-preview status, and product-owner manual acceptance remain pending.

## Phase 15B — Notification Delivery Validation & Operational Hardening

Status: Implemented on `phase-15b-notification-delivery-hardening` for review; not merged and not accepted.

- Phase 15A inspection findings: lifecycle, claims, leases, batch limits, retry delays, maximum attempts, payload resolution, consent, recipient selection, idempotency, and dispatcher auth were confirmed correct. Gaps identified and addressed in this phase: no automated scheduler, raw UTC email timestamps (poor for an Alberta pilot), missing privacy-safe logging on several result paths, and no tenant-admin operational visibility.
- Added migration `0039_notification_delivery_hardening_tenant_timezone_summary.sql` (forward-only; does not modify `0038`): adds `tenants.timezone` (IANA, default `America/Edmonton`), replaces `resolve_guardian_notification_email_payload` with a compatible superset that returns `tenant_timezone`, and adds `get_tenant_notification_delivery_summary()` tenant-scoped summary RPC.
- Scheduler: added `apps/web/netlify/functions/guardian-notification-email-scheduled.mjs` with hourly `schedule` in `netlify.toml`. It reuses the shared `runDispatcher` logic, injects the dispatcher secret internally so it never leaves the server, requires no browser user, and remains safe under overlapping execution via `for update skip locked`.
- Privacy-safe diagnostics: every dispatcher result path now logs through an allowlist-based `safeLog()` helper. Logs contain only outbox correlation ID, attempt, notification type, result, category, and duration. No recipient emails, names, message bodies, API keys, or provider response bodies are logged.
- Tenant-admin operational visibility: the summary RPC and `NotificationDeliverySummaryCard` on `/admin/trips` show pending/processing/recent-delivered/recent-failed/cancelled counts, oldest pending age, and normalized failure categories for `tenant_admin`/`school_admin`/`transportation_admin` only. No personal information is returned. Platform Super Admin is deliberately denied.
- Time-zone decision: added `tenants.timezone` (IANA) with a safe Alberta default and tenant-admin configuration path. The dispatcher formats the authoritative server-recorded event timestamp in the tenant's configured IANA zone. Raw UTC is no longer presented to guardians.
- Idempotency: the dispatcher sends Resend's `Idempotency-Key` header keyed per outbox row. Because Resend does not publish a guaranteed idempotency-key lifetime, SafeBus describes this as "duplicate-resistant" rather than exact-once.
- Tests: expanded unit/dispatcher/scheduled-function tests, expanded RLS/privilege suite, added Playwright coverage for the summary card (admin access, guardian/driver/Platform Super Admin denial, privacy, mobile layout), added a notification QA fixture, and added a manual acceptance guide.
- Manual acceptance guide: `docs/qa/phase-15b-notification-delivery-hardening-acceptance.md`.
- Known limitations before acceptance: hosted-DEV migration application of `0038`/`0039`, Resend sandbox/provider test, Netlify deploy-preview status, and product-owner manual acceptance remain pending. The PR is not merged.

## Milestone 16B — Tenant Admin Application Shell and Operations Hub UI Refresh

Milestone 16B refreshes the tenant-admin interface as a UI-only operations hub. It adds a persistent desktop tenant-admin shell, grouped left navigation, compact top workspace header, accessible mobile navigation drawer, and a redesigned overview page using only existing dashboard data and actions.

This milestone preserves existing business logic and tenant isolation. It adds no Supabase migration, backend capability, database object, RLS policy, RPC, permission change, protected-route change, or new tenant-admin workflow. Future UI redesign milestones remain unmarked and unimplemented.

## Phase 4 — Secure Development and Deployment Platform

Status: Repository implementation complete for review on
`phase-4-secure-development-deployment`. Cloud provisioning and the operational
exit gates require authorized human completion before production approval.

- Added separate protected DEV, staging, and production release contracts and
  one-click staging, human-approved production, and application rollback
  workflows.
- Added immutable SHA-256 migration manifests, transactional deployment ledger,
  catalog-level schema fingerprinting, and pre-deploy/standalone drift checks.
- Added pinned authoritative Supabase TypeScript generation and release-time
  stale-type rejection.
- Expanded CI into independent typecheck, lint, build, unit, RLS execution,
  browser smoke, dependency audit, secret scan, CodeQL, and migration gates.
- Patched the React Router advisory line by migrating to `react-router` 8.3.0
  with its React 19-compatible mapping stack; the production dependency audit
  reports no known vulnerabilities.
- Added CSP, HSTS, frame denial, MIME-sniffing protection, Referrer Policy, and
  Permissions Policy; disabled public source maps and mobile WebView debugging;
  and replaced Google-hosted fonts with bundled Inter assets.
- Added production security approval and forward-only database/application
  rollback runbooks under `docs/governance/phase-4/`.

Pending operational evidence: provision three isolated Canadian-region cloud
environments, configure protected-environment reviewers and secrets, generate
and commit types from the reachable authoritative staging schema, run the first
staging release and quarterly rollback exercise, verify deployed headers, and
obtain human security/privacy approval. Never run RLS assertions in production.
