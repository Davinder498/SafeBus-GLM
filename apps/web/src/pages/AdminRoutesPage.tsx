import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AdminWriteError,
  AdminWriteMessage,
  InlineFormShell,
  RouteForm,
} from '@/components/admin/TransportationAdminForms';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import {
  createRoute,
  getVisibleRouteStops,
  getVisibleRoutes,
  updateRoute,
} from '@/services/transportationStructureService';
import type { School } from '@/types/organization';
import type {
  CreateRouteInput,
  Route,
  RouteStop,
  RouteStatus,
  RouteType,
  UpdateRouteInput,
} from '@/types/transportation';

const routeStatusTone: Record<RouteStatus, 'success' | 'danger' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
  archived: 'danger',
};

const routeTypeLabels: Record<RouteType, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  special: 'Special',
  field_trip: 'Field trip',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function AdminRoutesPage() {
  const { profile } = useAuth();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingRoute, setEditingRoute] = useState<Route | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

  const loadRoutes = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextRoutes, nextSchools, nextStops] = await Promise.all([
        getVisibleRoutes(),
        getVisibleSchools(),
        getVisibleRouteStops(),
      ]);
      setRoutes(nextRoutes);
      setSchools(nextSchools);
      setStops(nextStops);
    } catch (routesError) {
      setError(routesError instanceof Error ? routesError.message : 'Unable to load routes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRoutes();
  }, [loadRoutes]);

  const schoolNames = useMemo(() => {
    return new Map(schools.map((school) => [school.id, school.name]));
  }, [schools]);

  const filteredRoutes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return routes;

    return routes.filter((route) =>
      [
        route.route_name,
        route.route_code,
        routeTypeLabels[route.route_type],
        route.status,
        route.school_id ? (schoolNames.get(route.school_id) ?? route.school_id) : 'No school selected',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, routes, schoolNames]);

  async function handleCreateRoute(input: CreateRouteInput | UpdateRouteInput) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await createRoute(input as CreateRouteInput);
      setShowCreateForm(false);
      setSuccessMessage('Route created.');
      await loadRoutes();
    } catch (createError) {
      setWriteError(createError instanceof Error ? createError.message : 'Unable to create route.');
    }
  }

  async function handleUpdateRoute(input: CreateRouteInput | UpdateRouteInput) {
    if (!editingRoute) return;
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await updateRoute(editingRoute.id, input as UpdateRouteInput);
      setEditingRoute(null);
      setSuccessMessage('Route updated.');
      await loadRoutes();
    } catch (updateError) {
      setWriteError(updateError instanceof Error ? updateError.message : 'Unable to update route.');
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Routes"
          title="Routes and stops"
          description="Create each route, then add its ordered pickup and drop-off stops as part of the same route setup."
        />

        {canWrite && (
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => {
              setEditingRoute(null);
              setShowCreateForm(true);
              setWriteError(null);
              setSuccessMessage(null);
            }}>
              Add route
            </Button>
            <Link to="/admin/stops" className="inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-navy-700 hover:bg-gray-50">
              Manage route stops
            </Link>
          </div>
        )}

        <AdminWriteMessage message={successMessage} />
        <AdminWriteError message={writeError} />

        {canWrite && showCreateForm && (
          <InlineFormShell title="Add route">
            <RouteForm
              route={null}
              schools={schools}
              defaultTenantId={profile?.tenant_id ?? null}
              onSubmit={handleCreateRoute}
              onCancel={() => setShowCreateForm(false)}
            />
          </InlineFormShell>
        )}

        {canWrite && editingRoute && (
          <InlineFormShell title={`Edit ${editingRoute.route_code}`}>
            <RouteForm
              route={editingRoute}
              schools={schools}
              defaultTenantId={profile?.tenant_id ?? null}
              onSubmit={handleUpdateRoute}
              onCancel={() => setEditingRoute(null)}
            />
          </InlineFormShell>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="route-search">
            Search routes
          </label>
          <input
            id="route-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by route name, code, type, status, or school"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </div>

        {loading && (
          <DataState title="Loading routes" message="Fetching route records visible to you." />
        )}
        {error && <DataState title="Unable to load routes" message={error} />}
        {!loading && !error && routes.length === 0 && (
          <DataState
            title="No routes visible"
            message="No route records are available for this account under the current RLS policies."
          />
        )}
        {!loading && !error && routes.length > 0 && filteredRoutes.length === 0 && (
          <DataState
            title="No routes match"
            message="Try a different route, code, type, school, or status search."
          />
        )}

        {!loading && !error && filteredRoutes.length > 0 && (
          <section className="grid gap-4">
            {filteredRoutes.map((route) => (
              <Card key={route.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-500">{route.route_code}</p>
                    <h2 className="text-xl font-bold text-navy-900">{route.route_name}</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {route.school_id ? (schoolNames.get(route.school_id) ?? 'No school selected') : 'No school selected'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill tone={routeStatusTone[route.status]}>{route.status}</StatusPill>
                    {canWrite && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => {
                        setShowCreateForm(false);
                        setEditingRoute(route);
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
                    Route type:{' '}
                    <span className="font-semibold text-navy-900">
                      {routeTypeLabels[route.route_type]}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    School:{' '}
                    <span className="font-semibold text-navy-900">
                      {route.school_id ? (schoolNames.get(route.school_id) ?? route.school_id) : 'No school selected'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Created:{' '}
                    <span className="font-semibold text-navy-900">
                      {formatDate(route.created_at)}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Stops:{' '}
                    <span className="font-semibold text-navy-900">
                      {stops.filter((stop) => stop.route_id === route.id && stop.status === 'active').length}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Route id: <span className="font-semibold text-navy-900">{route.id}</span>
                  </p>
                </div>
              </Card>
            ))}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
