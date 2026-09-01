# SafeBus Alberta — Authoritative Feature Inventory

**Status:** Approved and locked for Commercial Release 1
**Owner:** Product Owner
**Phase:** 0 — Product and governance baseline
**Last updated:** 2026-08-15

---

## 1. Purpose

This is the single source of truth for what SafeBus **currently does** versus
what is **future scope**. It reconciles the actual code state against the
approved product scope in [`product-scope.md`](./product-scope.md) and the
repo rules in `AGENTS.md`.

A feature present in the codebase is **not** automatically current. Drifted
features get an explicit decision here: **Keep & Current**, **Keep & Future
(quarantined)**, or **Remove**. Until a decision is recorded, drifted
features are treated as **future scope** and must not be advertised,
documented as current, or surfaced to end users.

"Current" in this inventory means approved product behavior represented in the
repository. It does not mean production-proven. Commercial Release 1 inclusion
and the outstanding launch gates are defined in
[`commercial-release-scope.md`](./commercial-release-scope.md).

## 2. Current functionality (in scope)

These are the approved operational capabilities of SafeBus.

| Area                                   | Capability                                                             | Representative code                                                      |
| -------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Multi-tenancy                          | Tenant isolation, tenant admin/school admin/transportation admin roles | `0001`, RLS across migrations                                            |
| Schools                                | CRUD of schools as transportation org units                            | `AdminSchoolsPage.tsx`                                                   |
| Buses                                  | Bus/vehicle records and unified bus workspace                          | `AdminBusWorkspacePage.tsx`, `0058_unified_bus_management_workspace.sql` |
| Drivers                                | Driver records and detail views                                        | `AdminDriversPage.tsx`, `AdminDriverDetailPage.tsx`                      |
| Routes & stops                         | Route and stop management, versioned route geometry                    | `AdminRoutesPage.tsx`, `0057_versioned_route_geometry.sql`               |
| Route trip patterns                    | Directional route trip patterns and cutover                            | `0045`, `0046`                                                           |
| Assignments                            | Student↔stop/route, driver↔bus/route, bus↔route assignments            | `0032`, `0013`, `0060`                                                   |
| Trips                                  | Trip lifecycle (start/pause/complete/cancel/exception)                 | `driverTripService.ts`, `0006`                                           |
| Live bus location (operational)        | Driver phone → server current location during active trip              | `0007`, `0030`, `busTrackingService.ts`                                  |
| Admin live fleet monitoring            | Tenant-scoped live fleet map and table, no ETA                         | `AdminLiveTripsPage.tsx`, `0026`                                         |
| Guardian live bus visibility           | Guardian-scoped bus location for linked student's active trip          | `GuardianLiveMapPage.tsx`, `0027`, `0061`                                |
| Guardian route visibility              | Guardian sees linked student's route info                              | `GuardianRoutesPage.tsx`, `0015`                                         |
| Student roster admin                   | Tenant-admin student roster management                                 | `AdminStudentsPage.tsx`, `0016`                                          |
| Guardian management & linking          | Secure guardian↔student linking RPC                                    | `AdminGuardiansPage.tsx`, `0019`                                         |
| Driver active-trip manifest            | Minimum manifest for the active trip                                   | `DriverManifestPage.tsx`, `0022`                                         |
| Tenant admin CSV import (student-only) | Approved narrow student-only CSV import                                | `studentCsvImportService.ts`, `0044`                                     |
| Driver trip history                    | Completed-trip history for drivers                                     | `DriverTripHistoryPage.tsx`, `0055`                                      |
| Admin trip overview                    | Tenant-scoped trip overview                                            | `adminTripOverviewService.ts`, `0058_admin_trip_overview.sql`            |
| People directory                       | Tenant-scoped people directory                                         | `adminPeopleService.ts`, `0043_people_directory...`                      |
| Bus QR tracking sessions               | Driver scan-to-start bound to a bus/session, never a student badge     | `0059`, `0062`, merged PRs #88/#89/#95                                   |
| Safe ETA server foundation             | Scoped ETA calculation/validation; no road-network or traffic provider | `0034`, `0037`, merged PRs #42/#43/#51                                   |
| Guardian event email MVP               | Approved pickup/drop-off email outbox, delivery, and hardening         | `0025`, `0038`, `0039`, merged PRs #28/#52/#53                           |
| Shared Android app                      | Role-scoped guardian and driver portals; personal-phone active-trip GPS | `apps/mobile`, `0090_phase7_byod_android_tracking.sql`, `DL-017`          |

