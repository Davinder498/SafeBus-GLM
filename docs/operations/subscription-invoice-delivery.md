# Subscription invoices and delivery

Stripe Billing is the invoice system of record. SafeBus uses subscription-mode
Checkout: Stripe generates the invoice, assigns its number, computes the final
discounts and configured taxes, records payment, and hosts the PDF. Do not create
a second invoice when `checkout.session.completed`, `invoice.paid`, or a webhook
retry arrives. A free trial, payment redirect, or pending bank payment is not proof
that money was received.

## What SafeBus provides

- **Settings → Subscription & billing → Invoice history** lists finalized
  subscription invoices for the authenticated school authority's mapped Stripe customer.
  It includes earlier subscriptions and canceled contracts, with pagination.
- Administrators can open the hosted invoice and download the Stripe PDF. Paid,
  open, voided, and uncollectible invoices retain their actual Stripe status.
  Drafts and unrelated standalone invoices are not presented as final documents.
- Invoice history refreshes when the subscription is reconciled. **Refresh
  invoices** requests the latest records and document links from Stripe
  independently of subscription changes; it does not extend a link's expiry.
- The existing **Invoices & payment details** button opens the customer-specific
  Stripe portal. It is the place to update the billing email and payment method.
- Checkout collects the customer's business billing name/address in Stripe.
  SafeBus does not store that address, card details, invoice PDFs, or private
  document links. Invoice requests are school authority admin only, require MFA and a valid
  active session, are rate limited, and return `Cache-Control: no-store`.

## Required Stripe configuration before enabling customer delivery

These are merchant-account settings, not frontend environment variables. This
code change cannot enable them through the Stripe invoice API. Configure and
verify them in the intended Stripe sandbox first, then separately in live mode
through the approved release process. Until that verification is complete,
automatic invoice email delivery is **not operationally accepted**.

On 2026-10-23 the owner confirmed that SafeBus uses a live Stripe account and
reported the settings complete. This records the owner's setup report; a live
payment, webhook reconciliation, PDF download, and email receipt still need
end-to-end verification. Sandbox identifiers in older evidence must not be used
as live configuration values.

1. In Stripe **Settings → Business → Public details / Branding**, confirm the
   seller is **Sachman Gold Inc., doing business as SafeBus**, with the approved
   business address, support email, and text-only SafeBus branding. Complete the
   invoice template with the legal business details and registration numbers
   required by finance. Never invent a GST/HST number or enable tax collection
   without the seller's confirmed registration and approved tax treatment.
2. In **Settings → Customer emails**, enable **Successful payments**. This is
   Stripe's native post-payment receipt delivery for subscription payments; the
   message includes access to the invoice/receipt and downloadable PDF. An email
   containing a secure PDF link satisfies delivery; this implementation does not
   promise a PDF attachment. Confirm the actual template and links in acceptance.
3. In **Settings → Billing → Subscriptions and emails**, configure finalized
   invoice emails for any approved `send_invoice` / purchase-order contracts,
   along with approved trial reminders, failed-payment messages, and retry rules.
   An invoice requesting payment and a receipt confirming payment are distinct.
   Avoid enabling a separate Resend invoice sender: two systems sending the same
   financial message would create confusing duplicates.
4. On the portal configuration referenced by `STRIPE_PORTAL_CONFIGURATION_ID`,
   enable **Invoice history**, **Payment methods**, and **Customer information**,
   allowing at least email, name, and billing-address updates. Keep subscription
   updates and cancellations disabled, as SafeBus's own flows enforce fleet
   allowance and renewal rules. Keep the return URL on `https://safebus.kids`.
5. Confirm the Stripe customer's email is the intended accounts-payable contact.
   New self-service customers start with the purchasing administrator's email.
   Use the billing portal to change it when accounts payable uses a different
   address. A future email change does not rewrite old finalized invoices or
   establish that previously issued emails were delivered to the new address.
