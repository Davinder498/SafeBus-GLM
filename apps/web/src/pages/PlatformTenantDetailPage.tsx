import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Building2, RefreshCw } from 'lucide-react';
import { DashboardLayout, platformNavItems } from '@/components/layout/DashboardLayout';
import { SubscriptionOverview } from '@/components/subscription/SubscriptionOverview';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  emergencyRecovery,
  fetchPlatformFirstAdminInvitations,
  fetchPlatformTenantSummaries,
  updateInvitation,
  updateTenantLifecycle,
  type PlatformFirstAdminInvitation,
  type PlatformTenantSummary,
} from '@/services/onboardingService';
import {
  fetchApprovedSubscriptionPrices,
  fetchPlatformTenantBillingDetail,
  mutatePlatformSubscription,
} from '@/services/subscriptionService';
import type {
  SubscriptionContractInput,
  SubscriptionPrice,
  TenantSubscription,
} from '@/types/subscription';

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-navy-500';

function readiness(summary: PlatformTenantSummary) {
  return [
    ['Buses', summary.has_buses],
    ['Drivers', summary.has_drivers],
    ['Routes', summary.has_routes],
    ['Students', summary.has_students],
  ] as const;
}

export function PlatformTenantDetailPage() {
  const { tenantId = '' } = useParams();
  const [summary, setSummary] = useState<PlatformTenantSummary | null>(null);
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [prices, setPrices] = useState<SubscriptionPrice[]>([]);
  const [invitations, setInvitations] = useState<PlatformFirstAdminInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<SubscriptionContractInput, 'tenantId'>>({
    priceId: '',
    billingEmail: '',
    licensedBusCount: 0,
    purchaseOrderReference: '',
    daysUntilDue: 30,
    trialEnd: '',
    autoRenew: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaries, billing, invitationRows] = await Promise.all([
        fetchPlatformTenantSummaries(),
        fetchPlatformTenantBillingDetail(tenantId),
        fetchPlatformFirstAdminInvitations(),
      ]);
      let approvedPrices: SubscriptionPrice[] = [];
      try {
        approvedPrices = await fetchApprovedSubscriptionPrices();
      } catch {
        setError('Tenant details loaded, but approved Stripe prices are currently unavailable.');
      }
      const tenantSummary = summaries.find((item) => item.tenant_id === tenantId) ?? null;
      setSummary(tenantSummary);
      setSubscription(billing);
      setPrices(approvedPrices);
      setInvitations(invitationRows.filter((item) => item.tenant_id === tenantId));
      setForm({
        priceId: billing.priceId ?? approvedPrices[0]?.id ?? '',
        billingEmail: billing.billingEmail ?? tenantSummary?.first_tenant_admin_email ?? '',
        licensedBusCount: billing.licensedBusCount ?? billing.activeBusCount,
        purchaseOrderReference: billing.purchaseOrderReference ?? '',
        daysUntilDue: billing.daysUntilDue ?? 30,
        trialEnd: billing.trialEnd?.slice(0, 10) ?? '',
        autoRenew: !billing.cancelAtPeriodEnd,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load tenant details.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingInvitation = useMemo(
    () => invitations.find((item) => ['pending', 'resent', 'failed'].includes(item.status)),
    [invitations],
  );

  async function run(action: string, task: () => Promise<unknown>, success: string) {
    if (saving) return;
    setSaving(action);
    setError(null);
    setMessage(null);
    try {
      await task();
      setMessage(success);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The requested change was not confirmed.');
    } finally {
      setSaving(null);
    }
  }

  async function saveContract() {
    const action = subscription?.configured ? 'update' : 'create';
    await run(
      action,
      () => mutatePlatformSubscription(action, tenantId, form),
      subscription?.configured ? 'Subscription updated.' : 'Subscription created.',
    );
  }

  if (loading && !summary) {
    return (
      <DashboardLayout title="Platform Admin" portal="admin" navItems={platformNavItems}>
        <DataState title="Loading tenant" message="Checking onboarding and subscription details." />
      </DashboardLayout>
    );
  }

  if (!summary || !subscription) {
    return (
      <DashboardLayout title="Platform Admin" portal="admin" navItems={platformNavItems}>
        <DataState title="Tenant unavailable" message={error ?? 'The tenant could not be found.'} />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Platform Admin" portal="admin" navItems={platformNavItems}>
      <div className="space-y-6">
        <Link
          to="/admin/tenants"
          className="inline-flex items-center gap-2 text-sm font-semibold text-navy-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to tenants
        </Link>
        <PageHeader
          eyebrow="Tenant detail"
          title={summary.tenant_name}
          description="Manage tenant onboarding, lifecycle, and the annual per-bus contract without accessing student, guardian, driver, route, or location records."
          icon={<Building2 className="h-6 w-6" />}
          action={<StatusPill>{summary.tenant_status}</StatusPill>}
        />

        {message && (
          <Card className="border-success-200 bg-success-50 p-4">
            <p className="text-sm font-semibold text-success-700" role="status">
              {message}
            </p>
          </Card>
        )}
        {error && (
          <Card className="border-danger-200 bg-danger-50 p-4">
            <p className="text-sm font-semibold text-danger-700" role="alert">
              {error}
            </p>
          </Card>
        )}

        <Card className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Tenant controls</h2>
              <p className="mt-1 text-sm text-slate-600">
                {summary.tenant_type} · created{' '}
                {new Date(summary.tenant_created_at).toLocaleDateString('en-CA')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {summary.tenant_status === 'active' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={saving === 'suspend'}
                  disabled={saving !== null}
                  onClick={() =>
                    void run(
                      'suspend',
                      () => updateTenantLifecycle(tenantId, 'suspended'),
                      'Tenant suspended.',
                    )
                  }
                >
                  Suspend
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={saving === 'reactivate'}
                  disabled={saving !== null}
                  onClick={() =>
                    void run(
                      'reactivate',
                      () => updateTenantLifecycle(tenantId, 'active'),
                      'Tenant reactivated.',
                    )
                  }
                >
                  Reactivate
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                loading={saving === 'disable'}
                disabled={saving !== null}
                onClick={() =>
                  void run(
                    'disable',
                    () => updateTenantLifecycle(tenantId, 'disabled'),
                    'Tenant disabled.',
                  )
                }
              >
                Disable
              </Button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {readiness(summary).map(([label, ready]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {label}
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {ready ? 'Configured' : 'Not configured'}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-bold text-slate-900">First tenant administrator</h2>
          <p className="mt-2 text-sm text-slate-600">
            {summary.first_tenant_admin_name ?? 'Not assigned'} ·{' '}
            {summary.first_tenant_admin_email ?? 'No email'} · {summary.tenant_admin_status}
          </p>
          {invitations[0] && (
            <p className="mt-2 text-sm font-semibold text-slate-700">
              Invitation {invitations[0].status} · delivery {invitations[0].delivery_status}
            </p>
          )}
          {pendingInvitation && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={saving === 'resend'}
                disabled={saving !== null}
                onClick={() =>
                  void run(
                    'resend',
                    () => updateInvitation(pendingInvitation.invitation_id, 'resend'),
                    `A new password setup email was sent to ${summary.first_tenant_admin_email ?? 'the first administrator'}.`,
                  )
                }
              >
                Resend invitation
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                loading={saving === 'cancel-invite'}
                disabled={saving !== null}
                onClick={() =>
                  void run(
                    'cancel-invite',
                    () => updateInvitation(pendingInvitation.invitation_id, 'cancel'),
                    'Invitation cancelled.',
                  )
                }
              >
                Cancel invitation
              </Button>
            </div>
          )}
          {summary.tenant_status === 'active' &&
            ['suspended', 'disabled'].includes(summary.tenant_admin_status) &&
            summary.first_tenant_admin_profile_id && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-4"
                loading={saving === 'recover-admin'}
                disabled={saving !== null}
                onClick={() =>
                  void run(
                    'recover-admin',
                    () =>
                      emergencyRecovery(summary.first_tenant_admin_profile_id!, summary.tenant_id),
                    `Emergency access restored for ${summary.first_tenant_admin_email ?? 'the first administrator'}.`,
                  )
                }
              >
                Emergency recovery
              </Button>
            )}
        </Card>

        <div>
          <h2 className="mb-4 text-xl font-bold text-slate-900">Subscription</h2>
          <SubscriptionOverview subscription={subscription} />
        </div>

        <Card className="p-5">
          <h2 className="text-lg font-bold text-slate-900">
            {subscription.configured ? 'Update annual contract' : 'Create annual contract'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Changes use approved CAD annual prices. Quantity changes do not create mid-term
            prorations.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Annual per-bus price" htmlFor="subscription-price" required>
              <select
                id="subscription-price"
                className={inputClass}
                value={form.priceId}
                onChange={(event) => setForm({ ...form, priceId: event.target.value })}
                required
              >
                <option value="">Select an approved price</option>
                {prices.map((price) => (
                  <option key={price.id} value={price.id}>
                    {price.name} ·{' '}
                    {(price.unitAmount / 100).toLocaleString('en-CA', {
                      style: 'currency',
                      currency: 'CAD',
                    })}{' '}
                    / bus / year
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Billing email" htmlFor="billing-email" required>
              <input
                id="billing-email"
                type="email"
                className={inputClass}
                value={form.billingEmail}
                onChange={(event) => setForm({ ...form, billingEmail: event.target.value })}
                maxLength={320}
                required
              />
            </Field>
            <Field label="Contracted active-bus allowance" htmlFor="licensed-buses" required>
              <input
                id="licensed-buses"
                type="number"
                className={inputClass}
                min={subscription.activeBusCount}
                max={10000}
                value={form.licensedBusCount}
                onChange={(event) =>
                  setForm({ ...form, licensedBusCount: Number(event.target.value) })
                }
                required
              />
            </Field>
            <Field label="Invoice due days" htmlFor="invoice-due-days" required>
              <input
                id="invoice-due-days"
                type="number"
                className={inputClass}
                min={1}
                max={90}
                value={form.daysUntilDue}
                onChange={(event) => setForm({ ...form, daysUntilDue: Number(event.target.value) })}
                required
              />
            </Field>
            <Field label="Purchase order / reference" htmlFor="purchase-order" hint="Optional">
              <input
                id="purchase-order"
                className={inputClass}
                value={form.purchaseOrderReference}
                onChange={(event) =>
                  setForm({ ...form, purchaseOrderReference: event.target.value })
                }
                maxLength={100}
              />
            </Field>
            <Field label="Trial end" htmlFor="trial-end" hint="Optional, future date">
              <input
                id="trial-end"
                type="date"
                className={inputClass}
                value={form.trialEnd}
                onChange={(event) => setForm({ ...form, trialEnd: event.target.value })}
              />
            </Field>
          </div>
          <label className="mt-4 flex items-center gap-3 text-sm font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={form.autoRenew}
              onChange={(event) => setForm({ ...form, autoRenew: event.target.checked })}
            />
            Renew automatically at the end of the annual term
          </label>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              loading={saving === 'create' || saving === 'update'}
              disabled={saving !== null || prices.length === 0}
              onClick={() => void saveContract()}
            >
              {subscription.configured ? 'Save contract' : 'Create subscription'}
            </Button>
            {subscription.configured && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  loading={saving === 'reconcile'}
                  disabled={saving !== null}
                  leftIcon={<RefreshCw className="h-4 w-4" />}
                  onClick={() =>
                    void run(
                      'reconcile',
                      () => mutatePlatformSubscription('reconcile', tenantId),
                      'Subscription reconciled with Stripe.',
                    )
                  }
                >
                  Sync from Stripe
                </Button>
                {subscription.cancelAtPeriodEnd ? (
                  <Button
                    type="button"
                    variant="secondary"
                    loading={saving === 'resume'}
                    disabled={saving !== null}
                    onClick={() =>
                      void run(
                        'resume',
                        () => mutatePlatformSubscription('resume', tenantId),
                        'Annual renewal resumed.',
                      )
                    }
                  >
                    Resume renewal
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    loading={saving === 'schedule_cancel'}
                    disabled={saving !== null}
                    onClick={() =>
                      void run(
                        'schedule_cancel',
                        () => mutatePlatformSubscription('schedule_cancel', tenantId),
                        'Cancellation scheduled for the end of the term.',
                      )
                    }
                  >
                    End after current term
                  </Button>
                )}
              </>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
