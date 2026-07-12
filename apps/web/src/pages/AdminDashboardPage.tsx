import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { AdminRouteStatusTile } from '@/components/admin/AdminRouteStatusTile';
import { AdminRoutesMap, type RouteMapRoute } from '@/components/admin/AdminRoutesMap';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { mapTileConfig } from '@/config/mapTiles';
import { fetchAdminLiveTrips } from '@/services/adminLiveMonitoringService';
import { fetchAdminSetupSnapshot, type AdminSetupSnapshot } from '@/services/adminSetupService';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import {
  getVisibleBuses,
  getVisibleDrivers,
  getVisibleRouteStops,
  getVisibleRoutes,
} from '@/services/transportationStructureService';
import { fetchAdminAssignments } from '@/services/driverAssignmentService';
import { getVisibleProfiles } from '@/services/adminOrganizationService';
import type { School, OrganizationProfile } from '@/types/organization';
import type { Bus, Driver, Route, RouteStop } from '@/types/transportation';
import type { DriverRouteAssignment } from '@/types/driverAssignments';
import type { AdminLiveTrip } from '@/types/adminLiveMonitoring';

const emptySetupSnapshot: AdminSetupSnapshot = {
  buses: 0,
  drivers: 0,
  routes: 0,
  stops: 0,
  students: 0,
  guardians: 0,
  guardianLinks: 0,
  studentAssignments: 0,
  driverAssignments: 0,
};

const setupKeys: Array<{ label: string; key: keyof AdminSetupSnapshot; to: string }> = [
  { label: 'Buses', key: 'buses', to: '/admin/buses' },
  { label: 'Drivers', key: 'drivers', to: '/admin/drivers' },
  { label: 'Routes', key: 'routes', to: '/admin/routes' },
  { label: 'Students', key: 'students', to: '/admin/students' },
  { label: 'Guardians', key: 'guardians', to: '/admin/guardians' },
  { label: 'Guardian links', key: 'guardianLinks', to: '/admin/guardians' },
  { label: 'Student route assignments', key: 'studentAssignments', to: '/admin/assignments' },
  { label: 'Driver and bus assignments', key: 'driverAssignments', to: '/admin/driver-assignments' },
];

interface OverviewData {
  setup: AdminSetupSnapshot;
  trips: AdminLiveTrip[];
  routes: Route[];
  stops: RouteStop[];
  schools: School[];
  buses: Bus[];
  drivers: Driver[];
  assignments: DriverRouteAssignment[];
  profiles: OrganizationProfile[];
}

