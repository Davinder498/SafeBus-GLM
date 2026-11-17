# Independent shared tracking workers

Status: installed through protected run 43989753598 at
`920f56275562e1e8fcd66c77067368573ac748a1`. Original preparation baseline: main
`a7ddd62a54c13aac0aea27d67f7ccd0f73592b61`. No 5,000–10,000-bus capacity claim.

## Acceptance by role

- Guardian: current shared-map clients receive the same coordinate-free private
  bus hints independently of legacy parent pagination. Older Android and parent
  home clients keep personal location hints and secured polling. Current link,
  tenant, service-date, session and optional-MFA checks remain authoritative.
- School authority admin, scoped admin and transportation admin: tenant location
  hints move to the shared worker, deduplicated within each batch. Existing
  school/tenant reads and mandatory MFA remain unchanged.
- Driver: collection cadence, locked-phone foreground service, upload queue,
  session/device checks and latest-position retention are unchanged. Each accepted
  position now updates two coalesced dirty markers. This adds a database write.
- Platform admin: no new guardian or tenant tracking permissions.
- Every recipient: notification source events, inbox, push/email queues, consent,
  quiet hours, rate limits and dispatchers remain independent and unchanged.
  Having zero map viewers must never suppress notifications. This milestone does
  not establish notification delivery capacity or physical receipt.

## Implementation

A new private, RLS-enabled `shared_tracking_queue` contains one dirty marker per
trip, with no coordinates, students or recipient list. Sixteen deterministic UUID
partitions have independent one-second cron jobs. Each job claims at most 256
ready rows with `FOR UPDATE SKIP LOCKED`, validates active trip/service/account
state and inserts the batch's private bus and deduplicated tenant hints in one
statement. Only the matching claimed generations are acknowledged. Newer work
survives; failed insertions roll back with the ACK and retain bounded retry state.
A failed batch backs off behind other ready work. Statement cancellation rolls
back the whole call; cron errors and queue age must also be observed.

The existing legacy worker still pages up to 25 eligible parents per trip visit
with its existing 10-visit/250-message job. It no longer emits tenant/shared
location hints. Personal permission, assignment and trip control signals retain
their existing path. Shared-feed authorization and client payloads do not change.

The migration primes the new queue from existing dirty scopes without emitting
messages. Sixteen bounded jobs are created atomically with the producer/worker
change. PostgreSQL inserts are not proof of Realtime delivery or client receipt.

## Capacity and operational limits

The configured upper bound is 16 × 256 = 4,096 shared trip visits per second,
versus the old shared path's 10 visits/second before parent pagination. This is a
configuration bound, not measured throughput. At most two messages per claimed
trip are inserted, with tenant deduplication reducing that count. Realtime still
has one delivery per connected subscriber; secured parent reads are still per
viewer. No paid service or provider quota is changed.

Read-only production inspection on November 16 found `cron.max_running_jobs=32`,
`cron.use_background_workers=off`, `max_connections=60` and four active cron jobs.
The new jobs can consume sixteen concurrent connections. This is material load,
not proof the existing compute can sustain them. Qualify GPS-write latency,
connection headroom, batch execution below 750ms, per-partition queue age,
Realtime quotas and overall cost before claiming fleet readiness. The 750ms
statement/100ms lock bounds prevent an unbounded worker transaction; GPS writers
can briefly wait behind a claimed batch. The model's 3-second GPS cadence implies
about 3,333 incoming trip updates/second at 10,000 buses before retries.

`shared_tracking_queue_health()` is postgres-only, read-only and identity-free:
pending count, oldest pending age, retrying count and maximum failures. It is an
operator observation endpoint, not a newly configured external alert. Inspect
cron failures as well as queue age, including per-shard skew. Extend external
alerting as part of the capacity/operations qualification. The existing indexed
history sweep now includes the sixteen exact job names and scans 5,000 rows per
minute; it preserves unrelated, recent and unfinished runs. Its sweep duration
can extend retention beyond the 48-hour eligibility threshold.

## Protected release and recovery

