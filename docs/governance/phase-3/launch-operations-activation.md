# Retention and application alert activation

This release enables the existing approved retention policy and application alert mode. It does not change retention periods, customer permissions, notification consent, support hours or billing behavior. Support remains Monday–Saturday 06:00–18:00 America/Edmonton, including critical incidents.

## Acceptance

School authority admins, school-scoped admins and transportation admins retain their existing authority/school boundaries. Guardians retain linked-student access and personal notification choices; drivers retain assigned-work access and personal choices. No customer is subscribed or notified as a test. Platform operations alone receives fixed operational alerts through the existing configured mailbox. No new public endpoint or database permission is introduced.

The first activation refuses pending Auth account disposal and any eligible record class beyond expired invitations, tracking sessions and rate-limit buckets. Each class is limited to the existing 500-record batch. Once enabled, the existing scheduler continues applying all approved retention periods and holds as records age. This is ongoing disposal, not a one-time cleanup.

## Protected release

Use **Release reviewed engineering fixes**, current passing main SHA, confirmation `RELEASE_REVIEWED_ENGINEERING_FIX`, `activate_operations=true`, and operations confirmation `ACTIVATE_REVIEWED_RETENTION_AND_ALERTS`. The protected production reviewer must approve the run. Ordinary engineering releases default to no activation.

The workflow checks hosted schema/types/authorization and builds using public configuration only. Before enabling cleanup it verifies the exact BusSafe database and Netlify production site, previews eligible records without writes, creates a fresh encrypted database/roles export, and uploads it as a seven-day recovery artifact. Activation checks the same run/SHA, project binding, age and encrypted file hashes. Eligible records must remain within the reviewed classes and batch bounds, and control settings must remain unchanged.

The database execution switch and two production settings are enabled: `SAFEBUS_RETENTION_LIFECYCLE_EXECUTE=true` and `SAFEBUS_APPLICATION_MONITOR_MODE=alert`. Other deploy contexts remain unchanged. The prebuilt artifact is then published without a Netlify cloud build. Verification requires new committed retention execution totals after activation, not a dry-run response. The outcome artifact retains aggregates and control evidence for 90 days, not customer records.

## Failure and recovery

If activation, publication or verification fails, the workflow attempts to disable the database execution switch and set retention execution false. The database switch blocks new destructive runs even if the hosting change is not yet deployed. An already-running transaction may finish. Pausing does not restore deleted records. A failed pause requires immediate operator inspection; do not blindly retry activation. An arbitrary previous approval reference prevents automatic reactivation. The one reviewed recovery described below is permitted only through another protected release with fresh recovery evidence.

Encrypted logical recovery excludes Storage object bytes and provider secrets. Full restoration has not been demonstrated. Retain the encrypted artifact securely before its seven-day expiry; recovery requires the separately held private key and a reviewed restore procedure. Never restore blindly over production.

Workflow cancellation or runner loss can interrupt cleanup steps. Inspect both controls and scheduled executions before retrying any interrupted run. Do not interpret an uploaded backup as proof of restoration.

## Evidence and remaining acceptance

Legacy notification defaults were repaired in protected run 43580282455 and reread from the hosted database. Retention activation and alert mode are prepared by this change, not claimed live. After release, record the run, published deploy, database control reference and fresh execution totals. Confirm Netlify worker completion logs separately.

Alert mode being enabled does not prove inbox receipt or responder availability. Mailbox delivery remains unverified until actual delivery evidence is obtained. Billing end-to-end testing and leaked-password protection remain deferred by owner direction. Physical-device/source-event acceptance and capacity qualification remain separate open items; this release makes no 5,000–10,000-bus capacity claim.

## Inspected activation failure and bounded recovery — 2026-11-14

Protected run 43583376731 failed before publication. Its outcome artifact
14111927857 (SHA-256 `56ae25bf717bd720ec1ca702b3df735931b429a7ad618eae58ed1f45e3c7982a`)
records the original monitor setting as `observe` for `all`, the mutation start,
and a successful pause. Netlify expanded the production PATCH to four explicit
contexts: production `alert`, preview/branch/local `observe`; its newer
`dev-server` context was empty. The old structural equality guard correctly
stopped rather than overlooking the missing context. Database inspection found
cleanup disabled and no retention execution totals; Netlify logs continued in
dry-run mode. No production artifact was published by this failed run.

The correction explicitly expands an `all` fallback to the five supported
contexts in one PUT, preserving custom branches and overrides. Provider-generated
IDs, timestamps and ordering are not settings; comparisons still require matching
values, scopes and secrecy. No paid scope options are sent.

Recovery is limited to the exact failed run reference and its microsecond approval
timestamp, a disabled database switch, hosting retention `false`, the inspected
monitor values, and zero execution totals. It restores `dev-server=observe`
while cleanup is disabled. Fresh plan, backup and dry-run checks remain required.
Inside the worker lock, activation rechecks absence of executions and atomically
replaces only that prior approval; the old reference remains in retained plan and
activation evidence. An unrelated approval, active cleanup, new execution, changed
context or changed timestamp fails closed. The already-repaired monitor state is
also accepted if recovery stops before database activation. This is not a general
resume mechanism for other failures.
