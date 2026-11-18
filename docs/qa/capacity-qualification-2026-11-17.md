# Capacity qualification preparation — November 17, 2026

Status: model and local generator verified; hosted capacity execution not started.
Recovery isolation and API verification have since passed. See
[the bounded hosted runner](recovery-capacity-runner-2026-11-18.md) for the current
execution plan; the temporary-branch proposal below is historical and superseded
by owner approval of the existing Recovery project. No new branch or spend is requested.
No claim of 500-, 5,000- or 10,000-bus capacity. No runtime, role, consent,
retention, production configuration or API behavior changes in this milestone.

## Acceptance by role

| Role                   | Required hosted evidence                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Guardian               | Current links, assignments, tenant/session/MFA checks on every read; no names or coordinates from another guardian; notifications continue with app closed subject to consent. |
| Driver                 | Only assigned active trip accepts GPS; acknowledged fixes reconciled; older replay cannot regress current position; GPS remains responsive during cache fills.                 |
| School authority admin | Tenant-scoped operations remain responsive; no other authority's records.                                                                                                      |
| School-scoped admin    | Existing school scope remains enforced under load.                                                                                                                             |
| Transportation admin   | Existing permitted operations and tenant scope remain enforced under load.                                                                                                     |
| Platform admin         | Existing privileged MFA and audited operations unchanged; no new visibility bypass.                                                                                            |

Tests must use synthetic identities and real role JWTs, never substitute a
service-role read for user authorization evidence. Provider stubs prove queue
behavior only, not physical receipt. No test messages go to existing people.

## Proposed first hosted stage

The only connected SafeBus project is production BusSafe in `ca-central-1`,
PostgreSQL 17.11. Read-only branch inventory on November 17 returned only main.
Repository instructions exclude production load testing and do not approve a
second environment. Thus preparation can proceed, but hosted execution awaits
approval of a temporary isolated target and its charges.

Proposed decision: approve one data-free temporary Supabase branch in the same
Canadian region, for at most 24 hours, with an initial US$10 operating budget
for setup and a bounded 500-bus exploratory stage. This is a spending objective,
not a provider-enforced cap or a promise the stage fits the budget. Do not scale
compute or extend duration beyond that scope without reviewing the estimate.
Check projected costs before provisioning and before each run. Stop early if
usage cannot be measured or is projected to exceed the budget; remove the
temporary branch after preserving non-sensitive evidence, never merge it.

[Supabase branch billing](https://supabase.com/docs/guides/platform/manage-your-usage/branching),
checked November 17, lists default Micro compute starting at US$0.01344/hour,
plus other usage. Branches are not covered by the spend cap or compute credits.
That minimum is not the price or sizing for fleet qualification. Full-scale
load/soak and any higher compute require measured baseline demand, provider
quotas, generator capacity, and a separately costed execution plan.

Before creating the branch, inspect automatic migration/GitHub integration
behavior. The historical migration chain is not safe to replay blindly. Halt
if a data-free branch cannot be provisioned without replay or production side
effects. Reconcile a reviewed schema-only baseline, functions, triggers, grants,
extensions and RLS against the installed production fingerprint; use no copied
customer rows, credentials, webhook targets or production delivery secrets.
Disable external delivery only in the isolated environment using explicit test
adapters; preserve consent and authorization. Verify target ID on every writer.

## Run sequence after target approval

1. Verify schema and configuration parity, security denials, synthetic fixture
   cleanup, external-delivery isolation, recovery export and runner stop switch.
   Capture compute, disk, connection pools, cron concurrency and Realtime quotas.
2. Use actual multi-connection PostgreSQL/HTTP clients to race GPS writes with
   cache fills, warm hits, route edits, trip completion and source cleanup. Check
   lock waits and ensure no invalidated cache resurrection or stale disclosure.
   Embedded single-session tests cannot prove these races.
3. Prove generator accounting with a ten-bus smoke stage. Ramp to 100 then 500
   buses for bounded five-minute windows. Exercise no-viewer notifications first,
   then the light-viewing matrix; report offered and achieved rates separately.
   Include current and legacy client mixes as distinct runs. Extra old-client
   traffic is not included in the current-client arithmetic.
4. Monitor ingest/API p95/p99, SQL/lock waits, CPU/I/O/WAL, available connections,
   worker queue age, notification backlog, Realtime delivery and tenant fairness.
   Verify each acknowledged fix/notification intent using sequence identifiers;
   do not log names, coordinates, tokens or secrets in the evidence report.
5. Abort for any scope disclosure or lost acknowledged event immediately. Stop
   load if unexpected errors exceed 1% or p99 exceeds five seconds for a minute,
   queue age grows continuously for two minutes, connections exceed 80% of the
   usable budget, or telemetry/generator accounting fails. These are proposed
   exploratory safety stops, not relaxed acceptance targets.
6. Stop arrivals, measure drain and prove source cleanup/recovery. Preserve code,
   schema and workload digests, settings, timestamps and metrics. Report a
   generator/limit failure as inconclusive, not as successful fleet capacity.

Only after this baseline choose compute and budget for 5,000/10,000-bus ramps,
all five viewer mixes, concentrated tenant skew, a 50%-bus reconnect backlog,
Realtime rejoin/auth bursts, provider failure/retry, and an eight-hour soak.
The proposed objectives in capacity-assumptions.md remain proposals; lock them
before paid qualification. Legacy-worker retirement, Play publication and
locked-phone notification/GPS testing remain separate release requirements.

## Local evidence

The 18 capacity tests and five-second loopback pilot sample pass. The viewer
matrix reports 15 arithmetic cases; the loopback sample exercises only the
historical pilot rate and acknowledges 116 synthetic requests. Neither accesses
the production database, creates users, opens Realtime connections, or sends
provider notifications. Shared-cache correctness already has separate embedded
PostgreSQL/PostGIS tests and protected installation evidence.

Model input SHA-256: `39128af72702b35ba5c6f2807f5cfa1393a48ea0c4ff269872431067e8eb8ace`.
Baseline app revision: `a40008fbc6c24ee16f35bb316bda3287aad67f55`.
The PR revision identifies the model implementation used for this evidence.
