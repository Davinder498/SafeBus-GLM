# Tenant subscriptions: protected release runbook

SafeBus offers tenant-managed CAD monthly or annual per-active-bus subscriptions through Stripe
Checkout. New tenants receive one 14-day trial with a payment method collected. Existing invoice
contracts remain unchanged. Stripe owns financial state; SafeBus stores a private access projection.

Invoice downloads, native Stripe email setup, and payment/email acceptance checks
are documented in [subscription-invoice-delivery.md](subscription-invoice-delivery.md).

Official origin: `https://safebus.kids`. Seller: **Sachman Gold Inc., an Alberta
corporation doing business as SafeBus** (owner confirmed 2026-10-16). The connected
Stripe account in the earlier setup evidence was a sandbox. On 2026-10-23 the owner
confirmed a live account and reported Stripe setup complete; live payment and email
acceptance remain unverified. This feature does not create prices, configure tax,
or activate payments. See [historical account setup evidence](official-domain-setup.md)
and the invoice delivery runbook for current acceptance steps.

## Before commercial activation

1. Obtain finance/customer approval for monthly and annual prices, GST/tax behavior, exemptions,
   renewal/trial disclosures, cancellation wording, and privacy notice. This milestone does not
   enable automatic tax, create live prices, purchase a subscription, or approve launch.
2. Configure one approved SafeBus product with active `CAD`, `licensed`, fixed unit prices using
   `month` or `year`, each with an interval count of one. Configure Stripe's trial disclosures and
   reminder emails under the approved customer communication policy.
3. Keep the hosted portal limited to invoices, billing contact, and payment details. Disable its
   subscription update and cancellation capabilities: SafeBus handles these with capacity checks,
   reviewed previews, and renewal scheduling. Do not enable adjustable checkout quantities.
4. Keep server configuration in the existing server-only environment variables documented in
   `apps/web/.env.example`. Frontend configuration still uses only the Supabase URL and anon key.
5. Register the signed webhook for:
   - `checkout.session.completed`, `async_payment_succeeded`, `async_payment_failed`, `expired`;
   - `customer.subscription.created`, `updated`, `deleted`, `pending_update_applied`, `pending_update_expired`;
   - `customer.updated`;
   - `invoice.finalized`, `paid`, `payment_failed`, `voided`;
   - `subscription_schedule.updated`, `completed`, `released`, `canceled`.
6. Review the reconciliation evidence in `docs/qa/tenant-subscription-reconciliation-2026-10-16.md`.
   Review the pending subscription migration, its checksum, and current recovery evidence through the protected workflow.
   Rehearse approved schema changes inside one bounded rollback-only transaction before any
   persistent release. Do not replay all migrations, reset databases, or run hosted fixture writers.

## Acceptance before release

- Run the four repository checks and the onboarding/billing browser tests with mocked external
  services. SQL tests use an embedded PostgreSQL process with synthetic records and no network.
- Use an explicitly authorized Stripe non-live environment for real-provider acceptance before
  activation: trial start/end, card authentication, failed upgrades, payment recovery, cancellation,
  renewed schedules, and webhook retry/order behavior. Keep its data out of the production database.
- Confirm one tenant cannot read another tenant's subscription or alter its checkout ownership.
- Confirm platform admins can reconcile, but cannot purchase or change a tenant's subscription.
- Confirm the allowance applies to all bus creation/activation paths, not only visible controls.
- New insertions (even inactive buses) require a current eligible subscription. Only active buses
  consume capacity. A scheduled reduction reserves its lower allowance until removed or effective.
- Paid upgrades use pending updates and unlock capacity after payment. Trial quantity increases
  preserve the original end date. Reductions and billing-cycle changes apply at renewal.
- Existing transport operations and bus maintenance continue when billing is delinquent. Tenant
  suspension remains independent. No bus is automatically deactivated and no record is deleted.

## Recovery and support

- Browser redirect success alone never unlocks capacity. The return page waits for provider
  reconciliation and offers **Refresh billing** if confirmation is delayed.
- A financial request retains its idempotency key across retries and reloads. An uncertain outcome
  fences further financial changes for that tenant; the original administrator uses **Retry previous
  billing request**. The pending request can be recovered from the server after browser storage loss.
- The lease lasts two minutes to cover bounded provider calls. Do not substitute a new request ID
  for an uncertain operation. If the original administrator is unavailable, escalate for reviewed
  provider reconciliation; do not clear the fence or create a replacement subscription blindly.
- **Remove scheduled change** releases the schedule without canceling current service. Canceling
  renewal removes a future plan change and ends renewal at the current trial/paid period end.
