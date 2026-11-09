# SafeBus Master Services Agreement — Draft

**Status:** Proposed business terms for owner/customer review; not executed
**Provider:** Sachman Gold Inc. of `[PROVIDER_BUSINESS_ADDRESS]` (SafeBus)
**Customer:** `[CUSTOMER_LEGAL_NAME]` identified in the accepted online Order Form
**Effective date:** `[EFFECTIVE_DATE]`

## 1. Agreement and priority

The parties' agreement consists of the electronically accepted Order Form, this MSA, the Data
Processing Agreement (DPA), Security Schedule, Service-Level Agreement (SLA),
Acceptable-Use Terms and Data Return and Destruction Schedule. For privacy or
information security conflicts the DPA and Security Schedule control; the Order
Form controls price, term and licensed scope. A departure from a privacy/security
obligation must be identified expressly and approved by both parties; a generic
purchase order does not override it. Applicable mandatory law takes precedence.

This draft is not accepted through use of a prelaunch preview. In the finalized
online offering, the authenticated school-authority tenant administrator must
affirm their authority to bind the Customer, consent to electronic records,
and explicitly accept the complete published MSA, DPA, Order Form and incorporated
schedules. SafeBus must preserve the exact document versions, signing identity,
timestamp and receipt. Login, invitation activation, use of the app or payment
alone is not acceptance. The finalized published package is the Provider's
offer; the standard online agreement requires no separate Provider
countersignature. District-specific procurement terms that require an
individually signed agreement must be separately resolved.
Complete the customer identity and all binding commercial/privacy terms before
enabling acceptance; never present draft wording or unresolved placeholders.

## 2. Service and activation

SafeBus grants the Customer a non-exclusive, non-transferable right during the
term to use the contracted school transportation service for its authorized
operations and participants. SafeBus provides only the functions, supported
devices and geographical scope identified in the Order Form. The CR1 boundary
is Alberta public-school-authority transportation and authorized active-bus
visibility. The first pilot must remain within one to three approved tenants
and 25–100 buses in total.

Service activation requires the agreed acceptance and launch gates. Signing or
paying does not waive unresolved security, privacy or operating gates.
Backup/full-restore/disaster-recovery exercises are outside the launch gate;
no recovery-time or data-loss guarantee is included unless separately agreed
and supported by evidence.
No paid availability or recovery promise begins before the agreed service start.
The service does not replace dispatch judgement, school emergency procedures,
a Student Information System or emergency services. Displayed location may be
delayed or unavailable; a recorded event is not continuous child location.

Excluded unless separately agreed and approved: child GPS, student QR boarding,
SMS, iOS delivery, SIS integration, traffic-aware ETA,
guardian trip replay and any feature outside the locked CR1 scope. Eligible guardians and drivers can opt into Android push under the current
notification setup; customer scope, recipient choices, Android permission and
server authorization still apply. See the [current scope reconciliation](../../../operations/privacy-commercial-operations-2026-11-05.md).
A roadmap, source-code component or preview does not add a contractual commitment.

## 3. Included setup assistance and customer responsibilities

### Setup support included with the subscription

SafeBus provides assistance to help the Customer configure and get started with
routes, stops and route maps, buses, minimum student records, guardians and
authorized links, drivers and assignments. This assistance is included with the
subscription. The Customer and SafeBus coordinate the help needed, including
guidance, walkthroughs and authorized configuration help. The Customer is not
purchasing a guaranteed fully managed data-entry or setup-completion service.

The Customer provides lawful instructions, accurate minimum transport data,
authorized participants and collection notices. It determines guardian authority
and reviews transportation arrangements and assignments before operational use.
SafeBus helps the Customer resolve configuration questions and setup issues.
The Customer maintains employee/BYOD arrangements and provides prompt
account-lifecycle and assignment-change instructions.

Where assistance requires access to Customer records, personnel use named
Customer-authorized accounts scoped to that authority, existing role permissions
and administrator MFA. Guidance does not automatically require a data upload or
personnel access. Platform administration does not grant onboarding data access;
shared credentials, service-role frontend logic and RLS bypass remain prohibited.
The DPA and Security Schedule cover any source copies or records handled.

The Order Form records included setup assistance, agreed coordination and any
separately agreed services beyond it. No separate mandatory setup-assistance fee
is created here. Ongoing maintenance responsibilities and any additional work
must be agreed. Assistance does not certify route safety or add unsupported
bulk-import/export capabilities. Authorized administrators comply with security
requirements and the contracted access scope.

