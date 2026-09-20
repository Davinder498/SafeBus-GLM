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
  warning: boolean;
}

export interface SubscriptionPrice {
  id: string;
  name: string;
  currency: string;
  unitAmount: number;
  interval: 'year';
}

export interface SubscriptionContractInput {
  tenantId: string;
  priceId: string;
  billingEmail: string;
  licensedBusCount: number;
  purchaseOrderReference: string;
  daysUntilDue: number;
  trialEnd: string;
  autoRenew: boolean;
}

export type PlatformSubscriptionAction =
  'create' | 'update' | 'schedule_cancel' | 'resume' | 'reconcile';
