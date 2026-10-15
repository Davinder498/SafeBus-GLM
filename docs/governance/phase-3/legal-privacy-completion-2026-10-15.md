# Legal/privacy implementation and remaining publication evidence

**Date:** 2026-10-15, America/Edmonton

**Status:** Notice access implemented; overall privacy readiness remains unapproved

**Accountable Privacy Lead:** Business owner, expressly selected in this session

## Owner decisions and completion boundary

The owner selected legal/privacy before the security correction milestone and
required notices accessible to tenants, guardians and drivers. They reconfirmed
that legal business name and privacy-contact details remain **unresolved** and
selected themselves as Privacy Lead. This is a role appointment, not evidence of
a monitored channel, backup, training, accepted supplier terms or launch approval.
Address and signing-entity details are not inferred from the brand or GitHub name.

The new `/privacy` sections explain each role's information, purpose, visibility,
choices and request route. Account menus expose the notice on all dashboard
surfaces; web sidebars/drawers, sign-in and invitation pages also expose it.
Native account links stay inside the app. Public reading requires no account
and no roster/location query. Viewing the notice is not recorded as consent to
every processing activity or acceptance of a customer contract.

This implementation is ready for source review. It cannot make unresolved
identity/contact, supplier or actual disposal obligations pass by changing words.
No privacy approval is populated in `privacy-readiness.json`.

## Sourced applicability assessment

These are concrete working conclusions for the confirmed Alberta private
business / proposed Alberta public-school customer model. Final account-specific
facts remain explicit. Sources were checked on 2026-10-15. This assessment is
prepared evidence for accountable review, not a signature or compliance certificate.

