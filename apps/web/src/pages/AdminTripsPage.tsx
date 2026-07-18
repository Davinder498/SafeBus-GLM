import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { NotificationDeliverySummaryCard } from '@/components/admin/NotificationDeliverySummaryCard';
import { fetchAdminAssignments } from '@/services/driverAssignmentService';
import { fetchAdminTrips } from '@/services/adminSetupService';
import { getVisibleBuses, getVisibleDrivers, getVisibleRoutes, getVisibleRouteTripPatterns } from '@/services/transportationStructureService';
import { getVisibleProfiles } from '@/services/adminOrganizationService';
import type { DriverRouteAssignment } from '@/types/driverAssignments';
import type { DriverTrip } from '@/types/trips';
import type { Bus, Driver, Route, RouteTripPattern } from '@/types/transportation';
import type { OrganizationProfile } from '@/types/organization';

type State = { trips: DriverTrip[]; assignments: DriverRouteAssignment[]; buses: Bus[]; drivers: Driver[]; routes: Route[]; profiles: OrganizationProfile[]; tripPatterns: RouteTripPattern[] };
type TripNames = { bus: Map<string, string>; route: Map<string, string>; driver: Map<string, string>; trip: Map<string, string> } | null;

export function AdminTripsPage() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { void Promise.all([fetchAdminTrips(), fetchAdminAssignments(), getVisibleBuses(), getVisibleDrivers(), getVisibleRoutes(), getVisibleProfiles(), getVisibleRouteTripPatterns().catch(() => [])]).then(([trips, assignments, buses, drivers, routes, profiles, tripPatterns]) => setState({ trips, assignments, buses, drivers, routes, profiles, tripPatterns })).catch(() => setError(true)); }, []);
  const names = useMemo(() => {
    if (!state) return null;
    const profile = new Map(state.profiles.map((item) => [item.id, item.full_name]));
    return { bus: new Map(state.buses.map((item) => [item.id, `Bus ${item.bus_number}`])), route: new Map(state.routes.map((item) => [item.id, item.route_name])), driver: new Map(state.drivers.map((item) => [item.id, profile.get(item.profile_id) ?? 'Driver'])), trip: new Map(state.tripPatterns.map((item) => [item.id, item.display_name])) };
  }, [state]);
  const active = state?.trips.filter((trip) => trip.status === 'active') ?? [];
  const completed = state?.trips.filter((trip) => trip.status === 'completed').slice(0, 10) ?? [];
  return <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}><div className="space-y-6">
    <PageHeader eyebrow="Operations" title="Trips" description="Drivers start trips from active assignments. Admins prepare routes and monitor progress here." />
    {error && <DataState title="Trips unavailable" message="Try again, or open Live Fleet to check active operations." />}
    {!state && !error && <DataState title="Loading trips" message="Checking route readiness and recent activity." />}
    {state && <><Card className="p-5"><h2 className="text-xl font-bold text-navy-900">How trips start</h2><p className="mt-2 text-sm text-gray-600">An admin connects an active driver, bus, and route. The assigned driver then starts and ends the trip from the Driver Dashboard.</p><div className="mt-4 flex flex-wrap gap-4"><Link className="font-semibold text-navy-700 underline" to="/admin/driver-assignments">Manage assignments</Link><Link className="font-semibold text-navy-700 underline" to="/admin/live-trips">Open Live Fleet</Link></div></Card>
      <section><h2 className="text-xl font-bold text-navy-900">Route readiness</h2><div className="mt-3 grid gap-4">{state.assignments.filter((item) => item.status === 'active').length === 0 ? <DataState title="No routes ready to start" message="Assign an active driver and bus to a route before a driver can start a trip." /> : state.assignments.filter((item) => item.status === 'active').map((item) => { const ready = state.drivers.find((d) => d.id === item.driver_id)?.status === 'active' && state.buses.find((b) => b.id === item.bus_id)?.status === 'active' && state.routes.find((r) => r.id === item.route_id)?.status === 'active'; return <Card key={item.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-navy-900">{names?.route.get(item.route_id) ?? 'Route'}</h3><p className="mt-1 text-sm text-gray-600">{names?.driver.get(item.driver_id) ?? 'Driver'} · {names?.bus.get(item.bus_id) ?? 'Bus'} · {item.route_trip_pattern_id ? names?.trip.get(item.route_trip_pattern_id) ?? 'Named trip' : 'Legacy trip'}</p></div><StatusPill tone={ready ? 'success' : 'warning'}>{ready ? 'Ready for driver' : 'Needs attention'}</StatusPill></div>{!ready && <p className="mt-3 text-sm text-warning-700">A linked driver, bus, or route is inactive. Update the record before starting.</p>}</Card>; })}</div></section>
      <NotificationDeliverySummaryCard />
      <TripSection title="Active trips" trips={active} names={names} empty="No active trips right now." />
      <TripSection title="Recently completed" trips={completed} names={names} empty="No completed trips yet." />
    </>}
  </div></DashboardLayout>;
}

function TripSection({ title, trips, names, empty }: { title: string; trips: DriverTrip[]; names: TripNames; empty: string }) {
  return <section><h2 className="text-xl font-bold text-navy-900">{title}</h2><div className="mt-3 grid gap-3">{trips.length === 0 ? <Card className="p-5 text-sm text-gray-600">{empty}</Card> : trips.map((trip) => <Card key={trip.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-navy-900">{names?.route.get(trip.route_id) ?? 'Route'} · {names?.bus.get(trip.bus_id) ?? 'Bus'}</h3><p className="mt-1 text-sm text-gray-600">{names?.driver.get(trip.driver_id) ?? 'Driver'} · Started {new Date(trip.started_at).toLocaleString()}</p>{trip.ended_at && <p className="mt-1 text-sm text-gray-600">Ended {new Date(trip.ended_at).toLocaleString()}</p>}</div><StatusPill tone={trip.status === 'active' ? 'success' : 'neutral'}>{trip.status === 'active' ? 'Active' : 'Completed'}</StatusPill></div></Card>)}</div></section>;
}
