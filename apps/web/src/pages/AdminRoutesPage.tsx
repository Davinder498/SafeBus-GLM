import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminPagination } from '@/components/admin/AdminPagination';
import {
  AdminWriteError,
  AdminWriteMessage,
  InlineFormShell,
} from '@/components/admin/TransportationAdminForms';
import { RouteWithStopsForm } from '@/components/admin/RouteWithStopsForm';
import type {
  AssignmentDraft,
  StopDraft,
} from '@/components/admin/RouteWithStopsForm';
import { RouteTile } from '@/components/admin/RouteTile';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { usePaginatedAdminList } from '@/hooks/usePaginatedAdminList';
import { getVisibleProfiles, getVisibleSchools } from '@/services/adminOrganizationService';
import {
  createDriverAssignment,
  fetchAdminAssignments,
  updateAssignmentStatus,
} from '@/services/driverAssignmentService';
import {
  createRoute,
  createRouteStop,
  getVisibleBuses,
  getVisibleDrivers,
  getVisibleRouteStops,
  getVisibleRoutes,
  updateRoute,
  updateRouteStop,
} from '@/services/transportationStructureService';
import type { OrganizationProfile, School } from '@/types/organization';
import type { DriverRouteAssignment } from '@/types/driverAssignments';
import type {
  Bus,
  CreateRouteInput,
  CreateRouteStopInput,
  Driver,
  Route,
  RouteStop,
  UpdateRouteInput,
  UpdateRouteStopInput,
} from '@/types/transportation';

interface AdminRoutesPageProps {
  initialRouteId?: string;
}

