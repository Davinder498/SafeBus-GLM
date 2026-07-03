import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { getVisibleProfiles } from '@/services/adminOrganizationService';
import { getVisibleDrivers } from '@/services/transportationStructureService';
import type { OrganizationProfile } from '@/types/organization';
import type { Driver, DriverStatus } from '@/types/transportation';

const driverStatusTone: Record<DriverStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
  suspended: 'warning',
  archived: 'danger',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function AdminDriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [profiles, setProfiles] = useState<OrganizationProfile[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadDrivers() {
      setLoading(true);
      setError(null);

      try {
        const [nextDrivers, nextProfiles] = await Promise.all([
          getVisibleDrivers(),
          getVisibleProfiles(),
        ]);

        if (active) {
          setDrivers(nextDrivers);
          setProfiles(nextProfiles);
        }
      } catch (driversError) {
        if (active) {
          setError(
            driversError instanceof Error ? driversError.message : 'Unable to load drivers.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadDrivers();

    return () => {
      active = false;
    };
  }, []);

  const profileLabels = useMemo(() => {
    return new Map(
      profiles.map((profile) => [
        profile.id,
        {
          fullName: profile.full_name,
          email: profile.email,
          label: `${profile.full_name} (${profile.email})`,
        },
      ]),
    );
  }, [profiles]);

  const filteredDrivers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return drivers;

    return drivers.filter((driver) =>
      [
        driver.employee_number,
        driver.phone,
        driver.status,
        profileLabels.get(driver.profile_id)?.label,
        driver.profile_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [drivers, profileLabels, query]);

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Drivers"
          title="Visible driver records"
          description="Read-only driver records returned by Supabase under the current admin user's RLS permissions."
        />

        <Card className="border-navy-100 bg-navy-50 p-5">
          <p className="text-sm font-semibold text-navy-900">
            Driver creation and assignment workflows will be added in a later milestone.
          </p>
        </Card>

        <div>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="driver-search">
            Search drivers
          </label>
          <input
            id="driver-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, phone, employee number, or status"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </div>

        {loading && (
          <DataState title="Loading drivers" message="Fetching driver records visible to you." />
        )}
        {error && <DataState title="Unable to load drivers" message={error} />}
        {!loading && !error && drivers.length === 0 && (
          <DataState
            title="No drivers visible"
            message="No driver records are available for this account under the current RLS policies."
          />
        )}
        {!loading && !error && drivers.length > 0 && filteredDrivers.length === 0 && (
          <DataState
            title="No drivers match"
            message="Try a different name, phone, employee number, or status search."
          />
        )}

        {!loading && !error && filteredDrivers.length > 0 && (
          <section className="grid gap-4">
            {filteredDrivers.map((driver) => {
              const profile = profileLabels.get(driver.profile_id);

              return (
                <Card key={driver.id} className="p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-xl font-bold text-navy-900">
                        {profile?.fullName ?? driver.profile_id}
                      </h2>
                      <p className="mt-1 text-sm text-gray-600">
                        {profile?.email ?? 'Profile details not visible'}
                      </p>
                    </div>
                    <StatusPill tone={driverStatusTone[driver.status]}>{driver.status}</StatusPill>
                  </div>
                  <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                    <p className="text-gray-600">
                      Phone:{' '}
                      <span className="font-semibold text-navy-900">
                        {driver.phone ?? 'Not assigned'}
                      </span>
                    </p>
                    <p className="text-gray-600">
                      Employee number:{' '}
                      <span className="font-semibold text-navy-900">
                        {driver.employee_number ?? 'Not assigned'}
                      </span>
                    </p>
                    <p className="text-gray-600">
                      Created:{' '}
                      <span className="font-semibold text-navy-900">
                        {formatDate(driver.created_at)}
                      </span>
                    </p>
                    <p className="text-gray-600">
                      Driver id: <span className="font-semibold text-navy-900">{driver.id}</span>
                    </p>
                  </div>
                </Card>
              );
            })}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
