import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FileText, RefreshCw } from 'lucide-react';
import { Button, buttonClass } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  fetchTenantInvoices,
  formatBillingDate,
  formatMoney,
} from '@/services/subscriptionService';
import type { SubscriptionInvoice } from '@/types/subscription';

const statusLabels = {
  paid: 'Paid',
  open: 'Awaiting payment',
  void: 'Voided',
  uncollectible: 'Uncollectible',
} as const;

export function InvoiceHistory({ refreshToken }: { refreshToken: string | null }) {
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef({ count: 0 });

  const load = useCallback(async (cursor?: string) => {
    const request = ++generation.current.count;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchTenantInvoices(cursor);
      if (request !== generation.current.count) return;
      setInvoices((previous) => {
        if (!cursor) return page.invoices;
        const ids = new Set(previous.map((invoice) => invoice.id));
        return [...previous, ...page.invoices.filter((invoice) => !ids.has(invoice.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (e) {
      if (request === generation.current.count)
        setError(e instanceof Error ? e.message : 'Unable to load invoices.');
    } finally {
      if (request === generation.current.count) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const pending = generation.current;
    void load();
    return () => {
      pending.count++;
    };
  }, [load, refreshToken]);

  return (
    <Card className="p-5 shadow-none sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <FileText className="h-5 w-5 text-navy-600" aria-hidden />
            Invoice history
          </h2>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={loading}
          leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}
          onClick={() => void load()}
        >
          Refresh invoices
        </Button>
      </div>
 codex/launch-settings-cleanup

      <p className="mt-4 break-words rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        Billing email:{' '}
        <span className="font-semibold text-slate-900">{billingEmail ?? 'Not set'}</span>. Use
        Manage payment details to update the billing contact or manage payment methods.
      </p>
 main
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-danger-50 p-4 text-sm text-danger-700">
          {error} Use Refresh invoices to try again. Previously loaded invoices remain available.
        </p>
      )}
      {loading && (
        <p role="status" className="mt-4 text-sm text-slate-600">
          Loading invoices…
        </p>
      )}
      {!loading && !error && invoices.length === 0 && (
        <p className="mt-5 text-sm leading-6 text-slate-600">No invoices yet.</p>
      )}
      {invoices.length > 0 && (
        <ul className="mt-5 divide-y divide-slate-200" aria-label="Subscription invoices">
          {invoices.map((invoice) => (
            <li key={invoice.id} className="py-5 first:pt-0 last:pb-0">
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="break-all font-semibold text-slate-900">
                      {invoice.number ?? 'Subscription invoice'}
                    </h3>
                    <StatusPill
                      tone={
                        invoice.status === 'paid'
                          ? 'success'
                          : invoice.status === 'open'
                            ? 'warning'
                            : 'neutral'
                      }
                    >
                      {statusLabels[invoice.status]}
                    </StatusPill>
                  </div>
                  <p className="text-sm text-slate-600">
                    Issued {formatBillingDate(invoice.issuedAt)}
                    {invoice.status === 'paid' && invoice.paidAt
                      ? ` · Paid ${formatBillingDate(invoice.paidAt)}`
                      : invoice.status === 'open' && invoice.dueAt
                        ? ` · Due ${formatBillingDate(invoice.dueAt)}`
                        : ''}
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    Total {formatMoney(invoice.total, invoice.currency)}{' '}
                    <span className="font-normal uppercase text-slate-600">{invoice.currency}</span>
                    {invoice.status === 'open' &&
                      ` · ${formatMoney(invoice.amountRemaining, invoice.currency)} remaining`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-3">
                  {invoice.pdfUrl && (
                    <a
                      href={invoice.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                      className={buttonClass({ variant: 'secondary', size: 'sm' })}
                      aria-label={`Download PDF for invoice ${invoice.number ?? invoice.id}`}
                    >
                      <Download className="h-4 w-4" aria-hidden />
                      Download PDF
                    </a>
                  )}
                  {invoice.hostedUrl && (
                    <a
                      href={invoice.hostedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                      className={buttonClass({ variant: 'outline', size: 'sm' })}
                      aria-label={`View invoice ${invoice.number ?? invoice.id}`}
                    >
                      View invoice
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    </a>
                  )}
                  {!invoice.pdfUrl && !invoice.hostedUrl && (
                    <p className="text-sm text-slate-600">
                      Document unavailable. Open the billing portal.
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {nextCursor && (
        <Button
          type="button"
          variant="secondary"
          className="mt-5"
          disabled={loading}
          onClick={() => void load(nextCursor)}
        >
          Load older invoices
        </Button>
      )}
 codex/launch-settings-cleanup

      <p className="mt-5 text-xs leading-5 text-slate-500">
        Invoice links open securely in Stripe. If a link expires, refresh invoices or use Manage
        payment details below.
      </p>
 main
    </Card>
  );
}
