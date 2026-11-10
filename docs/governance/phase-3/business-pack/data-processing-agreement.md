# SafeBus Data Processing Agreement — Draft

**Status:** Proposed schedule to the MSA; not executed
**Parties:** Sachman Gold Inc. (SafeBus) and `[CUSTOMER_LEGAL_NAME]` (Customer)

## 1. Roles and instructions

For the transportation information identified below, SafeBus performs the
agreed service on the Customer's documented lawful instructions. The Customer
retains its applicable public-body responsibilities. The parties confirm the
applicable POPA/ATIA role and statutory service-provider treatment before
activation. Generic controller/processor language does not replace Alberta's
statutory framework or authorize collection.

SafeBus's separately necessary business-account, billing, security and support
activities are described in the business privacy policy and require their own
purpose and applicable PIPA/PIPEDA assessment. They do not authorize secondary
use of the Customer's transport records. The Customer need not approve ownership
of SafeBus; it authorizes only its own data use and contractual instructions.

SafeBus alerts the Customer if an instruction appears unlawful or outside the
approved scope, pauses the disputed processing where appropriate and seeks
resolution. Compelled disclosures are limited and notified where law permits.

## 2. Processing appendix for CR1

| Topic                    | Proposed permitted processing                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Purpose                  | Setup assistance and school transport operations, assignments, trip operation, authorized active-bus visibility and recipient-enabled notifications                |
| Individuals              | Selected students, guardians, drivers and Customer administrators                                                                                                  |
| Data                     | Minimum identity/contact/role and authorized links; school/route/stop assignments; trip/location/event records; device/session and limited audit/delivery metadata |
| Activities               | Receive, validate, store, authorize, retrieve, update, transmit to permitted recipients, retain and securely dispose according to accepted schedules               |
| Collection sources       | Customer-approved roster and relationship decisions; invited users; assigned active-trip Android device; authorized operational actions                            |
| Recipients               | Scoped Customer administrators and authorized SafeBus onboarding personnel, assigned drivers, linked guardians and accepted suppliers, only as necessary           |
| Duration                 | Contract term and approved return/retention/backup/hold periods                                                                                                    |
| Geographical constraints | Approved Canadian production/backup requirements, with each supplier flow and any cross-border exception explicitly assessed                                       |
| Authority and notice     | `[CUSTOMER_COLLECTION_USE_DISCLOSURE_AUTHORITY]`; applicable notice text/channel; required consent or other ground per activity                                    |

No prohibited student identifiers, home addresses, health information, custody
narratives, unrelated educational records or child-carried GPS are permitted.
Student QR and other remaining CR1 exclusions need separate accepted scope and
privacy decisions before activation. Recipient-opt-in Android FCM is covered by
the current notification scope and must appear in supplier review; the standard
setup does not supply recipient consent. No sale, advertising, unrelated profiling or AI
training using transportation personal information is permitted.

## 3. Authorized access and confidentiality

Included setup assistance can involve Customer-directed processing when the
Customer authorizes help with its routes, stops/geometry, buses, student records,
guardian links, drivers or assignments. Guidance and walkthroughs do not by
themselves require source-data transfer or record access. Where access is needed,
use only minimum authorized records, named school-authority-scoped accounts,
existing permissions and administrator MFA. Record the instruction, work and
access review/removal. No cross-customer support entitlement is created.

The Customer verifies guardian authority and its operational arrangements.
If source files are necessary, agree a restricted transfer channel; ordinary
support email is not a roster-upload channel. Temporary copies require documented
purpose, approved retention/hold handling and verified disposal. Do not request
prohibited student identifiers, home addresses, health or custody narratives.

SafeBus limits personnel access by operational need, binds authorized personnel
to confidentiality duties, trains them and maintains reviewed access records.
Routine platform control-plane access does not include Customer students,
manifests or live locations. Any necessary exceptional investigation must use
a separately documented, authorized and audited process; the agreement itself
does not create a broad support browsing entitlement or an RLS bypass.

Customer accounts and linked access must be current. Guardian links are not
automatically re-established after removal. Revocation, expired links and open
realtime/native sessions require verified behavior, rather than relying on a
UI role label. The Security Schedule and acceptance evidence govern safeguards.

## 4. Suppliers and cross-border processing

The executed supplier appendix identifies actual legal vendors, services,
information, processing countries, support access, backup/log windows and
contract/security evidence. A vendor listed as pending is not approved for
customer operation by this draft. Stripe's financial processing is assessed
separately from transport subprocessing and still disclosed in the privacy
policy and business-purpose inventory.

Proposed change process: SafeBus gives at least 30 calendar days' prior notice
of a material new supplier or country change, except a justified urgent security
change notified promptly. The Customer may raise a reasonable documented privacy
objection. The parties seek a lawful alternative; if none exists, agree on
suspending the affected processing or terminating the affected service with the
agreed fee/data-return treatment. No change proceeds without the approvals
required by the contract and applicable law. Confirm the notice period before
signing. SafeBus remains responsible for its agreed supplier obligations.

### Current supplier-specific facts for the final processing appendix (non-binding review)

The [verified supplier-processing worksheet](district-supplier-processing-appendix-review-2026-11-08.md) records the data flows to assess with a public school authority: Supabase stores core records in Canada Central but secondary countries remain under review; Netlify functions handle invitation and notification data while live execution/log countries are unverified; Resend stores outbound email content in the **United States**; verified published source now renders generic pickup/drop-off emails without student names, bus numbers or event times, while Resend still processes recipient/event/delivery data and other email types may contain details; generic Firebase notification text is deployed to the provider after the November 8, 2026 v7 update, while device tokens, opaque IDs and event categories still reach Google; Geoapify maps use the standard CDN-hosted tile endpoint, not the separately identified EU-only API host.

