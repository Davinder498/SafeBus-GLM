import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CreditCard, ExternalLink, ShieldCheck } from 'lucide-react';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { AdminSettingsNav } from '@/components/settings/AdminSettingsNav';
import { SubscriptionOverview } from '@/components/subscription/SubscriptionOverview';
import { InvoiceHistory } from '@/components/subscription/InvoiceHistory';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field } from '@/components/ui/Field';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  changeTenantBilling,
  createBillingPortalSession,
  fetchTenantPrices,
  fetchTenantSubscription,
  formatBillingDate,
  formatMoney,
  previewTenantChange,
  refreshTenantBilling,
  retryTenantBilling,
  recoverPendingTenantBilling,
  hasPendingTenantBilling,
} from '@/services/subscriptionService';
import type { BillingPreview, SubscriptionPrice, TenantSubscription } from '@/types/subscription';
import { useAuth } from '@/contexts/useAuth';

const inputClass =
  'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-3 text-base sm:text-sm';
export function AdminSubscriptionPage() {
  const { profile } = useAuth();
  const [params] = useSearchParams();
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [prices, setPrices] = useState<SubscriptionPrice[]>([]);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [priceId, setPriceId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    params.get('checkout') === 'canceled'
      ? 'Checkout canceled. Your selection is saved; you can return whenever you are ready.'
      : null,
  );
  const [processing, setProcessing] = useState(params.get('checkout') === 'success');
  const [preview, setPreview] = useState<BillingPreview | null>(null);
  const [confirm, setConfirm] = useState<'change' | 'cancel' | 'keep' | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const selectionKey = `safebus-billing-selection:${profile?.tenant_id}`;
  const load = useCallback(async () => {
    const data = await fetchTenantSubscription();
    setSubscription(data);
    return data;
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.allSettled([fetchTenantSubscription(), fetchTenantPrices()]).then((results) => {
      if (!active) return;
      if (results[0].status === 'fulfilled') {
        const s = results[0].value;
        setSubscription(s);
        let saved: { priceId?: string; quantity?: number; interval?: 'month' | 'year' } = {};
        try {
          saved = JSON.parse(sessionStorage.getItem(selectionKey) ?? '{}');
        } catch {
          /* Ignore malformed saved selection. */
        }
        const preferred = saved.interval ?? (s.configured ? s.billingInterval : 'month');
        const available = results[1].status === 'fulfilled' ? results[1].value : [];
        setInterval(
          available.length && !available.some((p) => p.interval === preferred)
            ? available[0].interval
            : preferred,
        );
        setPriceId(saved.priceId ?? s.priceId ?? '');
        setQuantity(saved.quantity ?? Math.max(1, s.licensedBusCount ?? s.activeBusCount));
      } else setError('Unable to load subscription details. Refresh and try again.');
      if (results[1].status === 'fulfilled') setPrices(results[1].value);
      else
        setPriceError(
          results[1].reason instanceof Error
            ? results[1].reason.message
            : 'Subscription options could not be loaded. Try again shortly.',
        );
      setLoading(false);
      if (results[0].status === 'fulfilled')
        void recoverPendingTenantBilling(results[0].value.tenantId)
          .then((pending) => {
            if (active && pending)
              setError(
                'A previous billing request is awaiting confirmation. Retry it before making another change.',
              );
          })
          .catch(() => undefined);
    });
    return () => {
      active = false;
    };
  }, [selectionKey]);
  useEffect(() => {
    if (!processing) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function poll() {
      try {
        await refreshTenantBilling();
        const s = await fetchTenantSubscription();
        if (!active) return;
        setSubscription(s);
        if (s.busAccess.eligible) {
          setProcessing(false);
          setMessage('Your subscription is ready. You can now configure your buses.');
          return;
        }
      } catch {
        /* Show a recoverable processing state; never infer payment from the redirect. */
      }
      if (!active) return;
      if (++attempts >= 10) {
        setProcessing(false);
        setMessage(
          'Payment confirmation is taking longer than usual. Refresh billing to check again.',
        );
        return;
      }
      timer = setTimeout(() => void poll(), 3000);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [processing]);
  const options = prices.filter((p) => p.interval === interval);
  const selected = options.find((p) => p.id === priceId) ?? options[0];
  const liveContract =
    subscription?.configured &&
    !['canceled', 'incomplete_expired'].includes(subscription.subscriptionStatus ?? '');
  const legacy = liveContract && subscription?.collectionMethod === 'send_invoice';
  async function reloadPrices() {
    setPricesLoading(true);
    try {
      const next = await fetchTenantPrices();
      setPrices(next);
      setPriceError(null);
      if (next.length && !next.some((p) => p.interval === interval)) {
        setInterval(next[0].interval);
        setPriceId('');
      }
    } catch (e) {
      setPriceError(
        e instanceof Error
          ? e.message
          : 'Subscription options could not be loaded. Try again shortly.',
      );
    } finally {
      setPricesLoading(false);
    }
  }
  function saveSelection(choice: {
    priceId?: string;
    quantity?: number;
    interval?: 'month' | 'year';
  }) {
    // Persist explicit form choices only. Subscription records stay in memory.
    try {
      const saved = JSON.parse(sessionStorage.getItem(selectionKey) ?? '{}');
      sessionStorage.setItem(selectionKey, JSON.stringify({ ...saved, ...choice }));
    } catch {
      // Storage may be unavailable; checkout remains usable.
    }
  }
  async function start() {
    if (!selected || !subscription) return;
    setBusy(true);
    setError(null);
    try {
      if (liveContract) {
        const p = await previewTenantChange(selected.id, quantity);
        setPreview(p);
        setConfirm('change');
      } else {
        const result = await changeTenantBilling(
          subscription.tenantId,
          'checkout',
          selected.id,
          quantity,
        );
        if (result.url?.startsWith('https://checkout.stripe.com/'))
          window.location.assign(result.url);
        else throw new Error('Checkout did not return a secure payment link.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to start checkout.');
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!confirm || !subscription) return;
    setBusy(true);
    setError(null);
    try {
      const result = await changeTenantBilling(
        subscription.tenantId,
        confirm,
        confirm === 'change' ? selected?.id : undefined,
        confirm === 'change' ? quantity : undefined,
      );
      setPaymentUrl(result.paymentUrl ?? null);
      setMessage(
        result.pendingPayment
          ? 'Complete the prorated payment to unlock your additional buses.'
          : confirm === 'cancel'
            ? 'Renewal canceled. Your current trial or paid term continues until its end date.'
            : confirm === 'keep'
              ? 'Automatic renewal resumed.'
              : 'Subscription change confirmed.',
      );
      setConfirm(null);
      await load();
      sessionStorage.removeItem(selectionKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The change was not confirmed.');
    } finally {
      setBusy(false);
    }
  }
  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      window.location.assign(await createBillingPortalSession());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to open billing.');
      setBusy(false);
    }
  }
  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Subscription & billing"
          description="Choose the right bus allowance for your school authority. Manage your plan, renewal, invoices, and payment details here."
          icon={<CreditCard className="h-6 w-6" />}
          action={
            subscription?.configured && !subscription.subscriptionExempt ? (
              <Button
                type="button"
                variant="secondary"
                loading={busy}
                onClick={() => void openPortal()}
                rightIcon={<ExternalLink className="h-4 w-4" />}
              >
                Invoices & payment details
              </Button>
            ) : undefined
          }
        />
        <AdminSettingsNav role={profile?.role} />
        {error && (
          <div className="space-y-3 rounded-lg bg-danger-50 p-4">
            <p role="alert" className="text-sm text-danger-700">
              {error}
            </p>
            {subscription && hasPendingTenantBilling(subscription.tenantId) && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void retryTenantBilling(subscription.tenantId)
                    .then(async (result) => {
                      if (result.url?.startsWith('https://checkout.stripe.com/'))
                        window.location.assign(result.url);
                      else {
                        setError(null);
                        setMessage('Previous billing request confirmed.');
                        await load();
                      }
                    })
                    .catch((e: unknown) =>
                      setError(e instanceof Error ? e.message : 'Unable to confirm request.'),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                Retry previous billing request
              </Button>
            )}
          </div>
        )}
        {message && (
          <p role="status" className="rounded-lg bg-navy-50 p-4 text-sm text-navy-800">
            {message}
          </p>
        )}
        {processing && (
          <DataState
            title="Confirming your subscription"
            message="Waiting for secure billing confirmation. Bus configuration unlocks as soon as your subscription is verified."
          />
        )}
        {loading && (
          <DataState
            title="Loading subscription"
            message="Checking your subscription and available billing options."
          />
        )}
        {!loading && subscription && (
          <>
            {subscription.busAccess.eligible && !subscription.subscriptionExempt && (
              <Card className="flex flex-col justify-between gap-4 border-success-200 bg-success-50 p-5 sm:flex-row sm:items-center">
                <div>
                  <p className="font-bold text-success-800">Your fleet is ready to grow</p>
                  <p className="mt-1 text-sm text-success-800">
                    {subscription.busAccess.active} of {subscription.busAccess.limit} active-bus
                    licences in use.
                  </p>
                </div>
                <Link className="font-semibold text-success-800 underline" to="/admin/buses">
                  Configure buses
                </Link>
              </Card>
            )}
            {!legacy && !subscription.subscriptionExempt && (
              <Card className="overflow-hidden">
                <div className="border-b bg-slate-50 p-5 sm:p-6">
                  <h2 className="text-xl font-bold text-navy-900">
                    {liveContract
                      ? 'Manage your bus allowance'
                      : subscription.trialEligible
                        ? 'Start your 14-day trial'
                        : 'Choose your subscription'}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    One licence for every active bus. Inactive buses do not use your allowance.
                  </p>
                </div>
                {priceError || prices.length === 0 ? (
                  <div className="space-y-4 p-5 sm:p-6">
                    <div
                      role={priceError ? 'alert' : 'status'}
                      className="space-y-2 text-sm leading-6 text-slate-600"
                    >
                      <p className="font-semibold text-navy-900">
                        {priceError
                          ? 'Subscription options are unavailable'
                          : 'Subscription prices are not published yet'}
                      </p>
                      <p>
                        {priceError ??
                          'Contact SafeBus support to finish setting up subscription pricing.'}
                      </p>
                      <p>You can retry loading these options without changing your subscription.</p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <Button
                        type="button"
                        variant="secondary"
                        loading={pricesLoading}
                        onClick={() => void reloadPrices()}
                      >
                        Retry subscription options
                      </Button>
                      <Link
                        to="/admin/settings/support"
                        className="inline-flex min-h-11 items-center font-semibold text-navy-700 underline"
                      >
                        Contact SafeBus support
                      </Link>
                    </div>
                  </div>
                ) : (
                  <form
                    aria-label="Subscription selection"
                    className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1fr_1fr]"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void start();
                    }}
                  >
                    <div className="min-w-0 space-y-5">
                      <fieldset className="min-w-0">
                        <legend className="mb-3 text-sm font-semibold text-slate-800">
                          Billing cycle
                        </legend>
                        <div className="grid grid-cols-2 gap-3">
                          {(['month', 'year'] as const).map((cycle) => (
                            <label
                              key={cycle}
                              className={`flex min-h-12 items-center gap-2 rounded-xl border p-3 text-sm font-semibold sm:p-4 ${!prices.some((p) => p.interval === cycle) ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer'} ${interval === cycle ? 'border-navy-600 bg-navy-50 text-navy-900 ring-1 ring-navy-600' : 'border-slate-200'}`}
                            >
                              <input
                                type="radio"
                                name="billing-cycle"
                                className="shrink-0"
                                disabled={!prices.some((p) => p.interval === cycle)}
                                checked={interval === cycle}
                                onChange={() => {
                                  setInterval(cycle);
                                  setPriceId('');
                                  saveSelection({ interval: cycle, priceId: '' });
                                }}
                              />
                              {cycle === 'month' ? 'Monthly' : 'Annual'}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                      <Field label="Subscription price" htmlFor="tenant-price">
                        <select
                          id="tenant-price"
                          className={inputClass}
                          value={selected?.id ?? ''}
                          onChange={(e) => {
                            setPriceId(e.target.value);
                            saveSelection({ priceId: e.target.value });
                          }}
                          required
                        >
                          {options.length === 0 && (
                            <option value="">No prices available for this cycle</option>
                          )}
                          {options.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {formatMoney(p.unitAmount, p.currency)} / bus /{' '}
                              {p.interval}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Active-bus allowance" htmlFor="tenant-bus-quantity">
                        <input
                          id="tenant-bus-quantity"
                          type="number"
                          className={inputClass}
                          min={Math.max(1, subscription.activeBusCount)}
                          max={10000}
                          step={1}
                          value={quantity}
                          required
                          aria-describedby="tenant-bus-quantity-hint"
                          onChange={(e) => {
                            setQuantity(Number(e.target.value));
                            saveSelection({ quantity: Number(e.target.value) });
                          }}
                        />
                        <p id="tenant-bus-quantity-hint" className="text-xs text-slate-500">
                          At least {Math.max(1, subscription.activeBusCount)}; up to 10,000.
                        </p>
                      </Field>
                    </div>
                    <div className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                      <p className="text-sm font-medium text-slate-500">
                        Recurring price before discounts and tax
                      </p>
                      <p className="mt-2 text-3xl font-bold tracking-tight text-navy-900">
                        {selected
                          ? formatMoney(selected.unitAmount * quantity, selected.currency)
                          : 'Unavailable'}
                        <span className="ml-1 text-sm font-medium text-slate-500">
                          / {interval === 'month' ? 'month' : 'year'}
                        </span>
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        {quantity} active {quantity === 1 ? 'bus' : 'buses'} · CAD · applicable
                        taxes shown at checkout
                      </p>
                      <p className="my-5 text-sm leading-6 text-slate-600">
                        {!liveContract && subscription.trialEligible
                          ? 'No charge today. Your 14-day trial begins when checkout is complete. A payment method is required. Your first payment is due when the trial ends; the exact date is shown at checkout.'
                          : liveContract
                            ? 'Paid increases take effect after prorated payment. Reductions and billing-cycle changes take effect at renewal. Trial changes keep the original trial end date.'
                            : 'Your subscription begins after payment is confirmed. A new trial is not included.'}
                      </p>
                      <p className="mb-5 text-sm font-semibold text-slate-700">
                        Renews automatically until canceled. Cancel before your next billing date to
                        avoid renewal.
                      </p>
                      <p className="mb-5 text-sm text-slate-600">
                        Have a promotion code? Enter it at secure checkout to see your discount and
                        final total.
                      </p>
                      <Button
                        className="mt-auto w-full"
                        type="submit"
                        loading={busy}
                        disabled={
                          busy ||
                          processing ||
                          !selected ||
                          Boolean(subscription.pendingChange) ||
                          subscription.pendingPayment
                        }
                      >
                        {liveContract
                          ? 'Review change'
                          : subscription.trialEligible
                            ? 'Continue to trial checkout'
                            : 'Continue to secure checkout'}
                      </Button>
                      <p className="mt-3 flex items-center justify-center gap-2 text-xs text-slate-500">
                        <ShieldCheck className="h-4 w-4" aria-hidden />
                        Secure checkout powered by Stripe
                      </p>
                    </div>
                  </form>
                )}
              </Card>
            )}
            {legacy && (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
                Your existing invoice contract is preserved. Contact support to review changes to
                this contract.
              </p>
            )}
            {subscription.pendingChange && (
              <div className="space-y-3 rounded-lg bg-navy-50 p-4">
                <p role="status" className="text-sm text-navy-800">
                  A change to {subscription.pendingChange.quantity} active-bus licences is scheduled
                  for {formatBillingDate(subscription.pendingChange.effectiveAt)}. Additional
                  activations must fit the scheduled allowance.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void changeTenantBilling(subscription.tenantId, 'unschedule')
                      .then(load)
                      .catch((e: unknown) =>
                        setError(
                          e instanceof Error ? e.message : 'Unable to remove scheduled change.',
                        ),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  Remove scheduled change
                </Button>
              </div>
            )}
            {subscription.pendingPayment && (
              <p role="status" className="rounded-lg bg-warning-50 p-4 text-sm text-warning-800">
                Your upgrade is awaiting payment. Your existing allowance remains available.{' '}
                {paymentUrl && (
                  <a href={paymentUrl} className="font-semibold underline">
                    Complete payment
                  </a>
                )}{' '}
                You can also open invoices and payment details above.
              </p>
            )}
            <SubscriptionOverview subscription={subscription} />
            {subscription.configured && !subscription.subscriptionExempt && (
              <InvoiceHistory
                key={subscription.tenantId}
                billingEmail={subscription.billingEmail}
                refreshToken={subscription.lastSyncedAt}
              />
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError(null);
                  void refreshTenantBilling()
                    .then(async () => {
                      await load();
                      await reloadPrices();
                    })
                    .catch((e: unknown) =>
                      setError(e instanceof Error ? e.message : 'Unable to refresh billing.'),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                Refresh billing
              </Button>
              {liveContract && !legacy && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirm(subscription.cancelAtPeriodEnd ? 'keep' : 'cancel')}
                >
                  {subscription.cancelAtPeriodEnd ? 'Resume renewal' : 'Cancel renewal'}
                </Button>
              )}
            </div>
          </>
        )}
        <p className="text-sm leading-6 text-slate-500">
          Subscription issues restrict new bus setup and activation. Existing transportation
          operations continue.
        </p>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm === 'change'
            ? 'Confirm subscription change'
            : confirm === 'cancel'
              ? 'Cancel automatic renewal?'
              : 'Resume automatic renewal?'
        }
        description={
          confirm === 'change' ? (
            <>
              <p>
                {preview?.timing === 'renewal'
                  ? `Effective at renewal on ${formatBillingDate(preview.effectiveAt ? new Date(preview.effectiveAt * 1000).toISOString() : null)}.`
                  : preview?.timing === 'unchanged'
                    ? 'This selection matches your current subscription.'
                    : 'Additional capacity unlocks after payment confirmation.'}
              </p>
              <p className="mt-2">
                Estimated due now:{' '}
                {formatMoney(
                  preview?.dueNow ?? 0,
                  preview?.currency ?? selected?.currency ?? 'cad',
                )}
                . Final applicable taxes and charges are confirmed by Stripe.
              </p>
            </>
          ) : confirm === 'cancel' ? (
            'Your current term continues to its end date. Any scheduled plan change will be removed. Existing operations continue afterward, but new bus setup and activation will require a subscription.'
          ) : (
            'Your subscription will renew automatically using the saved payment method.'
          )
        }
        confirmLabel={confirm === 'cancel' ? 'Cancel renewal' : 'Confirm'}
        busy={busy}
        onConfirm={() => void apply()}
        onCancel={() => setConfirm(null)}
      />
    </DashboardLayout>
  );
}
