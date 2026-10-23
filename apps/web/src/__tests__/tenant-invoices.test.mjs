import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../netlify/functions/billing-shared.mjs', async (importOriginal) => ({
  ...(await importOriginal()),
  createStripeClient: vi.fn(),
  getInternalBillingState: vi.fn(),
  requireBillingCaller: vi.fn(),
}));
const shared = await import('../../netlify/functions/billing-shared.mjs');
const { handler, safeInvoiceUrl } = await import('../../netlify/functions/tenant-invoices.mjs');
const tenant = '10000000-0000-4000-8000-000000000001';
const event = (body = {}) => ({ httpMethod: 'POST', body: JSON.stringify(body) });
const invoice = (extra = {}) => ({
  id: 'in_paid',
  customer: 'cus_own',
  parent: { subscription_details: { subscription: 'sub_current' } },
  status: 'paid',
  number: 'SB-2026-0001',
  currency: 'cad',
  total: 5250,
  amount_paid: 5250,
  amount_remaining: 0,
  created: 1790000000,
  status_transitions: { finalized_at: 1790000100, paid_at: 1790000200 },
  due_date: null,
  customer_email: 'private@example.test',
  invoice_pdf: 'https://pay.stripe.com/invoice/test/pdf',
  hosted_invoice_url: 'https://invoice.stripe.com/i/test',
  ...extra,
});
let ctx;
let stripe;
beforeEach(() => {
  vi.clearAllMocks();
  ctx = { caller: { tenant_id: tenant, id: 'actor' }, admin: {} };
  stripe = {
    invoices: {
      list: vi.fn().mockResolvedValue({ data: [invoice()], has_more: false }),
      retrieve: vi.fn().mockResolvedValue(invoice()),
    },
  };
  shared.requireBillingCaller.mockResolvedValue(ctx);
  shared.getInternalBillingState.mockResolvedValue({ external_customer_id: 'cus_own' });
  shared.createStripeClient.mockReturnValue(stripe);
});

describe('tenant invoice authorization and privacy', () => {
  it.each([401, 403, 429, 503])(
    'stops at a failed session/MFA/role/rate boundary (%i)',
    async (code) => {
      shared.requireBillingCaller.mockResolvedValue({
        error: shared.json(code, { error: 'Denied' }),
      });
      expect((await handler(event())).statusCode).toBe(code);
      expect(shared.getInternalBillingState).not.toHaveBeenCalled();
      expect(shared.createStripeClient).not.toHaveBeenCalled();
    },
  );

  it('requires a tenant administrator and derives the provider customer from their mapping', async () => {
    const result = await handler(event());
    expect(result.statusCode).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(shared.requireBillingCaller).toHaveBeenCalledWith(
      expect.anything(),
      ['tenant_admin'],
      expect.objectContaining({ recentAuth: false }),
    );
    expect(shared.getInternalBillingState).toHaveBeenCalledWith(ctx.admin, tenant);
    expect(stripe.invoices.list).toHaveBeenCalledWith({ customer: 'cus_own', limit: 20 });
    const payload = JSON.parse(result.body);
    expect(payload.invoices[0]).toMatchObject({
      number: 'SB-2026-0001',
      total: 5250,
      amountPaid: 5250,
    });
    expect(result.body).not.toContain('private@example.test');
    expect(result.body).not.toContain('cus_own');
    expect(result.body).not.toContain('sub_current');
  });

  it.each([
    { tenantId: tenant },
    { customer: 'cus_other' },
    { startingAfter: ['in_other'] },
    { startingAfter: 'not-an-invoice' },
    { startingAfter: null },
    [],
    null,
  ])('rejects forged ownership and malformed pagination: %j', async (body) => {
    expect((await handler(event(body))).statusCode).toBe(400);
    expect(shared.createStripeClient).not.toHaveBeenCalled();
  });

  it('rejects missing tenant assignments without provider access', async () => {
    ctx.caller.tenant_id = null;
    expect((await handler(event())).statusCode).toBe(403);
    expect(shared.getInternalBillingState).not.toHaveBeenCalled();
  });

  it('returns empty history before checkout creates a customer, without creating invoices', async () => {
    shared.getInternalBillingState.mockResolvedValue({ external_customer_id: null });
    expect(JSON.parse((await handler(event())).body)).toEqual({ invoices: [], nextCursor: null });
    expect(shared.createStripeClient).not.toHaveBeenCalled();
  });

  it('rejects foreign and nonexistent cursors with the same response', async () => {
    stripe.invoices.retrieve.mockResolvedValueOnce(invoice({ customer: 'cus_other' }));
    const foreign = await handler(event({ startingAfter: 'in_foreign' }));
    stripe.invoices.retrieve.mockRejectedValueOnce({ code: 'resource_missing' });
    const missing = await handler(event({ startingAfter: 'in_missing' }));
    expect(foreign.statusCode).toBe(400);
    expect(missing).toEqual(foreign);
    expect(stripe.invoices.list).not.toHaveBeenCalled();
  });

  it('filters foreign, draft and standalone invoices while retaining historical subscriptions', async () => {
    stripe.invoices.list.mockResolvedValue({
      data: [
        invoice(),
        invoice({ id: 'in_foreign', customer: { id: 'cus_other' } }),
        invoice({ id: 'in_draft', status: 'draft' }),
        invoice({ id: 'in_standalone', parent: null }),
        invoice({
          id: 'in_legacy',
          customer: { id: 'cus_own' },
          parent: null,
          subscription: 'sub_old',
          status: 'void',
        }),
      ],
      has_more: true,
    });
    const payload = JSON.parse((await handler(event())).body);
    expect(payload.invoices.map((i) => i.id)).toEqual(['in_paid', 'in_legacy']);
    expect(payload.nextCursor).toBe('in_legacy');
  });

  it('validates cursor ownership before pagination and keeps scanning past a filtered page', async () => {
    stripe.invoices.retrieve.mockResolvedValue(invoice({ id: 'in_before' }));
    stripe.invoices.list.mockResolvedValue({
      data: [invoice({ id: 'in_draft', status: 'draft' })],
      has_more: true,
    });
    const result = JSON.parse((await handler(event({ startingAfter: 'in_before' }))).body);
    expect(stripe.invoices.list).toHaveBeenCalledWith({
      customer: 'cus_own',
      limit: 20,
      starting_after: 'in_before',
    });
    expect(result).toEqual({ invoices: [], nextCursor: 'in_draft' });
  });

  it('keeps provider errors and private invoice links out of logs and error responses', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    stripe.invoices.list.mockRejectedValue(
      new Error('private@example.test https://invoice.stripe.com/i/private'),
    );
    const result = await handler(event());
    expect(result.statusCode).toBe(502);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|stripe\.com/);
    expect(result.body).not.toMatch(/private|stripe\.com/);
    log.mockRestore();
  });
});

describe('invoice document URL boundary', () => {
  it.each([
    'http://invoice.stripe.com/i/x',
    'https://invoice.stripe.com.evil.test/i/x',
    'https://evil.test/invoice',
    'https://user:pass@invoice.stripe.com/i/x',
    'https://invoice.stripe.com:444/i/x',
    'javascript:alert(1)',
    null,
    undefined,
  ])('rejects unsafe document URLs: %s', (url) => expect(safeInvoiceUrl(url)).toBeNull());

  it('only exposes Stripe-hosted HTTPS PDFs and invoice pages', () => {
    for (const url of ['https://pay.stripe.com/invoice/x/pdf', 'https://invoice.stripe.com/i/x'])
      expect(safeInvoiceUrl(url)).toBe(url);
  });
});
