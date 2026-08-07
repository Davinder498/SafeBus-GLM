# SafeBus Alberta — Phase 3 Retention Schedule

**Status:** Draft for counsel confirmation — periods are not legal advice
**Owner:** Privacy Lead
**Phase:** 3 — Alberta privacy and legal readiness
**Last updated:** 2026-08-07

---

## 1. Purpose

Phase 3 requires **defined retention periods** and **automated deletion or
anonymization** for personal information. This schedule defines the maximum
retention per data class and maps each class to the enforcement mechanism in
migration `0069_phase3_retention_foundation.sql`. It closes risk
**R-011**.

The periods below are **drafts**. Counsel must confirm they satisfy POPA,
ATIA, PIPA, and the Education Act for each customer relationship.

## 2. Retention policy table

| Retention key | Data class | Max retention (draft) | Action at expiry | Mechanism |
| --- | --- | --- | --- | --- |
| `invitations` | Tenant-member invitations / onboarding state | 90 days after consumed or expired | Hard delete | `run_retention_deletion('invitations')` |
| `student_records` | Inactive student transportation rows and dependent links/events | While active + 13 months inactive | Hard delete | `run_retention_deletion('student_records')` |
| `guardian_relationships` | `student_guardians` links | While active + 13 months inactive | Hard delete link | `run_retention_deletion('guardian_relationships')` |
| `driver_records` | Inactive driver and linked public-profile identity fields | While active + 13 months inactive | Anonymize operational identity; Auth-account deletion is separate | `run_retention_deletion('driver_records')` |
| `bus_tracking_sessions` | Ended/revoked hashed bus-session tokens | 30 days | Hard delete | `run_retention_deletion('bus_tracking_sessions')` |
| `bus_run_dispatches` | Completed/cancelled dispatch rows | 13 months | Hard delete before parent trips | `run_retention_deletion('bus_run_dispatches')` |
| `trip_records` | Completed/cancelled `driver_trips` lifecycle | 13 months after trip end | Hard delete with dependent rows | `run_retention_deletion('trip_records')` |
| `raw_location_history` | `driver_trip_location_updates` raw rows | 30 days | Hard delete | `run_retention_deletion('raw_location_history')` |
| `notifications` | `guardian_notification_outbox` | 90 days after terminal state | Hard delete | `run_retention_deletion('notifications')` |
| `audit_records` | `audit_events` | 24 months | Remove actor, target, network, and detail fields; retain action/outcome/time | `run_retention_deletion('audit_records')` |
| `rate_limit_buckets` | Fixed-window abuse-prevention counters | 2 days | Hard delete | `run_retention_deletion('rate_limit_buckets')` |
| `user_sessions` | Revoked/stale SafeBus session mirror | 90 days | Hard delete | `run_retention_deletion('user_sessions')` |

The policy table is materialized as `retention_policies` in migration
`0069` so the deletion RPCs read authoritative periods from the database,
not from code constants. Counsel-approved changes require a reviewed,
forward-only migration; applied migration text is never edited in place.

## 3. Principles

1. **Maximum, not target.** Retention periods are ceilings. Deletion may
   run more frequently than the ceiling; it must never exceed it.
2. **Explicit coverage.** An unknown or inactive policy key fails closed.
   Adding a class requires both a policy row and an implemented branch.
3. **No silent preservation.** Backups are governed by the subprocessor
   agreement and the breach workflow; a row deleted from production must
   not be restorable beyond the backup window approved by counsel.
4. **Auditability.** Every retention run writes a single
   `retention.deletion_run` audit event with counts; no personal data is
   logged.
5. **Restricted execution.** Browser execution requires a platform super
   administrator, AAL2, and recent authentication. The scheduled path uses
   a server-only key and stores aggregate evidence with no personal data.

## 4. Automated deletion / anonymization (migration `0069`)

Migration `0069` implements:

- `retention_policies` table — single source of truth for periods.
- `retention_deletion_runs` table — append-only log of each run with
  counts and timestamps; no personal data.
- `get_retention_policies()` — admin-readable policy summary.
- `run_retention_deletion(p_key text)` — SECURITY DEFINER RPC that
  performs the deletion/anonymization for one policy key, returns a
  summary row, and writes an audit event. Platform-super-admin-only.
- `run_all_retention_deletions()` — convenience wrapper that runs every
  active policy and returns a per-key summary.
- RLS: tenant/school/transportation admins can **read** policy summaries;
  only platform super admin can **run** deletion. Drivers and guardians
  are denied.

The daily schedule is registered in `netlify.toml` and implemented by
`safebus-retention-scheduled.mjs`. It defaults to count-only dry runs.
Destructive execution remains disabled until counsel approves the schedule,
a reviewed forward migration enables `retention_execution_control`, and
Operations sets the server-only `SAFEBUS_RETENTION_EXECUTE=true` flag.
Overlapping runs fail closed through a transaction advisory lock.

## 5. Pre-deletion downsampling (raw location history)

Raw location history is the highest-volume personal data. Before the 30-day
hard delete, operational summaries (e.g., trip distance/duration aggregates
that contain no personal identifiers) may be retained longer per
[`../capacity-assumptions.md`](../capacity-assumptions.md). Phase 3 ships
the deletion control; the downsample job is finalized with Phase 9
realtime scale work, but the ceiling is enforced from Phase 3 onward.

## 6. Counsel confirmation items

- [ ] Confirm each retention period in §2.
- [ ] Confirm the backup-retention window does not exceed the approved
  deletion periods in a way that violates the statutes.
- [ ] Confirm hard deletion for trips and anonymization for old audit records
  are acceptable at the stated periods.
- [ ] Confirm the 30-day raw-location ceiling aligns with operational
  needs and statute.

## 7. Changes to this schedule

Any change to a retention period requires:

1. A `decision-log.md` entry with rationale.
2. An update to the `retention_policies` row in the database (via a new
   forward-only migration; never edit `0069` in place after it is applied).
3. Re-running `tests/rls/phase3-retention-rls.sql` against hosted DEV.
