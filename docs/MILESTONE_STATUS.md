## Commercial Readiness Remediation 5 — Retire Legacy Edge Functions

Status: Merged through PR #149 and on `main`.

- Removed the obsolete `ingest-location` and `gps-stale-check` Supabase Edge
  Function handlers and their unused shared client, validation, and type surface.
- Recorded both retired function names as `enabled = false` in
  `supabase/config.toml`, so a broad function deployment skips them even if
  obsolete source is accidentally restored.
- Added a regression gate proving the handlers and invocation contract remain
  absent while web and Android tracking continue to use the approved secured
  Postgres RPC paths.
- Documented the retirement boundary and the review required before any future
  Supabase Edge Function can be introduced.
- No database, hosted Supabase project, production data, function deployment,
  or credentials were accessed or changed.

## Commercial Readiness Remediation 6 - Guardian Invitation and Link Reliability

Status: Merged through PR #150 and on `main`.

- Excludes inactive guardian records from the existing-guardian connection
  picker, matching the active-only contract already enforced by the secure
  guardian search and linking RPCs.
- Adds migration `0091_fix_sensitive_admin_audit_trigger_record_fields.sql` so
  the shared audit trigger only reads `profiles.role` after it has narrowed to
  the `profiles` table. This prevents guardian-link inserts from failing on a
  field that does not exist on `student_guardians`.
- Preserves tenant derivation, active-student/guardian checks, MFA/recent-auth
  enforcement, append-only audit evidence, and browser denial of the internal
  audit function.
- Adds repository regression coverage plus an isolated-database RLS assertion
  that a successful guardian link produces the expected audit event.
- The hosted `BusSafe` project remains the sole production database. No
  migration, fixture, RLS test, or other write was run against it.

## Commercial Readiness Remediation 7 - Production Health Monitoring Foundation

Status: Implemented through PR #152; Point 9 remains open pending operational
evidence.

- Adds a least-privileged GitHub Actions monitor that checks the public
  production application every 15 minutes and supports manual execution.
- Verifies the application shell, direct login routing, production security
  headers, and the server-managed Geoapify map configuration contract.
- Uses HTTPS-only origins, redirect rejection, bounded timeouts and retries,
  and privacy-safe output that excludes response bodies, provider URLs, keys,
  account identifiers, and personal information.
- Adds automated behavioral and structural regression gates plus Point 9
  incident, alert-routing, support, rollback, restore, and acceptance records.
- Point 9 remains open until named on-call routing, alert and incident drills,
  error-monitor redaction, quota alerts, recovery exercises, operating
  observation, and human approvals are complete.
- No Supabase connection, database query, migration, fixture, authenticated
  request, or hosted data change is included.

## Commercial Readiness Remediation 8 - Point 10 Product Verification

Status: Implemented through PR #153; Point 10 remains open pending hosted,
manual, capacity, and approval evidence.

- Adds one explicit, blocking product-verification command covering synthetic
  authenticated tenant-administrator, driver, and guardian CR1 journeys.
- Adds safe-degradation coverage for profile-service, guardian-data, map, and
  unauthenticated failure states and prevents raw profile-service errors from
  reaching users.
- Extends the existing automated WCAG gate with a bounded localhost-only load
  guard covering 60 release-shell requests at concurrency 10.
- Adds behavioral and structural regression controls plus Point 10 governance
  and acceptance records.
- Point 10 remains open until hosted authenticated evidence on an approved
  isolated target, manual assistive-technology acceptance, an approved
  production-like capacity exercise, and human approvals are complete.
- No production account, Supabase query, database write, migration, fixture,
  RLS execution, or hosted load test is included.

## Commercial Readiness Remediation 4 — Immutable GitHub Actions

Status: Merged through PR #148 and on `main`.

- Pinned every external action used by all eight GitHub Actions workflows to a
  verified, immutable 40-character upstream commit SHA.
- Retained the reviewed major-version comment beside every pin so the existing
  weekly Dependabot GitHub Actions updates can continue proposing upgrades.
- Added a repository-wide regression gate that discovers every workflow and
  rejects mutable external action references or pins without a version comment.
- Preserved all workflow names, job names, triggers, permissions, environments,
  commands, and required-check contexts.
- No database, hosted environment, production data, or credentials were
  accessed or changed.

## Commercial Readiness Remediation 3 — Automated Accessibility Gate

Status: Merged through PR #147 and on `main`.

