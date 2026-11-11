# SafeBus Business Privacy and Commercial Draft Pack

**Status:** Owner review draft; not effective, executed or approved for publication
**Prepared:** 2026-10-13 (America/Edmonton)
**Business context:** Sachman Gold Inc., doing business as SafeBus; owner-confirmed Alberta business. Direct contact: info@safebus.kids; address, registration evidence and signing authority remain pending

## How to use this pack

These are substantive starting drafts for the SafeBus business. Drafting can
proceed before appointing counsel or selecting a customer. The owner approves
business choices; a later customer supplies its own authority, scope and
contract signatures. Neither activity gives a customer ownership of SafeBus.

The [2026-11-05 reconciliation](../../../operations/privacy-commercial-operations-2026-11-05.md)
records current notification scope, verified monitoring evidence and unresolved
commercial/operational inputs. It does not execute these drafts or approve launch.

Read the [owner decision register](owner-decisions.md) first, then the privacy
policy and agreements below. Text inside square brackets is an unresolved input.
Any terms expressly described as proposed are for owner negotiation, not accepted
prices, service levels or legal conclusions. Do not sign or publish a document
while its necessary inputs or evidence are missing.

| Document                                                           | Use                                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| [Business privacy policy](privacy-policy.md)                       | Public notice draft covering service users, business contacts, billing and support |
| [Master Services Agreement](master-services-agreement.md)          | Business-to-business service, payment, ownership and liability terms               |
| [Order form](order-form.md)                                        | Customer-specific scope, dates, annual per-bus CAD price and signatures            |
| [Data Processing Agreement](data-processing-agreement.md)          | Instructions, permitted data, roles, suppliers and privacy cooperation             |
| [Security Schedule](security-schedule.md)                          | Proposed safeguards and the evidence required before operation                     |
| [Service-Level Agreement](service-level-agreement.md)              | Owner-approved initial-pilot staffed hours, nine holiday exclusions and no unsupported uptime/response/credit guarantees; customer execution pending |
| [Acceptable-Use Terms](acceptable-use-terms.md)                    | Rules for administrators, drivers and guardians                                    |
| [Data Return and Destruction Schedule](data-return-destruction.md) | Exit, export, deletion, backups and legal holds                                    |
| [Supplier disclosure draft](supplier-disclosure.md)                | Supplier purposes, information involved and location decisions still pending       |

The supporting business privacy procedures are the
[privacy-management program](../privacy-management-program.md),
[access and correction procedure](../access-and-correction.md),
[breach response](../breach-response.md), [retention schedule](../retention-schedule.md)
and [legal-hold procedure](../legal-hold-procedure.md).
Participant notices are in [notices](../notices/guardian-privacy-notice.md).
The [PIA draft](../privacy-impact-assessment.md) describes the proposed CR1 service,
real information flows, open risks and customer-specific additions.

## Law, internal launch policy and customer contracts

