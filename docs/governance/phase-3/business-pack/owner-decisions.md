# Owner Decisions Before Signing or Publication

**Status:** Decision worksheet; only expressly recorded owner choices are resolved
**Prepared:** 2026-10-13; owner inputs reconciled 2026-11-05

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
reported no GST/HST registration and undecided pricing; re-confirm current tax
status and pricing before execution. No staffed coverage, postal address, registration-document verification,
signing authority, liability amount or publication approval is inferred.

| Input                                                            | Draft treatment                                                                               | Required decision/evidence                                                                                                                |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Provider legal name / public name                                | Sachman Gold Inc., doing business as SafeBus; owner-confirmed 2026-10-15                      | Registration documents and signing authority still require verification before execution                                                  |
| `[PROVIDER_BUSINESS_ADDRESS]`                                    | Unfilled                                                                                      | Business mailing address                                                                                                                  |
| Privacy and support email; `[NOTICE_EMAIL]`                      | info@safebus.kids for privacy/support; formal legal-notice election pending                   | Support coverage and backup routing; decide the formal contract-notice address separately                                                 |
| `[PRIVACY_LEAD]`                                                 | Business owner; expressly selected on 2026-10-15                                              | Appointment decision recorded; training, resourcing, coverage and backup still required                                                   |
| `[PRIVACY_BACKUP]`                                               | Unresolved                                                                                    | Capable backup and routing evidence; personal details outside Git                                                                         |
| `[EFFECTIVE_DATE]`, `[PUBLIC_POLICY_URL]`, `[DELETION_URL]`      | No effective or publication date                                                              | Approved wording, working public HTTPS pages and contact paths                                                                            |
| `[CUSTOMER_LEGAL_NAME]`, customer privacy contacts and signatory | Unfilled                                                                                      | Customer onboarding inputs; not needed to write the business drafts                                                                       |
| `[PRICE_PER_BUS_CAD]`, `[BILLING_INTERVAL_MONTH_OR_YEAR]`, `[CONTRACTED_BUS_COUNT]` | Live Stripe and SafeBus UI support monthly and annual CAD per-active-bus licensing | Approve each commercial price, billing interval, definition of billable active/reserve/replacement bus and allowance; existing Stripe catalog is not an owner price decision                                     |
| Tax registration, `[APPLICABLE_TAXES]`, exemptions               | Earlier owner report (Oct 16) said no GST/HST registration. Live Stripe Tax currently shows active settings and one Canadian registration entry; **this is not CRA registration evidence** | Reconfirm CRA legal registration, effective date, taxable supply/associated-person threshold analysis, tax collection authority, price tax behavior and invoices before commercial activation                                                           |
| Collection method, invoice/payment period                        | Stripe self-service supports automatic payment; legacy invoice contracts remain separate; net 30 is proposed only for accepted `send_invoice` terms | Approve customer payment method and invoice terms; do not offer net 30 if card is charged automatically                                                                |
| Trial, service term and renewal                                  | Current new-tenant Checkout has a 14-day trial default; 12-month service term is only proposed, and monthly/annual billing intervals are available | Approve eligibility, first recurring charge, initial service/pilot term, auto-renewal election, cancellation route, notice periods and Stripe implementation; do not treat trial as an approved free pilot                                                          |
| Bus-count changes/proration                                      | Written change order before billing change                                                    | Define effective date, approved credit/debit method and evidence of customer authorization                                                |
| Non-payment                                                      | Written escalation; no automated operational suspension                                       | Approved suspension notice/process; billing state never automatically disables a tenant                                                   |
| `[GENERAL_LIABILITY_CAP]`, `[PRIVACY_LIABILITY_CAP]`             | No selected amounts                                                                           | Owner risk/insurance review, customer negotiation and legal review of exclusions                                                          |
| Insurance                                                        | No certification or policy assertion                                                          | Required types/limits, policy evidence and contractual representations                                                                    |
| Support hours, timezone and holidays                             | Monday–Friday, 8 a.m.–5 p.m. Alberta local time (America/Edmonton); owner-selected 2026-11-05 | Owner handles support and backup escalation; holiday/urgent mechanics and owner-absence coverage remain open; no 24/7 promise             |
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

## Owner declaration — GST/HST registration (November 7, 2026)

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
