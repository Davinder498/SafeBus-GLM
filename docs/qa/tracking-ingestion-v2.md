# Tracking ingestion v2 — implementation foundation

Active-trip driver GPS is collected every three seconds. At 10,000 active buses, the target workload is about 3,333 fixes per second on average and up to 10,000 fixes in a synchronized burst. The separate guardian fan-out model assumes up to 500,000 viewers and 100,000 location deliveries per second at a proposed five-second map update interval. ETA and notification processing are independent. This component is **not deployed** and is not evidence of capacity.

## Data plane boundary
The existing Android v1 RPC returns a final acknowledgement and the device then removes its encrypted local copy. Do not change that endpoint or route v1 clients to this module. The v2 ingress has a distinct `queued` receipt and a later authoritative final outcome. A queued receipt must never be interpreted by v1 or v2 as a committed location. A v2 client must retain its local event until an authenticated final receipt is confirmed; retry the same event identity if a result is ambiguous.

The implemented core validates and normalizes one event per device, requests a server-verified revocable authorization grant, builds an internal envelope without raw credentials, and publishes batches of up to ten distinct device groups. The FIFO consumer preserves device order within its received batch, bounds parallel processing, and acknowledges broker delivery only after an authoritative durable terminal receipt. It does not implement the authoritative commit adapter, signed grant issuance or verification, final receipt API, mobile migration, HTTP listener, or infrastructure provisioning. Those are mandatory next implementation gates. A trusted adapter must not accept authorization supplied by a caller. Reject unknown or expired grants; revocation and cursor/position/receipt updates must be checked in the same authoritative transaction. An expired or revoked grant must never produce a live position. Receipt queries must be scoped to the original authenticated principal/device and current access.

## External fallback candidate infrastructure
AWS Canada Central high-throughput SQS FIFO is a candidate durable transport, not a committed subscription or installed service. AWS documents up to 24,000 batched messages/s per action in other supported regions; confirm account quotas and measured batch utilization (non-batch limit 2,400 TPS, below our sustained GPS requirement). Aggregate independent device requests with bounded batch size and wait, and explicitly measure quota, tail latency and partial batch retries. Use the official AWS SDK v3 with runtime IAM role, private networking, KMS encryption, restricted queue policy, short retention and monitored dead-letter handling. FIFO deduplication is time-bounded; persistent database idempotency is mandatory. Never log envelopes, raw credentials, or coordinates. Provider source: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html and https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-key-terms.html .

SQS is only one candidate; selection depends on cost, region, throughput, security, retention and failure tests. Do not provision cloud resources or activate clients without a complete qualified implementation. A queue does not magically reduce PostgreSQL writes: the authoritative batched commit and indexed/partitioned state, shared guardian snapshot distribution and revocation control plane remain separate required engineering work. Do not cache guardian authorization indefinitely or broadcast coordinates using the current hint-only Supabase topics. Evaluate dedicated regional long-lived connection servers with bounded fan-out and authoritative reauthorization; measure 500,000 concurrent connections and 100,000 deliveries/s. Notification processing remains independent and durable, with provider throttling and idempotency.

## Acceptance
The unit tests use injected test doubles, not real AWS, Supabase, or mobile devices. End-to-end integration must demonstrate authorization revocation, cross-tenant rejection, no lost acknowledged fixes across restart and redelivery, queue encryption/retention, atomic final receipts, burst and eight-hour endurance, full guardian and notification load, and commercial cost. Keep production v1 unchanged until these gates are satisfied.

## Supabase-first provider evaluation (2026-11-23 Alberta)

Production catalog confirms PGMQ 1.5.1 is available but not installed. A production-target-checked, bounded rollback-only transaction installed the extension temporarily, created an isolated queue, sent/read/deleted one non-personal synthetic message, rolled back, and confirmed the extension and schema were absent afterward. This is a functional rehearsal, not a throughput test. No AWS infrastructure has been provisioned.

The first candidate is now logged Supabase Queues, with a server-only PostgreSQL adapter, 32 stable device shards (a test starting point, not a qualified size), bounded batches and one transaction-scoped consumer lock per shard. Enqueue receipts are returned only after commit. The consumer must atomically validate and commit authoritative receipts and delete corresponding queue messages using the same database transaction. PGMQ visibility alone does not establish per-device order or exactly-once processing; no delayed messages, other consumers or unlogged queues are allowed. Use a dedicated least-privilege server role, private schema, explicit denial of client access and no direct public RPC exposure. Validate extension role grants before installing. Keep the AWS adapter as an unprovisioned alternative only if Supabase cannot meet cost/capacity goals.

