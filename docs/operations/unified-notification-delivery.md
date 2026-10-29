# Unified notification delivery

Owner-approved implementation, 2026-10-28. Keep the design simple and use the
existing event, inbox, push and email queues. The design target remains 10,000
active buses, 100,000 total concurrent users, one million registered accounts and
2,000 school authorities. A local test is not proof of full-target live capacity.

## Acceptance before implementation

| Recipient              | Permitted behaviour                                                                                                                                     | Failure behaviour                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Guardian               | Pickup/drop-off for linked students; trip/service/operational updates for their current services; scoped announcements. Existing enabled channels only. | No unlinked, expired, inactive or cross-authority data; no service-unconfirmed alerts; preserve opt-outs, quiet hours and Android permission. |
| Driver                 | Own assignments/trips, confirmed disruptions and scoped announcements. Existing enabled channels only.                                                  | No other driver's/student guardian messages; service-unconfirmed status remains dispatch-only.                                                |
| School authority admin | Authority-scoped operational and delivery-health inbox.                                                                                                 | No external recipient channel added, no other authority data.                                                                                 |
| School-scoped admin    | Existing school-scoped operational inbox and allowed announcements.                                                                                     | No other school/authority or personal recipient inbox access.                                                                                 |
| Transportation admin   | Authority-scoped dispatch/operational inbox.                                                                                                            | Same authority and recipient boundaries; no notification preference control for other people.                                                 |
| Platform admin         | Existing platform service incidents.                                                                                                                    | No new student/authority audience or MFA bypass.                                                                                              |

Privileged MFA remains mandatory; guardian/driver MFA remains optional unless
enrolled. Missing-service status is named **Service unconfirmed** for dispatch;
only confirmed delay, cancellation and specific disruptions notify guardians.

## Approved copy

One server-side formatter supplies title and body to inbox, push and email.
Pickup/drop-off use the full student name and bus number, without the stop.
Event time is separate. Announcements retain their original in-app title/body;
external previews say **New announcement** / **Your school authority posted an announcement.**

| Event                              | Title                          | Message example                                |
| ---------------------------------- | ------------------------------ | ---------------------------------------------- |
| Pickup                             | Student picked up              | Alex Morgan was picked up on Bus 12.           |
| Drop-off                           | Student dropped off            | Alex Morgan was dropped off on Bus 12.         |
| Trip start                         | Trip started                   | Morning trip on Bus 12 has started.            |
| Trip completion                    | Trip completed                 | Morning trip on Bus 12 has ended.              |
| Trip cancellation                  | Trip cancelled                 | Morning trip on Bus 12 is cancelled.           |
| Delay                              | Bus delayed                    | Bus 12 is delayed on Route A.                  |
| Unconfirmed service, internal only | Service unconfirmed            | Service for Bus 12 is currently unconfirmed.   |
| Traffic                            | Traffic disruption             | Traffic is affecting Bus 12.                   |
| Weather                            | Weather disruption             | Weather is affecting Bus 12.                   |
| Closure                            | Road closure                   | A road closure is affecting Bus 12.            |
| Mechanical                         | Mechanical issue               | Bus 12 has a mechanical problem.               |
| New driver assignment              | New assignment                 | You’re assigned to Bus 12 on Route A.          |
| Changed driver assignment          | Assignment changed             | Your Bus 12 assignment on Route A has changed. |
| Ended driver assignment            | Assignment ended               | Your Bus 12 assignment on Route A has ended.   |
| Student service                    | Student bus assignment changed | Alex Morgan’s bus assignment has changed.      |
| Guardian access                    | Student access changed         | Your access to student updates has changed.    |
| Delivery incident                  | Notification delivery issue    | Some notifications could not be delivered.     |
| Provider incident                  | Notification service issue     | A notification service needs attention.        |
| Announcement preview               | New announcement               | Your school authority posted an announcement.  |

The formatter reads authorized source data and recorded trip labels. It creates
no new per-event copy. Later student name edits can affect a retry; this is the
approved simpler shared-format design, not immutable message snapshots. Unknown
legacy names and bus labels use explicit unavailable wording. Email subjects
add `SafeBus:` and HTML escapes the same body without adding another message.

