
# Approved invoice and purchase-order billing — SafeBus CR1 acceptance

**Status:** business policy approved November 9, 2026; engineering implementation pending merged CI, Netlify deployment and controlled provider acceptance. The live Stripe configuration already has the final tax-inclusive prices. No real invoice/subscription was created to test the new workflow.

## Source of truth and functional paths

- `tenant-subscriptions.mjs`: default Stripe Checkout flow; first-time school authority gets a one-time 14-day trial, payment method is required, then recurring monthly/annual automatic card payments. Existing customer subscription history and the protected used-trial marker prevent repeat trial offers.
- `invoice-billing.mjs`: an **exception**, not a competing unauthenticated way around checkout. The authenticated district `tenant_admin` requests invoice billing, including final price ID and current bus quantity, business billing contact and Canadian billing location (used for Stripe Tax), with an optional purchase-order reference. The separate authenticated `platform_super_admin` reviews and affirmatively approves the exact request (MFA and recent authentication required). No invoice, trial or customer subscription is created by request or approval.
- Only the district administrator can then `activate` the approved plan. The server re-verifies the Stripe customer, approved request identity, exact approved price and tenant, bus quantity, prior subscription history, incomplete Checkout sessions, and executed MSA/DPA. For first-time districts only, create a 14-day trial via Stripe Billing and invoice at its end using `send_invoice`; otherwise the first invoice can be issued immediately. The platform picks the invoice due window from 14, 30, 45, or 60 days; no implicit universal net-30.
- Separate `cancel_renewal` and `resume_renewal` controls for the authorized district, scoped to a tagged SafeBus invoice agreement and existing subscription. Future renewal stops/resumes only when Stripe confirms it; an outstanding issued invoice is still due. Old legacy invoice contracts are never silently converted or modified by the new path.

## Security and privacy

Stripe Customer metadata is the durable provider-side request/approval record, keyed to SafeBus tenant UUID and opaque request UUID. Supabase retains private customer mapping, subscription projection and audited administrative actions. This avoids a new Postgres migration and uses existing protected service-only RPCs. Userland forms cannot grant approval: server authorization, MFA, source tenant and provider state are rechecked for each mutation. Signed customer address, PO and billing email stay with Stripe and private billing records; no child/guardian/driver data is requested, and logs contain only masked provider codes. Old checkout and new invoice starts are mutually exclusive while an existing financial subscription or an open Checkout is present; deterministic provider idempotency and provider-history recovery prevent duplicate subscriptions on retries.

## Functional verification scenarios

1. New district without executed MSA/DPA: request, approval and activation deny before Stripe writes.
2. District admin with executed agreement: request pending with billing location, email, approved price/quantity and optional PO; no invoice created.
3. Platform administrator: inspect only selected district, confirm terms/days, explicitly approve or reject; tenant cannot approve itself and no charge is created by approval.
4. Tenant admin: activate only an approved request, check one 14-day trial and ensuing manual invoice, correct GST/HST-inclusive price, due window and PO on provider records.
5. Previously trialed district: no new trial; first invoice can be issued immediately under the approved collection contract.
6. Missing/wrong price, changed tenant ID, old request ID, inactive tenant, insufficient bus quantity, no MFA, existing card subscription or pending checkout: fail closed.
7. Provider timeout after subscription creation: return retryable failure without claiming success; on retry retrieve and reconcile exactly the same provider subscription, not another one.
8. New approved invoice subscription: district may schedule or resume renewal through its account-security/MFA gate. Legacy invoice contracts remain separate.
9. Confirm real Stripe-generated invoices and actual email delivery in an authorized non-live environment; synthetic Playwright and Vitest don't prove external delivery.
10. At customer activation, verify actual billing authorization and private customer documents; never use production data as QA fixtures.

## Business boundaries

The owner approved the two fixed CAD GST/HST-inclusive rates, 14-day first-customer trial, default payment collection and invoice/PO exception. District-specific approval, due-day selection and confirmed order acceptance remain per-customer actions. Insurance, service-level promises, supplier privacy sign-off, final physical Android testing, tax registration effective-date reconciliation, and commercial launch authorization are **not** granted by a passing test or by this document.

## Deployed audit-event compatibility

The connected production audit table has a fixed event-action allowlist. This implementation uses existing allowed actions `billing.subscription_updated` for invoice request/approval/rejection metadata transitions (with a sanitized `invoiceArrangement` detail), `billing.subscription_created` for the confirmed new provider subscription, and `billing.cancellation_scheduled` / `billing.renewal_resumed` for invoice renewal changes. No new audit action labels, public grants or audit-table migration is required. No PO, billing address or contact email is placed in audit detail.
