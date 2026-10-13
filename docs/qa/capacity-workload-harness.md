# Capacity workload tooling

Status: local preparation only. Hosted capacity, Auth/RLS, physical devices,
provider behavior, dataset size and commercial launch remain unverified.

The customer authorized a capacity specification and repeatable local harness
on 2026-10-12 and selected 100,000 concurrent users for planning. The requested
target is 10,000 active buses, one million registered accounts and 2,000 tenants.
Other workload assumptions and service objectives remain review proposals.

## Commands

```bash
pnpm capacity:model
pnpm capacity:model --scenario=reconnect
pnpm capacity:simulate
pnpm capacity:simulate --scenario=peak --scale=0.01 --duration-seconds=10 --seed=42
pnpm capacity:simulate --fixture-reject-every=10
```

The model command performs arithmetic only. The simulation starts its own HTTP
fixture on `127.0.0.1` with an operating-system-assigned port, sends only to that
fixture, and closes it after the run. There is no target URL or external adapter.
Credentials, arbitrary config overrides and hosted target options are rejected.
It does not read `.env`, database configuration or Supabase credentials. A
dedicated core HTTP agent uses literal loopback rather than ambient proxy
settings. The fixture consumes only synthetic request kind/sequence/tenant-slot
metadata; it is not an implementation of the app's SQL/RPC or authorization.
Each logical work item becomes one synthetic HTTP request here. Real login,
notification batching and page workflows can require different numbers of API
calls. The model labels combined demand as work items, not measured app requests.

Limits: 30 seconds, 200 requests/second, 5,000 planned requests, 32 in-flight
requests, 1.5-second request deadlines and bounded request/response bodies.
Oversized plans fail before the server starts. The default is a 10% rate sample
of the small pilot workload for five seconds. Rate scaling does not scale or
seed a database population, create real sessions, or open WebSockets. Full peak
at scale 1 is intentionally refused locally.

## What is measured

The generator uses offered arrivals driven by elapsed time, not completions.
It never silently retries or builds an unbounded queue. When in-flight slots
are exhausted, offered work is counted as unsent and the generator check fails.
Responses, rejection, client errors, maximum in-flight work, synthetic tenant
distribution, body bytes, dispatch rate, completion rate including drain time,
and p50/p95/p99 client round trips are reported. Slow/rejecting fixture options
verify accounting; their delays are synthetic and do not represent app latency.

Counts per request kind are floored at the end of the finite window; sparse
workloads may have no requests of some kinds. The seed reproduces the random
tenant stream, not identical wall-clock timing. Tenant distribution is weighted
per request; stable per-bus/user bindings require a future real app adapter.
The largest share is at least the average share in small tenant populations.

`generatorPassed` means only that the bounded synthetic workload was delivered
and acknowledged by this fixture. Every report sets
`applicationCapacityVerified: false` and `hostedAuthRlsVerified: false`.
Simulation also records `datasetSeeded: false`, `realtimeTested: false` and
`providerDeliveriesTested: false`. Reports include a digest of the serialized
workload input; simulation includes Node version. Keep code revision alongside
saved reports. `bytesSent` is synthetic JSON body size, not app egress or billing.

First HTTP connection/request startup is included; process/server setup is
excluded and there is no warm-up. No laptop result certifies
Supabase performance, rural Android behavior or commercial fleet capacity.
CI validates the model/generator only and uses no provider/database secrets.
Failure injection must return nonzero rather than manufacturing a green result.

## Local verification

Meaningful checks cover workload arithmetic and source-cadence drift, the chosen
population split, reconnect backlog, invalid input/oversized plans, reproducible
randomness, unsent arrivals under overload, fixture rejection, report evidence
labels, and rejection of hosted URLs/credential options. A child-process check
sets database and proxy configuration and verifies the fixture remains local.
Required project checks and run results are recorded in the PR.

On 2026-10-12 the local capacity suite passed all 14 cases. A five-second,
1% peak-rate sample (seed 42) offered and acknowledged 771 synthetic requests,
with zero unsent, rejected or client-error requests. The default five-second
pilot-rate sample acknowledged all 85 planned requests. Those counts validate
the generator accounting, not the full target or application performance.
The workload digest was
`a87bd6011c64b69daddccf0bb86af7a4cb13a703bb598b1ed93906ee62b345e7`.

Required typecheck, lint, build and test commands passed; unchanged application
tasks reused validated Turbo caches. The final test run passed 335 web, 2 mobile
and 244 release/contract cases. Migration verification passed all 125 immutable
files; workflow lint, formatting and whitespace checks passed. No application
browser suite was rerun for this standalone CLI/documentation milestone.

## Future hosted execution remains a separate milestone

No hosted execution is authorized or supported by this tool. Review a concrete
fixture/auth plan, target configuration, security baseline, budget, durations,
stop conditions and recovery evidence before adding an app adapter. Keep actual
JWTs/private keys outside reports, repositories and chat. Never substitute
service-role access for guardian/driver/RLS proof.

At each stage retain the workload and code digests, deployed schema/quotas,
offered-versus-achieved traffic and generator saturation, role/tenant metrics,
independent access-denial results and persisted-event reconciliation. Map,
email/SMS/push traffic needs explicit provider handling; stubs must be labelled.
An eight-hour full-fleet soak, reconnect exercise, recovery check and reviewed
cost report are proposed exit evidence, not completed acceptance.

Backup restoration and migrations 0122–0124 remain deferred. No hosted project,
compute size, data, retention policy, runtime cadence or release approval changes.
