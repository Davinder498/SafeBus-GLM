import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AdminRoutesMap } from '@/components/admin/AdminRoutesMap';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { mapTileConfig } from '@/config/mapTiles';
import { getVisibleProfiles, getVisibleSchools } from '@/services/adminOrganizationService';
import { fetchAdminAssignments } from '@/services/driverAssignmentService';
import {
  getVisibleBuses,
  getVisibleDrivers,
  getVisibleRouteStops,
  getVisibleRoutes,
} from '@/services/transportationStructureService';
import type { OrganizationProfile, School } from '@/types/organization';
import type { DriverRouteAssignment } from '@/types/driverAssignments';
import type { Bus, Driver, Route, RouteStop } from '@/types/transportation';

interface RouteDetailData {
  route: Route;
  stops: RouteStop[];
  schools: School[];
  buses: Bus[];
  drivers: Driver[];
  assignments: DriverRouteAssignment[];
  profiles: OrganizationProfile[];
}

export function AdminRouteDetailPage() {
  const { routeId } = useParams<{ routeId: string }>();
  const [data, setData] = useState<RouteDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      getVisibleRoutes(),
      getVisibleRouteStops(),
      getVisibleSchools(),
      getVisibleBuses(),
      getVisibleDrivers(),
      fetchAdminAssignments(),
      getVisibleProfiles(),
    ])
      .then(([routes, stops, schools, buses, drivers, assignments, profiles]) => {
        if (!mounted) return;
        const route = routes.find((item) => item.id === routeId);
        if (!route || route.status === 'archived') {
          setError('This route is not available.');
          return;
        }
        setData({
          route,
          stops: stops
            .filter((stop) => stop.route_id === route.id && stop.status !== 'archived')
            .sort((a, b) => a.stop_order - b.stop_order),
          schools,
          buses,
          drivers,
          assignments: assignments.filter(
            (assignment) => assignment.route_id === route.id && assignment.status === 'active',
          ),
          profiles,
        });
      })
      .catch(() => {
        if (mounted) setError('We could not load this route. Please try again.');
      });
    return () => {
      mounted = false;
    };
  }, [routeId]);

  const busNames = useMemo(
    () => new Map(data?.buses.map((bus) => [bus.id, bus.bus_number]) ?? []),
    [data?.buses],
  );
  const profileNames = useMemo(
    () => new Map(data?.profiles.map((profile) => [profile.id, profile.full_name]) ?? []),
    [data?.profiles],
  );

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6">
        <Link to="/admin" className="inline-flex text-sm font-semibold text-navy-700 hover:underline">
          &larr; Back to overview
        </Link>
        {!data && !error && <DataState title="Loading route" message="Fetching route details and map." />}
        {error && <DataState title="Route unavailable" message={error} />}
        {data && (
          <>
            <PageHeader
              eyebrow={data.route.route_code}
              title={data.route.route_name}
              description="Route details, assignments, ordered stops, and map."
            />
            <section className="grid gap-4 md:grid-cols-3">
              <Card className="p-5">
                <p className="text-sm font-semibold text-gray-600">Status</p>
                <div className="mt-3">
                  <StatusPill tone={data.route.status === 'active' ? 'success' : 'neutral'}>
                    {data.route.status}
                  </StatusPill>
                </div>
              </Card>
              <Card className="p-5">
                <p className="text-sm font-semibold text-gray-600">School</p>
                <p className="mt-2 font-bold text-navy-900">
                  {data.route.school_id
                    ? data.schools.find((school) => school.id === data.route.school_id)?.name ?? 'School unavailable'
                    : 'No school selected'}
                </p>
              </Card>
              <Card className="p-5">
                <p className="text-sm font-semibold text-gray-600">Stops</p>
                <p className="mt-1 text-3xl font-bold text-navy-900">{data.stops.length}</p>
              </Card>
            </section>

            <AdminRoutesMap routes={[{ route: data.route, stops: data.stops }]} tileConfig={mapTileConfig} />

            <section className="grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h2 className="text-lg font-bold text-navy-900">Driver and bus</h2>
                {data.assignments.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-600">No active driver and bus assignment.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {data.assignments.map((assignment) => {
                      const driver = data.drivers.find((item) => item.id === assignment.driver_id);
                      return (
                        <li key={assignment.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                          <p className="font-semibold text-navy-900">Bus {busNames.get(assignment.bus_id) ?? 'unavailable'}</p>
                          <p className="text-gray-600">
                            {profileNames.get(driver?.profile_id ?? '') ?? 'Driver unavailable'} · {assignment.trip_type}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
              <Card className="p-5">
                <h2 className="text-lg font-bold text-navy-900">Ordered stops</h2>
                {data.stops.length === 0 ? (
                  <p className="mt-3 text-sm text-gray-600">No stops have been added.</p>
                ) : (
                  <ol className="mt-3 space-y-3">
                    {data.stops.map((stop) => (
                      <li key={stop.id} className="flex gap-3 rounded-lg bg-gray-50 p-3 text-sm">
                        <span className="font-bold text-navy-700">{stop.stop_order}</span>
                        <div>
                          <p className="font-semibold text-navy-900">{stop.stop_name}</p>
                          {stop.school_id && (
                            <p className="text-gray-600">
                              School stop: {data.schools.find((school) => school.id === stop.school_id)?.name ?? 'School unavailable'}
                            </p>
                          )}
                          {stop.planned_arrival_time && (
                            <p className="text-gray-600">Planned {stop.planned_arrival_time.slice(0, 5)}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </section>
            <Link
              to={`/admin/routes/${data.route.id}/manage`}
              className="inline-flex rounded-lg bg-navy-700 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"
            >
              Manage route
            </Link>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