export function AdminRoutesPage({ initialRouteId }: AdminRoutesPageProps = {}) {
  const { profile } = useAuth();
  const [routes, setRoutes] = useState<Route[]>([]);
  const list = usePaginatedAdminList<Route & { school_name: string | null; stop_count: number; active_assignment_count: number }>('routes');
  const [schools, setSchools] = useState<School[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [profiles, setProfiles] = useState<OrganizationProfile[]>([]);
  const [assignments, setAssignments] = useState<DriverRouteAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const openedInitialRoute = useRef(false);

  const canWrite =
    !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

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
    ]);

    const [
      routesResult,
      schoolsResult,
      stopsResult,
      busesResult,
      driversResult,
      profilesResult,
      assignmentsResult,
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
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRoutes();
  }, [loadRoutes]);

  const schoolNames = useMemo(
    () => new Map(schools.map((school) => [school.id, school.name])),
    [schools],
  );

  const profileLabels = useMemo(
    () =>
      new Map(profiles.map((p) => [p.id, `${p.full_name} (${p.email})`])),
    [profiles],
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
    setShowCreateForm(true);
    setWriteError(null);
    setSuccessMessage(null);
  }

  function startEdit(route: Route) {
    setShowCreateForm(false);
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

  // Helper: get existing assignments as drafts for the form
  function getAssignmentDrafts(routeId: string): AssignmentDraft[] {
    return (assignmentsByRoute.get(routeId) ?? []).map((a) => ({
      id: a.id,
      driverId: a.driver_id,
      busId: a.bus_id,
      tripType: a.trip_type,
      status: a.status,
    }));
  }

  async function handleSubmit(payload: {
    route: CreateRouteInput | UpdateRouteInput;
    stops: StopDraft[];
    assignments: AssignmentDraft[];
    removedAssignmentIds: string[];
  }) {
    setWriteError(null);
    setSuccessMessage(null);

    try {
      // 1. Save the route (create or update)
      const isUpdate = !!editingRoute;
      let savedRouteId: string;
      let savedTenantId: string;

      if (isUpdate && editingRoute) {
        const updated = await updateRoute(
          editingRoute.id,
          payload.route as UpdateRouteInput,
        );
        savedRouteId = updated.id;
        savedTenantId = updated.tenant_id;
      } else {
        const created = await createRoute(payload.route as CreateRouteInput);
        savedRouteId = created.id;
        savedTenantId = created.tenant_id;
      }

      // 2. Save stops - update existing, create new
      const existingRouteStops = stopsByRoute.get(savedRouteId) ?? [];
      for (const stopDraft of payload.stops) {
        if (stopDraft.id) {
          // Update existing stop
          const stopInput: UpdateRouteStopInput = {
            route_id: savedRouteId,
            school_id: stopDraft.school_id,
            stop_name: stopDraft.stop_name.trim(),
            stop_order: stopDraft.stop_order,
            planned_arrival_time: stopDraft.planned_arrival_time,
            status: stopDraft.status,
          };
          await updateRouteStop(stopDraft.id, stopInput);
        } else {
          // Create new stop
          const stopInput: CreateRouteStopInput = {
            tenant_id: savedTenantId,
            route_id: savedRouteId,
            school_id: stopDraft.school_id,
            stop_name: stopDraft.stop_name.trim(),
            stop_order: stopDraft.stop_order,
            planned_arrival_time: stopDraft.planned_arrival_time,
            latitude: null,
            longitude: null,
            status: stopDraft.status,
          };
          await createRouteStop(stopInput);
        }
      }

      // 3. Deactivate removed existing stops - archive stops that are no longer in the draft
      const keptStopIds = new Set(
        payload.stops.filter((s) => s.id).map((s) => s.id),
      );
      for (const existingStop of existingRouteStops) {
        if (!keptStopIds.has(existingStop.id)) {
          await updateRouteStop(existingStop.id, {
            route_id: savedRouteId,
            school_id: existingStop.school_id,
            stop_name: existingStop.stop_name,
            stop_order: existingStop.stop_order,
            planned_arrival_time: existingStop.planned_arrival_time,
            latitude: existingStop.latitude,
            longitude: existingStop.longitude,
            status: 'archived',
          });
        }
      }

      // 4. Create new assignments
      const tenantId = savedTenantId;
      for (const draft of payload.assignments) {
        if (draft.id.startsWith('new-')) {
          await createDriverAssignment(
            {
              driverId: draft.driverId,
              busId: draft.busId,
              routeId: savedRouteId,
              tripType: draft.tripType,
              status: draft.status,
            },
            tenantId,
          );
        }
      }

      // 5. Deactivate removed assignments
      for (const removedId of payload.removedAssignmentIds) {
        await updateAssignmentStatus(removedId, 'inactive');
      }

      setSuccessMessage(
        isUpdate ? 'Route updated.' : 'Route created with stops.',
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
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Routes"
          title="Routes and stops"
          description="Create routes with stops and assign buses all in one place."
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
              existingAssignments={[]}
              existingRoutes={routes}
              schools={schools}
              buses={buses}
              drivers={drivers}
              profileLabels={profileLabels}
              defaultTenantId={profile?.tenant_id ?? null}
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
              existingAssignments={getAssignmentDrafts(editingRoute.id)}
              existingRoutes={routes}
              schools={schools}
              buses={buses}
              drivers={drivers}
              profileLabels={profileLabels}
              defaultTenantId={profile?.tenant_id ?? null}
              onSubmit={handleSubmit}
              onCancel={cancelForm}
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
              const routeAssignments = assignmentsByRoute.get(route.id) ?? [];
              const tileAssignments = routeAssignments.map((a) => ({
                busLabel: busLabels.get(a.bus_id) ?? null,
                driverLabel:
                  driverNames.get(
                    drivers.find((d) => d.id === a.driver_id)?.profile_id ?? '',
                  ) ?? null,
                tripType: a.trip_type,
              }));

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
                  onEdit={() => startEdit(route)}
                />
              );
            })}
            <div className="sm:col-span-2 lg:col-span-3"><AdminPagination page={list.page} pageSize={list.pageSize} totalCount={list.totalCount} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} /></div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
