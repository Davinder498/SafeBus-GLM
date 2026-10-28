# Shared pickup and drop-off notification copy

The approved copy includes the student's recorded first and last name, the trip's
bus number and the event's planned stop. Example:

- **Pickup recorded:** Alex Morgan was picked up on Bus 12 at Maple Street.
- **Drop-off recorded:** Alex Morgan was dropped off on Bus 12 at School entrance.

Push, inbox/details and the main email paragraph use the same saved title/body.
Email prefixes its subject with `SafeBus:` and shows the recorded event time
separately. Other notification types keep their existing templates.

## Acceptance by role

| Role                   | Events, channels and scope                                                                                        | Failure behavior                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guardian               | Linked students' pickup/drop-off events; inbox, Android push and email follow existing recipient/channel choices. | Expired/revoked links, inactive accounts, authority suspension and privacy rejection prevent authorized delivery. Push also requires an active permitted device. |
| Driver                 | Existing assigned-trip recorder and planned-stop checks; existing driver alerts remain unchanged.                 | Cannot record for another driver's trip or receive a guardian's student event notification.                                                                      |
| School authority admin | Existing authority-scoped operations and inbox.                                                                   | No new pickup/drop-off recipient or external delivery channel. Cannot read a guardian's personal notification.                                                   |
| School-scoped admin    | Existing school-scoped operations and inbox.                                                                      | No new pickup/drop-off recipient or access outside the school/recipient scope.                                                                                   |
| Transportation admin   | Existing authorized operations and inbox.                                                                         | No new pickup/drop-off recipient or access to another recipient's inbox.                                                                                         |
| Platform admin         | Existing platform operations and inbox.                                                                           | No new student notification audience or recipient access bypass.                                                                                                 |

Administrator MFA remains required. This change does not modify optional guardian
or driver MFA, sign-in, consent, quiet hours, quotas, or source-event deduplication.
An inactive guardian record now also blocks push claims/final resolution; previously
the profile check alone did not cover that state.

## Data and interfaces

`safebus_private.pickup_dropoff_event_copies` stores one title/body per new source
event, with matching authority, student, trip and event type. It has RLS and no
client/service-role table grants or public policies. The existing source trigger
captures copy before fan-out; retries do not rewrite it. Event deletion cascades
to its saved copy. No existing events or outboxes are backfilled/replayed.

The private formatter checks source-event identity and authority/student/trip/type
before resolving the student, trip bus snapshot and event stop. The stop must
belong to the event trip's route and authority. Legacy events without saved copy
use that formatter and explicit unavailable values rather than a current
replacement assignment. Future edits cannot change a new event's saved message.

The additive service-only RPC
`resolve_guardian_pickup_dropoff_email_payload(p_outbox_id uuid)` returns recipient
email, notification type, title, body, event occurrence time, authority timezone
and the existing outbox idempotency key. It resolves only processing legacy
pickup/drop-off outboxes after the current eligibility checks. Existing RPC
signatures stay compatible. The email worker fails closed if this endpoint is
missing or rejects a row; it never substitutes the old first-name-only template.

## Hosted reconciliation and release

Read-only inspection on 2026-10-28 confirmed that the previous notification
templates are installed in production-designated BusSafe
(`ckrkfylsyihwouvesypm`). The five replaced function definitions/hashes/ACLs are
captured in the manifest and hosted fixtures. No production student data was
extracted, no fixtures were written, and no notifications were sent.

The new forward migration stays in `supabase/migrations/pending`, with its
manifest at `config/pending/pickup-dropoff-copy.json`. It refuses mismatched,
already-installed or partial baselines. Do not replay the original template
migration or the historical migration chain.

After human review and merge, run **Release pickup and drop-off copy** for the
exact reviewed main SHA. Use `rehearse` / `REHEARSE_PICKUP_DROPOFF_COPY` first,
then the reviewed `install` / `INSTALL_PICKUP_DROPOFF_COPY` release. The workflow
uses the protected production environment and shared deployment lock, rehearses
the bounded SQL in a rollback-only transaction, independently confirms restoration,
and retains encrypted recovery before persistent installation. Installation
rechecks target/SHA/run binding, checksum, recovery age, exact baseline, table
contract, function privileges and unchanged recipient preferences. Firebase
validation sends no notification.

Release the matching web/email worker only after the database release. The
production web release now verifies this installed database support before
deploying. Build/sync and release the matching Android artifact through its
existing protected workflow. Record normal authorized event receipt separately
for email, Android display and notification-tap navigation; do not generate
notifications to real recipients as QA.

## Recovery and verification status

Encrypted recovery includes prior function definitions/ACLs, table metadata and
bounded restore SQL. Restore the previous email/web/dispatcher artifacts before
restoring database functions through the protected workflow. Recovery deliberately
retains the private event-copy table and its saved messages; deleting it would
discard post-installation event history. A later reinstallation after rollback
needs a reviewed forward adoption of that retained table, rather than replaying
the original migration. This is bounded function recovery, not a full backup.

Embedded PostgreSQL tests exercise the captured real driver recorder, notification
triggers, inbox/detail RPCs, push claim/final resolution, email payloads, opt-outs,
revocation and protected rehearsal/recovery. UI tests separately exercise rendering
and tap navigation. Provider sends are mocked/local-only. These checks establish
local behavior, not hosted installation or phone/email receipt. The protected
hosted rehearsal, installation, matching releases and actual receipt remain pending
human review.