Use `Release operational fix`, milestone `independent_shared_tracking`, from the
reviewed main SHA. The existing protected production approval, rollback rehearsal,
encrypted recovery retention, exact catalog manifest and schema-ledger checks
remain mandatory. No direct SQL installation or production fixture/load test.

Predecessor release: `a7ddd62a54c13aac0aea27d67f7ccd0f73592b61`; fingerprint:
`be7a7ffac2380d8cd956f33e793c12d98ebb94a561b06610a02e844a5551a3f2`.
The producer, dispatcher and history-pruner definition checksums were matched
against read-only hosted inspection. The reviewed full catalog delta rejects
unrelated changes. Existing migration files/checksums are immutable.

Recovery runs in the bounded existing recovery transaction, locks the location
producer table and queues in producer order, copies every still-pending shared
scope into the legacy queue, and restores the predecessor functions before
removing the new jobs/table. Existing legacy cursors are reset only for copied
scopes so the restored worker sends their shared/admin hints again. Duplicate
refresh hints during recovery are harmless; no notification event is replayed.
Recovery preserves pending work and rejects later/unrelated schema releases.
Failure to obtain a lock aborts recovery rather than dropping queued work.

This database-only change needs no new Android version. Existing parent clients
remain compatible. Build/sync validation does not install an app or verify a phone.

## Verification and remaining proof

Embedded PostgreSQL regression covers fifty-parent pagination, a broken legacy
page while shared work progresses, zero guardians/viewers, message privacy,
active service/account filtering, denied client privileges, generation changes
during publication, atomic failure/retry, queue health, exact schema recovery
with pending work, and history retention. The 10,000-scope correctness fixture
uses simplified service records and sequentially invokes 16 shards for three
rounds: 10,000 bus hints and 48 tenant hints, with no remaining shared work. It is
not a realistic fleet load test, multi-session lock test or hosted benchmark.

Still required: real multi-session contention and cancellation measurements,
controlled hosted workload qualification, provider delivery/receipt, mixed Android
versions, physical locked-phone/network recovery, legacy cutover, per-viewer read
reduction and independent notification-capacity acceptance. Do not label this PR
or a passing build as commercial launch readiness.

Local validation completed November 16: typecheck, lint, production build
(`--concurrency=1`), all tests (1,261 web, 36 mobile, 689 release/database), all
125 immutable migration checksums, mobile production build and Android sync
passed. The targeted worker/lineage suite also passed; the final worker manifest
was rechecked after adding unchanged predecessor cron-job guards. Generated
launcher/store artwork was restored to avoid unrelated binary changes.
No production migration, real recipient notification or physical-device test was
performed. GitHub CI is separate from these local results.

## Release rehearsal correction

PR #458 merged as `bff14e32cea6dc67d6846ee0c1066922cd7415d2`. Protected
release [43984374484](https://github.com/Davinder498/SafeBus-GLM/actions/runs/43984374484)
passed code validation but stopped in the rollback-only rehearsal with
`OPERATIONAL_LINEAGE_CHANGED_OBJECT`; installation was skipped. Read-only hosted
inspection confirmed PostgreSQL 17.11, no shared queue, and no shared worker jobs.

The generated proof included seven PostgreSQL 18 `pg_constraint` NOT NULL rows
from PGlite. PostgreSQL 17 represents those requirements in `pg_attribute`
(`attnotnull`) without those extra constraint rows. The corrected hosted proof
removes only the seven nonexistent rows. All column nullability, primary/foreign
keys, CHECK constraints, grants, routines and predecessor fingerprint checks
remain exact. The migration SQL and its checksum are unchanged.

Regression coverage compares the full embedded-engine delta with the seven
explicit extra rows, then compares the PostgreSQL 17 catalog shape to the hosted
proof. It also rejects a nullable-column drift. This does not substitute for a
successful protected hosted rehearsal and installation; both remain pending.

Post-correction protected rehearsal, encrypted recovery retention, installation and
verification succeeded in [run 43989753598](https://github.com/Davinder498/SafeBus-GLM/actions/runs/43989753598).
See `guardian-viewer-read-budget-2026-11-16.md` for the bounded post-install
observation and remaining client/legacy cutover work. Earlier pending statements
above describe the evidence available before that successful retry.