Before installing: implement authoritative commit/grant adapters, private queue provisioning and role tests, verify real SQL signatures and transaction semantics, bound queue growth and retention, and compare end-to-end WAL, storage I/O, CPU, pool use, tail latency and cost against direct batched ingestion. Queuing in the same database adds writes; it does not itself solve shared resource contention. Investigate independent Supabase tracking compute only if it materially improves the measured outcome. Official API: https://supabase.com/docs/guides/queues/pgmq .

## Direct batch first (approved after reviewing queue overhead)

The preferred next candidate is direct microbatch ingestion without a durable server queue. Each driver still retains its encrypted local location until final database acknowledgement. A process-local bounded batch waits at most 50 ms to start when capacity is available, up to 50 independent devices by default (hard cap 100). No early acceptance is issued: each response is held until the entire database transaction commits. If the gateway crashes, the transaction is ambiguous or the batch is overloaded, the device must retry. No GPS or JWT is logged or retained by the gateway.

The candidate SQL is intentionally outside automatic migrations. It calls the existing authoritative GPS RPC separately under each cryptographically verified Supabase JWT identity inside a single transaction, restoring the request claims after each item. It is denied to PUBLIC, anon, authenticated and service_role. A future dedicated least-privilege gateway role must be granted only this wrapper, not general impersonation or table access; independently review its trust boundary and deny public exposure. The existing v1 path is unchanged. This first implementation reduces network/transaction overhead but does not vectorize row validation/writes, and one slow operation can roll back the batch. Compare it to v1 at equal offered demand before considering set-based optimization or queues.

The HTTP-to-embedded-PostgreSQL regression test uses the real captured GPS write function with a simulated trusted Auth response; it checks commit-before-ACK, duplicate, cross-principal denial, MFA, session revocation, and client ACL. The microbatch test checks distinct device grouping; the commit failure test checks retry behavior. These are not hosted load evidence. Before deployment implement trusted runtime provisioning, independently verified auth signing configuration, bounded authentication latency, global admission/rate limits, TLS, least-privilege role and Android integration, then test real provider JWTs, two-tenant fixtures, sustained and burst performance, guardian/ETA/notification load and cost. Queue adapters are retained as inactive fallback experiments only.

## Hosted direct-batch comparison

Protected Recovery workflow adds `android_gps_direct_compare`, 100 buses only,
confirmation `RUN_RECOVERY_DIRECT_GPS_100`. Reuse the existing fixture ownership,
real Supabase Auth, isolated environment verification, cleanup, schema fingerprint,
and native device scheduler. A new temporary private wrapper is installed only
after verifying original GPS function hash, no cron jobs and exclusive run-owned
synthetic accounts. No production changes. The direct candidate gateway listens on
loopback on the CI runner, uses genuine Supabase JWT verification and four bounded
Recovery database connections. It proves cross-tenant denial, invalid JWT denial,
a committed location and duplicate acknowledgement before measurement. No production
gateway role or mobile deployment is represented by this probe.

Compare 10, 25, 50, 100 maximum batch sizes, then existing individual HTTPS,
with 10 three-second rounds each of staggered and synchronized arrival. Reset
run-owned location/cursor/heartbeat/queue state between windows without disabling
triggers. Report actual batch fill, transaction count, auth time, GPS latency,
final position reconciliation, database waits and cumulative SQL counters.
Only fully drained and reconciled performance failures may continue; ambiguous
writes stop the run. Remove the wrapper and verify original function and cleanup.
A failed baseline is not permission to claim capacity; the direct candidates
must pass independently. The runner-local HTTP path lacks the deployed gateway's
network latency; no sustained 10,000-bus or guardian capacity claim follows.

## 500-bus sustained direct GPS qualification

Observed Recovery run 45321238007 passed all 10,000 events in ten windows, with
no late events or errors and final positions reconciled. Batch 50 recorded
staggered/synchronized p99 of 742.1/736.4 ms, 249/20 transactions for 1,000
events in each pattern; individual HTTPS p99 was 2105.8/1906.8 ms. The hosted
gateway was runner-local, not a deployed production gateway. All fixture rows
and the temporary wrapper were verified removed.

