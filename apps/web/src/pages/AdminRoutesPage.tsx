import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { RouteTile } from '@/components/admin/RouteTile';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/useAuth';
import { usePaginatedAdminList } from '@/hooks/usePaginatedAdminList';
import { getVisibleProfiles, getVisibleSchools } from '@/services/adminOrganizationService';
import { fetchAdminAssignments } from '@/services/driverAssignmentService';
import {
  fetchAdminBusServices,
  type BusServiceOption,
} from '@/services/studentBusAssignmentService';
import {
  getVisibleRoutes,
  getVisibleBuses,
  getVisibleDrivers,
  getVisibleRouteStops,
} from '@/services/transportationStructureService';
import type { OrganizationProfile, School } from '@/types/organization';
import type { DriverRouteAssignment } from '@/types/driverAssignments';
import type { Bus, Driver, Route, RouteStop } from '@/types/transportation';
import { activeDriverForBusService } from '@/utils/transportAssignments';

export function AdminRoutesPage() {
  const { profile } = useAuth();
  const list = usePaginatedAdminList<
    Route & { school_name: string | null; stop_count: number; active_assignment_count: number }
  >('routes');
  const [schools, setSchools] = useState<School[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [profiles, setProfiles] = useState<OrganizationProfile[]>([]);
  const [assignments, setAssignments] = useState<DriverRouteAssignment[]>([]);
  const [busServices, setBusServices] = useState<BusServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canWrite = profile?.role === 'tenant_admin';

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Routes are the critical data for this page. The supporting collections
    // (schools, stops, buses, drivers, profiles, assignments) enrich the UI
    // but must NOT block route rendering — otherwise a single failing
    // enrichment query hides every route behind "Unable to load routes".
    const settled = await Promise.allSettled([
      getVisibleRoutes(),
      getVisibleSchools(),
      getVisibleRouteStops(),
      getVisibleBuses(),
      getVisibleDrivers(),
      getVisibleProfiles(),
      fetchAdminAssignments(),
      fetchAdminBusServices(),
    ]);

    const [
      routesResult,
      schoolsResult,
      stopsResult,
      busesResult,
      driversResult,
      profilesResult,
      assignmentsResult,
      busServicesResult,
    ] = settled;

    if (routesResult.status === 'rejected') {
      const reason = routesResult.reason;
      setError(reason instanceof Error ? reason.message : 'Unable to load routes.');
      setLoading(false);
      return;
    }

    // Log non-fatal enrichment failures in dev so they are debuggable,
    // without hiding the routes list from the user.
    if (import.meta.env.DEV) {
      const enrichmentNames = [
        'schools',
        'route stops',
        'buses',
        'drivers',
        'profiles',
        'driver assignments',
        'bus route assignments',
      ];
      settled.slice(1).forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(
            `[AdminRoutesPage] Non-fatal failure loading ${enrichmentNames[index]}.`,
            result.reason,
          );
        }
      });
    }

    setSchools(schoolsResult.status === 'fulfilled' ? schoolsResult.value : []);
    setStops(stopsResult.status === 'fulfilled' ? stopsResult.value : []);
    setBuses(busesResult.status === 'fulfilled' ? busesResult.value : []);
    setDrivers(driversResult.status === 'fulfilled' ? driversResult.value : []);
    setProfiles(profilesResult.status === 'fulfilled' ? profilesResult.value : []);
    setAssignments(assignmentsResult.status === 'fulfilled' ? assignmentsResult.value : []);
    setBusServices(busServicesResult.status === 'fulfilled' ? busServicesResult.value : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRoutes();
  }, [loadRoutes]);

  const schoolNames = useMemo(
    () => new Map(schools.map((school) => [school.id, school.name])),
    [schools],
  );

  const driverNames = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]);

  const busLabels = useMemo(() => new Map(buses.map((b) => [b.id, b.bus_number])), [buses]);

  // Stops grouped by route
  const stopsByRoute = useMemo(() => {
    const map = new Map<string, RouteStop[]>();
    for (const stop of stops) {
      if (stop.status === 'archived') continue;
      const list = map.get(stop.route_id) ?? [];
      list.push(stop);
      map.set(stop.route_id, list);
    }
    return map;
  }, [stops]);

  // Assignments grouped by route
  const assignmentsByRoute = useMemo(() => {
    const map = new Map<string, DriverRouteAssignment[]>();
    for (const a of assignments) {
      if (a.status !== 'active') continue;
      const list = map.get(a.route_id) ?? [];
      list.push(a);
      map.set(a.route_id, list);
    }
    return map;
  }, [assignments]);

  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-6">
        <PageHeader
          eyebrow="Routes"
          title="Route corridors and trips"
          description="Create a route, then set up its road path, bus, driver and students in the route workspace."
        />

        {canWrite && (
          <Link
            to="/admin/routes/new"
            className="inline-flex rounded-lg bg-navy-700 px-4 py-3 font-semibold text-white"
          >
            Add route
          </Link>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="route-search">
            Search routes
          </label>
          <input
            id="route-search"
            type="search"
            value={list.searchInput}
            onChange={(event) => list.setSearchInput(event.target.value)}
            placeholder="Search by route name, code, status, school, stop, or bus"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </div>

        {loading && (
          <DataState title="Loading routes" message="Fetching route records visible to you." />
        )}
        {error && <DataState title="Unable to load routes" message={error} />}
        {!loading && !error && list.rows.length === 0 && list.totalCount === 0 && (
          <DataState
            title="No routes visible"
            message="No route records are available for this account. Click Add route to get started."
          />
        )}
        {!loading && !error && list.rows.length > 0 && (
          <section aria-label="Routes" className="space-y-4">
            <Card className="overflow-hidden">
              <div
                aria-hidden="true"
                className="hidden grid-cols-[minmax(0,1.35fr)_minmax(0,.72fr)_minmax(4rem,.35fr)_minmax(0,1.4fr)_1.25rem] gap-4 border-b border-slate-200 bg-slate-50/80 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid"
              >
                <span>Route</span>
                <span>School</span>
                <span>Stops</span>
                <span>Bus and driver</span>
                <span />
              </div>
              {list.rows.map((route) => {
                const routeStops = stopsByRoute.get(route.id) ?? [];
                const routeServices = busServices.filter(
                  (service) => service.route_id === route.id && service.status === 'active',
                );
                const tileAssignments = routeServices.map((service) => {
                  const driverAssignment = activeDriverForBusService(
                    service,
                    assignmentsByRoute.get(route.id) ?? [],
                  );
                  const driver = drivers.find((item) => item.id === driverAssignment?.driver_id);
                  return {
                    busLabel: busLabels.get(service.bus_id) ?? service.bus_number,
                    driverLabel: driverNames.get(driver?.profile_id ?? '') ?? null,
                    tripName: service.trip_name,
                  };
                });

                return (
                  <RouteTile
                    key={route.id}
                    route={route}
                    schoolName={route.school_id ? (schoolNames.get(route.school_id) ?? null) : null}
                    stopCount={routeStops.length}
                    assignments={tileAssignments}
                  />
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
