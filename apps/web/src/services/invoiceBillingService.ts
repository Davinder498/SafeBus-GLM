import { callBillingFunction, queueInvoiceBilling } from './subscriptionService';

export interface InvoiceBillingArrangement {
  status: 'none' | 'pending' | 'approved' | 'rejected' | 'activated';
  requestId?: string | null;
  priceId?: string | null;
  quantity?: number | null;
  purchaseOrder?: string;
  billingEmail?: string;
  addressLine1?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  daysUntilDue?: number;
  approvedAt?: string | null;
}

export interface InvoiceBillingRequest {
  priceId: string;
  quantity: number;
  billingEmail: string;
  purchaseOrder: string;
  address: { line1: string; city: string; state: string; postalCode: string; country: 'CA' };
}

/** A tenant sees only its own invoice request; a platform admin supplies a tenant ID. */
export async function fetchInvoiceBillingArrangement(
  tenantId?: string,
): Promise<InvoiceBillingArrangement> {
  const result = await callBillingFunction<{ arrangement: InvoiceBillingArrangement }>(
    'invoice-billing',
    { action: 'status', ...(tenantId ? { tenantId } : {}) },
  );
  return result.arrangement;
}

/** Sending a request does not create a subscription or send a real invoice. */
export async function requestInvoiceBilling(
  tenantId: string,
  input: InvoiceBillingRequest,
): Promise<InvoiceBillingArrangement> {
  const result = await queueInvoiceBilling<{ ok: boolean; arrangement: InvoiceBillingArrangement }>(
    tenantId,
    { endpoint: 'invoice-billing', action: 'request', ...input },
  );
  return result.arrangement;
}

/** An active platform super-admin with recent MFA-authenticated session alone can approve. */
export async function reviewInvoiceBilling(
  tenantId: string,
  requestId: string,
  approve: boolean,
  daysUntilDue: number,
): Promise<InvoiceBillingArrangement> {
  const result = await callBillingFunction<{ arrangement: InvoiceBillingArrangement }>(
    'invoice-billing',
    { action: 'review', tenantId, requestId, approve, daysUntilDue },
  );
  return result.arrangement;
}

/** Distinct, tenant-admin-authorized financial confirmation after platform approval. */
export async function activateInvoiceBilling(
  tenantId: string,
  arrangementId: string,
): Promise<{
  status: 'activated';
  subscriptionStatus: string;
  trialGranted: boolean;
}> {
  return queueInvoiceBilling<{
    ok: boolean;
    status: 'activated';
    subscriptionStatus: string;
    trialGranted: boolean;
  }>(tenantId, { endpoint: 'invoice-billing', action: 'activate', arrangementId });
}

/** Cancel or resume renewal of an already-approved invoice subscription. */
export async function manageInvoiceRenewal(
  tenantId: string,
  cancel: boolean,
): Promise<{ ok: boolean; cancelAtPeriodEnd: boolean }> {
  return queueInvoiceBilling(tenantId, {
    endpoint: 'invoice-billing',
    action: cancel ? 'cancel_renewal' : 'resume_renewal',
  });
}
