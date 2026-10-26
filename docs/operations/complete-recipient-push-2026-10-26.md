# Complete recipient-controlled Android push delivery

Owner scope: remove school-authority notification switches from the app and
database; guardians and drivers own their preferences. This change preserves
personal opt-outs, Android permissions, quiet hours, active-account and trip/link
authorization, platform privacy rejection, rate limits, and delivery quotas.

## Live findings

BusSafe's guardian had personal and category push enabled and an active permitted
device. An obsolete authority-wide `push_notifications_enabled=false` gate prevented
queue creation. The driver also had personal category push choices off; those choices
must not be changed by rollout. The live minute scheduler returned HTTP 200.

The reviewed high-priority sender from PR #319 had not reached Supabase. Its protected
deployment run failed with HTTP 401 `Invalid access token`; both GitHub and the local
deployment credential were invalid. The owner renewed the GitHub production
`SUPABASE_ACCESS_TOKEN`. The failed job was rerun through the same protected workflow
and succeeded after the owner's production approval:
https://github.com/Davinder498/SafeBus-GLM/actions/runs/40403268990
The hosted source was retrieved and confirmed to use `HIGH` transport priority for
ordinary and urgent notifications. This sender deployment does not remove database gates.

## Implementation

The new migration replaces ten reconciled delivery functions and drops:

- `guardian_notification_delivery_policies.notifications_enabled`
- `guardian_notification_delivery_policies.push_notifications_enabled`
- `guardian_notification_delivery_policies.push_delivery_preference_enabled`
- `get_tenant_notification_settings()`
- `set_tenant_notification_delivery_enabled(boolean)`
- `set_tenant_push_notifications_enabled(boolean)`

The unused frontend authority-settings service and interface are removed, and the
retirements are recorded in the pending rollout contract. Historical migrations,
rollback evidence, and historical fixture tests remain intact. Canonical generated
database types continue to describe the hosted schema until the approved installation;
refresh them from production with the existing protected type-generation workflow
after rollout, and promote the three recorded RPC retirements in the authorization
manifest after hosted verification. Active audit metadata is not edited to pretend
a pending change is deployed.

The policy table retains platform privacy status and approval evidence, quotas, and
its existing RLS. Its approval constraint requires an approval timestamp whenever
privacy status is approved. The old boolean switches no longer control that constraint.
All ten changed delivery functions explicitly require an active school authority;
removing the old switches cannot turn a suspended account into an eligible sender.
Nothing enables a recipient category, enrolls a person, changes a device permission,
replays old notifications, or turns rejected platform privacy into approval.

The native bridge waits for Firebase's registration callback AND successful database
token registration before an enable/refresh call succeeds. It reports registration
failure, missing session, denied permission, and timeout. Duplicate refresh requests
share one pending registration; token writes are serialized. Disabling/signing out
cancels pending registration, waits for token persistence before revocation, and
ignores subsequent callbacks. This prevents permission alone from being reported as
successful phone registration.

Every dispatched notification uses high Android transport priority, the existing
notification-plus-data payload, stable collapse/tag keys, and private previews.
Android displays the background notification through Firebase/Capacitor without a
running JavaScript listener. Tapping opens the matching standard inbox entry.
The durable worker retains claim/resolve authorization checks, leases, retries,
invalid-token handling, quota enforcement, and idempotent enqueueing. The existing
scheduler checks once per minute; provider, OS, quiet-hour and retry delays can add
latency. No continuous app process or battery-permission bypass is introduced.

The protected sender endpoint now accepts `mode: "validate"` behind the existing
dispatcher secret. It selects a registered device and calls Firebase with
`validate_only: true`. It never claims a queue row, sends a notification, or returns
the token. This checks OAuth credentials, messaging authorization, project/token
compatibility, and payload acceptance without messaging real people as QA. Sanitized
failure category/code identify configuration versus device-registration failures.

