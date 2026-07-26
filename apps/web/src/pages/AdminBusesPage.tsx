import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AdminWriteError, AdminWriteMessage } from '@/components/admin/TransportationAdminForms';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { usePaginatedAdminList } from '@/hooks/usePaginatedAdminList';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import { deleteBus } from '@/services/transportationStructureService';
import type { School } from '@/types/organization';
import type { Bus } from '@/types/transportation';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function AdminBusesPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const list = usePaginatedAdminList<Bus & { school_name: string | null }>('buses');
  const [schools, setSchools] = useState<School[]>([]);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deletingBus, setDeletingBus] = useState<Bus | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);
  const canDelete =
    !!profile && (profile.role === 'tenant_admin' || profile.role === 'platform_super_admin');

  useEffect(() => {
    void getVisibleSchools()
      .then(setSchools)
      .catch(() => setSchools([]));
  }, []);

  const schoolNames = useMemo(
    () => new Map(schools.map((school) => [school.id, school.name])),
    [schools],
  );

  async function handleDeleteBus() {
    if (!deletingBus || deleting) return;
    setDeleting(true);
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await deleteBus(deletingBus.id);
      setDeletingBus(null);
      setSuccessMessage('Bus deleted.');
      await list.reload();
    } catch (deleteError) {
      setWriteError(deleteError instanceof Error ? deleteError.message : 'Unable to delete bus.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-6">
        <PageHeader
          eyebrow="Buses"
          title="Visible buses"
          description="Manage fleet records, route trips, drivers, and student rosters."
        />

        {canWrite && (
          <div className="flex">
            <Button type="button" onClick={() => navigate('/admin/buses/new')}>
              Add bus
            </Button>
          </div>
        )}

        <AdminWriteMessage message={successMessage} />
        <AdminWriteError message={writeError} />

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
                    {canWrite && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => navigate(`/admin/buses/${bus.id}?tab=details`)}
                      >
                        Edit
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setDeletingBus(bus);
                          setWriteError(null);
                          setSuccessMessage(null);
                        }}
                      >
                        Delete
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
            <AdminPagination
              page={list.page}
              pageSize={list.pageSize}
              totalCount={list.totalCount}
              onPageChange={list.setPage}
              onPageSizeChange={list.setPageSize}
            />
          </section>
        )}
        <ConfirmDialog
          open={!!deletingBus}
          title={`Delete bus ${deletingBus?.bus_number ?? ''}`}
          description="This permanently deletes the bus record. This action cannot be undone."
          confirmLabel="Delete bus"
          destructive
          busy={deleting}
          onConfirm={() => void handleDeleteBus()}
          onCancel={() => setDeletingBus(null)}
        />
      </div>
    </DashboardLayout>
  );
}
