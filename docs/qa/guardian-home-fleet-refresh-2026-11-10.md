# Guardian home freshness and tracking release preparation

Status: prepared for human review; no production installation, frontend release,
capacity certification or commercial launch approval.

## Owner target and workload

Owner confirmed **5,000–10,000 buses** on 2026-11-10. The launch tracker now uses
10,000 as the upper fleet target; the earlier 25,000-bus closure target is
superseded. Registered guardians remain 500,000 in the commercial tracker;
concurrent guardians are still unspecified. The capacity harness's older one
million registered accounts / 100,000 total concurrent users is a conservative
sensitivity case, not a new owner commitment or a measured supported population.

| All buses reporting every three seconds | 5,000 buses | 10,000 buses |
| --------------------------------------- | ----------: | -----------: |
| Location updates per second             |       1,667 |        3,333 |
| Updates over eight operating hours      |  48 million |   96 million |

These are event volumes, not retained history rows or SQL-operation counts.
Production GPS-history removal is already recorded separately. Read traffic,
authorization checks, update amplification, provider quotas and reconnect work
must be measured in addition to ingestion. The harness now includes `fleet5000`
(50,000 total concurrent users, explicitly a proposed sensitivity mix), plus the
existing 10,000-bus peak and recovery cases.

## Behavior and bounds

Home now uses the existing verified-data lifecycle with a dedicated policy:

- Fetch linked buses and stop/seat assignments together initially and on refresh.
  Both requests use the same cancellation signal and existing secured RPCs.
- Check again 30–35 seconds after completion. Random jitter disperses requests;
  continuous GPS hints cannot drive home refreshes faster than one per 30–35
  seconds. One trailing timer has a fixed deadline; new hints cannot postpone it.
- Recheck immediately on return to the foreground, restored connectivity or
  manual Refresh. Live-map and detail pages retain their existing frequent
  invalidation-driven refreshes and 15-second fallback.
- Keep one in-flight verification and bounded follow-up work. Abort and clear
  data while hidden/offline, on lost Realtime connection, unmount or sign-out;
  discard late responses from an earlier principal. A request times out after
  ten seconds. Failed bus verification removes the old status and students.
- Stop lookup failure shows unavailable stops, never old assignments. Failed
  fallback retries back off to 60 then 120 seconds, plus up to five seconds
  jitter. Live hints remain rate limited; manual/foreground recovery is immediate.
- Show a last-checked time and Refresh without changing the existing visual system.

This is bounded eventual home freshness, not instant trip/authorization-change
notification: hints carry no trusted authorization or display data. With a healthy
request, home changes reconcile within the 35-second check window plus request
latency. Existing displayed data is cleared if verification fails or times out.
All later RPCs enforce current authorization; home does not authorize other views.

At the peak sensitivity mix of 88,000 guardian clients, two home calls per
30 seconds are approximately 5,867 calls/second before jitter. That is still a
substantial database workload. The harness reports this separately from the
more expensive map/fallback model; do not add alternative page mixes as if each
client viewed every page at once. No cross-user response cache is introduced.

## Role acceptance

| Role                   | Acceptance / failure behavior                                                                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guardian               | Only existing secured linked-student data; trip endings, links and assignments reconcile; hidden/offline/denied data disappears; stop failure is explicit.                           |
| Driver                 | Location cadence, assignment authorization, tracking queue and offline collection stay unchanged; prepared DB producer performs one dirty-marker write instead of guardian delivery. |
| School authority admin | Existing tenant-scoped monitoring and private tenant hints; no new student or location grants.                                                                                       |
| School-scoped admin    | Existing school restrictions on authoritative reads remain; a hint never widens visibility.                                                                                          |
| Transportation admin   | Existing tenant/school permissions and secured monitoring RPCs remain.                                                                                                               |
| Platform admin         | Existing privileged MFA and operational release controls remain; no new public/service-role worker endpoint.                                                                         |

Recipient email/push choices and notification sending are outside this change;
tracking hints are private coordinate-free refresh signals, not recipient alerts.

## Production observation and prepared release

Bounded read-only catalog checks against BusSafe on 2026-11-10 confirmed:

