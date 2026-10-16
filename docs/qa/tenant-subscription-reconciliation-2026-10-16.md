# Tenant subscription schema reconciliation — 2026-10-16

Target: the existing **BusSafe** production-designated project. No recovery project was used.

Catalog inspection used `BEGIN TRANSACTION READ ONLY`, transaction-local statement/lock timeouts,
catalog-only SELECTs, and final `ROLLBACK`. No application/Auth records, credentials, or payment
details were queried. No hosted SQL mutations, notifications, fixtures, or migrations were run.

## Observed prerequisites

- Billing accounts, subscription projections, mutation requests, webhook receipts, and onboarding
  invitation columns are present. The catalog query inspected 69 existing columns across these tables.
- Billing state/projection/webhook mutation RPCs are service-role-only; tenant/platform subscription
  reads retain their role and MFA checks.
- `current_user_role`, `current_tenant_id`, `has_verified_mfa`, `is_platform_super_admin`, and recent
  authentication enforcement exist **only in `safebus_private`**. The pending subscription migration uses those private
  helpers and does not recreate public authorization helpers.
- The existing private subscription view is reusable. Its existing implementation is retained under
  a private legacy name, and the replacement adds cycle, trial, schedule, and bus-access fields.
- The first-administrator invitation status RPC has the expected seven-column return signature.
- Bus triggers observed: assigned bus-number protection, updated timestamps, and tracking
  invalidation after updates/deletes. None enforce subscription capacity. The new guard runs before
  insert/update and preserves existing edits/deactivation; existing triggers remain installed.
- `tenant_billing_control` is absent: the forward migration has not been applied to production.

## Release boundary

The complete migration is exercised in embedded PostgreSQL against synthetic baseline tables,
including private authorization helper contracts. This is local implementation evidence, not a
claim of hosted rollback rehearsal or real Stripe acceptance. Before persistent adoption, refresh
the catalog review and recovery evidence and execute the approved bounded rollback rehearsal through
the protected workflow. Do not apply this file or replay the migration ledger as part of QA.

The embedded database queues parallel requests through a single backend. It verifies capacity
outcomes and multi-row insert handling; a true multi-session lock-contention exercise remains part
of the protected release rehearsal. SQL mutations lock the tenant before capacity counts or billing
reservations, and the volatile capacity read observes writes made by earlier statements/rows.

The TypeScript forward API contracts live separately from the generated hosted snapshot until the
approved release permits regeneration. Existing invoice contracts are preserved, and existing
subscription tenants are marked trial-used in the new control table without altering provider state.

The new RPC signatures are reviewed in `config/pending/tenant-subscription-authorization.json`.
Embedded PostgreSQL verifies each audience grant. The active authorization manifest, migration
checksums, observed-production baseline, and exact-tip installation guard are unchanged. Promotion
of the migration and its authorization entries must be reviewed together at release.
