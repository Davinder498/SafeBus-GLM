# SafeBus — First Paid Invoice and Tax-Collection Reconciliation

**Observation date:** 2026-11-07 (UTC)  
**Review:** Live Stripe account read-only observations and deployed Checkout source  
**Status:** **PAYMENT OBSERVED; TAX/CUSTOMER CONTRACT ACCEPTANCE NOT APPROVED**  
**Release base:** `97455f61a01ba945eaba3dbc74402f26d397914a` (PR #402 merged)

## Verified live Stripe records

The connected **SafeBus** Stripe account was queried in **livemode** using read-only invoice and invoice-payment operations. The response contained two invoices:

| Invoice event (UTC) | Outcome | Total | Paid | Collection method | `automatic_tax.enabled` |
| --- | --- | ---: | ---: | --- | --- |
| 2026-10-24 03:02:35 | Paid, zero-value trial invoice | CAD 0.00 | CAD 0.00 | `charge_automatically` | `false` |
| 2026-11-07 03:03:00 | **Paid, first nonzero subscription-cycle invoice** | **CAD 1.99** | **CAD 1.99** | `charge_automatically` | **`false`** |

The nonzero invoice's payment list returned **one `paid` invoice-payment record**, backed by a `payment_intent`, for CAD 1.99 (record creation 2026-11-07 04:04:10 UTC). This verifies one successful nonzero provider payment and that the invoice is marked paid. It **does not** establish that the customer received a paid receipt, that funds settled to the merchant's bank, that tax treatment was correct, or that the customer gave commercial launch consent. No customer names, invoice IDs, payment intent IDs or card details appear in this report.

## Tax configuration mismatch requires finance review

The same connected live account previously returned:

- Stripe Tax settings `status=active`; default tax behaviour `inferred_by_currency`.
- One **active Canadian tax registration entry** in Stripe.
- Published monthly and annual prices `CAD 1.99` and `CAD 20.29`, both with `tax_behavior=unspecified`.

The actual nonzero subscription invoice has `automatic_tax.enabled=false`, with no tax added: the invoice subtotal and total were both CAD 1.99. Code inspection of `apps/web/netlify/functions/tenant-subscriptions.mjs` shows that the Checkout session request does **not** explicitly include `automatic_tax`. Stripe documents that new subscriptions created through **Checkout** use the account's Checkout Tax default configuration; account-level active Tax settings or registration **do not automatically guarantee that this particular subscription calculates tax**. An explicit `automatic_tax` setting or approved Checkout default must be verified. Refer to [Stripe subscription automatic-tax defaults](https://docs.stripe.com/tax/subscriptions/automatic-tax-default).

**Do not infer a legally required GST/HST amount from these facts.** The owner earlier indicated that Sachman Gold Inc. was not registered for GST/HST; the active Stripe registration entry now conflicts with that history. An administrative Stripe setting is not evidence of a CRA-assigned account number or effective registration date. Actual registration, small-supplier and related-person rules, taxable status, invoice date and any required correction must be determined from the corporation's private tax records and appropriate finance advice. Do not put CRA numbers, invoices or private customer data into this repository.

### Before further paid customer activation

1. Business owner confirms Sachman Gold Inc.'s actual CRA GST/HST registration status, effective date, account holder and invoice requirements **outside Git**.
2. Finance reconciles the Stripe Canadian registration entry with that evidence, including whether the payment's tax outcome is correct. If incorrect, decide a documented compliant correction for the **already finalized invoice**, without silently altering history.
3. Review both existing and new subscription tax configurations, including Checkout tax defaults, customer tax location, selected price tax behavior, authorized tax collection and `automatic_tax` for future invoices. Approve a code/configuration change only if actually needed after the legal determination.
4. Separately verify customer recipient delivery of the **paid** Stripe invoice/receipt and correct invoice PDF, plus bank settlement if acceptance requires it. The prior zero-dollar trial invoice does not satisfy this paid-delivery check.
5. Explicitly accept the commercial price, the contract terms in the signed Order Form and the customer-facing 14-day trial disclosures; no live catalog price becomes approved by observation.

## Boundaries and review outcome

This observation used **read-only** Stripe API calls and source inspection. No refund, invoice update, tax adjustment, new sale, live test payment, subscription mutation, vendor key change, database change, RLS change or deployment occurred.

The nonzero **payment-reconciliation evidence is verified**; **billing tax/receipt/commercial readiness are not approved**. The protected `privacy-readiness.json`, `operations-readiness.json` and `map-readiness.json` are unchanged and remain closed pending separate acceptance. General commercial launch is **NOT APPROVED**. Preserve legal/customer records in restricted storage and refer to them by non-secret evidence identifiers only.

## Owner GST/HST status clarification — November 7, 2026

The business owner confirmed on November 7, 2026: **Sachman Gold Inc. is not currently GST/HST-registered, and intends to register later**. No CRA number, certificate, business address or private return was disclosed or entered here.

This owner declaration is a current status input, not an independent CRA-account verification or a conclusion that registration is never mandatory. For most businesses, CRA's ordinary small-supplier threshold is **CAD 30,000** in worldwide taxable revenues (including applicable associated persons), assessed within a calendar quarter or over the previous four consecutive quarters. When registration becomes mandatory depends on the specific threshold pattern, effective date, and supply facts. See [CRA: When to register for and start charging GST/HST](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html).

**Immediate reconciliation:** live Stripe Tax has an **active Canadian registration entry even though the owner says the corporation is not currently CRA-registered**. Do not interpret that Stripe entry as legal registration. Before using Stripe Tax to collect any tax, the owner must verify whether any mandatory registration obligation already exists and decide, with appropriate finance review, how to correct the Stripe entry. The first observed CAD 1.99 paid invoice had `automatic_tax.enabled=false` and no GST/HST; its tax treatment is not certified by this review. Do not change that finalized invoice without a documented determination.

**At future actual CRA registration:** record the effective date privately; reconcile the Stripe registration start/end dates and Canadian jurisdiction; approve the applicable tax collection and invoice disclosure; test Stripe Checkout/default `automatic_tax` behavior and existing subscription changes, using an authorized sandbox and customer notices where needed; then verify the first compliant post-registration live invoice. Stripe's existing `tax.registration` cannot simply be deleted: Stripe describes an `expires_at` mechanism for ending its active status. Any registration mutation is a financial configuration change requiring express owner authorization. [Stripe API: Update a registration](https://docs.stripe.com/api/tax/registrations/update).

**Status:** owner declaration recorded; **tax supplier configuration and legal billing acceptance remain unapproved**. No Stripe configuration or customer invoice was changed.