The reviewed PIPA/POPA guidance does not establish a general obligation to hire
an Alberta privacy lawyer. PIPA accountability requires a responsible person and
privacy practices; the owner can take the business privacy-lead role. This is an
assessment of the reviewed framework, not a guarantee about a particular future
procurement or contract. [OIPC PIPA implementation guidance](https://oipc.ab.ca/resource/pipa-implementation/).

DL-023 replaces the former unconditional `privacyCounsel` signature with sourced
applicability/compliance evidence. Legal/privacy review remains necessary;
appointing counsel is optional unless an applicable requirement or customer term
requires it. Supplier-support contact and recovery drills are not launch gates.
Customer processing authority and signatures remain customer-onboarding inputs.

A private organization's PIA is not mandatory under PIPA, according to the OIPC.
Public-body POPA preparation/submission requirements depend on the circumstances.
A school customer's required PIA or contract cannot be approved on its behalf by
SafeBus. [OIPC PIA guidance](https://oipc.ab.ca/privacy-impact-assessments/).

## Source of truth and evidence

The locked [CR1 scope](../../commercial-release-scope.md) governs features and
pilot limits. [Security remediation](../../../qa/commercial-security-remediation.md)
records unresolved hosted findings. The
[Stripe runbook](../../../operations/stripe-subscription-release.md) defines the
existing annual, per-bus CAD billing model; it does not settle price or tax status.

The draft pack does not change code, provider configuration, retention flags,
database migrations or existing public pages. Before publication, reconcile the
app privacy/account-deletion pages, Android disclosure and Play forms against
the approved wording and verified practices. Existing page text is not approval
of this pack or proof of legal/technical readiness.

Keep executed agreements, legal advice, customer identities, incident/request
records and confidential provider evidence in restricted storage. Git contains
drafts and non-secret evidence references only. `privacy-readiness.json` remains
`not_approved`; it is activated only after the actual Point 6 evidence passes.

## November 8 verified supplier and guardian notice reconciliation

Use the [school-authority supplier-processing review](district-supplier-processing-appendix-review-2026-11-08.md) to prepare the eventual DPA supplier appendix: it distinguishes core transport vendors from SafeBus business-only services and records verified primary data flows, US-hosted Resend emails, and the server-side Firebase v7 redaction deployment. Following owner-approved PR #414 and the [protected Netlify published-source attestation](https://github.com/Davinder498/SafeBus-GLM/actions/runs/42543503884), guardian pickup/drop-off external email subject/body are now generic; the authorized in-app inbox retains event details. The companion guardian notice and supplier appendix are being reconciled in PR #416. Other email types, previous delivered messages, real provider delivery acceptance, supplier-country decisions and customer authorization remain separate. **This wording correction does not publish or approve a district agreement.** The eight-document school-authority contract catalog remains unpublished.

## November 8 supplier, insurance and contract reconciliation

The [sourced supplier DPA and online insurance review](supplier-dpa-insurance-contract-review-2026-11-08.md) distinguishes **publicly incorporated processing terms** from **verified SafeBus account acceptance**, gives online insurance quotation paths without inventing premiums, and records remaining district MSA/DPA publication dependencies. The owner confirmed existing Stripe prices are **temporary and unchanged**; they are not approved contract prices. The independently approved and published driver/guardian Terms of Use version 2026.1 does **not** approve this district draft pack.

## 2026-11-06 launch approval review

Use the consolidated [privacy, supplier and commercial gap analysis](../../privacy-supplier-launch-review-2026-11-06.md) and [pending supplier evidence ledger](../supplier-approval-ledger-2026-11-06.json) before completing owner decisions or circulating customer documents for signature. The pack remains draft, the supplier agreements have **not** been accepted as proven for the actual business accounts, and the customer-specific PIA/contracting authority has not been verified. Confirm each negotiated field and signed version in restricted storage; do not put customer names, signatories, contract scans, private URLs, or credentials in Git.

## Pilot sign-off and supplier evidence (2026-11-07)

Use the [pilot contract, supplier and insurance sign-off pack](pilot-contract-signoff-2026-11-07.md) to collect business-owner decisions and district-specific acceptance **before** any customer signature or launch approval. It lists insurance/liability questions and account-specific vendor evidence requests without assuming policy coverage, vendor signatures, tax status, approved SLA targets, or a customer PIA. Store private evidence outside Git; this checklist does not change any `not_approved` release state.


## Owner business choices — November 8, 2026

The latest [owner decision register](owner-decisions.md) supersedes historical GST/HST-unregistered notes: the owner reports GST/HST registration effective 2026-11-08, SafeBus registered as Sachman Gold Inc.'s trade name and info@safebus.kids selected for formal notices. The provided business mailing address is **confidential and not to be published or committed to Git**. Final monthly/annual prices are still undecided; the future approved customer-facing totals must include applicable GST/HST. Insurance will be purchased later. Support remains Monday–Friday, 08:00–17:00 Alberta time, with backup/holiday coverage unresolved. No customer agreement publication, live tax mutation or launch approval follows from these choices.


## November 9 finalized standard subscription prices

The owner approved **CA$1.99 per active bus monthly** and **CA$20.29 per active bus annually**, **including applicable GST/HST**. These rates supersede earlier temporary-price wording; the two live existing Stripe prices were converted in place to `tax_behavior=inclusive` and independently retrieved after updating. The signed school-authority Order Form must still select the interval, quantity, collection method, trial, effective dates and any documented exemptions. The entire eight-document district contract package is still DRAFT and unpublished; rate approval alone did not approve insurance, liability caps, supplier disclosures, remaining terms or a pilot. The later November 9 owner-approved *proposed* liability limits are recorded below; no customer contract or launch is approved. See [owner decisions](owner-decisions.md).


## November 9 — approved pilot support calendar and SLA boundary

For the initial pilot, ordinary SafeBus staffed support runs **Monday–Friday,
8:00 a.m.–5:00 p.m. America/Edmonton**, excluding Alberta's **nine general
holidays** (official list: https://www.alberta.ca/alberta-general-holidays).
No 24/7 staffed or guaranteed after-hours response, numerical uptime/latency/GPS
or notification promise, fixed repair time, or automatic monthly/annual SLA
credit is offered. This owner-approved business choice is reflected in the
[MSA](master-services-agreement.md), [Order Form](order-form.md),
[SLA](service-level-agreement.md), [owner register](owner-decisions.md) and
[sign-off pack](pilot-contract-signoff-2026-11-07.md).

The November 8 holiday-coverage and price statements elsewhere in this index
are historical and superseded by the November 9 decisions. The eight-document
contract pack remains a **draft and unpublished**. Privacy/security incident
notice and cooperation requirements still apply independently of staffed
support holidays/hours; a credible escalation route and actual staffed-window
coverage must be evidenced before customer activation.


## November 9 — proposed Provider liability caps and deferred insurance

The owner approved the initial-pilot negotiating position: **general Provider
aggregate liability = greater of CA$25,000 or 12-Month Fees** and
**privacy/security Provider aggregate liability = greater of CA$100,000 or
twice 12-Month Fees**. The privacy/security limit is in place of, not on top
of, the general limit. Fees are the contracted, net-of-discount, tax-exclusive
subscription fees attributable to the 12 months preceding the first claim-causing
event, with annual prepayments allocated to service months. The owner preserved
liabilities which applicable law prohibits limiting, fraud and wilful wrongdoing,
and separate DPA/privacy duties and legal/express breach remedies.

Insurance quotations and purchase are **deferred**; do not represent active
coverage. The later November 9 owner decision approves **limited fault-based
SafeBus third-party indemnification** for Provider-caused privacy/security
breach claims within the privacy cap, and alleged infringement by unmodified
SafeBus software under authorized use within the general cap. Covered defence
costs count inside the applicable non-stacking aggregate limit; no independent
district negligence or unlawful instructions are indemnified. No blanket or
unlimited indemnity or reciprocal Customer indemnity was approved. See
[MSA §8](master-services-agreement.md), the
[Order Form](order-form.md), [owner decisions](owner-decisions.md), and
[pilot sign-off worksheet](pilot-contract-signoff-2026-11-07.md).
These drafts remain **unpublished and unexecuted** pending customer-specific
procurement/legal review, risk and supplier evidence, and release authorization.


## November 9 — approved limited fault-based indemnification proposal

The Provider proposes defending/indemnifying only covered third-party
**privacy/security claims caused by SafeBus's own contractual breach** and
**software intellectual-property claims involving its unmodified software
as provided and used as authorized**. The respective privacy/security and
general aggregate liability caps apply; reasonable legal defence costs,
covered settlements and damages are **inside those caps**, not added on top.
The Customer's separate negligence, unlawful instructions, unauthorized
changes/combination and independently wrongful acts are excluded to the extent
of their contribution. Fraud, wilful wrongdoing, non-excludable liability and
the DPA duties remain preserved.

Customer-specific procurement exceptions and bodily injury/property damage
indemnity requests require review, and **no insurance coverage is claimed**.
The contract package remains **unpublished and unexecuted**; neither an
unsigned Order Form nor this owner decision binds a school authority.


## November 9 — owner-approved district-controlled data model

Instead of a blanket 30-day data-return and 60-day primary deletion promise,
the owner approved **district-controlled data management**. The tenant
administrator may use existing student/guardian/driver/bus directory CSVs
and supported per-record delete/archive/preservation actions, subject to
security and mandatory retention. If a district requests additional records
or account closure, SafeBus verifies the authority and tenant, scopes and
securely transfers eligible information, and handles deletion only through
approved workflows. A CSV is not a complete district-wide export and the app
has not established an instant delete-all or full backup-erasure capability.

The [Data Management, Return and Destruction Schedule](data-return-destruction.md),
[MSA](master-services-agreement.md), [DPA](data-processing-agreement.md) and
[Order Form](order-form.md) carry the same policy. Any binding customer-specific
turnaround must be technically verified and agreed in writing. Automatic
destructive retention remains disabled; contracts remain unpublished until
customer and operational requirements are approved.

## Agreement completion review — November 11, 2026

The owner has prioritized completing agreements before iOS. The [provision-by-provision review and proposed decision package](agreement-completion-review-2026-11-11.md) records remaining wording and evidence gaps. Prior business approvals remain unchanged. The proposed supplier approval model, incident/request commitments and assisted-exit policy are **not yet approved**; the instruction to proceed authorized review and drafting, not those commercial decisions. No agreement publication or customer acceptance is established.
