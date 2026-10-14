# C1: asynchronous GPS tracking invalidations

Prepared on 2026-10-14. Engineering is ready for review; this migration is **not
active, installed, or a capacity certificate**. The customer keeps full-restore
verification deferred. Recovery, security installation, release integrity,
protected production adoption, human review and measured acceptance remain open.

## Change

The 0030 location trigger synchronously resolves all route-linked guardians and
calls `realtime.send` once per recipient inside each GPS transaction. The current
guardian RPCs instead use student bus-service assignments; a route alone no longer
identifies the correct live audience.

The prepared forward SQL at
`supabase/migrations/pending/0125_async_tracking_invalidations.sql` replaces only
the private location trigger's body, preserving its OID and trigger binding. GPS
ingestion makes one atomic queue upsert. There is one dirty row per trip, carrying
tenant/trip identity, generation, cursor and operational timestamps, with no
coordinates or student identifiers. Repeated location updates increment a
generation without restarting pagination or moving the scope ahead of older work.

A database-internal worker dispatches the existing private `tracking_changed`
messages. The wire payload retains `id`, `reason` and `occurred_at` (the provider
already adds the generated message ID); coordinates are refetched through the existing session-checked
guardian/admin RPCs. Receive policies, subscription topics, client GPS cadence,
trip triggers, access-change triggers and notification delivery are unchanged.

The worker re-evaluates the active bus/route/pattern, driver, tenant, student,
guardian, profile, service dates and guardian-link expiry on each page. Bus-service
joins follow the current service-line RPC rather than the legacy route-only list.
Sibling/service links deduplicate by profile. Cursor paging limits sends per
scope; a full page gets a later completion check instead of an unbounded tail scan.
This query still needs measured plans for large tenants; LIMIT bounds output,
not the underlying join/sort cost.

## Bounds and failure semantics

| Bound                                          | Prepared default / hard limit |
| ---------------------------------------------- | ----------------------------- |
| Named cron job cadence                         | Every second                  |
| Scope candidates per invocation                | 10 / 50                       |
| Successfully committed messages per invocation | 250 / 1,000                   |
| Guardian messages per scope page               | 25                            |
| Outer worker statement timeout                 | 750 ms                        |
| Outer lock timeout                             | 100 ms                        |
| Failed-scope retry floor                       | 1 second                      |

These conservative defaults suit bounded pilot preparation. They cannot serve the
planning demand of approximately 29,333 uncoalesced guardian messages/second, and
the one-second schedule is not a guaranteed delivery latency. Do not raise limits
or promise 10,000-bus capacity without approved measurements and compute budgets.

Workers use transaction-scoped try-advisory locks to avoid duplicate concurrent
processing of a trip. Producers do not acquire these advisory locks. Final queue
updates still take row locks until the bounded worker transaction finishes, so
producer lock latency must be measured. Hash collisions defer a scope safely.
No locks or claims survive rollback, cancellation or connection loss.

Pages rotate to the back of ready work, preserving progress under continuous
GPS input. When a pass completes, deletion is conditional on its generation.
An update that arrived during the pass causes another complete pass for readers
who were already refreshed. There is no trailing-edge debounce that can postpone
delivery forever while GPS continues.

The hosted `realtime.send` implementation was inspected in a bounded read-only
catalog transaction on 2026-10-14. It inserts into `realtime.messages` but catches
insert errors and emits a warning. A successful function return therefore cannot
acknowledge a durable queue message. The new private sender uses the same reviewed
message columns, generated ID and transaction-local topic setting, with errors
propagating. It inserts directly into the managed message table; no provider
routine, table definition, ownership, grants or policy is changed. Verify this
adapter against the real hosted schema and provider upgrades before activation.

Each scope runs in a subtransaction. Message insertion failure rolls back that page's
messages and progress together; other scopes can continue. Only SQLSTATE and a
capped failure count are retained. The message cap counts committed sends;
failed attempts are additionally bounded by the scope/page limits and timeout.
Query cancellation rolls back the whole invocation. Messages and acknowledgements
are atomic database writes; transport delivery remains best effort, and clients'
existing fallback polling still matters. A repeatedly failing scope stays queued
for operator intervention rather than silently losing refresh work.