export function AdminDashboardPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [showAllRoutes, setShowAllRoutes] = useState(false);

  const load = useCallback(async () => {
    // Overview degrades gracefully: the setup snapshot and live trips feed
    // the top status cards, while the rest enrich the routes map. If any
    // single query fails (e.g., an RLS hiccup on one supporting table),
    // we still show the rest of the overview instead of blanking the page.
    const [
      setupResult,
      tripsResult,
      routesResult,
      stopsResult,
      schoolsResult,
      busesResult,
      driversResult,
      assignmentsResult,
      profilesResult,
    ] = await Promise.allSettled([
      fetchAdminSetupSnapshot(),
      fetchAdminLiveTrips(),
      getVisibleRoutes(),
      getVisibleRouteStops(),
      getVisibleSchools(),
      getVisibleBuses(),
      getVisibleDrivers(),
      fetchAdminAssignments(),
      getVisibleProfiles(),
    ]);

    if (import.meta.env.DEV) {
      const names = [
        'setup snapshot',
        'live trips',
        'routes',
        'route stops',
        'schools',
        'buses',
        'drivers',
        'driver assignments',
        'profiles',
      ];
      [
        setupResult,
        tripsResult,
        routesResult,
        stopsResult,
        schoolsResult,
        busesResult,
        driversResult,
        assignmentsResult,
        profilesResult,
      ].forEach((result, index) => {
        if (result.status === 'rejected') {
          console.warn(
            `[AdminDashboardPage] Non-fatal failure loading ${names[index]}.`,
            result.reason,
          );
        }
      });
    }

    setData({
      setup:
        setupResult.status === 'fulfilled'
          ? setupResult.value
          : emptySetupSnapshot,
      trips: tripsResult.status === 'fulfilled' ? tripsResult.value : [],
      routes: routesResult.status === 'fulfilled' ? routesResult.value : [],
      stops: stopsResult.status === 'fulfilled' ? stopsResult.value : [],
      schools: schoolsResult.status === 'fulfilled' ? schoolsResult.value : [],
      buses: busesResult.status === 'fulfilled' ? busesResult.value : [],
      drivers: driversResult.status === 'fulfilled' ? driversResult.value : [],
      assignments:
        assignmentsResult.status === 'fulfilled'
          ? assignmentsResult.value
          : [],
      profiles:
        profilesResult.status === 'fulfilled' ? profilesResult.value : [],
    });
  }, []);

  useEffect(() => {
    void load().catch(() => setError(true));
  }, [load]);

  const schoolNames = useMemo(
    () => new Map(data?.schools.map((school) => [school.id, school.name]) ?? []),
    [data?.schools],
  );

  const busLabels = useMemo(
    () => new Map(data?.buses.map((b) => [b.id, b.bus_number]) ?? []),
    [data?.buses],
  );

  const driverNames = useMemo(
    () => new Map(data?.profiles.map((p) => [p.id, p.full_name]) ?? []),
    [data?.profiles],
  );

  const stopsByRoute = useMemo(() => {
    const map = new Map<string, RouteStop[]>();
    if (!data) return map;
    for (const stop of data.stops) {
      if (stop.status === 'archived') continue;
      const list = map.get(stop.route_id) ?? [];
      list.push(stop);
      map.set(stop.route_id, list);
    }
    return map;
  }, [data]);

  const assignmentsByRoute = useMemo(() => {
    const map = new Map<string, DriverRouteAssignment[]>();
    if (!data) return map;
    for (const a of data.assignments) {
      if (a.status !== 'active') continue;
      const list = map.get(a.route_id) ?? [];
      list.push(a);
      map.set(a.route_id, list);
    }
    return map;
  }, [data]);

  const routeMapEntries = useMemo<RouteMapRoute[]>(() => {
    if (!data) return [];
    return data.routes
      .filter((r) => r.status !== 'archived')
      .map((route) => ({
        route,
        stops: stopsByRoute.get(route.id) ?? [],
      }));
  }, [data, stopsByRoute]);

  const visibleMapRoutes = useMemo<RouteMapRoute[]>(() => {
    if (!showAllRoutes && selectedRouteId) {
      const selected = routeMapEntries.find((entry) => entry.route.id === selectedRouteId);
      return selected ? [selected] : [];
    }
    return routeMapEntries;
  }, [routeMapEntries, selectedRouteId, showAllRoutes]);

  const setupComplete = useMemo(() => {
    if (!data) return 0;
    return setupKeys.filter((item) => data.setup[item.key] > 0).length;
  }, [data]);

  const activeTrips = data?.trips.length ?? 0;
  const staleTrips = data?.trips.filter((t) => t.locationStatus === 'stale').length ?? 0;
  const missingTrips = data?.trips.filter((t) => t.locationStatus === 'missing').length ?? 0;

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Overview"
          title="Transportation overview"
          description="Live operations, route status, and setup readiness at a glance."
        />

        {error && (
          <DataState
            title="Overview unavailable"
            message="Use the navigation to continue working with students, guardians, drivers, buses, or routes."
          />
        )}
        {!data && !error && (
          <DataState title="Loading overview" message="Checking transportation readiness and live operations." />
        )}

        {data && (
          <>
            {/* Live operations summary */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="p-5">
                <p className="text-sm font-semibold text-gray-600">Active trips</p>
                <p className="mt-1 text-3xl font-bold text-navy-900">{activeTrips}</p>
                <p className="mt-2 text-sm text-gray-600">Driver-started trips currently operating.</p>
              </Card>
              <Card className="p-5">
                <p className="text-sm font-semibold text-gray-600">Stale locations</p>
                <p className="mt-1 text-3xl font-bold text-warning-600">{staleTrips}</p>
                <p className="mt-2 text-sm text-gray-600">Buses with GPS not updated recently.</p>
              </Card>
              <Card className="p-5">
                <p className="text-sm font-semibold text-gray-600">Missing locations</p>
                <p className="mt-1 text-3xl font-bold text-danger-600">{missingTrips}</p>
                <p className="mt-2 text-sm text-gray-600">Active trips without GPS data.</p>
              </Card>
              <Card className="p-5">
                <p className="text-sm font-semibold text-gray-600">Setup readiness</p>
                <p className="mt-1 text-3xl font-bold text-navy-900">
                  {setupComplete} of {setupKeys.length}
                </p>
                <p className="mt-2 text-sm text-gray-600">Core setup steps complete.</p>
              </Card>
            </section>

            {/* Routes with status and map */}
            <section className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold text-navy-900">Routes</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Click a route to view its stops on the map, or view all routes at once.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedRouteId && !showAllRoutes && (
                    <button
                      type="button"
                      onClick={() => setSelectedRouteId(null)}
                      className="rounded-md px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100"
                    >
                      Clear selection
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllRoutes((prev) => !prev);
                      setSelectedRouteId(null);
                    }}
                    className={`rounded-md px-3 py-2 text-sm font-semibold ${
                      showAllRoutes
                        ? 'bg-navy-600 text-white'
                        : 'bg-navy-50 text-navy-700 hover:bg-navy-100'
                    }`}
                    data-testid="admin-overview-toggle-all-routes"
                  >
                    {showAllRoutes ? 'Showing all routes' : 'View all routes on map'}
                  </button>
                </div>
              </div>

              {data.routes.length === 0 ? (
                <DataState
                  title="No routes yet"
                  message="Create your first route with stops to see it here."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.routes
                    .filter((r) => r.status !== 'archived')
                    .map((route) => {
                      const routeAssignments = assignmentsByRoute.get(route.id) ?? [];
                      const tileAssignments = routeAssignments.map((a) => ({
                        busLabel: busLabels.get(a.bus_id) ?? null,
                        driverLabel:
                          driverNames.get(
                            data.drivers.find((d) => d.id === a.driver_id)?.profile_id ?? '',
                          ) ?? null,
                        tripType: a.trip_type,
                      }));

                      const routeStops = stopsByRoute.get(route.id) ?? [];
                      const hasMappedStops = routeStops.some(
                        (s) =>
                          typeof s.latitude === 'number' &&
                          typeof s.longitude === 'number',
                      );

                      return (
                        <AdminRouteStatusTile
                          key={route.id}
                          route={route}
                          schoolName={
                            route.school_id ? (schoolNames.get(route.school_id) ?? null) : null
                          }
                          stopCount={routeStops.length}
                          assignments={tileAssignments}
                          hasMappedStops={hasMappedStops}
                          isActive={selectedRouteId === route.id && !showAllRoutes}
                          onClick={() => {
                            setShowAllRoutes(false);
                            setSelectedRouteId((prev) =>
                              prev === route.id ? null : route.id,
                            );
                          }}
                        />
                      );
                    })}
                </div>
              )}

              {/* Map section — shown when a route is selected or "View all" is toggled */}
              {(selectedRouteId || showAllRoutes) && visibleMapRoutes.length > 0 && (
                <AdminRoutesMap routes={visibleMapRoutes} tileConfig={mapTileConfig} />
              )}
            </section>

            {/* Setup checklist */}
            <section className="space-y-3">
              <h2 className="text-xl font-bold text-navy-900">Setup checklist</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {setupKeys.map((item) => {
                  const count = data.setup[item.key];
                  const complete = count > 0;
                  return (
                    <a
                      key={item.key}
                      href={item.to}
                      className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 text-sm hover:shadow-sm"
                    >
                      <span className="font-semibold text-navy-900">{item.label}</span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          complete
                            ? 'bg-success-50 text-success-700'
                            : 'bg-warning-50 text-warning-700'
                        }`}
                      >
                        {complete ? `${count} active` : 'Needs setup'}
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}