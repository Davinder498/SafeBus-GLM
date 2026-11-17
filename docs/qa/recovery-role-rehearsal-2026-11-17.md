# Recovery database role rehearsal

Status: passed on `deladookciebwvqojhkv` on 2026-11-17. This is database role and
session-policy evidence, not Auth login, full application parity, or fleet capacity.

The installed schema was independently verified as 56 public and 34 private
tables. Before the rehearsal, Auth users, cron jobs, Vault secrets and Storage
objects were empty, and no Edge Functions were deployed. The security advisor
reported only 20 informational RLS-without-policy findings on private tables;
these intentionally deny direct row access and were not given permissive policies.
See [Supabase's explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

## Executed acceptance checks

`tests/capacity/recovery-role-rehearsal.sql` ran against the recovery project only.
Its guard requires the registered staging project hash, empty identity/tenant
fixtures, no jobs/secrets/storage objects, and existing schema-access quarantine.
Insert triggers on tenants/profiles and their called guards were inspected before
execution. Auth user/session tables had no custom insert triggers. The exercised
paths create agreement requirements and notification-policy rows, but do not
invoke delivery functions. No live password, JWT, refresh token, invitation,
provider destination, device token, or real person's data was created.

The script creates two fake districts and seven identities within one transaction.
It grants authenticated schema USAGE only in that uncommitted transaction, changes
to the actual `authenticated` database role for assertions, and retains existing
RLS and object permissions. It always rolls back. Afterward it checks that users,
sessions, tenants, profiles, derived agreement/policy rows, and temporary schema
grants are gone. The first development attempt had a PL/pgSQL CASE syntax error;
that was corrected, and the final expanded script passed on the hosted target.

| Actor                  | Verified behavior                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| School authority admin | Own district visible at aal2; other district/profile rows denied; tenant rows denied at aal1 |
| Transportation admin   | Own district visible at aal2; cross-district profiles denied; tenant rows denied at aal1     |
| Guardian               | Own profile and district visible without enrolled MFA; cross-district profiles denied        |
| Driver                 | Own profile and district visible without enrolled MFA; cross-district profiles denied        |
| Platform admin         | Both synthetic districts visible at aal2; tenant rows denied at aal1                         |
| Retired school admin   | Profile creation rejected by the existing retirement trigger                                 |
| All seven identities   | Missing session, another user's session, and expired session deny tenant/profile reads       |
| Metadata role spoofing | User metadata claiming platform admin does not override the stored profile role              |

The final result was `recovery_role_rehearsal=passed`, `synthetic_identities=7`,
`persisted_accounts=false`, `login_verified=false`, `capacity_verified=false`.

The expanded rehearsal also passed direct calls to
`safebus_private.enforce_active_api_session()` for a simulated GET `/tenants`.
Valid aal2 sessions pass; unenrolled guardians/drivers also pass at aal1.
Privileged aal1, missing, wrong-user and expired sessions raise permission errors.
This exercises the hook function, not its registration or invocation by HTTP.

## Limits and next step

This test simulates claims inside a privileged test connection and then executes
checks as authenticated. It does not sign in through Supabase Auth or test JWT
signature validation, actual MFA enrollment, HTTP pre-request hooks, participant
agreement acceptance, guardian/student linking, driver GPS ingest, notification
fan-out, or Realtime subscriptions. The provider configuration and reference data
omitted during bootstrap still need review before persistent accounts/API exposure.

The public API remains disabled from bootstrap; this rehearsal does not change
that configuration. Schema access is quarantined after rollback. Further capacity
preparation must keep viewer demand separate from eligible notification recipients:
50 linked parents does not imply 50 active map viewers. No paid compute change or
production load test was performed.
