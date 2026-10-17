# Prepared migrations

SQL here is reviewed source for a future protected release. It is deliberately
outside the active top-level migration manifest and deployment traversal. Never
apply these files directly or replay the migration chain against BusSafe.

`20261017154816_optional_student_seat_assignment.sql` adds optional integer seats
to student bus-service assignments, conflict/capacity enforcement, seat-aware
administrative writes and role-scoped read projections. It remains unapplied and
does not change the active migration manifest or security-install tip. Release
the migration before deploying its clients, after hosted-schema reconciliation,
verified recovery evidence, bounded rollback rehearsal and protected approval.
See [seat implementation and verification](../../../docs/qa/optional-student-seats.md).

`20261016173613_tenant_self_service_subscriptions.sql` adds the tenant onboarding
and subscription milestone. It uses a timestamp filename to avoid taking the
reserved C1 version below. The existing security-install tip and top-level
checksum manifest remain unchanged. Before release, resolve canonical ordering
with other prepared work, reconcile the hosted catalog, review recovery evidence,
and rehearse the approved migration in one bounded rollback-only transaction.
See [subscription reconciliation](../../../docs/qa/tenant-subscription-reconciliation-2026-10-16.md).

`20261016223500_pricing_catalog_and_test_tenants.sql` follows that subscription
migration. It adds the private, audited catalog operation ledger and exactly two
customer-approved test tenant exemptions. It does not change the active ledger
or authorize applying either migration. See [pricing and test-access review](../../../docs/qa/pricing-navigation-test-access-2026-10-16.md).

`0125_async_tracking_invalidations.sql` implements the first server-scaling
milestone (C1). Recovery is deferred at the customer's request on 2026-10-14.
The current security installation remains limited to reviewed 0123 → 0122 → 0124.
Its exact-tip guard intentionally rejects active migrations after 0124; this PR
does not alter that guard or record 0125 as installed.

Before promoting 0125, finish recovery/security/adoption prerequisites and review
the installation/deployment plan together. Move the reviewed file to the top
level, regenerate the checksum manifest, rehearse it in a bounded rollback-only
transaction, and obtain the protected release approval. Do not invent historical
migration execution. See [C1 implementation and acceptance](../../../docs/qa/async-tracking-invalidations.md).
