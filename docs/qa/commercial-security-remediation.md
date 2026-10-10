# Commercial readiness remediation

Requested target: 10,000 buses, 1,000,000 registered users, 2,000 tenants.
Origin: commercial review dated 2026-10-09. This record tracks closure; it is not
a launch approval, deployment approval, or evidence that the target load passes.

## Current milestone: authorization and session security

Merged PR #252 contains forward migration **0122**, application integration,
server boundary tests and expanded protected authorization-audit checks. Existing
migrations and the production-adoption baseline remain immutable. Migration 0122
requires a reconciled private-helper baseline and refuses the drifted public-helper
layout found in production. It also refuses to silently replace another API hook.

On 2026-10-10, the customer confirmed that there are no external users or
commercial tenants and approved controlled verification on the existing project.
The target remains production-designated; a second project is optional for this
milestone. The follow-up branch prepares snapshot reconciliation **0123** and a
protected rollback-only rehearsal. See
[existing-project-security-rehearsal.md](existing-project-security-rehearsal.md).
No database patch has been applied. Protected GitHub environment review and human
PR merge review remain required.

| Finding | Prepared change | Closure still required |
| --- | --- | --- |
| S1: school administrators can read other schools' GPS rows | Restrictive school/route SELECT policies on current and history tables, combined with existing tenant/role policies | Direct REST positive and negative tests across two schools/two tenants, including NULL-school routes |
| S2: guardians can select private admin notes | Revoke direct SELECT on private note columns; grant explicit safe columns; admin-only, student/school-scoped notes RPC; update admin detail caller | Authorized admin notes read, guardian direct-column and composite-RPC denial; test expired/inactive links |
| S3: revoked sessions can retain API access | Auth-session existence/expiry and mirror check; restrictive table/realtime RLS; role helpers; PostgREST pre-request; revocation deletes real Auth sessions; registration cannot clear a revoked mirror; server onboarding/billing check before privileged work | Real signed JWT and refresh-token tests, socket revocation/rejoin, offline Android behavior, races and legacy fixture adaptation |
| S4: anonymous bus/route membership lookup | Private baseline precondition and explicit anonymous execution revocation | Validate forward production reconciliation and verify anonymous API denial |
| S5: caller-controlled limiter actor/window | Bind authenticated actor to auth.uid(); fixed action ceilings/windows; bounded identifiers/counts; trusted service-role exception for actor only | Parallel writes, cross-actor denial, fixed-window/cap enforcement, service worker compatibility |

Invited accounts keep their real Auth session so password setup and account
activation remain possible. Role helpers still require an active profile/tenant;
session validity is not a role grant. The boolean session-status RPC is the sole
user endpoint exempted from the pre-request check so a revoked client can sign out.
Service-role background jobs retain their existing authentication boundary.

The new notes RPC returns the existing student_guardians row type. The checked-in
TypeScript contract includes a forward declaration pending regeneration against
the validated migrated target. The deployed frontend must not be released before
the database/API migration and schema cache are validated.

## Security acceptance on the approved existing project

1. Reconstruct/reconcile the intended baseline and apply migration 0122 through
   the guarded migration workflow. Run the security advisor and exact RPC audit.
   Confirm private schemas are not exposed and the actual PostgREST hook executes.
2. Provision synthetic tenants A/B, schools A1/A2, platform/tenant/transportation/
   school admins, assigned/unassigned drivers, guardians with active/expired links,
   invited/suspended users, and actual Supabase-issued sessions. Never reuse or
   modify existing production identities as test fixtures.
3. Exercise S1-S5 via direct REST/RPC calls, independent of the UI. Include success
   cases: otherwise an implementation that denies everyone could falsely pass.
4. Save a JWT and refresh token; revoke its real session using an authorized admin.
   Assert table reads/writes, sensitive RPCs and onboarding/billing actions deny
   the saved JWT, refresh cannot restore it, and registration cannot resurrect it.
   The session-status RPC must return false. A fresh login must still work.
