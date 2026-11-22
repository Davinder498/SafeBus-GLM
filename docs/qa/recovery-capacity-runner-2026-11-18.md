# Recovery capacity runner — November 18, 2026

Status: implementation under validation; no hosted capacity result yet.
Target is only `deladookciebwvqojhkv` (BusSafe-Recovery-20261011).
Production load testing, paid upgrades, customer data and external delivery are excluded.

The owner approved the expanded synthetic cleanup exception on November 18.
The exact 16-guard allowlist is in `scripts/lib/recovery-capacity-cleanup.mjs`.
It never disables all triggers, RLS, foreign keys or authentication checks.

## Android GPS-only probe

Select workload `android_gps` and `buses=10` in the protected workflow.
The test binds a synthetic Android device to each driver session and checks
that another driver cannot upload with that device. It then sends two stages
of 100 HTTPS requests to the real Android GPS endpoint. One spreads sends
over each three-second interval and the other starts all ten drivers together.
Every acknowledgment must arrive within its collection interval. After
each stage, the test compares the coordinates, timestamp and event sequence
stored for each bus against the latest accepted request.

Each simulated phone has at most one outstanding upload and waits at least
500 ms after success before its next upload. A slot missed while a phone
is busy is counted separately and fails the same three-second acceptance
criterion. Results also log recognized rejection reasons without response bodies.

The probe leaves maps and delivery workers idle. It records HTTP timing,
failed or unsent requests, and the position check. It qualifies only this
small Android upload workload. Larger runs need their own device provisioning
and Auth setup. The local generator test covers two 10,000-request waves against
a simulated endpoint.

The protected test rehearses cleanup before opening the API, restores the
API quarantine after testing, and verifies removal of synthetic devices and
their dependent cursors. It does not disable any additional triggers.

## What this first test measures

Dispatch `run-recovery-capacity.yml` at the reviewed current main SHA, confirmation
`RUN_RECOVERY_CAPACITY`, initially `buses=10` and workload `combined`.
The protected GitHub environment
must be approved by its reviewer. Existing Recovery credentials are reused.
The workflow writes redacted evidence even on failure.

Each bus has a distinct synthetic driver, real Auth login, active trip and
short-lived tracking token. Each synthetic route has two stops and no published
route shape; this is a minimal baseline, not representative route/ETA complexity. GPS requests use the installed
`update_bus_tracking_location` HTTP RPC every three seconds. Fixtures represent
already configured transportation operations and synthetic trial/contract state;
this is not onboarding, Stripe billing, QR scanning or legal acceptance evidence.
No signed contract artifact is created.

Fifty distinct synthetic guardians each have one student linked to the first bus.
The initial stage opens no map channels, while the installed audience worker
expands a real trip-start source into inbox notifications for all fifty parents.
Next, all fifty read their own visibility every three seconds and service details
every fifteen seconds, receive shared private-channel hints, and one disconnects
and rejoins. Cross-tenant reads and wrong-driver GPS are checked before load.
The existing seven-role/MFA check remains separate evidence, not a new capacity
claim for administrators or retired school-admin roles.

| Selection | GPS workload after correctness checks  | Map workload                    |
| --------- | -------------------------------------- | ------------------------------- |
| 10        | 10 buses, two 30-second windows        | Zero then 50 viewers on one bus |
| 100       | Above, then 100 buses for 60 seconds   | Zero during the fleet ramp      |
| 500       | Above, then 500 buses for five minutes | Zero during the 500-bus ramp    |

Select the next bound only after inspecting the preceding hosted result and
cleanup. Larger selections still execute the smaller load stages first. The
50-recipient sample is **not** 25,000 parents at 500 buses. Full viewer mixtures,
notifications across every bus, tenant skew and 5,000/10,000-bus qualification
remain subsequent work informed by this exploratory result.

Six bounded Node database connections run four groups of shared tracking shards,
one independent legacy tracking worker and one independent audience worker.
Tracking groups retain a one-second cycle and 750 ms per-dispatch statement limit;
each dispatch also has the production 100 ms lock limit. Audience expansion uses
a separate 20-second cycle (the reviewed push dispatcher cadence) with the existing
8-second statement limit. This invokes inbox expansion only, not the push provider.
Each group sends its fixed statements in one network round trip, preserving each
dispatch's transaction boundary. A cycle exceeding its scheduled period still
fails; no tracking threshold is relaxed. Evidence records per-worker rounds,
dispatch counts, maximum client/server elapsed times, overruns and failure codes,
including failed runs. This makes worker scheduling explicit; it does not prove
production pg_cron concurrency. No production jobs,
provider credentials, native devices, push destinations or email delivery workers
are copied or invoked. Managed Realtime partitions are initialized by the service.