- Added an axe-core WCAG 2.2 A/AA gate for representative public,
  tenant-admin, driver, and guardian surfaces across desktop and mobile
  Chromium.
- Covered the public landing and sign-in flows, tenant-admin overview and trip
  history, driver bus-scan and active-trip states, and guardian live bus status.
- Corrected low-contrast small text in the landing page and shared dashboard
  navigation, restored an accessible name for the mobile brand link, and added
  a global reduced-motion mode.
- Added `pnpm test:accessibility` for targeted verification. The complete CI
  browser job also executes these tests, so new automated A/AA violations fail
  the pull request.
- No database, hosted environment, production data, or credentials were
  accessed or changed.

Pending: keyboard-only review at 200% zoom and 320 CSS pixels, NVDA/Chrome and
VoiceOver/Safari testing, and human WCAG 2.2 AA conformance review. Automated
testing does not close the full Point 10 accessibility gate by itself.

## Commercial Readiness Remediation 2 — Full Smoke-Suite Reconciliation

Status: Merged through PR #146 and on `main`.

- Reconciled every Playwright smoke test with the approved Commercial Release
  1 bus-first scope and current secured RPC contracts.
- Restored missing tenant-admin notification delivery visibility and route
  active/inactive status on their existing operational surfaces.
- Replaced guardian tests for retired route/trip/event RPCs with coverage of
  the single `get_guardian_bus_visibility_v2()` boundary, including role
  blocking, privacy, refresh, failure, map, bus-status, and pickup/drop-off
  states.
- Removed obsolete manual driver-location and student-QR scanner expectations.
  Current coverage verifies bus-QR session start, automatic bus-location
  sharing, manual pickup/drop-off controls, and absence of quarantined student
  badge/scanner controls.
- Sanitized onboarding gateway failures so deployment commands, HTTP gateway
  details, and secret environment-variable names are not shown in the UI.
- CI now runs the complete desktop and mobile commercial smoke suite instead
  of only the small release subset. No database or hosted environment was
  accessed or changed.

## Commercial Readiness Remediation 1 — Notification Scheduler Reliability

Status: Merged through PR #142 and on `main`.

- Corrected the Netlify scheduled wrapper to accept the documented JSON
  `next_run` payload while injecting the dispatcher secret only from the
  server environment.
- Retained bodyless local/legacy invocation compatibility and the separate
  secret-protected manual dispatcher endpoint.
- Added regression coverage for the production-shaped scheduled payload and
  corrected the five-minute scheduler acceptance instructions.
- No database, RLS, notification eligibility, message content, provider,
  browser credential, or delivery-state change is included.

## Milestone 9A — Guardian Pickup/Drop-off Notification Outbox Foundation

- Added a backend-only, tenant-scoped guardian notification outbox foundation for future pickup/drop-off notifications.
- Driver pickup/drop-off RPCs now enqueue pending outbox rows only after valid events and only for active linked same-tenant guardians.
- No SMS, email, push, realtime delivery, provider integration, worker, guardian notification UI, or admin notification UI exists.
- Added RLS regression coverage for outbox creation, deduplication, rejected event attempts, tenant/guardian scoping, and blocked direct browser-style outbox access.

# SafeBus Alberta - Milestone Status

> Source of truth for repository milestone progress. Update this file whenever
> a milestone or QA hardening pass lands on `main`.

## Current Checkout State

- Commercial-readiness work proceeds one approved point at a time on dedicated
  feature branches.
- Commercial Release 1 scope was approved by the Platform Administrator on
  2026-08-12 through `DL-010`.
- The hosted database contract was approved by the Platform Administrator on
  2026-08-12 through `DL-011`.
- Fail-closed, attested releases were approved by the Platform Administrator on
  2026-08-12 through `DL-012`.
- The existing `BusSafe` Supabase project was approved as the sole database and
  production system of record by the Platform Administrator on 2026-08-15
  through the revised `DL-013`. No DEV/staging database is approved.
- Supabase Free was approved for active construction and labelled prelaunch/beta
  operation through `DL-014`; a paid tier or approved equivalent remains a gate
  before real school operations or commercial availability/recovery promises.
- The manual backup and one-time production adoption were deferred through
  `DL-015` to the final prelaunch sequence. Point 4 remains open, its workflow
  gates remain mandatory, and independent readiness work may continue.
