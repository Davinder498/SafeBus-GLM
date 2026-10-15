# Reviewed Realtime catalog additions

**Status: proposed forward reconciliation; not applied.**

Protected rehearsal [38758143951](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38758143951)
passed credential-free validation and hosted canonical types, then failed with a
generic error. The old logger did not retain a statement-level failure phase.
Post-failure read-only inspection found only `security_installations` in the
release schema: no environment identity, adoption metadata or application release
persisted. The application fingerprint and original installation event match.

Reproducing the catalog guard identified a concrete blocker: the recovery catalog
contains two additional daily partitions, `realtime.messages_2026_10_17` and
`realtime.messages_2026_10_18`. Its exact current digest is
`a5dbca69aaff8380318ce4709d57b7608226b5f124ba93f7cb071ec78c2dfb4f`.
Removing exactly those two relation records in an offline comparison reproduces
the original installed catalog digest
`32c147489fa426d58eadad7ef75103a55fcfef9d82339573a794b35ab5e928c4`.
No other snapshot field differs. The unchanged format-2 application fingerprint is
`067a93c5812bca1f8976d4f836d4d8d59f2aab054ea79fbff8dba0f425ce773c`.

## Exact review scope

The proposed contract retains the original security event and digest, adds an
explicit reconciliation and separately pins the observed current catalog. The
code proves that removing the two exact reviewed records reproduces the original
digest. This is an evidence-backed forward review, not replacement of a stored
application fingerprint or a blanket exception for Realtime drift.

Read-only catalog inspection confirmed both are ordinary daily range partitions
owned by `supabase_realtime_admin`, with sole parent `realtime.messages` and the
correct date bounds. Their ACLs contain only the existing provider administrator,
`postgres` and `dashboard_user`; there are no client grants, policies, column ACLs
or user triggers. The provider's existing child RLS/force-RLS flags are preserved.
Runtime checks enforce these properties before any metadata write.

The raw current catalog must still match exactly. A third added partition, a
removed partition, changed grant/policy/hook/default privilege or any unrelated
catalog difference stops the operation and needs another explicit review. No
partition is created, deleted, detached or changed by this code. The immutable
0088 baseline, historical migration dispositions and original execution timestamps
remain unchanged.

## Recovery and diagnostics

A new successful protected rehearsal must bind this exact updated contract and
program. The fresh encrypted backup must contain the exact reviewed current
catalog, and its full restore, offsite copy and owner receipt remain mandatory.
The original pre-security backup and the failed rehearsal cannot authorize
registration. No recovery, approval or evidence-age gate is relaxed.

The CLI now reports a fixed execution phase and allowlisted catalog-failure code,
including `OBSERVED_SOURCE_DRIFT`. Raw SQL, arbitrary exception messages,
connection strings, API keys and customer records remain excluded from logs.

Owned PostgreSQL regression coverage reproduces the unchanged application
fingerprint with a changed recovery catalog, rejects it under the original
contract, verifies the exact reconciliation and completes a rollback rehearsal.
It also rejects hidden catalog changes, altered ownership and a third partition.

Local `pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm test` passed on
2026-10-15 (716 tests: 382 web, 2 mobile and 332 release/contracts). Migration
verification passed for all 125 immutable files. Hosted rehearsal of this updated
contract still requires merge review and protected environment approval.
