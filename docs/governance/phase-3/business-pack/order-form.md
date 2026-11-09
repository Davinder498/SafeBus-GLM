# SafeBus Order Form — Draft for Customer Adaptation

**Status:** Unfilled; not a purchase authorization or signature record

| Item                                                              | Agreed value to insert outside the public repository                                                                                                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider legal name, business form, address and authorized signer | Sachman Gold Inc. (SafeBus trade name, owner-reported); `[PROVIDER_BUSINESS_ADDRESS]` privately completed only if necessary in restricted signed document; `[PROVIDER_SIGNATORY]` |
| Customer legal name, public-body status, address and signer       | `[CUSTOMER_LEGAL_NAME]`; `[CUSTOMER_AUTHORITY_EVIDENCE]`; `[CUSTOMER_SIGNATORY]`                                                                                                                                             |
| Order/version and executed schedules                              | `[ORDER_ID]`; exact MSA/DPA/Security/SLA/AUP/Return versions                                                                                                                                                                 |
| Contract and service-start dates                                  | `[EFFECTIVE_DATE]`; `[SERVICE_START_DATE]` after acceptance                                                                                                                                                                  |
| Service term and pilot dates                                     | `[SERVICE_START_DATE]`; **monthly month-to-month or annual 12-month standard term**, each with automatic renewal unless canceled. Any separately approved pilot period and written activation must be recorded; no unapproved pilot extension                                                                                                                                                    |
| Authorized tenants, schools, participants and transport geography | Restricted scope reference; CR1 Alberta public-authority boundary                                                                                                                                                            |
| Licensed buses and definition                                     | `[CONTRACTED_BUS_COUNT]`; active/reserve/replacement billing rule; pilot total never above 100                                                                                                                               |
| Billing interval and per-bus price | `[BILLING_INTERVAL_MONTH_OR_YEAR]`: **CA$1.99 per active bus/month** or **CA$20.29 per active bus/year**, each **including applicable GST/HST** (owner approved 2026-11-09). The customer selects one interval and its contracted billable active-bus count; any discount or customer-specific rate deviation requires separate written approval. |
| Trial and first recurring charge                                  | `[TRIAL_ELIGIBILITY_DAYS_END]`, `[FIRST_CHARGE_DATE]`, authorized payment method and accepted trial-expiry/cancellation disclosures; explicitly `none` for contracts without a trial                                           |
| Taxes and exemption evidence | `[APPLICABLE_TAXES]`: owner-reported CRA GST/HST registration effective 2026-11-08, subject to private verification; the applicable GST/HST is included within a subsequently approved customer-facing price, not added above it. Record applicable jurisdiction, rate, tax amount, documented exemption and reconciled Stripe settings before contract execution. |
| Included subscription setup assistance                            | SafeBus helps the Customer configure routes/maps, stops, buses, students, guardians/links, drivers and assignments; agree the help and coordination needed. Record any authorized access/data transfer and responsibilities. |
| Separately agreed additional services                             | Additional work beyond included setup assistance requires an agreed scope and price, or expressly none. No separate mandatory fee for included setup assistance.                                                             |
| Collection method, invoice contact/PO and due date                 | `[CHARGE_AUTOMATICALLY_OR_SEND_INVOICE]`; payment-method authorization if automatic; invoice contact/PO and proposed net 30 only if expressly accepted for invoice collection                                                                                                                                                         |
| Count changes and proration                                       | Written approval; effective dates and agreed credit/debit calculation                                                                                                                                                        |
| Renewal election and cancellation route                           | **Automatic monthly renewal** for month-to-month plans or **automatic 12-month renewal** for annual plans. The Customer can cancel at any time, effective at the end of its trial or paid period; cancel before trial end to avoid the first charge                                                                                                                       |
| Termination/convenience exit                                      | **No early cancellation fee. No partial refund** of paid subscription periods solely due to cancellation unless legally required or expressly agreed. Already-issued invoice/PO obligations remain due. Other breach/termination rights remain under the MSA                                                                                                                                                          |
| General and privacy liability caps                                | `[GENERAL_LIABILITY_CAP]`; `[PRIVACY_LIABILITY_CAP]`; exclusions/insurance                                                                                                                                                   |
| Claims allocation                                                 | Negotiated IP/data instruction defence/indemnity terms or explicit agreed treatment                                                                                                                                          |
| Supported devices and service targets                             | Completed SLA, supported-device list and tested capacity envelope                                                                                                                                                            |
| Support, privacy, incident and formal-notice contacts | info@safebus.kids selected for service/privacy/formal notices; Mon–Fri 08:00–17:00 Alberta; customer contact and backup escalation to be completed privately |
| Permitted data/instructions and supplier countries                | Completed DPA processing appendix and approved supplier disclosure                                                                                                                                                           |
| Retention, backup and exit windows                                | Accepted schedules and tested mechanisms; holds and restore handling                                                                                                                                                         |
| Customer PIA/notice decision                                      | Authority, sign-off/submission assessment, participant notices and BYOD arrangements                                                                                                                                         |
| Acceptance/activation conditions                                  | Applicable security, privacy, Android, maps, operations and customer-activation gates; recovery drills excluded                                                                                                              |

