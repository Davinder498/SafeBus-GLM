import type { ReactNode } from 'react';
import { AlertTriangle, CreditCard } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { formatBillingDate, formatMoney } from '@/services/subscriptionService';
import type { TenantSubscription } from '@/types/subscription';

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-4 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-8">
      <dt className="text-sm leading-6 text-slate-600">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium leading-6 text-slate-900">
        {value}
      </dd>
    </div>
  );
}

function statusTone(status: TenantSubscription['subscriptionStatus']) {
  if (status === 'active' || status === 'trialing') return 'success' as const;
  if (status === 'past_due' || status === 'paused' || status === 'incomplete') {
    return 'warning' as const;
  }
  if (status === 'unpaid' || status === 'canceled' || status === 'incomplete_expired') {
    return 'danger' as const;
  }
  return 'neutral' as const;
}

export function SubscriptionOverview({
  subscription,
  action,
}: {
  subscription: TenantSubscription;
  action?: ReactNode;
}) {
  if (subscription.subscriptionExempt)
    return (
      <Card className="border-success-200 bg-success-50 p-5" data-testid="subscription-exempt">
        <h2 className="text-lg font-bold text-success-900">
          Test school authority · no subscription required
        </h2>
        <p className="mt-2 text-sm leading-6 text-success-900">
          This school authority has approved testing access. You can configure and activate buses
          without checkout, a payment method, or a trial.
        </p>
      </Card>
    );
  if (!subscription.configured) {
    return (
      <Card className="p-5" data-testid="subscription-not-configured">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Subscription not configured</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Choose a subscription to configure buses. Existing transportation operations continue.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const status = subscription.subscriptionStatus ?? 'unknown';
  return (
    <div className="space-y-5">
      {subscription.billingWarning && (
        <Card className="border-warning-200 bg-warning-50 p-4" data-testid="billing-warning">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-700" aria-hidden />
            <div>
              <p className="font-semibold text-warning-800">Billing review required</p>
              <p className="mt-1 text-sm text-warning-700">
                Review the subscription or active-bus allowance. Billing status never automatically
                suspends transportation operations.
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5 shadow-none sm:p-6" data-testid="subscription-summary">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900">Subscription</h2>
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill tone={statusTone(subscription.subscriptionStatus)} dot>
              {status.replaceAll('_', ' ')}
            </StatusPill>
            {action}
          </div>
        </div>

        <dl className="mt-4 divide-y divide-slate-200">
          <Detail
            label="Plan"
            value={subscription.priceNickname ?? subscription.productName ?? 'SafeBus subscription'}
          />
          <Detail
            label="Billing cycle"
            value={subscription.billingInterval === 'month' ? 'Monthly' : 'Annual'}
          />
          <Detail
            label="Plan subtotal before discounts and tax"
            value={formatMoney(
              subscription.periodTotal ?? subscription.annualTotal,
              subscription.currency,
            )}
          />
          <Detail
            label={subscription.billingInterval === 'month' ? 'Per bus / month' : 'Per bus / year'}
            value={formatMoney(subscription.unitAmount, subscription.currency)}
          />
          <Detail
            label="Payment terms"
            value={
              subscription.collectionMethod === 'charge_automatically'
                ? 'Automatic payment'
                : subscription.daysUntilDue
                  ? `Invoice due in ${subscription.daysUntilDue} days`
                  : 'Not available'
            }
          />
          <Detail
            label="Current term starts"
            value={formatBillingDate(subscription.currentPeriodStart)}
          />
          <Detail
            label={subscription.cancelAtPeriodEnd ? 'Access through' : 'Renews'}
            value={formatBillingDate(subscription.currentPeriodEnd)}
          />
          <Detail label="Trial ends" value={formatBillingDate(subscription.trialEnd)} />
          <Detail label="Billing email" value={subscription.billingEmail ?? 'Not available'} />
          <Detail
            label="Purchase order"
            value={subscription.purchaseOrderReference ?? 'Not provided'}
          />
          <Detail
            label="Latest invoice"
            value={subscription.latestInvoiceStatus?.replaceAll('_', ' ') ?? 'Not available'}
          />
          <Detail label="Contracted buses" value={String(subscription.licensedBusCount ?? 0)} />
          <Detail label="Active buses" value={String(subscription.activeBusCount)} />
        </dl>
        {subscription.usageExceedsAllowance && (
          <p className="mt-3 text-sm font-semibold text-warning-700">
            Active usage exceeds the contracted allowance. No automatic charge was made.
          </p>
        )}
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Last updated: {formatBillingDate(subscription.lastSyncedAt)}
        </p>
      </Card>
    </div>
  );
}
