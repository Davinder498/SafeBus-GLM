import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import { getVisibleRoutes } from '@/services/transportationStructureService';
import type { School } from '@/types/organization';
import type { Route, RouteStatus, RouteType } from '@/types/transportation';

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
  const [routes, setRoutes] = useState<Route[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadRoutes() {
      setLoading(true);
      setError(null);

      try {
        const [nextRoutes, nextSchools] = await Promise.all([
          getVisibleRoutes(),
          getVisibleSchools(),
        ]);

        if (active) {
          setRoutes(nextRoutes);
          setSchools(nextSchools);
        }
      } catch (routesError) {
        if (active) {
          setError(routesError instanceof Error ? routesError.message : 'Unable to load routes.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadRoutes();

    return () => {
      active = false;
    };
  }, []);

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
        schoolNames.get(route.school_id) ?? route.school_id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, routes, schoolNames]);

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Routes"
          title="Visible routes"
          description="Read-only route records returned by Supabase under the current admin user's RLS permissions."
        />

        <Card className="border-navy-100 bg-navy-50 p-5">
          <p className="text-sm font-semibold text-navy-900">
            Route creation and scheduling workflows will be added in a later milestone.
          </p>
        </Card>

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
                      {schoolNames.get(route.school_id) ?? route.school_id}
                    </p>
                  </div>
                  <StatusPill tone={routeStatusTone[route.status]}>{route.status}</StatusPill>
                </div>
                <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                  <p className="text-gray-600">
                    Route type:{' '}
                    <span className="font-semibold text-navy-900">
                      {routeTypeLabels[route.route_type]}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    School id:{' '}
                    <span className="font-semibold text-navy-900">{route.school_id}</span>
                  </p>
                  <p className="text-gray-600">
                    Created:{' '}
                    <span className="font-semibold text-navy-900">
                      {formatDate(route.created_at)}
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
