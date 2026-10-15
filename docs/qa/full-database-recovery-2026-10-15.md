# Post-security database recovery verification

**Status: full logical restore verified, owner accepted and used for approved production adoption.**

This renews recovery evidence for the reviewed observed production baseline.
The owner authorized the isolated Canadian laptop destination and subsequently
confirmed: "Evidence accepted; fresh backup copied offsite." No specific offsite
provider or site reference was supplied. This records owner confirmation rather
than claiming an independent inspection of that storage.

## Source and protected rehearsal

- Reviewed source: `750bce6c4cff7402953fd1f68b0ac8cf490e6f31`, merged PRs #274/#275.
- Successful rollback rehearsal: [38761500916](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38761500916).
- Fresh encrypted backup: [38762138714](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38762138714), created `2026-10-15T15:42:43.629Z`.
- Source recovery catalog: `a5dbca69aaff8380318ce4709d57b7608226b5f124ba93f7cb071ec78c2dfb4f`.
- Observed contract digest: `ffc21761c37ebdda788b1bb98dd2f2ca6c0dc2cb24a6f34436d34d3de788613c`.
- Rehearsal program digest: `3ddabae2ed59ddf5ab41c65bcd04f9be53a506bfa8fc68bbef007bc9a625ba6c`.

Independent checks verified workflow provenance, exact source commit, contract,
program, encrypted-file hashes and reviewed catalog. The rehearsal confirmed
rollback and unchanged source; no metadata registration persisted. The protected
canonical type check also passed. The original installation event and its catalog
digest remain unchanged; the [two-partition reconciliation](observed-catalog-reconciliation-2026-10-15.md)
explains the reviewed current catalog.

## Actual full restore

Authenticated decryption verified both plaintext archive hashes and complete
archive decoding. The archive and roles were then restored and committed in a
new owner-only PostgreSQL 17.11 cluster in Ubuntu WSL on the approved laptop.
The older recovery cluster and evidence were preserved.

The server used a separate network namespace without outbound routes, no TCP
listener, owner-only Unix sockets, disabled cron execution and a nonexistent
database target for the pg_net worker. Isolation controls were verified during
data comparison, and the recovery server was stopped afterward.

As in the earlier reviewed recovery, the source bootstrap role identity was
preserved, extension ownership was restored explicitly, and temporary local
extension-creation privilege was removed before commit. Source `postgres`
privileges match the archived state. The complete archive was retained and every
written COPY block matched its original bytes. Errors were not skipped.

| Verification                                                                               | Result                                                |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Archived table datasets, checked against the actual archive TOC                            | 113/113 match                                         |
| Archived rows, compared as sorted multisets                                                | 58,747 match                                          |
| Auth table datasets included                                                               | 27                                                    |
| Sequence states                                                                            | 4/4 match                                             |
| Format-2 catalog sections                                                                  | 20 exact; CHECK display differences proved equivalent |
| Managed Auth/Storage/Vault relation ownership, RLS and grants                              | 38 match                                              |
| Managed routine definitions, owners, settings and grants                                   | 28 match                                              |
| Original private security installation ledger, execution timestamps and provider DDL hooks | Match                                                 |

Extension data filters, including the standard PostGIS SRID exclusion, matched
the reviewed source. Counts came from this archive, rather than assuming the
previous backup's table or row totals. The original security installation remains
the three actual executions from run `38665578510`; restoration did not invent
historical execution records or an application deployment.

## Schema equivalence and evidence boundaries

The raw restored fingerprint is
`e9a963d95fdd6a9e50aa1005b193fb2e2aaa3dd83939105ae79ef023f495f9a1`.
The source fingerprint is
`067a93c5812bca1f8976d4f836d4d8d59f2aab054ea79fbff8dba0f425ce773c`.
The raw mismatch is retained in the evidence. The sole differing section contains
the same six CHECK-expression display differences documented in the
[previous full restore](full-database-recovery-2026-10-14.md).

PostgreSQL reparsed each pair in identical temporary columns inside rollback-only
transactions and confirmed equal definitions and validation states. Substituting
only those proven-equivalent display strings in an offline comparison reproduced
the exact source fingerprint. No source baseline, release fingerprint collector
or production constraint was changed.

## Owner-reviewed packages and receipt

The owner-local verification package contains metadata, counts, hashes and
equivalence results, without application/Auth rows, plaintext archives or keys.

- Encrypted transfer ZIP: `SafeBus-encrypted-database-backup-38762138714.zip`.
  SHA256: `109a0de5b449b3b95601d1f4240e2d75019a6bec509960420415faef7c97e63d`.
- Verification ZIP: `SafeBus-restore-verification-38762138714.zip`.
  SHA256: `5d8513e6a3f05e550ba0de4636314de5babf0f05bc51fe52f365721e93713596`.
- Validated owner restore/offsite receipt digest:
  `def744aa65c9bfd582de753924656ede2a97cfd56365f4be52db7d24949948f2`.

The accepted transfer ZIP was confirmed copied to separate Canadian offsite
storage. The protected environment receipt was renewed via stdin, without
exposing its contents in logs. Original collection-time records still mark owner
review/offsite confirmation pending; the subsequent acceptance and validated
receipt are separate records, preserving the reviewed packages unchanged.

This proves logical SQL/role recovery. Role passwords, Storage object bytes,
provider configuration/signing keys and Vault root keys remain separate recovery
items. Live signed-session/API acceptance and commercial launch are not proved
by restoring Auth records. The subsequent human-approved
[production registration](observed-production-registration-2026-10-15.md) committed
and passed independent post-commit verification.