The authority and SafeBus must settle whether remaining email content, recipient/event/delivery metadata and other cross-border flows are lawful and necessary, plus vendor-specific contracts, countries, retention and notice requirements. Generic external pickup/drop-off text was verified in published source, not yet through a live synthetic Resend delivery test. Stripe billing and Zoho ordinary business email are separate SafeBus-purpose services, not automatically transport-data subprocessors. **Do not treat this review paragraph as an executed supplier appendix, an insurance claim, a GDPR determination or final approval.**

## 5. Requests and customer cooperation

For Customer records, the Customer normally decides statutory access,
correction and complaints; SafeBus promptly routes received requests and
provides secure retrieval, correction and disclosure assistance within the
agreed support window, allowing the Customer to meet legal deadlines.
The exact assistance deadline is `[REQUEST_ASSISTANCE_DEADLINE]` and must be
settled before operation. Identity/representation is verified proportionately;
guardian bus visibility is not automatically authority for every student record.

SafeBus does not delay reporting a request until the Customer's response period
has expired. Own-business requests go directly to the SafeBus privacy contact.
Requests, outcomes and necessary holds are documented in restricted storage.
Regulatory cooperation and audit access are subject to lawful scope, protection
of other tenants, appropriate confidentiality and reasonable arrangements.

## 6. Incidents and assurance

SafeBus contains and escalates suspected incidents promptly and preserves
proportionate evidence. Proposed initial Customer notice: without undue delay
and no later than 24 hours after awareness of an incident affecting its data,
or sooner where law or the accepted contract requires. Initial notice may be
incomplete; provide updates with known scope, information involved, risks,
containment, contact and next steps. Do not await a final forensic report.

The parties allocate Customer/public-body and SafeBus own-business regulator
and individual notifications according to applicable law; neither can contract
away its own legal obligation. Operational severity does not replace the legal
harm/reporting assessment. No universal 72-hour statutory rule is presumed.

SafeBus supplies relevant security evidence, assists the Customer's PIA and
reasonable compliance review, and reports material unresolved findings. No SOC 2,
ISO, insurance, hosted isolation or recovery certification is implied.

The proposed Provider monetary caps in MSA section 8, if later accepted by a
Customer, are separate from and do not eliminate or postpone any non-excludable
privacy/security duty, incident notification, cooperation, access assistance,
data return or deletion obligation. A privacy/security financial cap is not
insurance or permission to diminish safeguards under this DPA. No policy,
coverage amount or insurance certificate is represented. Any limited
third-party privacy/security indemnification in a later accepted MSA
applies only to covered claims attributable to SafeBus's own breach,
including acts for which it is contractually responsible. That indemnity
uses the agreed privacy/security monetary cap for reasonable defence costs
and damages, with no separate additive cap; it does not excuse the
Customer's independent unlawful instructions or its own legal duties.
This indemnity clause is **not** a substitute for the timely independent
incident notification, safeguards and cooperation duties stated above.

## 7. Retention and exit

The owner-approved approach is **school-authority-controlled data management**:
authorized tenant administrators can download supported student, guardian,
driver and bus directory CSVs, and use existing record-level deletion, archive
and preservation controls only where the current application and applicable
law permit. A directory download is not a complete historical data export;
deleting an on-screen record does not erase unrelated trip history, supplier
logs, audit evidence, immutable backups or legally preserved information.

The accepted Data Management, Return and Destruction Schedule identifies
purpose-based retention, lawful holds, customer-directed requests, export
scope and supplier/backup handling. The Customer can request additional
securely scoped records or account closure through the verified support
channel, subject to authority and recipient checks. **No universal 30-day
return or 60-day deletion commitment** is implied by this standard model;
any customer-specific deadline requires a tested process and written
agreement. Destructive automated retention remains separately gated and
is not activated by contract approval.

Account disablement, unlinking, primary deletion, provider deletion and
backup expiry are distinct actions. Neither party should certify complete
erasure without evidence of actual scope and lawful exceptions. The
Customer's own statutory recordkeeping duties and SafeBus's separate
DPA/security/financial retention duties remain intact.

### Publication prerequisite — supplier evidence review (2026-11-08)

The [current public-source supplier DPA review](supplier-dpa-insurance-contract-review-2026-11-08.md) identifies incorporated terms for Supabase, Netlify, Resend and Stripe, separately available Geoapify processing terms and conditional Firebase terms. Zoho Mail is used for ordinary SafeBus business correspondence and is **not automatically a school-authority transport-data subprocessor**; its optional organization-admin DPA is not a blanket publication requirement. **These findings do not establish actual SafeBus-account acceptance, coverage, geographic restrictions or suitability for a public school authority.** Complete the real account-specific supplier/country appendix and customer permission decisions before signing. Do not treat the separately published driver/guardian Terms of Use as approval of the district's acceptable-use schedule, and do not publish a global contract package with the temporary Stripe prices as though the owner had approved them.

## 8. Completion and review

Complete the customer authority/notice appendix, suppliers/countries, request
assistance deadline, retention, backup and incident terms before execution.
The owner can draft the business standard now. In the finalized online
offering, the Customer accepts this DPA as a schedule of the **same explicit
MSA and Order Form click-to-accept action**. No separate DPA signature or
separate officer-invitation process is required for the standard SafeBus
workflow. The recorded receipt identifies the exact version and hash.
Simply viewing the page or signing in does not create acceptance; the
school authority's independent statutory and procurement duties remain.
Changes require the MSA's accepted written process.
