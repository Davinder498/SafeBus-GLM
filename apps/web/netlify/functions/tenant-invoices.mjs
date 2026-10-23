import {
  asIsoTimestamp,
  clean,
  createStripeClient,
  getInternalBillingState,
  json,
  requireBillingCaller,
  safeProviderErrorCode,
} from './billing-shared.mjs';

const INVOICE_ID = /^in_[A-Za-z0-9]+$/;
const FINAL_STATUSES = new Set(['open', 'paid', 'void', 'uncollectible']);
const PAGE_SIZE = 20;

function customerId(invoice) {
  return typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
}

function subscriptionId(invoice) {
  const subscription = invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
  return typeof subscription === 'string' ? subscription : subscription?.id;
}

// These are private bearer links. Only accept Stripe's invoice hosts, return them
// to the authenticated tenant, and never persist or log them in SafeBus.
export function safeInvoiceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      ['invoice.stripe.com', 'pay.stripe.com'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      !url.port
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function invoiceSummary(invoice) {
  return {
    id: invoice.id,
    number: clean(invoice.number) || null,
    status: invoice.status,
    currency: invoice.currency,
    total: invoice.total,
    amountPaid: invoice.amount_paid,
    amountRemaining: invoice.amount_remaining,
    issuedAt: asIsoTimestamp(invoice.status_transitions?.finalized_at ?? invoice.created),
    paidAt: asIsoTimestamp(invoice.status_transitions?.paid_at),
    dueAt: asIsoTimestamp(invoice.due_date),
    pdfUrl: safeInvoiceUrl(invoice.invoice_pdf),
    hostedUrl: safeInvoiceUrl(invoice.hosted_invoice_url),
  };
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
    if ((event.body?.length ?? 0) > 1024) return json(400, { error: 'Invalid invoice request.' });
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return json(400, { error: 'Invalid invoice request.' });
    }
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => key !== 'startingAfter') ||
      (body.startingAfter !== undefined &&
        (typeof body.startingAfter !== 'string' ||
          body.startingAfter.length > 255 ||
          !INVOICE_ID.test(body.startingAfter)))
    ) {
      return json(400, { error: 'Invalid invoice request.' });
    }

    const ctx = await requireBillingCaller(event, ['tenant_admin'], {
      recentAuth: false,
      rateLimitAction: 'billing_read',
      rateLimitMax: 60,
    });
    if (ctx.error) return ctx.error;
    if (!ctx.caller.tenant_id) return json(403, { error: 'School authority assignment required.' });

    const state = await getInternalBillingState(ctx.admin, ctx.caller.tenant_id);
    const customer = state.external_customer_id;
    if (!customer) return json(200, { invoices: [], nextCursor: null });

    const stripe = createStripeClient();
    if (body.startingAfter) {
      // A cursor is an invoice ID too. Never pass another customer's ID through
      // to the provider's list API or reveal whether that invoice exists.
      let cursor;
      try {
        cursor = await stripe.invoices.retrieve(body.startingAfter);
      } catch (error) {
        if (error?.code !== 'resource_missing') throw error;
      }
      if (!cursor || customerId(cursor) !== customer)
        return json(400, { error: 'This invoice page is unavailable. Refresh invoices.' });
    }
    const page = await stripe.invoices.list({
      customer,
      limit: PAGE_SIZE,
      ...(body.startingAfter ? { starting_after: body.startingAfter } : {}),
    });
    const invoices = page.data
      .filter(
        (invoice) =>
          customerId(invoice) === customer &&
          subscriptionId(invoice) &&
          FINAL_STATUSES.has(invoice.status),
      )
      .map(invoiceSummary);
    return json(200, {
      invoices,
      nextCursor: page.has_more ? (page.data.at(-1)?.id ?? null) : null,
    });
  } catch (error) {
    console.error(
      JSON.stringify({ event: 'tenant_invoices_failed', errorCode: safeProviderErrorCode(error) }),
    );
    return json(502, { error: 'Invoices are temporarily unavailable. Try again.' });
  }
}