Queue/table access and execution of the trigger/worker are revoked from PUBLIC,
anon, authenticated and service_role. Queue RLS is enabled with no client policy.
Only the trusted database owner runs this internal worker. No public RPC, Edge
Function, service credential, API schema exposure or browser privilege is added.
Authorization eligibility is evaluated at statement time; concurrent revocation
and already-open Realtime channels still need S3 acceptance. A hint does not
authorize display of coordinates or replace data/session checks.

## Activation and rollback

1. Keep this file pending until recovery and the protected security/adoption
   prerequisites are satisfied. The existing security installer's 0124 tip guard
   and immutable historical baseline remain intact.
2. Review promotion and the complete release sequence. Move the SQL to the active
   migration directory and regenerate its manifest only in that reviewed change.
   Do not bypass the guard or pretend this migration has run.
3. Confirm current helper/trigger OIDs, bus-service schema, pg_cron support and
   worker owner. Inspect existing triggers before bounded rollback rehearsal.
   Index creation needs a reviewed lock/duration budget on the actual table.
4. Rehearse in a bounded transaction that always rolls back. Verify message and
   queue rollback using synthetic, scoped fixtures after trigger inspection.
   Cron configuration is transactional; never leave a QA job or notification.
5. Use the protected human-approved release, with fresh recovery evidence and
   exact checksums. Verify the named cron job and run the read-only catalog check.
6. For a worker incident, deactivate only this named job through the approved
   procedure and retain its pending queue. Client fallback can continue while
   investigating, but this is degraded service. Restore/re-enable the reviewed
   worker and drain measured backlog. A forward migration restoring synchronous
   fan-out requires its own review; do not drop the queue or silently discard it.

Supabase documents sub-minute schedules and named-job behavior in the
[Cron quickstart](https://supabase.com/docs/guides/cron/quickstart). A one-second
job produces substantial cron run history: inspect the existing cleanup policy
and approve bounded retention before enabling it. This milestone does not delete
other jobs' history or change notification scheduling.

## Validation and remaining evidence

`tests/release/async-tracking-postgres.test.mjs` executes the actual proposed SQL
in embedded PostgreSQL with synthetic schema/data only. It executes the original
0030 tracking helpers and trigger, verifies OID preservation and unchanged trip
behavior, and checks coalescing, payloads, message budgets, zero/full-page edges,
cursor progress, mid-dispatch ingress, current-link eligibility, failure retry,
rollback and actual client-role privilege denial. Local fixture message inserts
use a trigger for capture/fault injection and reproduce the provider's swallowed
error behavior for the old helper; `cron.schedule` uses a capture shim. No hosted data, messages or schedules are
written. This is execution validation, not merely SQL parsing.

Embedded PostgreSQL is one session: simultaneous worker/producer transactions,
advisory lock contention, actual pg_cron timing, Realtime transport, read/query
plans, timeout recovery, WAL/autovacuum and production installation are **not
proven** by these tests. Before closing C1, measure p95/p99 location-commit and
invalidation latency, lock waits, oldest pending age, failures, worker overruns,
queue growth and sustained coalescing on an approved target. Include large-tenant
skew, continuous ingress, link changes between pages, worker crash and outages.
No uncontrolled production load test is authorized.

Local validation passed: `pnpm typecheck`, `pnpm lint`, `pnpm build` and
`pnpm test` (360 web, 2 mobile and 282 release/contract tests, including 37 new
PostgreSQL cases). Migration verification retains 125 immutable active files.
Frontend checks reused valid worktree caches; the PostgreSQL tests ran uncached.
The post-install read-only acceptance SQL also executed against the local fixture.

After installation, `tests/rls/async-tracking-existing-database-readonly.sql`
checks the catalog without returning customer records. Operational aggregates:

```sql
begin transaction read only;
set local statement_timeout = '5s';
set local lock_timeout = '1s';
select count(*) as pending_scopes,
       coalesce(max(extract(epoch from clock_timestamp() - first_pending_at)), 0) as oldest_pending_seconds,
       count(*) filter (where failures > 0) as failed_scopes,
       coalesce(max(failures), 0) as highest_failure_count
from safebus_private.tracking_invalidation_queue;
rollback;
```

Run only after an approved installation. Establish alert routing/thresholds and
pilot acceptance before launch; aggregate queries alone are not monitoring.
History partitioning/retention (C3), notification scale (C4), fleet catch-up (C5),
paid compute/provider quotas and 10,000-bus capacity remain separate milestones.
