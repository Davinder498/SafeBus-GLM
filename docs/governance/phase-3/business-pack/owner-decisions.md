# Owner Decisions Before Signing or Publication

**Status:** Decision worksheet; only expressly recorded owner choices are resolved
**Prepared:** 2026-10-13; owner choices last reconciled 2026-11-09

The owner initially requested placeholders for business identity and contact
details. On 2026-10-15 the owner identified Sachman Gold Inc., doing business as
SafeBus, as the operator and seller, and selected SafeBus as the sole public name.
Keep customer-specific values and signed copies outside Git.

The owner is the Privacy Lead. The selected business inbox is info@safebus.kids;
the owner confirmed receipt of an operational alert on 2026-11-05. The owner selected Monday–Friday, 8:00 a.m.–5:00 p.m. Alberta local time
(`America/Edmonton`) on 2026-11-05. The owner will handle support and backup escalation personally; there is no
independent responder. Holiday coverage, escalation mechanics and request-handling
exercises remain unresolved. The owner
confirmed on 2026-10-16 that the official domain is safebus.kids and Sachman Gold
Inc. is an Alberta corporation doing business as SafeBus. The website and public
privacy/deletion routes are available over HTTPS. The 2026-10-16 owner record
was superseded by owner-reported GST/HST registration effective 2026-11-08;
on November 8 final prices were still undecided; the owner approved the fixed, tax-inclusive amounts on November 9 (see latest decision below). The owner reports
SafeBus is now registered as a trade name and selects info@safebus.kids for
formal notices. The owner supplied a private mailing address that must **never
be put in GitHub or displayed on public pages**. Corporate and CRA records,
signing authority, insurance and backup coverage require separate verification.

| Input                                                            | Draft treatment                                                                               | Required decision/evidence                                                                                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Provider legal name / public name | Sachman Gold Inc. operating as SafeBus; owner reports SafeBus registered as a trade name | Confirm registration documents and signatory privately before execution |
| `[PROVIDER_BUSINESS_ADDRESS]` | Address provided privately; explicitly withheld from Git and public pages | Insert only into a restricted signed document if required; no source or public disclosure |
| Privacy/support and contract notice email; `[NOTICE_EMAIL]` | Owner confirmed info@safebus.kids for privacy, support and formal legal notices | Verify monitored mailbox and escalation/absence path before signed contracts |
| `[PRIVACY_LEAD]`                                                 | Business owner; expressly selected on 2026-10-15                                              | Appointment decision recorded; training, resourcing, coverage and backup still required                                                   |
| `[PRIVACY_BACKUP]`                                               | Unresolved                                                                                    | Capable backup and routing evidence; personal details outside Git                                                                         |
| `[EFFECTIVE_DATE]`, `[PUBLIC_POLICY_URL]`, `[DELETION_URL]`      | No effective or publication date                                                              | Approved wording, working public HTTPS pages and contact paths                                                                            |
| `[CUSTOMER_LEGAL_NAME]`, customer privacy contacts and signatory | Unfilled                                                                                      | Customer onboarding inputs; not needed to write the business drafts                                                                       |
| Monthly/annual per-active-bus prices | **CA$1.99/month** and **CA$20.29/year**, both including applicable GST/HST; owner-approved 2026-11-09 | Stripe live prices verified inclusive on their original price IDs; retain customer-specific bus count, interval and order acceptance |
| Tax registration, `[APPLICABLE_TAXES]`, exemptions | Owner reports CRA GST/HST registration effective 2026-11-08; Stripe Canada registration currently starts 2026-10-23 | Privately verify CRA date, province-specific tax, inclusive price/invoice treatment, historical and future subscription settings |
| Collection method, invoice/payment period                        | Stripe self-service supports automatic payment; legacy invoice contracts remain separate; net 30 is proposed only for accepted `send_invoice` terms | Approve customer payment method and invoice terms; do not offer net 30 if card is charged automatically                                                                |
| Trial, service term and renewal                                  | Current new-tenant Checkout has a 14-day trial default; 12-month service term is only proposed, and monthly/annual billing intervals are available | Approve eligibility, first recurring charge, initial service/pilot term, auto-renewal election, cancellation route, notice periods and Stripe implementation; do not treat trial as an approved free pilot                                                          |
| Bus-count changes/proration                                      | Written change order before billing change                                                    | Define effective date, approved credit/debit method and evidence of customer authorization                                                |
| Non-payment                                                      | Written escalation; no automated operational suspension                                       | Approved suspension notice/process; billing state never automatically disables a tenant                                                   |
| `[GENERAL_LIABILITY_CAP]`, `[PRIVACY_LIABILITY_CAP]`             | No selected amounts                                                                           | Owner risk/insurance review, customer negotiation and legal review of exclusions                                                          |
| Insurance | Purchase deferred by owner; no active coverage asserted | Insurance quotes, customer requirements, bound policy and liability caps pending before applicable pilot |
| Support hours, timezone and holidays | Owner reconfirmed Monday–Friday 8 a.m.–5 p.m. Alberta local time (America/Edmonton) | Holiday/owner-absence/backup escalation unresolved; no 24/7 promise |
| Availability, latency, GPS freshness and notification targets    | All unapproved; recovery commitments excluded from this launch review                         | Evidence for any selected promise; architecture review does not establish measured capacity                                               |
| Credit rates/cap                                                 | Unfilled                                                                                      | Commercial remedy and claim process after service targets are approved; define credit treatment for monthly vs annual billings                                                                    |
| Incident notification                                            | Proposed initial customer notice within 24 hours of awareness, sooner when required           | Operational capability and applicable legal/contract deadlines; never wait for final forensics or counsel appointment to contain/escalate |
| Supplier/cross-border list                                       | Known/proposed suppliers; locations unverified                                                | Actual agreements, countries, retention/logging, security review, customer approval and required notices                                  |
| Retention                                                        | Existing proposed periods; not activated                                                      | Purpose, legal duties/holds, approved schedule, enforcement tests and separate backup windows                                             |
| Return/deletion                                                  | Proposed 30-day return request and 60-day primary deletion windows                            | Tested export/deletion workflow, feasible supplier cleanup and approved backup handling                                                   |
| Customer PIA/signatures                                          | Deferred until onboarding                                                                     | Public-body status, collection authority, deployment scope and head/delegate sign-off where required                                      |