- Point 5 authorization hardening was approved through `DL-016`. Its migration,
  exact RPC manifest, private helper schema, read-only database/API audit, and
  protected release gate are implemented for review. Point 5 remains open
  until isolated hosted RLS execution and independent boundary review pass.
- Point 8 provider selection was approved through `DL-018`. Geoapify rendering,
  provider locking, request minimization, attribution, and safe degraded map
  workflows are implemented. Point 8 remains open until paid-plan/SLA,
  restricted-key, vendor/privacy, quota-alert, web/Android acceptance, and
  seven-day observation evidence is approved.
- Phase 15A was merged through PR #52 and is on `main`.
- Hosted RLS execution and destructive QA are disabled because the only
  Supabase database is production.
- SQL migrations remain in `supabase/migrations`; a pending migration blocks
  release until an isolated test target is explicitly approved.

## Commercial Readiness Point 5 — Authorization Proof

Status: Repository implementation complete for review; production unchanged;
hosted execution and independent approval pending.

- Added the generated authorization-hardening migration, which keeps only the
  reviewed app/server RPC surface public and moves internal routines to the
  non-exposed `safebus_private` schema.
- Removed anonymous execution/data privileges, rebuilt authenticated table
  grants from matching RLS commands, hardened default privileges and search
  paths, and auto-enables RLS on future public tables.
- Added the exact version-controlled authorization surface, read-only catalog
  and Data API audit, manual protected audit workflow, release-preflight gate,
  and structural regression coverage.
- Baseline evidence and the final isolated-branch exit procedure are recorded
  in `docs/governance/point-5-authorization-evidence.md`.

Pending: final prelaunch backup/adoption, cost-approved temporary Supabase
branch, migration execution, all hosted RLS suites, Security Advisor review,
independent tenant/privacy-boundary sign-off, production application, generated
type refresh, and deletion of the temporary branch. No destructive test may
run against production.

## Commercial Readiness Point 8 — Interactive Maps

Status: Engineering controls complete; deployed rendering confirmed; operating
evidence and final approval pending.

- Geoapify is selected for Commercial Release 1 through `DL-018`, with the free
  quota limited to construction and controlled evaluation.
- Web and Android obtain a provider-locked tile template and required
  attribution from a server-managed Netlify Function. No map key or new map
  variable is embedded in frontend environment configuration.
- All four map surfaces use minimized referrers and abandon a partial map after
  tile failure while preserving authoritative status/list/direct-coordinate
  workflows.
- Browser smoke tests simulate provider HTTP 503 across guardian, fleet, route,
  and route-editor experiences; a structural release test prevents regression.
- Exit evidence and the manual production/Android acceptance procedure are in
  `docs/governance/point-8-map-readiness.md` and
  `docs/qa/point-8-map-readiness-acceptance.md`.

Pending: paid Geoapify SLA plan, restricted-key evidence, Point 6 vendor/privacy
approval, Point 9 quota alerts, production web and personal-Android acceptance,
seven-day operating observation, and Platform Administrator sign-off.

## Stack

- React 18 + TypeScript + Vite
- Tailwind CSS
- React Router
- Supabase Auth + Postgres + RLS
- pnpm workspaces + Turborepo
- Playwright smoke tests
- Netlify deployment target

## Phase 0 — Product and Governance Baseline

Status: The CR1 product boundary, feature inventory, and first-customer profile
were approved and locked by the Platform Administrator on 2026-08-12 through
`DL-010`. Capacity, role-responsibility, data-classification, legal, privacy,
security, and operational approvals remain separate gates.

Phase 0 freezes the product boundary and establishes how every future milestone is approved. It is grounded in the actual repo state, including the migration identifier collisions (`0042`, `0043`, `0058`) and the scope-drift findings (student QR badges, bus QR sessions, Safe ETA, notifications).

Added `docs/governance/`:

- `README.md` — index and precedence rule.
- `commercial-release-scope.md` — binding CR1 commitment, exclusions, pilot
  ceiling, and launch-gate map.
- `product-scope.md` — transportation platform, not an SIS; "track the bus, not the child"; prohibited data; platform-isolation rule.
- `data-classification.md` — Restricted/Confidential/Internal/Public tiers mapped to real tables.
- `feature-inventory.md` — current vs. future functionality; scope-drift reconciliation table (D1–D7).
- `first-customer-profile.md` — first customer is an Alberta public school authority.
- `capacity-assumptions.md` — precise "500,000 users" definition; 20,000-bus worst case; Phase 12 staging ceilings.
- `role-responsibility-matrix.md` — product and delivery roles; data and system owners; separation of duties.
- `risk-register.md` — R-001 through R-015, including migration collisions and scope drift.
- `decision-log.md` — DL-001 through DL-007, including the no-rename migration rule.
- `development-workflow.md` — feature branches only; one milestone at a time; GLM builds, Codex reviews, human merges.