## Evidence and stop conditions

Record offered versus completed GPS/read operations, p50/p95/p99 client latency,
queue depth and oldest pending age, database connection use, initial database size,
code revision, schema fingerprint, notification recipient reconciliation, each
viewer's shared hint receipt, one reconnect time and reconciliation of the latest acknowledged position for every tested bus.
Do not store tokens, passwords, coordinates, student names, provider payloads or
synthetic identifiers in evidence. CPU, I/O and WAL are not instrumented by this
first runner; a pass is not infrastructure sizing evidence.

Stop on any request error, authorization mismatch, missing acknowledgement,
unreceived probe, worker failure, pending age over 120 seconds, database connections
over 80% of max_connections, generator lag over one second, or in-flight limit.
A completed load stage must have p99 at most five seconds and exact accounting.
Measured workload requests are never retried. Fixture password sign-ins are
spaced at least 2.1 seconds apart to respect the default Auth token endpoint
limit (150 requests per five minutes). Only explicit HTTP 429 sign-in rejections
are retried, at most three retries per account (5/10/20-second waits), with a
120-second total retry-wait budget across setup. Other errors and uncertain
network failures stop immediately; account creation is never blindly retried.
Retry counts/waits are recorded separately from load measurements. No Auth limit
or IP-forwarding setting is changed. A maximum 35-minute internal deadline leaves
cleanup time in the 45-minute protected job; the additional time accommodates
551 paced sign-ins for the 500-bus selection, not a longer measured load stage.
Stop arrivals and allow at most 90 seconds to drain both tracking queues and the
audience queue. Native device ingestion/offline replay, full-fleet Realtime delivery,
provider receipt, eight-hour soak and commercial launch remain unqualified.

## Cleanup and interruption

Start only with an empty Auth/application baseline, quarantined app schemas,
zero cron jobs, zero Vault secrets and zero Storage objects. Check the exact
Recovery binding, runtime policies and pre-request hook. Capture a schema fingerprint.
Before exposing the API, rehearse the complete fixture deletion with rollback.

Stop workers and channels, revoke application schema usage, then lock every listed
fixture table and tenants. Verify the exact run-tagged Auth metadata/emails and
synthetic tenant IDs/names/type and reject foreign domain rows. Disable only the
16 named guards inside the transaction, delete scoped fixtures in dependency order,
restore every guard, verify empty domain tables, then commit. Delete the exact
run-owned Auth users via the admin API and verify zero users/sessions, quarantine
and the original schema fingerprint. Any cleanup error fails the run.

A hard kill, network outage or GitHub force cancellation can interrupt cleanup.
Do not rerun or reset a nonempty target: inspect its redacted evidence and restore
quarantine, then use the reviewed scope from that run. Graceful SIGTERM/SIGINT
stop arrivals and attempt cleanup, but cannot guarantee completion after forced kill.

## Prerequisite evidence

