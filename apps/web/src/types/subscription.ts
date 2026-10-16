export type SubscriptionStatus =
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

export interface TenantSubscription {
  configured: boolean;
  tenantId: string;
  tenantName: string;
  tenantType: string;
  tenantStatus: string;
  productName: string | null;
  priceNickname: string | null;
  priceId: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  licensedBusCount: number | null;
  activeBusCount: number;
  usageExceedsAllowance: boolean;
  currency: string | null;
  unitAmount: number | null;
  annualTotal: number | null;
  billingInterval: 'month' | 'year';
  periodTotal: number | null;
  collectionMethod: string | null;
  trialEligible: boolean;
  pendingPayment: boolean;
  pendingChange: { quantity: number; priceId: string; effectiveAt: string } | null;
  busAccess: BusSubscriptionAccess;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  canceledAt: string | null;
  billingEmail: string | null;
  purchaseOrderReference: string | null;
  daysUntilDue: number | null;
  latestInvoiceStatus: string | null;
  latestInvoiceDueAt: string | null;
  lastSyncedAt: string | null;
  billingWarning: boolean;
}

export interface PlatformBillingSummary {
  tenantId: string;
  configured: boolean;
  status: SubscriptionStatus | null;
  licensedBusCount: number | null;
  activeBusCount: number;
  currentPeriodEnd: string | null;
  trialEnd?: string | null;
  warning: boolean;
}

export interface SubscriptionPrice {
  id: string;
  name: string;
  currency: string;
  unitAmount: number;
  interval: 'month' | 'year';
}

export interface BusSubscriptionAccess {
  eligible: boolean;
  limit: number | null;
  active: number;
}

export interface BillingPreview {
  timing: 'immediate' | 'renewal' | 'unchanged';
  dueNow: number;
  currency?: string;
  effectiveAt: number | null;
}

export type PlatformSubscriptionAction = 'reconcile';
