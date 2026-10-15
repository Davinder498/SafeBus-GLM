# Observed production schema adoption

**Status: prepared for human review; not applied.**

The security installation is verified and the merged generated types passed the
fresh protected canonical run
[38672206649](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38672206649).
That run reported no generated diff. The remaining release-ledger problem is that
the populated hosted database has no verified execution history for older files.
The blocked legacy entry point and immutable 0088 checksum prefix cannot supply
that missing history.

## Historical input disposition

This is a proposal to accept the **observed current schema**, not a claim that it
is equivalent to replaying all historical migrations. Human review must accept
that distinction before merging or registering the proposed contract.

`config/production-observed-baseline.json` lists every one of the 125 active
manifest files, keyed by full filename, with immutable checksum/size/version and
an explicit disposition:

- **122 historical inputs, 0001–0121 including both 0058 files:** frozen reference
  inputs, execution unverified, no replay authorized and no effect-equivalence
  claim. Each is retired from automatic replay in favour of the explicitly
  reviewed observed snapshot. This is the disposition of historical differences,
  superseded definitions and missing execution evidence, not proof that individual
  old SQL statements ran or that all historical product intentions are fulfilled.
- **0123 → 0122 → 0124:** actual executions verified against protected installation
  [38665578510](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38665578510).
  These alone enter `migration_checksums`, with that event's real release SHA and
  original `installed_at` as `applied_at`.

The exact contract and manifest digests bind this decision. Changing, omitting or
reordering a disposition fails validation. The old `production-adoption-baseline`
file remains unchanged and its original content hash is checked independently.

The accepted observed application fingerprint is format 2,
`067a93c5812bca1f8976d4f836d4d8d59f2aab054ea79fbff8dba0f425ce773c`.
The full source recovery catalog digest is
`32c147489fa426d58eadad7ef75103a55fcfef9d82339573a794b35ab5e928c4`.
A fresh bounded catalog-only observation on 2026-10-15 matched both exactly;
authorization metadata and default privileges also matched installation evidence.
This covers the reviewed authorization surface and observed definitions, not
unrecorded historical executions or real signed-session acceptance.

## Metadata and release behaviour

Registration writes only private, RLS-enabled `safebus_release` metadata:

- Production environment identity and a singleton observed-baseline registration.
- One disposition for every frozen manifest input.
- Only the three verified execution records, preserving their actual timestamps.
- An empty application release table. Registering a snapshot is not an application
  deployment, so it does not create a fabricated `deployed` release event.

The existing security installation ledger remains unchanged. Client schema/table
privileges are revoked and no public policies are added. There is no historical
migration replay, app/Auth fixture write, provider setting change or frontend
deployment.

All six source provider DDL event hooks were inspected before preparing this
operation. Their owners, event/tag settings and function-definition digests are
pinned in the contract and checked before DDL. The extension grant hooks do not
invoke network operations for this metadata DDL. PostgREST's DDL hooks issue an
internal schema-cache notification: PostgreSQL delivers `NOTIFY` only on commit,
so rehearsal rollback does not deliver it. Approved registration can reload the
API schema cache; it does not send customer notifications.
See [PostgreSQL NOTIFY transaction semantics](https://www.postgresql.org/docs/17/sql-notify.html).

Preflight and drift checks report **executed** and **frozen historical** counts
separately. They verify contract/disposition/ledger integrity, metadata isolation,
the original security event and the current schema fingerprint. The existing
single-production-database block on schema-changing releases remains: a changed
manifest is rejected, and pending migration 0125 is not promoted or applied.
Release attestation format 4 also binds the observed contract file, preventing a
contract replacement after successful preflight.

## Recovery and protected workflow

1. Review and merge this feature PR. No new database write is authorized merely
   by preparing the contract. The legacy adoption command remains blocked.
2. Dispatch `adopt-observed-production.yml` from the exact reviewed main SHA with
   mode `rehearse` and `REHEARSE_OBSERVED_BASELINE_ROLLBACK_ONLY`.
   Complete GitHub's production-environment human review. Actual metadata DDL and
   verification run in one bounded transaction that rolls back; source/catalog
   checks confirm rollback. Retain and inspect the restricted evidence.
3. Capture a fresh encrypted export with `backup-existing-security.yml` from that
   reviewed main. The export now permits only the exact reviewed post-security,
   unadopted source: it checks the singleton security ledger, private/RLS
   protection, exact source catalog and absence of other release metadata.
   Unknown objects or drift still stop export. It remains a read-only operation.
4. Download, decrypt and fully restore this new post-security archive to the
   already owner-approved isolated Canadian recovery destination. Verify actual
   data, sequences, Auth records, schema/authorization and permissions. Retain
   evidence, confirm the exact new archive's Canadian offsite copy and create the
   human receipt with the existing recovery utility. Keep keys separate and do not
   put plaintext archives, keys or customer rows in Git or workflow logs.
5. Store the validated receipt as the existing protected environment secret
   `SAFEBUS_SECURITY_RECOVERY_RECEIPT`. Dispatch the same workflow in mode `adopt`
   with `ADOPT_OBSERVED_BASELINE_METADATA_ONLY`, the successful fresh backup and
   matching rehearsal run IDs, and the receipt digest. Human environment review
   is required again for this persistent metadata registration.

The old pre-security backup/receipt is rejected: its catalog does not describe
the installed source. Backup, restore verification and rehearsal retain the
24-hour limit. Rehearsal evidence must match the contract and actual program
checksums; it cannot be reused after changing metadata logic. Registration
rehearses and rolls back again immediately before its guarded atomic commit.
Canonical hosted types and private API rejection must pass before the operation.

Inspect the actual singleton metadata and workflow evidence after registration.
If commit acknowledgement is lost, or a later check/upload fails, do not retry or
delete metadata. Determine whether it committed using read-only inspection.
The existing-state guard refuses re-registration. A mismatch needs a reviewed
forward correction; never replace a stored fingerprint to make checks pass.

## Validation and remaining launch limits

Owned in-memory PostgreSQL tests exercise actual metadata rollback, committed
registration, preservation of execution timestamps, absence of fabricated app
releases, rejection of invented historical executions, altered dispositions,
client grants, source drift, old recovery evidence and mismatched rehearsals.
They do not connect to hosted production or replay the migration chain.

Local validation on 2026-10-15 passed `pnpm typecheck`, `pnpm lint`, `pnpm build`
and `pnpm test`: 382 web tests, 2 mobile tests and 330 release/contract tests
(714 total). Migration verification passed for all 125 immutable files; the
legacy baseline and active SQL were unchanged. CI results are recorded in the PR
before merge review. This preparation is not hosted adoption evidence.
After approved registration, run the protected exact authorization audit, drift
and release preflight checks. Real signed JWT/refresh, tenant/school/role,
invitation, revocation/realtime and native acceptance still remain separate
security closure requirements. Commercial launch and server scaling remain open.
