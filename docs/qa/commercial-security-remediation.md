# Commercial readiness remediation

Requested target: 10,000 buses, 1,000,000 registered users, 2,000 tenants.
Origin: commercial review dated 2026-10-09. This record tracks closure; it is not
a launch approval, deployment approval, or evidence that the target load passes.

## Current milestone: remaining mobile journeys

PR [#259](https://github.com/Davinder498/SafeBus-GLM/pull/259) merged on
2026-10-12 with required CI checks passing. The remaining six obsolete website
scenario declarations are being replaced by active mobile checks for assigned-bus
navigation, scoped presentation, empty/error states, unauthenticated deep-link
denial and the NULL-school driver scan surface. Active administrator coverage
remains on the website. Recovery and hosted security acceptance remain deferred.

## Completed implementation: commercial browser verification

PR [#258](https://github.com/Davinder498/SafeBus-GLM/pull/258) merged on
2026-10-11 with required CI checks passing. Page loading is recorded in
[frontend-page-loading.md](frontend-page-loading.md).

This milestone restored the skipped critical commercial browser
checks against the current app surfaces: administrators on the website, drivers
and guardians in the mobile entry point. It covers synthetic journeys, denial,
safe degraded behavior and automated accessibility. Hosted Auth/RLS, capacity
and signed-device field acceptance still require separate evidence.
Coverage and local verification are recorded in
[commercial-browser-verification.md](commercial-browser-verification.md).

## Completed implementation: frontend page loading

On 2026-10-11 the customer deferred the full backup restore check and requested
work on an independent commercial finding. Page loading is the next bounded
milestone: defer page code until navigation, preserve authorization guards, show
loading and recovery states, and measure production-build downloads.
Prepared changes and local production-preview measurements are recorded in
[frontend-page-loading.md](frontend-page-loading.md). PR #258 is merged.

The database security milestone below remains open. Neither this deferral nor
frontend improvements authorize deployment or commercial launch.

## Deferred milestone: authorization and session security

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

The first hosted SQL rehearsal completed reconciliation and 0122 before its
malformed-session acceptance check exposed 22P02 in the SQL session function.
The transaction rolled back and the catalog was restored. Forward migration
**0124** replaces that function with procedural validation before UUID casts;
embedded PostgreSQL tests exercise the actual migration and both allow/deny
cases. The protected rehearsal now includes 0124 before acceptance. No security
finding is closed by these unit tests or by a failed rehearsal.

The protected hosted run [38101560000](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38101560000)
now passed the full 0123 → 0122 → 0124 rollback sequence and restored its inspected
catalog; downloaded evidence hashes were verified. These changes remain
uninstalled. A guarded installation/export workflow is prepared with an actual
off-site backup/full restore receipt gate and a separate ledger recording only
the three executed security migrations. See
[existing-security-installation.md](existing-security-installation.md).
Encrypted backup run [38162842141](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38162842141)
succeeded. Local authenticated decryption and archive decoding passed; the owner
reported a matching original artifact checksum on a second laptop at a separate
Canadian location. Those checks do not prove a database restore.

The approved free Canadian hosted recovery project was provisioned with its Data
API disabled. Its TLS connection passed. A rollback-only check confirmed that its
`postgres` role cannot create archived partitions in the protected `realtime`
schema (42501). No backup data was loaded. A separate native recovery instance has
been proposed, but not approved or created. The customer deferred restoration on
2026-10-11. Before resuming installation, complete a compatible full restore and
human review, renewing backup/rehearsal evidence if the 24-hour window has expired.
Migrations 0122, 0123 and 0124 remain uninstalled; no commercial security finding
is closed by the rehearsal or backup export.

| Finding                                                    | Prepared change                                                                                                                                                                                                                                                | Closure still required                                                                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| S1: school administrators can read other schools' GPS rows | Restrictive school/route SELECT policies on current and history tables, combined with existing tenant/role policies                                                                                                                                            | Direct REST positive and negative tests across two schools/two tenants, including NULL-school routes                             |
| S2: guardians can select private admin notes               | Revoke direct SELECT on private note columns; grant explicit safe columns; admin-only, student/school-scoped notes RPC; update admin detail caller                                                                                                             | Authorized admin notes read, guardian direct-column and composite-RPC denial; test expired/inactive links                        |
| S3: revoked sessions can retain API access                 | Auth-session existence/expiry and mirror check; restrictive table/realtime RLS; role helpers; PostgREST pre-request; revocation deletes real Auth sessions; registration cannot clear a revoked mirror; server onboarding/billing check before privileged work | Real signed JWT and refresh-token tests, socket revocation/rejoin, offline Android behavior, races and legacy fixture adaptation |
| S4: anonymous bus/route membership lookup                  | Private baseline precondition and explicit anonymous execution revocation                                                                                                                                                                                      | Validate forward production reconciliation and verify anonymous API denial                                                       |
| S5: caller-controlled limiter actor/window                 | Bind authenticated actor to auth.uid(); fixed action ceilings/windows; bounded identifiers/counts; trusted service-role exception for actor only                                                                                                               | Parallel writes, cross-actor denial, fixed-window/cap enforcement, service worker compatibility                                  |

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

1. Reconstruct/reconcile the intended baseline and apply migrations 0122 and 0124 through
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

| Milestone / findings                                       | Required work                                                                                                                                                                | External decision or evidence                                                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Release integrity: R1, search-path/privilege advisor items | Bounded live catalog comparison; reviewed forward reconciliation; protected production baseline adoption; schema fingerprint, exact manifest, drift/rollback proof           | Approved isolated target, human release/adoption review; do not replay all migrations                                                  |
| Operations/pilot: R2-R4                                    | Paid compute/provider quotas; monitoring and routed alerts; authenticated synthetic checks; backup/restore and incident exercises; support/on-call ownership                 | Service budgets, vendor configuration, named owners, measured RPO/RTO and pilot authorization                                          |
| Privacy/commercial/Android/maps                            | PIA/contracts/subprocessor/residency decisions; signed-device rural/offline/battery testing; map key/plan restrictions; billing/tax acceptance                               | Legal/privacy/customer approval and real-device/vendor evidence; never invent signatures or approvals                                  |
| Scale: C1-C5                                               | Decouple synchronous GPS fan-out, authorized coalesced delivery, history partition/retention, notification deadlines/concurrency/fairness, bounded/jittered Android catch-up | Agreed retention and delivery semantics; isolated 10,000-device load, concurrency assumptions, soak/outage/reconnect and cost evidence |
| Secondary frontend/test work                               | Route splitting/rural first-load measurement; reproduce and fix intermittent browser failures; replace skipped critical journeys with real end-to-end coverage               | Measured regression and signed Android field acceptance                                                                                |

Account password protection and provider limits are hosted configuration decisions.
The customer authorized a capacity specification/local generator milestone on
2026-10-12 and selected 100,000 concurrent users for planning. The updated
[capacity specification](../governance/capacity-assumptions.md) and
[local harness](capacity-workload-harness.md) prepare that work without claiming
measured capacity. Hosted load, runtime scaling changes, budget and commercial
acceptance remain pending.
No paid plans, production data, deployed functions, retention latches, or approval
records are changed by this milestone. Unresolved findings remain launch blockers.

The customer subsequently authorized the Android pacing/retry fix. The native
FIFO now uses a single scheduled worker, randomized startup and retry waits,
persisted server delay floors and independent recovery after pause/end. See
[Android upload recovery](android-upload-recovery.md) for behavior, local tests and
limits. This addresses the device-side catch-up implementation in C5; physical
devices, fleet admission/fairness, fresh-position lag and measured recovery remain
pending. The other scale findings and deferred security/recovery release gates
are not closed by local native tests.

The next customer-authorized milestone coordinates guardian live refreshes:
one private subscription owner per client/topic and a fallback poll 15 seconds
after verification, with prompt live/authorization/trip rechecks preserved.
[Guardian refresh coordination](guardian-refresh-coordination.md) records the
client tests and limits. This addresses part of C2; synchronous server broadcast
fan-out and measured fleet capacity remain open. No security installation,
backup restore, SQL change or launch approval is implied.

## Validation record

The customer authorized C1 server engineering on 2026-10-14 while explicitly
keeping full-restore recovery deferred. The
[asynchronous tracking worker](async-tracking-invalidations.md) is implemented as
a pending forward migration with embedded PostgreSQL execution tests. It removes
guardian fan-out from GPS ingestion when activated, uses current bus-service
eligibility and bounds delivery pages. It has not been promoted to the active
manifest or applied. Recovery/security/adoption guards remain intact; C1 and
measured fleet capacity stay open until protected installation and acceptance.

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
