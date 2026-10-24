# Notification privacy approval — 2026-10-24

The SafeBus owner explicitly approved notification privacy in this session:

> i approve privacy.

The owner subsequently clarified that every new school authority admin must
receive a working app, with no manual privacy activation for each account.
`AGENTS.md` now records that launch requirement. This is approval of the standard
platform notification setup; it does not grant consent on behalf of guardians
or drivers.

## Verified current state

The open SafeBus session displays **Test School Admin**. Read-only checks against
the existing BusSafe production project (`ckrkfylsyihwouvesypm`) confirm that this
active school authority admin belongs to **Test School District**
(`a7033cbe-9bc7-4508-89bd-0a19270a2c15`). Its notification policy currently has:

- `privacy_review_status = 'pending'`
- `privacy_approved_at = NULL`
- `notifications_enabled = false`
- `push_notifications_enabled = false`
- `push_delivery_preference_enabled = false`

These saved values explain the previous “External delivery is locked” banner.
This is an application configuration gate, not a claim that the owner has not
given approval in this conversation.

Verification used `BEGIN TRANSACTION READ ONLY`, transaction-local 5-second
statement and 1-second lock timeouts, and final `ROLLBACK`. No notification
settings, recipients, preferences, queues, or identities were changed. The only
non-internal update trigger on the policy table sets `updated_at`.

## Automatic provisioning fix

The prepared forward change is
`supabase/migrations/pending/20261024203929_launch_ready_notification_defaults.sql`.
It changes the policy defaults used by the existing school authority creation
trigger: notification availability is enabled and the standard policy is already
approved. A new school authority no longer needs a separate platform action.
No approving person is invented: `privacy_approved_by` remains null for the
standard automatically provisioned policy, and the timestamp records provision.

The migration also repairs **only Test School District**, and only if its policy
still matches the old pending, never-approved, disabled state. It preserves its
limits, other school authorities' settings, deliberate pauses and rejected
policies. It does not rewrite personal choices, quiet hours, Android permissions,
identities, queues or previous notifications. Delivery still requires each
recipient's eligibility and choices.

Embedded PostgreSQL checks execute the actual policy table, reconciled creation
trigger and notification-control RPCs with the forward change. They verify new
account readiness, scoped repair, preservation of limits and other accounts,
personal opt-outs, pause/resume and replay, role boundaries, and rollback of an
incomplete school authority creation. They do not use the hosted database.

The exact forward SQL was also rehearsed against the reconciled hosted schema
in one transaction with 5-second statement and 1-second lock timeouts and final
`ROLLBACK`. Inside that transaction, the five defaults changed as intended and
Test School District became ready; an assertion verified that all other school
authority policy rows stayed identical. A separate read-only transaction then
confirmed that the old defaults and target state were restored. No fixtures,
identities, email sends, push sends or persistent schema/data changes resulted.

Runtime checks also confirmed that the public site, sign-in shell, security
headers and map configuration pass the existing health checker. The production
function environment contains the email-provider, sender, Supabase and Stripe
configuration keys used by their shipped handlers. The optional manual email
dispatcher secret is absent; the scheduled dispatcher does not require it and
is configured to run every five minutes. The push Edge Function is active and
its minute-by-minute database schedule is active. Credential presence and these
read-only checks do not establish a completed real-device push delivery or a
new nonzero payment; do not represent them as full launch certification.

**Rollout is not yet complete.** The change is prepared for review, not applied
to the hosted project. After the reviewed rollout, verify a real new-account
journey and delivery configuration before reporting live completion. No further
per-account owner privacy approval is needed.

The separate commercial privacy-readiness evidence file is unchanged because
this request addresses notification setup, not completion of its legal,
supplier, retention, and contract evidence.