## 3. Future functionality (out of scope until a milestone explicitly approves)

Per `AGENTS.md` and `product-scope.md`, these are **future scope**. They are
listed here so the boundary is explicit.

- Road-network/traffic ETA expansion beyond the approved server foundation
- Notifications delivery beyond the approved Phase 15A email MVP (SMS, push)
- QR codes as a user-facing boarding system
- Student badges
- Pickup/drop-off **scan** events (as opposed to driver-recorded events)
- Live GPS outside an authorized active trip
- Maps API selection for production (a commercial provider must be chosen)
- CSV import beyond student-only (guardians, transportation, SIS)
- PowerSchool / SchoolEngage / SIS integration
- Realtime subscriptions as a primary delivery path
- Trip replay / location history exposure
- Geofencing / route-deviation alerts
- Speed enforcement (display only is current; enforcement is future)
- Production deployment beyond DEV/staging
- iOS application delivery

## 4. Scope-drift reconciliation

The first table preserves the audit's original recommendations. The resolved
disposition below supersedes those recommendations. Merged, named milestone
PRs are repository evidence of prior review; final Phase 0 document sign-off
remains a product-owner gate.

| #   | Feature                                         | Evidence                                                                                                                | Rule it touches                                                                     | Recommended decision                                                                                                                                                                                 | Rationale                                                                                                                                       |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Student QR boarding credentials                 | `0043_secure_student_qr_boarding_foundation.sql`, `studentQrCredentialService.ts`, `resolve_student_qr_for_active_trip` | AGENTS.md "no student badges"; Phase 0 "no future milestones mixed in current work" | **Keep & Future (quarantine)** — remove from reachable current admin/driver routes and docs; retain code behind a disabled flag pending a future milestone that explicitly approves student badges.  | Directly risks "track the bus, not the child." Cannot be silently promoted.                                                                     |
| D2  | Bus QR tracking sessions (driver scan-to-start) | `0059_bus_qr_tracking_sessions.sql`, `0062_enforce_qr_only_driver_trip_start.sql`, `busQrCredentialService.ts`          | AGENTS.md "no QR codes" unless approved; but operational (bus, not child)           | **Promote-with-milestone** — record in decision log; if product owner approves, it becomes current scope under a named milestone because it tracks the **bus**, not the child. Otherwise quarantine. | Operationally aligned with "track the bus," unlike D1. Needs explicit approval, not silent drift.                                               |
| D3  | Safe ETA foundation + validation                | `0034_safe_eta_foundation.sql`, `0037_safe_eta_validation_hardening.sql`, `apply-safe-eta-scenario.mjs`                 | Phase 6 exit gate explicitly says "No ETA is included in this phase"                | **Keep & Future (quarantine)** — hide from all user-facing surfaces; do not reference as current; reserved for a future ETA milestone.                                                               | ETA is repeatedly named as future scope through Phase 6.                                                                                        |
| D4  | Guardian notification outbox + email delivery   | `0025`, `0038`, `0039`, `guardian-notification-email.mjs`, PR #52                                                       | AGENTS.md "no notifications" unless approved                                        | **Promote-with-milestone** if Phase 15A was approved on `main` (PR #52 exists) — otherwise quarantine.                                                                                               | MILESTONE_STATUS says Phase 15A was merged via PR #52; if that constitutes product-owner approval, it is legitimately current. Verify sign-off. |
| D5  | CSV import (student-only)                       | `0044_tenant_admin_student_csv_import.sql`, `studentCsvImportService.ts`                                                | AGENTS.md allows only the narrow approved student-only workflow                     | **Keep & Current** — already the approved narrow workflow; documented as current.                                                                                                                    | Matches the explicit AGENTS.md exception. Broader CSV import remains future.                                                                    |
| D6  | Platform tenant onboarding + privacy boundary   | `0035_platform_tenant_onboarding.sql`, `0036_platform_tenant_privacy_boundary.sql`                                      | Phase 1 platform-isolation rule                                                     | **Keep & Current** — implements the platform control plane; verify in Phase 1 that it exposes only the allowed fields.                                                                               | Aligns with Phase 1 work; subject to Phase 1 RLS verification.                                                                                  |
| D7  | PostGIS spatial foundation                      | `0056_postgis_spatial_foundation.sql`                                                                                   | Future maps/routing prerequisite                                                    | **Keep & Future (foundation only)** — extension enablement is fine; do not build user-facing spatial features until maps provider is approved.                                                       | Infrastructure without user-facing exposure.                                                                                                    |

