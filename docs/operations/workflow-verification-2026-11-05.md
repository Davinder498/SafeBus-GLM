# Workflow verification: current-session recent authentication

## Verified finding and repair

The live private `has_recent_authentication()` function and the onboarding and
billing server functions used `auth.users.last_sign_in_at`. That timestamp belongs
to the account, rather than the requesting session. A fresh sign-in on device B
could therefore renew device A's eligibility for sensitive actions, even when A
signed in more than fifteen minutes ago. Active-session, role and MFA checks were
still required; this finding concerns the additional freshness boundary.

Before: an hour-old active session could pass because the account had just signed
in elsewhere. After: the same session is denied. Signing in again on the requesting
device produces fresh proof. Refreshing its access token or completing TOTP alone
does not count as a fresh primary sign-in in the server functions.

Server functions use Supabase `getClaims(token)` to verify the exact supplied token
and inspect its signed primary sign-in AMR timestamp. They require the verified
user, authenticated role, valid session identifier and a primary sign-in within
fifteen minutes, allowing sixty seconds of Auth-server clock skew. They never use
user metadata, token issuance/refresh time or another device's account timestamp.
Missing/malformed proof denies the action; unverifiable proof returns a sanitized
temporary failure. Existing active-session, administrator MFA and role checks run
first. Read-only billing routes that do not require recent authentication retain
their existing behavior.

The prepared database correction uses the exact requesting `auth.sessions` row's
creation time, with the unchanged fifteen-minute window. It first invokes the
existing active-session guard, which validates the subject/session UUID, Auth
session existence/expiry and application revocation. The typed session lookup is
a separate procedural statement after that guard. Future or missing session
creation times deny access. No new public RPC or database grants are introduced.

## Acceptance by role

| Role | Acceptance |
| --- | --- |
| School authority admin | Existing authorized onboarding and sensitive subscription actions require this session's recent sign-in and administrator MFA. Another authority remains inaccessible. |
| Transportation admin | Existing operational permissions remain; this change grants no invitation, billing or school-authority administration privilege. Sensitive SQL operations retain their existing role/MFA checks and now use current-session freshness. |
| Retired school admin | Remains denied; no role is reintroduced. |
| Platform admin | Authorized onboarding and provider reconciliation require this session's recent sign-in and MFA. No customer purchase/cancellation authority is added. |
| Guardian | No administrator/billing access. Ordinary preferences keep their existing non-recent-auth behavior; sensitive relationship changes retain their existing checks. Optional MFA remains optional until enrolled. |
| Driver | No administrator/billing access. Assigned operational access, ordinary preferences and optional MFA policy are unchanged. |

No source-event delivery, recipient choices, personal opt-outs, quiet hours,
customer billing contracts or live trips are mutated by verification. No real
invitation, recovery email, notification or payment is sent as QA.

## Evidence and limits

Read-only hosted aggregation found six active profiles: one platform admin, three
school authority admins, one driver and one guardian. Every active privileged
administrator has a verified MFA factor. Three invitations are activated (one
delivery status delivered, two sent); two are expired with failed delivery.
Activated invitations have no role/authority mismatch with their linked profile.
These are configuration/history observations, not recorded complete live journeys.

An owned in-memory PostgreSQL regression reproduces the account-wide bug using
the observed hosted function, then verifies the correction, fresh/old/foreign/
missing/malformed/expired/revoked/future sessions and a token refresh. It rehearses
the exact protected manifest, verifies owner/ACL and function hashes, restores the
original definitions and verifies complete transaction rollback. Server tests
cover exact-token verification, stale proof despite a fresh account timestamp,
provider failures and denial before invitation or billing work.

The full real-account acceptance remains open for invitation acceptance, actual
sign-in/recovery/MFA, each role's complete journey, source-event notifications,
provider billing/cancellation, and manual assistive-technology checks. Mocked
browser tests, aggregate hosted queries and the authorization audit do not prove
these end-to-end results. Existing account identities must not be altered as QA
fixtures. No separate database is provisioned or required for this repair.

## Protected deployment

The application guard ships through the reviewed PR/Netlify deployment. The SQL
file remains pending: `20261105121134_recent_auth_current_session.sql`. Its manifest
is `config/pending/recent-auth-session.json`; it pins the observed old definition
and the unchanged active-session dependency, owners, ACLs and reviewed after hash.
The existing **Release operational fix** workflow adds `recent_auth` as a choice.

After review and merge, use exact current main SHA and `recent_auth`: rehearse with
`REHEARSE_OPERATIONAL_FIX`, then install with `INSTALL_OPERATIONAL_FIX` through the
protected production environment. Preparation checks definition drift, rehearses
and rolls back, and retains encrypted recovery before persistent installation.
Installation verifies the resulting definitions and data digest. Preserve required
reviewers, release serialization, CA validation and recovery retention. Never
replay the migration chain or apply the pending SQL directly to bypass the release.

No database install or current passing live full-workflow result is claimed here.
The original-definition recovery artifact provides a reviewed rollback if needed;
restoring it also restores the known freshness limitation and requires assessment.

References:
- https://supabase.com/docs/guides/auth/sessions
- https://supabase.com/docs/guides/auth/jwt-fields
- https://supabase.com/docs/reference/javascript/auth-getclaims

## Local validation

The full suite passed 1,504 tests: 1,042 web, 24 mobile and 438 release tests.
Type checking, lint, root/web build, mobile build and Android sync passed. An
initial pnpm Android sync stopped with a runtime library error; invoking the same
installed Capacitor CLI with Node completed successfully. Netlify function
packaging passed. Generated mobile artwork changes were restored. No real email,
notification, subscription change or production fixture was used as a test.

The hosted Auth session schema was checked read-only and includes the expected
UUID identifiers and nullable timestamp-with-time-zone creation/expiry fields.
Missing creation timestamps deliberately fail the new freshness check.
