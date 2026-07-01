import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { getVisibleSchools, getVisibleTenants } from '@/services/adminOrganizationService';
import type { School, Tenant } from '@/types/organization';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function AdminSchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadSchools() {
      setLoading(true);
      setError(null);

      try {
        const [nextSchools, nextTenants] = await Promise.all([
          getVisibleSchools(),
          getVisibleTenants(),
        ]);

        if (active) {
          setSchools(nextSchools);
          setTenants(nextTenants);
        }
      } catch (schoolError) {
        if (active) {
          setError(schoolError instanceof Error ? schoolError.message : 'Unable to load schools.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadSchools();

    return () => {
      active = false;
    };
  }, []);

  const tenantNames = useMemo(() => {
    return new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  }, [tenants]);

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Schools"
          title="Visible schools"
          description="Schools returned by Supabase under the signed-in admin user's row-level security permissions."
        />

        {loading && (
          <DataState title="Loading schools" message="Fetching schools visible to your account." />
        )}
        {error && <DataState title="Unable to load schools" message={error} />}
        {!loading && !error && schools.length === 0 && (
          <DataState
            title="No schools visible"
            message="No school rows are available for this profile under the current RLS policies."
          />
        )}

        {!loading && !error && schools.length > 0 && (
          <section className="grid gap-4">
            {schools.map((school) => (
              <Card key={school.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-xl font-bold text-navy-900">{school.name}</h2>
                      <StatusPill>{school.status}</StatusPill>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">
                      {school.city ?? 'City not provided'}, {school.province}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-gray-500">
                    Created {formatDate(school.created_at)}
                  </p>
                </div>
                <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                  <p className="text-gray-600">
                    Tenant:{' '}
                    <span className="font-semibold text-navy-900">
                      {tenantNames.get(school.tenant_id) ?? school.tenant_id}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    School id: <span className="font-semibold text-navy-900">{school.id}</span>
                  </p>
                </div>
              </Card>
            ))}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
