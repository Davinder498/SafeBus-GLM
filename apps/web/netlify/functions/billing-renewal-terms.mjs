// Standard owner-approved renewal/cancellation policy, 2026-11-09.
// Monthly service is month-to-month, annual service is a 12-month term.
// Cancellation stops the NEXT renewal, never terminates a paid period early,
// issues a refund, or prorates a paid subscription.
export function scheduledRenewalChange(action) {
  if (!['cancel', 'keep', 'cancel_renewal', 'resume_renewal'].includes(action)) {
    throw new Error('billing_invalid_renewal_action');
  }
  return {
    cancel_at_period_end: action === 'cancel' || action === 'cancel_renewal',
    proration_behavior: 'none',
  };
}
