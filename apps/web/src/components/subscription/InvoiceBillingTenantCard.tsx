import { useState, type FormEvent } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { useAuth } from '@/contexts/useAuth';
import {
  activateInvoiceBilling,
  fetchInvoiceBillingArrangement,
  requestInvoiceBilling,
  type InvoiceBillingArrangement,
  type InvoiceBillingRequest,
} from '@/services/invoiceBillingService';
import type { SubscriptionPrice } from '@/types/subscription';

const inputStyle =
  'min-h-11 w-full min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-base text-[var(--color-text)] sm:text-sm';
const provinces = [
  'AB',
  'BC',
  'MB',
  'NB',
  'NL',
  'NS',
  'NT',
  'NU',
  'ON',
  'PE',
  'QC',
  'SK',
  'YT',
] as const;

export function InvoiceBillingTenantCard({
  prices,
  minimumBuses,
  trialEligible,
  onActivated,
}: {
  prices: SubscriptionPrice[];
  minimumBuses: number;
  trialEligible: boolean;
  onActivated: () => Promise<unknown>;
}) {
  const { profile } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [arrangement, setArrangement] = useState<InvoiceBillingArrangement | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [priceId, setPriceId] = useState('');
  const [quantity, setQuantity] = useState(Math.max(1, minimumBuses));
  const [billingEmail, setBillingEmail] = useState(profile?.email ?? '');
  const [purchaseOrder, setPurchaseOrder] = useState('');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('AB');
  const [postalCode, setPostalCode] = useState('');

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setArrangement(await fetchInvoiceBillingArrangement());
    } catch {
      setError('Unable to check invoice billing status. Retry securely.');
    } finally {
      setLoading(false);
    }
  }
  async function expand() {
    const next = !expanded;
    setExpanded(next);
    if (next) await refresh();
  }
  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !priceId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input: InvoiceBillingRequest = {
        priceId,
        quantity,
        billingEmail: billingEmail.trim(),
        purchaseOrder: purchaseOrder.trim(),
        address: {
          line1: line1.trim(),
          city: city.trim(),
          state,
          postalCode: postalCode.trim(),
          country: 'CA',
        },
      };
      if (!profile?.tenant_id) throw new Error('School authority access required.');
      setArrangement(await requestInvoiceBilling(profile.tenant_id, input));
      setNotice(
        'Invoice billing requested. The SafeBus platform administrator must approve it before activation.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invoice request was not confirmed.');
    } finally {
      setBusy(false);
    }
  }
  async function activate() {
    if (!confirmed || !arrangement?.requestId || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (!profile?.tenant_id) throw new Error('School authority access required.');
      const result = await activateInvoiceBilling(profile.tenant_id, arrangement.requestId);
      setConfirmed(false);
      setNotice(
        result.trialGranted
          ? 'Your 14-day invoice trial is active. Your first invoice will be issued when the trial ends.'
          : 'Your invoice subscription is active. Your first invoice may be issued immediately.',
      );
      await refresh();
      await onActivated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Invoice activation was not confirmed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6" data-ui="tenant-invoice-billing">
      <h2 className="text-lg font-bold text-[var(--color-heading)]">
        Invoice or purchase-order billing
      </h2>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        If your school authority requires invoices or a purchase order instead of a payment card,
        request this arrangement for approval. Card checkout remains the standard option.
      </p>
      <Button type="button" variant="secondary" className="mt-4" onClick={() => void expand()}>
        {expanded ? 'Hide invoice billing' : 'Request invoice / PO billing'}
      </Button>
      {expanded && (
        <div className="mt-5 space-y-4">
          {error && (
            <p role="alert" className="text-sm text-[var(--color-danger-text)]">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-[var(--color-text)]">
              {notice}
            </p>
          )}
          {loading ? (
            <p role="status">Checking invoice approval…</p>
          ) : (
            <>
              <p className="text-sm font-semibold text-[var(--color-heading)]">
                Approval status:{' '}
                {arrangement?.status === 'none'
                  ? 'Not requested'
                  : (arrangement?.status ?? 'Unavailable')}
              </p>
              {arrangement?.status === 'pending' && (
                <p className="text-sm">
                  Your request is awaiting platform approval. No invoice or payment has been
                  created.
                </p>
              )}
              {arrangement?.status === 'rejected' && (
                <p className="text-sm">
                  The request was not approved. You can submit a revised request or use card
                  checkout.
                </p>
              )}
              {arrangement?.status === 'approved' && (
                <>
                  <p className="text-sm">
                    Approved for {arrangement.quantity} active buses. Purchase order:{' '}
                    {arrangement.purchaseOrder || 'Not required'}. Invoices are due{' '}
                    {arrangement.daysUntilDue} days after issuance.
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {trialEligible
                      ? 'A first-time 14-day trial is offered if no trial has previously been used. The first invoice is issued after the trial; no card is required for this approved arrangement.'
                      : 'Your authority is not eligible for another trial. The first invoice can be issued immediately when you activate this subscription.'}{' '}
                    Monthly service is month-to-month with automatic monthly renewal; annual service
                    has a 12-month term with automatic annual renewal. Cancel at any time, effective
                    at the end of the trial or paid period, without an early cancellation fee. No
                    partial refund of a paid period applies except where required by law or
                    expressly agreed. Issued invoices remain payable. Approved rates include
                    applicable GST/HST.
                  </p>
                  <label className="flex min-h-11 items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    I am authorized to start this recurring subscription under the approved invoice
                    terms, invoice due date, and signed school-authority agreement.
                  </label>
                  <Button
                    type="button"
                    disabled={!confirmed || busy}
                    loading={busy}
                    onClick={() => void activate()}
                  >
                    Activate approved invoice subscription
                  </Button>
                </>
              )}
              {arrangement?.status === 'activated' && (
                <p role="status" className="text-sm">
                  Invoice billing was activated. Refresh your subscription status to see the current
                  trial, invoice and bus allowance.
                </p>
              )}
              {(!arrangement || ['none', 'rejected'].includes(arrangement.status)) && (
                <form
                  className="grid gap-4 sm:grid-cols-2"
                  onSubmit={(event) => void request(event)}
                >
                  <div className="sm:col-span-2">
                    <Field label="Approved price and billing interval" htmlFor="invoice-price">
                      <select
                        id="invoice-price"
                        className={inputStyle}
                        value={priceId}
                        required
                        onChange={(event) => setPriceId(event.target.value)}
                      >
                        <option value="">Choose interval</option>
                        {prices.map((price) => (
                          <option key={price.id} value={price.id}>
                            {price.interval === 'month' ? 'Monthly' : 'Annual'} · CAD{' '}
                            {(price.unitAmount / 100).toFixed(2)} per active bus, including GST/HST
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <Field label="Active bus allowance" htmlFor="invoice-quantity">
                    <input
                      id="invoice-quantity"
                      type="number"
                      className={inputStyle}
                      min={Math.max(1, minimumBuses)}
                      max={10000}
                      step={1}
                      required
                      value={quantity}
                      onChange={(event) => setQuantity(Number(event.target.value))}
                    />
                  </Field>
                  <Field label="School authority billing email" htmlFor="invoice-email">
                    <input
                      id="invoice-email"
                      type="email"
                      className={inputStyle}
                      required
                      value={billingEmail}
                      onChange={(event) => setBillingEmail(event.target.value)}
                    />
                  </Field>
                  <Field label="Purchase-order reference (if issued)" htmlFor="invoice-po">
                    <input
                      id="invoice-po"
                      className={inputStyle}
                      maxLength={80}
                      value={purchaseOrder}
                      onChange={(event) => setPurchaseOrder(event.target.value)}
                    />
                  </Field>
                  <Field label="Street / billing address" htmlFor="invoice-address">
                    <input
                      id="invoice-address"
                      className={inputStyle}
                      required
                      value={line1}
                      onChange={(event) => setLine1(event.target.value)}
                    />
                  </Field>
                  <Field label="City" htmlFor="invoice-city">
                    <input
                      id="invoice-city"
                      className={inputStyle}
                      required
                      value={city}
                      onChange={(event) => setCity(event.target.value)}
                    />
                  </Field>
                  <Field label="Province or territory" htmlFor="invoice-province">
                    <select
                      id="invoice-province"
                      className={inputStyle}
                      value={state}
                      onChange={(event) => setState(event.target.value)}
                    >
                      {provinces.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Canadian postal code" htmlFor="invoice-postal">
                    <input
                      id="invoice-postal"
                      className={inputStyle}
                      required
                      maxLength={7}
                      value={postalCode}
                      onChange={(event) => setPostalCode(event.target.value)}
                    />
                  </Field>
                  <p className="text-sm text-[var(--color-text-muted)] sm:col-span-2">
                    Submitting this request does not start a trial or charge your authority. A
                    SafeBus platform administrator must separately approve the requested plan,
                    billing address and invoice payment window. Billing details are sent securely to
                    Stripe.
                  </p>
                  <div className="sm:col-span-2">
                    <Button type="submit" disabled={busy || !priceId} loading={busy}>
                      Submit invoice billing request
                    </Button>
                  </div>
                </form>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void refresh()}
              >
                Refresh invoice approval
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
