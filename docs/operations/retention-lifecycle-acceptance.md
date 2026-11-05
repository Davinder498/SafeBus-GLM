# Approved retention lifecycle — 5 November 2026

Implementation of the owner's approved 30/395/90-day schedule. Prepared code is
not evidence of installation or authorization to bypass the protected release.

| Record | Routine expiry |
| --- | --- |
| Bus GPS samples | 30 days after both recording and receipt |
| Pickup/drop-off, trip exceptions and operational statuses | 395 days after the trip ends; late received records receive 395 days from receipt |
| Standalone authority announcements | 395 days after explicit resolution; unresolved records do not expire |
| Personal inbox copy | 90 days from creation, after dependent delivery records expire |
| Email and push delivery record | 90 days after its terminal outcome; queued, leased and pending records do not expire |

No third-party weather/traffic feed or provider history is introduced. Existing
manual weather/traffic exceptions follow the event schedule. Student, guardian,
driver, audit, invitation and account deletion schedules are not approved by this
change. The legacy general-purpose deletion engine remains dry-run only.

## Acceptance by role

| User | Behavior |
| --- | --- |
| School authority admin | List, preserve, review and explicitly release their authority's trip records; resolve standalone announcements. Mandatory MFA; recent sign-in for mutations and archive access. |
| Transportation admin | Same within their authority. |
| School-scoped admin | Retired role remains denied. No new access. |
| Guardian | Existing linked-student visibility and preferences; no preservation or archive access. |
| Driver | Existing assigned-trip operations and preferences; no preservation or archive access. |
| Platform admin | Operational aggregate monitoring only; cannot browse customer preservation cases or GPS archives. |
| Worker | Service-only bounded retention/archive operations. No recipient notification or payment. |

Preservation captures a selected trip/time window and an opaque case reference,
reason, review time and minimum retention time. Do not enter child names, health,
custody or incident narratives. A review date never releases a hold. Decision use
adds one calendar year in America/Edmonton to the minimum; longer authority
requirements can be entered. This is an implementation floor, not a legal
classification or assertion that every authority's obligations are identical.
A hold must be created before routine deletion; deleted history cannot be restored.

GPS archives contain only the selected samples. AES-256-GCM uses a dedicated
server-only versioned key. Upload, read-back, digest and decryption checks must all
pass before coverage is marked verified. Missing keys, upload failures, late GPS
and unverified chunks retain originals. Operational events remain protected in
the database. Explicit release permits normal expiry after all overlapping holds
and minimum dates permit it; encrypted archive copies are then removed by the
worker. Review actions can extend a hold but cannot shorten its minimum.

Every source delete, including foreign-key cascades, checks its own expiry and
holds. GPS samples are append-only. Shared transaction locks coordinate source
writes with exclusive preservation/retention operations. Batches cap each class
at 500 rows and leave queued delivery children intact. Repeated runs converge;
no archive is treated as verified based solely on an upload response.

## Rollout and evidence

Keep the installed destructive master control disabled while preparing and
reviewing this migration. The new worker has its own execution flag, defaulting
to dry-run, in addition to the database master control. Installing code does not
enable deletion. Configure a private archive bucket and dedicated encryption
keys through server settings; no credential values belong in Git or the browser.

Before enabling: reconcile hosted definitions/FKs/triggers, rehearse the forward
DDL and its rollback, retain encrypted recovery, obtain human merge and protected
release review, confirm an archive read-back and scoped acceptance against the
installed schema, and verify an initial dry-run. Record actual deleted/blocked
counts and backlog age. Do not represent fixture tests as production acceptance.

## Release instructions

The pending manifest is `config/pending/retention-lifecycle.json`. The existing
**Release operational fix** workflow now offers `retention_lifecycle`. After
human review and merge, dispatch `rehearse` for the exact current main SHA, inspect
its reconciliation/restoration evidence, then dispatch protected `install` for
that same reviewed SHA. The workflow binds BusSafe, verifies the SQL digest,
creates encrypted recovery and restores its bounded rehearsal before installing.
It deliberately leaves the destructive database master control disabled.
Restoration refuses to drop preservation data, resolved-announcement dates or
nonempty evidence storage. Once cases exist, use a reviewed forward repair.

The migration creates a private `retention-evidence` bucket with a restrictive
client denial policy. Only server Storage operations may read ciphertext. The
server downloads and decrypts evidence only after the caller's own JWT authorizes
that authority's case, MFA and recent authentication. No bearer download URL is
issued. Downloads filter the samples to the requesting case window.

Configure Netlify server-only `SAFEBUS_RETENTION_ARCHIVE_KEY_ID` and
`SAFEBUS_RETENTION_ARCHIVE_KEYS` (JSON mapping version IDs to independent random
32-byte base64 keys). Retain old key versions while any corresponding archive
exists. Keep recoverable encrypted key custody outside Git, logs and customer
support tickets. Never derive an evidence key from a Supabase or email API key.

`retention-lifecycle-scheduled` runs each minute, up to four bounded batches per
invocation and a single archive/remove operation. `SAFEBUS_RETENTION_LIFECYCLE_EXECUTE`
defaults off, independently of the protected database master switch. First verify
installed dry-run results and archive configuration; then activate both controls
through a reviewed protected change with the actual approval reference. The old
`SAFEBUS_RETENTION_EXECUTE` flag no longer activates the unscoped inventory runner.

Watch `retention_lifecycle_completed` counts, `saturated` and archive results;
saturation indicates more eligible rows remain and requires a throughput check.
Failures send the existing fixed operations email with six-hour deduplication.
No arbitrary provider message, child identity, reference or GPS enters logs/mail.
The code does not prove missing-invocation detection, large-fleet capacity, inbox
delivery of an alert, or production deletion acceptance.

Cleanup waits for release, the archive lease and a cooldown. Before external
removal it reserves disposal under the same database lock used for holds. New
preservation for that trip is rejected during removal. A small tombstone permits
daily repeat removal for 395 days to catch delayed uploads; sample IDs/coverage
are cleared after removal. All active preservation requests for a trip keep its
archives available, including evidence archived under an earlier case.

Trip, dispatch, credential/session, student/account, supplier and backup disposal
outside the scoped source events is not silently activated by this migration.
The full launch/legal/operating acceptance remains a separate decision.

Each committed execution updates an hourly database aggregate in the same
transaction as its deletes. `retention_archive_work('status')` is service-only
and exposes the latest aggregate for operations, without source IDs or payloads.
Lost HTTP responses cannot erase completion evidence; retries add zero for rows
already removed. Dry-runs do not write these totals. Aggregate windows expire
after 395 days. These totals also prevent a schema-only rollback from pretending
to undo an execution that already removed data.