## Delivery and evidence

Use a 20-second push wake-up with bounded queue draining, not one batch per
tick. Push/email share bounded-concurrency and draining code, but retain separate
provider and recipient controls. Reserve quotas atomically, process authorities
fairly, reclaim abandoned leases and retain permanent failures. Keep provider
requests idempotent where supported and do not claim exactly-once push receipt.

Per-message authorization is checked before provider submission. Queue/database
work must be bounded independently of accumulated terminal history. Provider
rate quotas and verified host capacity remain explicit dependencies, not claims
derived from batch size or worker count. Never send QA notifications to real users.

Use existing protected operational release/recovery tooling. Retire duplicate
notification-specific release paths only when replacements are covered. Preserve
historical migrations and existing data. New forward SQL stays pending until
reviewed protected installation; no main push or merge without human review.

Two private operational tables are required: a durable trip audience work queue
keeps fan-out out of the trip-recording transaction, and small atomic counters
coordinate quotas and fair authority selection across workers. Neither table is
a client API or a student-copy store. The former pickup-only copy table is moved
to a restricted recovery schema with its existing rows preserved; runtime no
longer reads or writes it. Historical migrations and their regression fixtures
remain. Retired notification-specific release workflows are superseded by
`release-operational-fix.yml` with milestone `delivery`.

Claims inspect at most 64 authorities and 200 candidates per authority; each
group has one claim, resolution and settlement RPC. Each call expands at most
16 trip intents. Audience failures retain their source intent, back off for
20 seconds, and stop automatically after five attempts for operator review.
Workers stop new claims after 15 seconds; already-running provider calls finish
under their timeout. Push defaults to four workers and 32 concurrent requests
per worker; email defaults to one worker and eight concurrent requests. Settings
are bounded, not a demonstrated throughput guarantee. Atomic reservations count
attempts conservatively, including recovered leases. Daily quotas use the
database UTC calendar day; recipient quiet hours retain their own timezone.

The email provider ceiling defaults to 600 attempts/minute with a 10/second
guard, shared across invocations. Push reserves at most 360,000/minute. Raising
email throughput requires a verified provider quota and measured worker/database
capacity. Full-target volume is not supported by the conservative email default;
see the notification wave assumptions in `../governance/capacity-assumptions.md`.
Twenty-second wakeups reduce scheduling latency; they do not prove target-scale
delivery. No production load test or real-user QA send is authorized here.

Release order: reviewed protected database rehearsal, encrypted recovery upload,
forward installation, then push deployment/provider validation without sending;
only afterwards publish the matching Netlify email worker and web/mobile clients.
The production release checks the installed database manifest before deploying.
Recovery restores exact prior functions, grants, table location, limits, defaults
and cron schedule. Stop new recording and allow durable audience work to finish
before rollback; recovery refuses pending work. Restore the prior workers with
the schema rollback. Newly provisioned or intentionally changed quota policies
must be reconciled before old constraints can safely be restored.

## Verification, 2026-10-28

Local checks passed: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`
(1,156 tests), migration verification, the mobile build and Android sync. Three
local mobile browser tests cover inbox, notification-tap details and unavailable
details. Embedded PostgreSQL exercises all 19 source types, authorization,
canonical channel payloads, retries/leases, atomic limits, audience failure and
the exact forward/recovery SQL. These tests use synthetic local records and
mock providers, with no production fixture writes or external QA delivery.

Read-only hosted reconciliation matched all 21 function baseline entries and
the existing quota constraints. The existing database still has its one-minute
push schedule and two pickup-copy records; this migration has not been applied.
Hosted rollback rehearsal and retained encrypted recovery must run in the
protected workflow after human review. The reviewed pending RPC surface also
requires release adoption into the active authorization inventory; a pending
manifest does not prove the full production authorization gate passes.

Actual Android device receipt, actual email receipt, provider quota capacity and
full-target throughput remain unverified. Browser mocks and successful Android
sync are not physical-device installation or delivery evidence.