## Review order

1. Review the business privacy policy and identity/contact inputs.
2. Review service scope, annual per-bus price, tax treatment, renewal and payment.
3. Review data-processing, security, liability and exit terms together.
4. Complete service targets only after operational evidence supports them.
5. Adapt the PIA and participant notices for each customer; review supplier and
   retention decisions before signing or publication.
6. Record approvals with real evidence. Under DL-023 a sourced legal assessment
   replaces blanket counsel signoff; any customer-specific specialist-review term
   is addressed at onboarding.

Owner approval of a draft business position does not record a customer signature,
make a technical safeguard pass, or activate the Point 6 launch record.

## Historical temporary Stripe catalog decision — November 8, 2026 (superseded November 9)

The owner expressly confirmed that the live Stripe subscription prices **CA$1.99 per active bus/month** and **CA$20.29 per active bus/year** are **temporary testing values, not finalized commercial prices**. The owner instructed SafeBus to **leave both prices exactly as they are** and decide later when and how to change them. No authorization to edit Stripe products/prices, billing UI, historical invoices, active customer subscriptions, tax configuration or invoicing follows from this decision. Do not silently publish these values as binding price commitments in the district Order Form or claim that an alternative market benchmark has been approved. Reconcile any existing live customer obligations before future changes.

A public-source supplier DPA and insurance review, including contract publication dependencies, is recorded in [November 8 review](supplier-dpa-insurance-contract-review-2026-11-08.md).

## Subscription setup assistance — confirmed owner clarification, 2026-11-05

Setup assistance is included with the subscription. The SafeBus team helps
subscribing school authorities configure routes, maps, stops, buses, student
records, guardians/links, drivers and assignments, and get started. This is
assistance, not a promise that SafeBus performs every setup task or guarantees
completion of a fully managed setup. This clarification supersedes the earlier
managed-setup interpretation. Guidance, walkthroughs and authorized configuration
help retain existing authorization and administrator MFA. No general access,
mandatory data handover or separate setup-assistance fee is created. Agree any
ongoing maintenance or additional service scope separately.

## Retention — conditional owner support, 2026-11-05

