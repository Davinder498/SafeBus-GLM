# Notification templates and complete event-path verification

Target: the production-designated BusSafe project, `ckrkfylsyihwouvesypm`.
This change is prepared for review. It has not been deployed and does not prove
notification display on a physical phone.

## Behavior

The private catalog supplies titles and short messages for all nineteen existing
event types. Inbox cards, details and push payloads use the catalog. Pickup/drop-off
copy contains no student names, and generated copy contains no driver names.
Trip labels use the recorded trip name; route and bus labels have readable
fallbacks. Assignment context is limited to the notification recipient, so a
reassigned row cannot expose a replacement driver's bus/route through the former
driver's notification history. Event time appears separately in the recipient's
local timezone.

Both legacy preview modes now use the owner-approved event title and message.
The stored values and RPC signatures remain compatible; no saved delivery choices
are rewritten. Push titles have at most 100 Unicode code points and messages at
most 240, including an ellipsis where shortened. Announcements always use
“School authority announcement” / “A new announcement is available.” in push;
the inbox retains the sender's full original title and message.

Android push remains guardian/driver-only. Administrator exceptions and platform
incidents retain their existing inbox channels. No new automatic traffic/weather
feeds, timetable detection, roles or delivery channels are introduced.

## Initiation repairs

Assignment, student service and guardian access event keys retain fractional
seconds instead of rounding timestamps to whole seconds. Clearing and reporting
a late/missing status again uses a distinct timestamped occurrence for guardian,
administrator and driver recipients. Unchanged status/reason retries stay silent.
The access trigger ignores preference-only changes. Revocation still cancels
pending student-specific push work. The guardian access notification trigger is
renamed to run after the existing link preference inheritance trigger. A newly
linked student can therefore produce the access notification's push for an already
opted-in guardian, without enabling any previously disabled category.

The claim worker also reclaims eligible expired processing leases. A worker crash
after claiming no longer strands those alerts indefinitely. Reclaimed work receives
a new owner; the old worker cannot resolve it. An expired fifth attempt becomes a
terminal failure through a bounded update instead of an endless processing state.

The shared inbox authorization helper now explicitly checks the current session,
recipient MFA and administrator MFA as well as existing ownership and current
access. These checks also protect detail requests made outside the browser's
route guard. Sign-in retains a validated local notification destination so a
notification tap is not replaced by dashboard navigation.

## Local verification

`notification-templates-postgres.test.mjs` uses embedded PostgreSQL and the
read-only hosted function snapshot. It creates source trip, pickup/drop-off,
operational-status, exception, driver-assignment, student-service and access
changes through their actual notification triggers; it calls the announcement
and backend incident RPCs. It does not insert notification records as its event
source. The matrix verifies all nineteen event types, sibling deduplication,
multiple devices, approved copy, exact announcement previews, queue claims,
final eligibility resolution and completion with a mocked provider.

Further cases exercise opt-outs, category choices, device permission/staleness,
expired links, inactive students/accounts, school authority suspension, platform
privacy rejection, quiet hours, quotas, access changes after claim, transient
provider recovery, permanent payload errors, invalid tokens and provider
configuration incidents. The protected rollout helper is exercised against
real embedded transactions, including exact rollback restoration and ACLs.
Browser/native coverage checks titles, separate timestamps, pending destinations,
foreground inbox invalidation, authorized details and unavailable notifications.

No local test can send notifications, and no production fixtures were written.
The focused suite passed all 24 database cases. The browser checks passed fourteen
web cases and four mobile-entry cases; native registration/listener tests and
sign-in/MFA return-path checks also passed. Screenshots were visually inspected.
`pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` and
`pnpm migrations:verify` passed locally. Record the exact final suite totals in
the pull request. These results do not establish hosted rollout or phone receipt.

## Reconciliation and protected rollout

The new forward migration is
`supabase/migrations/pending/20261027120000_notification_templates.sql`.
Its manifest is `config/pending/notification-templates.json`. Nine existing
definitions and their effective ACLs were captured from BusSafe using a read-only
transaction with five-second statement and one-second lock timeouts and final
rollback. The migration checks their normalized definition hashes before replacing
them and adds three private copy helpers. It also checks the three related trigger
definitions and enabled states before renaming the access trigger; recovery retains
and verifies that ordering change. The active migration chain and previous
release manifests are unchanged. The recorded baseline must be rechecked at release.

After human review and merge, run **Release notification templates** for the
exact reviewed current main SHA. The workflow reuses the existing protected
production environment, validation workflow, deployment lock, verified database
CA, recovery public key and Firebase validation-only tooling.

1. Use `rehearse` with `REHEARSE_NOTIFICATION_TEMPLATES` to reconcile the baseline,
   apply the bounded function changes inside a rollback-only transaction and
   confirm restoration in a separate read-only transaction. Capture encrypted
   function recovery and retain it as a restricted workflow artifact.
2. Use `install` with `INSTALL_NOTIFICATION_TEMPLATES` for the approved release.
   It captures fresh recovery, uploads it before persistent changes, deploys the
   reviewed dispatcher and validates Firebase without sending a message. It
   rechecks the recovery checksum, commit/run/target binding and one-hour freshness,
   rehearses again, and atomically applies the bounded migration. Recipient
   preference digests and existing ACLs must remain unchanged.
3. Verify the twelve installed definitions and private-helper privileges. An
   already installed state is verified without replay; partial installation,
   changed code or widened existing privileges fail closed. Existing-state
   evidence never claims a pre-change backup or installation origin.
4. Release the matching web bundle and signed Android bundle using their existing
   reviewed workflows. A database-only release does not update packaged mobile
   inbox presentation. Inspect live scheduler/worker health and the next normal
   authorized event; do not replay old queues or create QA announcements.

The new hosted rehearsal, persistent rollout, matching client releases and
physical-device verification remain pending human review. Firebase acceptance,
Android display on a locked phone, and tapping to the correct inbox item must be
recorded separately. Include both a currently signed-in device and a device that
requires sign-in/MFA. Never describe a mocked provider or validation-only response
as proof of device receipt.

## Rollback

The encrypted recovery contains exact pre-change definitions, ACL evidence and
`restoreSql`. Decrypt privately using the established recovery tooling and apply
only through the protected production workflow. The reviewed
`notification-templates-rollback.sql` also records this captured baseline for
inspection; it is not evidence of an executed restore or a full database backup.
Restore the prior web/Android artifacts separately. Rollback does not alter saved
preferences, devices, notification history or outboxes and sends no notifications.
