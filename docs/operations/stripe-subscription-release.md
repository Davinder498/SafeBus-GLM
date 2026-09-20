# Stripe subscription release runbook

SafeBus uses Stripe Billing for platform-managed annual, per-bus contracts. Stripe is the financial
source of truth. SafeBus stores only a display projection and never stores card or bank details.

## Before production

1. Obtain finance and legal approval for the CAD annual price, GST/tax behavior, exemption handling,
   invoice branding, payment terms, cancellation wording, and privacy notice.
2. In Stripe live mode, create one SafeBus product and one or more active recurring prices with:
   - currency `CAD`;
   - interval `year`;
   - usage type `licensed`;
   - per-bus unit amount approved by finance.
3. Configure a customer portal that permits billing-information, payment-method, and invoice access,
   but disables subscription changes and cancellation.
4. Register `/.netlify/functions/stripe-webhook` for only:
   - `customer.subscription.created`, `updated`, and `deleted`;
   - `customer.updated`;
   - `invoice.finalized`, `paid`, `payment_failed`, and `voided`.
5. Add the server-only Netlify variables listed in `apps/web/.env.example`. Confirm none are prefixed
   with `VITE_` and rotate the webhook signing secret after any suspected disclosure.
6. Review and approve the forward-only subscription migration through the protected production
   adoption/release workflow. Do not run it through local reset, Docker, or fixture tooling.

## Release and smoke verification

1. Apply the approved migration, deploy the web/function release, and confirm the webhook endpoint
   is healthy before creating a subscription.
2. As a platform super administrator with MFA and a recent sign-in, open a real tenant detail page,
   confirm the approved price list, and create a subscription only after contract approval.
3. Confirm Stripe created one customer and one subscription, then confirm SafeBus shows the same
   status, quantity, dates, amount, invoice terms, and billing contact.
4. As that tenant's `tenant_admin`, confirm `/admin/settings/billing` is read-only and the hosted portal
   exposes invoices/payment details without plan-change or cancellation controls.
5. Verify school, transportation, driver, and guardian roles cannot access billing routes or data.
6. Trigger a signed Stripe test event that has no SafeBus tenant mapping and confirm it is safely
   ignored without logging submitted billing values.

## Incidents and reconciliation

- Billing delinquency never changes `tenants.status`. Tenant suspension is a separate reviewed action.
- Use **Sync from Stripe** on the tenant detail page after a webhook outage or projection mismatch.
- Stripe webhook event IDs are deduplicated and failed events return a retryable response.
- Do not edit private projection tables. Correct Stripe first, then reconcile.
- Logs may include event names and safe error codes only. Do not log emails, invoices, provider
  payloads, payment details, secrets, or customer/subscription identifiers.
