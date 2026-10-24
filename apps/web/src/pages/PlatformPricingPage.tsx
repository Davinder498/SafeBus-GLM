import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CreditCard, Tag } from 'lucide-react';
import { DashboardLayout, platformNavItems } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { StatusPill } from '@/components/ui/StatusPill';
import { DataState } from '@/components/ui/DataState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  changePricingCatalog,
  fetchPendingCatalogRequest,
  fetchPricingCatalog,
  formatBillingDate,
  formatMoney,
} from '@/services/subscriptionService';
import type { CatalogMutation, PendingCatalogRequest, PricingCatalog } from '@/types/subscription';
import { safeBusDisplayText } from '@/utils/brand';

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm';
function describeChange(change: CatalogMutation): string {
  if (change.action === 'create_price')
    return `Publish ${change.name} at ${formatMoney(change.unitAmount, 'cad')} per active bus per ${change.interval}? Existing subscribers keep their contracted price.`;
  if (change.action === 'create_discount')
    return `Create ${change.code} for ${change.kind === 'percent' ? `${change.value}%` : formatMoney(change.value, 'cad')} off ${change.duration === 'once' ? 'one invoice' : 'every invoice'}? Customers can redeem it at secure checkout. Fixed discounts apply to the invoice subtotal, not to each bus.`;
  return `${change.active ? 'Make this item available for new selections again' : 'Archive this item to stop new selections'}? Existing subscription prices and redeemed discounts are preserved.`;
}

