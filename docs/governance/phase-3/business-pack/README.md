# SafeBus Business Privacy and Commercial Draft Pack

**Status:** Owner review draft; not effective, executed or approved for publication
**Prepared:** 2026-10-13 (America/Edmonton)
**Business context:** Alberta-registered Canadian business; exact legal identity and contacts remain placeholders at the owner's request

## How to use this pack

These are substantive starting drafts for the SafeBus business. Drafting can
proceed before appointing counsel or selecting a customer. The owner approves
business choices; a later customer supplies its own authority, scope and
contract signatures. Neither activity gives a customer ownership of SafeBus.

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
| [Service-Level Agreement](service-level-agreement.md)              | Measurable service/support terms with unapproved targets left open                 |
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

The existing repository release policy separately requires `privacyCounsel`
approval. That internal safeguard remains in force; these drafts neither remove
it nor represent it as a statutory lawyer-appointment rule. Any future proposal
to change that gate needs explicit owner direction and a reviewed governance
change. Draft preparation is not blocked by the appointment.

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
