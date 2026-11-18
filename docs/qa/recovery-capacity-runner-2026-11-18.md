# Recovery capacity runner — November 18, 2026

Status: implementation under validation; no hosted capacity result yet.
Target is only `deladookciebwvqojhkv` (BusSafe-Recovery-20261011).
Production load testing, paid upgrades, customer data and external delivery are excluded.

The owner approved the expanded synthetic cleanup exception on November 18.
The exact 16-guard allowlist is in `scripts/lib/recovery-capacity-cleanup.mjs`.
It never disables all triggers, RLS, foreign keys or authentication checks.

## What this first test measures

Dispatch `run-recovery-capacity.yml` at the reviewed current main SHA, confirmation
`RUN_RECOVERY_CAPACITY`, initially `buses=10`. The protected GitHub environment
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