### Resolved disposition

| Item                      | Repository disposition                                                                                                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 Student QR             | **Quarantined.** Archived the migration, removed the later resolver, dropped any previously applied objects in `0065`, removed reachable admin/driver UI, and removed the unused mobile camera dependency. Remaining code/docs are historical and cannot operate against the canonical schema. |
| D2 Bus QR                 | **Keep & Current.** Named bus-session milestones were merged in PRs #88, #89, and #95. It tracks a bus/session, never a student badge.                                                                                                                                                         |
| D3 Safe ETA               | **Keep & Current (server foundation).** Phase 14A/14B were merged in PRs #42, #43, and #51. Road-network, traffic, and production-provider expansion remains future.                                                                                                                           |
| D4 Notification system | **Implemented for review under the named end-to-end notification milestone.** Existing guardian pickup/drop-off email remains current. Durable role-scoped inboxes and guardian/driver Android FCM are fail-closed pending PR approval, isolated RLS acceptance, privacy/security/subprocessor approval, protected secrets, and a tenant canary. SMS, iOS push, web push, campaigns, localization, and digests remain future. |
| D5 Student-only CSV       | **Keep & Current.** Broader imports remain future.                                                                                                                                                                                                                                             |
| D6 Platform onboarding    | **Keep & Current**, subject to Phase 1 control-plane RLS verification.                                                                                                                                                                                                                         |
| D7 PostGIS                | **Keep & Current.** Geoapify is selected through a server-managed configuration. Provider contract/privacy review, quota monitoring, paid-SLA activation, and operating evidence remain Point 8 launch gates.                                                                                 |

## 5. Migration integrity findings (handled in Phase 1, recorded here for visibility)

These are not feature drift, but they are governance findings that block the
Phase 0 exit gate "No future milestones mixed into current work" because they
make the canonical schema unknowable until reconciled:

- **Duplicate migration identifiers:** `0042_`, `0043_`, `0058_` each have two
  files. Supabase keys its ledger on filename; deployment order and a
  deterministic fresh rebuild are currently ambiguous.
- **Old browser-source location ingestion path** coexists with the QR/session
  path; the obsolete path must be quarantined in Phase 1.

Resolution approach is owned by Phase 1 (see
`docs/governance/decision-log.md` for the no-rename rule).

## 6. Rule for adding to this inventory

- Any new feature PR must update §2 or §4 of this file in the same PR.
- A feature moving from §4 (drifted) to §2 (current) requires a `decision-log.md`
  entry and product-owner sign-off.
- A feature moving from §3 (future) to §2 (current) requires a named milestone
  in the phased plan.

---

**Sign-off**

| Role                  | Name                   | Date       | Signature               |
| --------------------- | ---------------------- | ---------- | ----------------------- |
| Final Decision Holder | Platform Administrator | 2026-08-12 | Approved through DL-010 |
| Final Decision Holder | Platform Administrator | 2026-08-15 | Mobile scope revised through DL-017 |