The Customer retains its public-body duties and transport safety responsibilities.
SafeBus cooperates as specified in the DPA. The Customer is not granted ownership
or control of SafeBus's software or business by this allocation.

## 4. Fees, tax and billing

The current self-service billing system supports **monthly or annual** licensed
per-active-bus subscriptions in Canadian dollars. The accepted online Order Form must
elect the billing interval, agreed unit price, contractual bus allowance, exact
payment/collection method and applicable discount or pilot treatment. The
billing interval is separate from the service term and renewal election in
section 5. A price published in the Stripe catalog does not substitute for
the Customer's explicit online price acceptance or authorize an unreviewed price
change. Pre-existing signed invoice contracts retain their accepted terms.
Additional services require a written price and scope. No guardian or driver
is personally responsible for the school authority's subscription fees.

For separately approved `send_invoice` invoice/PO contracts, the school
authority's accepted Order Form must select 14, 30, 45 or 60 calendar days
**after invoice issuance**, with an authorized billing contact and any PO
reference. The district administrator requests the exception; a recently
authenticated SafeBus platform super administrator approves the specific
request; the district administrator then activates the subscription.
Approval alone does not issue an invoice or start a subscription, and no
blanket net-30 payment promise applies.

For `charge_automatically` self-service Checkout, the trial, payment method,
automatic charge/renewal and cancellation terms must instead be disclosed and
accepted before the Customer confirms checkout. Do not represent a card-funded
subscription as a net-30 invoicing contract. The owner reports GST/HST
registration effective November 8, 2026; CRA evidence still requires private
verification. The owner-approved standard SafeBus subscription prices are
**CA$1.99 per active bus per month** or **CA$20.29 per active bus per year**,
**including applicable GST/HST**. The customer selects the interval in its
Order Form; the agreed gross tariff is not subject to unannounced tax added
above that amount. Determine place-of-supply, exemptions, applicable tax
breakdown and invoice disclosures before the first customer-specific execution.
These standard rates are approved business prices, **not an executed contract**;
the MSA, terms, liability, service level and customer acceptance remain drafts.

Stripe administers invoices and payment methods; SafeBus keeps a limited billing
projection. Bus-count, price and proration changes require Customer authorization
and a written change order before the platform administrator changes the billing
contract. Billing discrepancies are investigated promptly. The Customer pays
undisputed amounts while the parties resolve a good-faith dispute.

Subscription delinquency does not automatically suspend a tenant or an active
trip. SafeBus escalates non-payment through the agreed contact and any separately
reviewed notice/suspension process. Do not configure recurring renewal, automatic
collection or tax behavior differently from the executed terms.

## 5. Term, renewal and change

**Owner-approved standard service terms (November 9, 2026).** The Customer
chooses the billing interval in the accepted Order Form. A **monthly
subscription is month-to-month**, renewing automatically each month. An
**annual subscription has a 12-month term**, renewing automatically for
successive 12-month periods. A separately approved public-body procurement or
pilot agreement must be recorded in the Order Form; an automatic renewal does
not extend a pilot beyond its separately authorized scope.

An eligible first-time school authority receives a **single 14-day free trial**,
with a payment method collected in standard Stripe Checkout, followed by the
first recurring monthly or annual payment if the subscription is not canceled
during trial. For a separately approved invoice/PO arrangement, the first
invoice is issued at trial end instead of charging a card. A previously
subscribed or trialed authority receives no repeat trial. A trial must
not be treated as a free pilot or authorization to process actual student
transportation data without separately accepted security, privacy and
school-authority terms. The Customer must see the actual trial end,
selected billing interval and amount, collection method, first charge/invoice
date, and cancellation consequences at activation.

The Customer may **cancel automatic renewal at any time**, without an early
cancellation fee. Cancellation takes effect at the end of the current trial
(if trialing) or the current paid monthly/annual term. Cancellation before the
14-day trial expires prevents the first subscription charge. For a paid term,
service continues through the end of that period and **no partial refund**
is owed merely for canceling early, except as required by applicable law or
expressly agreed in writing. Already-issued invoices remain payable under
their approved terms. Cancellation does not automatically generate a refund
or shorten the term, and does not override lawful data return/deletion duties.
The Customer may resume renewal before the scheduled term end where its
provider state and accepted terms permit; any customer-specific variation
must be explicitly agreed.

Material changes to features, processing purposes, suppliers, retention or
service levels follow written change control and any required notices/approvals.
SafeBus may make maintenance and security improvements that do not materially
reduce agreed functionality or expand processing. Mandatory protective actions
may occur immediately, followed by prompt explanation to the Customer.

