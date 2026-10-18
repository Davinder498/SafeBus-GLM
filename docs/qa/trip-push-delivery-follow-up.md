# Trip updates and Android push follow-up

## Observed production state, 2026-10-18

Read-only inspection confirmed that the latest guardian trip start generated two
child-specific inbox rows for one source event and two linked students. The hosted
`safebus_private.notify_trip_audience` function still selects the guardian/student
pair and uses a student-specific deduplication key. The trip eligibility helper
and versioned email claim RPC from PR #287 are absent. Merging application code
did not apply the prepared database release.

Both registered Android devices have permission granted. The approved tenant's
external notification master is enabled, but both its Android push switch and
saved push preference are disabled. No push outbox rows were created in the past
seven days. The one-minute push scheduler is active; registration and scheduler
activity alone do not prove Firebase delivery or phone display.

The mobile configuration also omitted foreground presentation. This follow-up
sets Capacitor PushNotifications `presentationOptions` to `alert` and `sound`.
The installed Android plugin uses `alert` to post the received notification while
the app is open. Its existing receive listener continues to refresh the inbox.
Existing channel importance, private previews, consent and permissions apply.
See the [Capacitor foreground presentation documentation](https://capacitorjs.com/docs/apis/push-notifications#push-notifications-appearance-in-foreground).

## Release and acceptance

1. Complete the reviewed database release described in
   [trip-updates-and-email-worker.md](trip-updates-and-email-worker.md). Its pending
   migration is `supabase/migrations/pending/20261018032558_guardian_trip_notification_deduplication.sql`.
   Reconcile the hosted definitions, collect recovery evidence, rehearse in a
   bounded rollback-only transaction, and use the protected approved workflow.
   Do not bypass this process with a direct production SQL write. No new migration
   is required for the foreground configuration change.
2. Confirm the hosted trip audience now selects distinct guardian profiles,
   supplies a null student id for trip-wide notices, and uses `:guardian_trip` in
   the deduplication key. Verify that
   `safebus_private.guardian_trip_notification_is_eligible` and
   `public.claim_guardian_notification_email_batch_v2` exist. Existing duplicate
   history remains unchanged; evaluate a new normal trip event after release.
3. In the affected tenant's **Settings > Notifications > Android push**, enable
   Android push through the existing tenant admin control. Preserve each person's
   opt-in, category, child-link consent and quiet hours. Do not globally enable
   tenants or replay the historical notification queue.
4. Human-review and merge the foreground fix, then build and distribute a new
   Android app through the existing protected Android release process. A web
   deployment alone does not update Capacitor configuration in an installed app.
5. With the customer's own authorized phone and normal service activity, verify
   a new trip start produces exactly one guardian update when two linked children
   share that service. Child pickup/drop-off updates remain separate. Confirm the
   push outbox becomes eligible and records provider acceptance; inspect sanitized
   failure categories if it does not. Provider acceptance is not proof of display.
6. Verify separate events with the phone locked, unlocked with SafeBus in the
   background, and SafeBus open. Confirm one Android notification, its generic
   preview, inbox refresh, and tap destination. Default-importance trip channels
   need not show a heads-up banner; the user controls lock-screen visibility,
   channel settings and Do Not Disturb. Check denial, disabled category and
   revoked guardian access prevent external delivery. Do not send QA notifications
   to unrelated users or claim phone delivery from automated mocks.

Neither the database release, tenant switch, new installed Android build nor
physical-device acceptance was performed as part of this follow-up implementation.