Scope exit gate: complete through `DL-010`. Other Phase 0 governance artifacts
retain their own sign-off requirements. Scope approval does not authorize a
real-data launch.

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

Pending exit gates: remaining non-scope governance sign-offs; migrations `0065`–`0074`
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

`pnpm test:rls:dev` executes SQL against the registered hosted Supabase DEV. It
requires:

```bash
SAFEBUS_RLS_TEST_DATABASE_URL=postgresql://...
SAFEBUS_RLS_TEST_CONFIRM=DEV_ONLY
SAFEBUS_RLS_TARGET=development
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
  - `SAFEBUS_QA_TARGET=development`

Run the seed only against registered hosted Supabase DEV, never production. The
fixture uses fake `@example.test` data and does not create a production
dummy-data UI.

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
- Scheduler: added `apps/web/netlify/functions/guardian-notification-email-scheduled.mjs` with a five-minute schedule in `netlify.toml`. It reuses the shared `runDispatcher` logic, accepts Netlify's documented `next_run` payload, injects the dispatcher secret internally so it never leaves the server, requires no browser user, and remains safe under overlapping execution via `for update skip locked`.
- Privacy-safe diagnostics: every dispatcher result path now logs through an allowlist-based `safeLog()` helper. Logs contain only outbox correlation ID, attempt, notification type, result, category, and duration. No recipient emails, names, message bodies, API keys, or provider response bodies are logged.
- Tenant-admin operational visibility: the summary RPC and `NotificationDeliverySummaryCard` on `/admin/trips` show pending/processing/recent-delivered/recent-failed/cancelled counts, oldest pending age, and normalized failure categories for `tenant_admin`/`school_admin`/`transportation_admin` only. No personal information is returned. Platform Super Admin is deliberately denied.
- Time-zone decision: added `tenants.timezone` (IANA) with a safe Alberta default and tenant-admin configuration path. The dispatcher formats the authoritative server-recorded event timestamp in the tenant's configured IANA zone. Raw UTC is no longer presented to guardians.
- Idempotency: the dispatcher sends Resend's `Idempotency-Key` header keyed per outbox row. Because Resend does not publish a guaranteed idempotency-key lifetime, SafeBus describes this as "duplicate-resistant" rather than exact-once.
- Tests: expanded unit/dispatcher/scheduled-function tests, expanded RLS/privilege suite, added Playwright coverage for the summary card (admin access, guardian/driver/Platform Super Admin denial, privacy, mobile layout), added a notification QA fixture, and added a manual acceptance guide.
- Manual acceptance guide: `docs/qa/phase-15b-notification-delivery-hardening-acceptance.md`.
- Known limitations before acceptance: hosted-DEV migration application of `0038`/`0039`, Resend sandbox/provider test, Netlify deploy-preview status, and product-owner manual acceptance remain pending. The PR is not merged.

## Phase 6 — Complete Transportation Operations

Status: Implemented on `phase-6-transportation-operations-completion` for review. Applies to hosted Supabase DEV after manual SQL Editor application of `0079_phase6_transportation_operations_completion.sql`. Not merged and not accepted; hosted-DEV and operational exit gates remain.

Phase 6 completes the non-ETA transportation operations workflow while preserving existing school, fleet, route, assignment, GPS, guardian, and history features. Migration `0079` extends the existing trip state contract and reconciles affected school-scope policies/RPCs for paused-trip support.

### What already existed (unchanged)

- School, bus, vehicle, driver, route, and stop management (admin CRUD pages + RLS).
- Student-to-stop and route assignment (`student_route_assignments`, `student_bus_assignments`).
- Driver-to-bus/route assignment (`driver_route_assignments`, `bus_route_assignments`).
- Trip start (QR/session contract), completion (`end_driver_trip`), active trip dashboard, live fleet monitoring.
- Driver completed trip history and the append-only audit system.
- Tenant vs. school scoping via RLS helpers (`can_write_tenant`/`can_write_school`).

### What Phase 6 adds (`0079`)

- **Route schedules and service days:** `route_service_days` table (0=Sun..6=Sat) with tenant/school/driver-scoped RLS and admin CRUD.
- **Trip pause, resume, cancellation, and exception handling:** widens `driver_trips.status` to include `paused`; adds `pause_driver_trip`, `resume_driver_trip`, `cancel_driver_trip`, and `record_trip_exception` SECURITY DEFINER RPCs. New open-trip unique indexes prevent a QR start from creating a second trip while the first is paused. Completion and cancellation close the server-side bus tracking session and dispatch record.
- **Pre-trip confirmation:** `pre_trip_confirmations` table + `confirm_pre_trip()` idempotent driver RPC.
- **Operational notes with controlled formats:** `operational_notes` table restricted to routes/buses/drivers/trips and a controlled `note_type` enum. `validate_operational_note()` plus a table CHECK constraint reject free-text entry of ASN, health, address, custody, or other prohibited student information at the database layer.
- **Substitute driver and replacement bus workflows:** `substitute_driver()` and `replace_bus()` admin RPCs that end the original assignment and create a new one while preserving bus/route/trip-type/effective window; both refuse when an active/paused trip exists and record audit events.
- **Guardian-access revocation:** `revoke_guardian_access()` sets an authorized guardian link to `inactive`, accepts only controlled reason codes, enforces the linked student's school boundary, and records an audit event.
- **Late/missing bus operational status:** `trip_operational_statuses` plus controlled admin RPCs provide normal/late/missing dispatch status and controlled reason codes. These values perform no ETA calculation.
- **History and evidence:** trip review includes paused/completed/cancelled runs, pre-trip confirmation, controlled exceptions, and operational notes.
- **Privacy and authorization guardrails:** no ASN, home address, health, custody, contact, or other prohibited student data is accepted by new free-text fields. Phase 6 policies explicitly exclude Platform Super Admin, tenant/transportation administrators remain tenant-wide, and school administrators are route-school scoped (including the existing PostGIS viewport RPC reconciliation). No public policies or browser service-role logic were added.

### Frontend

- Driver dashboard gains pre-trip confirmation, pause/resume, cancel, and record-exception controls (`apps/web/src/pages/DriverDashboardPage.tsx`).
- Route management gains service-day selection alongside existing directional stop schedules.
- Driver assignments is now a routed navigation destination and gains substitute-driver and replace-bus inline workflows (`apps/web/src/pages/AdminDriverAssignmentsPage.tsx`).
- Live Operations gains dispatcher-controlled late/missing status without deriving an ETA.
- Route, bus, driver, and trip history surfaces gain controlled operational notes; trip history also shows pre-trip and exception evidence.
- Guardian detail gains audited revocation with controlled reason choices (`apps/web/src/pages/AdminGuardianDetailPage.tsx`).
- New `apps/web/src/services/phase6OperationsService.ts` wraps all new RPCs browser-safely; pause/resume/cancel were added to the existing `driverTripService.ts`.

### Tests

- `tests/rls/phase6-transportation-operations-rls.sql`: assertions for every new RLS table, Platform Admin exclusion, open-trip uniqueness, the widened status CHECK, prohibited-text validation, and RPC existence.
- `tests/smoke/phase6-driver-operations.spec.ts`: driver pre-trip confirmation, pause/resume, record-exception, and cancel flows.
- `tests/smoke/phase6-admin-operations.spec.ts`: substitute-driver, replace-bus, guardian revocation, and browser portal boundaries for tenant, school, transportation, platform, driver, and guardian roles.
- `tests/smoke/route-trip-pattern-model.spec.ts`: route service-day persistence with existing stop schedules.
- Manual hosted-DEV exit gate: `docs/qa/phase6-transportation-operations-acceptance.md`.

### Exit gate (pending hosted-DEV execution)

- A tenant can complete an end-to-end synthetic operational day: add schools, vehicles, routes, and stops; add drivers, guardians, and students; establish authorized guardian links; make assignments; start and complete trips; handle driver or bus substitution; review history and audit evidence. No ETA is included in this phase.
- `0079` applied to hosted DEV; clean rebuild through `0079`; RLS execution of the Phase 6 SQL; manual acceptance of the driver/admin/guardian flows.

## Milestone 16B — Tenant Admin Application Shell and Operations Hub UI Refresh

Milestone 16B refreshes the tenant-admin interface as a UI-only operations hub. It adds a persistent desktop tenant-admin shell, grouped left navigation, compact top workspace header, accessible mobile navigation drawer, and a redesigned overview page using only existing dashboard data and actions.

This milestone preserves existing business logic and tenant isolation. It adds no Supabase migration, backend capability, database object, RLS policy, RPC, permission change, protected-route change, or new tenant-admin workflow. Future UI redesign milestones remain unmarked and unimplemented.

## Phase 4 — Secure Development and Deployment Platform

Status: Repository implementation updated for review under revised DL-013.
Production adoption and the operational exit gates require authorized human
completion.

- Added a protected, human-approved production release and application rollback
  workflow for the sole database model.
- Added immutable SHA-256 migration manifests, transactional deployment ledger,
  catalog-level schema fingerprinting, and pre-deploy/standalone drift checks.
- Added pinned authoritative Supabase TypeScript generation and release-time
  stale-type rejection.
- Expanded CI into independent typecheck, lint, build, unit, browser smoke,
  dependency audit, secret scan, CodeQL, and migration gates without a
  production database credential.
- Patched the React Router advisory line by migrating to `react-router` 8.3.0
  with its React 19-compatible mapping stack; the production dependency audit
  reports no known vulnerabilities.
- Added CSP, HSTS, frame denial, MIME-sniffing protection, Referrer Policy, and
  Permissions Policy; disabled public source maps and mobile WebView debugging;
  and replaced Google-hosted fonts with bundled Inter assets.
- Added production security approval and forward-only database/application
  rollback runbooks under `docs/governance/phase-4/`.

Pending operational evidence: configure the protected production reviewer and
secrets, verify backup/recovery and Canadian region, rotate previously used
credentials, adopt the existing database, run application rollback, verify
deployed headers, and obtain human security/privacy approval. Never run hosted
RLS assertions or QA fixture writers against the sole production database.

## Phase 7 — Shared Android app and personal-device driver tracking

Status: BYOD repository implementation updated for review under `DL-017`;
database, Google Play, physical-device, and human exit evidence pending.

- Retained one Capacitor Android binary with separate role-guarded guardian and
  driver portals. Guardian accounts cannot access driver tracking controls.
- Added migration `0090_phase7_byod_android_tracking.sql` for personal-device
  registration and versioned location-notice acknowledgment. It is unapplied;
  production was not touched.
- Added the prominent disclosure before Android location permission, explicit
  background-location/notification readiness, settings recovery, and native
  start-time fail-closed checks.
- Preserved Android Keystore encryption, encrypted offline FIFO recovery,
  device/session binding, the visible foreground service, and the 18-hour
  offline authorization ceiling.
- Targeted Android API 36, added Android CI, and added a protected workflow that
  builds and verifies a signed AAB for an exact reviewed commit.

Pending: approved isolated database and migration/RLS execution; signed-workflow
run with protected keys; Google Play background-location/privacy review; device
matrix and eight-hour battery/data/coverage testing; approved customer BYOD,
support, reimbursement, and lost-device processes; privacy and operations
sign-off. iOS remains deferred.

## Phase 8 — Guardian Experience and Notifications

Status: repository implementation complete on `agent/phase-8-guardian-experience-notifications`; hosted-DEV and human exit evidence pending.

- Reconciled and retained the existing guardian bus-first contract, narrow location states, outbox deduplication, claim leases, retry backoff, provider idempotency, and aggregate delivery status.
- Added migration `0087_phase8_guardian_experience_notifications.sql`: server-time access expiry, explicit per-student guardian email/event choices, immediate queued-work cancellation after revoke/unsubscribe, a fail-closed tenant privacy-approval policy, tenant quotas, provider rate limiting, and a distinct dead-letter state.
- Added expiry-aware `get_guardian_bus_visibility_v2()` and retired authenticated execution of its unexpired-unaware predecessor. The result remains bus-only and excludes manifests, other students/stops, route geometry, driver identity, and authorization IDs.
- Added `/guardian/notifications` with plain-language, accessible preference controls. All defaults remain off until the guardian explicitly saves a choice and the tenant privacy review is approved.
- Changed the durable queue scheduler from hourly to every five minutes and retained stable outbox UUID idempotency.
- Added Phase 8 RLS/structural regression coverage and the acceptance plan in `docs/phase-8-guardian-experience-notifications.md`.

Pending: apply `0087` to hosted DEV; run cross-guardian/revocation/expiry and notification load/failure tests; approve notification defaults and quotas; complete plain-language testing and a WCAG 2.2 AA audit with no unresolved critical issues.
