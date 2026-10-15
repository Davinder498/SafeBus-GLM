# SafeBus commercial-readiness review

**Verdict: not ready for general commercial use on the available evidence.**
**Capacity: architecture reviewed; full-target capacity unverified.**
Review date: 2026-10-15, America/Edmonton. Application review base:
`df216b72593e0e294422df42a4fcf5ce0029d33d` (merged PR #276).
This PR changes readiness policy/validators and documentation, not production
permissions, infrastructure, application workflows or deployed features.

The owner defines readiness as lawful privacy/business practices, secure and
correct business logic, usable interfaces, application reliability and a
credible capacity assessment. Backup/full-restore/disaster-recovery exercises
are excluded. Reconnects/offline queues remain in scope. Support contact and
unconditional counsel appointment are not launch prerequisites.

## Evidence and method

- Read the active application, server functions, Android tracking sources,
  migration manifest, existing tests, public pages and draft business/PIA pack.
  Historical migration text is an input, not proof it ran.
- Protected [run 38769699367](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38769699367)
  on the review base passed the 125-file manifest, registered drift, production
  preflight and authoritative types. It recorded exactly three actual security
  executions, 122 frozen historical inputs and zero pending active migrations.
  Authorization stopped at the 51 default-privilege entries; later checks in
  that serial audit did not run. No check was waived or rerun unchanged here.
- New [hosted observation](commercial-readiness-hosted-observation-2026-10-15.json)
  used bounded read-only catalog transactions with rollback, no customer/Auth
  rows, fixtures or notifications. Public tables without RLS: **0**; anonymous
  public policies: **0**; anonymous relation grants including TRUNCATE: **0**;
  client schema creators: **0**; missing restrictive session policies: **0**.
  The expected PostgREST session hook is configured; guardian private-note
  column access is denied. These are catalog facts, not signed-user acceptance.
- Additional read-only routine metadata confirmed the installed location-change
  function calls the route-broadcast helper; that helper contains a recipient
  loop, and its sender invokes Realtime. No routine was executed as a test.
- Security Advisor: six no-policy notices on intentionally closed private
  release tables, 129 authenticated SECURITY DEFINER warnings and disabled
  leaked-password protection. Warnings are not counted as demonstrated exploits.
- Local validation results are recorded at the end. Browser mocks are local-only;
  no hosted load, paid provisioning, migrations, deployment or restore occurred.

Categories below are **law**, **engineering** (best practice), or **policy**
(owner decision). Law references identify duties to assess, not a court finding
or universal mandate to use a particular implementation. See the
[complete requirement classification](../governance/commercial-readiness-requirements.md).

## Findings

### Launch rules and release integrity

| ID    | Category; severity; status          | Evidence and consequence                                                                                                                                                                                         | Smallest next action; blocking scope                                                                        |
| ----- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| CR-01 | Policy; informational; **passed**   | Operations/privacy/customer-activation records are version 2. Recovery drills are no longer required by launch validation; historical evidence is retained. All actual records remain unapproved/not authorized. | Review this PR; no automatic launch approval.                                                               |
| CR-02 | Policy; informational; **excluded** | Backup/full-restore, disaster-recovery, RPO/RTO and application-rollback drill acceptance are outside this launch review by owner instruction.                                                                   | No new drill scheduled. Existing protected production-change rules remain separate.                         |
| CR-03 | Policy; informational; **passed**   | A support ticket is optional. A sourced legal assessment replaces unconditional counsel signoff. Neither vendor contact nor a counsel signature can substitute for missing legal/privacy evidence.               | Use specialist help only where a specific issue/contract warrants it; no blanket launch dependency.         |
| CR-04 | Engineering; high; **passed**       | Protected manifest/drift/preflight/types results above establish the current registered schema contract. Three executions remain distinct from 122 historical files.                                             | Preserve immutable provenance; product release-integrity prerequisite satisfied for these four checks only. |

### Security

| ID     | Category; severity; status          | Evidence and consequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Smallest next action; blocking scope                                                                                                                                                                                                                                          |
| ------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-01 | Engineering; high; **failed**       | The protected audit found 51 future-object permission entries: 25 for `postgres`, 25 for `supabase_admin`, one implicit function default for `pg_database_owner`. Existing-object checks above do not show anonymous data access. Broad defaults can expose a newly created function/table if its migration omits explicit grants. No client has CREATE in public, which limits who can introduce objects.                                                                                                      | Prepare app-controlled default hardening; assess the exact provider-owner and implicit-role cases and document supported protections. Any exception needs specific evidence. Keep authorization blocked until reviewed correction/justification passes; **product security**. |
| SEC-02 | Engineering; high; **unverified**   | Session checks exist in `session-security.mjs`, installed restrictive policies and hook; local session-claim PostgreSQL tests cover malformed, missing, expired and revoked cases. Real signed JWT/refresh, cross-tenant/school/guardian/driver, invitation and already-open Realtime behavior are not established by mocks or catalog checks. [Supabase session semantics](https://supabase.com/docs/guides/auth/sessions), [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization). | Complete scoped positive/negative signed-session acceptance under an approved test procedure; **product security/customer activation**.                                                                                                                                       |
| SEC-03 | Engineering; high; **failed**       | Hosted `server_version` remains 17.6. Supabase's [17.11 security update](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) identifies security fixes and compatibility checks. An exploit against SafeBus is not demonstrated here.                                                                                                                                                                                                                                                         | Review applicability/extension compatibility and schedule a supported protected patch; **security maintenance before commercial activation**. No upgrade in this PR.                                                                                                          |
| SEC-04 | Engineering; medium; **unverified** | Advisor reports leaked-password protection disabled. Administrator MFA is implemented, but this does not establish all account/password lifecycle safeguards. [Supabase password security](https://supabase.com/docs/guides/auth/password-security).                                                                                                                                                                                                                                                            | Verify available provider controls, invitations/password setup and abuse defenses; resolve or document an evidence-backed treatment; **product authentication**.                                                                                                              |
| SEC-05 | Engineering; medium; **passed**     | No-RLS/no-anonymous-policy/no-anonymous-grant/session-hook/guardian-private-column catalog checks passed. Six private no-policy tables are intentionally inaccessible to clients. The 129 SECURITY DEFINER warnings need routine-specific scope review rather than counting each as an exploit.                                                                                                                                                                                                                 | Retain these observations; continue runtime evidence for SEC-02.                                                                                                                                                                                                              |

### Business logic and user experience

| ID     | Category; severity; status          | Evidence and consequence                                                                                                                                                                                                                                                                                                                            | Smallest next action; blocking scope                                                                                                                                                            |
| ------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| APP-01 | Engineering; high; **unverified**   | Local unit/contract suites cover onboarding/invitation atomicity, expiry, role guards, student/guardian links, school/tenant lifecycle, route/bus/driver assignments and trip transitions. Signed-provider acceptance remains incomplete; a passing code contract is not proof of an installed historical migration's behavior.                     | Close runtime acceptance against actual installed workflows, including duplicate/concurrent writes and invalid assignments; **business correctness/customer activation**.                       |
| APP-02 | Engineering; medium; **passed**     | Billing source enforces tenant-admin AAL2/session checks, webhook signatures, event-receipt deduplication, approved annual CAD prices and server-derived tenant projection. Local billing/session/subscription contracts exercise these boundaries. Billing delinquency does not automatically suspend transport operations in the reviewed design. | Preserve local safeguards; real billing/cancellation/tax acceptance remains LAW-04.                                                                                                             |
| UX-01  | Engineering; medium; **unverified** | Browser suites exercise admin route/trip operations, role rejection, generic failures, map fallback, mobile driver bus-QR start/end, guardian linked-bus visibility, session registration failure, stale/verification states and keyboard/automated accessibility. These use synthetic HTTP/WebSocket fixtures.                                     | Retain the local results below; complete remaining real-user/assistive-technology journeys before claiming full [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) conformance; **UI/UX acceptance**. |
| UX-02  | Engineering; high; **unverified**   | Signed Android background/rural/offline/battery, permission denial/revocation, reboot, lost-device and end-of-trip behavior require physical evidence. Browser camera mocks and Java/source tests do not establish Android OS behavior.                                                                                                             | Execute the existing signed-device acceptance checklist; **customer activation on supported Android devices**.                                                                                  |
| APP-03 | Policy; medium; **failed**          | CR1 excludes student QR boarding, but AdminStudentDetailPage renders StudentQrCredentialPanel and DriverManifestPage renders StudentQrScanner. Local workspace tests exercise issuing/replacing/revoking passes. The source UI and written commercial boundary need reconciliation. Bus QR authorization is a separate committed workflow.          | Reconcile approved commercial scope or feature availability before release; check other excluded roadmap features too. **Feature activation**; no feature is added or disabled in this review.  |

### Legal, privacy and commercial documents

| ID     | Category; severity; status | Evidence and consequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Smallest next action; blocking scope                                                                                                                                                                                                           |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LAW-01 | Law; high; **unverified**  | Business drafts still contain owner-requested legal-identity/contact placeholders. The public policy uses a brand, an effective date and a school/Play contact route; it is not evidence of a finalized business privacy program or reachable SafeBus inquiry/billing privacy contact. PIPA requires accountable practices and appropriate transparency. [Alberta responsibilities](https://www.alberta.ca/organization-responsibilities-for-protecting-personal-information), [OIPC implementation](https://oipc.ab.ca/resource/pipa-implementation/).                                                                               | Supply actual business/privacy contacts, complete the sourced activity-by-activity legal assessment, and reconcile publication; **business/publication readiness**. No appointment of counsel is required by this gate.                        |
| LAW-02 | Law; high; **unverified**  | The platform PIA/role map is a draft. For customer-directed public-school records, the public body retains duties and must assess authority, notices, service-provider responsibilities and whether PIA preparation/signature/submission applies. [OIPC service-provider guidance](https://oipc.ab.ca/resource/popa-guidance-service-providers/), [POPA PIA guide](https://oipc.ab.ca/resource/popa-pia-template-completion-guide/), [education-law index](https://www.alberta.ca/k-12-education-legislation-and-regulations).                                                                                                        | Complete the platform assessment; require the actual customer authority/agreement and `privacyAssessmentReference` at activation. **Customer activation**, not ownership of SafeBus.                                                           |
| LAW-03 | Law; high; **unverified**  | Supplier/location/contract/cross-border references remain null. Canada-region database metadata alone does not establish Netlify, maps, email, Stripe, FCM, monitoring or support-access flows. Applicability differs between private business activities and school-directed processing. [OPC jurisdiction overview](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/02_05_d_15/), [Alberta service-provider disclosure guidance](https://www.alberta.ca/organization-responsibilities-for-protecting-personal-information), [POPA supplier guidance](https://oipc.ab.ca/resource/popa-guidance-service-providers/). | Verify actual suppliers, countries, purposes, agreements and notices. Stripe billing has now been added to the readiness supplier gate; actual review remains open. **Privacy readiness and relevant customer activation**.                    |
| LAW-04 | Law; high; **unverified**  | MSA/order form/DPA/SLA are substantive drafts, but price, renewal election, liability, support and business/tax inputs remain unfilled. Real Stripe portal cancellation, invoice/tax configuration and signed commercial terms are not validated here. Tax obligations depend on actual registration/supply facts. [CRA charging/invoicing](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html).                                                                                                                                                                | Finalize business choices; reconcile tested billing/cancellation behavior and applicable invoice/tax duties; execute per-customer terms. **Paid customer activation**.                                                                         |
| LAW-05 | Law; high; **unverified**  | The public policy states deletion schedules (30-day raw locations/90-day notifications), but the retention runner defaults to dry-run unless a server-only flag is enabled. No approved periods, deployed flag state, safe enforcement/hold/deletion evidence or completed request process was supplied. This does not prove deletion is disabled; it proves the public promise is not supported by this review's evidence. [Alberta retention guidance](https://www.alberta.ca/organization-responsibilities-for-protecting-personal-information).                                                                                   | Verify actual enforcement and holds and publish accurate wording. Test access/correction/deletion and session/device revocation without destructive production fixtures. **Privacy/publication readiness**; no full-restore exercise required. |

The format-2 legal record requires four sourced applicability decisions: Alberta
private-sector activities; public-school POPA/ATIA relationship; federal privacy
jurisdiction/transfers; education and commercial obligations. A framework marked
not applicable still requires a source and rationale. A machine-valid reference
does not establish the underlying legal conclusion. Business registration alone
does not determine all four frameworks. Customer-specific signatures cannot be
invented by SafeBus, and specialist review remains available for particular issues.

### Reliability and capacity

| ID     | Category; severity; status        | Evidence and consequence                                                                                                                                                                                                                                                                                                       | Smallest next action; blocking scope                                                                                                                                                                                           |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| REL-01 | Engineering; high; **failed**     | `guardian-notification-email.mjs` calls provider `fetch` without an explicit timeout and processes claimed rows sequentially. Claims use a 120-second lease; a stalled send can consume the invocation/lease budget and delay unrelated recipients. Retries/idempotency reduce duplication but do not bound the send duration. | Add bounded provider/RPC deadlines, align claim size/lease with work and verify slow-provider/overlap/fairness cases in a separate correction; **notification reliability**.                                                   |
| REL-02 | Engineering; high; **unverified** | The public 15-minute health monitor checks shell/routes/headers/map configuration, not signed-in Auth/database/tracking/notification journeys. Alert routing, redaction, quotas, support ownership and observation records remain incomplete.                                                                                  | Verify privacy-safe core workflow monitoring, routed alerts, response ownership and thresholds; **operating readiness**. No recovery drill is needed.                                                                          |
| CAP-01 | Engineering; high; **failed**     | Installed catalog helper chain still performs recipient-loop broadcast work during location updates. The asynchronous worker is only `supabase/migrations/pending/0125_async_tracking_invalidations.sql`; it is absent from the active manifest and is not installed.                                                          | Review/activate a bounded asynchronous design in its own protected milestone, with authorization/fairness evidence; **target-capacity architecture**. No claim that a small pilot necessarily fails follows from this finding. |
| CAP-02 | Engineering; high; **unverified** | The agreed model has 3-second GPS reporting: about 3,333 fresh events/s and 96 million history events per eight-hour operating day. Thirty-day history sensitivity is 2.88 billion events before indexes/WAL. Guardian traffic, skew, fan-out and reconnect demand add load. These are calculations, not benchmarks.           | Complete history/index/retention/query-plan and queue-budget review; specify compute, I/O, connections, quotas and client refresh limits. **Capacity claim**.                                                                  |
| CAP-03 | Policy; high; **unverified**      | No end-to-end full-target measurement demonstrates 10,000 active buses, 100,000 concurrent users, one million accounts or 2,000 organizations. Provider plan names, local tests and generator simulations cannot establish these numbers. Owner selected review only for this milestone.                                       | Retain a costed measurement checklist for later owner consideration; **full-target capacity/SLA claims** remain unavailable. No infrastructure purchase or hosted load is authorized here.                                     |

The workload assumptions remain explicit: 100,000 concurrency includes drivers,
admins and guardians; the proposed peak mix is 10,000/2,000/88,000. Existing
polling/page-mix/skew/history assumptions are estimates. Their demand calculations
are in [capacity-assumptions.md](../governance/capacity-assumptions.md). The old
pilot ceiling of 100 buses is a policy boundary, not measured capacity either.

## Ordered correction milestones

1. **Security/release acceptance:** resolve SEC-01 technically, review the engine
   patch/password controls, then complete signed-session/role/tenant/school and
   live-channel acceptance. Support contact is optional. Keep immutable baseline
   and protected change controls; this PR performs no persistent correction.
2. **Business and UI acceptance:** close incorrect/missing journeys, duplicates,
   concurrency and scope mismatches with meaningful regression checks; complete
   physical Android and assistive-technology evidence where needed.
3. **Legal/privacy publication and activation:** finalize identity/contacts,
   applicable-law assessment, accurate notices, supplier/retention evidence and
   commercial choices. Complete the actual customer's agreement/authority/PIA
   obligations during onboarding. Do not collect their records to test a draft.
4. **Application reliability:** correct notification deadlines/lease budgets;
   verify monitoring, provider failure behavior, alerts and support arrangements.
5. **Capacity engineering review:** assess asynchronous fan-out, history growth,
   queue fairness, refresh demand and infrastructure limits. Report a proposed
   supported configuration and remaining measurement work, not a capacity result.

Finish one correction milestone before implementing the next. This review
records findings and changes the acceptance rules; it does not implement these
future application/server corrections or grant commercial launch permission.

## Local validation

All required local checks passed on this PR:

| Check                                                        | Result                                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| pnpm typecheck / pnpm lint / pnpm build                      | Passed; production builds used placeholder Supabase values                                            |
| pnpm test                                                    | 724 passed: 382 web, 2 mobile and 340 release/contract PostgreSQL checks                              |
| pnpm security:audit                                          | No known production dependency vulnerabilities at the configured moderate threshold                   |
| pnpm migrations:verify                                       | 125 immutable files passed; no SQL changes                                                            |
| Web commercial journeys/resilience/accessibility             | 16 passed across desktop and phone viewports                                                          |
| Mobile commercial/assigned-bus/refresh/verification journeys | 21 passed using local fixtures                                                                        |
| Onboarding/invitation/student-workspace/route-setup journeys | 56 passed across desktop and phone viewports                                                          |
| Production-build route loading                               | 10 passed, including entry download budget, denied deep links, slow/missing chunks and explicit retry |

Total selected browser checks: **103 passed**. The initial 16-test browser attempt
could not launch because the matching Chromium executable was absent; installation
resolved that test-environment failure before the successful rerun. Native OS, real
provider operations, full assistive-technology conformance and hosted capacity
remain unverified. No local simulation is presented as application capacity.

These results are evidence for the assessed source. They do not activate the
unapproved privacy/operations/customer records, fill business placeholders or
resolve the failed/unverified findings above.