6. Preserve the signed webhook subscriptions in
   [stripe-subscription-release.md](stripe-subscription-release.md), including
   `invoice.finalized`, `invoice.paid`, `invoice.payment_failed`, and
   `invoice.voided`. Configure webhook failure alerts in Stripe. Do not use the
   Checkout success redirect as the payment signal.

Dashboard navigation names can vary by Stripe account. Use the setting names
above if the sidebar layout changes. There are no new SafeBus environment
variables or database migrations for this feature.

## Acceptance in an explicitly approved Stripe sandbox

Use only synthetic organizations and an authorized test mailbox. Do not charge
real cards, write QA data into the production database, or send customer emails
as part of automated repository tests. Stripe sandbox/test automatic-email
behavior differs from live mode; use the Dashboard's test/preview/send controls
as supported and verify the account's delivery settings separately for live mode.

| Scenario                                     | Required evidence                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First paid subscription                      | One Stripe invoice; correct legal seller, buyer, invoice number, currency, quantity, total, discounts and approved tax; paid PDF downloadable in SafeBus; intended mailbox receives the Stripe message and can open/download its document.                                                                                            |
| Trial start                                  | No paid-payment claim or fake email-delivery confirmation; any zero-value invoice retains its actual Stripe status. Stripe may not email zero-value receipts.                                                                                                                                                                         |
| Trial converts / recurring renewal           | New invoice and native payment email for that cycle without another checkout; existing invoices remain accessible. Use Stripe test clocks where supported.                                                                                                                                                                            |
| Paid quantity increase                       | Prorated invoice, correct paid total, native post-payment email; capacity unlocks only through the existing confirmed-payment flow.                                                                                                                                                                                                   |
| Payment fails or requires authentication     | No paid receipt; correct open/failure state; recovery link in the hosted invoice/portal. Once payment succeeds, invoice becomes paid and native receipt delivery applies.                                                                                                                                                             |
| Duplicate or out-of-order webhook            | Existing event receipt/reconciliation logic converges; no extra invoice or application-generated duplicate email.                                                                                                                                                                                                                     |
| Email changes                                | Future billing messages use the updated Stripe customer contact; verify `customer.updated` reconciliation and the displayed billing email.                                                                                                                                                                                            |
| Mail is missing or bounced                   | Inspect Stripe's customer/invoice payment timeline and email history where available; verify the address, spam folder, suppression/bounce information and merchant email settings. Use Stripe's supported manual receipt/invoice send controls after fixing the address. Never mark a message delivered based only on `invoice.paid`. |
| Refund / credit                              | Finance issues the appropriate refund/credit note through Stripe; preserve the original numbered invoice. Do not edit a paid invoice to simulate a refund.                                                                                                                                                                            |
| Another tenant / non-admin / revoked session | No access to the customer's invoice list or private PDF URLs.                                                                                                                                                                                                                                                                         |
| Old/expired PDF link or provider outage      | Refresh gets current links; the portal remains the alternate document path; the UI retains previously loaded records and allows retry without altering payment state.                                                                                                                                                                 |

Stripe is responsible for native email generation and delivery attempts. SafeBus
does not expose a per-invoice “email delivered” badge because a payment event does
not prove inbox delivery. Actual inbox placement cannot be guaranteed.

## Subscription model decision

The owner selected **per-bus licences, monthly or discounted annual billing** on
2026-10-23. Charge for the contracted active-bus allowance, not individual students,
parents, drivers, GPS pings, or daily fluctuations in usage. An inactive bus does
not consume the allowance; it does not automatically reduce an existing contract.

Keep the current rules: paid increases are prorated; reductions apply at renewal;
existing operations continue during billing recovery. An annual discount around
10–15% is a pricing proposal to evaluate against costs, not an approved rate. Set
the monthly/annual Stripe prices only after the owner approves exact CAD amounts
and tax handling. Offer annual purchase-order invoice terms only through reviewed
school-authority contracts. No price, trial duration, tax rate, or collection
method is changed by this implementation.
