import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminWriteError,
  AdminWriteMessage,
  DriverForm,
  InlineFormShell,
} from '@/components/admin/TransportationAdminForms';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { getVisibleProfiles } from '@/services/adminOrganizationService';
import {
  createDriver,
  getVisibleDrivers,
  updateDriver,
} from '@/services/transportationStructureService';
import type { OrganizationProfile } from '@/types/organization';
import type {
  CreateDriverInput,
  Driver,
  DriverStatus,
  UpdateDriverInput,
} from '@/types/transportation';

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
  const { profile } = useAuth();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [profiles, setProfiles] = useState<OrganizationProfile[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

  const loadDrivers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextDrivers, nextProfiles] = await Promise.all([
        getVisibleDrivers(),
        getVisibleProfiles(),
      ]);
      setDrivers(nextDrivers);
      setProfiles(nextProfiles);
    } catch (driversError) {
      setError(driversError instanceof Error ? driversError.message : 'Unable to load drivers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDrivers();
  }, [loadDrivers]);

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

  async function handleCreateDriver(input: CreateDriverInput | UpdateDriverInput) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await createDriver(input as CreateDriverInput);
      setShowCreateForm(false);
      setSuccessMessage('Driver record created.');
      await loadDrivers();
    } catch (createError) {
      setWriteError(
        createError instanceof Error ? createError.message : 'Unable to create driver record.',
      );
    }
  }

  async function handleUpdateDriver(input: CreateDriverInput | UpdateDriverInput) {
    if (!editingDriver) return;
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await updateDriver(editingDriver.id, input as UpdateDriverInput);
      setEditingDriver(null);
      setSuccessMessage('Driver record updated.');
      await loadDrivers();
    } catch (updateError) {
      setWriteError(
        updateError instanceof Error ? updateError.message : 'Unable to update driver record.',
      );
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Drivers"
          title="Visible driver records"
          description="Driver records returned by Supabase under the current admin user's RLS permissions."
        />

        {canWrite && (
          <div className="flex">
            <Button type="button" onClick={() => {
              setEditingDriver(null);
              setShowCreateForm(true);
              setWriteError(null);
              setSuccessMessage(null);
            }}>
              Add driver
            </Button>
          </div>
        )}

        <AdminWriteMessage message={successMessage} />
        <AdminWriteError message={writeError} />

        {canWrite && showCreateForm && (
          <InlineFormShell title="Add driver record">
            <DriverForm
              driver={null}
              profiles={profiles}
              onSubmit={handleCreateDriver}
              onCancel={() => setShowCreateForm(false)}
            />
          </InlineFormShell>
        )}

        {canWrite && editingDriver && (
          <InlineFormShell title="Edit driver record">
            <DriverForm
              driver={editingDriver}
              profiles={profiles}
              onSubmit={handleUpdateDriver}
              onCancel={() => setEditingDriver(null)}
            />
          </InlineFormShell>
        )}

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
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusPill tone={driverStatusTone[driver.status]}>
                        {driver.status}
                      </StatusPill>
                      {canWrite && (
                        <Button type="button" size="sm" variant="secondary" onClick={() => {
                          setShowCreateForm(false);
                          setEditingDriver(driver);
                          setWriteError(null);
                          setSuccessMessage(null);
                        }}>
                          Edit
                        </Button>
                      )}
                    </div>
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
