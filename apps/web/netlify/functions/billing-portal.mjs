import {
  createStripeClient,
  getInternalBillingState,
  json,
  requireBillingCaller,
  validatePortalOrigin,
  writeBillingAudit,
} from './billing-shared.mjs';

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });

    const ctx = await requireBillingCaller(event, ['tenant_admin'], {
      recentAuth: false,
      rateLimitAction: 'billing_portal',
      rateLimitMax: 10,
    });
    if (ctx.error) return ctx.error;
    if (!ctx.caller.tenant_id) return json(403, { error: 'Tenant assignment required.' });

    const origin = validatePortalOrigin(ctx.config.appOrigin);
    if (!origin || !ctx.config.stripePortalConfigurationId) {
      return json(503, { error: 'The billing portal is not configured.' });
    }

    const state = await getInternalBillingState(ctx.admin, ctx.caller.tenant_id);
    if (!state.external_customer_id) {
      return json(409, { error: 'A subscription has not been configured for this tenant.' });
    }

    const stripe = createStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: state.external_customer_id,
      configuration: ctx.config.stripePortalConfigurationId,
      return_url: `${origin}/admin/settings/billing`,
    });
    await writeBillingAudit(
      ctx.admin,
      ctx.caller.id,
      'billing.portal_opened',
      ctx.caller.tenant_id,
    );
    return json(200, { url: session.url });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'billing_portal_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError',
      }),
    );
    return json(502, { error: 'The billing portal could not be opened. Try again.' });
  }
}
