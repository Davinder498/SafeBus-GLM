# Native GPS write-path optimization: measurement and release protocol

Status: the two SQL optimizations are **prepared source**, not an installed production migration. They must be applied in this order:

1. `20261123095000_bounded_native_tracking_heartbeats.sql`: avoid rewriting two last-seen timestamps on every three-second fix.
2. `20261123113000_native_cursor_existing_row_fast_path.sql`: read and lock a persisted device cursor before attempting the first-time insert.

## Verified behavior

The embedded PostgreSQL/PGlite A–B–A comparison (original → both optimizations → original) exercises the complete native GPS function with a verified synthetic driver session. It checks accepted positions, device sequence increments, identical current-location row count and every location trigger execution. A BEFORE INSERT instrument counts speculative device-cursor inserts: `N → 0 → N` for the three consecutive phases of `N` fixes.

It also records each phase's mean, median and p95 observed in the embedded engine. Treat those timings as **diagnostic only**: PGlite is single-connection and excludes network, device scheduling, Supabase Realtime partition maintenance, competing tenant/guardian reads, and provider push/email. No percentage latency gain or 10,000-bus qualification may be claimed from this test.

## What must be measured before a protected production rollout

- Verify the exact installed function definition and original grants against the reviewed source; confirm current app/database releases and recent backup/restore evidence.
- Qualify genuine Android REST GPS arrivals against the isolated Recovery project at 10, 100, then 500 buses, one fix every three seconds. Report attempted, accepted, late, rate-limited and lost events separately. Test sustained load and device reconnects, not just a single burst.
- Capture HTTP/server p50/p95/p99; `pg_stat_statements` calls, mean and max; lock waits, WAL and connection occupancy. Avoid resetting provider-wide statistics during the test.
- Run both old and optimized functions on equivalent clean synthetic fixture cohorts, with the same fleet/tenant distribution. Do not treat results from differently sized cohorts as a valid A/B comparison.
- Production rollout must be a **protected** release with a tested rollback to the captured baseline. Do not invoke the pending SQL manually as a substitute for release proof.
- Verify that duplicate/out-of-order GPS is rejected correctly, replays acknowledge once, ended trips do not publish as live, and client roles/tenants never cross.
- Keep shared tracking at 1 active worker until ingestion and end-to-end guardian/notification load is qualified independently.

## Known limitation on November 23, 2026

Recovery's Supabase-owned Realtime partitions were behind the current date. The combined workload is blocked by a preflight check until the provider restores managed partitions. The Android GPS-only workload can still isolate HTTP ingestion, but **must not be reported as complete map/notification certification**.

A 10,000 active-bus fleet at three-second GPS intervals requests approximately 3,333 ingestions/second before guardian reads and worker dispatch; reducing speculative writes alone does not prove that throughput.

## Guarded Recovery HTTPS A–B–A (prepared 2026-11-23)

The existing protected GitHub Actions **Run isolated recovery capacity** workflow now has a third workload, `android_gps_compare`. The short mode accepts **10 buses** with confirmation `RUN_RECOVERY_GPS_COMPARE`; the sustained mode accepts **100 buses** with confirmation `RUN_RECOVERY_GPS_COMPARE_100`; it retains the exact reviewed `main` SHA and Recovery-only credentials and environment identity guards.

The runner uses the same ten synthetic drivers, trips and device credentials for all three real authenticated HTTPS phases, each with staggered and synchronized three-second GPS updates:

1. **Original function**: device sequences 1–20.
2. **Optimized function**: atomically apply heartbeat and fast-path SQL to isolated Recovery only; sequences 21–40.
3. **Original restored**: verify that the function definition, owner and grants exactly match the previously captured baseline; sequences 41–60.

The comparison checks all planned/attempted/accepted GPS sends, latency p50/p95/p99, errors and position/sequence reconciliation. It records only sanitized aggregate evidence and hashes, never credentials, coordinates, student details or device identifiers. If any phase fails, the runner attempts to restore the exact baseline in its `finally` **before** quarantining the Data API, removing synthetic fixtures or verifying the schema fingerprint. The final evidence must show both `nativeGpsComparison.restored=true` and `cleanupVerified=true`. The runner refuses an unfamiliar function digest or unexpected grants.

**Recovery on interrupted runs:** The same protected workflow also offers `android_gps_restore`, exactly **10 buses**, and confirmation `RESTORE_RECOVERY_GPS_BASELINE`. It does **not** generate GPS traffic or create accounts. On the Recovery project alone it accepts only the independently verified original checksum `a567e385b73bf59ef71a9fc8d47597ad` or the optimized checksum `cc339d880a35380907eab09b456739c2`. It replays the original source from the reviewed `20261109214533_remove_gps_history.sql` file, revokes authenticated schema access to quarantine Recovery, and verifies unchanged function ownership and grants. Both source and optimized checksum were confirmed in rollback-only transactions against Recovery PostgreSQL 17.

An abrupt host termination can still bypass in-process restoration and synthetic cleanup. If so, first run the protected `android_gps_restore` option, then run the separately reviewed **Recovery synthetic cleanup** for the interrupted run and verify the environment is empty, quarantined, and schema-consistent. Restoration alone does **not** delete synthetic users, trips or queues. Do not retry the A–B–A workload until both checks are complete.

**Interpretation:** These are isolated HTTP comparisons on Recovery; they are not a complete 100-, 500-, 5,000- or 10,000-bus capacity certificate, does not exercise guardian maps or push/email, and does not install any SQL on production. Broader fleet tests beyond 100 require separate qualification. Missing Supabase-managed Realtime partitions continue to block **combined** worker/guardian tests, not this Android GPS-only comparison.

## Sustained 100-bus HTTPS comparison

