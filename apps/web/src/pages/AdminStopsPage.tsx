import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminWriteError,
  AdminWriteMessage,
  InlineFormShell,
  RouteStopForm,
} from '@/components/admin/TransportationAdminForms';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import {
  createRouteStop,
  getVisibleRoutes,
  getVisibleRouteStops,
  updateRouteStop,
} from '@/services/transportationStructureService';
import type {
  CreateRouteStopInput,
  Route,
  RouteStop,
  RouteStopStatus,
  UpdateRouteStopInput,
} from '@/types/transportation';

const routeStopStatusTone: Record<RouteStopStatus, 'success' | 'danger' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
  archived: 'danger',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatTime(value: string | null) {
  if (!value) return 'Not assigned';
  return value.slice(0, 5);
}

export function AdminStopsPage() {
  const { profile } = useAuth();
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingStop, setEditingStop] = useState<RouteStop | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

  const loadStops = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextStops, nextRoutes] = await Promise.all([
        getVisibleRouteStops(),
        getVisibleRoutes(),
      ]);
      setStops(nextStops);
      setRoutes(nextRoutes);
    } catch (stopsError) {
      setError(stopsError instanceof Error ? stopsError.message : 'Unable to load stops.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStops();
  }, [loadStops]);

  const routeLabels = useMemo(() => {
    return new Map(routes.map((route) => [route.id, `${route.route_code} - ${route.route_name}`]));
  }, [routes]);

  const filteredStops = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return stops;

    return stops.filter((stop) =>
      [
        stop.stop_name,
        stop.stop_order.toString(),
        formatTime(stop.planned_arrival_time),
        stop.status,
        routeLabels.get(stop.route_id) ?? stop.route_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, routeLabels, stops]);

  async function handleCreateStop(input: CreateRouteStopInput | UpdateRouteStopInput) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await createRouteStop(input as CreateRouteStopInput);
      setShowCreateForm(false);
      setSuccessMessage('Route stop created.');
      await loadStops();
    } catch (createError) {
      setWriteError(
        createError instanceof Error ? createError.message : 'Unable to create route stop.',
      );
    }
  }

  async function handleUpdateStop(input: CreateRouteStopInput | UpdateRouteStopInput) {
    if (!editingStop) return;
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await updateRouteStop(editingStop.id, input as UpdateRouteStopInput);
      setEditingStop(null);
      setSuccessMessage('Route stop updated.');
      await loadStops();
    } catch (updateError) {
      setWriteError(
        updateError instanceof Error ? updateError.message : 'Unable to update route stop.',
      );
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Stops"
          title="Visible route stops"
          description="Stop records returned by Supabase under the current admin user's RLS permissions."
        />

        {canWrite && (
          <div className="flex">
            <Button type="button" onClick={() => {
              setEditingStop(null);
              setShowCreateForm(true);
              setWriteError(null);
              setSuccessMessage(null);
            }}>
              Add stop
            </Button>
          </div>
        )}

        <AdminWriteMessage message={successMessage} />
        <AdminWriteError message={writeError} />

        {canWrite && showCreateForm && (
          <InlineFormShell title="Add stop">
            <RouteStopForm
              stop={null}
              routes={routes}
              onSubmit={handleCreateStop}
              onCancel={() => setShowCreateForm(false)}
            />
          </InlineFormShell>
        )}

        {canWrite && editingStop && (
          <InlineFormShell title={`Edit ${editingStop.stop_name}`}>
            <RouteStopForm
              stop={editingStop}
              routes={routes}
              onSubmit={handleUpdateStop}
              onCancel={() => setEditingStop(null)}
            />
          </InlineFormShell>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="stop-search">
            Search stops
          </label>
          <input
            id="stop-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by stop, route, order, time, or status"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </div>

        {loading && (
          <DataState title="Loading stops" message="Fetching stop records visible to you." />
        )}
        {error && <DataState title="Unable to load stops" message={error} />}
        {!loading && !error && stops.length === 0 && (
          <DataState
            title="No stops visible"
            message="No stop records are available for this account under the current RLS policies."
          />
        )}
        {!loading && !error && stops.length > 0 && filteredStops.length === 0 && (
          <DataState
            title="No stops match"
            message="Try a different stop, route, order, time, or status search."
          />
        )}

        {!loading && !error && filteredStops.length > 0 && (
          <section className="grid gap-4">
            {filteredStops.map((stop) => (
              <Card key={stop.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-500">
                      Stop {stop.stop_order} | {routeLabels.get(stop.route_id) ?? stop.route_id}
                    </p>
                    <h2 className="text-xl font-bold text-navy-900">{stop.stop_name}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill tone={routeStopStatusTone[stop.status]}>{stop.status}</StatusPill>
                    {canWrite && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => {
                        setShowCreateForm(false);
                        setEditingStop(stop);
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
                    Planned arrival:{' '}
                    <span className="font-semibold text-navy-900">
                      {formatTime(stop.planned_arrival_time)}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Coordinates:{' '}
                    <span className="font-semibold text-navy-900">
                      {stop.latitude != null && stop.longitude != null
                        ? `${stop.latitude}, ${stop.longitude}`
                        : 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Created:{' '}
                    <span className="font-semibold text-navy-900">
                      {formatDate(stop.created_at)}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Stop id: <span className="font-semibold text-navy-900">{stop.id}</span>
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