For the finalized online standard offering, the complete published Order Form
is incorporated in the single MSA/DPA acceptance by the authenticated
school-authority tenant administrator, who explicitly affirms authority to
bind the Customer. Record the exact version, tenant account, signer's identity,
consent, acceptance time and receipt privately. The published offering is
the Provider's offer and needs no separate countersignature in this standard
workflow. A district's separate procurement requirements must still be met.
Do not publish private mailing details or any agreement until actual price, tax, trial, contract term, renewal,
liability and supplier positions have been approved and completed. This
public template contains no real customer personal data or signatures.
Payment does not replace explicit acceptance or launch requirements.


## Owner-approved default trial and invoice/PO exception — November 9, 2026

SafeBus's standard payment policy is one **14-day free trial** for a first-time school authority, with a payment method collected during Stripe Checkout and automatic charging for the approved **CA$1.99/month** or **CA$20.29/year per active bus** tariff after the trial. The selected price includes applicable GST/HST. The trial begins only after the Stripe subscription is confirmed; existing subscribers and previously used trials do not receive another one.

A school authority may instead request **invoice or purchase-order billing**, subject to a **separate affirmative SafeBus platform-admin approval**. The Order Form must record the authority-approved billing email, bill-to business address, applicable PO reference (if issued), chosen monthly/annual interval, quantity and explicit invoice due window of **14, 30, 45 or 60 days**. The selected invoice due days apply **after issuance**. Under an approved invoice arrangement, a first-time customer can use the same one 14-day trial **without a card**; Stripe `send_invoice` produces a manual-pay invoice after trial expiry. Previously trialed subscribers receive no second trial, and the first invoice may be issued upon explicit tenant-admin activation. Approval itself neither starts the trial nor creates the invoice; tenant-admin confirmation is required. Monthly/annual recurring invoices follow until renewal is canceled according to the executed terms. Existing issued invoices remain payable after cancellation.

The fixed standard rates are owner-approved; **this template remains unsigned and unpublished** pending final customer-specific order acceptance and the rest of the contract package. No customer PO, district signing authority or support/insurance representation is invented.


## Approved standard renewal/cancellation terms — November 9, 2026

**Monthly:** month-to-month term, renewed automatically each month.
**Annual:** a 12-month term, renewed automatically for successive 12-month
terms. The school authority may cancel renewal at any time without an early
cancellation penalty. Cancellation ends the subscription at the end of the
current 14-day trial or paid term; canceling before trial expiry avoids the
first subscription charge. Already-paid months/years are not partially
refunded solely because of cancellation, except where required by law or
expressly agreed in writing. An issued, unpaid invoice remains payable
under its approved invoice/PO arrangement.

The customer-specific accepted Order Form still records the exact interval,
active-bus count, start/end dates, first charge, any approved procurement
exception and actual authority; it is not executed by this draft.