export function PlatformPricingPage() {
  const [catalog, setCatalog] = useState<PricingCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<CatalogMutation | null>(null);
  const [pending, setPending] = useState<PendingCatalogRequest | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [priceName, setPriceName] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [discountName, setDiscountName] = useState('');
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('');
  const [duration, setDuration] = useState<'once' | 'forever'>('once');
  const [maxRedemptions, setMaxRedemptions] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, request] = await Promise.all([
        fetchPricingCatalog(),
        fetchPendingCatalogRequest(),
      ]);
      setCatalog(data);
      setPending(request);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load pricing.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const locked = busy || !!pending || !catalog;
  async function apply() {
    if (!draft && !pending) return;
    const request = pending ?? { requestId: crypto.randomUUID(), body: draft! };
    setPending(request);
    setBusy(true);
    setError(null);
    setMessage(null);
    setDraft(null);
    try {
      await changePricingCatalog(request);
      setPending(null);
      setMessage('Catalog updated. Existing school authority contracts are preserved.');
      setCatalog(await fetchPricingCatalog());
    } catch (e) {
      if ((e as { retryable?: boolean }).retryable === false) setPending(null);
      setError(
        e instanceof Error
          ? e.message
          : 'The change was not confirmed. Retry the original request.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function more(section: 'prices' | 'discounts') {
    if (!catalog) return;
    setBusy(true);
    setError(null);
    try {
      const next = await fetchPricingCatalog(
        section === 'prices'
          ? { priceCursor: catalog.priceCursor }
          : { discountCursor: catalog.discountCursor },
      );
      setCatalog(
        (current) =>
          current && {
            ...current,
            [section]: [
              ...new Map(
                [...current[section], ...next[section]].map((item) => [item.id, item]),
              ).values(),
            ],
            ...(section === 'prices'
              ? { priceCursor: next.priceCursor }
              : { discountCursor: next.discountCursor }),
          },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load more items.');
    } finally {
      setBusy(false);
    }
  }
  function queuePrice(e: FormEvent) {
    e.preventDefault();
    setDraft({
      action: 'create_price',
      name: priceName.trim(),
      unitAmount: Math.round(Number(priceAmount) * 100),
      interval,
    });
  }
  function queueDiscount(e: FormEvent) {
    e.preventDefault();
    setDraft({
      action: 'create_discount',
      name: discountName.trim(),
      code: code.trim().toUpperCase(),
      kind,
      value: kind === 'amount' ? Math.round(Number(value) * 100) : Number(value),
      duration,
      maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
      expiresAt: expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : null,
    });
  }
  return (
    <DashboardLayout title="Platform Admin" portal="admin" navItems={platformNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Platform"
          title="Pricing & discounts"
          icon={<CreditCard className="h-6 w-6" />}
          description="Manage the SafeBus subscription catalog. Set per-bus prices and create promotion codes for your customers."
          action={
            <Button
              type="button"
              variant="secondary"
              disabled={busy || loading}
              onClick={() => void load()}
            >
              Refresh catalog
            </Button>
          }
        />
        <Card className="border-navy-100 bg-navy-50 p-5">
          <p className="font-semibold text-navy-900">A clear price for every active bus</p>
          <p className="mt-2 text-sm leading-6 text-navy-800">
            Prices are in Canadian dollars, billed monthly or annually. Publishing a new price makes
            it available for selection; it does not move existing subscribers. Tax follows your
            existing Stripe configuration.
          </p>
        </Card>
        {message && (
          <p role="status" className="rounded-lg bg-success-50 p-4 text-sm text-success-900">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-danger-50 p-4 text-sm text-danger-800">
            {error}
          </p>
        )}
        {pending && (
          <Card className="border-warning-200 bg-warning-50 p-5">
            <h2 className="font-bold text-warning-900">A catalog change needs confirmation</h2>
            <p className="mt-2 break-words text-sm text-warning-900">
              {describeChange(pending.body)}
            </p>
            <p className="mt-2 text-sm text-warning-900">
              Retry this request before starting another change. Confirmation can take a couple of
              minutes.
            </p>
            <Button
              className="mt-4"
              type="button"
              disabled={busy}
              loading={busy}
              onClick={() => void apply()}
            >
              Retry catalog change
            </Button>
          </Card>
        )}
        {loading ? (
          <DataState
            title="Loading pricing"
            message="Checking the current subscription prices and promotion codes."
          />
        ) : (
          <>
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />{' '}
              Show archived items
            </label>
            <section
              aria-labelledby="subscription-prices-heading"
              className="grid items-start gap-5 xl:grid-cols-2"
            >
              <Card className="p-5 sm:p-6">
                <h2 id="subscription-prices-heading" className="text-xl font-bold text-navy-900">
                  Subscription prices
                </h2>

                <div className="mt-5 space-y-3">
                  {catalog?.prices
                    .filter((p) => showArchived || p.active)
                    .map((p) => (
                      <article key={p.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <h3 className="min-w-0 break-words font-semibold text-slate-900">
                            {safeBusDisplayText(p.name)}
                          </h3>
                          <StatusPill tone={p.active ? 'success' : 'neutral'}>
                            {p.active ? 'Available' : 'Archived'}
                          </StatusPill>
                        </div>
                        <p className="mt-3 text-2xl font-bold text-navy-900">
                          {formatMoney(p.unitAmount, p.currency)}{' '}
                          <span className="text-sm font-medium text-slate-600">
                            / bus / {p.interval === 'month' ? 'month' : 'year'}
                          </span>
                        </p>
                        <Button
                          className="mt-3"
                          type="button"
                          variant="secondary"
                          disabled={locked}
                          onClick={() =>
                            setDraft({ action: 'set_price_active', id: p.id, active: !p.active })
                          }
                        >
                          {p.active ? 'Archive price' : 'Restore price'}
                        </Button>
                      </article>
                    ))}
                  {catalog && !catalog.prices.some((p) => showArchived || p.active) && (
                    <p className="py-4 text-sm text-slate-600">
                      No subscription prices to show. Publish a price to make it available to school
                      authorities.
                    </p>
                  )}
                  {catalog?.priceCursor && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void more('prices')}
                    >
                      Load more prices
                    </Button>
                  )}
                </div>
              </Card>
              <Card className="p-5 sm:p-6">
                <h2 className="text-lg font-bold text-navy-900">Publish a subscription price</h2>
                <form aria-label="New subscription price" onSubmit={queuePrice}>
                  <fieldset disabled={locked} className="mt-5 space-y-4 disabled:opacity-60">
                    <Field label="Price name" htmlFor="price-name">
                      <input
                        id="price-name"
                        className={inputClass}
                        required
                        maxLength={80}
                        value={priceName}
                        onChange={(e) => setPriceName(e.target.value)}
                      />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Price per bus (CAD)" htmlFor="price-amount">
                        <input
                          id="price-amount"
                          className={inputClass}
                          required
                          type="number"
                          min="0.01"
                          max="1000000"
                          step="0.01"
                          value={priceAmount}
                          onChange={(e) => setPriceAmount(e.target.value)}
                        />
                      </Field>
                      <Field label="Billing interval" htmlFor="price-interval">
                        <select
                          id="price-interval"
                          className={inputClass}
                          value={interval}
                          onChange={(e) => setInterval(e.target.value as 'month' | 'year')}
                        >
                          <option value="month">Monthly</option>
                          <option value="year">Annual</option>
                        </select>
                      </Field>
                    </div>
                    <Button type="submit" disabled={locked}>
                      Review price
                    </Button>
                  </fieldset>
                </form>
              </Card>
            </section>
            <section
              aria-labelledby="discounts-heading"
              className="grid items-start gap-5 xl:grid-cols-2"
            >
              <Card className="p-5 sm:p-6">
                <h2
                  id="discounts-heading"
                  className="flex items-center gap-2 text-xl font-bold text-navy-900"
                >
                  <Tag className="h-5 w-5" aria-hidden /> Discounts & promotion codes
                </h2>

                <div className="mt-5 space-y-3">
                  {catalog?.discounts
                    .filter((p) => showArchived || p.active)
                    .map((p) => (
                      <article key={p.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <h3 className="min-w-0 break-words font-semibold text-slate-900">
                            {safeBusDisplayText(p.name)}
                          </h3>
                          <StatusPill tone={p.active ? 'success' : 'neutral'}>
                            {p.active ? 'Available' : 'Archived'}
                          </StatusPill>
                        </div>
                        <p className="mt-3 break-all font-mono text-lg font-bold text-navy-800">
                          {p.code}
                        </p>
                        <p className="mt-2 text-sm text-slate-700">
                          {p.percentOff != null
                            ? `${p.percentOff}%`
                            : formatMoney(p.amountOff, p.currency)}{' '}
                          off ·{' '}
                          {p.duration === 'once'
                            ? 'One invoice'
                            : p.duration === 'forever'
                              ? 'Every invoice'
                              : 'Limited duration'}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {p.timesRedeemed} redemptions
                          {p.maxRedemptions ? ` of ${p.maxRedemptions}` : ''} ·{' '}
                          {p.expiresAt
                            ? `Expires ${formatBillingDate(new Date(p.expiresAt * 1000).toISOString())}`
                            : 'No expiry'}
                        </p>
                        <Button
                          className="mt-3"
                          type="button"
                          variant="secondary"
                          disabled={locked}
                          onClick={() =>
                            setDraft({ action: 'set_discount_active', id: p.id, active: !p.active })
                          }
                        >
                          {p.active ? 'Archive code' : 'Restore code'}
                        </Button>
                      </article>
                    ))}
                  {catalog && !catalog.discounts.some((p) => showArchived || p.active) && (
                    <p className="py-4 text-sm text-slate-600">
                      No promotion codes to show. Create a discount when you are ready to offer one.
                    </p>
                  )}
                  {catalog?.discountCursor && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void more('discounts')}
                    >
                      Load more discounts
                    </Button>
                  )}
                </div>
              </Card>
              <Card className="p-5 sm:p-6">
                <h2 className="text-lg font-bold text-navy-900">Create a discount</h2>
                <form aria-label="New discount" onSubmit={queueDiscount}>
                  <fieldset disabled={locked} className="mt-5 space-y-4 disabled:opacity-60">
                    <Field label="Discount name" htmlFor="discount-name">
                      <input
                        id="discount-name"
                        className={inputClass}
                        required
                        maxLength={80}
                        value={discountName}
                        onChange={(e) => setDiscountName(e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Promotion code"
                      htmlFor="discount-code"
                      hint="3–40 letters, numbers or dashes"
                    >
                      <input
                        id="discount-code"
                        className={inputClass}
                        required
                        minLength={3}
                        maxLength={40}
                        pattern="[A-Za-z0-9-]+"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                      />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Discount type" htmlFor="discount-kind">
                        <select
                          id="discount-kind"
                          className={inputClass}
                          value={kind}
                          onChange={(e) => setKind(e.target.value as 'percent' | 'amount')}
                        >
                          <option value="percent">Percentage</option>
                          <option value="amount">Fixed amount (CAD)</option>
                        </select>
                      </Field>
                      <Field
                        label={kind === 'percent' ? 'Percentage off' : 'Amount off (CAD)'}
                        htmlFor="discount-value"
                      >
                        <input
                          id="discount-value"
                          className={inputClass}
                          required
                          type="number"
                          min="0.01"
                          max={kind === 'percent' ? 100 : 1000000}
                          step="0.01"
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                        />
                      </Field>
                    </div>
                    <p className="text-sm text-slate-600">
                      Fixed discounts reduce the invoice subtotal, not the price of each bus.
                    </p>
                    <Field label="Discount duration" htmlFor="discount-duration">
                      <select
                        id="discount-duration"
                        className={inputClass}
                        value={duration}
                        onChange={(e) => setDuration(e.target.value as 'once' | 'forever')}
                      >
                        <option value="once">One invoice</option>
                        <option value="forever">Every invoice</option>
                      </select>
                    </Field>
                    <Field label="Maximum redemptions (optional)" htmlFor="discount-redemptions">
                      <input
                        id="discount-redemptions"
                        className={inputClass}
                        type="number"
                        min="1"
                        max="1000000"
                        step="1"
                        value={maxRedemptions}
                        onChange={(e) => setMaxRedemptions(e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Redemption expiry (optional)"
                      htmlFor="discount-expiry"
                      hint="Your local time"
                    >
                      <input
                        id="discount-expiry"
                        className={inputClass}
                        type="datetime-local"
                        value={expiresAt}
                        onChange={(e) => setExpiresAt(e.target.value)}
                      />
                    </Field>
                    <Button type="submit" disabled={locked}>
                      Review discount
                    </Button>
                  </fieldset>
                </form>
              </Card>
            </section>
          </>
        )}
      </div>
      <ConfirmDialog
        open={!!draft}
        onCancel={() => setDraft(null)}
        onConfirm={() => void apply()}
        busy={busy}
        title="Confirm catalog change"
        description={draft ? describeChange(draft) : ''}
        confirmLabel="Confirm and publish"
      />
    </DashboardLayout>
  );
}