The 1-second p99 limit is a Recovery engineering target measured from the
scheduled GPS fix to acknowledgement after the database commit. The 100-bus batch
screens measured about 0.74 seconds p99.
The 1-second target tests whether the candidate can keep 99% of acknowledgements
well within the three-second collection interval as load grows.
Guardian map freshness and alert delivery require separate end-to-end measurements.

The next protected profile uses 500 distinct drivers across two synthetic
districts, batch size 50, 50 ms collection window, four worker connections,
100 rounds at three seconds per pattern, totaling 100,000 fixes over ten minutes.
No repeat of individual or other batch-size measurements. Require both complete
windows, no late events, exact committed transaction reconciliation, final
location reconciliation, existing authorization/replay proofs and p99 <= 1s in
both patterns. Keep the device-local retry contract. The reset checks all 500
run-owned trips, and outstanding SQL writes drain before cleanup even if HTTP
clients disconnect. Defer driver login until fixtures and cleanup rehearsal
complete, with existing provider-respecting pacing; guardian accounts are not
signed in during GPS-only load. The test remains isolated; no permanent gateway
deployment, production changes, queue purchases or fleet-wide qualification.

## 500-bus burst optimization

Run 45328052768 accepted all 100,000 fixes and reconciled final positions,
but synchronized p99 was 5390.1 ms with 1,000 late fixes; staggered p99 was
979.6 ms with none late. The original four-worker configuration is not
qualified. Database cumulative stats do not isolate auth or network time.
The original function and cleanup were independently verified.

Reduce batch transaction network commands from six to three by combining
constant transaction setup statements into one simple-protocol command;
keep the parameterized write, all three transaction-local timeouts, and
separate verified COMMIT. Timestamp authentication, waiting-to-batch, pool
acquisition, transaction setup, SQL round trip and commit round trip; aggregate
only numeric timing, never tokens or payloads. The oldest queued event's
50 ms deadline is not restarted on worker completion.

