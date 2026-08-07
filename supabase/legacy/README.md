# Archived / Legacy Migrations

These migrations have been **archived from the canonical migration set** and
are **excluded from fresh database rebuilds**. They are retained for history
and for environments that already applied them.

Each archived file is renamed with an `_archived` suffix to avoid colliding
with the canonical migration ledger recorded in
[`docs/migration-ledger.md`](../../migration-ledger.md).

## Archived files

| Archived filename | Original migration | Reason | Superseded by |
| --- | --- | --- | --- |
| `0042_fix_guardian_live_bus_location_uuid_aggregate_archived.sql` | `0042_fix_guardian_live_bus_location_uuid_aggregate.sql` | Lost the `0042` collision; its RPC is a pure iteration that is redefined by later migrations. | `0053`, `0054` redefine the RPC; `0061` revokes it. |
| `0043_secure_student_qr_boarding_foundation_archived.sql` | `0043_secure_student_qr_boarding_foundation.sql` | Lost the `0043` collision; also a scope-drifted feature (student badges) quarantined by Phase 0 `feature-inventory.md` D1. | `0054` redefines the resolver; the table is not required by the canonical schema. |

## Legacy file (pre-existing)

`0004_hosted_schema_alignment.sql` (pre-existing) is a legacy hosted-alignment
migration. Per `AGENTS.md`: do not apply the legacy migration to clean
dev/staging/production databases.

## Rule

Do **not** apply any file in this directory to a fresh database. Fresh
rebuilds use only the canonical migrations in `supabase/migrations/` plus the
corrective `0065_phase1_authorization_reconciliation.sql`, which asserts the
post-collision schema state.