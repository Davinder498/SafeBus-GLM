# Point 5 — Authorization Hardening and Evidence

**Decision owner:** Platform Administrator
**Decision:** DL-016
**Repository status:** Implemented for review
**Launch-gate status:** Open — isolated hosted execution and independent sign-off remain mandatory

## 1. Plain-language outcome

SafeBus now defines two database doors:

1. `public` contains only reviewed application RPCs. These are the operations
   that a signed-in app or a trusted server job is intentionally allowed to
   request.
2. `safebus_private` contains RLS helpers, trigger functions, validators, and
   other database machinery. Authenticated database roles may use these
   routines while PostgreSQL evaluates policies, but the schema must not be
   exposed through the Supabase Data API.

Anonymous callers receive no function, table, view, or sequence access. Table
permissions for signed-in users are reconstructed from the RLS policy command
that exists for each table. New public objects start private, and new public
tables have RLS enabled automatically.

## 2. Read-only production baseline — 2026-08-15

No database changes were made during this baseline review.

- 48 of 48 public tables had RLS enabled.
- No anonymous or PUBLIC RLS policy was found.
- No policy or authorization function used editable `user_metadata`.
- Read-only impersonation showed that each of the two tenant administrators
  could read only their own tenant/profile. The Platform Administrator could
  read the two tenant control-plane rows but not another user's profile.
- Anonymous impersonation returned no rows from profiles, tenants, students,
  guardians, drivers, routes, or trips.
- The production dataset had no representative guardian, driver, student,
  route, or trip fixtures, so those role boundaries could not be proven live.

The Supabase Security Advisor reported 191 notices:

- 29 privileged functions executable by `anon`;
- 137 privileged functions executable by `authenticated`;
- 11 functions with mutable `search_path`;
- 13 RLS-enabled tables with no policy; none had an effective client grant;
- leaked-password protection disabled because it is unavailable on the Free
  plan.

The baseline also found broad legacy table/default grants. RLS prevented those
grants from returning rows, but they were unnecessary spare keys.

## 3. Repository controls

The generated migration `0089_authorization_surface_hardening.sql`:

- moves non-API routines from `public` to `safebus_private` while preserving
  policy, trigger, constraint, and view dependencies;
- rewrites stored schema-qualified helper calls in the same transaction;
- revokes all function execution from PUBLIC and `anon`;
- grants `authenticated` execution only to the reviewed manifest in
  `config/authorization-surface.json`;
- keeps notification delivery, retention, invitation-expiry, and audit RPCs
  service-role-only;
- removes authenticated access to excluded student-QR RPCs; the objects remain
  service-role-only for safe compatibility until their separately governed
  removal;
- revokes all anonymous public-table and sequence privileges;
- revokes authenticated table privileges and grants back only operations with
  a matching authenticated RLS policy;
- removes unsafe future default privileges;
- fixes unset function search paths;
- automatically enables RLS on future public tables; and
- fails the migration when an expected endpoint is absent, an unexpected
  function remains public, anonymous access survives, RLS is absent, or
  editable user metadata enters authorization code.

`pnpm authorization:audit` performs a read-only catalog and Data API audit. It
checks the exact function manifest, role grants, RLS coverage, anonymous
policies/privileges, view safety, search paths, default privileges, editable
metadata, public-schema creation rights, and verifies that
`safebus_private` is not an exposed API schema. Production execution is limited
to protected GitHub Actions.

The audit is also part of release preflight and is available as the manual
`Authorization audit` workflow.

## 4. Deliberately not executed against production

The migration is not applied by this point's repository PR. The only hosted
database is production, production adoption is deferred under DL-015, and the
RLS suites create and delete synthetic users and operational data. Running
them against production is prohibited.

Adding this migration intentionally keeps schema-changing production releases
blocked until the final prelaunch sequence.

## 5. Final hosted exit procedure

Point 5 closes only after all of the following evidence exists:

1. Complete the approved backup and one-time production adoption gates.
2. Approve the paid Supabase capability and cost before creating anything.
3. Create a temporary isolated Supabase branch; it is not a permanent DEV or
   staging database.
4. Apply every canonical migration through the authorization-hardening
   migration to the isolated branch.
5. Run all SQL files through `pnpm test:rls` with the required non-production
   identity and confirmation safeguards.
6. Run `pnpm authorization:audit` and the Supabase Security Advisor. Resolve
   every unexpected critical/high authorization finding; documented warnings
   for reviewed public SECURITY DEFINER endpoints require reviewer acceptance.
7. Obtain an independent tenant/privacy-boundary review covering platform,
   tenant, school, transportation, driver, guardian, and anonymous identities.
8. Retain redacted logs, migration/checksum evidence, advisor output, reviewer
   identity, date, findings, and dispositions.
9. Apply the verified migration to production through the protected release
   process, rerun the read-only audit, refresh generated database types, and
   delete the temporary branch after evidence retention.

## 6. Deferred paid control

Strong password rules and administrator MFA remain active during construction.
Supabase leaked-password protection must be enabled when the paid tier is
approved at final launch. Its current absence does not close Point 5 and cannot
be represented as completed evidence.

## 7. Independent review record

| Field               | Required evidence                                                     |
| ------------------- | --------------------------------------------------------------------- |
| Reviewer            | Named person who did not author the final migration changes           |
| Date                | UTC review date/time                                                  |
| Isolated target     | Non-secret branch reference and Canadian region                       |
| RLS suites          | All suites passed with redacted retained logs                         |
| Authorization audit | Exact manifest and Data API checks passed                             |
| Security Advisor    | Output retained; every finding disposition recorded                   |
| Cross-role proof    | Platform, tenant, school, transportation, driver, guardian, anonymous |
| Decision            | Approved or blocked, with unresolved findings listed                  |

No checkbox in this document substitutes for actual hosted evidence.

The deferred one-time production adoption is cryptographically pinned through
migration `0088`. It cannot silently mark migration `0089` as applied; `0089`
remains a blocking pending migration until its separately approved validation
and production rollout are complete.