## 6. Ownership and confidentiality

SafeBus retains ownership of its software, designs, documentation and related
intellectual property. The Customer retains its rights in Customer records.
SafeBus receives only the rights needed to deliver and support the service and
meet legal obligations. Neither party obtains the other's trademarks without
permission. Feedback rights do not permit disclosure of personal information.

Each party protects confidential information with reasonable care, limits access
to people who need it and are bound by appropriate duties, and uses it for the
agreement's purposes. Publicly available information and information lawfully
obtained independently are excluded. Compelled disclosure is limited to what is
required; give notice where permitted and cooperate with protective measures.
Public-body access law may apply to records; SafeBus's confidentiality clause
does not predetermine a Customer's statutory disclosure decision.

## 7. Service assurance and remedies

SafeBus will perform the accepted service with reasonable care and skill.
The initial-pilot Service-Level Agreement uses **Monday–Friday, 8:00 a.m.–5:00
p.m. Alberta local time (America/Edmonton), excluding Alberta's nine general
holidays**, for ordinary staffed support. The complete holiday calendar and
request-triage rules appear in the SLA. There is **no 24/7 staffed support,
guaranteed after-hours response, uptime percentage, fixed repair time or
automatic SLA credit** for the initial pilot. Automated monitoring outside
staffed hours is not evidence of a person responding. Where supported by
operational evidence, any later numerical guarantee or expanded staffing
requires an express written agreement.

The Customer reports material service failures through the agreed channel;
SafeBus investigates with commercially reasonable efforts under the accepted
SLA. The absence of automatic SLA credits does not exclude mandatory remedies,
expressly agreed breach remedies or privacy/security obligations. The SLA's
support hours and holidays do not change the DPA's incident-notification duties
or applicable law, including deadlines triggered by actual awareness.

No certification, insurance, unlimited capacity, continuous GPS, fixed repair
time or supplier SLA is represented unless supported and expressly agreed.
Mandatory legal duties and the DPA are not excused by supplier outages.

## 8. Liability and third-party claims

### 8.1 Owner-approved proposed initial-pilot limits (November 9, 2026)

Subject to section 8.2 and only when incorporated in an **accepted
Customer-specific MSA and Order Form**, the proposed aggregate limits on the
Provider's liability arising out of or relating to this Agreement (whether in
contract, tort including negligence, or otherwise, to the extent legally
permitted) are:

- **General claims:** the **greater of CA$25,000 or the 12-Month Fees**.
- **Privacy/security claims:** the **greater of CA$100,000 or twice the
  12-Month Fees**, for claims arising from the Provider's breach of its
  contractual confidentiality, privacy, data-protection or information-security
  obligations concerning Customer information.

**12-Month Fees** means the subscription service fees **paid or contractually
payable by this Customer under its accepted SafeBus Order Form and attributable
to the 12 months immediately preceding the earliest event giving rise to the
claim**, net of approved discounts and **excluding GST/HST and other taxes**.
For a contract in force for less than 12 months (including a free trial), use
fees attributable to its actual shorter service period; the stated CA$25,000
and CA$100,000 minimums still apply. Allocate prepaid annual charges to the
covered service months and do not count the same fee twice or count an unrelated
Customer's subscription. If the relevant event spans multiple dates, use the
first event giving rise to the related claims. This definition does not change
the Customer's accepted subscription price or create extra fees.

The limits apply to the total of **all related and unrelated covered claims
combined for the entire accepted Agreement**, including successive terms or
renewals: they **do not reset for each incident, claim, invoice, year or renewal**.
The privacy/security cap **replaces**, rather than adds to, the general cap
for claims within the privacy/security category. A single event raising both
categories does not allow stacking the two caps or duplicate recovery. Where
different covered claims arise under both categories, the aggregate recovery
under this clause cannot exceed the higher applicable privacy/security cap;
the general-claim portion remains subject to the general cap.

### 8.2 Mandatory exceptions and preserved duties

Neither cap excludes or limits liability for **fraud, intentional or wilful
misconduct, or any liability that applicable law does not permit the parties
to exclude or limit**, to the extent of that prohibition. No monetary cap
prevents required incident containment, notice, cooperation, lawful regulatory
responses, data return, deletion or other performance obligations under the
DPA, Security Schedule or applicable law. The Customer retains its public-body
privacy accountability. A contractual cap is **not insurance**, not a statement
of available funds, and not a guarantee that a court or public authority will
accept the proposed limitation.

The general no-partial-refund rule concerns **convenience cancellation only**.
It does not waive statutory refunds or relief, remedies for material breach,
or any express exception accepted by both parties. The absence of automatic
SLA credits does not by itself waive available legal or agreed remedies.