The owner is willing to adopt the proposed retention schedule provided it does
not violate applicable provincial or federal law. The
[schedule's legal review](../retention-schedule.md#legal-review-and-mandatory-overrides--2026-11-05)
records the necessary statutory/customer exceptions, including the POPA
decision-use trigger, applicable federal breach records and tax-record duties.
The listed periods are purpose-based proposals to assess per record/customer,
not unconditional deletion timers. This statement does not establish that every
condition is met, approve a particular customer's schedule, or authorize turning
on deletion. Scoped holds, cascades, supplier handling and protected technical
acceptance remain required. Do not mark readiness approved from this conditional
statement or from a source merge.

## First nonzero billing and tax evidence — November 7, 2026

A read-only live Stripe review has now confirmed one paid **CAD 1.99** recurring
subscription invoice and one corresponding paid invoice-payment record. The same
invoice reports `automatic_tax.enabled=false` and no charged tax. The account's
Stripe Tax settings are active with a Canadian registration entry, but the owner
has not provided actual CRA registration evidence or decided the appropriate
tax treatment. See the [restricted-data-safe review](../../../qa/first-paid-invoice-tax-review-2026-11-07.md).

This resolves only the earlier “first nonzero payment not observed” technical
checkpoint. It does **not** verify tax accuracy, Stripe email delivery, merchant
bank settlement, customer pricing acceptance or commercial launch. Do not alter
tax configuration or issue corrective financial documents without an approved
finance decision and documented customer treatment.

## Superseded owner declaration — historical November 7, 2026

The owner has now explicitly confirmed: **Sachman Gold Inc. is not registered
for GST/HST at present and plans to register in the future**. This supersedes
the older `unconfirmed` owner-status field but **does not** verify CRA records,
taxable/associated-person revenue, or whether an earlier mandatory threshold
has been crossed. The live Stripe account still has an active Canadian Tax
registration entry; this mismatch requires a controlled finance and account
configuration decision before further tax collection. Preserve the observed
CAD 1.99 paid/no-tax invoice as historical evidence, not blanket confirmation
of correct treatment. See [first-paid-invoice tax review](../../../qa/first-paid-invoice-tax-review-2026-11-07.md)
and [CRA registration guidance](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html).

Upon confirmed CRA registration, the owner must authorize the effective date,
correct tax collection setup for new and existing subscriptions, invoices,
customer disclosures, and a verified post-registration payment test. No current
Stripe configuration changes, new tax charges, or readiness approvals follow
from this declaration.


## Current business decisions — November 8, 2026

The owner superseded the historical unregistered statement: **Sachman Gold Inc. is reported GST/HST-registered effective 2026-11-08**. The CRA confirmation and account identifiers must be stored privately, not in Git. SafeBus is reported registered as a trade name under Sachman Gold Inc.; the chosen formal legal-notice email is **info@safebus.kids**. The mailing address was provided privately with an explicit **no-public-display** instruction, and therefore is never reproduced in this repo. Keep the public address placeholder until a restricted signed contract needs it.

At the November 8 checkpoint, monthly and annual amounts were **undecided** and the owner had selected **GST/HST-inclusive prices** for future offers. **Superseded by the November 9 final fixed-price approval below.** The temporary live Stripe $1.99 monthly / $20.29 annual prices, existing subscriptions and historical invoices must remain unchanged pending a reviewed decision. Stripe's Canadian Tax registration is active from **2026-10-23T14:19:38Z**, earlier than the reported CRA date; one existing active subscription currently has `automatic_tax.enabled=true`, whereas the paid Nov 7 invoice had `automatic_tax.enabled=false`. Both active prices have `tax_behavior=unspecified`, with a default inferred by currency; **this is not proof of tax-inclusive billing**. Reconcile effective date, supply timing, customer region, the right tax rate, inclusive price and invoice tax disclosure before implementing any live financial correction.

Insurance is to be purchased **later**; no coverage or limits are currently claimed. The support schedule remains **Monday–Friday 08:00–17:00 America/Edmonton**. Holiday and owner-absence response/backup are still unresolved. This statement does not authorize contract publication, a district pilot, tax-setting mutations or a readiness approval.


## Final fixed-price approval and verified Stripe update — November 9, 2026

The owner **approved CA$1.99 per active bus per month** and **CA$20.29 per active bus per year**, both **including applicable GST/HST**, as SafeBus's final standard selling prices. This explicitly supersedes the November 8 instruction to leave these figures as temporary testing amounts. It does not approve any customer-specific signing authority, insurance limit, SLA guarantee, or commercial launch.

On the owner's express request, the two existing LIVE Stripe Price objects were updated in place from `tax_behavior=unspecified` to **`tax_behavior=inclusive`**, and freshly retrieved after each update:

| Interval | Owner-approved CAD cents | Stripe price ID | Verified current tax behavior |
| --- | ---: | --- | --- |
| Monthly | 199 | `price_1URbJ3JayDoqdBIzNBcBJyNj` | `inclusive` |
| Annual | 2029 | `price_1URbJ3JayDoqdBIzCTnaHtFq` | `inclusive` |

Both prices remain active on the existing `SafeBus Subscription` product. No new Stripe prices, new subscriptions, subscription migration, changes to historical invoices, tax registration mutation, or payment capture was performed as part of the price-setting action. An existing active subscription remains attached to the same monthly price and had `automatic_tax.enabled=true` on the observed snapshot; future invoices may therefore reflect an **inclusive** tax breakout while preserving the stated gross amount, subject to exemptions, jurisdiction and provider calculation.

The Stripe Canada Tax registration was still observed active from `2026-10-23T14:19:38Z`, earlier than the owner-reported CRA GST/HST registration effective **2026-11-08**. **Do not silently rewrite the provider registration date, retroactively change invoices or assume CRA verification.** Review the private CRA notice, applicable past collections, and payment/invoice records before tax filing or customer reconciliation. No account number or private mailing address belongs in Git.

The code now restricts newly created prices and tenant selections to the approved interval amounts with `tax_behavior=inclusive`, prevents archiving the only approved active price in either interval, and reuses existing approved prices rather than creating duplicates. Future tariff changes must be explicitly approved and reviewed as a code/provider/contract migration.


## Final trial and approved invoice/PO policy — November 9, 2026

The owner approved **one 14-day free trial per first-time school authority**. Default self-service signup uses Stripe Checkout, **requires a payment method before starting the trial**, and begins **automatic monthly or annual billing after the trial**, at the existing fixed GST/HST-inclusive per-active-bus tariff (CA$1.99 monthly / CA$20.29 annual). A school authority whose Stripe billing history or protected SafeBus billing record shows a prior trial/subscription does not receive another trial.

The owner separately approved an **invoice/purchase-order alternative when a platform administrator authorizes it**. This is not an unrestricted no-card option. The authenticated school-authority tenant admin must request invoice terms, supply a business billing contact and Canadian billing address, and confirm the approved recurring contract. The active SafeBus platform super-admin must separately approve the particular request and choose an invoice payment term (14, 30, 45 or 60 days) under a recent MFA-authenticated session. **Approval alone does not create a subscription or invoice.** The tenant admin explicitly activates it afterward. For a first-time tenant, the same single 14-day trial applies; an invoice is then issued for manual payment rather than charging a card. If not trial eligible, an initial invoice can be issued immediately on confirmed activation. The corresponding monthly/annual invoices recur until canceled.

The selected invoice term is a **per-request approval**, not a blanket net-30 promise; 30 days is the suggested form default and is not final unless a platform admin selects and approves it. PO reference may be absent for invoice-only public-authority arrangements. The signed customer Order Form must specify collection method, billing email, PO/reference where applicable, due days, trial end and renewal/cancellation. Existing subscriptions, historical invoices and issued customer agreements are preserved.

The implementation uses the existing production Supabase tenant billing/role checks, agreement acceptance gate, server-side subscription projection and redacted audit events. An authorized platform review is stored as a scoped Stripe Customer metadata record (linked to the tenant and a unique request ID); only a separately approved request can create a `send_invoice` subscription, with a deterministic idempotency key and provider-history duplicate prevention. Never accept invoice activation from frontend claims or a mutable choice in client storage. Existing legacy `send_invoice` subscriptions cannot be silently changed through this new mechanism. New approved invoice subscribers may cancel/resume renewal through a separately authenticated tenant action. No customer billing action, real invoice, mail, account creation or trial was executed to test this implementation.
