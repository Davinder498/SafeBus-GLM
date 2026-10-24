import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Building2, ChevronRight, Search } from 'lucide-react';
import { DashboardLayout, platformNavItems } from '@/components/layout/DashboardLayout';
import { TenantInvitationWizard } from '@/components/subscription/TenantInvitationWizard';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { Field } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  fetchPlatformTenantSummaries,
  type PlatformTenantSummary,
} from '@/services/onboardingService';
import { fetchPlatformBillingSummaries, formatBillingDate } from '@/services/subscriptionService';
import type { PlatformBillingSummary } from '@/types/subscription';

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm';
export function PlatformTenantsPage() {
  const [tenants, setTenants] = useState<PlatformTenantSummary[]>([]);
  const [billing, setBilling] = useState<PlatformBillingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [invitation, setInvitation] = useState('all');
  const [subscription, setSubscription] = useState('all');
  const [setup, setSetup] = useState('all');
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.allSettled([
        fetchPlatformTenantSummaries(),
        fetchPlatformBillingSummaries(),
      ]);
      if (results[0].status === 'rejected') throw results[0].reason;
      setTenants(results[0].value);
      if (results[1].status === 'fulfilled') setBilling(results[1].value);
      else {
        setBilling([]);
        setError(
          'School authority list loaded. Subscription summaries are temporarily unavailable.',
        );
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load().catch(() =>
      setError('Unable to load school authority onboarding. Refresh to try again.'),
    );
  }, []);
  const byTenant = useMemo(() => new Map(billing.map((b) => [b.tenantId, b])), [billing]);
  const visible = tenants.filter((t) => {
    const b = byTenant.get(t.tenant_id);
    return (
      [t.tenant_name, t.first_tenant_admin_name, t.first_tenant_admin_email]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase().trim()) &&
      (invitation === 'all' || t.latest_invitation_status === invitation) &&
      (subscription === 'all' ||
        (b ? (b.subscriptionExempt ? 'exempt' : (b.status ?? 'none')) : 'unknown') ===
          subscription) &&
      (setup === 'all' || t.setup_readiness === setup)
    );
  });
  return (
    <DashboardLayout title="Platform Admin" portal="admin" navItems={platformNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Platform onboarding"
          title="School authority onboarding"
          description="Welcome new school authorities and follow their progress from invitation to an operational fleet."
          icon={<Building2 className="h-6 w-6" />}
        />
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[
            ['School authorities', tenants.length],
            [
              'Awaiting activation',
              tenants.filter((t) => t.tenant_admin_status === 'invited').length,
            ],
            ['Trial subscriptions', billing.filter((b) => b.status === 'trialing').length],
          ].map(([label, value]) => (
            <Card key={label} className="p-3 sm:p-5">
              <p className="text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
              <p className="mt-2 text-2xl font-bold text-navy-900 sm:text-3xl">
                {loading ? '—' : value}
              </p>
            </Card>
          ))}
        </div>
        <TenantInvitationWizard onCreated={load} />
        <section aria-labelledby="tenant-directory-heading" className="space-y-4">
          <div>
            <h2 id="tenant-directory-heading" className="text-xl font-bold text-navy-900">
              Your school authorities
            </h2>
          </div>
          <Card className="p-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Search school authorities" htmlFor="tenant-search">
                <div className="relative">
                  <Search aria-hidden className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    id="tenant-search"
                    className={`${inputClass} pl-9`}
                    placeholder="School authority or administrator"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </Field>
              <Field label="Invitation" htmlFor="invitation-filter">
                <select
                  id="invitation-filter"
                  className={inputClass}
                  value={invitation}
                  onChange={(e) => setInvitation(e.target.value)}
                >
                  {['all', 'pending', 'resent', 'activated', 'expired', 'cancelled', 'failed'].map(
                    (s) => (
                      <option key={s} value={s}>
                        {s === 'all' ? 'All invitations' : s}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Subscription" htmlFor="subscription-filter">
                <select
                  id="subscription-filter"
                  className={inputClass}
                  value={subscription}
                  onChange={(e) => setSubscription(e.target.value)}
                >
                  {[
                    'all',
                    'none',
                    'exempt',
                    'trialing',
                    'active',
                    'past_due',
                    'canceled',
                    'unpaid',
                    'paused',
                    'incomplete',
                    'incomplete_expired',
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s === 'all'
                        ? 'All subscriptions'
                        : s === 'none'
                          ? 'Not subscribed'
                          : s.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Setup progress" htmlFor="setup-filter">
                <select
                  id="setup-filter"
                  className={inputClass}
                  value={setup}
                  onChange={(e) => setSetup(e.target.value)}
                >
                  {['all', 'not_started', 'in_progress', 'ready'].map((s) => (
                    <option key={s} value={s}>
                      {s === 'all' ? 'All setup stages' : s.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>
          {error && (
            <p role="alert" className="rounded-lg bg-warning-50 p-4 text-sm text-warning-800">
              {error}
            </p>
          )}
          {loading ? (
            <DataState
              title="Loading school authorities"
              message="Checking onboarding and subscription status."
            />
          ) : visible.length === 0 ? (
            <DataState
              title={
                tenants.length ? 'No matching school authorities' : 'No school authorities yet'
              }
              message={
                tenants.length
                  ? 'Try another search or filter.'
                  : 'Invite your first school authority above.'
              }
            />
          ) : (
            <Card className="relative overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <caption className="sr-only">
                    School authority onboarding and subscription directory
                  </caption>
                  <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {[
                        'School authority',
                        'First administrator',
                        'Subscription',
                        'Active buses',
                        'Next date',
                        '',
                      ].map((h, i) => (
                        <th key={i} scope="col" className="px-5 py-4">
                          {h || <span className="sr-only">Actions</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map((t) => {
                      const b = byTenant.get(t.tenant_id);
                      return (
                        <tr key={t.tenant_id} className="hover:bg-slate-50/70">
                          <td className="px-5 py-5">
                            <Link
                              className="font-bold text-navy-800 hover:underline"
                              to={`/admin/tenants/${t.tenant_id}`}
                            >
                              {t.tenant_name}
                            </Link>
                            <p className="mt-1 text-xs text-slate-500">
                              {t.tenant_type.replaceAll('_', ' ')} · {t.tenant_status}
                            </p>
                            <p className="mt-1 text-xs text-slate-600">
                              {t.setup_readiness.replaceAll('_', ' ')}
                            </p>
                          </td>
                          <td className="px-5 py-5">
                            <p className="font-medium">
                              {t.first_tenant_admin_name ?? 'Not assigned'}
                            </p>
                            <p className="mt-1 break-all text-xs text-slate-500">
                              {t.first_tenant_admin_email}
                            </p>
                            <p className="mt-2 text-xs text-slate-600">
                              {t.tenant_admin_status === 'invited'
                                ? 'Password setup pending'
                                : t.tenant_admin_status}{' '}
                              · invitation {t.latest_invitation_status}
                            </p>
                          </td>
                          <td className="px-5 py-5">
                            <StatusPill
                              tone={b?.warning ? 'warning' : b?.configured ? 'info' : 'neutral'}
                            >
                              {b
                                ? b.subscriptionExempt
                                  ? 'Testing · exempt'
                                  : (b.status?.replaceAll('_', ' ') ?? 'Not subscribed')
                                : 'Unavailable'}
                            </StatusPill>
                          </td>
                          <td className="px-5 py-5 font-semibold">
                            {b
                              ? `${b.activeBusCount} / ${b.subscriptionExempt ? 'Unlimited' : (b.licensedBusCount ?? '—')}`
                              : '—'}
                          </td>
                          <td className="px-5 py-5">
                            <p className="text-xs text-slate-500">
                              {b?.status === 'trialing' ? 'Trial ends' : 'Term ends'}
                            </p>
                            <p className="mt-1">
                              {formatBillingDate(
                                b?.status === 'trialing'
                                  ? (b.trialEnd ?? null)
                                  : (b?.currentPeriodEnd ?? null),
                              )}
                            </p>
                          </td>
                          <td className="px-5 py-5">
                            <Link
                              className="inline-flex items-center gap-1 font-semibold text-navy-700"
                              aria-label={`View school authority ${t.tenant_name}`}
                              to={`/admin/tenants/${t.tenant_id}`}
                            >
                              View school authority
                              <ChevronRight className="h-4 w-4" aria-hidden />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
