# SafeBus commercial billing and contract alignment — 2026-11-07

**Status:** Contract drafts reconciled; customer terms, prices and tax authority remain **unapproved**.

## Live evidence inspected (read-only)

The connected live-mode Stripe **SafeBus** account returned one active `SafeBus Subscription` product. Two active, CAD, licensed recurring prices were observed:

| Interval | Unit amount | Source distinction |
| --- | ---: | --- |
| Monthly | CAD 1.99 per bus | Current live catalog; not an owner-approved selling price |
| Annual | CAD 20.29 per bus | Current live catalog; not an owner-approved selling price |

Both displayed prices have `tax_behavior=unspecified`. Stripe Tax settings returned `status=active` and `defaults.tax_behavior=inferred_by_currency`; its list of registrations returned one active entry for Canada. **Do not mistake this Stripe setting for a CRA registration certificate, effective date, tax collection authorization or a tax opinion.** The owner previously reported (October 16) not being registered. The discrepancy is material and must be resolved privately with the company's actual legal CRA/tax records before collecting tax or sending executed price terms.

The existing [billing runbook](../../../operations/stripe-subscription-release.md) and [live checkout evidence](../../../qa/live-onboarding-billing-reconciliation-2026-10-24.md) confirm that the application supports **monthly and annual** licensing and offers a **14-day trial** for eligible new self-service customers, collecting a payment method. The live checkout evidence verified trial setup, zero-dollar invoice, and signed webhook processing, but does **not** establish the first nonzero payment, charge/tax correctness, invoice email receipt, or approved commercial pricing.

The account was inspected through read-only Stripe operations. No price, tax, customer, subscription, invoice, or portal settings were modified.

## Reconciliation decisions

1. The existing MSA's annual-only model contradicted the monthly and annual price selection UI and Stripe catalog. The proposed agreement now allows either interval selected in the signed order; billing interval is independent of service term.
2. The 14-day free trial is an **implementation default**, not an authorized pilot entitlement or unconditional promotional promise. Eligibility, trial end, first charge, renewal and cancellation disclosures require express acceptance before customer authorization.
3. The former net-30 proposed payment language applies only to expressly accepted `send_invoice` orders. Automatic-payment Checkout must disclose card collection and charge terms and must not be represented as net-30.
4. The order form requires the customer-approved interval, per-bus unit price, trial terms, payment collection method, renewal and cancellation route, and authorized price/version.
5. The SLA credit/remedy draft must apply consistently to monthly and annual subscriptions; it remains unapproved and may not promise availability or 24/7 support without operating evidence.
6. Existing invoice contracts and customer pricing are not rewritten; the owner must authorize any new price, contract, collection or tax change.

## Required decisions before signed commercial contracts

| Gate | Present finding | Remaining action |
| --- | --- | --- |
| Identity and authority | Sachman Gold Inc. selected as legal operator; SafeBus as trade name | Verify corporation/DBA, mailing address, business signatory |
| Price | Live catalog shows CAD 1.99/month and CAD 20.29/year per bus | Owner approves or revises price before publishing or signing |
| Tax | Stripe Tax active with Canadian registration entry; old owner statement conflicts | Verify legal GST/HST registration, start date, applicable tax treatment and invoice display |
| Trial | Eligible new-tenant self-service flow advertises 14 days | Approve eligibility, duration, start/end, first charge and trial cancellation terms |
| Contract | Monthly/annual intervals and proposed 12-month term are separate | Accept service term, billing interval, cancellation and renewal |
| Collection | Automatic payment in Checkout; invoice contracts retained | Approve invoice terms, payment method and treatment of purchase orders |
| Insurance and liability | No accepted general/privacy caps or policy evidence | Owner/customer negotiate limits and coverage |
| Service commitments | No approved uptime/latency/response or remedy targets | Complete operations evidence and agree support hours, exclusions, remedies and risk allocation |
| First real paid cycle | Zero-dollar trial invoice and webhook acceptance previously observed | Separately approve and verify nonzero invoice/payment, tax, receipt and reconciliation when permissible |
| Customer authorization | Contract drafts and owner decisions exist | Obtain public-authority-specific instructions, supplier/privacy acceptance, and signatures |

**No launch authorization** follows from this file. `privacy-readiness.json`, `operations-readiness.json`, `map-readiness.json` and other release gates remain `not_approved`. The [privacy and supplier review in PR #401](../privacy-supplier-launch-review-2026-11-06.md) is a parallel, separate evidence workstream; this contract-reconciliation PR does not depend on its merge.

Do not put customer names, Stripe customer identifiers, account secrets, payment methods, contracts, tax registration documents or signatures in Git.