Select `buses=100`, `workload=android_gps_compare` and `confirmation=RUN_RECOVERY_GPS_COMPARE_100`, with the current reviewed main SHA. The short 10-bus mode and separately confirmed restoration remain available unchanged.

Each of the three phases uses 100 rounds of staggered arrivals and 100 rounds of synchronized arrivals at a 3-second cadence (approximately five minutes per pattern, ten minutes per phase). The planned total is 60,000 GPS updates; sequences per device are 1–200, 201–400, and 401–600. A failed stage stops the experiment and invokes existing restoration and cleanup; a partial run is not a passing comparison. An explicit driver JWT lifetime check covers the 30-minute workload plus margin. A 55-minute runner deadline and 65-minute job timeout reserve time for cleanup.

The runner samples aggregate database counters and connection/lock occupancy before, every 30 seconds during, and after each measured pattern. Counters are cumulative and include measurement overhead; compare deltas only when stats_reset is unchanged. CPU, memory, WAL and provider metrics require separate observation and are not inferred from these counters. No stats reset, production SQL, worker activation or deployment is performed. Compare p50/p95/p99, accepted/planned, late and backpressure counts, and resource deltas for each pattern separately across all three phases. The result must also verify restoration and cleanup.

### Correcting the simulated device queue after run 45286393425

The first sustained baseline staggered stage offered 9,998 of 10,000 scheduled fixes, all accepted, with two busy slots, zero late submitted requests and p99 471.6 ms. The simulator previously dropped busy collection slots rather than queueing them as Android does. The log cannot identify whether the earlier request was in flight or in its mandatory pause. This is a failed baseline, not an optimization result.

The sustained profile now keeps a bounded FIFO per simulated device (at most two outstanding fixes), preserves each scheduled collection timestamp and sequence, uses a conservative fixed 750 ms post-success pause (Android uses 500–750 ms), and measures end-to-end latency from the original collection time. It separately reports busy-in-flight versus cooldown slots, maximum queue wait and maximum device queue depth. No retry or extra concurrent request on a device is introduced. Every planned fix must still be accepted, no fix may be late, and final positions must reconcile. Queue saturation, error or an incomplete run still fails. Short diagnostic modes retain their previous fail-on-busy semantics. This change models nominal connected-device queueing, not offline or real physical-device behavior. All three comparison phases must use the same revised profile.

## Diagnostic continuation after run 45292372767

The revised FIFO test passed staggered traffic (10,000/10,000, p99 264.5 ms) but stopped the baseline synchronized window after 1,300/10,000 sends (all accepted; 100 late; p99 7,033.2 ms). Recovery gateway logs independently showed upstream service time reaching 6,130 ms. Historical database SQL execution maximum was 7,192.95 ms; these cumulative counters do not isolate the particular burst. No scheduled jobs were active. The GPS SQL path also invokes contract checks, shared disposal locks, two invalidation queues and live-progress cache invalidation. Their relative contribution to the spike is unproven.

The sustained comparison now treats only fully drained, position-reconciled performance stops (bounded queue saturation or late updates with no actual transport/auth/ack errors) as diagnostic continuation. Unsent cancellations are reported separately. Security, correctness, transport or monitoring errors still stop the run. Each of the six windows resets only run-owned transient GPS locations, device cursors, heartbeat fields and tracking queues on quarantined Recovery, with all triggers enabled; the same synthetic driver accounts and route fixtures are reused. This is equivalent fresh logical tracking state, not a guarantee of identical database physical cache/WAL state.

A dedicated observation connection samples aggregate active wait types, lock waits and connection occupancy every second, plus authenticated REST GPS SQL counters before/after each window. Compare counter deltas only if stats_reset and dealloc are unchanged; partial windows are not directly equivalent to completed five-minute windows. The extra monitor connection and sampling overhead apply equally to all windows. The final workflow still fails if any stage fails performance, even if all six stages completed. Restoration and cleanup remain mandatory. Do not deploy based on a partial comparison.

## Production-first capacity work

The production history cleanup timeout repair in `20261122004653_tracking_history_worker_timeout.sql` was installed on 2026-11-24 UTC after a rollback rehearsal against the exact production function/job hashes and a guarded transaction. The installed command hash is `b3af6d0df7a9ca40b8bfb025adadb7c8`. This changes only the minute cleanup job statement budget from 750 ms to 8 s, retaining its 100 ms lock timeout and existing bounded 48-hour retention rules. The first observed scheduled execution succeeded in 1.550 s; sustained success remains to be checked. The existing operational release can reconcile the installed state.

Production still writes both legacy and shared invalidation queues per GPS fix. The existing shared producer coalescing migration is now wired into the protected operational release as `shared_tracking_producer_coalescing`, with the observed production function checksum, predicted post-change checksum (derived from the live catalog and reviewed SQL body), exact source digest, rollback rehearsal, and read-only trigger/privilege verification. It is **not installed**. Before installation verify legacy Android polling and current shared-channel behavior, then use the protected release and observe freshness and queues. Do not deploy the native GPS optimizations on the basis of the failed Recovery comparison. Neither cleanup nor coalescing establishes capacity at 10,000 buses.

## Direct GPS comparison at 500 buses

The 500-bus direct workload repeats the same synchronized burst against the
original and optimized SQL at eight database connections. Each window offers
5,000 updates. It compares reconciled execution time,
WAL and end-to-end latency under the same inputs. The optimized write path
reuses the two pending SQL files above and must match the reviewed checksum.
The runner repeats its gateway authorization and retry checks after switching.

The optimized screen must meet the one-second p99 target and reconcile every
fix to proceed to the two sustained workloads.
Both sustained workloads must meet the same threshold. The runner restores
the original function and its grants, removes its private batch function and
verifies fixture cleanup. Interrupted runs require independent restoration
and fixture checks before another workload starts.
