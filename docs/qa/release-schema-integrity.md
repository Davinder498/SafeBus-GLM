# Release Integrity: Schema and Authorization Drift

**Status:** First R1 engineering milestone; production adoption and server scaling remain open
**Date:** 2026-10-14 (America/Edmonton)

## Problem and change

The older release fingerprint described public objects and one realtime policy.
It could miss changed private authorization helpers, column-level disclosure,
default privileges, view security options, restrictive realtime policies and
API hook/role configuration. A checksum list of migration files is also not proof
of their historical execution on the drifted hosted project.

Fingerprint format 2 covers application objects in `public` and
`safebus_private`, the authorization relation `realtime.messages`, schema/default
grants, relevant role attributes/inheritance and selected PostgREST settings.
It includes columns/constraints/indexes, view definitions/options, ownership,
policies, routine definitions/grants, triggers/event triggers, enums/domains,
sequence configuration and relevant publication membership/filter metadata.

The collector reads catalog metadata only. It excludes customer/Auth rows,
role passwords/JWT settings, sequence current values, realtime message contents
and unrelated provider runtime tables. Supabase-managed realtime partitions do
not needlessly invalidate the application fingerprint.

Drift and authorization entry points use bounded repeatable-read, read-only
transactions, local timeouts and rollback. The private API check now requires an
actual HTTP 406/PGRST106 schema rejection using the existing reviewed probe;
a bad key, outage or timeout cannot serve as proof of isolation.

The obsolete adoption entry point is stopped before any database connection.
It must not label the pinned 0088 repository checksum prefix as the current
project's execution history. The existing baseline remains immutable; there is
no override or replacement adoption contract in this milestone.

## Compatibility and evidence boundaries

Format 2 deliberately changes the digest preimage. A stored format-1 digest must
fail comparison, including where a formerly omitted object changes. Never update
a stored release fingerprint merely to make drift checks pass. The operator must
review the schema/provenance and use a separately approved reconciliation/adoption
procedure. Current production is unadopted, so no existing release record is
migrated by this PR.

The new format also changes recovery snapshot fingerprints. Existing backup/
restore/rehearsal artifacts must be renewed and bound to the new reviewed source;
do not retrofit old evidence or manually edit a receipt to claim compatibility.
The security installation's verified-recovery and 24-hour evidence gates remain.

The fingerprint is a drift detector, not a full database export, expected-schema
equivalence proof, Auth authorization test, provider-configuration audit or a
claim that every PostgreSQL object type is modeled. It does not prove lawful
access, recovery or fleet capacity. Hosted signed-session acceptance, advisors,
exact RPC/Data API audits and actual migration provenance are still required.

## Bounded hosted observation

A catalog-only transaction on the approved BusSafe project used `BEGIN TRANSACTION
READ ONLY`, local statement/lock timeouts and final `ROLLBACK`. It returned only
the following aggregates/booleans; no account rows or function bodies were read:

| Observation                             | Result |
| --------------------------------------- | ------ |
| PostgreSQL `server_version_num`         | 170006 |
| Release environment identity            | Absent |
| Release migration ledger                | Absent |
| Security installation ledger            | Absent |
| Private functions                       | 30     |
| Relevant default-ACL records            | 9      |
| Explicit application column-ACL records | 0      |

The production project remains production-designated. The separate recovery
project is not treated as DEV/staging or a capacity-test approval. Check current
provider patch/extension advisories before recovery/release; the observed version
is not evidence that the provider's later 17.11 security update has been applied.
[Supabase PostgreSQL update guidance](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).
No engine upgrade, migration, fixture, paid change or deployment was performed.

A read-only Security Advisor retrieval still reported categories for RLS-enabled
tables without policies, mutable function search paths, anonymous and authenticated
execution of SECURITY DEFINER routines, and disabled leaked-password protection.
The response groups categories rather than providing this milestone with a
verified count of affected endpoints. No finding is closed by this code change.
Review [database advisor remediation](https://supabase.com/docs/guides/database/database-linter)
and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
with the exact installed manifest and accepted public RPCs, rather than revoking
all privileged application APIs blindly.

## Verification

`tests/release/schema-fingerprint-postgres.test.mjs` uses a small owned PGlite
PostgreSQL fixture with no hosted credentials, customer identities, network jobs
or historical migration replay. It changes real SQL metadata in rollback-only
transactions, proves fingerprint changes, then proves baseline recovery after
rollback. It also exercises actual release preflight rejection and the legacy
adoption entry-point stop.

Existing private API rejection tests cover provider success/wrong-key/outage/
malformed-response outcomes, and the protected audit now uses that same probe.
The new PostgreSQL checks run from `pnpm test` in the existing CI gate.

## Remaining R1 work, then server scaling

1. Refresh the stale generated type contract and complete required security
   signed-session/API acceptance. The
   [owner-approved installation](security-installation-2026-10-14.md) committed;
   independent ledger/catalog, RPC allowlist and negative SQL checks passed.
2. Retain the [accepted recovery evidence](full-database-recovery-2026-10-14.md)
   and installation bindings; renew evidence for subsequent protected writes
   according to the reviewed recovery procedure.
3. Prepare the historical adoption contract from observed evidence. Distinguish
   inherited/observed schema from actual recorded execution and give every
   historical discrepancy a reviewed disposition. Do not replay all migrations,
   extend the old baseline silently or stamp unsupported applied timestamps.
4. Rehearse the replacement metadata/reconciliation workflow in a bounded rollback
   transaction, review independently, then apply only through protected approval.
5. Regenerate verified types, run exact authorization/advisor/drift checks and
   retain source/schema/checksum/provenance evidence.
6. Proceed with the next separately reviewed server milestone: remove synchronous
   per-guardian GPS broadcast work and provide authorized bounded/coalesced
   delivery. History/retention, notification concurrency/fairness and measured
   reconnect/capacity follow their own milestones and acceptance evidence.

Preparing this first R1 fix does not finish release integrity, install security,
prove a restore or certify the 10,000-bus/100,000-concurrent-user planning target.
