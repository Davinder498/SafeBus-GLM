# SafeBus Alberta — Capacity Assumptions

**Status:** Draft — awaiting product-owner and engineering sign-off
**Owner:** Engineering Lead
**Phase:** 0 — Product and governance baseline
**Last updated:** 2026-08-12

---

## 1. Purpose

Phase 0 requires **written capacity assumptions**, including a precise
definition of "500,000 users" and a worst-case 20,000-bus design target.
These numbers drive Phases 4, 9, and 12. They are assumptions, not measured
production capacity — measurement happens in Phase 9 load tests.

## 2. Precise definition of "500,000 users"

"500,000 users" alone is ambiguous. SafeBus commits to the following
precise, separately designed numbers:

| Metric                             | Definition                                                             | Target                      | Notes                                                      |
| ---------------------------------- | ---------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------- |
| **Registered accounts**            | Distinct auth users across all tenants                                 | 500,000                     | Storage/auth design target; not concurrency.               |
| **Daily active users (DAU)**       | Distinct users with ≥1 authenticated action in a day                   | 150,000 (30% of registered) | Conservative engagement estimate.                          |
| **Expected concurrent users**      | Simultaneously authenticated sessions during a normal operating window | 30,000                      | Mostly guardians checking bus status during AM/PM windows. |
| **Emergency peak concurrency**     | Concurrent load during a weather/incident event                        | 100,000                     | Drives realtime + API backplane design (Phase 9).          |
| **Simultaneously reporting buses** | Buses actively streaming location during operating peaks               | 20,000                      | Worst-case architectural design target.                    |

These are four different problems. Conflating "registered" with "concurrent"
under-designs the system; this table separates them.

## 3. Worst-case bus-reporting model

SafeBus is **architected for 20,000 simultaneously reporting buses**, while
commercial commitments remain staged (see §4). Assumed per-bus location
characteristics:

| Parameter                        | Assumption                                                                  |
| -------------------------------- | --------------------------------------------------------------------------- |
| Update source                    | Driver phone via secured session-bound RPC (`update_bus_tracking_location`) |
| Update frequency, moving bus     | 1 update / 5 s                                                              |
| Update frequency, stationary bus | Downsampled (Phase 7 adaptivity)                                            |
| Payload per update               | ~1 current-location row + 1 location-history row                            |
| Active window                    | Operating day (~8 h), tracking only during an authorized active trip        |
| Offline queue                    | Durable, ordered, deduped (Phase 7)                                         |

Implied steady-state write load at 20,000 buses × 1/5s = **4,000
location writes/s**, plus current-location upserts. This is the headline
number for Phase 9 ingestion design (separate ingestion path from app DB,
durable stream, optimized current-location store, time-partitioned history,
backpressure/circuit breakers).

## 4. Staged commercial ceilings (Phase 12)

Commercial commitments grow in defined stages. Each stage requires its own
capacity, security, privacy, support, and commercial review, and expansion
**stops automatically** if reliability/security thresholds are breached.

| Stage                                   | Target                                               | Notes                                                                                                              |
| --------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| CR1 controlled pilot                    | Up to 100 buses                                      | One to three approved public-school-authority tenants; high-touch; at least 60 operating days; governed by DL-010. |
| Stage A — Early commercial availability | 101–250 buses                                        | Expansion beyond the CR1 pilot requires a new decision backed by measured pilot evidence.                          |
| Stage B — Regional expansion            | Up to 1,000 buses                                    | Multiple independent tenants; proven support/billing.                                                              |
| Stage C — Large-customer readiness      | Up to 5,000 buses                                    | Repeat DR/peak-load exercises; enterprise vendor agreements.                                                       |
| Stage D — Provincial-scale capacity     | Up to 20,000 active buses / 500,000 registered users | 24/7 critical-incident capability during operating periods.                                                        |

A successful CR1 pilot does **not** automatically authorize Stage A or a
20,000-bus launch.

## 5. Guardian concurrency model

The emergency-peak concurrency target (100,000) assumes a major service
disruption causes a broad guardian reconnect. Phase 9 must:

- Remove per-guardian database fan-out from every bus update.
- Aggregate realtime updates by authorized route/trip channels.
- Add connection and message budgets.
- Test peak guardian reconnection after a simulated disruption.

## 6. Storage growth model (Phase 9 input)

| Source                  | Growth driver                 | Assumption                                                |
| ----------------------- | ----------------------------- | --------------------------------------------------------- |
| Raw location history    | 20,000 buses × 1/5s × 8 h/day | Time-partition and downsample; auto-delete per retention. |
| Audit records (Phase 2) | Every sensitive action        | Append-only; retention per Phase 3.                       |
| Notification outbox     | Pickup/drop-off events        | Retention per Phase 3.                                    |
| Trip records            | Daily trips                   | Operational retention.                                    |

Unbounded growth is explicitly disallowed by the Phase 9 exit gate.

## 7. What these numbers are not

- They are **not** measured production capacity — that is Phase 9.
- They are **not** a launch commitment — staging is governed by Phase 12.
- They are **not** vendor SLAs — enterprise limits are negotiated in Phase 9.

## 8. Changes to this document

Capacity assumptions change through a `decision-log.md` entry and must be
re-tested in the relevant phase (Phase 9 for load, Phase 12 for stage
ceilings).

---

**Sign-off**

| Role             | Name      | Date | Signature |
| ---------------- | --------- | ---- | --------- |
| Product Owner    | _pending_ |      |           |
| Engineering Lead | _pending_ |      |           |
