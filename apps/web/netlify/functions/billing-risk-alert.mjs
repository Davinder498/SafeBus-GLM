// Review stays in Stripe, where the canonical payment/customer and dispute deadline
// are available. Never infer district identity or change access from event metadata.
export const BILLING_RISK_EVENTS = new Set([
  'refund.created',
  'refund.updated',
  'refund.failed',
  'charge.dispute.created',
  'charge.dispute.updated',
  'charge.dispute.closed',
  'radar.early_fraud_warning.created',
  'radar.early_fraud_warning.updated',
]);

export async function sendBillingRiskAlert(event, { env = process.env, fetchImpl = fetch } = {}) {
  if (
    !BILLING_RISK_EVENTS.has(event?.type) ||
    !/^evt_[A-Za-z0-9]{1,200}$/.test(event?.id ?? '') ||
    typeof event?.livemode !== 'boolean'
  )
    throw new Error('billing_risk_event_invalid');
  if (env.CONTEXT !== 'production') throw new Error('billing_risk_production_required');
  const key = env.SAFEBUS_EMAIL_PROVIDER_API_KEY;
  const from = env.SAFEBUS_EMAIL_FROM;
  if (
    typeof key !== 'string' ||
    !key.trim() ||
    /[\r\n]/.test(key) ||
    typeof from !== 'string' ||
    !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)
  ) {
    throw new Error('billing_risk_alert_configuration_missing');
  }
  // Stable body and event key allow safe provider retries after a lost response.
  // The database receipt suppresses completed-event retries beyond provider TTL.
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'Idempotency-Key': `safebus-billing-risk-v1/${event.id}`,
    },
    body: JSON.stringify({
      from: `SafeBus operations <${from}>`,
      to: ['info@safebus.kids'],
      subject: 'SafeBus billing: manual review required',
      text: `A Stripe billing event needs manual review.\nEvent: ${event.id}\nType: ${event.type}\nMode: ${event.livemode ? 'live' : 'test'}\n\nOpen the SafeBus Stripe Dashboard and find this event in Workbench. Review the current payment, customer, refund or dispute and any response deadline. Confirm the school authority using its stored Stripe customer mapping; do not rely on event metadata alone. Record the review outcome in the restricted operations record.\n\nBus service and subscription access have not been changed by this event. Do not automatically refund, dispute, cancel or suspend service. A fraud warning is not a finding of fraud.`,
    }),
  });
  if (!response.ok) throw new Error('billing_risk_alert_failed');
  const result = await response.json();
  if (typeof result?.id !== 'string' || !result.id.trim())
    throw new Error('billing_risk_alert_failed');
  return { providerAccepted: true };
}
