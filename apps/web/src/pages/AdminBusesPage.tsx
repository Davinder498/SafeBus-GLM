import { useEffect, useMemo, useState } from 'react';
import { BusFront, ChevronRight } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
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
import {
  fetchAdminBusServices,
  type BusServiceOption,
} from '@/services/studentBusAssignmentService';
import type { AdminBus } from '@/types/transportation';

function statusLabel(status: AdminBus['status']) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function statusTone(status: AdminBus['status']): 'success' | 'warning' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'maintenance') return 'warning';
  return 'neutral';
}

export function AdminBusesPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const list = usePaginatedAdminList<AdminBus>('buses');
  const [busServices, setBusServices] = useState<BusServiceOption[] | null>(null);
  const [routeSummaryUnavailable, setRouteSummaryUnavailable] = useState(false);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

  useEffect(() => {
    let active = true;
    void fetchAdminBusServices()
      .then((services) => {
        if (active) setBusServices(services);
      })
      .catch((error: unknown) => {
        if (active) setRouteSummaryUnavailable(true);
        if (import.meta.env.DEV) {
          console.warn('[AdminBusesPage] Unable to load route summaries.', error);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const routeNamesByBus = useMemo(() => {
    const grouped = new Map<string, string[]>();
    (busServices ?? []).forEach((service) => {
      if (service.status !== 'active') return;
      const routeNames = grouped.get(service.bus_id) ?? [];
      if (!routeNames.includes(service.route_name)) routeNames.push(service.route_name);
      grouped.set(service.bus_id, routeNames);
    });
    return grouped;
  }, [busServices]);

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
          description="Select a bus to manage its details, QR, route trips, planned drivers, and student roster."
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
            placeholder="Search by bus number, fleet number, plate, school, or status"
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
          <section className="space-y-4" aria-label="Buses">
            <Card className="overflow-hidden">
              <div
                aria-hidden="true"
                className="hidden grid-cols-[minmax(0,1.35fr)_minmax(0,.7fr)_minmax(0,.9fr)_minmax(0,.8fr)_1.25rem] gap-4 border-b border-slate-200 bg-slate-50/80 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid"
              >
                <span>Bus</span>
                <span>Fleet number</span>
                <span>Plate</span>
                <span>Status</span>
                <span />
              </div>
              {list.rows.map((bus) => {
                const routeNames = routeNamesByBus.get(bus.id) ?? [];
                return (
                  <Link
                    key={bus.id}
                    to={`/admin/buses/${bus.id}?tab=details`}
                    aria-label={`View bus ${bus.bus_number}`}
                    data-testid="admin-bus-card"
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 border-t border-slate-200 px-4 py-4 outline-none transition-colors first:border-t-0 hover:bg-slate-50 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-navy-500 sm:grid-cols-[minmax(0,1.35fr)_minmax(0,.7fr)_minmax(0,.9fr)_minmax(0,.8fr)_1.25rem] sm:items-center sm:px-5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <BusFront aria-hidden className="h-5 w-5 shrink-0 text-slate-500" />
                      <div className="min-w-0">
                        <h2 className="truncate font-bold text-navy-900" title={bus.bus_number}>
                          {bus.bus_number}
                        </h2>
                        <p className="mt-1 truncate text-sm text-gray-600">
                          {routeSummaryUnavailable
                            ? 'Route assignment unavailable'
                            : busServices === null
                              ? 'Loading route assignment…'
                              : routeNames.length
                                ? routeNames.join(', ')
                                : 'No active route'}
                        </p>
                      </div>
                    </div>

                    <div className="col-start-1 row-start-2 sm:col-auto sm:row-auto">
                      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 sm:hidden">
                        Fleet number
                      </span>
                      <span
                        className={
                          bus.fleet_number
                            ? 'font-medium text-navy-900'
                            : 'font-medium text-amber-700'
                        }
                      >
                        {bus.fleet_number ?? 'Not assigned'}
                      </span>
                    </div>

                    <div className="col-start-2 row-start-2 text-right sm:col-auto sm:row-auto sm:text-left">
                      <span className="block text-xs font-semibold uppercase tracking-wide text-gray-500 sm:hidden">
                        Plate
                      </span>
                      <span className="font-medium text-navy-900">
                        {bus.license_plate ?? 'Not assigned'}
                      </span>
                    </div>

                    <div className="col-span-2 sm:col-auto">
                      <StatusPill tone={statusTone(bus.status)} dot>
                        {statusLabel(bus.status)}
                      </StatusPill>
                    </div>

                    <ChevronRight
                      aria-hidden
                      className="col-start-2 row-start-1 h-5 w-5 self-center text-navy-500 sm:col-auto sm:row-auto"
                    />
                  </Link>
                );
              })}
            </Card>
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
