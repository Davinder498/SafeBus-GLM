import { useNavigate } from 'react-router';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { usePaginatedAdminList } from '@/hooks/usePaginatedAdminList';
import type { Bus } from '@/types/transportation';

function statusLabel(status: Bus['status']) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(status: Bus['status']): 'success' | 'warning' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'maintenance') return 'warning';
  return 'neutral';
}

export function AdminBusesPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const list = usePaginatedAdminList<Bus>('buses');

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

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
          description="Select a bus to manage its details, QR, route trips, and student roster."
        />

        {canWrite && (
          <div className="flex">
            <Button type="button" onClick={() => navigate('/admin/buses/new')}>
              Add bus
            </Button>
          </div>
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
            placeholder="Search by bus number, plate, or status"
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
              <Card key={bus.id} className="p-5" data-testid="admin-bus-card">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-navy-900">Bus {bus.bus_number}</h2>
                      <StatusPill tone={statusTone(bus.status)} dot>
                        {statusLabel(bus.status)}
                      </StatusPill>
                    </div>
                    <p className="mt-2 text-sm text-gray-600">
                      Plate:{' '}
                      <span className="font-semibold text-navy-900">
                        {bus.license_plate ?? 'Not assigned'}
                      </span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full sm:w-auto"
                    aria-label={`View bus ${bus.bus_number}`}
                    onClick={() => navigate(`/admin/buses/${bus.id}?tab=details`)}
                  >
                    View
                  </Button>
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
      </div>
    </DashboardLayout>
  );
}
