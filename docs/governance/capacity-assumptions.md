# SafeBus capacity specification

Status: customer-selected planning target; remaining assumptions and service
objectives proposed. No demonstrated application capacity or launch approval.
Updated: 2026-10-12 (America/Edmonton). Decision: [DL-020](decision-log.md#dl-020--capacity-planning-and-local-workload-simulation).

## Target and meaning

| Metric                         | Planning value | Basis                                                               |
| ------------------------------ | -------------: | ------------------------------------------------------------------- |
| Registered accounts            |      1,000,000 | Customer's requested target; not concurrent or monthly active users |
| Tenant organizations           |          2,000 | Customer's requested target                                         |
| Simultaneously reporting buses |         10,000 | Customer's requested fleet, conservatively treated as all active    |
| Concurrent active users        |        100,000 | Customer selected on 2026-10-12 for capacity planning               |
| Normal concurrent active users |         30,000 | Provisional sensitivity case from the earlier draft                 |

These replace DL-004's older draft of 20,000 buses / 500,000 accounts for this
workload specification. Statements that the app is already architected or proven
for those older numbers are withdrawn. Existing commercial/pilot authorization
and expansion approvals are unchanged.

For the peak model, the 100,000 total includes 10,000 active drivers, 2,000 admins
(one per tenant) and 88,000 guardian clients. Roles sum to the chosen concurrency;
drivers are not added on top of it. This role mix is proposed, not a forecast.
If the intended target is 100,000 guardians plus drivers/admins, revise the model
and repeat the calculations before selecting infrastructure.

## Workload inputs

The machine-readable input is [capacity-workload.json](capacity-workload.json).
`pnpm capacity:model` calculates the same scenarios without network activity.

| Input                        |                               Value | Evidence or qualification                                                                         |
| ---------------------------- | ----------------------------------: | ------------------------------------------------------------------------------------------------- |
| Active GPS interval          |                           3 seconds | Current Android `TrackingCadence.ACTIVE_TRIP_INTERVAL_MS`; web fallback minimum is also 3 seconds |
| Guardian polling             |                          15 seconds | Current `useVerifiedGuardianData` interval                                                        |
| Guardian calls per refresh   |                                   2 | Proposed map/detail workload; actual page mix and additional calls must be measured               |
| Admin refresh                |                2 calls / 30 seconds | Proposed workload assumption                                                                      |
| Operating time               |                         8 hours/day | All buses active for all eight hours; conservative volume projection                              |
| Linked buses per guardian    |                                   1 | Proposed fan-out assumption; test additional linked buses before commitment                       |
| Largest tenant share         |                                 20% | Proposed skew in bus traffic; never less than the average share in small scenarios                |
| Peak login burst             |                       10,000/minute | Proposed one-minute burst, not sustained throughout the operating day                             |
| Peak notification deliveries |                          100/second | Proposed channel delivery demand, not just notification source events                             |
| Reconnect event              | 50% of buses offline for 15 minutes | Current 3-second collection remains the model while offline                                       |
| Recovery window              |                           5 minutes | Proposed backlog-drain objective; per-device pacing does not establish this fleet recovery time   |
| History sensitivity          |                             30 days | Existing draft retention schedule; not approved or proven to be executing                         |

The older Phase 7 documentation's five-second/adaptive table did not match the
current native collector. This milestone corrects the documentation and workload
input; it does not change device cadence or implement pacing/downsampling.

## Derived peak demand

| Demand                                                  | Calculation / result                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| New GPS events                                          | 10,000 / 3 = **3,333.33 events/second**                                        |
| Raw history per operating day                           | 10,000 × 8 × 3,600 / 3 = **96 million events**                                 |
| Raw history at draft 30-day sensitivity                 | **2.88 billion events**, excluding indexes, WAL and replicas                   |
| Guardian polling calls                                  | 88,000 × 2 / 15 = **11,733.33 calls/second**                                   |
| Admin calls                                             | 2,000 × 2 / 30 = **133.33 calls/second**                                       |
| Login burst                                             | 10,000 / 60 = **166.67 requests/second**                                       |
| Notification deliveries                                 | **100/second**, with channel/provider semantics still to be specified          |
| Baseline mixed request/delivery work                    | **15,466.67/second** during the combined stress window                         |
| Uncoalesced per-guardian GPS invalidations              | 88,000 / 3 = **29,333.33 delivered messages/second**                           |
| Guardian calls if every invalidation triggers two calls | Polling + refetch = **70,400/second** upper-bound model                        |
| Hottest tenant GPS share                                | **666.67 new events/second** at 20%                                            |
| Reconnect backlog                                       | 5,000 buses × 900 / 3 = **1.5 million events**                                 |
| Extra evenly spread catch-up                            | 1.5 million / 300 = **5,000 events/second**, in addition to ongoing collection |

Events are not SQL-operation counts. Ingestion also updates current location,
history, authorization, progress and notifications; write amplification must be
measured. The refetch calculation is an uncoalesced upper-bound model: client
coalescing and latency affect actual rates. Neither bound is a benchmark result.

The Android service now uses bounded, randomized per-device upload scheduling
([implementation and limits](../qa/android-upload-recovery.md)). Evenly spreading
catch-up over five minutes remains a proposed fleet workload, not demonstrated
device behavior. Reconnect burst timing and queue durability require separate
physical-device tests. Disk estimates need actual tuple/index/WAL sizes and a verified
retention policy; raw event count alone does not establish storage GB or cost.

## Synthetic test stages

| Scenario  | Active buses | Tenants | Concurrent users | Purpose                                                               |
| --------- | -----------: | ------: | ---------------: | --------------------------------------------------------------------- |
| pilot     |          100 |       3 |            1,000 | Small fixture/traffic stage; no authorization to operate a real pilot |
| regional  |        1,000 |     200 |           10,000 | Intermediate query and tenant-distribution model                      |
| normal    |       10,000 |   2,000 |           30,000 | Full fleet, lower viewer concurrency                                  |
| peak      |       10,000 |   2,000 |          100,000 | Customer-selected planning peak                                       |
| reconnect |       10,000 |   2,000 |          100,000 | Peak plus accumulated offline fixes and reconnect demand              |

The local simulator samples rates only. It does not instantiate this many
clients, sessions or database rows. Hosted test stages and their durations must
be approved separately; they are not new commercial stage ceilings.

## Proposed acceptance criteria for a future hosted run

These are review proposals, not promises or observed results. Fix thresholds
before a paid run rather than changing them to pass afterwards.

| Measure                                           | Proposed criterion                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Authorized API round trip from the test region    | p95 ≤ 1 second; p99 ≤ 2 seconds; report per role, operation and tenant class                                               |
| Fresh GPS visibility with a healthy online client | p95 recorded-fix age ≤ 20 seconds; p99 ≤ 30 seconds; measure end to end separately from API latency                        |
| Unexpected HTTP failures / throttling             | < 0.1% during steady load; intentional denial/fault tests counted separately                                               |
| Durability / correctness                          | Zero acknowledged unique events lost; duplicate retries do not create extra history or regress current position            |
| Authorization                                     | Zero cross-tenant, cross-school, unlinked-guardian or unassigned-driver disclosures, including under load                  |
| Reconnect backlog                                 | Drain the stated 1.5-million-event workload within five minutes while fresh traffic still meets its objectives             |
| Notifications                                     | Proposed p95 ≤ 60 seconds for ordinary deliveries; urgent deadlines and provider failure behavior require product approval |
| Tenant fairness                                   | Hot tenant does not cause other tenant classes to breach the agreed thresholds; report each separately                     |
| Sustained operation                               | Proposed eight-hour soak; no growing backlog, connection leak, uncontrolled disk growth or progressive slowdown            |
| Spare capacity                                    | Propose a separately budgeted 2× peak stress run; record saturation and safe degradation, not a guaranteed 2× SLA          |

A future run must report offered, sent, admitted, rejected, unsent, completed and
persisted work. Closed-loop clients that merely slow down are insufficient proof
that the offered target was reached. A generator-limited run is inconclusive.

## Evidence required before capacity can be certified

1. An approved isolated Canadian environment with production-equivalent schema,
   Auth, RLS, functions, indexes, extensions, provider limits and network path.
   Keep security controls enabled. Migrations 0122–0124 and their security
   acceptance remain deferred and must be resolved for final capacity evidence.
2. Synthetic volume equivalent to one million accounts and 2,000 tenants, plus
   representative aged history, skew and indexes. Accounts/auth setup requires a
   reviewed fixture plan; no signup flood, customer data or external notifications.
3. Explicit region, compute, disk, IOPS, pool limits, Realtime quotas and cost
   ceiling; approved duration and stop conditions. A paid plan name alone is not
   a capacity specification. [Supabase compute](https://supabase.com/docs/guides/platform/compute-and-disk)
   and [Realtime limits](https://supabase.com/docs/guides/realtime/limits) must be
   verified for the selected configuration.
4. Real synthetic JWT/session/role behavior, independent denial cases, real
   HTTP/WebSocket workload and provider tests or clearly labelled provider stubs.
   Include sign-in/refresh, query/history/admin work and emergency reconnects.
5. Warm-up, staged load, soak, saturation, outage/restart and recovery runs.
   Capture generator utilization and achieved arrival rates, API percentiles,
   locks, slow queries, CPU, memory, I/O, connections, WAL, history growth,
   Realtime delivery/lag, queue age, fairness and accepted-event reconciliation.
6. An immutable report naming the code/schema/workload digests, infrastructure,
   quotas, generator topology, time window, cost, errors and bottlenecks. Obtain
   human acceptance and a separate controlled-pilot decision.

Changes to rate, role mix, retention or service objectives require an updated
decision entry and re-testing. [Local tooling and evidence checklist](../qa/capacity-workload-harness.md)
describes the current preparation milestone and its limitations.