- PostgreSQL 17.11; location trigger still calls synchronous route fan-out.
- No tracking invalidation queue, dispatcher or new indexes exists yet.
- The observed producer body digest is bound in the release manifest, including
  its original execution ACL. Existing location trigger identity is preserved.
- `realtime.send` swallows insertion errors, so it cannot acknowledge durable
  delivery. The prepared sender propagates insert failure. The live provider's
  required message timestamps and skip flag have compatible defaults.
- No cron run-history cleanup job was found. The prepared migration now includes
  bounded cleanup of only its two named jobs' completed diagnostics older than
  48 hours (at most 1,000 rows/minute), preserving unrelated and running jobs.

`config/pending/async-tracking-invalidations.json` binds the existing prepared
0125 SQL, function hashes/ACLs, queue definition, indexes, unchanged location
trigger, and two named jobs. `Release operational fix` now accepts
`tracking_invalidations`. No active immutable migration or installer tip was
changed. This uses the existing reviewed operational adoption path rather than
replaying historical migrations or pretending the pending SQL has been installed.

After human merge review, run the protected workflow for the exact current main
SHA, first `rehearse` / `REHEARSE_OPERATIONAL_FIX`. Review its rollback and recovery
evidence, then `install` / `INSTALL_OPERATIONAL_FIX`. Protected production approval
is still required. The runner captures encrypted recovery before installation and
verifies definitions afterward. Recovery restores execution ACLs as well as bodies,
unschedules jobs that did not previously exist, and refuses to discard pending
refresh work. If work is pending, preserve/drain it through a reviewed procedure;
do not drop the queue to force rollback. Read-only acceptance is in
`tests/rls/async-tracking-existing-database-readonly.sql`.

The conservative dispatcher budget is **250 messages/second** with bounded scope,
page, statement and lock limits. This removes per-guardian work from the GPS
transaction but **does not establish fleet throughput**. Full-fleet guardian
fan-out can exceed that budget greatly; raising constants without measurements
would move the failure rather than qualify capacity. Keep the launch capacity gate
open until query plans, queue age/drain, producer lock waits, current viewer mix,
private Broadcast quotas, compute and delivery latency meet the workload. Shared
bus-scoped distribution is a possible later optimization only with explicit
current-link authorization/revocation tests and measured need.

## Verification and rollout acceptance

Local automated coverage includes home stale-status/assignment recovery,
continuous GPS bursts, foreground/offline recovery, both-request cancellation,
late account responses, denied links, unavailable stops and retry backoff.
Existing map lifecycle tests verify frequent refresh remains unchanged.
Embedded PostgreSQL tests execute the actual queue SQL and test budgets,
coalescing, cursor progress, failure rollback/retry, guardian access boundaries,
body/ACL restoration, empty-queue recovery guards and bounded cron cleanup.
These are functional tests, not multi-session lock or hosted capacity evidence.

Browser cases in `guardian-home-freshness.spec.ts` cover trip completion and
reassignment without Realtime and fail-closed manual recovery. CI's full native
mobile suite discovers them automatically. Local browser execution was attempted:
the Playwright browser archive was invalid, and installed Chromium could not create
its process socket (`Operation not permitted`). No browser pass is claimed locally.

After release: verify a guardian's active trip ends while home stays open; change
an assignment/stop and verify it reconciles; background/reopen, disconnect/reconnect,
revoke a link and confirm old data disappears. Open the map and verify frequent
position updates. Observe the two named cron jobs, oldest queue age, failures,
producer p95/p99 commit latency and provider delivery; retain evidence without
customer coordinates or recipient identities. Physical Android, real delivery,
capacity and commercial launch acceptance remain separate open gates.

## Final local validation

`pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm test` passed. The full test
run passed **1,213 web, 32 mobile and 573 release tests** (1,818 total), with no
skipped release tests. Mobile build and subsequent `cap:sync` both passed; this
is not an installed APK/AAB or physical-device result. The workload model, bounded
loopback simulator, explicit product-verification contracts, formatting and
whitespace checks passed. Browser execution remains blocked as described above.
