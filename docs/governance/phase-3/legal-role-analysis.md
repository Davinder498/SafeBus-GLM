# SafeBus — Legal Roles and Alberta Statutory Mapping

**Status:** Sourced assessment for accountable business/customer review; not approved
**Owner:** Business owner / Privacy Lead; specialist advice when needed
**Readiness point:** 6 — Privacy and commercial terms, item 1
**Last checked:** 2026-10-13 (America/Edmonton)

## 1. Purpose and known facts

This is the first item in the sequential Point 6 work. It supplies the role
assumptions and questions that the PIA and customer agreements must resolve.
It does not establish that SafeBus or its hosted services already comply with
the proposed obligations.

The owner confirmed on 2026-10-13 that the contracting business is registered
in Alberta, Canada, and privacy counsel has not yet been appointed. Its exact
legal identity and business form were subsequently clarified by the owner on
2026-10-15 as Sachman Gold Inc., doing business as SafeBus. Registration documents
and signing authority remain unverified. Record that evidence in the restricted
contract file, with only a non-secret evidence reference in Git.

The approved first customer type is an Alberta public school authority. CR1
permits a controlled pilot of one to three tenants and 25–100 buses; no customer
agreement, representative's authority or launch permission is established by
that product decision. See [first-customer profile](../first-customer-profile.md)
and [CR1 scope](../commercial-release-scope.md).

The [review worksheet](legal-role-review.md) identifies the missing evidence and
closure criteria. Specialist advice is optional; customer review occurs at onboarding.
The owner subsequently requested the [business drafts](business-pack/README.md)
and PIA before those reviews. Preparing them does not require a customer or
counsel appointment. The reviewed PIPA/POPA guidance does not establish a general
statutory duty to hire Alberta privacy counsel; the repository's separate
`privacyCounsel` release approval was an internal requirement, replaced by a
sourced applicability/compliance assessment under DL-023 on 2026-10-15.

## 2. Statutory map for review

| Framework                                                | Relevant part of the proposed relationship                                                                           | Decision still required                                                                                                    |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Protection of Privacy Act (POPA) and its regulations     | Personal information handled for the public school authority; collection, use, disclosure, correction and safeguards | Confirm the customer's public-body status, relevant provisions and responsibilities for each processing activity           |
| Access to Information Act (ATIA)                         | Access to records in the public body's custody or control, including records held by a supplier                      | Specify how SafeBus assists the authority with retrieval and preserves records pending a request                           |
| Alberta Personal Information Protection Act (PIPA)       | SafeBus's own private-sector activities, where applicable                                                            | Classify business-account, billing, support and staff information separately from customer-directed transportation records |
| Federal PIPEDA                                           | Potential federal or cross-border commercial processing                                                              | Determine application to actual activities and transfers; Alberta registration alone does not settle it                    |
| Education Act and applicable student-record requirements | Customer authority for minimum transportation information and disclosure                                             | Identify applicable provisions and records; do not assume every transport record is legally a student record               |

