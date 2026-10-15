# Full database recovery: 2026-10-14

**Status:** Technical restore and verification passed; human evidence review and
the new backup's offsite-copy attestation remain pending.

## Source and approved destination

Protected encrypted export [38655618877](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38655618877)
completed after the owner approved GitHub's production environment. It binds to
reviewed main commit `7bf7b47a0e300d0e7f316f837d898e81f3edd6a8` and was created at
`2026-10-14T23:54:18.941Z`. No persistent hosted database changes were made.

The owner revoked the earlier recovery deferral, approved this laptop's existing
Ubuntu WSL as the recovery destination and confirmed its Canadian location.
The native PostgreSQL 17.11 cluster is a dedicated recovery copy, not a new
application database, staging environment or capacity-test destination.
The previously approved managed recovery project remains unchanged: its reserved
Realtime ownership prevents faithful import of this archive.

Native PostgreSQL and the required extensions were built outside the repository.
Extension versions match the exported source: pg_cron 1.6.4, pg_net 0.20.4,
pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, PostGIS 3.3.7,
supabase_vault 0.3.1 and uuid-ossp 1.1. The server patch version differs from the
observed hosted 17.6 version; comparison below verifies the actual restored data
and metadata instead of assuming identical behavior.

Before import, the server was placed in a separate network namespace without
outbound routes, with no TCP listener and an owner-only Unix socket. Cron job
execution was disabled. The pg_net worker targeted a nonexistent database rather
than consuming restored queues. These controls were checked during verification.
The recovery server was stopped after evidence collection; the protected local
copy remains available for owner review.

## Actual import and compatibility handling

Authenticated decryption verified both original plaintext archive hashes.
The complete archive and role export were restored into the fresh local cluster
in one transaction with `ON_ERROR_STOP`, including schema, data and post-data.
The successful command exited zero and committed; subsequent connections read
the restored datasets. This was not an archive listing or rollback rehearsal.

The source bootstrap identity `supabase_admin` was preserved for archived role
membership grants. Its duplicate role creation was omitted because it already
existed as the local bootstrap role. Extension creation used the recorded source
owner; the archive itself does not preserve extension ownership. The source
`postgres` role temporarily held superuser privilege inside the uncommitted local
restore transaction to create its untrusted extensions, then regained its source
`NOSUPERUSER` state before commit. Verification checked the final state.
No application SQL or COPY payload was changed: all 110 written COPY blocks
were checked against the original archive. An earlier role-grant attempt failed
and rolled back before this corrected restore; errors were not skipped.

## Verification result

| Check                                                                         | Result                                          |
| ----------------------------------------------------------------------------- | ----------------------------------------------- |
| Archived table datasets, compared as sorted multisets                         | 110/110 match                                   |
| Archived rows compared                                                        | 57,749                                          |
| Auth table datasets included                                                  | 27                                              |
| Sequence states                                                               | 4/4 match                                       |
| Format-2 catalog sections                                                     | 20 exact; remaining section equivalent as below |
| Managed Auth/Storage/Vault relations: ownership, RLS flags, grants            | 38 match                                        |
| Managed routines: definitions, owners, definer settings, search paths, grants | 28 match                                        |

The PostGIS extension's standard initial SRIDs are excluded by its recorded
pg_dump extension-data condition. The data comparison used that same condition,
verified against the source, rather than treating restored standard SRIDs as
extra application rows. The other recorded extension-data conditions match too.

The raw source fingerprint is
`10e89cf91be76ab47461a6849157204c4ac8769d11df3f00959d3ffaeda1c8a4`.
The raw restored fingerprint is
`aba4b61c99a28f8c70dcea7d22ea964ea578d62912a7f97ab83e0fe4916eb71b`.
They are **not identical**: PostgreSQL reparsing changed redundant AND nesting
in the displayed text of these six CHECK constraints:

- `public.bus_admin_details.bus_admin_details_fleet_number_check`
- `public.guardian_notification_delivery_policies.guardian_notification_policy_limits_check`
- `public.guardian_notification_delivery_policies.guardian_notification_policy_push_limits_check`
- `public.guardians.guardians_structured_names_length_check`
- `public.profiles.profiles_structured_names_length_check`
- `safebus_private.tenant_billing_accounts.tenant_billing_email_check`

For each difference, both definitions were added to identical temporary columns
in PostgreSQL and their parsed definitions and validation flags compared inside
a transaction that rolled back. All six match, including the two original
`NOT VALID` states. Substituting only those six proven-equivalent display strings
in an offline comparison produces the exact source fingerprint. No source
baseline, release fingerprint collector or drift guard was modified or weakened.

## Restricted evidence and remaining gates

The owner-local evidence package is
`SafeBus-restore-verification-38655618877.zip`; it contains metadata, counts,
hashes and equivalence results, not application/Auth rows or private keys.
Plaintext archives, SQL, detailed operational logs and recovery keys remain
outside the repository in restricted owner-local storage.
The new encrypted transfer package is
`SafeBus-encrypted-database-backup-38655618877.zip`, SHA256
`3b2f08e1ccf0512fce074ad98acde4a66ce8a1b6453c902f5efbf34d44750822`.
The earlier backup's offsite confirmation does not cover this new package.

Human evidence acceptance and confirmation of this exact backup's Canadian
offsite copy are still required before generating the human recovery receipt.
The installation's 24-hour backup/restore/rehearsal window remains enforced;
expired evidence must be renewed. See
[existing security installation](existing-security-installation.md).

This verifies logical SQL and role recovery. Role passwords, Storage object
bytes, provider configuration/signing keys, Vault root keys and external services
are separate recovery items. Migrations 0123, 0122 and 0124 remain uninstalled.
Signed-session/API acceptance, historical adoption, verified types and final
drift/advisor checks still remain for R1. This result does not approve commercial
launch or prove fleet capacity.

Code validation on the referenced source passed `pnpm typecheck`, `pnpm lint`,
`pnpm build` and `pnpm test` (682 tests).