[Run 45346804074](https://github.com/Davinder498/SafeBus-GLM/actions/runs/45346804074)
accepted and reconciled 5,000 fixes with zero late updates in each short screen.
Four workers measured 1,800.5 ms p99 and eight measured 1,599.9 ms p99. Both
exceeded the 1,000 ms gate. The next screen requested sixteen workers, but
Recovery Supavisor reported its 15-client session-mode limit at 15:01:26 UTC
on November 24, 2026. Actions reported SQLSTATE `XX000` and verified cleanup
and wrapper restoration. The sustained windows did not run.

The revised 500-bus profile screens four, eight and twelve workers on
identical ten-round synchronized windows (15,000 planned fixes). Twelve
workers plus the control and monitor connections leave one slot under the
observed session-pool limit. Retain the separate 15-connection PostgreSQL
headroom check. If a worker connection still fails, the evidence records the
requested and opened worker counts and SQLSTATE. The run stops and cleans up.
Select the lowest passing concurrency with reconciled transactions, zero late
updates and p99 <=1s. Then perform the original two 100-round sustained
windows with that count (100,000 additional planned fixes). If no candidate
passes, or correctness/transport is ambiguous, stop and preserve evidence.
No claim of production readiness or proof of 10,000-bus capacity; no new
database privileges, paid services or production changes. Any further
per-fix SQL rewrite should follow observed timing and preserve all security
and correctness checks.

### PostgreSQL work inside the synchronized screens

The [run 45346804074 artifact](https://github.com/Davinder498/SafeBus-GLM/actions/runs/45346804074/artifacts/14934127108)
recorded 103 committed batches and 103 additional PostgreSQL statement calls
in each complete screen. The stats reset timestamp and eviction counter stayed
stable. Four workers used 33.95 seconds of summed PostgreSQL statement execution
(329.6 ms per batch) and generated 14,710,830 bytes of statement WAL. Eight
workers used 68.43 seconds (664.4 ms per batch) and generated 11,670,603 bytes.
The gateway's mean SQL round trips were 433.0 and 768.0 ms respectively.
The gateway's batch-wait p99 fell from 1,217.6 to 997.5 ms. Summed execution
overlaps across workers. The measurements show a trade-off between batch
waiting and database execution under concurrency. They do not identify which
part of the per-fix SQL accounts for the additional time.

The runner reports these deltas for each safely reconciled direct GPS window,
alongside the raw snapshots and gateway timings. A changed stats reset or
eviction counter, regressing counters, or a call count that differs from
committed batches prevents attribution. WAL and block deltas are statement
counters. Project-wide resource and cost headroom still require hosted evidence.

If the opening SQL counter snapshot fails, the runner records the phase and
SQLSTATE before opening the window's transport. If the closing snapshot fails,
the runner saves the GPS results and gateway diagnostics already collected.
Either failure stops qualification and proceeds through Recovery cleanup.

### 500-bus rollback comparison at eight connections

[Run 45533825001](https://github.com/Davinder498/SafeBus-GLM/actions/runs/45533825001)
accepted all 5,000 fixes at eight connections in both short screens. The
original and optimized GPS functions measured 1,467.7 ms and 1,355.6 ms p99,
respectively. The optimized twelve-connection screen returned 449 HTTP 503s.
The artifact confirms restoration and fixture cleanup. The sustained windows
did not run.

The 500-bus rollback comparison used eight connections throughout. The private
GPS wrapper uses one rollback block for a successful batch. A permission denial
rolls back that attempt and replays each fix in the same order, so a denied
item receives its own 403. Unexpected failures abort the whole transaction.
JWT validation, driver authorization, per-fix result checks, and acknowledgment
after commit were still required. This historical profile used a 1,000 ms p99
gate for the short optimized screen and both sustained windows.

[Run 45544667532](https://github.com/Davinder498/SafeBus-GLM/actions/runs/45544667532)
tested `ba7c5e083a2622564948b2c2e17636953fddc64d` on November 24 in Alberta.
The original and optimized write paths each accepted and reconciled all 5,000
fixes with zero late updates. The p99 was 1,560.3 ms and 1,418.3 ms, respectively.
For the optimized path, batch wait p99 was 737.2 ms and SQL round trip p99 was
850.5 ms. Those percentiles describe different populations and cannot be
added. All 104 optimized batch transactions committed, with zero temporary
blocks read or written by the batch statement. The
[artifact](https://github.com/Davinder498/SafeBus-GLM/actions/runs/45544667532/artifacts/14994266805)
confirms cross-tenant and invalid-token denial, duplicate acknowledgement,
function restoration and fixture cleanup. Neither screen met 1,000 ms p99, so
the sustained windows did not start.

### Controlled batch size comparison

The next 500-bus profile compares 50 and 64 fixes per batch on the same
optimized write path, using eight database connections and ten synchronized
rounds per screen. A fully queued 500-fix burst needs at least ten batches at
size 50 or eight at size 64. The comparison tests whether fewer batches reduce
queue time enough to offset the extra SQL work in each larger batch. Arrival
timing can still cause partial batches.

The maximum workload remains 10,000 screen fixes and 100,000 sustained fixes.
The screen with the lowest measured p99 among those that accept every fix on
time and reconcile final positions and committed batches proceeds to sustained
testing. Both sustained patterns must meet the same three-second per-fix
deadline and reconciliation checks. The 1,000 ms p99 benchmark is recorded for
comparison. An ambiguous outcome stops the run.
The transaction timeouts, connection cap, authorization checks and cleanup
remain in force.

### Revised worker screen on November 24, 2026 (Alberta)

[Run 45510134719](https://github.com/Davinder498/SafeBus-GLM/actions/runs/45510134719)
tested `eed949bdcd06415436ca861e96bc19a668a49d67`. Four, eight, and twelve workers
each accepted 5,000 fixes with zero late updates and reconciled final positions
and committed batches. The twelve-worker screen completed without a connection
refusal. Every screen missed the 1,000 ms p99 gate, so the runner stopped before
sustained qualification. The [artifact](https://github.com/Davinder498/SafeBus-GLM/actions/runs/45510134719/artifacts/14978500391)
verifies cross-tenant and invalid-token denial, duplicate acknowledgement,
wrapper removal, and fixture cleanup.

| Workers | GPS p99 (ms) | Batch wait p99 (ms) | Mean PostgreSQL execution per batch (ms) | Database-wide temporary bytes added |
| ---: | ---: | ---: | ---: | ---: |
| 4 | 2,107.3 | 1,299.1 | 272.4 | 12,021,279 |
| 8 | 1,879.8 | 1,146.4 | 662.3 | 12,026,263 |
| 12 | 1,809.6 | 49.0 | 999.4 | 3,418,680 |

At twelve workers, SQL round-trip p99 was 1,538.1 ms. None of the 92 database
samples recorded a lock waiter or an increase in shared blocks read. Short
waits can fall between samples. Database-wide temporary bytes include other
SQL and cannot attribute temporary I/O to the GPS batch. The next bounded
profile records the batch statement's temporary blocks read and written under
the same counter epoch and call-count checks as the existing SQL metrics. Old
artifacts remain readable and have no statement-level temporary I/O values.

### Optimized write-path comparison on November 24, 2026 (Alberta)

[Run 45533825001](https://github.com/Davinder498/SafeBus-GLM/actions/runs/45533825001)
tested main revision `5130b2f78400f5558befdbe90e918b0ae6ddafaa`. Four and eight
workers on the optimized write path each accepted 5,000 fixes with zero late
updates. Their p99 was 1,429.9 and 1,355.6 ms, respectively, above the 1,000 ms
gate. The original path measured 1,530.3 and 1,467.7 ms at those worker counts.
The five complete windows recorded zero temporary blocks read or written by
the batch statement.

The optimized twelve-worker screen stopped after 2,500 sends. It accepted
2,051 fixes, with 51 late and 449 HTTP 503s. Nine of 52 batch transactions did
not commit. Recovery's PostgreSQL logs from 03:06:40–03:06:50 UTC on November
25 showed nine `57014` statement timeouts on the batch call. Error contexts
spanned the batch wrapper, native ingest, active-session checks and the
location-change trigger. They do not attribute the latency to a single
operation. No session-mode client-limit error appeared in that window.
The [artifact](https://github.com/Davinder498/SafeBus-GLM/actions/runs/45533825001/artifacts/14986529911)
records verified function restoration and fixture cleanup. Sustained and
combined capacity were not qualified.

Recovery direct-batch evidence records aggregate failed batch and item counts
by transaction phase and allowlisted SQLSTATE. Unknown errors use a fixed
label. HTTP responses still use the same generic failure, deadlines are
unchanged, and evidence excludes provider error text and request payloads.

### 10,000-bus GPS timing run

In **Run isolated recovery capacity**, select `10000` buses and
`android_gps_direct_compare` at the reviewed main SHA. Enter
`RUN_RECOVERY_DIRECT_GPS_10000`. The workflow provisions synthetic drivers in
Recovery and uses eight database connections and 50-fix direct batches.

The run offers one synchronized burst of 10,000 fixes. If the burst can be
reconciled, the staggered window offers ten fixes per driver at three-second
intervals. Each measured window records planned, sent, accepted and late fixes,
acknowledgement percentiles, time to the last acknowledgement and elapsed
window time. `loadElapsedMs` measures from the scheduled start until scheduling
ends and every upload has settled, including failed attempts.
`positionVerificationMs` measures the subsequent final position check and is
null if that check could not run.
The existing `elapsedMs` also includes final position verification, transport
shutdown, and the closing database sample and counter read. The runner can
stop on transport, integrity or isolation failures.
The one-second p99 threshold does not apply to this profile. This run covers
synthetic GPS ingestion only, with the existing gateway and database limits.

GPS window evidence records unsent fixes and attempted uploads that received
no valid acknowledgement. If cancellation interrupts a driver during the
simulated cooldown, the queued fix counts as cancelled before send. A failed
upload does not establish whether its fix committed.

The evidence records driver token lifetime at each existing session gate.
It includes the required and minimum remaining time and counts of missing or
short expiries. This makes setup failures visible before GPS measurement.
The evidence contains no identities or token values.

For each direct batch window, `gatewayAdmission` records the gateway's peak
admitted fixes and the number refused at its admission limit. It also records
the loopback HTTP server's connection limit and the number of sockets dropped
at that limit. Admission refusals can occur while database writers are busy.
The socket and admission counts help interpret shortfalls alongside committed
batches, SQL error codes and request timeouts. A local regression with database
writers held before commit admitted 1,000 of 10,000 simultaneous synthetic
submissions and returned 503 to the remaining 9,000 at the existing limit.
