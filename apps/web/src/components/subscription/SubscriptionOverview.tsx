import { AlertTriangle, Bus, CalendarDays, CreditCard } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import { formatBillingDate, formatMoney } from '@/services/subscriptionService';
import type { TenantSubscription } from '@/types/subscription';

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</dt>
      <dd className="mt-2 break-words text-sm font-semibold text-slate-900">{value}</dd>
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

export function SubscriptionOverview({ subscription }: { subscription: TenantSubscription }) {
  if (!subscription.configured) {
    return (
      <Card className="p-5" data-testid="subscription-not-configured">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" aria-hidden />
          <div>
            <h2 className="text-lg font-bold text-slate-900">Subscription not configured</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              No annual SafeBus contract has been connected to this tenant. Operational access is
              not affected.
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

      <Card className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-navy-600">Annual subscription</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {subscription.priceNickname ?? subscription.productName ?? 'SafeBus annual plan'}
            </h2>
          </div>
          <StatusPill tone={statusTone(subscription.subscriptionStatus)} dot>
            {status.replaceAll('_', ' ')}
          </StatusPill>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Detail
            label="Annual total"
            value={formatMoney(subscription.annualTotal, subscription.currency)}
          />
          <Detail
            label="Per bus / year"
            value={formatMoney(subscription.unitAmount, subscription.currency)}
          />
          <Detail
            label="Payment terms"
            value={
              subscription.daysUntilDue
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
        </dl>
      </Card>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <Bus className="h-5 w-5 text-navy-600" aria-hidden />
            <h2 className="text-lg font-bold text-slate-900">Fleet allowance</h2>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4">
            <Detail label="Contracted buses" value={String(subscription.licensedBusCount ?? 0)} />
            <Detail label="Active buses" value={String(subscription.activeBusCount)} />
          </dl>
          {subscription.usageExceedsAllowance && (
            <p className="mt-3 text-sm font-semibold text-warning-700">
              Active usage exceeds the contracted allowance. No automatic charge was made.
            </p>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-navy-600" aria-hidden />
            <h2 className="text-lg font-bold text-slate-900">Synchronization</h2>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Stripe is the billing source of truth. SafeBus stores only this display summary and no
            card or bank details.
          </p>
          <p className="mt-3 text-sm font-semibold text-slate-900">
            Last updated: {formatBillingDate(subscription.lastSyncedAt)}
          </p>
        </Card>
      </section>
    </div>
  );
}
