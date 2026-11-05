# Privacy, commercial and operations reconciliation

**Date:** 2026-11-05, America/Regina (UTC−06:00)
**Source reviewed:** main 7544b63a18ea1471c7da25431b8c1c2783eef7fe
**Status:** Source corrections and operating procedure prepared; launch unapproved

## Before and after this change

| Area                       | Before                                                                                                             | After source implementation                                                                            | Still required                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Public privacy contact     | Users were referred to the authority or a Play developer contact; no direct address on the privacy page            | Direct info@safebus.kids link, minimal request details and credential/sensitive-data warning           | Production publication and confirmation that staff handle requests                                           |
| Lost-account deletion      | Fallback depended on finding the Play listing                                                                      | Direct SafeBus email route without sign-in; authority verification and lawful retention remain         | Exercised verified request, authorized execution and scoped confirmation                                     |
| Support intake             | Public form required a work email, authority and role; direct email existed without distinguishing privacy/support | Contact page explains direct support/privacy route and urgent transportation fallback                  | Staffed hours, responsible primary, backup and urgent escalation route                                       |
| Commercial/supplier drafts | Contact placeholders and claims that Android FCM was unavailable conflicted with current app/owner direction       | Known privacy/support email populated; notification scope and existing monitoring suppliers reconciled | Actual supplier terms/countries/windows and customer agreements                                              |
| Operations evidence        | Monitoring and inbox evidence scattered across a prior implementation note and owner confirmation                  | Dated evidence below and one actionable response runbook                                               | Sustained cadence, response exercises, app telemetry/redaction, quota alerts and approved operating coverage |

These pages are public and require no operational data fetch. All current roles
(school authority admin, transportation admin, guardian, driver, platform admin)
and signed-out users retain access to the contact/privacy/deletion routes. The
retired school-admin role obtains no operational permission from a public notice.
No data access, MFA, recipient preference, billing or deletion authorization changes.

## Scope reconciliation and supplier treatment

The historical CR1 freeze predates shipped notification work. The owner-approved
standard notification setup (2026-10-24) and recipient-controlled delivery
direction (2026-10-26) supersede old per-authority switches and blanket claims
that Android FCM is unavailable. See [recorded approval](notification-privacy-approval-2026-10-24.md),
[recipient delivery](complete-recipient-push-2026-10-26.md), current `AGENTS.md`
and the existing public privacy page. Availability does not turn on anyone's
personal choices or device permission, complete supplier review, prove device
delivery or authorize public launch. The supplier drafts now describe actual
processing rather than excluding a supplier whose feature is present.

Existing operations suppliers are Netlify scheduled checks/logs, GitHub Actions
health checks, Resend fixed alert delivery and the selected business inbox.
Application error monitoring/redaction and map quota alert acceptance remain
open. No additional service, spending or supplier agreement is provisioned here.

The public sources reviewed on 2026-11-05 support assessing actual service flows,
not assuming Canadian-only processing from the database region:

