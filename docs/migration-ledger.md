# SafeBus Alberta — Authoritative Migration Ledger

**Status:** Living document — updated with every migration
**Owner:** Engineering Lead
**Phase:** 1 — Critical database and authorization repair
**Last updated:** 2026-08-15

---

## 1. Purpose

Phase 1 requires an authoritative migration ledger that reconciles duplicate
identifiers, records what was actually applied, and proves a fresh database
can be built deterministically. This ledger maps every migration filename to
its semantic intent, its collision status, and whether it is canonical or
archived.

Per `decision-log.md` DL-005: **migrations already recorded in a database are
not renamed.** Collisions are resolved by documenting them here, archiving
losers to `supabase/legacy/`, and producing corrective migration `0065` that
asserts final schema state for fresh rebuilds.

## 2. Collision resolution

### 2.1 Collision on `0042`

| File | Intent | Objects | Resolution |
| --- | --- | --- | --- |
| `0042_secure_student_onboarding_workflow.sql` | Student onboarding RPCs + search helpers | `search_admin_guardians`, `search_admin_routes`, `search_admin_buses`, `get_admin_route_stop_options`, `admin_create_student_onboarding` | **WINNER — canonical.** Functions are used by `apps/web/src/services/studentOnboardingService.ts` and redefined in `0043`. |
| `0042_fix_guardian_live_bus_location_uuid_aggregate.sql` | Fix `min(uuid)` aggregate in guardian live-bus RPC | `get_guardian_student_live_bus_location_state()` | **LOSER — archived to `supabase/legacy/`.** Pure iteration on an RPC that already existed from `0027` and is redefined again in `0053`, `0054`, and revoked in `0061`. Archiving is safe: its effects are fully superseded. |

### 2.2 Collision on `0043`

| File | Intent | Objects | Resolution |
| --- | --- | --- | --- |
| `0043_people_directory_and_student_identifier_retirement.sql` | Structured names, driver compliance fields, scalable directory RPCs | Columns on `profiles`/`guardians`/`drivers`, `normalize_member_structured_name()`, `search_admin_students`, `get_admin_students_page`, redefined `search_admin_guardians`, `school_student_number` retirement | **WINNER — canonical.** Columns and functions are depended on by `0044`+ and frontend services. |
| `0043_secure_student_qr_boarding_foundation.sql` | Student QR badge credentials (scope-drifted feature D1) | `student_qr_credentials` table, `hash_student_qr_token`, `create_student_qr_token`, `manage_student_qr_credential`, `get_admin_student_qr_credential_status`, `resolve_student_qr_for_active_trip` | **LOSER — archived to `supabase/legacy/`.** Per Phase 0 D1, student badges violate "track the bus, not the child." Migration `0054` no longer recreates the resolver; `0065` removes any previously applied objects. |

### 2.3 Collision on `0058`

| File | Intent | Objects | Resolution |
| --- | --- | --- | --- |
| `0058_admin_trip_overview.sql` | Tenant-scoped admin trip summary RPC | `get_admin_trip_overview(integer)` | **CANONICAL — kept in `migrations/`.** Used by `adminTripOverviewService.ts`. |
| `0058_unified_bus_management_workspace.sql` | Unified bus workspace RPCs | `get_admin_bus_workspace(uuid)`, `admin_end_bus_route_assignment(uuid)`, `admin_replace_bus_trip_driver(uuid, uuid)` | **CANONICAL — kept in `migrations/`.** Used by `adminBusWorkspaceService.ts`. |

**Note on 0058:** Unlike 0042/0043, both 0058 files create **independent,
non-conflicting objects**. They accidentally share the migration number but
do not redefine each other's functions. For fresh rebuilds, alphabetical
filename ordering applies them in a safe order (independent DDL). No
archiving is needed; the collision is documented here and asserted by
`0065_phase1_authorization_reconciliation.sql`.

## 3. Full migration inventory (canonical order)

