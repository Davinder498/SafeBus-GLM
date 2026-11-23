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