- Failed or stale-processing webhook receipts are retryable; signed events use the stored customer
  mapping, not user-supplied metadata, to determine tenant ownership.
- **Sync from Stripe** remains available to platform administrators. Never manually edit private
  subscription projections or put provider payloads, invoice links, emails, secrets, or payment
  details into logs or review evidence.

Production migration application, deployment, and final merge require the existing protected
release workflow and human approval. This PR performs none of those actions.


## November 9 approved tariff and live Stripe verification

The SafeBus owner approved **CA$1.99/active bus/month** and **CA$20.29/active bus/year**, **including applicable GST/HST**. On the live SafeBus Stripe account, existing Price IDs `price_1URbJ3JayDoqdBIzNBcBJyNj` and `price_1URbJ3JayDoqdBIzCTnaHtFq` were changed from unspecified tax behavior to `tax_behavior=inclusive`, and verified by fresh GET requests. Both remain active and associated with the same SafeBus Subscription product. The existing active subscription still references the same monthly Price ID. No subscriptions or historical invoices were modified.

**Production safeguarding:** application code only allows the approved prices and inclusive behavior for new tenant selections and catalog creations. The same approved price object is reused instead of creating a duplicate, and the last active price for each approved interval cannot be archived via platform management. Server-side price validation, not editable UI text, is authoritative. Publish approved pricing through the already-existing catalog; do not create or migrate subscriptions merely to reconcile prices.

Automatic tax on the existing active subscription was enabled at the time of inspection; future finalized invoices may show an inclusive tax component within the CA$1.99 gross, according to customer location and taxability. Taxes must not be added *above* the approved gross price. Never infer that the historical November 7 paid invoice contained GST/HST. Stripe's registration effective 2026-10-23 differs from the owner-reported CRA November 8 date; separately reconcile with the private CRA document before filing/adjustment. A signed customer's Order Form, final applicable tax evidence, and approved commercial/insurance/supplier terms remain required.


## November 9 finalized first-customer trial and approved invoice/PO implementation

**Authoritative implementation:** `apps/web/netlify/functions/tenant-subscriptions.mjs` remains the default card Checkout path: verified tenant-admin session with recent MFA, executed MSA/DPA gate, price/quantity and bus scope validation, one 14-day trial only if `billing_find_customer.trial_used` is false **and** Stripe has no prior subscription, `payment_method_collection=always`, automatic tax for the final inclusive price, and automatic subsequent billing. Payment/Trial start must be confirmed from Stripe webhooks/projection, not from browser redirect.

**Separate school-authority invoice or PO exception:** `apps/web/netlify/functions/invoice-billing.mjs` handles server-authorized, audited `request`, `status`, `review`, `activate`, `cancel_renewal` and `resume_renewal`. The tenant-admin request captures the chosen price, bus allowance, business billing email, Canadian business address and optional PO number. The platform-super-admin with recent MFA separately approves a specific request and selects **14/30/45/60 invoice days**; approval never starts billing. The district tenant admin later confirms activation. Only this approved route may create `collection_method=send_invoice`, `automatic_tax.enabled=true`, per-active-bus licensed pricing, and if eligible `trial_period_days=14` with `missing_payment_method=create_invoice`. If the account already had a subscription/trial, omit the trial and make the first invoice due as configured. The approved PO number is preserved in Stripe customer/subscription metadata and the existing private billing account/projection; no student or guardian fields are involved.

**Audit and failure recovery:** Tenant/provider customer mapping is source-scoped; Stripe customer metadata records an approval's tenant, request ID, price, quantity, PO, review actor and timestamp. Public clients cannot approve their own request, access another tenant's billing or mutate Stripe directly. Before activation, the server rechecks the exact approved price, customer address, active district, executed agreement, current bus allowance, approval actor, pending Stripe Checkout sessions and subscription history. Deterministic subscription idempotency and canonical provider subscription lookup stop duplicate creation after retries. Customer and subscription changes are also written to the restricted server audit trail. Existing untagged legacy invoice contracts are explicitly excluded from new renewal actions. Errors and logs mask billing addresses and contact details.

**Acceptance, not claimed here:** CI test fixtures are synthetic; we did **not** issue real invoices, charge or migrate real subscriptions, send real emails, or change Stripe registration dates. A non-live Stripe end-to-end review of trial expiry, invoice generation, PDF and recipient delivery is required before a real district uses this route, plus evidence of customer order acceptance. Actual provider billing email setup must be checked; creating a `send_invoice` subscription does not by itself prove the recipient received an invoice. The physical Android testing phase remains separately deferred.
