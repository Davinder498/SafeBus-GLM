# Recipient preferences and prompt scheduled email

The owner directed that guardians and drivers control their own notification
preferences. The removed school-authority controls still blocked the live delivery
pipeline. This change retires those preference gates without updating any saved
recipient preferences, devices, notification history, or existing queue rows.
Platform privacy rejection, active-account and recipient authorization, linked
student consent, category choices, Android permission, quiet hours and delivery
quotas remain. The retained legacy policy columns no longer determine recipients'
email/push choices. Old administrator mutation RPCs keep their signatures and
authorization checks but reject attempts to change recipient delivery policy.

Prepared migration:
`supabase/migrations/pending/20261026171535_recipient_notification_delivery.sql`.
Its thirteen function definitions were reconciled with BusSafe, not reconstructed
by replaying old migrations. The normalized definition hashes in
`config/pending/recipient-notification-delivery.json` reject a different baseline.
The prior definitions are retained in the embedded-test fixture and explicit
rollback SQL. Existing public API grants, RLS and account roles are unchanged.

## Email dispatch

The existing production email provider, sender and server credentials already
work. The measured delay was in the scheduled queue: a recent email waited 137
seconds for collection and the provider accepted it in under one second.

The owner subsequently requested a ten-second interval. Netlify cron uses
minute precision and scheduled functions have a thirty-second execution limit.
The scheduled entry point now runs every minute, drains the first batch, and
starts a background worker for the remaining checks at 10, 20, 30, 40 and 50
seconds. The background worker awaits each timer and batch; it skips missed
slots after a slow batch and expires at the original minute boundary instead
of catching up in a burst. A batch already in progress may finish afterward.
Each batch retains the same claim/resolve checks, provider idempotency keys,
leases, rate limits and recipient opt-outs. No database scheduler is changed.

The handoff uses Netlify's runtime-provided URL, HTTPS without redirects, and
a short-lived, purpose-specific HMAC signed using the existing server-only
Supabase credential. It transmits only the start time and signature, never the
credential. The background endpoint rejects unsigned or tampered payloads,
non-POST requests, expired retries and future timestamps. Repeated valid calls
remain subject to database leases, recipient eligibility and quotas. The manual
HTTP endpoint retains its separate secret requirement. No new credentials,
Vault entries, database webhooks or signed-in browser are required.

If background invocation fails, the first batch still runs and the scheduled
function reports an error. Monitor `email_cadence_start_failed` and background
`email_cadence_tick_failed` logs. Successful handoff returns HTTP 202, which
confirms acceptance only; inspect worker tick logs for actual processing.
An expired platform retry exits without dispatching. There is no detached
timer or self-invoking perpetual worker.

Eligible email normally waits approximately zero to ten seconds for collection,
followed by worker/provider processing. Scheduler jitter, slow batches, retries,
rate limits and mailbox processing can add delay. This is a polling target,
not a ten-second mailbox delivery guarantee.

Netlify Background Functions must be supported by the deployment's plan. The
bounded worker adds up to fifty seconds of function lifetime per minute, even
with an empty queue, so account for that compute usage during release review.
The existing published deployment has not been changed or used to test this
worker. Confirm background packaging and the next normal event's tick logs
after a separately authorized release. Do not send QA notifications.

Platform references: [Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/),
[Background Functions](https://docs.netlify.com/build/functions/background-functions/),
and [runtime environment variables](https://docs.netlify.com/build/functions/environment-variables/).

## Protected release and rollback

The existing BusSafe production project is the approved database target. Keep
the recipient-preference migration pending until human review and the protected
release workflow. The email interval changes when the existing Netlify schedule
and background worker are deployed. Nothing in this change requires new email credentials. Do not push
or merge this local work without the owner's subsequent instruction.

Before persistent rollout, retain independently verified recovery evidence and
reconcile the thirteen function hashes again. Do not invoke a production worker
as QA, backfill missed push rows, replay historical events, alter personal choices
or send test mail. Observe the next normal, authorized event and distinguish
queueing, provider acceptance and receipt. Physical-device push display requires
separate observation of a normal authorized event.

For approved rollback, restore the thirteen prior definitions using
recipient-notification-delivery-rollback.sql in one reviewed transaction, and
restore the previous Netlify schedule in the same release. Neither direction
updates personal preferences or historical delivery records.

## Validation evidence

Embedded PostgreSQL executes the forward functions with the old authority
channel switches off. It checks guardian and own-trip driver delivery, later
personal opt-outs, category opt-outs, expired guardian links, privacy rejection,
Android permission, cross-tenant trip rejection, quiet hours, quotas, retired
administrator mutations, baseline drift rejection and the explicit rollback.
The tests use synthetic local records and cannot send network requests.

The final migration contains only the thirteen reconciled function replacements.
It was rehearsed against BusSafe with a five-second statement timeout, one-second
lock timeout and final ROLLBACK. The old preference gates were absent inside the
transaction; a separate read-only check confirmed restoration afterward. The
migration adds no wakeup table, webhook function or trigger. Existing data and
notification queues are not modified, and no real notifications were sent.

The recipient-preference version passed pnpm typecheck, pnpm lint, pnpm build,
pnpm test and migration verification, including the four recipient-delivery
database cases and all 365 release checks. The ten-second worker additionally
has local tests for cadence, slow batches, failed handoff, transient failures,
signature verification and expired retries. All fourteen worker/scheduler tests
passed. Netlify CLI's local function build produced a manifest with
`guardian-notification-email-background` in `background` invocation mode; the
signing helper is bundled as a private import rather than a function endpoint.
Validation records local behavior, not production deployment or real-email receipt.

The final ten-second version also passed pnpm typecheck, pnpm lint, pnpm build
and pnpm test: 647 web tests, two mobile tests and 365 release checks. The
existing modified Play Store feature graphic was restored after asset generation.
