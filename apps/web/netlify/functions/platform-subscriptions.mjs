import {
  UUID_PATTERN,
  clean,
  createStripeClient,
  getInternalBillingState,
  json,
  requireBillingCaller,
  retrieveCanonicalSubscription,
  safeProviderErrorCode,
  syncSubscriptionProjection,
  writeBillingAudit,
} from './billing-shared.mjs';
import { approvedPrices } from './tenant-subscriptions.mjs';

export function validateMutationInput(body) {
  const tenantId = clean(body?.tenantId).toLowerCase();
  if (body?.action !== 'reconcile' || !UUID_PATTERN.test(tenantId)) return null;
  return { action: 'reconcile', tenantId };
}

// Platform financial mutations are deliberately absent. Reconciliation observes
// canonical provider state and never purchases, cancels, or changes a contract.
export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Invalid request.' });
    }
    const ctx = await requireBillingCaller(event, ['platform_super_admin'], {
      recentAuth: body.action !== 'list_prices',
      rateLimitAction: 'billing_read',
      rateLimitMax: 20,
    });
    if (ctx.error) return ctx.error;
    if (!['list_prices', 'reconcile'].includes(body.action))
      return json(403, { error: 'Subscription changes are managed by the tenant administrator.' });
    const stripe = createStripeClient();
    if (body.action === 'list_prices')
      return json(200, { prices: await approvedPrices(stripe, ctx.config.stripeProductId) });
    const input = validateMutationInput(body);
    if (!input) return json(400, { error: 'A valid tenant is required.' });
    const state = await getInternalBillingState(ctx.admin, input.tenantId);
    if (!state.external_subscription_id)
      return json(409, { error: 'This tenant does not have a subscription yet.' });
    const subscription = await retrieveCanonicalSubscription(
      stripe,
      state.external_subscription_id,
    );
    const result = await syncSubscriptionProjection(ctx.admin, stripe, subscription);
    await writeBillingAudit(
      ctx.admin,
      ctx.caller.id,
      'billing.subscription_reconciled',
      input.tenantId,
    );
    return json(200, { ok: true, status: result.status });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'platform_subscription_failed',
        errorCode: safeProviderErrorCode(error),
      }),
    );
    return json(502, {
      error: 'The provider could not confirm the subscription. Try again shortly.',
    });
  }
}
