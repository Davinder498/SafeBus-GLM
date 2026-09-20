import {
  clean,
  createServerClients,
  createStripeClient,
  json,
  retrieveCanonicalSubscription,
  safeProviderErrorCode,
  serverConfig,
  syncSubscriptionProjection,
} from './billing-shared.mjs';

const SUPPORTED_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.updated',
  'invoice.finalized',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.voided',
]);

function signatureHeader(event) {
  return event.headers?.['stripe-signature'] || event.headers?.['Stripe-Signature'] || '';
}

function invoiceSubscriptionId(invoice) {
  const value = invoice?.subscription ?? invoice?.parent?.subscription_details?.subscription;
  return typeof value === 'string' ? value : (value?.id ?? null);
}

async function subscriptionForEvent(stripe, stripeEvent) {
  const object = stripeEvent.data.object;
  if (stripeEvent.type.startsWith('customer.subscription.')) {
    return retrieveCanonicalSubscription(stripe, object.id);
  }
  if (stripeEvent.type.startsWith('invoice.')) {
    const subscriptionId = invoiceSubscriptionId(object);
    return subscriptionId ? retrieveCanonicalSubscription(stripe, subscriptionId) : null;
  }
  if (stripeEvent.type === 'customer.updated') {
    const subscriptions = await stripe.subscriptions.list({
      customer: object.id,
      status: 'all',
      limit: 10,
      expand: ['data.customer', 'data.items.data.price.product', 'data.latest_invoice'],
    });
    return (
      subscriptions.data.find((subscription) => subscription.status !== 'canceled') ??
      subscriptions.data[0] ??
      null
    );
  }
  return null;
}

export async function handler(event) {
  let admin = null;
  let eventId = null;
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
    const config = serverConfig();
    if (!config.stripeWebhookSecret) {
      return json(503, { error: 'Webhook processing is not configured.' });
    }

    const stripe = createStripeClient();
    let stripeEvent;
    try {
      stripeEvent = stripe.webhooks.constructEvent(
        event.body || '',
        signatureHeader(event),
        config.stripeWebhookSecret,
      );
    } catch {
      return json(400, { error: 'Invalid webhook signature.' });
    }

    if (!SUPPORTED_EVENTS.has(stripeEvent.type)) return json(200, { received: true });
    eventId = stripeEvent.id;
    ({ admin } = createServerClients());
    const objectId = clean(stripeEvent.data?.object?.id) || null;
    const { data: shouldProcess, error: receiptError } = await admin.rpc(
      'billing_begin_webhook_event',
      {
        p_event_id: stripeEvent.id,
        p_event_type: stripeEvent.type,
        p_object_id: objectId,
        p_event_created_at: new Date(stripeEvent.created * 1000).toISOString(),
      },
    );
    if (receiptError) throw new Error('billing_webhook_receipt_failed');
    if (!shouldProcess) return json(200, { received: true, duplicate: true });

    const subscription = await subscriptionForEvent(stripe, stripeEvent);
    if (!subscription) {
      await admin.rpc('billing_complete_webhook_event', {
        p_event_id: stripeEvent.id,
        p_status: 'ignored',
        p_error_code: null,
      });
      return json(200, { received: true, ignored: true });
    }

    try {
      await syncSubscriptionProjection(
        admin,
        stripe,
        subscription,
        new Date(stripeEvent.created * 1000).toISOString(),
      );
    } catch (error) {
      const code = safeProviderErrorCode(error);
      if (code === 'billing_product_not_approved' || code === 'billing_tenant_mapping_missing') {
        await admin.rpc('billing_complete_webhook_event', {
          p_event_id: stripeEvent.id,
          p_status: 'ignored',
          p_error_code: code,
        });
        return json(200, { received: true, ignored: true });
      }
      throw error;
    }

    const completion = await admin.rpc('billing_complete_webhook_event', {
      p_event_id: stripeEvent.id,
      p_status: 'completed',
      p_error_code: null,
    });
    if (completion.error) throw new Error('billing_webhook_completion_failed');
    return json(200, { received: true });
  } catch (error) {
    const code = safeProviderErrorCode(error);
    if (admin && eventId) {
      await admin
        .rpc('billing_complete_webhook_event', {
          p_event_id: eventId,
          p_status: 'failed',
          p_error_code: code,
        })
        .catch(() => undefined);
    }
    console.error(JSON.stringify({ event: 'stripe_webhook_failed', errorCode: code }));
    return json(500, { error: 'Webhook processing failed.' });
  }
}