5. Test invitation/password activation, MFA/recovery, native device registration,
   GPS ingestion, guardian visibility and trip end with real sessions. Older SQL
   fixtures without auth.sessions/session_id need real-session fixture support
   before using the full historical suite as acceptance evidence. Do not relax
   session checks or spoof the production environment to make them pass.
6. Exercise already-open private realtime sockets after revocation/link expiry.
   Realtime caches channel authorization; a new restrictive policy alone does not
   prove immediate termination of existing subscriptions. Data refetch must deny.
   Confirm the required channel lifecycle behavior before closing S3.
7. Run tests/rls/commercial-security-existing-database-readonly.sql after the
   approved release. It returns no customer data and covers catalog/negative checks.
   It does not substitute for the positive/scoped scenarios above.

Current docs: [Supabase sessions](https://supabase.com/docs/guides/auth/sessions),
[API pre-request and product boundaries](https://supabase.com/docs/guides/api/securing-your-api).
The API hook applies to PostgREST; Storage/Realtime require their own RLS and
existing-session lifecycle checks. Other API products must be verified explicitly.

## Subsequent milestones (not implemented early)

| Milestone / findings | Required work | External decision or evidence |
| --- | --- | --- |
| Release integrity: R1, search-path/privilege advisor items | Bounded live catalog comparison; reviewed forward reconciliation; protected production baseline adoption; schema fingerprint, exact manifest, drift/rollback proof | Approved isolated target, human release/adoption review; do not replay all migrations |
| Operations/pilot: R2-R4 | Paid compute/provider quotas; monitoring and routed alerts; authenticated synthetic checks; backup/restore and incident exercises; support/on-call ownership | Service budgets, vendor configuration, named owners, measured RPO/RTO and pilot authorization |
| Privacy/commercial/Android/maps | PIA/contracts/subprocessor/residency decisions; signed-device rural/offline/battery testing; map key/plan restrictions; billing/tax acceptance | Legal/privacy/customer approval and real-device/vendor evidence; never invent signatures or approvals |
| Scale: C1-C5 | Decouple synchronous GPS fan-out, authorized coalesced delivery, history partition/retention, notification deadlines/concurrency/fairness, bounded/jittered Android catch-up | Agreed retention and delivery semantics; isolated 10,000-device load, concurrency assumptions, soak/outage/reconnect and cost evidence |
| Secondary frontend/test work | Route splitting/rural first-load measurement; reproduce and fix intermittent browser failures; replace skipped critical journeys with real end-to-end coverage | Measured regression and signed Android field acceptance |

Account password protection and provider limits are hosted configuration decisions.
No paid plans, production data, deployed functions, retention latches, or approval
records are changed by this milestone. Unresolved findings remain launch blockers.

## Validation record

Local code checks and SQL syntax parsing are recorded in the PR. Database migration
execution and real-role authorization acceptance remain pending the protected
existing-project rehearsal and release. Parsing SQL does not validate deployed privileges, PL/pgSQL type resolution,
function ownership, Auth schema compatibility, or actual API hook operation.

Completed locally: uncached `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`
(335 web + 2 mobile + 171 release/contract tests), migration checksum verification
(123 immutable files), dependency audit (no known production vulnerabilities), and
PostgreSQL SQL/PL/pgSQL syntax parsing of the new migration and read-only acceptance
script. Build chunk-size warnings remain tracked in the secondary milestone.

The first focused browser run exposed fixtures rejecting the now-checked session
registration RPC. That run was interrupted after reproducing the failure. Explicit
session-lifecycle fixture responses fixed it; all eight existing desktop workspace
cases then passed. The final workspace run passed all 18 cases, including the new
registration-failure scenario in both viewports. The complete mobile UI suite also
passed all 32 cases. These are mocked browser checks, not hosted authorization or
physical-device acceptance.
