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
