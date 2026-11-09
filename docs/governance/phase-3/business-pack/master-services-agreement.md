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

For expressly agreed `send_invoice` contracts, the proposed payment term is
30 calendar days after receipt, subject to the signed Order Form. For
`charge_automatically` self-service Checkout, the trial, payment method,
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

The initial **service term** and any distinct pilot period must be selected
expressly in the Order Form; a 12-month term is a **proposal**, not an
unconditional consequence of selecting monthly or annual billing. A monthly
billing interval alone does not establish month-to-month termination rights;
an annual billing interval does not extend an expired pilot authorization.

The existing new-tenant self-service Checkout offers a **14-day trial** with
payment-method collection, then recurring billing if the subscription remains
eligible and is not canceled under its accepted terms. This software default
must not be treated as a free pilot offered to every Customer or a contractual
promise of trial duration: the final Order Form or applicable approved Checkout
disclosures must state the actual trial eligibility, duration, end date,
first-charge timing, price and cancellation/renewal consequences before
acceptance. Existing invoice agreements are not silently converted to trials.
Automatic renewal applies only if selected and disclosed expressly, with
accepted notice periods and price-change terms; otherwise renewal requires
a written agreement. The implemented billing configuration and signed terms
must agree before commercial activation.

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

SafeBus will perform the accepted service with reasonable care and skill and
meet only the quantified commitments in the completed SLA. The Customer must
report a material failure through the agreed channel; SafeBus investigates,
provides applicable contractual credits and remedies the failure. Any additional
warranty, remedy or termination right must be included in the accepted terms.

No certification, insurance, unlimited capacity, continuous GPS, fixed repair
time or supplier SLA is represented unless supported and expressly agreed.
Mandatory legal duties and the DPA are not excused by supplier outages.

## 8. Liability and third-party claims

The general aggregate liability cap is `[GENERAL_LIABILITY_CAP]`; any separate
privacy/confidentiality cap is `[PRIVACY_LIABILITY_CAP]`. The parties must settle
amounts, excluded loss categories, covered claims and insurance alignment before
signing. Do not interpret an unfilled cap as zero liability or unlimited liability.
Any limitation must preserve liability that applicable law does not permit the
parties to exclude, and agreed treatment of fraud or wilful misconduct.

The parties will negotiate the allocation of intellectual-property infringement
and unlawful-data/instruction claims in the Order Form or a signed addendum.
Required mechanics include prompt claim notice, control of defence, cooperation
and no settlement admitting liability or imposing duties without consent.
No defence/indemnity amount or scope is accepted by this draft.

## 9. Suspension, termination and exit

SafeBus may restrict the affected activity where necessary to contain a credible
security/privacy incident or unlawful use, using proportionate scope and prompt
Customer notice when permitted. Public safety and fallback dispatch coordination
must be considered; suspension is not an automated consequence of invoice state.
The Customer may immediately stop its operational use or withdraw pilot approval.

Proposed breach process: written notice and 30 calendar days to cure a material
curable breach; urgent protective action and non-curable breaches are addressed
separately. The Order Form must define convenience termination, prepaid-fee
treatment and any early-exit fees; none are assumed. Accrued undisputed fees,
confidentiality, valid claims and necessary record duties survive termination.

At exit, apply the Data Return and Destruction Schedule. Customer-directed
records are not held hostage to a billing dispute, subject to lawful instructions
and a proportionate, secure transfer process.

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