### 8.3 Owner-approved limited, fault-based third-party indemnification (proposed)

**Only if expressly incorporated into the Customer's accepted MSA and Order
Form**, SafeBus, as Provider, will defend and indemnify the Customer against
the following **third-party claims**, and only to the extent attributable to
SafeBus's covered conduct:

1. **Provider-caused privacy/security claims.** A third party's claim against
   the Customer arising from SafeBus's breach of its own contractual
   confidentiality, privacy, data-protection or information-security
   obligations concerning Customer information, to the extent caused by
   SafeBus's acts or omissions (including acts of its personnel or
   subcontractors for which SafeBus is contractually responsible). The
   **privacy/security aggregate cap in section 8.1** applies.
2. **Provider-software intellectual-property claims.** A third party's claim
   that the **unmodified SafeBus software as provided by SafeBus**, when used
   by the Customer **as authorized under the Agreement**, infringes that
   third party's enforceable intellectual-property rights in Canada. The
   **general aggregate cap in section 8.1** applies. This does not create a
   guarantee concerning Customer-supplied content or third-party materials
   not provided as SafeBus software.

The indemnity covers **reasonable, documented costs of defending a covered
third-party claim and finally awarded damages or a settlement approved under
section 8.4**. **Defence costs, settlements and damages all count toward,
and do not increase, the single applicable aggregate cap** in section 8.1.
Claims raising more than one category cannot stack the general and
privacy/security caps or recover the same loss twice. Section 8.2's
non-excludable liability exceptions remain controlling. No blanket,
uncapped or unlimited third-party indemnity is granted.

SafeBus does **not** indemnify the Customer to the extent a third-party
claim results from the Customer's **independent negligence, unlawful
instructions, unauthorized modifications or combinations, misuse of SafeBus,
Customer-supplied materials, or other independently wrongful Customer
conduct**. Where more than one party contributed, only the portion
attributable to SafeBus's covered conduct is eligible; allegations alone
do not allocate ultimate fault. This is **not** a waiver of SafeBus's
independent DPA, security, subprocessor or non-excludable legal duties.
No reciprocal Customer indemnity is silently imposed.

### 8.4 Claim defence, cooperation and settlement controls (proposed)

The Customer must give SafeBus **reasonably prompt written notice** of a
covered third-party claim, with available details; late notice reduces
SafeBus's duties only to the extent that the delay materially prejudices
the defence. SafeBus may direct the defence with suitably qualified
counsel and must keep the Customer reasonably informed; the Customer
may participate with its own counsel at its own expense, subject to
non-excludable legal rights and an actual conflict of interest. Both
parties must provide reasonable cooperation and preserve relevant
evidence, without requiring unlawful disclosure or weakening privacy.

Neither party may settle a claim on the other's behalf **without prior
written consent** where the settlement admits the other party's fault,
imposes nonmonetary duties, restricts its operations, requires disclosure
or creates payment obligations for it. Consent must not be unreasonably
withheld or delayed when its interests are adequately protected. A
settlement does not override a public authority's mandatory powers or
legal/privacy reporting duties. No indemnity payment or legal fee may
circumvent the applicable aggregate limit by reclassification.

For a covered intellectual-property allegation, SafeBus may seek a right
to continue the Customer's authorized use, or offer a non-infringing
replacement or modification consistent with the accepted service scope.
If these cannot reasonably resolve the issue, any further termination,
breach remedy or refund must follow the accepted MSA, Order Form and
applicable mandatory law; this clause does **not** invent a blanket
termination fee or automatic paid-period refund.

### 8.5 Procurement, exclusions and insurance status

**Personal injury/property damage indemnities, additional third-party
privacy guarantees, broader intellectual-property indemnities, special
defence-cost treatment and school-authority procurement exceptions**
are **not silently agreed** and require separate, authorized written
review and acceptance in the relevant customer-specific Order Form
rider or amendment. Any variation must state precisely whether and how
it modifies the section 8.1 caps and section 8.2 mandatory exceptions;
there is no unilateral district variation or implied unlimited obligation.

The owner **deferred insurance quotations and purchases**. **No active
CGL, technology E&O, cyber/privacy insurance, certificate, insured
limit or insurer backing is represented**. Before any real district
agreement, SafeBus must examine the school authority's procurement
requirements, third-party exposure and ability to fund uninsured
liabilities. This approved business **proposal is not an executed
customer agreement, an insurer confirmation, legal enforceability
assurance or commercial/pilot launch authorization**.

