import { RetentionPanel } from '@/components/admin/RetentionPanel';
import { AppearanceSettingsCard } from '@/components/settings/AppearanceToggle';
import { AccountSecurityLinkCard } from '@/components/settings/AccountSecurityLinkCard';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { AdminSettingsNav } from '@/components/settings/AdminSettingsNav';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/contexts/useAuth';
import { getCurrentTenant } from '@/services/adminOrganizationService';
import type { Tenant } from '@/types/organization';
import { schoolAuthorityTypeLabel } from '@/utils/schoolAuthority';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">{label}</p>
      <p className="mt-2 break-all text-base font-semibold text-navy-900">{value}</p>
    </div>
  );
}

export function AdminSettingsPage() {
  const { profile } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadContext() {
      if (!profile) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const nextTenant = await getCurrentTenant(profile.tenant_id);
        if (active) setTenant(nextTenant);
      } catch (contextError) {
        if (active) {
          setError(
            contextError instanceof Error
              ? contextError.message
              : 'Unable to load school authority context.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadContext();

    return () => {
      active = false;
    };
  }, [profile]);

  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-6">
        <PageHeader
          eyebrow="Administration"
          title="Settings"
          description="Review your account access and school authority details."
        />

        <AdminSettingsNav role={profile?.role} />
        <AppearanceSettingsCard />
        <AccountSecurityLinkCard />
        {profile?.role === 'tenant_admin' ? (
          <Card className="space-y-4 p-5" data-testid="tenant-data-management">
            <div>
              <h2 className="text-xl font-bold text-navy-900">School authority data</h2>
              <p className="mt-2 text-sm text-slate-600">
                Your authority controls its transportation records. Download the supported directories
                or manage individual records using the existing pages. Only authorized records can be
                deleted; trip history, legal holds, audit records and supplier backups are handled
                separately under applicable retention rules.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { to: '/admin/students', label: 'Students' },
                { to: '/admin/guardians', label: 'Guardians' },
                { to: '/admin/drivers', label: 'Drivers' },
                { to: '/admin/buses', label: 'Buses' },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="flex min-h-11 items-center rounded-lg border border-slate-200 px-4 py-3 font-semibold text-navy-700 hover:bg-navy-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
                >
                  {item.label} — view or download CSV
                </Link>
              ))}
            </div>
            <Link to="/admin/records-disposal" className="inline-flex min-h-11 items-center font-semibold text-navy-700 underline">
              Review record preservation and disposal
            </Link>
            <p className="text-sm text-slate-600">
              These downloads are filtered directory exports, not a complete legal archive or
              school-authority-wide deletion. To request account closure, or access records outside
              the available downloads, <Link className="font-semibold text-navy-700 underline" to="/admin/settings/support">contact SafeBus support</Link>.
              Closing an account does not immediately erase legally retained records or backups.
            </p>
          </Card>
        ) : (
          <Link to="/admin/records-disposal" className="font-semibold text-navy-700 underline">
            Records disposal and preservation
          </Link>
        )>
        <RetentionPanel />

        {loading && (
          <DataState
            title="Loading school authority"
            message="Fetching your school authority details."
          />
        )}
        {error && <DataState title="Unable to load school authority" message={error} />}

        {!loading && !error && profile && (
          <>
            <Card className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-navy-900">Current user</h2>
                </div>
                <RoleBadge role={profile.role} />
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Name" value={profile.full_name ?? 'Not provided'} />
                <Field label="Email" value={profile.email} />
                <Field label="Profile status" value={profile.status} />
              </div>
            </Card>

            <section>
              <Card className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      School authority
                    </p>
                    <h2 className="mt-1 text-xl font-bold text-navy-900">
                      {tenant?.name ?? 'No school authority assigned'}
                    </h2>
                  </div>
                  {tenant?.status && <StatusPill>{tenant.status}</StatusPill>}
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <Field
                    label="Type"
                    value={tenant ? schoolAuthorityTypeLabel(tenant.type) : 'Not available'}
                  />
                </div>
              </Card>
            </section>

            <Card className="border-navy-100 bg-navy-50 p-5">
              <p className="text-sm font-semibold text-navy-900">
                These details are read-only. School authority changes and access updates are managed
                by an authorized school authority administrator or the SafeBus platform team.
              </p>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
