import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminPagination } from '@/components/admin/AdminPagination';
import {
  AdminWriteError,
  AdminWriteMessage,
  InlineFormShell,
} from '@/components/admin/TransportationAdminForms';
import { RouteWithStopsForm } from '@/components/admin/RouteWithStopsForm';
import { RouteTile } from '@/components/admin/RouteTile';
import { RouteBusAssignmentForm } from '@/components/admin/TransportAssignmentForms';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/useAuth';
import { usePaginatedAdminList } from '@/hooks/usePaginatedAdminList';
import { getVisibleProfiles, getVisibleSchools } from '@/services/adminOrganizationService';
import { fetchAdminAssignments } from '@/services/driverAssignmentService';
import {
  ensureBusRouteAssignment,
  fetchAdminBusServices,
  type BusServiceOption,
} from '@/services/studentBusAssignmentService';
import {
  deleteRoute,
  getVisibleBuses,
  getVisibleDrivers,
  getVisibleRouteStops,
  getVisibleRouteTripPatterns,
  getVisibleRouteTripStopSchedules,
  getVisibleRoutes,
  saveRouteDefinition,
} from '@/services/transportationStructureService';
import type { OrganizationProfile, School } from '@/types/organization';
import type { DriverRouteAssignment } from '@/types/driverAssignments';
import type {
  Bus,
  Driver,
  Route,
  RouteStop,
  RouteTripPattern,
  RouteTripStopSchedule,
  SaveRouteDefinitionInput,
  CreateBusRouteAssignmentInput,
} from '@/types/transportation';
import { activeDriverForBusService } from '@/utils/transportAssignments';

interface AdminRoutesPageProps {
  initialRouteId?: string;
}

