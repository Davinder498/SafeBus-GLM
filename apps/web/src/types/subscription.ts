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
  subscriptionExempt?: boolean;
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
  subscriptionExempt?: boolean;
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
  exempt?: boolean;
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

export type CatalogMutation =
  | { action: 'create_price'; name: string; unitAmount: number; interval: 'month' | 'year' }
  | { action: 'set_price_active' | 'set_discount_active'; id: string; active: boolean }
  | {
      action: 'create_discount';
      name: string;
      code: string;
      kind: 'percent' | 'amount';
      value: number;
      duration: 'once' | 'forever';
      maxRedemptions: number | null;
      expiresAt: number | null;
    };

export interface PricingCatalog {
  prices: Array<SubscriptionPrice & { active: boolean }>;
  discounts: Array<{
    id: string;
    name: string;
    code: string;
    active: boolean;
    percentOff: number | null;
    amountOff: number | null;
    currency: string | null;
    duration: string;
    timesRedeemed: number;
    maxRedemptions: number | null;
    expiresAt: number | null;
  }>;
  priceCursor: string | null;
  discountCursor: string | null;
}
export interface PendingCatalogRequest {
  requestId: string;
  body: CatalogMutation;
}
