# Tracking refresh efficiency and fleet design

Status: implemented on the feature branch; local checks and CI recorded below. No production rollout,
load test, service purchase or 5,000–10,000-bus capacity qualification is implied.

## Acceptance by role

- Guardians: preserve three-second location hints and secured RPC verification;
  stop details on the selected map are checked at most once per 15 seconds for
  ordinary position hints. Permission, trip, unknown and connection hints bypass
  this throttle. Manual Refresh checks both datasets. No cached offline data.
- School authority admin, scoped admin and transportation admin: retain their
  existing tenant/school queries, MFA and five-second live/15-second fallback
  refresh policy. Release tracking subscriptions hidden/offline, rejoin on return.
- Driver: native GPS capture, background tracking, queue durability, session and
  device authorization remain unchanged. A hidden guardian/admin web subscription
  is unrelated to the native driver tracking service.
- Platform admin: no new tracking access or broadcast permissions. Existing
  platform functionality and authorization remain unchanged.
- Every role: topic/client isolation, last-consumer teardown and StrictMode
  ownership remain. Obsolete callbacks and in-flight responses cannot restore
  data for a different account, selected bus, hidden/offline or disconnected view.

## Implemented scope

1. Preserve the distinction between explicit `location` hints and control hints.
   Coalescing a mixed burst retains the control hint. No coordinates or identity
   data from a message become authoritative; every read still uses secured RPCs.
2. Give only the selected map's stop-detail consumer a 15-second location-hint
   throttle. Keep the existing 15-second fallback and immediate control checks.
   Route-detail pages that display progress/ETA retain their existing cadence.
3. Release the shared tracking subscription when all its consumers are hidden or
   offline; rejoin when visible and online. This reduces idle subscriptions and
   delivered traffic, but does not stop the current server enumerating guardians.
4. Correct the admin fallback workload input and record the current async worker.

For one continuously viewed selected map with one hint every three seconds and
instant successful responses, the prior steady rate was 2/3 RPC per second.
The new rate is 1/3 + 1/15 = 0.4 RPC per second: 40% fewer. This excludes initial,
control/manual requests and retries; it is arithmetic, not a production benchmark.
No reduction in driver GPS accuracy or collection cadence is introduced.

## Remaining server design — not implemented by this change

The November 15 read-only inspection found a once-per-second dispatcher with a
10-trip and 250-message budget, paging up to 25 eligible guardians per trip visit.
It enumerates eligible linked guardians even if they are not watching. At best,
one visit across 10,000 continuously pending trips takes 1,000 seconds before
additional pages and execution time. This is a queue bound, not the map's observed
location delay: secured fallback polling still operates.

Recommended next architecture:

- Retain validated, idempotent driver ingestion and latest-position storage.
- Replace per-guardian GPS enumeration with one coalesced coordinate-free hint
  per active bus service, using opaque service epochs and private receive-only
  topics. Payloads must contain no coordinates, student names, route details or
  other customer data. Topic discovery must use an authorized RPC, not guessed
  bus numbers. Preserve the existing guardian control topic for access changes.
- On each hint, fetch the minimal latest position through a server-authorized
  endpoint. This keeps current session, MFA, tenant status and current guardian
  links authoritative even after a previously authorized subscription loses access.
- Do not broadcast actual positions based only on channel join-time authorization.
  Supabase evaluates channel policies on join/token refresh, not on every data
  delivery. Shared position broadcasting requires a separately reviewed design
  for revocation, session expiry and membership races before it is safe.
- Separate static stop/route details from dynamic position responses at the API
  layer. Invalidate static details on assignment/route changes; use bounded
  revalidation, scope-specific caches and immediate denial clearing.
- Partition dirty-trip processing with fair scheduling across tenants and measured
  worker budgets. The current 10-trip limit cannot simply be raised and called
  sufficient. Measure ingest locks, worker queue age and reader amplification.
- Active-viewer demand should expire automatically. If adding viewer leases,
  authenticate them, cap them per session, and rate-limit renewal. Expired leases
  must never authorize data; heartbeat volume must be included in capacity costs.
- Retain fallback polling with jitter/backoff and cap retries. Shared topics save
  producer work, not recipient delivery charges: 50 recipients still mean 50
  deliveries. No paid service or infrastructure choice is justified by this design
  alone.

Before implementing that server change, reconcile the hosted function definitions,
private policies and release baseline. Prepare a forward migration and protected
rollback rehearsal, update approved RPC/default-privilege inventories and generated
types where required, and test revocation and mixed old/new client compatibility.
Rollout must tolerate already-installed Android bundles; retain the old protocol
until supported client versions have migrated. Never silently disable old clients.

## Qualification and release

Use controlled local browser fixtures for foreground/background, reconnect,
authorization denial, account switching, mixed hints and stop-detail frequency.
Full browser CI is appropriate because this touches shared realtime lifecycle and
visible guardian behavior. Unit tests alone do not establish browser lifecycle.

Before fleet qualification, agree simultaneous guardian counts and an isolated
load-test budget/target. Test 1,000, 5,000 and 10,000 active buses, skewed tenants,
multiple linked students, revocation during traffic, reconnect backlog and a soak.
Report achieved rather than offered load, end-to-end position age, queue oldest
age, failures, CPU/I/O/locks, connections, provider quotas and cost. Current Free
plan and tiny production dataset are not evidence of this capacity.

Production publication remains the protected engineering artifact workflow.
Merge/build success is not publication. Android bundle build/sync is not an AAB
release, installation or physical-device verification.

Reference checked November 15:
https://supabase.com/docs/guides/realtime/authorization

## Validation record

- Focused local tracking tests: 45 passed, including mixed/control hints,
  hidden/offline subscriptions, late responses, account changes and urgent
  rechecks queued during an active request.
- Capacity model tests: 15 passed. These are arithmetic/fixture checks only.
- Local browser tests could not launch: the managed workspace denies Chromium's
  required socket operation. Browser assertions did not execute locally; GitHub
  browser CI must pass before merge.
- Full repository checks and mobile build/sync are required before publication;
  consult the PR checks for final results. No live database schema was changed.
