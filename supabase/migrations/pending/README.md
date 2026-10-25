# Prepared migrations

SQL here is reviewed source for a future protected release. It is deliberately
outside the active top-level migration manifest and deployment traversal. Never
apply these files directly or replay the migration chain against BusSafe.

`20261025183313_authority_directory_search_aliases.sql` corrects authority search
with reviewed common names, token matching, and relevance ordering before the
20-result limit. It retains source names, account associations, and contacts.
The forward correction remains unapplied. See the
[search audit](../../../docs/qa/authority-directory-search-audit-2026-10-25.json).

`20261025155815_authority_reference_directory.sql` adds platform-only reference
search, optional authority associations, atomic reviewed onboarding support, and
address-aware support RPCs. `20261025160733_alberta_authority_reference_import.sql`
is the reviewed initial 445-record official source snapshot (extract date
2026-10-24). Install schema before data and both before the new clients through
the protected promotion/release process. Existing launch-ready notification
defaults remain a release prerequisite; the new finalizer delegates existing
provisioning rather than replacing it. The source files remain here for release
accounting. A later read-only observation on 2026-10-25 confirmed the directory
table, search RPC, and matching 445 records are present on BusSafe; this observation
does not establish how those objects were released. The new search-alias correction
above remains unapplied.
See [directory operations and release](../../../docs/operations/authority-reference-directory.md).

`20261024203929_launch_ready_notification_defaults.sql` implements the owner's
standard launch behavior for new school authorities. The existing tenant trigger
provisions notification availability automatically, without a manual approval
for each new account. It also repairs only the identified Test School District
policy while it still matches the old pending defaults. Existing pauses,
rejections, recipient choices and limits are preserved. Embedded PostgreSQL
tests and a bounded rollback-only rehearsal against the reconciled hosted schema
passed. This is prepared source, not a persistent installation. See
[the owner direction and verification](../../../docs/operations/notification-privacy-approval-2026-10-24.md).

`20261024014838_official_invitation_origin.sql` adds only the owner-approved
`https://safebus.kids` origin to the invitation allowlist, preserving all existing
entries. This corrects the official-domain configuration mismatch observed on
2026-10-24. It remains unapplied. See the
[onboarding review and release checks](../../../docs/qa/school-authority-onboarding-review-2026-10-24.md).

`20261017161907_stable_qr_reprints.sql` adds encrypted private copies for authorized
reprinting of the same active student and bus QR codes. Existing hash-only codes
stay valid and can be recovered from a matching original image; downloads never
rotate them. The original issuer signatures remain compatible. Release only
after Vault privilege/key checks, hosted reconciliation, recovery evidence,
rollback rehearsal and protected approval. See
[data downloads and stable QR reprints](../../../docs/qa/data-downloads-and-qr-reprints.md).

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
