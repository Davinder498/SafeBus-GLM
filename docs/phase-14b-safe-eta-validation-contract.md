# Phase 14B Safe ETA Contract Inspection

## Existing contract confirmed from code

- ETA helper functions live in `0034_safe_eta_foundation.sql`: `safebus_distance_meters(...)` and `calculate_safe_route_eta(...)`.
- Guardian RPC `get_guardian_live_trip_visibility()` returns student display fields plus `relevant_stop_name`, `eta_status`, `eta_min_minutes`, `eta_max_minutes`, `eta_label`, and `eta_updated_at`; client mapping keeps only safe display fields.
- Tenant-admin RPC `get_admin_live_fleet_monitoring()` returns fleet operational fields plus `next_stop_name`, `eta_status`, `eta_label`, and `eta_updated_at`; it intentionally excludes students and guardians.
- Guardian UI displays only server-provided ETA labels, relevant stop text, and refresh timestamps; it does not render raw bus coordinates on the bus-status page.
- Admin UI displays operational fleet ETA/progress in the live fleet table.
- Freshness rule is two minutes server-side for ETA and live fleet status.
- Speed rule uses measured speed only when `3 <= speed_mps <= 15`; otherwise it uses an 8 m/s conservative fallback.
- ETA labels are ranges or broad approximate labels, capped at 90 minutes; very small estimates render as `Arriving soon`.
- Morning trips use pickup stop ids; evening trips use drop-off stop ids for guardian ETA.
- Passed-stop logic compares nearest ordered stop against the target in the travel direction.
- Existing coverage before Phase 14B included smoke tests around live-status display and a manual SQL checklist in `safe-eta-foundation-rls.sql`.

## Phase 14B hardening findings

- Platform Super Admin remained included in the tenant operational fleet RPC from the older milestone comment; Phase 14B excludes it from `get_admin_live_fleet_monitoring()`.
- Future timestamps were not separately treated as unsafe by the ETA helper; Phase 14B adds `future_location` suppression.
- Invalid coordinates could be considered by route-distance CTEs before the status was assigned; Phase 14B gates nearest-stop math on a usable location state.
- No schema tables were required. Migration `0037_safe_eta_validation_hardening.sql` only replaces functions and preserves grants.

## Validation state

Automated validation and hosted-DEV scripts are implemented on the feature branch. Manual product-owner acceptance remains pending until the deploy preview is tested with the guide in `docs/qa/phase-14b-safe-eta-acceptance.md`.
