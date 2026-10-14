# Prepared migrations

SQL here is reviewed source for a future protected release. It is deliberately
outside the active top-level migration manifest and deployment traversal. Never
apply these files directly or replay the migration chain against BusSafe.

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
