import { useEffect, useMemo, useState } from 'react';
import { AdminPagination } from '@/components/admin/AdminPagination';
import {
  AdminWriteError,
  AdminWriteMessage,
  BusForm,
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
import { usePaginatedAdminList } from '@/hooks/usePaginatedAdminList';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import { createBus, updateBus } from '@/services/transportationStructureService';
import type { School } from '@/types/organization';
import type { Bus, BusStatus, CreateBusInput, UpdateBusInput } from '@/types/transportation';

const busStatusTone: Record<BusStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  maintenance: 'warning',
  inactive: 'neutral',
  retired: 'danger',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function AdminBusesPage() {
  const { profile } = useAuth();
  const list = usePaginatedAdminList<Bus & { school_name: string | null }>('buses');
  const [schools, setSchools] = useState<School[]>([]);
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

  useEffect(() => {
    void getVisibleSchools().then(setSchools);
  }, []);

  const schoolNames = useMemo(() => {
    return new Map(schools.map((school) => [school.id, school.name]));
  }, [schools]);

  async function handleCreateBus(input: CreateBusInput | UpdateBusInput) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await createBus(input as CreateBusInput);
      setShowCreateForm(false);
      setSuccessMessage('Bus created.');
      await list.reload();
    } catch (createError) {
      setWriteError(createError instanceof Error ? createError.message : 'Unable to create bus.');
    }
  }

  async function handleUpdateBus(input: CreateBusInput | UpdateBusInput) {
    if (!editingBus) return;
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await updateBus(editingBus.id, input as UpdateBusInput);
      setEditingBus(null);
      setSuccessMessage('Bus updated.');
      await list.reload();
    } catch (updateError) {
      setWriteError(updateError instanceof Error ? updateError.message : 'Unable to update bus.');
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Buses"
          title="Visible buses"
          description="Bus records returned by Supabase under the current admin user's RLS permissions."
        />

        {canWrite && (
          <div className="flex">
            <Button type="button" onClick={() => {
              setEditingBus(null);
              setShowCreateForm(true);
              setWriteError(null);
              setSuccessMessage(null);
            }}>
              Add bus
            </Button>
          </div>
        )}

        <AdminWriteMessage message={successMessage} />
        <AdminWriteError message={writeError} />

        {canWrite && showCreateForm && (
          <InlineFormShell title="Add bus">
            <BusForm
              bus={null}
              schools={schools}
              defaultTenantId={profile?.tenant_id ?? null}
              onSubmit={handleCreateBus}
              onCancel={() => setShowCreateForm(false)}
            />
          </InlineFormShell>
        )}

        {canWrite && editingBus && (
          <InlineFormShell title={`Edit bus ${editingBus.bus_number}`}>
            <BusForm
              bus={editingBus}
              schools={schools}
              defaultTenantId={profile?.tenant_id ?? null}
              onSubmit={handleUpdateBus}
              onCancel={() => setEditingBus(null)}
            />
          </InlineFormShell>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="bus-search">
            Search buses
          </label>
          <input
            id="bus-search"
            type="search"
            value={list.searchInput}
            onChange={(event) => list.setSearchInput(event.target.value)}
            placeholder="Search by bus number, plate, status, capacity, or school"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </div>

        {list.loading && (
          <DataState title="Loading buses" message="Fetching bus records visible to you." />
        )}
        {list.error && <DataState title="Unable to load buses" message={list.error} />}
        {!list.loading && !list.error && list.rows.length === 0 && (
          <DataState
            title="No buses visible"
            message="No bus records are available for this account under the current RLS policies."
          />
        )}
        {!list.loading && !list.error && list.rows.length > 0 && (
          <section className="grid gap-4">
            {list.rows.map((bus) => (
              <Card key={bus.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">Bus {bus.bus_number}</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {bus.school_id
                        ? (bus.school_name ?? schoolNames.get(bus.school_id) ?? bus.school_id)
                        : 'No school assigned'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill tone={busStatusTone[bus.status]}>{bus.status}</StatusPill>
                    {canWrite && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => {
                        setShowCreateForm(false);
                        setEditingBus(bus);
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
                    License plate:{' '}
                    <span className="font-semibold text-navy-900">
                      {bus.license_plate ?? 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Capacity:{' '}
                    <span className="font-semibold text-navy-900">
                      {bus.capacity ?? 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Created:{' '}
                    <span className="font-semibold text-navy-900">
                      {formatDate(bus.created_at)}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Bus id: <span className="font-semibold text-navy-900">{bus.id}</span>
                  </p>
                </div>
              </Card>
            ))}
            <AdminPagination page={list.page} pageSize={list.pageSize} totalCount={list.totalCount} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