## 9. Suspension, termination and exit

SafeBus may restrict the affected activity where necessary to contain a credible
security/privacy incident or unlawful use, using proportionate scope and prompt
Customer notice when permitted. Public safety and fallback dispatch coordination
must be considered; suspension is not an automated consequence of invoice state.
The Customer may immediately stop its operational use or withdraw pilot approval.

Proposed breach process: written notice and 30 calendar days to cure a material
curable breach; urgent protective action and non-curable breaches are addressed
separately. The standard convenience-cancellation terms are defined in section 5:
no early cancellation fee and no partial refund for a paid period solely
because of cancellation, except where legally required or expressly agreed.
Any customer-specific exception must be explicit in the accepted Order Form. Accrued undisputed fees,
confidentiality, valid claims and necessary record duties survive termination.

At exit, apply the **district-controlled Data Management, Return and
Destruction Schedule**. During service, the authorized school-authority
tenant administrator can download available directory CSVs and use existing
record-level deletion or archive controls where supported. Neither the
subscription cancellation action nor removal of a visible record constitutes
immediate deletion of all trip history, notification copies, audit, supplier
logs, immutable backups or legally held records. The administrator may request
assistance for additional records or account closure through SafeBus support;
SafeBus verifies authority, scoped data classes, applicable retention/holds,
supplier limitations and a secure recipient before carrying out such work.

**The standard initial-pilot contract does not impose a blanket 30-day
data-return period or 60-day primary-deletion deadline.** Any customer-specific
time commitment must be expressly agreed and supported by tested technical
and provider processes. The approved owner policy does not activate destructive
automatic retention or authorize an untested school-authority-wide purge.
Customer-directed records must not be held hostage to an unrelated billing
dispute, subject to lawful instructions and a proportionate secure transfer.
Mandatory DPA/records duties and verified supplier-backup expiry remain
applicable after access ends.

## 10. General terms

Proposed governing law: Alberta and applicable federal Canadian law; proposed
venue: courts in Alberta. Confirm procurement constraints and any mandatory
public-body terms before signing. Business disputes first go to authorized
representatives for good-faith resolution, without preventing urgent relief or
regulatory cooperation. No mandatory arbitration is assumed.

Assignment, subcontracting and change of control require the agreed consent
terms; privacy duties continue through any permitted transfer. Force majeure
may excuse a directly affected performance obligation to the extent legally
permitted after prompt notice and reasonable mitigation, but does not waive
confidentiality, incident reporting or information-protection duties. Neither
party becomes the other's partner or agent by this agreement.

Formal notices use owner-selected `info@safebus.kids` (`[NOTICE_EMAIL]`) and the Customer notice details in the Order
Form. Amendments require authorized written agreement. The agreement constitutes
the accepted business terms, with severability and electronic records where
lawful. Acceptance receipts and customer identities belong in restricted contract storage.


## November 9 business-approved collection policy — current terms for final review

Default payment: Stripe-hosted Checkout collects the school authority's card/payment method when its first subscription is confirmed. First-time authorities receive **14 days free**; after expiration the selected **CA$1.99/month** or **CA$20.29/year per active bus, GST/HST-inclusive** plan bills automatically. Trial eligibility is checked against both SafeBus's billing control record and the account's Stripe subscription history. The approved annual billing interval carries a 12-month service term; monthly billing is month-to-month.

Exception: a district may request invoice/PO billing **only with a distinct platform-admin approval** of its contact, address, exact price and quantity, any purchase order, and due window (14/30/45/60 days). The district administrator must subsequently affirmatively activate the approved recurring plan. Invoice billing uses `send_invoice` (manual payment), not an automatic card charge. First-time districts still have one 14-day trial; their first payment invoice is issued at its expiry. Previous subscribers cannot receive another trial; activation can generate an invoice immediately. Approved invoice renewals generate recurring invoices until cancelled. Cancellation does not void invoices already issued. The customer-specific order must explicitly choose the collection method, bill-to contact, trial and due dates; the proposed net-30 term is not automatically approved for every district.

The standard **monthly month-to-month / annual 12-month** renewal and
no-fee, end-of-term cancellation policy in section 5 is also owner-approved.
These policies, proposed Provider liability caps and limited fault-based indemnity are **owner-approved business positions** only. This MSA remains **not executed**, a **draft, unsigned and unpublished**, pending customer-specific legal/procurement review and actual acceptance. **No insurance coverage, customer authorization to process school records or pilot/launch sign-off is implied**. The initial-pilot support policy is specified in the separate draft SLA.
