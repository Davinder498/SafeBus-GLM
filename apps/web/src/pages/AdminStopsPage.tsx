import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { getVisibleRoutes, getVisibleRouteStops } from '@/services/transportationStructureService';
import type { Route, RouteStop, RouteStopStatus } from '@/types/transportation';

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
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStops() {
      setLoading(true);
      setError(null);

      try {
        const [nextStops, nextRoutes] = await Promise.all([
          getVisibleRouteStops(),
          getVisibleRoutes(),
        ]);

        if (active) {
          setStops(nextStops);
          setRoutes(nextRoutes);
        }
      } catch (stopsError) {
        if (active) {
          setError(stopsError instanceof Error ? stopsError.message : 'Unable to load stops.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadStops();

    return () => {
      active = false;
    };
  }, []);

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

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Stops"
          title="Visible route stops"
          description="Read-only stop records returned by Supabase under the current admin user's RLS permissions."
        />

        <Card className="border-navy-100 bg-navy-50 p-5">
          <p className="text-sm font-semibold text-navy-900">
            Stop creation and route sequencing workflows will be added in a later milestone.
          </p>
        </Card>

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
                  <StatusPill tone={routeStopStatusTone[stop.status]}>{stop.status}</StatusPill>
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