| Framework / actual activity                                                               | Assessment and duties                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Implementation / evidence still needed                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alberta private sector: SafeBus business account, billing, support and inquiry processing | Apply PIPA to covered personal information for the business's activities; assess business-contact exclusions by actual purpose, rather than exempting all email/account records. Accountable practices, reasonable safeguards, access/correction, necessary retention, breach handling and foreign-provider notices are relevant. [Alberta responsibilities](https://www.alberta.ca/organization-responsibilities-for-protecting-personal-information), [access/correction](https://www.alberta.ca/accessing-your-personal-information), [OIPC implementation](https://oipc.ab.ca/resource/pipa-implementation/). | Owner is Privacy Lead. Business identity, reachable privacy email, approved procedures and actual supplier/retention evidence remain open. Business requests must not require a school response or app sign-in.                                                                                            |
| Alberta public sector: customer-directed school transportation                            | For the proposed public-school relationship, POPA governs public-body privacy and correction; ATIA governs access. A contracted supplier handling records on the public body's behalf falls within POPA's statutory employee treatment for those activities; the school retains accountability. [Alberta POPA overview](https://www.alberta.ca/about-the-protection-of-privacy-act), [OIPC supplier guidance](https://oipc.ab.ca/resource/popa-guidance-service-providers/).                                                                                                                                      | Customer onboarding identifies the public body, exact lawful purposes/authority, authorized instructions, notices, agreement and delegation. SafeBus ownership supplies none of these customer decisions. Draft DPA/PIA already allocate assistance, incidents, rights and disposal; execution is pending. |
| Federal privacy: own-business commercial transfers                                        | Alberta's substantially similar law generally governs covered activity within Alberta; commercial personal-information flows across provincial/national borders require PIPEDA analysis. Do not label every school record a private commercial record or infer federal exemption from Alberta registration. [OPC requirements and jurisdiction](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda_brief/).                                                                                                           | Apply the federal principles to the relevant business flow where applicable; complete actual countries, supplier roles and business-contact exceptions. No blanket “not applicable” decision is recorded.                                                                                                  |
| Education and commercial obligations                                                      | Customer transport/record authority depends on the actual school, activity and record. Business terms and tax treatment depend on contracting, registration and supply facts. [Alberta education legislation](https://www.alberta.ca/k-12-education-legislation-and-regulations), [CRA charging guidance](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html).                                                                                                                                                                              | During customer onboarding, identify applicable transport/student-record rules and authority for the minimum fields. Before paid activation, resolve actual price, renewal, tax, support, liability and invoice/cancellation behavior; no amounts or guarantees are invented.                              |

POPA requires PIA preparation/submission in prescribed circumstances. The
customer's accountable head/delegate supplies its applicable decisions and
signatures; a general platform assessment helps but does not replace them.
[OIPC PIA completion guide](https://oipc.ab.ca/resource/popa-pia-template-completion-guide/).
Retaining counsel is optional unless a specific issue or agreed obligation
requires it. There is no new support-ticket or recovery-drill prerequisite.

## Notice and rights corrections

- Added readable tenant-administrator, guardian and driver sections in
  `RolePrivacyNotices.tsx`, linked from the public policy's contents.
- Explained that bus location can identify the driver, background collection
  occurs during the authorized workflow, and earlier queued records can be sent
  later. No immediate offline revocation or remote wipe is promised.
- Explained minimum guardian scope, no guardian GPS requirement, optional event
  emails, customer-directed processing and separate business/billing purposes.
- Removed unsupported public 30-/90-day automatic-deletion promises. This
  corrects the claim; it does not resolve the retention failure below. The final
  notice still needs applicable approved periods and a working direct contact.
- Deletion instructions separate account/session/device handling from record
  erasure and make the independent SafeBus-business request route explicit.
- Added the OIPC complaint route. Do not interpret an app link, device permission
  or notice view as a blanket statutory consent or school processing authority.

The published contact fallback still refers to the official app listing. Neither
that fallback nor placeholder documents prove a working channel. Resolve the
business email and verify it before publication/activation; do not collect
sensitive identity/student evidence through the prospective-tenant inquiry form.

## New bounded hosted retention evidence

Configuration/counter observations used two read-only transactions with 15-second statement and three-second lock
timeouts and final `ROLLBACK`. Only configuration and aggregate run outcomes
were selected. No customer records, raw errors, approval references or credentials
were queried; no retention RPC or destructive job was invoked. Additional
read-only function metadata inspection supplied the observed routine fixture.
The summary is [retention-observation-2026-10-15.json](retention-observation-2026-10-15.json).

- Twelve configured policies exist, including 30-day raw location and 90-day
  terminal email metadata. A configured policy is not executed disposal.
- Destructive execution is **disabled**; its approval reference/date are absent.
- Of 1,956 recorded per-policy attempts, 652 dry runs completed and 1,304 failed;
  **zero recorded enforcement runs completed**.
- Eight policies each have 163 dry-run failures with SQLSTATE `42702`
  (ambiguous column): invitations, student records, guardian relationships,
  driver records, bus tracking sessions, dispatches, trips and notifications.
  The observed private function has a `status` output variable and unqualified
  `status` predicates in those branches; dispatch expiry also collides with its
  `completed_at` output variable. Owned local PostgreSQL tests reproduced all
  eight failures and verified the narrowly qualified correction. No destructive
  production probe was used.

Prepared correction:
`supabase/migrations/pending/20261015212746_fix_retention_column_qualification.sql`
qualifies the sixteen status predicates and two dispatch timestamp expressions.
It requires the reviewed function's normalized definition hash and disabled
destructive control, failing on unexpected changes. It preserves existing
owner/ACL/search path and authentication checks and changes no period or flag.
It is **not active or installed**; the 125-file active manifest is unchanged.

Seven owned PostgreSQL checks reproduce the failures, verify corrected dry-run
counts/no data deletion, expiry/non-expiry and active-row preservation, driver
anonymization in synthetic fixtures, unchanged metadata, authorization hooks,
disabled-execution guard and rejection of a different function baseline.
They do not establish production FK/trigger, full hold, device or supplier safety.
A protected forward transition remains separate from this PR; keep deletion
disabled until purpose/periods, holds and execution evidence pass.
The daily function's Netlify environment
flag was not read; the disabled database control independently blocks this
function's destructive path. No proof about every independent supplier/cleanup
mechanism is inferred from these counters.

## Supplier review and final closure order

Public primary vendor sources are now collected in the
[supplier disclosure](business-pack/supplier-disclosure.md). They establish
important possible foreign processing, not accepted SafeBus account terms or
an exhaustive actual country list. No vendor agreement was signed or support
request sent. The PIA and participant templates link to the role notices and
retain customer-specific authority/contact fields.

Finish these legal/privacy subitems in order:

1. **Identity/contact:** retain owner-as-Privacy-Lead decision; supply legal entity,
   address, monitored direct privacy email and absence coverage. Then reconcile
   the public page, contracts and request instructions with those facts.
2. **Suppliers and actual flows:** record applicable account terms, enabled scope,
   function/CDN/log/support countries, retention and relevant customer instructions.
   Publish the actual country/purpose disclosure. Unknown facts remain pending.
3. **Retention and requests:** review the prepared, locally tested forward correction
   through the protected production workflow, accept defensible periods/holds, test disposal and
   access/correction/deletion safely, and record operational ownership/evidence.
4. **Commercial decisions:** finalize the existing order form/MSA/DPA/SLA choices
   against real billing/cancellation/tax configuration. No unsupported availability,
   capacity, liability or support promise is added by this notice work.
5. **Final publication/activation:** approve source-bound platform notices/program;
   customer authority/agreement/PIA decisions are completed at customer onboarding.

Historical commercial-review findings remain unchanged as historical evidence.
This record supplies the current notice correction and stronger retention
observation; LAW-01 through LAW-05 are not silently marked passed.

## Validation of this implementation

- `pnpm typecheck`, `pnpm lint`, `pnpm build`: passed. Web/native builds used
  placeholder Supabase values; successful final reruns reused valid Turbo cache.
- `pnpm test`: **732 passed** (382 web, two mobile, 348 Node release/contract
  checks). This includes the seven owned PostgreSQL checks above and notice
  approval/source-binding regression coverage.
- Website notice journeys: **six passed**, covering desktop and phone-sized
  sign-in, invitation, role sections, tenant account menu/sidebar/drawer, public
  reading without operational queries, deletion instructions and accessibility.
- Native-entry browser journeys: **14 passed**, including the three new notice
  journeys and 11 existing commercial/role/session/accessibility cases. In-app
  policy links stay in the same page; direct driver fragments work signed out.
- `pnpm migrations:verify`: **125 immutable active files passed**. The prepared
  correction remains in `pending`; it is neither installed nor active.

An initial concurrent full-test attempt hit a worker termination timeout. The
subsequent complete run exposed two outdated document/anchor checks; these were
updated for optional counsel and actual in-app links, then the final full run
passed. Browser test preparation also corrected an early navigation assertion
to wait for the tenant page before opening its drawer. These are local source
and synthetic-fixture results, not real customer, physical-device, full retention
or commercial-compliance approval.
