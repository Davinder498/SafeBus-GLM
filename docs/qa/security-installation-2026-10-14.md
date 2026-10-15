# Protected security installation: 2026-10-14

**Status:** Installation committed and catalog/negative acceptance verified.
Real signed-session/API acceptance and historical adoption remain open.

After the owner accepted the [full recovery](full-database-recovery-2026-10-14.md)
and confirmed the exact backup's Canadian offsite copy, the bound recovery receipt
validated and was stored in the protected production environment.
Fresh protected rehearsal
[38665120891](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38665120891)
passed; downloaded evidence matched the source catalog and SQL checksums.

The owner then approved the persistent installation's GitHub environment review.
Protected run [38665578510](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38665578510)
successfully installed **0123 → 0122 → 0124** atomically from reviewed source
`7bf7b47a0e300d0e7f316f837d898e81f3edd6a8`. The ledger's actual timestamp is
`2026-10-15T01:31:19.978617Z` (2026-10-14 in Alberta).
No historical migration replay or frontend deployment was performed.

## Independent read-only verification

Bounded catalog checks used read-only transactions, local statement/lock timeouts
and final rollback. They verified the actual ledger rather than relying only on
workflow success. Restricted evidence is retained outside the repository.

| Check                                                                      | Result                                   |
| -------------------------------------------------------------------------- | ---------------------------------------- |
| Singleton installation ledger and downloaded workflow evidence             | Match                                    |
| Source SHA, backup, rehearsal, recovery receipt and executed SQL checksums | Match                                    |
| Ledger RLS enabled; anonymous/authenticated SELECT                         | Enabled; both denied                     |
| PostgREST active-session hook                                              | Installed                                |
| Historical migration ledger/environment identity                           | Absent, intentionally not fabricated     |
| Missing/malformed identity/session and API denial SQL acceptance           | PASS                                     |
| Public RPC signatures versus committed allowlist                           | 181; no missing or unexpected signatures |
| Authenticated/service-role RPC privileges versus committed allowlists      | Exact match                              |
| Anonymous public RPC execution                                             | None                                     |
| Complete current recovery catalog versus installed ledger fingerprint      | Exact match                              |

The raw format-2 application fingerprint is
`067a93c5812bca1f8976d4f836d4d8d59f2aab054ea79fbff8dba0f425ce773c`.
The full recovery catalog digest, including authorization and default privileges,
is `32c147489fa426d58eadad7ef75103a55fcfef9d82339573a794b35ab5e928c4`;
it matches the installed event's digest without normalization or baseline edits.
The read-only bridge preserves node-postgres's `name[]` decoding and SQL JSON
field order so it compares the same digest preimage as the protected installer.
Private API rejection passed before and after installation in the protected job.

## Remaining evidence and reviewed follow-up

Authoritative connected type generation found the committed type surface stale:
49 versus 57 public tables and 251 versus 181 public function names. Eight hosted
tables and eight billing/audit functions are missing from the committed contract;
78 old public function names are absent from the installed public schema.
An existing read-only type-refresh workflow will generate a reviewable PR;
no generated contract was silently substituted or marked verified.

The refreshed Security Advisor reports:

- One private RLS ledger without policies. Its schema/table client privileges
  are revoked; do not create a public policy to suppress this informational item.
  [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- 129 authenticated SECURITY DEFINER findings requiring function-specific access
  review and actual role/tenant acceptance. An exact RPC allowlist match is not
  proof that every function authorizes correctly.
  [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- Disabled leaked-password protection; provider-setting review remains open.
  [Password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Performance Advisor also reports 37 unindexed foreign keys, nine RLS init-plan
findings, 45 unused indexes and 25 multiple-permissive-policy findings. These are
observations for subsequent reviewed work, not permission to change indexes or
policies while completing this point.

Security findings S1–S5 remain open until their required real signed JWT/refresh,
tenant/school/role, invitation, revocation/realtime and native-device acceptance
passes. Historical adoption needs a separately reviewed provenance contract that
distinguishes inherited observed schema from executed migrations. The obsolete
adoption entry point remains stopped before connecting. Release integrity and
commercial launch are not yet complete.

The exact source passed `pnpm typecheck`, `pnpm lint`, `pnpm build` and `pnpm test`
in protected validation (682 tests); Markdown formatting and diff checks cover
this documentation update. Pending migration 0125 remains unapplied.
