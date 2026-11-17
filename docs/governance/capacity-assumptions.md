# SafeBus capacity specification

Status: customer-selected planning target; remaining assumptions and service
objectives proposed. No demonstrated application capacity or launch approval.
Updated: 2026-11-17. Owner confirmed the fleet target as 5,000–10,000 buses. Decision: [DL-020](decision-log.md#dl-020--capacity-planning-and-local-workload-simulation).

## Current qualification preparation — 2026-11-17

The independent shared worker and both static-geometry/live-progress caches are
installed. See [live-progress release evidence](../qa/shared-live-progress-2026-11-17.md#installed-evidence--2026-11-17).
Earlier prepared/pending descriptions below are historical context, superseded
by that evidence and the independent-worker release. Legacy Android fan-out is
still retained. No fleet capacity is certified.

`pnpm capacity:model` now includes a separate `viewerSensitivity` matrix for
500, 5,000 and 10,000 buses. It assumes 50 distinct eligible guardian clients per
bus and mutually exclusive map, home-summary and notification-only populations.
The five mixes are no viewers, 10% map/10% summary, 50% map/10% summary, all map,
and all summary. These are sensitivity cases, not expected usage or attendance.
The all-map case intentionally exceeds the older 100,000 concurrent-user input;
the historical `scenarios` remain labelled comparisons and are still the input
to the loopback simulator. The simulator does not execute this viewer matrix.

Current-client steady-state estimates use one position RPC per three seconds,
one map-detail RPC per fifteen seconds, and two home RPCs per thirty seconds.
Jitter/backoff can lower rates; control/manual refreshes, legacy clients, login,
admin traffic and additional devices are excluded and can add demand. Cached
math does not eliminate authorization or parent-specific RPCs. Hidden/offline
clients contribute no viewer reads in these cases.

Notification load is independent: two events per eligible guardian in a
15-minute wave, with three enabled channels (inbox/push/email), even at zero
viewers. This is a fully opted-in stress assumption, not permission to deliver,
a prediction, or a source-event count. Deduplication, recipient consent, multiple
devices, retries and actual channel/provider limits need hosted measurement.

|  Buses | Eligible guardians | GPS updates/s | RPCs/s at 10% map + 10% summary | Channel deliveries/s in proposed wave |
| -----: | -----------------: | ------------: | ------------------------------: | ------------------------------------: |
|    500 |             25,000 |        166.67 |                        1,166.67 |                                166.67 |
|  5,000 |            250,000 |      1,666.67 |                       11,666.67 |                              1,666.67 |
| 10,000 |            500,000 |      3,333.33 |                       23,333.33 |                              3,333.33 |

At zero viewers all three RPC estimates become zero while GPS/notification
estimates remain unchanged. At 10,000 buses, all-map traffic is 200,000 RPCs/s;
all-summary is 33,333.33 RPCs/s. These are arithmetic, not measured throughput.
See the [bounded execution proposal](../qa/capacity-qualification-2026-11-17.md).

## Current owner direction — 2026-11-10

Fleet scope is 5,000–10,000 buses, superseding the commercial closure tracker's
25,000-bus entry. The upper planning bound below stays 10,000; `fleet5000` now
provides an explicit intermediate sensitivity case. Guardian concurrency remains
unconfirmed for the commercial scope. Older registered-user and concurrency inputs
below remain sensitivity assumptions, not demonstrated capacity.

Guardian home now has a prepared 30–35 second check policy with rate-limited live
hints, hidden/offline cancellation and failure backoff. Live maps retain frequent
updates. The model reports home traffic separately; map/fallback traffic is an
alternative page mix. See [implementation, release and limits](../qa/guardian-home-fleet-refresh-2026-11-10.md).
Read-only production inspection on November 15 verified the async queue is active:
its dispatcher runs every second with 10 trip visits and a 250-message budget.
Those conservative defaults are not 10,000-bus qualification. GPS history is removed;
updates replace the latest position. See the [tracking efficiency design and acceptance](../qa/tracking-refresh-efficiency-2026-11-15.md).
PR #453 is merged and website release 43703897891 succeeded. It separates
selected-map stop reads from ordinary position hints and releases tracking channels
while hidden/offline. Existing Android installations need a separate update.
A [compatible batch worker](../qa/tracking-worker-batch-2026-11-15.md) is prepared;
it reduces insert statements, not recipient messages or provider quota demand.

A [prepared independent shared worker](../qa/independent-shared-tracking-2026-11-16.md)
separates bus/tenant hints from legacy guardian pagination. Its sixteen bounded
partitions permit up to 4,096 trip visits/second by configuration; this is not an
observed throughput result. It adds one dirty-marker write per GPS update and up
to sixteen worker connections. Production remains on the prior worker until the
reviewed protected installation. Per-viewer reads, legacy fan-out, provider limits
and physical delivery remain unqualified.

For launch qualification, vary map viewers independently from eligible
notification recipients. Include zero map viewers with full notification demand,
then 10%, 50% and 100% viewer sensitivity cases. Viewer presence must never gate
notification generation. These are test cases, not owner-confirmed concurrency
forecasts or a change to personal notification consent.

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
| Guardian polling             |                          15 seconds | Fallback after verification; continuous successful live refreshes postpone this check             |
| Guardian calls per refresh   |                                   2 | Proposed map/detail workload; actual page mix and additional calls must be measured               |
| Admin refresh                |                2 calls / 15 seconds | Current admin fallback interval; call count remains a workload assumption                         |
| Operating time               |                         8 hours/day | All buses active for all eight hours; conservative volume projection                              |
| Linked buses per guardian    |                                   1 | Proposed fan-out assumption; test additional linked buses before commitment                       |
| Largest tenant share         |                                 20% | Proposed skew in bus traffic; never less than the average share in small scenarios                |
| Peak login burst             |                       10,000/minute | Proposed one-minute burst, not sustained throughout the operating day                             |
| Peak notification deliveries |                        6,667/second | Fifteen-minute student-event wave; two guardians and three enabled channels per event             |
| Reconnect event              | 50% of buses offline for 15 minutes | Current 3-second collection remains the model while offline                                       |
| Recovery window              |                           5 minutes | Proposed backlog-drain objective; per-device pacing does not establish this fleet recovery time   |
| History sensitivity          |                             30 days | Existing draft retention schedule; not approved or proven to be executing                         |

The older Phase 7 documentation's five-second/adaptive table did not match the
current native collector. This milestone corrects the documentation and workload
input; it does not change device cadence or implement pacing/downsampling.

## Derived peak demand

| Demand                                                  | Calculation / result                                                                          |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| New GPS events                                          | 10,000 / 3 = **3,333.33 events/second**                                                       |
| GPS update volume per operating day                     | 10,000 × 8 × 3,600 / 3 = **96 million events**                                                |
| Historical 30-day volume sensitivity (not stored)       | **2.88 billion update events**; production GPS history was removed; this is not retained rows |
| Guardian polling calls                                  | 88,000 × 2 / 15 = **11,733.33 calls/second**                                                  |
| Admin calls                                             | 2,000 × 2 / 15 = **266.67 calls/second**                                                      |
| Login burst                                             | 10,000 / 60 = **166.67 requests/second**                                                      |
| Notification deliveries                                 | **6,667/second** across inbox, push and email; provider demand is channel-specific            |
| Baseline mixed request/delivery work                    | **22,167/second** during the combined stress window                                           |
| Uncoalesced per-guardian GPS invalidations              | 88,000 / 3 = **29,333.33 delivered messages/second**                                          |
| Guardian calls if every invalidation triggers two calls | Polling + refetch = **70,400/second** upper-bound model                                       |
| Hottest tenant GPS share                                | **666.67 new events/second** at 20%                                                           |
| Reconnect backlog                                       | 5,000 buses × 900 / 3 = **1.5 million events**                                                |
| Extra evenly spread catch-up                            | 1.5 million / 300 = **5,000 events/second**, in addition to ongoing collection                |

The notification sensitivity case includes one million pickup/drop-off source
events in a fifteen-minute overlap, two guardians per student, and inbox, push
and email all enabled: 1,000,000 × 2 × 3 / 900 ≈ 6,667 channel deliveries/second.
Trip alerts, announcements, retries and additional devices add demand. A single
500,000-event boarding wave within one minute instead needs roughly 8,333 source
events/second and 50,000 combined deliveries/second with that recipient/channel
mix. Shortening the dispatch interval cannot establish either capacity.

Events are not SQL-operation counts. Ingestion also updates current location,
device/session state, authorization and the dirty-trip queue; write amplification must be
measured. The refetch calculation is an uncoalesced upper-bound model: client
coalescing and latency affect actual rates. Neither bound is a benchmark result.

The [guardian coordinator](../qa/guardian-refresh-coordination.md) now postpones
fallback polling after successful live verification and shares one subscription
owner across consumers of a private topic. The model's polling rate represents
a fallback/poll-only case. Its sum with every live invalidation remains a
conservative legacy bound, not the steady healthy behavior of this implementation.
The prior selected-map implementation made two calls per three-second live signal,
about 58,667 calls/second for the proposed 88,000-guardian population. This branch
keeps position checks at that cadence but bounds ordinary location-driven stop
checks to once per 15 seconds: about 35,200 calls/second, a 40% arithmetic reduction
in this specific steady-state scenario. Control/manual refreshes add requests;
initial joins, latency, page mix and failures change actual rates. Fallback-only
traffic remains two calls per 15 seconds. This is not a measured fleet benchmark.
Server per-guardian broadcasts remain and are still a capacity bottleneck.

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
| fleet5000 |        5,000 |     500 |           50,000 | Proposed intermediate fleet and viewer sensitivity case               |
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
   Keep security controls enabled and reconcile the current observed production
   baseline; do not assume historical pending filenames imply unapplied changes.
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

## Shared bus-feed transition — 2026-11-15

The next prepared change introduces a receive-only, opaque per-trip bus topic for
guardian map/detail screens. It broadcasts only a refresh hint; the existing
secured RPCs still supply coordinates after current authorization. The server
retains legacy per-guardian location hints during Android compatibility rollout.
Consequently this dual phase adds one produced message per trip pass, and does
not reduce recipient billing or establish fleet capacity. New screens suppress
duplicate legacy location refreshes only once their shared channels have joined.
Personal control events and periodic checks remain.

Retiring legacy fan-out is a separate controlled cutover after compatible web and
Android versions and locked-phone operation are verified. The unchanged 10-trip
worker budget and provider quotas still require measurement and sizing. See
[release and acceptance details](../qa/shared-bus-feed-2026-11-15.md).
