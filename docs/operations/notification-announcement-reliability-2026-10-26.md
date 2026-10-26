# Announcement recipients, Android delivery, and recipient navigation

Prepared on `codex/notification-announcement-reliability`. This work is not a
production deployment or evidence of notification receipt on a locked phone.

## Findings and changes

- BusSafe's active guardian has two active, unexpired links to active students
  without a school assignment. The announcement helper joined every student to
  an active school, excluding this guardian even from authority-wide sends.
  The forward migration requires a matching active school only for a school-scoped
  send. It retains active profiles, authority boundaries, active guardian/student
  records, unexpired links, and the existing school-admin authorization boundary.
  The same helper governs preview, send, inbox access, and delivery eligibility.
- The deployed `push-notification-dispatcher` used normal Android transport
  priority except for urgent alerts. All dispatched messages already carry a
  system-visible notification payload; they now request high transport priority
  so routine updates and announcements can arrive during Doze. Alert severity,
  Android channel selection, private lock-screen previews, personal preferences,
  quiet hours, quotas, and worker authorization are unchanged.
- MFA management at `/account/security` uses the normal role shell for both
  guardian and driver. Required sign-in verification at `/mfa` keeps its separate
  authentication shell. The standalone authentication wordmark follows the
  header theme. MFA enrollment and removal verification are unchanged.
- The guardian app bar omits its notification bell; the navigation destination
  retains its unread badge. The driver's notification shortcut remains available.
- An opened notification replaces its corresponding inbox card while its detail
  is visible. Other inbox entries remain available. Announcement titles and full
  messages appear in the detail and inbox. The inbox refreshes in the background
  when the notification provider's unread count changes, retaining inline expansion.
  Existing read, unread, archive, category, and preference handling is reused.

Firebase documents that normal-priority messages can be delayed in Doze and
recommends high priority for timely user-visible notifications:
[Android message priority](https://firebase.google.com/docs/cloud-messaging/android-message-priority).
The existing notification-plus-data payload lets Android display background
notifications without a running JavaScript listener:
[Android message receipt](https://firebase.google.com/docs/cloud-messaging/android/receive-messages).

## Hosted reconciliation and rollback rehearsal

Approved target: production-designated BusSafe, `ckrkfylsyihwouvesypm`.
Read-only checks used five-second statement and one-second lock timeouts and final
`ROLLBACK`. No account IDs, names, tokens, or notification message contents are
recorded in this evidence.

The current function is
`safebus_private.announcement_recipients(uuid,uuid,text,uuid)`.
Its normalized `md5(replace(pg_get_functiondef(...),chr(13),''))` is
`70d7a9d09f179581918c789c3692deb9`. The forward migration rejects baseline drift.
The exact prior function is retained in
`docs/operations/announcement-guardian-school-scope-rollback.sql`.

Enabled DDL hooks were inspected before rehearsal. The schema reload hook uses
transactional NOTIFY; extension-specific hooks do not perform notification delivery
for this function replacement. The only DDL is replacement of this existing private
helper, preserving its ACL. No table writes, identity changes, fixture inserts,
worker invocations, historical event replay, or external notifications are needed.

The bounded hosted transaction installed the forward helper, checked current
authority-wide recipients and privileges, and ended with `ROLLBACK`. It returned
one guardian and one driver; both anonymous and authenticated direct execution
remained denied. A separate read-only transaction confirmed restoration of the
original normalized function hash. This rehearsal left no persistent schema change.

The existing push outbox contained 32 provider-accepted records and two historical
failures (`UNREGISTERED` and `PERMISSION_DENIED`). Those statuses do not prove device
display. The deployed source confirmed the normal-priority behavior. No provider
credentials were requested or changed. Existing security advisories were read;
the private announcement history deliberately has no direct browser RLS policies.

## Review, release, and remaining verification

The generated forward migration remains pending:
`supabase/migrations/pending/20261026194051_announcement_guardian_school_scope.sql`.
Do not replay the migration chain or backfill old announcements. Apply only through
the existing protected adoption/release workflow after human review, fresh baseline
reconciliation, and verified recovery evidence. The captured function and successful
rollback rehearsal are recovery evidence for this helper, not a claim of a complete
database backup restore.

The release needs all three artifacts: the forward database helper, the updated
Supabase push dispatcher, and the web/native UI bundle. A client-only deployment
cannot repair audience counts or the server's Android message priority. Existing
opt-ins and valid Android permissions remain necessary. Do not send real messages
as QA or replay historical outboxes. Observe the next normal authorized event after
release, distinguishing queue creation, provider acceptance, and actual display
on a locked phone. Locked-phone receipt remains unverified until that observation.

Rollback restores the prior helper with the recorded rollback SQL and redeploys
the prior dispatcher/client artifacts through the same protected workflow.
It does not change personal preferences, devices, existing announcements, or rows.

## Validation

Embedded PostgreSQL reproduces school-less active student links, verifies one
canonical notification and one email/push outbox per eligible guardian despite
multiple links and retries, and keeps school-admin audiences restricted. Existing
coverage checks other-authority denial, expired/revoked access, recipient opt-outs,
driver scope, active sessions, and MFA. The forward baseline guard and explicit
rollback/re-adoption are also exercised locally.

Android payload tests cover informational trip, pickup, assignment, and announcement
events. Browser checks cover both role shells, MFA verification/removal, guardian
navigation without a top bell, one-card announcement deep links, normal read/unread
and archive actions, and WCAG A/AA checks. Fixtures are local and network-blocked.
`pnpm test` passed with 654 web tests, two mobile tests, and 365 release checks.
The final rollback/re-adoption regression also passed in a focused rerun.
All fourteen website checks and twelve selected native browser checks passed
across the runs. One stale guardian-bell assertion was corrected; two browser
checks timed out in concurrent runs and passed on focused reruns.
The final announcement checks also verify inbox arrival after a push-received
event without reloading the page. Typecheck, lint, build, and migration verification
are recorded in the pull request. Screenshot inspection confirmed the guardian
MFA shell and single announcement detail card.
