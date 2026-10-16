import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Building2, RefreshCw } from 'lucide-react';
import { DashboardLayout, platformNavItems } from '@/components/layout/DashboardLayout';
import { SubscriptionOverview } from '@/components/subscription/SubscriptionOverview';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
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
  fetchPlatformTenantBillingDetail,
  mutatePlatformSubscription,
} from '@/services/subscriptionService';
import type { TenantSubscription } from '@/types/subscription';

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
  const [invitations, setInvitations] = useState<PlatformFirstAdminInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaries, billing, invitationRows] = await Promise.all([
        fetchPlatformTenantSummaries(),
        fetchPlatformTenantBillingDetail(tenantId),
        fetchPlatformFirstAdminInvitations(),
      ]);
      const tenantSummary = summaries.find((item) => item.tenant_id === tenantId) ?? null;
      setSummary(tenantSummary);
      setSubscription(billing);
      setInvitations(invitationRows.filter((item) => item.tenant_id === tenantId));
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
          description="Manage tenant onboarding, lifecycle, and subscription oversight without accessing student, guardian, driver, route, or location records."
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
          {invitations[0]?.status === 'expired' && (
            <Button
              type="button"
              className="mt-4"
              variant="secondary"
              disabled={saving !== null}
              loading={saving === 'reissue'}
              onClick={() =>
                void run(
                  'reissue',
                  () => updateInvitation(invitations[0].invitation_id, 'reissue'),
                  'A new invitation was accepted by the email provider. Account activation is pending.',
                )
              }
            >
              Reissue expired invitation
            </Button>
          )}
          <p className="mt-3 text-sm text-slate-500">
            Email-provider acceptance does not confirm delivery or account activation.
          </p>
          {invitations.length > 0 && (
            <details className="mt-4 rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-navy-800">
                Invitation history
              </summary>
              <ul className="mt-3 space-y-3">
                {invitations.map((i) => (
                  <li key={i.invitation_id} className="text-sm text-slate-600">
                    {i.status} · provider {i.delivery_status} · last sent{' '}
                    {i.last_sent_at
                      ? new Date(i.last_sent_at).toLocaleDateString('en-CA')
                      : 'not sent'}{' '}
                    · expires {new Date(i.expires_at).toLocaleDateString('en-CA')}
                  </li>
                ))}
              </ul>
            </details>
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
          <h2 className="text-lg font-bold text-slate-900">Tenant-managed billing</h2>
          <p className="mt-2 text-sm text-slate-600">
            The tenant administrator selects their billing cycle and bus allowance, manages
            payments, and controls renewal.
          </p>
          {subscription.configured && (
            <Button
              className="mt-4"
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
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
