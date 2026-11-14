# Billing-risk manual review

Owner policy: refunds, disputes and early fraud warnings require manual review;
bus service remains active. This handler never changes subscriptions, entitlement,
customer balances, refunds or dispute responses.

## Implementation and review surface

The existing signed Stripe webhook records the event in the private webhook
receipt table before notifying `info@safebus.kids`. The alert contains only the
validated event ID, an allowlisted event type, and live/test mode. Customer names,
amounts, card details, student information and event metadata are not emailed.

The restricted Stripe Dashboard is the review surface. Open the event in
Workbench, retrieve the current payment/refund/dispute and response deadline,
and verify the canonical Stripe customer against the school authority's stored
customer ID. Do not infer school authority identity from webhook metadata.
Record the event ID, reviewer, decision and follow-up in the restricted operations
record. A completed webhook receipt means the email provider accepted the alert;
it does not mean someone reviewed the incident or received the email.

## Retry and failure behaviour

Signature failure occurs before database access or email. Completed receipts
suppress duplicate deliveries. A failed database write or email returns a
retryable failure; the existing receipt mechanism permits retry. Email body and
provider idempotency key stay stable for the same event. Provider idempotency is
limited to its retention window: a prolonged outage after successful email but
before database completion may produce another alert. Review by event ID rather
than treating repeat alerts as separate incidents. Out-of-order events are
reviewed against current Stripe state; they cannot regress subscription access.

Preview deployments refuse email. No test events, charges, refunds or customer
notifications are sent as part of automated verification.

## Rollout — not yet complete

1. Merge passing code and publish through the protected engineering release.
2. Verify the production function has existing operations email configuration.
3. Add these event types to the existing Stripe webhook, preserving all existing
   subscriptions: refund.created, refund.updated, refund.failed,
   charge.dispute.created, charge.dispute.updated, charge.dispute.closed,
   radar.early_fraud_warning.created, radar.early_fraud_warning.updated.
4. Validate in an authorized Stripe sandbox and verify operations mailbox receipt.
   Only the live Stripe account is currently connected; local mocked tests do not
   satisfy sandbox or mailbox acceptance.
5. Review historical risk events separately: subscribing affects future delivery
   and does not replay earlier events. Do not synthesize financial actions in live.

This replaces a proposed custom billing-incident dashboard with manual review in
Stripe. It avoids copying financial details into another application and needs
no new database grants or schema changes. Billing closure remains open until
provider configuration, sandbox replay and mailbox evidence are verified.
