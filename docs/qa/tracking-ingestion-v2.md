# Tracking ingestion v2 — implementation foundation

Target: 10,000 active buses (3,333 fixes/s; 10,000 simultaneous burst), 500,000 guardians, 100,000 location deliveries/s at five seconds, ETA and notification independence. This component is **not deployed** and is not evidence of capacity.

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
