import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Download, FileCheck2, ShieldCheck } from 'lucide-react';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { AdminSettingsNav } from '@/components/settings/AdminSettingsNav';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/useAuth';
import {
  acceptDistrictAgreement,
  downloadExecutedAgreementPdf,
  downloadExecutedAgreementArchive,
  getDistrictAgreement,
  listMyAgreementReceipts,
  isCompleteDistrictAgreement,
  prepareDistrictAgreementOrder,
  type AgreementDocument,
  type DistrictAgreement,
  type DistrictOrder,
} from '@/services/districtAgreementService';

const sectionNames = ['MSA', 'DPA', 'Order Form', 'Security & Suppliers'];
const section = (kind: string) =>
  kind === 'msa' ? 0 : kind === 'dpa' ? 1 : kind === 'order_form' ? 2 : 3;

function downloadText(doc: AgreementDocument) {
  const url = URL.createObjectURL(new Blob([doc.body], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `SafeBus-${doc.kind}-${doc.version.replace(/[^a-z0-9._-]/gi, '_')}.md`;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DistrictAgreementsPage() {
  const navigate = useNavigate();
  const { profile, mfaStatus } = useAuth();
  const [agreement, setAgreement] = useState<DistrictAgreement | null>(null);
  const [archive, setArchive] = useState<
    Array<{
      id: string;
      signed_at: string;
      receipt_sha256: string;
      bundle_sha256: string;
      actor_email: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [consent, setConsent] = useState(false);
  const [authority, setAuthority] = useState(false);
  const [intent, setIntent] = useState(false);
  const [order, setOrder] = useState<DistrictOrder>({
    interval: 'month',
    quantity: 1,
    collection_method: 'charge_automatically',
    privacy_contact: '',
    urgent_contact: '',
  });
  const [orderDirty, setOrderDirty] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Consent belongs to the reviewed package, never to a replacement loaded later.
    setConsent(false);
    setAuthority(false);
    setIntent(false);
    setTab(0);
    try {
      const [next, receipts] = await Promise.all([
        getDistrictAgreement(),
        listMyAgreementReceipts(),
      ]);
      setAgreement(next);
      setArchive(receipts);
      if (next.order_details)
        setOrder({
          interval: next.order_details.interval,
          quantity: next.order_details.quantity,
          collection_method: next.order_details.collection_method,
          privacy_contact: next.order_details.privacy_contact,
          urgent_contact: next.order_details.urgent_contact,
        });
      setOrderDirty(false);
    } catch (cause) {
      setAgreement(null);
      setError(cause instanceof Error ? cause.message : 'Agreement unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const docs = agreement?.documents ?? [];
  const complete = isCompleteDistrictAgreement(agreement);
  const signed = agreement?.status === 'executed';
  const eligible =
    complete &&
    agreement?.status === 'issued' &&
    mfaStatus.currentLevel === 'aal2' &&
    (!agreement.order_required || Boolean(agreement.order_details)) &&
    !orderDirty;
  function changeOrder(next: Partial<DistrictOrder>) {
    setOrder((prev) => ({ ...prev, ...next }));
    setOrderDirty(true);
    setConsent(false);
    setAuthority(false);
    setIntent(false);
  }
  async function prepareOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agreement?.id || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await prepareDistrictAgreementOrder(agreement.id, order);
      await refresh();
      setTab(2);
      setNotice(
        'Your order is ready for review. Review the complete package and accept below. Saving details does not start billing.',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to prepare your order.');
    } finally {
      setBusy(false);
    }
  }
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !eligible ||
      !agreement?.id ||
      !agreement.bundle_sha256 ||
      busy ||
      loading ||
      !consent ||
      !authority ||
      !intent
    )
      return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await acceptDistrictAgreement({
        id: agreement.id,
        digest: agreement.bundle_sha256,
        name: name.trim(),
        title: title.trim(),
        electronicConsent: consent,
        authorityAttested: authority,
        signatureIntent: intent,
      });
      if (result.status !== 'executed')
        throw new Error('Execution was not confirmed. Refresh the status.');
      setNotice(
        'Your MSA and DPA agreement has been accepted and archived. Download your executed copy below.',
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Agreement acceptance failed.');
    } finally {
      setBusy(false);
    }
  }
  async function download(id: string, format: 'pdf' | 'exact' = 'pdf') {
    setBusy(true);
    setError(null);
    try {
      if (format === 'exact') await downloadExecutedAgreementArchive(id);
      else await downloadExecutedAgreementPdf(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Agreement download failed.');
    } finally {
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
      <div className="space-y-6" data-ui="district-agreements">
        <PageHeader
          eyebrow="School authority onboarding"
          title="Agreements"
          description="Review and accept your school authority's SafeBus MSA, DPA and incorporated schedules."
        />
        <AdminSettingsNav role={profile?.role} />
        <div className="flex flex-wrap gap-2 text-sm" aria-label="Onboarding progress">
          {['Review agreement', 'Accept online', 'Billing & setup'].map((step, i) => (
            <span
              key={step}
              className={`rounded-full px-4 py-2 border border-[var(--color-border)] ${(signed ? i <= 1 : i === 0) ? 'bg-[var(--color-brand-soft)] text-[var(--color-action)]' : 'text-[var(--color-text-muted)]'}`}
            >
              {i + 1} · {step}
            </span>
          ))}
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-[var(--color-danger-outline)] p-4 text-[var(--color-danger-text)]"
          >
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg border border-[var(--color-border)] p-4">
            {notice}
          </p>
        )}
        {loading ? (
          <Card className="p-6">
            <p role="status">Loading your agreement securely…</p>
          </Card>
        ) : !agreement || agreement.status === 'not_issued' ? (
          <Card className="space-y-3 p-6">
            <h2 className="text-xl font-bold text-[var(--color-heading)]">
              {error ? 'Agreement unavailable' : 'Agreement not yet published'}
            </h2>
            <p className="text-[var(--color-text-muted)]">
              {error
                ? 'We could not verify your current agreement. Please refresh the page or contact SafeBus support.'
                : 'SafeBus has not published the final contract package. No agreement is assumed or accepted, and draft terms cannot be signed. Please contact SafeBus support if needed.'}
            </p>
            <Link
              to="/admin/settings/support"
              className="inline-flex min-h-11 items-center font-semibold text-[var(--color-action)] underline"
            >
              Contact SafeBus
            </Link>
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(270px,1fr)]">
            <Card className="min-w-0 overflow-hidden">
              <div className="border-b border-[var(--color-border)] p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                  School authority
                </p>
                <h2 className="mt-1 text-xl font-bold text-[var(--color-heading)]">
                  {agreement.tenant_name}
                </h2>
                <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                  Package version {agreement.version} · {docs.length} incorporated documents
                </p>
                <p className="mt-1 break-all text-xs text-[var(--color-text-muted)]">
                  Package SHA-256: {agreement.bundle_sha256}
                </p>
              </div>
              <div
                role="tablist"
                aria-label="Agreement documents"
                className="flex gap-2 overflow-x-auto border-b border-[var(--color-border)] p-3"
              >
                {sectionNames.map((label, i) => (
                  <button
                    key={label}
                    role="tab"
                    aria-selected={tab === i}
                    aria-controls="district-document-panel"
                    className={`min-h-11 shrink-0 rounded-lg px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[var(--color-focus)] ${tab === i ? 'bg-[var(--color-brand-soft)] text-[var(--color-action)]' : 'text-[var(--color-text-muted)]'}`}
                    onClick={() => setTab(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                        e.preventDefault();
                        const next =
                          (i + (e.key === 'ArrowRight' ? 1 : sectionNames.length - 1)) %
                          sectionNames.length;
                        setTab(next);
                        (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <section
                id="district-document-panel"
                role="tabpanel"
                className="space-y-6 p-4 sm:p-5"
              >
                {docs
                  .filter((d) => section(d.kind) === tab)
                  .map((d) => (
                    <article key={d.id} className="space-y-3">
                      <div className="flex flex-wrap justify-between gap-3">
                        <div>
                          <h3 className="font-bold text-[var(--color-heading)]">{d.title}</h3>
                          <p className="max-w-full break-all text-xs text-[var(--color-text-muted)]">
                            Version {d.version} · SHA-256 {d.sha256}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          leftIcon={<Download className="h-4 w-4" />}
                          onClick={() => downloadText(d)}
                        >
                          Download text
                        </Button>
                      </div>
                      <div className="whitespace-pre-wrap break-words rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-4 text-sm leading-7 text-[var(--color-text)]">
                        {d.body}
                      </div>
                    </article>
                  ))}
                {!docs.some((d) => section(d.kind) === tab) && (
                  <p role="alert">Missing agreement document.</p>
                )}
              </section>
              <div className="flex flex-wrap justify-between gap-3 border-t border-[var(--color-border)] p-4">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={tab === 0}
                  onClick={() => setTab(tab - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={tab === 3}
                  onClick={() => setTab(tab + 1)}
                >
                  Next document
                </Button>
              </div>
            </Card>
            <div className="space-y-5">
              {agreement.order_required && (
                <Card className="space-y-4 p-5">
                  <h2 className="font-bold text-[var(--color-heading)]">School authority order</h2>
                  <form className="space-y-4" onSubmit={(e) => void prepareOrder(e)}>
                    <Field label="Billing interval" htmlFor="agreement-order-interval">
                      <select
                        id="agreement-order-interval"
                        value={order.interval}
                        className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
                        onChange={(e) =>
                          changeOrder({ interval: e.target.value as DistrictOrder['interval'] })
                        }
                      >
                        <option value="month">Monthly · CA$1.99 per active bus</option>
                        <option value="year">Annual · CA$20.29 per active bus</option>
                      </select>
                    </Field>
                    <Field
                      label="Licensed active buses"
                      htmlFor="agreement-order-quantity"
                      required
                    >
                      <Input
                        id="agreement-order-quantity"
                        type="number"
                        min={1}
                        max={10000}
                        step={1}
                        required
                        value={order.quantity}
                        onChange={(e) => changeOrder({ quantity: Number(e.target.value) })}
                      />
                    </Field>
                    <p className="text-sm">
                      CA${((order.interval === 'month' ? 1.99 : 20.29) * order.quantity).toFixed(2)}{' '}
                      per {order.interval === 'month' ? 'month' : 'year'}, including applicable
                      GST/HST, before approved discounts.
                    </p>
                    <Field label="Payment collection" htmlFor="agreement-order-collection">
                      <select
                        id="agreement-order-collection"
                        value={order.collection_method}
                        className="min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
                        onChange={(e) =>
                          changeOrder({
                            collection_method: e.target.value as DistrictOrder['collection_method'],
                          })
                        }
                      >
                        <option value="charge_automatically">Automatic payment</option>
                        <option value="send_invoice">
                          Invoice / PO — separate approval required
                        </option>
                      </select>
                    </Field>
                    <Field
                      label="School authority privacy email"
                      htmlFor="agreement-order-privacy"
                      required
                    >
                      <Input
                        id="agreement-order-privacy"
                        type="email"
                        maxLength={254}
                        required
                        value={order.privacy_contact}
                        onChange={(e) => changeOrder({ privacy_contact: e.target.value })}
                      />
                    </Field>
                    <Field
                      label="School authority urgent contact email"
                      htmlFor="agreement-order-urgent"
                      required
                    >
                      <Input
                        id="agreement-order-urgent"
                        type="email"
                        maxLength={254}
                        required
                        value={order.urgent_contact}
                        onChange={(e) => changeOrder({ urgent_contact: e.target.value })}
                      />
                    </Field>
                    <p className="text-sm">
                      Eligible first-time authorities receive one 14-day trial after confirmed
                      subscription activation. Your plan renews automatically; cancel before the
                      trial ends to avoid the first charge.
                    </p>
                    {signed && (
                      <p className="text-sm">
                        Saving revised details prepares a new order for acceptance. It does not
                        change your current subscription or previous signed copy.
                      </p>
                    )}
                    {orderDirty && (
                      <p role="status" className="text-sm">
                        Save and review your changed order before accepting.
                      </p>
                    )}
                    <Button
                      type="submit"
                      disabled={busy || (Boolean(agreement.order_details) && !orderDirty)}
                      loading={busy}
                      fullWidth
                    >
                      Save and review order
                    </Button>
                  </form>
                </Card>
              )}
              <Card className="space-y-4 p-5">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="h-5 w-5 text-[var(--color-action)]" />
                  <h2 className="font-bold text-[var(--color-heading)]">Agreement status</h2>
                </div>
                <p role="status" className="font-semibold capitalize">
                  {signed ? 'Accepted and archived' : agreement.status}
                </p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Your active, authenticated school authority administrator account is used for
                  electronic acceptance.
                </p>
                {!complete && (
                  <p role="alert">
                    This agreement package is incomplete. Refresh or contact SafeBus support before
                    accepting.
                  </p>
                )}
                {signed && (
                  <Button type="button" onClick={() => navigate('/admin/settings/billing')}>
                    Continue to billing
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void refresh()}
                >
                  Refresh status
                </Button>
              </Card>
              {eligible && (
                <Card className="p-5">
                  <h2 className="text-lg font-bold text-[var(--color-heading)]">
                    Accept agreement online
                  </h2>
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                    Your acceptance applies to the complete versioned MSA, DPA, Order Form and the
                    incorporated schedules listed above.
                  </p>
                  <form className="mt-4 space-y-4" onSubmit={(e) => void accept(e)}>
                    <Field label="Your full legal name" htmlFor="district-sign-name" required>
                      <Input
                        id="district-sign-name"
                        value={name}
                        required
                        minLength={3}
                        maxLength={160}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </Field>
                    <Field label="Your official title" htmlFor="district-sign-title" required>
                      <Input
                        id="district-sign-title"
                        value={title}
                        required
                        minLength={2}
                        maxLength={120}
                        onChange={(e) => setTitle(e.target.value)}
                      />
                    </Field>
                    <label className="flex min-h-11 items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5"
                        checked={authority}
                        onChange={(e) => setAuthority(e.target.checked)}
                        required
                      />
                      I confirm I have authority to accept this agreement on behalf of{' '}
                      {agreement.tenant_name}.
                    </label>
                    <label className="flex min-h-11 items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        required
                      />
                      I consent to electronic records and electronic acceptance of this contract.
                    </label>
                    <label className="flex min-h-11 items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5"
                        checked={intent}
                        onChange={(e) => setIntent(e.target.checked)}
                        required
                      />
                      I have reviewed the complete document package and intend to bind my school
                      authority to these terms.
                    </label>
                    <Button
                      type="submit"
                      fullWidth
                      disabled={busy || !authority || !consent || !intent}
                      loading={busy}
                    >
                      Accept MSA, DPA and all incorporated schedules
                    </Button>
                  </form>
                </Card>
              )}
              {!signed && !eligible && (
                <Card className="space-y-3 p-5">
                  <ShieldCheck className="h-5 w-5 text-[var(--color-action)]" />
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {!complete
                      ? 'The complete approved document package is not available. Acceptance is disabled.'
                      : mfaStatus.currentLevel !== 'aal2'
                        ? 'Complete MFA to accept this agreement.'
                        : 'The current agreement cannot be accepted in this state.'}
                  </p>
                  {mfaStatus.currentLevel !== 'aal2' && (
                    <Link
                      to="/account/security/mfa"
                      className="font-semibold text-[var(--color-action)] underline"
                    >
                      Verify MFA
                    </Link>
                  )}
                </Card>
              )}
              <Card className="space-y-4 p-5">
                <h2 className="font-bold text-[var(--color-heading)]">
                  Executed agreement archive
                </h2>
                {archive.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">
                    No executed agreements are archived yet.
                  </p>
                ) : (
                  archive.map((r) => (
                    <div
                      key={r.id}
                      className="space-y-2 border-t border-[var(--color-border)] pt-3"
                    >
                      <p className="text-sm font-semibold">
                        Signed {new Date(r.signed_at).toLocaleString('en-CA')}
                      </p>
                      <p className="break-all text-xs text-[var(--color-text-muted)]">
                        Receipt SHA-256: {r.receipt_sha256}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void download(r.id)}
                          leftIcon={<Download className="h-4 w-4" />}
                        >
                          Download executed PDF
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void download(r.id, 'exact')}
                          leftIcon={<Download className="h-4 w-4" />}
                        >
                          Download exact UTF-8 archive
                        </Button>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        The UTF-8 archive preserves the original signed contract text, including
                        accents and non-Latin characters. The PDF is a simplified printable
                        rendering.
                      </p>
                    </div>
                  ))
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
