# Compatible tracking worker batching

Status: installed in production on 2026-11-15 through protected run
[43707610659](https://github.com/Davinder498/SafeBus-GLM/actions/runs/43707610659),
PR #454 / main `91b9ad3370ef281ba0f511c430fe9b229d7a6ebc`.
Read-only verification matched the installed definition, postgres-only execution,
active one-second job and recorded schema fingerprint. Not fleet-capacity-qualified.

## What changes

The current worker inserts a separate private refresh message for each eligible
parent. This change keeps the same audience, topics, payload and cursor protocol,
but inserts a bounded parent page in one database statement. A full page of 25
parents plus its administrator message takes two insert statements instead of 26.
Every parent still receives a separate private message; recipient message counts,
Realtime billing and delivery quotas are unchanged. This is statement reduction,
not a measured throughput or latency improvement.

The change replaces only
`safebus_private.dispatch_tracking_invalidations(integer,integer)`. It creates no
public RPCs, policies, tables or indexes. Its owner and private ACL remain exact.
Native driver collection/upload and locked-phone tracking are untouched. Existing
Android clients continue to receive their original protocol without an update.

## Acceptance

- Guardians retain active-link, expiry, tenant, student, bus-service and date
  eligibility checks on every page. Siblings remain deduplicated. Coordinate-free
  hints never authorize location data; the secured RPC still does that.
- School authority, scoped and transportation administrators receive their same
  tenant-scoped hint; their read/MFA boundaries are unchanged. Platform admins
  gain no access. Driver collection and device/session validation are unchanged.
- A failed batch rolls back all messages and progress for that trip. Retry state
  remains durable and other trips can proceed. GPS arriving during a pass retains
  another pass. Full pages, zero remaining budget and cursors behave as before.
- Message IDs are unique and equal their payload IDs. Every row explicitly carries
  its private topic, `tracking_changed` event and `broadcast` extension.
- Limits remain 10 trip visits/250 messages per second, with at most 25 parents per
  page. No quota increase or 5,000–10,000-bus capacity claim is made.

## Observed baseline and provider contract

Read-only production inspection on November 15 matched every catalog field of the
prepared predecessor function to the hosted function. The latest schema ledger
entry was `497a39bbe19ae077e719a3d36bf8daa515446c66`, fingerprint
`e60aea83d0167b4aae33a51821d0b23fbb2943d2674490a9ef86ad249c0daabd`.
The schema ledger identifies database changes, not the most recent website build.

The hosted `realtime.messages` hierarchy had no non-internal triggers. The internal
worker runs with its existing postgres owner and private ACL; routing is carried
in each row's explicit topic. The batch does not use a connection-local topic
setting to authorize or route recipients. Provider policies/schema are unchanged.
The original single-message sender remains for administrator messages and rollback.
Tests instrument synthetic row/statement triggers only in embedded PostgreSQL.

## Protected release and recovery

Use `Release operational fix`, milestone `tracking_batch`. It reuses exact
before/after definitions and ACLs, rollback rehearsal, encrypted recovery retention,
and a one-routine schema delta. The same transaction registers the new schema
fingerprint, avoiding a later migration-drift failure after an otherwise valid
installation. Unrelated schema/grant drift blocks installation; recovery refuses
to erase a later release. No historical migration/checksum is edited.

1. Run `install` on the reviewed main SHA with `INSTALL_OPERATIONAL_FIX`, using
   the protected production approval. This one run already rehearses the change
   with rollback and retains encrypted recovery before installation. A separate
   manual `rehearse` run is available but is not required.
2. Verify installed definition/ACL, unchanged job limits, read-only tracking
   security acceptance and schema fingerprint. This is a database-only update;
   no Netlify website build or Android publication is needed for batching.

A successful CI run is not an installed change. No production messages or test
notifications are sent during local fixture tests or definition-only rehearsal.

## Tests and remaining work

Run the existing worker behavior/authorization suite against both the predecessor
and batch implementation, plus statement counts, unique IDs, rollback/restore and
schema-ledger tests. These are embedded PostgreSQL tests, not a production load
benchmark. Run normal repository checks and Android build/sync before merge.

The principal fleet bottlenecks remain per-recipient message generation and the
conservative dispatcher budget. The shared bus-service feed described in
[the tracking design](tracking-refresh-efficiency-2026-11-15.md) remains a separate
client/server protocol transition with old-version compatibility requirements.
Measure this batch change before increasing worker budgets. Fleet qualification
still requires agreed guardian concurrency, provider quotas and a controlled,
budgeted load test. Physical locked-phone Android verification remains pending.