References: [Firebase message validation](https://firebase.google.com/docs/reference/fcm/rest/v1/projects.messages/send),
[Android message priority](https://firebase.google.com/docs/cloud-messaging/android-message-priority),
[Capacitor Android push](https://capacitorjs.com/docs/apis/push-notifications).

## Protected rollout

Forward SQL:
`supabase/migrations/pending/20261026212046_complete_recipient_push_delivery.sql`.
Target and digest: `config/pending/complete-recipient-push.json`.

This supersedes the earlier prepared recipient-delivery migration
`20261026171535_recipient_notification_delivery.sql`; do not install both sequentially.
The earlier file remains as reviewed history and a fixture-test input. If it has
already been installed, reconcile the new forward change again; the old-baseline
guard deliberately refuses to proceed.

After human review/merge, run **Release recipient-controlled push delivery** on the
exact current main SHA. It uses the existing production environment and schema
operation lock, retaining the human reviewer gate and single approved BusSafe target.
No existing global production guards or migration checksums are weakened.

1. Validate the reviewed commit and all normal code checks without database credentials.
2. Verify the Supabase deployment credential can access BusSafe before schema changes.
3. Capture current function definitions/effective grants, column defaults/nullability,
   old switch values, and the approval constraint. Rehearse the single forward migration
   with five-second statement/one-second lock timeouts and final rollback. Verify
   restoration in a separate read-only transaction and unchanged recipient preferences.
4. Encrypt the bounded recovery snapshot and executable restore SQL using the existing
   owner RSA backup public key. Upload that artifact BEFORE persistent changes.
   The evidence is bound to project, reviewed SHA, workflow run, migration digest,
   snapshot digest, and encrypted-file digest. This is recovery for the bounded change,
   not a claim of a complete database restore or invented vendor/legal evidence.
5. Deploy the reviewed sender; run its Firebase validation-only probe using the existing
   Vault dispatcher secret. Deployment or provider failures stop before database changes.
6. Recheck the recovery snapshot and rehearse again. In one bounded transaction, lock
   only the policy table, replace the functions, remove the switches/RPCs, verify the
   resulting schema and unchanged personal preferences, and commit.
7. Retain sanitized installation evidence. Use the existing Android release workflow
   to distribute the updated registration bridge, and the existing type-generation
   workflow to refresh canonical hosted types. Do not merge those PRs automatically.

### Existing-installation reconciliation

Run [40410993809](https://github.com/Davinder498/SafeBus-GLM/actions/runs/40410993809)
passed code validation and deployment credential verification, then stopped while
capturing the old baseline. Subsequent read-only inspection found all three columns
and RPCs already absent. All ten live delivery definitions matched the reviewed SQL
exactly after normalizing only the final statement terminator and line endings.
Anonymous/authenticated direct execution of those functions remained denied. This
run did not establish when or how the schema change was installed and did not retain
a pre-change recovery artifact. Do not describe it as a successful protected install.

The repaired workflow distinguishes two complete states. An unchanged legacy state
still requires encrypted recovery and rollback rehearsal before applying any SQL.
An already installed state is accepted only after exact function-definition matching,
the approved privacy constraint, zero old switches/RPCs/gates, closed execution
permissions, and RLS on all six delivery/preference tables are verified. Partial
installation, changed definitions, or widened permissions fail closed.

The existing-state path uses read-only transactions, writes an observation artifact
with `sqlApplied: false` and `preChangeRecoveryCreated: false`, deploys and validates
the reviewed sender, then rechecks the exact installed definitions. It never replays
the migration, reconstructs a fictional backup, or restores old switches merely to
make rehearsal pass. Installation provenance/recovery evidence remains a separate
unestablished fact until supplied by the original rollout. Failures report fixed
diagnostic codes without raw SQL, provider responses, rows, or credentials.

The install mode confirmation is `INSTALL_RECIPIENT_PUSH`; rehearsal-only mode uses
`REHEARSE_RECIPIENT_PUSH`. Both operate only on reviewed main in the protected
production environment. No arbitrary SQL path, migration replay, reset, fixture writer,
or historical outbox backfill is accepted. The encrypted snapshot contains recovery
material and must remain in restricted artifacts, not public repository files.

For approved rollback, the encrypted snapshot contains `restoreSql`. Restore through
the same protected production review process, using the existing recovery tooling to
decrypt privately. It restores column definitions, saved old values, the approval
constraint, prior function definitions, and effective grants. Restore the prior sender
artifact separately. Do not expose plaintext recovery contents in CI logs or chat.

## Verification and remaining receipt evidence

The complete forward change was rehearsed against the actual BusSafe schema with
final ROLLBACK. Inside the transaction there were zero old columns, zero legacy RPCs,
and zero remaining function references to the old gates. Recipient preference digests
were unchanged and authenticated direct execution of the private helper remained
denied. A separate read-only query confirmed all three original columns and the
original enqueue function hash were restored. No fixture writes, real announcements,
external notification sends, personal preference updates, or device changes occurred.

Embedded PostgreSQL verifies canonical notification creation, duplicate suppression,
durable queue creation, real SQL claim/resolve/complete stages with a mocked provider,
high-priority payloads, privacy rejection, and exact bounded rollback/re-adoption.
The protected rehearsal helper itself is tested against real embedded transactions.
Native tests cover confirmed token persistence, failures, timeout/retry, permission
denial, shared registration, stale completions after retry, and disabling while
registration is pending. Firebase
tests verify that validation requests carry `validate_only` and ordinary deliveries
do not. Provider/readiness responses contain no device token.

Local validation: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`, and
`pnpm migrations:verify` passed. The full suite included 659 web tests, 9 mobile tests,
and 365 release tests. After the final registration-race correction, the affected
mobile checks were repeated with 10 passing tests (8 push-registration tests and
2 deep-link tests). The immutable 125-migration chain is unchanged.

Production installation, Firebase validation-only success, and actual locked-phone
receipt must be reported separately. Observe the next normal authorized event after
installation: canonical row, push outbox, worker/provider acceptance, then phone display
and tap into the correct inbox. Never label provider acceptance as device display, or
send a real announcement/test notification as QA. If validation reports Firebase IAM
or project/token rejection, request the specific Firebase access needed at that point.
