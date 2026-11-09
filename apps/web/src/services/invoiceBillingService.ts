import { callBillingFunction } from './subscriptionService';

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
    'invoice-billing', { action: 'status', ...(tenantId ? { tenantId } : {}) },
  );
  return result.arrangement;
}

/** Sending a request does not create a subscription or send a real invoice. */
export async function requestInvoiceBilling(input: InvoiceBillingRequest): Promise<InvoiceBillingArrangement> {
  const result = await callBillingFunction<{ arrangement: InvoiceBillingArrangement }>(
    'invoice-billing', { action: 'request', requestId: crypto.randomUUID(), ...input },
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
    'invoice-billing', { action: 'review', tenantId, requestId, approve, daysUntilDue },
  );
  return result.arrangement;
}

/** Distinct, tenant-admin-authorized financial confirmation after platform approval. */
export async function activateInvoiceBilling(requestId: string): Promise<{
  status: 'activated'; subscriptionStatus: string; trialGranted: boolean;
}> {
  return callBillingFunction('invoice-billing', { action: 'activate', requestId });
}

/** Cancel or resume renewal of an already-approved invoice subscription. */
export async function manageInvoiceRenewal(
  cancel: boolean,
): Promise<{ ok: boolean; cancelAtPeriodEnd: boolean }> {
  return callBillingFunction('invoice-billing', {
    action: cancel ? 'cancel_renewal' : 'resume_renewal',
    requestId: crypto.randomUUID(),
  });
}