Recovery API verification passed in GitHub run
[44244387659](https://github.com/Davinder498/SafeBus-GLM/actions/runs/44244387659)
at main `e68e862b2488fb2a0b3630276295fd2bf22fa31d`: seven role accounts,
MFA, private-channel receipt, session rejection and cleanup. This prerequisite is
not a load test. The local arithmetic simulator remains planning evidence only.

The first capacity attempt, run [44253636580](https://github.com/Davinder498/SafeBus-GLM/actions/runs/44253636580),
stopped during account 38 setup before any measured load. Recovery Auth logs for
07:27–07:28 UTC on 2026-11-18 show HTTP 429 `over_request_rate_limit`.
Read-only inspection afterwards verified zero Auth users/sessions, profiles and
tenants, and zero application-schema USAGE grants for anon/authenticated/service_role.
The corrected runner separates create/profile/login stages and reports fixed,
redacted HTTP status categories. This failure is setup evidence, not a measured
bus-capacity result. Reference: https://supabase.com/docs/guides/auth/rate-limits.

The corrected Auth run [44261219288](https://github.com/Davinder498/SafeBus-GLM/actions/runs/44261219288)
passed account setup and reached notification-only load, then hit the runner's
combined one-second worker deadline. Read-only `pg_stat_statements` showed one
audience expansion at 986.30 ms, one legacy dispatch at 66.25 ms, and 24 shared
dispatches averaging 4.20 ms (maximum 36.62 ms). The former runner placed all three
types in one cycle and issued at least 16 sequential network round trips per
shared group. Notification work alone plus legacy work exceeded that cycle.
The new independent schedules correct that runner coupling and batch transport;
they do not establish larger-fleet notification throughput. Cleanup again left
zero Auth users/sessions, tenants/profiles and application-schema access. A fresh
hosted run is still required; no successful capacity result is claimed.

Run [44265077855](https://github.com/Davinder498/SafeBus-GLM/actions/runs/44265077855)
then stopped at `CAPACITY_GPS_ACK_MISMATCH` in notification-only load. A read-only
hosted reproduction confirmed `extra_float_digits=0`: the former JavaScript
calculation produces `52.260000999999995` for sequence 1, while PostgreSQL's
row JSON returns `52.260001`. Both latitude and longitude columns are double
precision. Generate fixture latitude from integer microdegrees before division,
so all 1,000 positions round-trip exactly with the hosted output setting. Do not
weaken comparisons with an arbitrary tolerance: require exact trip, latitude and
longitude in each acknowledgement and retain final stored-position reconciliation.
Regression tests reproduce the old mismatch using PostgreSQL and validate every
new position, including rejection of stale/wrong/malformed acknowledgements.
Post-failure inspection again confirmed zero users/sessions/profiles/tenants and
no application-schema access. The hosted capacity result remains pending.

## Map-viewer failure and incomplete cleanup (run 44270874052)

Run `44270874052`, attempt 1, at reviewed SHA
`a7c11c91a96ec57bdb7b401e9b3e460351919e98` passed the 10-bus,
zero-map-viewer stage with GPS p99 282.8 ms. This does not qualify capacity.
The 50-map-viewer stage failed: legacy and shared workers received PostgreSQL
statement timeout `57014`, followed by guardian visibility/service-line and GPS
RPC timeouts. Completed guardian visibility calls in cumulative hosted statistics
averaged 3356.35 ms (17 calls, maximum 7916.29 ms); these statistics are not a
stage-specific percentile. One later isolated, stale-location read took 235.838 ms;
it does not reproduce concurrent fresh-location work or establish a remedy.

Quarantine's REVOKE timed out inside `extensions.pgrst_ddl_watch`, before domain
cleanup began. Read-only inspection found 61 run-owned Auth users/sessions/profiles,
two matching demo tenants, authenticated schema usage still enabled, and no
disabled cleanup guards. The process kept sockets alive until GitHub cancelled
it at 45 minutes, although workload failure occurred after roughly three minutes.
No production writes, provider delivery, compute upgrades or resets were performed.

Runner repair preserves the first failure, aborts outstanding workload HTTP requests,
checks cancellation after scheduler waits, and closes all Realtime sockets even if
quarantine or channel removal fails. Cleanup HTTP requests have an independent
budget. Only idempotent API quarantine retries statement/lock timeouts, at most
three attempts with 20-second statement and 2-second lock budgets. Measured
workload timeouts, cadence, viewer count and success thresholds are unchanged.

The protected `Clean up failed Recovery capacity run` workflow accepts the exact
failed run/attempt and original bus count. It verifies Recovery identity and the
release lock, closes API usage, requires an intact exact run-owned tenant/account
set, rehearses the existing allowlisted cleanup with rollback, removes only those
fixtures/accounts, and checks empty Auth state, closed API and unchanged schema
fingerprint. It never runs load, resets the project or accepts foreign/partially
cleaned state. Such state requires another inspection. Run with `failed_run` =
`44270874052-1`, buses = `10`, and confirmation `CLEANUP_RECOVERY_CAPACITY`.

Cleanup completed in protected run `44291234575` at
2026-11-18T11:12:44Z. Independent read-only inspection confirmed zero Auth users,
sessions, profiles and tenants, no application schema access, and all deletion
guards enabled. The map-viewer capacity failure remains unresolved.

## Guardian visibility request context

The observed visibility wrapper evaluates tenant and guardian helpers in the
student-link join. A scoped post-failure plan spent about 21 ms filtering 50
links; this is a profiling lead, not proof of the entire concurrent bottleneck.
The forward migration wraps the four row-independent identity/role helpers in
scalar subqueries so PostgreSQL evaluates them once per statement. It retains the
same inner visibility/ETA function, complete return shape, link status/expiry,
owner, security-definer setting, search path and grants. No authorization result
is retained between requests or shared between guardians.

Acceptance: guardians receive exactly their own currently eligible rows; expired,
revoked and foreign links remain excluded. Driver, school authority admin,
school-scoped admin, transportation admin and platform admin gain no guardian
visibility. Anonymous calls remain denied. Session/MFA checks remain in existing
helpers and the API pre-request hook; this change does not replace either.

Local PostgreSQL tests compare all output fields against the captured hosted
wrapper and exercise changing identities, tenants, roles, expiry/status and empty
links. With 51 candidate links the instrumented original wrapper evaluates tenant
52 times and guardian 51 times; the new wrapper evaluates each once. Instrumented
helpers are test-only; the inner visibility response is a controlled fixture, so
this is wrapper equivalence/call-count evidence, not end-to-end ETA benchmarking.

`Verify Recovery map query fix` requires current reviewed main, protected human
review, `VERIFY_RECOVERY_MAP`, TLS-bound Recovery identity, empty fixtures and
closed API access. It rehearses the exact-hash migration with rollback, compares
the entire schema catalog to an expected single-function delta, installs and
verifies, then runs the existing unchanged 10-bus/50-viewer runner. Both migration
and workload evidence are uploaded. It cannot target production or select larger
loads. A failed capacity run does not undo the schema optimization; cleanup and
failure evidence remain governed by the existing runner. The migration rejects
already-applied or unknown definitions; use the existing capacity-only workflow
for subsequent tests after a successful installation.

Hosted installation and the unchanged concurrent test remain pending. Neither
this local optimization nor a passing short baseline qualifies launch capacity.

## Follow-up after PR 481: shared ETA query expansion

Protected run `44305501964` installed the request-context optimization with exact
catalog delta and rollback verification. It still failed the unchanged map stage.
The notification-only stage completed with GPS p99 650.1 ms; the shared worker
received 57014 at 2026-11-18T14:27:47Z. Its 115.9 ms maximum server time describes
completed rounds, not the timed-out statement. Subsequent PostgreSQL logs show
timeouts inside shared live progress, guardian service lines, visibility and GPS.
Cleanup completed: independent inspection found zero users, sessions, profiles
and tenants, and no application-schema usage. The installed visibility wrapper
has catalog MD5 `a907e1c04377089f5aa4f352e9bb9ea0`.

Local PostGIS comparison found avoidable repeated expression expansion in the
shared ETA computation. The forward change materializes only `stop_states` and
`stop_eta` within the existing statement. It preserves all formulae, input digest,
private cache storage/permissions, source comparison/locking and invalidation.
No wait, timeout, viewer count, cadence or success threshold is changed.

An exploratory local comparison warmed PostGIS, replaced the function to reset
its plan, then changed GPS before each of 12 service-line reads. Original first
six samples were 26/24/21/74/47/14 ms; the two-boundary variant was 11/5/4/4/5/4 ms.
A later repeated original was 13/9/7/7/7/7 ms; after generic-plan reuse both versions
were around 2–4 ms. These PGlite timings are noisy local evidence about planning
cost, not native hosted concurrency measurements or proof of the whole failure's
cause. Full response, role/tenant/session/MFA boundaries, names, freshness,
late-GPS rejection and cache invalidation tests run against both variants.

The runner now retains each attempted stage's queue/activity samples even when
measurement throws. Activity diagnostics contain grouped state/wait type/event,
counts and oldest active-query age only; no SQL text, account data, tokens or raw
locations. These samples help distinguish database waits from active work on a
subsequent failure without claiming a CPU bottleneck from timeout logs alone.

`Verify Recovery shared ETA query fix` requires `VERIFY_RECOVERY_ETA` and current
reviewed main. Its protected job rehearses and installs the exact single-function
change using the same empty/quarantined Recovery identity and full-catalog checks,
then runs the unchanged 10-bus/50-viewer workload. Approval is required by GitHub's
environment rules. If installation succeeds but capacity fails, use the existing
capacity-only workflow after inspecting cleanup; do not replay the one-time patch.
Hosted verification remains pending; launch capacity is not qualified.