- [Supabase residency FAQ](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq): chosen-region core services coexist with out-of-region operational/support processing.
- [Netlify Trust Center](https://www.netlify.com/trust-center/): review DPA and downstream infrastructure/logging services against the account configuration.
- [Firebase privacy/security](https://firebase.google.com/support/privacy): assess the applicable data-processing terms for the enabled FCM service.
- [Resend DPA](https://resend.com/legal/dpa): retain the agreement applicable to the actual account and its downstream handling.
- [Alberta responsibilities](https://www.alberta.ca/organization-responsibilities-for-protecting-personal-information): safeguards, request handling and foreign-provider policies/notices depend on actual processing.
- [OIPC provider guidance](https://oipc.ab.ca/resource/popa-guidance-service-providers/): the public body retains accountability for contracted handling.

Vendor documents do not prove SafeBus account acceptance, a supplier's full list
of processing countries, or customer approval. Restricted evidence must identify
actual legal vendor, role/data, accepted terms/version, countries/support access,
retention/deletion and backup/log windows, security/incident duties and change
notice. Never place executed agreements or private customer details in Git.

## Evidence already available, with limits

| Evidence                                                                                                                                          | What it establishes                                                                                | What it does not establish                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Owner selected info@safebus.kids and confirmed alert receipt on 2026-11-05                                                                        | One delivered operations email reached the selected inbox                                          | Staffed support coverage, backup, legal notice election or a passed response drill        |
| Netlify automatic invocations at 10:11:05, 10:26:07 and 10:41:07 UTC on 2026-11-05, observed in the launch review                                 | Automatic fallback ran; public health passed; stale GitHub cadence failed; provider accepted alert | Seven-day reliability or current GitHub cadence; provider acceptance alone is not receipt |
| GitHub latest returned scheduled health run 41962746406 at 03:37:20 UTC; manual run 42024092985 at 12:04:40 UTC succeeded                         | Manual health observation passed; the scheduled observation remained stale in that review          | Resolution of the GitHub scheduling gap                                                   |
| BusSafe read-only launch review: primary region ca-central-1, PostgreSQL 17.11; destructive retention control false and latest dry runs completed | Observed database location/version and safe non-destructive retention execution                    | All-provider Canadian residency, approved retention periods or verified real disposal     |
| Android protected release 42042065538 on 7544b63, version 7 / 1.0.6; internal testing available                                                   | Signed current candidate and internal distribution                                                 | Physical Android acceptance, public Play publication or an iOS app                        |

These are dated prior observations, not fresh provider checks performed by this
documentation change. The launch review was retained as
`SafeBus_Launch_Recheck_2026-11-05_After_Android_v7.html`; monitoring implementation
and limits are in [monitoring reliability](monitoring-reliability-2026-11-05.md).
Do not replace missing acceptance with these narrower observations.

## Completion ledger

| Work                      | Deliverable prepared here                                                             | Remaining concrete input/action                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity/contact          | Operator remains Sachman Gold Inc.; privacy/support use selected inbox                | Business mailing address, registration/signatory evidence and formal contract notice election                                                           |
| Commercial terms          | Existing MSA, order, DPA, security, SLA, AUP and return/destruction drafts reconciled | Price/billable-bus definition, tax treatment, renewal/proration/refunds, liability/insurance and negotiated customer acceptance                         |
| Service commitments       | Support procedure and alert-response steps                                            | Choose staffed hours/timezone/holidays, primary/backup, escalation, measured targets and any credits before promising them                              |
| Privacy requests          | Direct no-account route and updated access/correction procedure                       | Exercise identity/authority verification, correct legal deadlines, secure search and scoped closure                                                     |
| Incidents                 | Updated breach procedure and operational triage/closure runbook                       | Assign capable responders and run the outage/privacy tabletop; record results                                                                           |
| Supplier/privacy evidence | Active features and providers reconciled; official sources linked                     | Accepted terms, precise country/purpose disclosure, retention/log/support windows and customer instruction evidence                                     |
| Retention/holds           | Preserve existing dry-run safety and scoped hold procedure                            | Approve purposes/periods and supplier backup handling; demonstrate bounded enforcement through reviewed workflow before enabling any destructive action |
| Operating visibility      | Alert routing and limits recorded                                                     | Sustained scheduled observations, application error/redaction evidence, map key/quota controls and 70/90-percent alert evidence                         |

The [owner worksheet](../governance/phase-3/business-pack/owner-decisions.md)
contains detailed commercial inputs. The [support runbook](support-incident-runbook.md)
contains the executable response checklist and evidence fields. Actual staffing,
executed terms and completed exercises cannot be created by filling approval
fields. Privacy, operations, map and pilot readiness remain unapproved; protected
release review remains intact. DL-023 exclusions are preserved.

## Validation and rollout

Review the source and draft changes in a feature PR. After human merge, verify
the production privacy/contact/deletion pages and the signed-out email route.
Native builds receive the same pages on their next reviewed release; this PR
does not upload a new Android binary. No production database change is needed.
Revert through a reviewed PR if the public copy needs correction.

Local checks and limitations are recorded in the PR. A passing build does not
establish request handling, supplier approval, inbox coverage or launch readiness.

## Owner clarification — support and address, 2026-11-05

The owner selected Monday–Friday, 8:00 a.m.–5:00 p.m. Alberta local time
(`America/Edmonton`, current Alberta rules). This resolves the intended hours,
not holiday coverage, primary/backup assignment, urgent escalation or a numerical
response guarantee. Earlier open-hours entries above are superseded by this choice.

A missing postal address is not by itself established here as a universal
requirement to block the website privacy notice. The direct email request route
remains available. A legal business address is required for Google Play
organization verification and may be required by the actual customer contract
or other applicable duties. Keep account verification, customer notice details
and public website disclosure separate. Do not invent an address or publish a
home address by default. [Google Play organization requirements](https://support.google.com/googleplay/android-developer/answer/13628312)
and [Alberta request guidance](https://www.alberta.ca/accessing-your-personal-information)
were checked on 2026-11-05. The customer/order-specific postal contact remains
unresolved where required.

## Owner-managed support and managed onboarding — 2026-11-05

The owner will handle support and backup escalation personally during the selected
hours. Record one owner-managed arrangement, not an independent backup team;
owner absence remains a coverage limitation. Holiday and urgent escalation
mechanics and exercised response evidence remain open.

The SafeBus team handles initial routes/maps/stops, buses, student records,
guardians/links, drivers and assignments. Public contact/privacy copy and the
MSA, DPA, security schedule and order form reflect that service. Use the
[managed-onboarding checklist](managed-onboarding.md). Authority instructions,
scoped named access, administrator MFA, minimum secure source-data transfer,
validation and authority review remain necessary. No role or database permission
changes, actual account provisioning, data transfer or completed onboarding are
claimed by this source change. Existing platform-admin restrictions remain.
Ongoing maintenance scope/fees are agreed in the order. The supplied business
postal address is kept out of website copy and public repository content.
