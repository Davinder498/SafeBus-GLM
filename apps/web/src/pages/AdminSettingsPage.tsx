import { useEffect, useState } from 'react';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/contexts/useAuth';
import { getOrganizationContext } from '@/services/adminOrganizationService';
import type { OrganizationContext } from '@/types/organization';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">{label}</p>
      <p className="mt-2 text-base font-semibold text-navy-900">{value}</p>
    </div>
  );
}

export function AdminSettingsPage() {
  const { profile } = useAuth();
  const [context, setContext] = useState<OrganizationContext>({ tenant: null, school: null });
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
        const nextContext = await getOrganizationContext(profile.tenant_id, profile.school_id);
        if (active) setContext(nextContext);
      } catch (contextError) {
        if (active) {
          setError(
            contextError instanceof Error
              ? contextError.message
              : 'Unable to load organization context.',
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
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Organization context"
          description="Read-only account and organization details loaded through Supabase RLS."
        />

        {loading && (
          <DataState
            title="Loading organization"
            message="Fetching your visible tenant and school details."
          />
        )}
        {error && <DataState title="Unable to load organization" message={error} />}

        {!loading && !error && profile && (
          <>
            <Card className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-navy-900">Current user</h2>
                  <p className="mt-1 text-sm text-gray-600">Signed-in SafeBus profile</p>
                </div>
                <RoleBadge role={profile.role} />
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Name" value={profile.full_name ?? 'Not provided'} />
                <Field label="Email" value={profile.email} />
                <Field label="Profile status" value={profile.status} />
                <Field label="Profile id" value={profile.id} />
              </div>
            </Card>

            <section className="grid gap-5 xl:grid-cols-2">
              <Card className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">Tenant</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      Organization visible to this admin account
                    </p>
                  </div>
                  {context.tenant?.status && <StatusPill>{context.tenant.status}</StatusPill>}
                </div>
                <div className="mt-5 grid gap-4">
                  <Field label="Name" value={context.tenant?.name ?? 'No tenant visible'} />
                  <Field label="Type" value={context.tenant?.type ?? 'Not available'} />
                  <Field label="Tenant id" value={profile.tenant_id ?? 'Not assigned'} />
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">School</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      Linked school, when assigned to the profile
                    </p>
                  </div>
                  {context.school?.status && <StatusPill>{context.school.status}</StatusPill>}
                </div>
                <div className="mt-5 grid gap-4">
                  <Field label="Name" value={context.school?.name ?? 'No school visible'} />
                  <Field
                    label="City / province"
                    value={
                      context.school
                        ? `${context.school.city ?? 'City not provided'}, ${context.school.province}`
                        : 'Not available'
                    }
                  />
                  <Field label="School id" value={profile.school_id ?? 'Not assigned'} />
                </div>
              </Card>
            </section>

            <Card className="border-navy-100 bg-navy-50 p-5">
              <p className="text-sm font-semibold text-navy-900">
                Organization edits and role changes will be handled through secure admin workflows
                in a later milestone.
              </p>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