| # | Filename | Status | Notes |
| --- | --- | --- | --- |
| 0001 | `0001_auth_profile_foundation.sql` | Canonical | Auth/profile/tenant/school baseline |
| 0002 | `0002_foundation_read_grants.sql` | Canonical | Read grants |
| 0003 | `0003_students_guardians_foundation.sql` | Canonical | Students, guardians, student_guardians |
| 0004 | `0004_transportation_structure_foundation.sql` | Canonical | Buses, drivers, routes, stops, assignments |
| 0005 | `0005_transportation_admin_write_foundation.sql` | Canonical | Admin write policies |
| 0006 | `0006_driver_trips_foundation.sql` | Canonical | Driver trips + end_driver_trip RPC |
| 0007 | `0007_driver_location_update_foundation.sql` | Canonical | Location update RPC + tables |
| 0008 | `0008_fix_driver_location_update_rpc.sql` | Canonical | RPC fix |
| 0009–0014 | Admin live trip monitoring + assignment | Canonical | Progressive hardening |
| 0015–0021 | Guardian visibility + linking | Canonical | Guardian RPCs |
| 0022–0024 | Driver manifest + trip events + guardian events | Canonical | |
| 0025 | Guardian notification outbox | Canonical | Backend outbox (D4 in feature inventory) |
| 0026–0027 | Admin fleet monitoring + guardian live bus | Canonical | |
| 0028–0033 | Route assignments, admin list, bus service | Canonical | |
| 0034 | Safe ETA foundation | Canonical (future-scope D3) | Quarantined from UI per feature inventory |
| 0035–0036 | Platform tenant onboarding + privacy boundary | Canonical | Platform isolation (hardened by `0065`) |
| 0037 | Safe ETA validation | Canonical (future-scope D3) | |
| 0038–0039 | Notification email delivery + hardening | Canonical (D4) | |
| 0040–0041 | Tenant admin delete + route delete cascade | Canonical | |
| 0042 | `0042_secure_student_onboarding_workflow.sql` | **Canonical** | WINNER of 0042 collision |
| ~~0042~~ | ~~`0042_fix_guardian_live_bus_location_uuid_aggregate.sql`~~ | **Archived** | LOSER → `supabase/legacy/` |
| 0043 | `0043_people_directory_and_student_identifier_retirement.sql` | **Canonical** | WINNER of 0043 collision |
| ~~0043~~ | ~~`0043_secure_student_qr_boarding_foundation.sql`~~ | **Archived** | LOSER → `supabase/legacy/` (scope drift D1) |
| 0044–0057 | CSV import, route patterns, PostGIS, versioned geometry | Canonical | |
| 0058 | `0058_admin_trip_overview.sql` | **Canonical** | Co-winner of 0058 collision |
| 0058 | `0058_unified_bus_management_workspace.sql` | **Canonical** | Co-winner of 0058 collision (independent objects) |
| 0059–0064 | Bus QR, unified direction, platform admin delete | Canonical | |
| 0065 | `0065_phase1_authorization_reconciliation.sql` | Canonical | Phase 1 corrective: collision assertion + platform isolation + driver authorization tightening + obsolete function quarantine |
| 0066 | `0066_phase2_audit_system_foundation.sql` | Canonical | Append-only audit foundation and recursive detail sanitization |
| 0067 | `0067_phase2_mfa_recent_auth_allowlist_ratelimit.sql` | Canonical | AAL2/recent-auth gates, redirect allowlist, fixed-window rate limits |
| 0068 | `0068_phase2_password_sessions_idempotency.sql` | Canonical | Password/session/idempotency controls and sensitive-action audit wiring |
| 0069 | `0069_phase3_retention_foundation.sql` | Canonical | Draft retention policies, deletion/anonymization execution, run evidence |
| 0070 | `0070_phase0_3_hosted_validation_reconciliation.sql` | Canonical | Hosted-DEV correction: restore platform tenant lifecycle read and reassert internal-only generic audit writer ACL |
| 0071 | `0071_phase2_auth_rpc_hosted_reconciliation.sql` | Canonical | Hosted-DEV correction: restore the missing narrow self-service authentication audit RPC |
| 0072 | `0072_hosted_platform_helper_and_audit_sanitizer.sql` | Canonical | Hosted-DEV correction: restore recursive audit sanitization and deterministic nested platform authorization |
| 0073 | `0073_hosted_rls_execution_context_reconciliation.sql` | Canonical | Hosted-DEV correction: unify platform authorization with the canonical role lookup and restore audit RLS SELECT privilege |
| 0074 | `0074_phase2_3_hosted_constraint_password_reconciliation.sql` | Canonical | Hosted-DEV correction: allow retention audit events and restore the canonical repeated-character password validator |
| 0075 | `0075_phase5_tenant_administration_foundation.sql` | Canonical | Phase 5: multiple admins, sub-admin roles, admin transfer/recovery/departure, final-admin protection trigger, atomic tenant lifecycle, tenant-level audit search |
| 0076 | `0076_phase5_bulk_onboarding_foundation.sql` | Canonical | Phase 5: private bulk staging, 50k-row validation, atomic confirmation/rollback, set-based duplicate detection, SIS integration boundary |
| 0077 | `0077_phase5_invitation_lifecycle.sql` | Canonical | Phase 5: enforced invitation expiry/revoke, first-admin platform boundary, rate-limited delivery queue and status reconciliation |
| 0078 | `0078_phase5_account_restoration_bulk_invitations.sql` | Canonical | Phase 5: tenant account restoration and complete idempotent guardian/driver invitation queueing |
| 0079 | `0079_phase6_transportation_operations_completion.sql` | Canonical | Phase 6: service days, controlled late/missing status, trip exceptions, pre-trip evidence, operational notes, pause/resume/cancel, substitutions, replacement buses, guardian revocation, open-trip uniqueness, and school-scope reconciliation for affected trip reads/RPCs. Widens `driver_trips.status` to include `paused`. |
| 0080â€“0085 | Hosted authorization and grant reconciliation | Canonical | Student roster school scope, guardian bus/outbox grants, receive-only realtime, route/trip RLS recursion, and verified MFA helper corrections. |
| 0086 | `0086_phase7_production_driver_tracking.sql` | Canonical | Phase 7 native Android driver-device and active-trip location ingestion authorization. Physical road-test gate remains pending. |
| 0087 | `0087_phase8_guardian_experience_notifications.sql` | Canonical | Phase 8 guardian access expiry, explicit notification preferences, privacy-review gate, quotas, provider limits, and dead-letter handling. |
| 0088 | `0088_fix_phase8_guardian_student_rls_recursion.sql` | Canonical | Phase 8 guardian visibility recursion correction. |
| 0089 | `0089_phase7_byod_android_tracking.sql` | Canonical, unapplied | Phase 7 personal Android registration, versioned location-notice acknowledgment, and retirement of new company-device registration. Deferred Point 5 must take the next available version when rebased. |

## 4. Fresh-rebuild proof

A fresh database must be built from `0001` through `0089` in canonical order
(with archived files excluded) before these phases can be accepted. The archived
files in `supabase/legacy/` are excluded from fresh rebuilds because:

- `0042_fix_guardian_live_bus_location_uuid_aggregate.sql`: its RPC is
  redefined by `0053` and `0054`, then revoked by `0061`.
- `0043_secure_student_qr_boarding_foundation.sql`: creates a scope-drifted
  table not required by the canonical schema; `0054` no longer references it
  and `0065` removes any copy already applied to an environment.

Migration `0065` asserts the post-collision schema state so that drift is
detectable on any environment. Hosted-DEV rebuild evidence remains an explicit
exit gate; this ledger does not substitute for executing it.