POPA and its regulations took effect on June 11, 2025, replacing the privacy
portion of the former FOIP framework. POPA governs correction; ATIA governs
public-sector access. [Alberta POPA overview](https://www.alberta.ca/about-the-protection-of-privacy-act),
[Alberta correction guidance](https://www.alberta.ca/correction-of-personal-information),
[OIPC access-law overview](https://oipc.ab.ca/resource/access-to-information-laws-in-alberta/).

PIPA is Alberta's private-sector privacy law for provincially regulated
organizations. PIPEDA requires a separate assessment of federal jurisdiction
and interprovincial or international commercial flows. Neither statute should
be presented as replacing the school authority's public-sector obligations.
[Alberta PIPA overview](https://www.alberta.ca/personal-information-protection-act),
[OPC summary of Canadian privacy laws](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/02_05_d_15/).

The accountable review must verify the actual statutes, regulations and provisions for the
relationship. The table is a proposed map, not a statutory determination.
For the education-law review, use the current
[Alberta education legislation and regulations index](https://www.alberta.ca/k-12-education-legislation-and-regulations)
to identify the school transportation and student-record rules that apply.

## 3. Proposed role for school-authority transportation records

The working model is that SafeBus supplies transportation operations and bus
visibility on the public school authority's documented instructions. The
customer decides the permitted purposes and authorized participants. SafeBus
implements the agreed service and supports the customer's privacy duties.

OIPC guidance explains that a contracted service provider can fall within POPA's
statutory definition of an employee for activities performed for the public
body. This does not make it an employee for labour-relations purposes. The
public body retains accountability for information handled on its behalf.
[OIPC service-provider guidance](https://oipc.ab.ca/resource/popa-guidance-service-providers/).

Use the statutory role and negotiated responsibilities in the agreement.
"Controller" and "processor" may explain the operating model, but do not replace
Alberta's legal terms or supply a legal authority to collect information.

Proposed wording for counsel to refine:

> SafeBus provides the transportation operations and bus visibility service
> for the school authority on its documented instructions. Customer-directed
> personal information is used only for agreed transportation purposes and
> disclosed only to authorized recipients and approved service providers.
> The authority retains its public-body responsibilities. SafeBus's assistance,
> safeguards, retention, incident, access, correction and return obligations
> will be specified in the executed agreement and its schedules.

This paragraph is a drafting starting point, not an executed DPA or a promise
that any security or operational acceptance gate has passed.

## 4. Separate roles for separate activities

| Activity                                                      | Proposed allocation to test with counsel and the customer                                                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimum roster, guardian links and transportation assignments | Customer directs purpose and authority; SafeBus implements scoped processing                                                                                               |
| Active-trip bus location and operational events               | Customer authorizes the transport purpose; SafeBus limits collection and visibility; evaluate identification of the driver and linked individuals                          |
| Guardian authority and access to a bus                        | Customer determines the verified relationship; SafeBus enforces linked access without custody narratives                                                                   |
| Driver's personal Android phone                               | Determine customer/driver/SafeBus responsibilities for employment-related information and BYOD; driver permission is not a substitute for the required statutory authority |
| Access, correction and complaints about customer records      | Proposed customer-led decisions, with SafeBus assisting under agreed instructions; confirm delegation and response responsibilities                                        |
| SafeBus business-account, billing and support records         | Assess SafeBus's own purpose, necessary fields, applicable PIPA/PIPEDA obligations and vendors separately; exclude transportation records from unrelated commercial uses   |
| Supplier metadata and support access                          | Review IP addresses, map viewport requests, logs, delivery metadata and remote access as actual flows, rather than assuming they are anonymous                             |

Access and correction assistance must be allocated explicitly in the contract;
OIPC guidance recommends that the public body generally retain responsibility
for those decisions. [OIPC service-provider guidance](https://oipc.ab.ca/resource/popa-guidance-service-providers/).

A bus location can still reveal information about a driver or linked people.
"Track the bus, not the child" limits the product purpose; it does not make the
records non-personal or exempt them from privacy review.

## 5. Collection authority and boundaries for the next documents

The later field inventory must identify the proposed legal provision, necessity,
source, authorized recipients and purpose for each class of information.
Existing labels such as "contract performance", "consent" or "legitimate
interest" are draft shorthand; they do not demonstrate authority under POPA.
The customer must assess the collection grounds and applicable notice rules.
[Alberta collection guidance](https://www.alberta.ca/collection-of-personal-information).

Preserve the locked CR1 restrictions: no student identifiers prohibited by
AGENTS.md, student home addresses, health data, custody narratives or child GPS;
no unrelated guardian visibility; and no advertising, sale or cross-customer
profiling of transportation personal information. Student QR and Android FCM
are not activated by this legal-role work; their separate scope and privacy
gates still apply.

Canadian processing and backup approval is a CR1 requirement. It is not evidence
that every supplier flow stays in Canada. Verify the database, backups, web and
function processing, email, maps, billing, monitoring, support access and any
optional delivery service individually. Do not promise Canadian-only processing
or approved exceptions before the vendor/residency item passes.

The draft retention scheduler and security controls require their own hosted
acceptance. Do not describe retention as enabled, legal deadlines as implemented,
or isolation as proven based on repository code alone.

## 6. PIA responsibility to carry into the next item

The customer's accountable privacy representative determines which POPA PIA
preparation and submission requirements apply, using specialist advice where
needed. Where required, the public-body head or an
appropriately delegated person signs the PIA; internal SafeBus review alone
cannot supply that authority. OIPC submission or review must not be inferred
from a Markdown draft. [OIPC POPA PIA guide](https://oipc.ab.ca/resource/popa-pia-template-completion-guide/).

This item identifies that dependency. Preparing the full PIA is the next item,
not a completed outcome of this role analysis.

## 7. Review and evidence status

| Record                                     | Current state                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| Alberta registration and Canadian business | Owner-confirmed; formal identity and registration evidence pending        |
| Privacy counsel                            | Not appointed as of 2026-10-13                                            |
| Statutory mapping                          | Updated research draft; sourced applicability/compliance decision pending |
| SafeBus/customer roles                     | Proposed; accountable review and customer-specific confirmation pending   |
| Customer authority                         | Participating authority and authorized decision-maker evidence pending    |
| PIA, agreements and other Point 6 items    | Separate work and approval required                                       |

Keep legal advice, executed agreements, registration documents, customer names
and individual contact details in the approved restricted evidence system.
Only non-secret references belong in the readiness record. The legal fields in
`privacy-readiness.json` remain null until their real evidence is approved.

Point 6 remains open. Preparing or merging this analysis cannot activate the
privacy gate or authorize commercial operation.
