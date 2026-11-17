# Recovery runtime security

Status: prepared for protected installation; hosted installation is not yet verified.

Schema bootstrap deliberately omitted provider-managed settings and policies.
The recovery target therefore lacks production's API pre-request hook and five
Realtime message policies. This change restores those controls on the named
recovery target while retaining the disabled Data API and revoked application
schema access. It creates no persistent test accounts or external deliveries.

## Scope and acceptance

- Register `safebus_private.enforce_active_api_session` for `authenticator`.
- Install the three existing receive policies: personal notification topics,
  authorized shared bus topics, and legacy guardian/district tracking topics.
- Install restrictive active-session and MFA policies for authenticated users.
- Compare the complete policy catalog, including expressions and roles, to the
  reviewed production snapshot in `tests/capacity/recovery-runtime-policies.json`.
- Keep application schema access denied for anon, authenticated and service_role.
- Reject a production identity, nonempty target, changed application functions,
  existing message policies or an already-configured hook before changing DDL.

The existing legacy tracking policy is retained for compatibility with older
Android clients. Its historical school_admin enum does not re-enable that retired
role; the stored-role helpers and profile retirement checks remain unchanged.

The expanded hosted rollback-only role rehearsal passed for school authority and
transportation administrators, guardians, drivers and platform administrators.
Retired school-admin creation is rejected. Direct hook calls enforce valid sessions
and administrator MFA; unenrolled guardians/drivers retain aal1 access. See the
[role evidence](recovery-role-rehearsal-2026-11-17.md).

Local PostgreSQL policy tests compare exact parsed policy expressions and exercise
private notification topics, restrictive session/MFA denial and denied client
inserts. Their helper functions are stubs; they do not prove live subscriptions.

## Protected rollout

After merge and green checks, run **Install isolated recovery runtime security**
(`release-capacity-runtime.yml`) on main with the full reviewed current main SHA
and confirmation `INSTALL_RECOVERY_RUNTIME_SECURITY`.

It reuses the existing protected environment's recovery-only connection secret and
PEM CA variable. No production database credential is passed to the install job.
Code validation completes before credentials are made available. The runner takes
the shared schema deployment advisory lock and checks the staging project binding.

The runner rehearses the entire migration and role fixtures, then rolls back and
checks the original provider baseline. It repeats the migration for installation,
runs the role fixtures within a rolled-back savepoint, verifies schema quarantine,
and commits only after verification. A final read-only transaction checks committed
policies, hook and project identity. The artifact `evidence.json` records the SQL
digest and exact release revision without credentials or fixture identities.

The migration fails if already installed rather than overwriting policies. If a
post-commit verification or artifact step fails, inspect the committed catalog
before another attempt. Do not remove guards or replay the bootstrap.

## Remaining verification

Installation is not proof that PostgREST invoked the hook over HTTP, that Auth
login/MFA works, or that Realtime delivers messages. Persistent synthetic accounts,
provider isolation, reference data and the controlled API enablement still need
their own verified preparation before end-to-end tests or capacity load. No paid
compute change or production load test is included. Fifty eligible notification
recipients must not be modeled as fifty concurrent map viewers.

## First installation attempt and correction

[Run 44182462798](https://github.com/Davinder498/SafeBus-GLM/actions/runs/44182462798)
passed credential-free validation and the migration rehearsal SQL, then failed at
`rehearse-catalog`. The native `pg` driver returns PostgreSQL `name[]` as a string,
while PGlite returns an array. The exact comparison therefore rejected the policy
roles even though the SQL had succeeded. The verifier now casts roles to `text[]`
and shares that query with the regression test, which checks the query's wire type
and the production driver's parser. All policy expressions, roles and other fields
remain compared exactly. Catalog failures now include a fixed, credential-free
reason code. A read-only query using the corrected projection on the source
project matched all five reviewed policies exactly.

A read-only hosted check after the failure confirmed zero Realtime policies, zero
registered API hooks, zero Auth users and zero API roles with application schema
access. The rehearsal rolled back; installation did not commit. Run the corrected
workflow using the new reviewed main revision after merge, not the failed revision.
