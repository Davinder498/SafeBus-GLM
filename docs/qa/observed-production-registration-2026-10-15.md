# Observed production registration evidence

**Status: committed and independently verified; authorization default-privilege gate failed.**

Human-approved protected run
[38764375653](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38764375653)
registered the reviewed observed schema from main
`750bce6c4cff7402953fd1f68b0ac8cf490e6f31`.
The actual registration timestamp is `2026-10-15T15:59:07.146328Z`.
The workflow rehearsed and rolled back immediately before its guarded atomic
commit, then verified the committed metadata. Canonical hosted types passed.

The [fresh backup/full restore](full-database-recovery-2026-10-15.md), accepted
Canadian offsite receipt and successful protected rehearsal were bound to this
run. The failed earlier rehearsal was not used as acceptance evidence.

## Independent production observation

A separate bounded read-only catalog transaction used local statement/lock
timeouts and final rollback. It inspected metadata only, without application or
Auth rows, and verified the workflow artifact against the actual stored records.

| Check                            | Verified result                                                            |
| -------------------------------- | -------------------------------------------------------------------------- |
| Production identity              | One, matching the exact database/API binding                               |
| Observed baseline                | One, matching contract, manifest, source catalog, fingerprint, SHA and run |
| File dispositions                | 125 exact filename/version/checksum/size/evidence matches                  |
| Frozen historical inputs         | 122; execution/effect equivalence not claimed                              |
| Actual execution records         | 3: 0123 → 0122 → 0124 from the original security event                     |
| Applied timestamps               | Original `2026-10-15T01:31:19.978617Z`, checked at PostgreSQL precision    |
| Original security ledger         | Unchanged, including source/installed catalog and recovery provenance      |
| Private release metadata tables  | Six, all RLS enabled; no anon/authenticated table or schema privileges     |
| Release-schema policies/routines | None                                                                       |
| Application release records      | Zero; no application deployment was fabricated                             |
| Public RPC signatures            | 181 exact reviewed signatures                                              |
| Authenticated/service-only RPCs  | 146 / 35                                                                   |
| Anonymous RPC execution          | None                                                                       |

The source application fingerprint is unchanged:
`067a93c5812bca1f8976d4f836d4d8d59f2aab054ea79fbff8dba0f425ce773c`.
The source recovery catalog remains
`a5dbca69aaff8380318ce4709d57b7608226b5f124ba93f7cb071ec78c2dfb4f`.
The original installed security catalog digest is still retained independently;
the reviewed [two-partition reconciliation](observed-catalog-reconciliation-2026-10-15.md)
was verified rather than overwriting that historical event.

## Advisor snapshot and remaining verification

Fresh Security Advisor results contain six `rls_enabled_no_policy` notices, all
for these intentionally closed private release tables. Independent privilege
checks include all table privileges, including `MAINTAIN`, and schema
`USAGE`/`CREATE`; both client roles have none. Adding client policies would change
the intended isolation.

The advisor still reports 129 authenticated SECURITY DEFINER executions and
disabled leaked-password protection. Exact catalog allowlists do not prove every
routine's runtime authorization; signed-session and role/tenant/school acceptance
remain required. No blanket revocation or provider setting change was performed.

Performance Advisor findings remain 37 unindexed foreign keys, 9 RLS initplan
items, 45 unused indexes and 25 multiple-permissive-policy items. They belong to
their separately reviewed performance/scaling work; no capacity claim is made.

Protected authorization audit
[38765670022](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38765670022)
failed on unsafe default privileges. Earlier exact RPC/grant/RLS checks passed;
later session and Data API checks were not reached in that run. Read-only
investigation confirmed the grants, including managed `supabase_admin` defaults.
See the [default-privilege findings and remediation prerequisites](default-privilege-audit-2026-10-15.md).
The audit has not been waived and no baseline was rewritten to conceal it.

The prepared
`verify-release-integrity.yml` workflow will run canonical drift, schema preflight,
types and authorization entry points together on an exact reviewed main SHA,
using protected credentials and metadata-only evidence. It performs no database
writes or application deployment. It is not a production-release attestation or
commercial approval.

Real signed JWT/refresh, tenant/school/role, invitation, revocation/realtime and
native acceptance remain open. This registration closes observed-schema adoption,
not the entire R1/commercial launch checklist.