export function AdminRoutesPage({ initialRouteId }: AdminRoutesPageProps = {}) {
  const { profile } = useAuth();
  const [routes, setRoutes] = useState<Route[]>([]);
  const list = usePaginatedAdminList<Route & { school_name: string | null; stop_count: number; active_assignment_count: number }>('routes');
  const [schools, setSchools] = useState<School[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [tripPatterns, setTripPatterns] = useState<RouteTripPattern[]>([]);
  const [tripSchedules, setTripSchedules] = useState<RouteTripStopSchedule[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [profiles, setProfiles] = useState<OrganizationProfile[]>([]);
  const [assignments, setAssignments] = useState<DriverRouteAssignment[]>([]);
  const [busServices, setBusServices] = useState<BusServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [assigningBusRoute, setAssigningBusRoute] = useState<Route | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const openedInitialRoute = useRef(false);
  const [deletingRoute, setDeletingRoute] = useState<Route | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canWrite = profile?.role === 'tenant_admin';
  const canDelete = profile?.role === 'tenant_admin';

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
      getVisibleRouteTripPatterns(),
      getVisibleRouteTripStopSchedules(),
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
      tripPatternsResult,
      tripSchedulesResult,
      busServicesResult,
    ] = settled;

    if (routesResult.status === 'rejected') {
      const reason = routesResult.reason;
      setError(
        reason instanceof Error ? reason.message : 'Unable to load routes.',
      );
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
        'route trip patterns',
        'route trip schedules',
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

    setRoutes(routesResult.value);
    setSchools(schoolsResult.status === 'fulfilled' ? schoolsResult.value : []);
    setStops(stopsResult.status === 'fulfilled' ? stopsResult.value : []);
    setBuses(busesResult.status === 'fulfilled' ? busesResult.value : []);
    setDrivers(driversResult.status === 'fulfilled' ? driversResult.value : []);
    setProfiles(
      profilesResult.status === 'fulfilled' ? profilesResult.value : [],
    );
    setAssignments(
      assignmentsResult.status === 'fulfilled'
        ? assignmentsResult.value
        : [],
    );
    setTripPatterns(
      tripPatternsResult.status === 'fulfilled' ? tripPatternsResult.value : [],
    );
    setTripSchedules(
      tripSchedulesResult.status === 'fulfilled' ? tripSchedulesResult.value : [],
    );
    setBusServices(
      busServicesResult.status === 'fulfilled' ? busServicesResult.value : [],
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRoutes();
  }, [loadRoutes]);

  const schoolNames = useMemo(
    () => new Map(schools.map((school) => [school.id, school.name])),
    [schools],
  );

  const driverNames = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.full_name])),
    [profiles],
  );

  const busLabels = useMemo(
    () => new Map(buses.map((b) => [b.id, b.bus_number])),
    [buses],
  );

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

  function startCreate() {
    setEditingRoute(null);
    setAssigningBusRoute(null);
    setShowCreateForm(true);
    setWriteError(null);
    setSuccessMessage(null);
  }

  function startEdit(route: Route) {
    setShowCreateForm(false);
    setAssigningBusRoute(null);
    setEditingRoute(route);
    setWriteError(null);
    setSuccessMessage(null);
  }

  useEffect(() => {
    if (!initialRouteId || loading || openedInitialRoute.current) return;
    openedInitialRoute.current = true;
    const route = routes.find((item) => item.id === initialRouteId);
    if (route && route.status !== 'archived') {
      startEdit(route);
    } else {
      setWriteError('This route is not available to manage.');
    }
  }, [initialRouteId, loading, routes]);

  function cancelForm() {
    setShowCreateForm(false);
    setEditingRoute(null);
  }

  async function handleAssignBus(input: CreateBusRouteAssignmentInput) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await ensureBusRouteAssignment(input);
      setAssigningBusRoute(null);
      setSuccessMessage('Bus assigned to the named trip.');
      await loadRoutes();
      await list.reload();
    } catch (assignError) {
      const message =
        assignError instanceof Error
          ? assignError.message
          : 'Unable to assign this bus.';
      setWriteError(message);
      throw assignError;
    }
  }

  async function handleDeleteRoute() {
    if (!deletingRoute || deleting) return;
    setDeleting(true);
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await deleteRoute(deletingRoute.id);
      setDeletingRoute(null);
      setSuccessMessage('Route deleted.');
      await loadRoutes();
      await list.reload();
    } catch (deleteError) {
      setWriteError(
        deleteError instanceof Error ? deleteError.message : 'Unable to delete route.',
      );
    } finally {
      setDeleting(false);
    }
  }

  async function handleSubmit(payload: SaveRouteDefinitionInput) {
    setWriteError(null);
    setSuccessMessage(null);

    try {
      const isUpdate = !!editingRoute;
      await saveRouteDefinition(payload);

      setSuccessMessage(
        isUpdate ? 'Route definition updated.' : 'Route corridor and trips created.',
      );
      cancelForm();
      await loadRoutes();
      await list.reload();
    } catch (submitError) {
      setWriteError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to save route.',
      );
      throw submitError;
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Routes"
          title="Route corridors and trips"
          description="Define each physical route once, then name its forward and reverse trips."
        />

        {canWrite && !showCreateForm && !editingRoute && (
          <div className="flex">
            <Button type="button" onClick={startCreate}>
              Add route
            </Button>
          </div>
        )}

        <AdminWriteMessage message={successMessage} />
        <AdminWriteError message={writeError} />

        {canWrite && showCreateForm && (
          <InlineFormShell title="Add route">
            <RouteWithStopsForm
              route={null}
              existingStops={[]}
              existingTripPatterns={[]}
              existingSchedules={[]}
              existingRoutes={routes}
              schools={schools}
              onSubmit={handleSubmit}
              onCancel={cancelForm}
            />
          </InlineFormShell>
        )}

        {canWrite && editingRoute && (
          <InlineFormShell title={`Edit ${editingRoute.route_code}`}>
            <RouteWithStopsForm
              route={editingRoute}
              existingStops={stopsByRoute.get(editingRoute.id) ?? []}
              existingTripPatterns={tripPatterns.filter(
                (pattern) => pattern.route_id === editingRoute.id,
              )}
              existingSchedules={tripSchedules.filter(
                (schedule) => schedule.route_id === editingRoute.id,
              )}
              existingRoutes={routes}
              schools={schools}
              onSubmit={handleSubmit}
              onCancel={cancelForm}
            />
          </InlineFormShell>
        )}

        {canWrite && assigningBusRoute && (
          <InlineFormShell title={`Assign bus to ${assigningBusRoute.route_code}`}>
            <RouteBusAssignmentForm
              route={assigningBusRoute}
              buses={buses}
              tripPatterns={tripPatterns}
              onSubmit={handleAssignBus}
              onCancel={() => setAssigningBusRoute(null)}
            />
          </InlineFormShell>
        )}

        <div>
          <label
            className="block text-sm font-semibold text-gray-700"
            htmlFor="route-search"
          >
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
          <DataState
            title="Loading routes"
            message="Fetching route records visible to you."
          />
        )}
        {error && <DataState title="Unable to load routes" message={error} />}
        {!loading && !error && list.rows.length === 0 && list.totalCount === 0 && (
          <DataState
            title="No routes visible"
            message="No route records are available for this account. Click Add route to get started."
          />
        )}
        {!loading && !error && list.rows.length > 0 && (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                const driver = drivers.find(
                  (item) => item.id === driverAssignment?.driver_id,
                );
                return {
                  busLabel: busLabels.get(service.bus_id) ?? service.bus_number,
                  driverLabel:
                    driverNames.get(driver?.profile_id ?? '') ?? null,
                  tripName: service.trip_name,
                };
              });

              return (
                <RouteTile
                  key={route.id}
                  route={route}
                  schoolName={
                    route.school_id
                      ? (schoolNames.get(route.school_id) ?? null)
                      : null
                  }
                  stopCount={routeStops.length}
                  assignments={tileAssignments}
                  canWrite={canWrite}
                  canDelete={canDelete}
                  canAssignBus={
                    canWrite &&
                    route.status === 'active' &&
                    route.definition_status === 'ready'
                  }
                  onEdit={() => startEdit(route)}
                  onAssignBus={() => {
                    setShowCreateForm(false);
                    setEditingRoute(null);
                    setAssigningBusRoute(route);
                    setWriteError(null);
                    setSuccessMessage(null);
                  }}
                  onDelete={() => {
                    setEditingRoute(null);
                    setAssigningBusRoute(null);
                    setShowCreateForm(false);
                    setDeletingRoute(route);
                    setWriteError(null);
                    setSuccessMessage(null);
                  }}
                />
              );
            })}
            <div className="sm:col-span-2 lg:col-span-3"><AdminPagination page={list.page} pageSize={list.pageSize} totalCount={list.totalCount} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} /></div>
          </section>
        )}
        <ConfirmDialog
          open={!!deletingRoute}
          title={`Delete ${deletingRoute?.route_name ?? ''}`}
          description="This permanently deletes the route along with its stops, assignments, and student route assignments. This action cannot be undone."
          confirmLabel="Delete route"
          destructive
          busy={deleting}
          onConfirm={() => void handleDeleteRoute()}
          onCancel={() => setDeletingRoute(null)}
        />
      </div>
    </DashboardLayout>
  );
}
