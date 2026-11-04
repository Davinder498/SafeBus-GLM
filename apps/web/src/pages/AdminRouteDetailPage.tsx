import { useEffect, useMemo, useState } from 'react';
import { BusFront, MapPin, Route as RouteIcon, UserRound, ChevronRight } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { DropdownMenu, DropdownItem } from '@/components/ui/DropdownMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AdminWriteError } from '@/components/admin/TransportationAdminForms';
import { AdminRoutesMap } from '@/components/admin/AdminRoutesMap';
import { RouteSetupPanel } from '@/components/admin/RouteSetupPanel';
import { useAuth } from '@/contexts/useAuth';
import { OperationalNotesPanel } from '@/components/admin/OperationalNotesPanel';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useMapTileConfig } from '@/hooks/useMapTileConfig';
import { fetchAdminRouteDetail } from '@/services/adminRouteDetailService';
import { deleteRoute, updateRoute } from '@/services/transportationStructureService';
import type { BusServiceOption } from '@/services/studentBusAssignmentService';
import type { OrganizationProfile, School } from '@/types/organization';
import type { DriverRouteAssignment } from '@/types/driverAssignments';
import type {
  Bus,
  Driver,
  Route,
  RouteDirection,
  RouteStop,
  RouteTripPattern,
  RouteTripStopSchedule,
} from '@/types/transportation';
import { activeDriverForBusService } from '@/utils/transportAssignments';
import type { RouteServiceDay } from '@/types/transportation';

type RouteWorkspaceTab = 'overview' | 'route' | 'assignments' | 'students';

function workspaceTabFromHash(hash: string): RouteWorkspaceTab {
  if (hash === '#route-details' || hash === '#route-workspace' || hash === '#road-path') return 'route';
  if (hash === '#route-service') return 'assignments';
  if (hash === '#route-students') return 'students';
  return 'overview';
}

const routeTabs: Array<{ id: RouteWorkspaceTab; label: string; icon: typeof RouteIcon }> = [
  { id: 'overview', label: 'Overview', icon: RouteIcon },
  { id: 'route', label: 'Route & Stops', icon: MapPin },
  { id: 'assignments', label: 'Assignments', icon: BusFront },
  { id: 'students', label: 'Students', icon: UserRound },
];

interface RouteDetailData {
  route: Route;
  stops: RouteStop[];
  schools: School[];
  buses: Bus[];
  drivers: Driver[];
  assignments: DriverRouteAssignment[];
  busServices: BusServiceOption[];
  profiles: OrganizationProfile[];
  tripPatterns: RouteTripPattern[];
  schedules: RouteTripStopSchedule[];
  serviceDays: RouteServiceDay[];
}

export function AdminRouteDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<RouteWorkspaceTab>(() =>
    workspaceTabFromHash(window.location.hash),
  );
  const [dirtyTab, setDirtyTab] = useState<RouteWorkspaceTab | null>(null);
  useEffect(() => {
    setActiveTab(workspaceTabFromHash(location.hash));
  }, [location.hash]);
  const [removing, setRemoving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const { profile } = useAuth();
  const { routeId } = useParams<{ routeId: string }>();
  const mapTileConfig = useMapTileConfig();
  const [loadedData, setData] = useState<RouteDetailData | null>(null);
  const data = loadedData?.route.id === routeId ? loadedData : null;
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<RouteDirection>('forward');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let mounted = true;
    setError(null);
    // Keep the current workspace mounted during post-save refreshes so its
    // confirmation and form state survive. Never display another route's data.
    setData((current) => current?.route.id === routeId ? current : null);
    if (!routeId) { setError('This route is not available.'); return; }
    void fetchAdminRouteDetail(routeId, {
      busId: searchParams.get('newBusId'), driverId: searchParams.get('newDriverId'),
    }).then((detail) => {
      if (!mounted) return;
      if (!detail) setError('This route is not available.');
      else setData(detail);
    })
      .catch(() => {
        if (mounted) setError('We could not load this route. Please try again.');
      });
    return () => {
      mounted = false;
    };
  }, [routeId, revision, searchParams]);

  const busNames = useMemo(
    () => new Map(data?.buses.map((bus) => [bus.id, bus.bus_number]) ?? []),
    [data?.buses],
  );
  const profileNames = useMemo(
    () => new Map(data?.profiles.map((profile) => [profile.id, profile.full_name]) ?? []),
    [data?.profiles],
  );
  const selectedPattern = data?.tripPatterns.find((pattern) => pattern.direction === direction);
  // Returned identifiers are accepted only when found in this route's
  // already-authorized, active roster; never write an assignment on return.
  const returnedBusId = data?.buses.some(
    (bus) => bus.id === searchParams.get('newBusId') && bus.status === 'active',
  )
    ? (searchParams.get('newBusId') ?? undefined)
    : undefined;
  const returnedServiceId = data?.busServices.some(
    (service) => service.id === searchParams.get('service'),
  )
    ? (searchParams.get('service') ?? undefined)
    : undefined;
  const returnedDriverId =
    returnedServiceId &&
    data?.drivers.some(
      (driver) => driver.id === searchParams.get('newDriverId') && driver.status === 'active',
    )
      ? (searchParams.get('newDriverId') ?? undefined)
      : undefined;
  function selectWorkspaceTab(tab: RouteWorkspaceTab, openEditor = false) {
    if (tab !== activeTab && dirtyTab === activeTab &&
      !window.confirm('Leave this section? Unsaved form changes will be lost.')) return;
    setDirtyTab(null);
    setActiveTab(tab);
    const hash = tab === 'route' ? (openEditor ? '#route-details' : '#route-workspace')
      : tab === 'assignments' ? '#route-service'
      : tab === 'students' ? '#route-students' : '#setup';
    navigate({ pathname: location.pathname, search: location.search, hash }, { replace: true });
  }

  const displayedStops = useMemo(
    () =>
      data
        ? [...data.stops].sort((a, b) =>
            direction === 'forward' ? a.stop_order - b.stop_order : b.stop_order - a.stop_order,
          )
        : [],
    [data, direction],
  );

  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div
        className="space-y-6"
        onChangeCapture={(event) => {
          if ((event.target as HTMLElement).closest('form')) setDirtyTab(activeTab);
        }}
      >
        <Link
          to="/admin/routes"
          className="inline-flex text-sm font-semibold text-navy-700 hover:underline"
        >
          &larr; Back to routes
        </Link>
        {!data && !error && (
          <DataState title="Loading route" message="Fetching route details and map." />
        )}
        {error && (
          <>
            <DataState title="Route unavailable" message={error} />
            <button
              type="button"
              className="rounded-lg bg-navy-700 px-4 py-3 font-semibold text-white"
              onClick={() => setRevision((n) => n + 1)}
            >
              Retry route loading
            </button>
          </>
        )}
        {data && !error && (
          <>
            <PageHeader
              eyebrow={data.route.route_code}
              title={data.route.route_name}
              description="Manage this route, its stops, bus services, drivers and student assignments from one workspace."
              action={
                profile?.role === 'tenant_admin' && (
                  <DropdownMenu
                    trigger={
                      <span className="inline-flex rounded-lg border border-navy-200 px-4 py-2 font-semibold text-navy-700">
                        Route actions
                      </span>
                    }
                  >
                    {data.route.status !== 'archived' && (
                      <DropdownItem
                        onClick={() => {
                          setWriteError(null);
                          setArchiving(true);
                        }}
                      >
                        Archive route
                      </DropdownItem>
                    )}
                    <DropdownItem
                      destructive
                      onClick={() => {
                        setWriteError(null);
                        setRemoving(true);
                      }}
                    >
                      Delete route
                    </DropdownItem>
                  </DropdownMenu>
                )
              }
            />
            <AdminWriteError message={writeError} />
            <ConfirmDialog
              open={archiving}
              title={`Archive ${data.route.route_name}`}
              description="Archive this route while retaining its road paths and operational history. Review and end its bus service assignments before archiving."
              confirmLabel="Archive route"
              busy={busy}
              onCancel={() => setArchiving(false)}
              onConfirm={() => {
                if (busy) return;
                if (data.busServices.length > 0) {
                  setWriteError(
                    'End this route’s active bus service assignments before archiving.',
                  );
                  setArchiving(false);
                  return;
                }
                setBusy(true);
                void updateRoute(data.route.id, { status: 'archived' })
                  .then(() => navigate('/admin/routes'))
                  .catch((cause: unknown) => {
                    setWriteError(
                      cause instanceof Error ? cause.message : 'Unable to archive route.',
                    );
                    setArchiving(false);
                  })
                  .finally(() => setBusy(false));
              }}
            />
            <ConfirmDialog
              open={removing}
              title={`Delete ${data.route.route_name}`}
              description="Permanently delete this route and its setup. Routes with saved road paths or operational history cannot be deleted. This action cannot be undone."
              confirmLabel="Delete route"
              destructive
              busy={busy}
              onCancel={() => setRemoving(false)}
              onConfirm={() => {
                if (busy) return;
                setBusy(true);
                void deleteRoute(data.route.id)
                  .then(() => navigate('/admin/routes'))
                  .catch((cause: unknown) => {
                    setWriteError(
                      cause instanceof Error ? cause.message : 'Unable to delete route.',
                    );
                    setRemoving(false);
                  })
                  .finally(() => setBusy(false));
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill tone={data.route.status === 'active' ? 'success' : 'neutral'}>
                {data.route.status}
              </StatusPill>
              <span className="text-sm font-medium text-[var(--color-text-muted)]">
                {data.route.route_code} · {data.route.service_schedule_mode === 'dates'
                  ? 'Specific service dates'
                  : 'Recurring service'}
              </span>
            </div>

            <div className="border-b border-[var(--color-border)]" data-testid="route-workspace-tabs">
              <nav aria-label="Route workspace" className="flex gap-2 overflow-x-auto pb-1">
                {routeTabs.filter((tab) => profile?.role === 'tenant_admin' || tab.id !== 'students').map(({ id, label, icon: Icon }) => (
                  <button
                    type="button"
                    key={id}
                    aria-current={activeTab === id ? 'page' : undefined}
                    onClick={() => selectWorkspaceTab(id)}
                    className={
                      'inline-flex min-h-12 shrink-0 items-center gap-2 rounded-t-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-focus)] ' +
                      (activeTab === id
                        ? 'border-b-[3px] border-[var(--color-action)] bg-[var(--color-selection)] text-[var(--color-action)]'
                        : 'border-b-[3px] border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-raised)] hover:text-[var(--color-text)]')
                    }
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    {label}
                  </button>
                ))}
              </nav>
            </div>

            {activeTab === 'overview' && (
              <div className="space-y-5" data-testid="route-overview-workspace">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Saved stops', value: String(data.stops.length), icon: MapPin },
                    { label: 'Bus services', value: String(data.busServices.length), icon: BusFront },
                    { label: 'Current drivers', value: String(data.busServices.filter((service) => activeDriverForBusService(service, data.assignments)).length), icon: UserRound },
                  ].map(({ label, value, icon: Icon }) => (
                    <Card key={label} className="flex items-center gap-4 p-4 shadow-sm">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-selection)] text-[var(--color-action)]">
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      <span>
                        <span className="block text-2xl font-extrabold tracking-tight text-[var(--color-text)]">{value}</span>
                        <span className="block text-sm font-medium text-[var(--color-text-muted)]">{label}</span>
                      </span>
                    </Card>
                  ))}
                </div>
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
                  <AdminRoutesMap
                    routes={[{ route: data.route, stops: data.stops }]}
                    tileConfig={mapTileConfig}
                  />
                  <Card className="p-5 shadow-sm sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-lg font-bold text-[var(--color-text)]">Route details</h2>
                      {profile?.role === 'tenant_admin' && (
                        <button type="button" onClick={() => selectWorkspaceTab('route')} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--color-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]">
                          Edit <ChevronRight className="h-4 w-4" aria-hidden />
                        </button>
                      )}
                    </div>
                    <dl className="mt-4 space-y-4">
                      <div className="border-b border-[var(--color-border)] pb-3">
                        <dt className="text-xs font-semibold text-[var(--color-text-muted)]">Name and code</dt>
                        <dd className="mt-1 font-bold text-[var(--color-text)]">{data.route.route_name} · {data.route.route_code}</dd>
                      </div>
                      <div className="border-b border-[var(--color-border)] pb-3">
                        <dt className="text-xs font-semibold text-[var(--color-text-muted)]">Service calendar</dt>
                        <dd className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                          {data.route.service_schedule_mode === 'dates'
                            ? String(data.route.service_dates?.length ?? 0) + ' specific dates'
                            : data.serviceDays.length === 0
                              ? 'Every day'
                              : data.serviceDays.filter((day) => day.status === 'active')
                                  .sort((a, b) => a.day_of_week - b.day_of_week)
                                  .map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.day_of_week])
                                  .join(', ') || 'Closed for new trips'}
                        </dd>
                        {data.route.service_schedule_mode === 'dates' && (
                          <details className="mt-2 text-sm">
                            <summary className="cursor-pointer font-medium text-[var(--color-action)]">
                              Specific dates ({data.route.service_dates?.length ?? 0})
                            </summary>
                            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[var(--color-text-muted)]">
                              {(data.route.service_dates ?? []).map((date) => <li key={date}>{date}</li>)}
                            </ul>
                          </details>
                        )}
                      </div>
                      <div className="border-b border-[var(--color-border)] pb-3">
                        <dt className="text-xs font-semibold text-[var(--color-text-muted)]">Route definition</dt>
                        <dd className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                          {data.route.definition_status === 'ready' ? 'Complete' : 'Needs review'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold text-[var(--color-text-muted)]">School metadata</dt>
                        <dd className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                          {data.route.school_id
                            ? (data.schools.find((school) => school.id === data.route.school_id)?.name ?? 'Unavailable')
                            : 'Not assigned (optional)'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold text-[var(--color-text-muted)]">Saved stops</dt>
                        <dd className="mt-2">
                          {data.stops.length === 0 ? (
                            <p className="text-sm text-[var(--color-text-muted)]">No stops added yet.</p>
                          ) : (
                            <ul className="space-y-1.5 text-sm text-[var(--color-text)]">
                              {data.stops.slice(0, 5).map((stop, index) => (
                                <li key={stop.id} className="flex gap-2">
                                  <span className="font-semibold text-[var(--color-action)]">{index + 1}.</span>
                                  <span>{stop.stop_name}</span>
                                </li>
                              ))}
                              {data.stops.length > 5 && (
                                <li className="text-xs text-[var(--color-text-muted)]">
                                  +{data.stops.length - 5} more stops in Route &amp; Stops
                                </li>
                              )}
                            </ul>
                          )}
                        </dd>
                      </div>
                    </dl>
                  </Card>
                </div>
                <Card className="p-5 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-bold text-[var(--color-text)]">Bus services</h2>
                    {profile?.role === 'tenant_admin' && (
                      <button type="button" onClick={() => selectWorkspaceTab('assignments')} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--color-action)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]">
                        Manage assignments <ChevronRight className="h-4 w-4" aria-hidden />
                      </button>
                    )}
                  </div>
                  {data.busServices.length === 0 ? (
                    <p className="mt-4 text-sm text-[var(--color-text-muted)]">No bus services assigned yet.</p>
                  ) : (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[36rem] text-left text-sm">
                        <thead className="border-b border-[var(--color-border)] text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                          <tr>
                            <th scope="col" className="py-3 pr-3">Service</th>
                            <th scope="col" className="py-3 pr-3">Bus</th>
                            <th scope="col" className="py-3 pr-3">Driver</th>
                            <th scope="col" className="py-3">Service dates</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border)]">
                          {data.busServices.map((service) => {
                            const plan = activeDriverForBusService(service, data.assignments);
                            const driver = data.drivers.find((item) => item.id === plan?.driver_id);
                            return (
                              <tr key={service.id}>
                                <td className="py-3 pr-3 font-semibold text-[var(--color-text)]">{service.trip_name}</td>
                                <td className="py-3 pr-3 text-[var(--color-text)]">Bus {busNames.get(service.bus_id) ?? service.bus_number}</td>
                                <td className="py-3 pr-3 text-[var(--color-text)]">
                                  {profileNames.get(driver?.profile_id ?? '') ?? 'Not assigned'}
                                </td>
                                <td className="py-3 text-[var(--color-text-muted)]">
                                  {service.effective_from ?? 'Open'} – {service.effective_to ?? 'Open ended'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {activeTab === 'route' && (
              <div className="space-y-5">
                {profile?.role === 'tenant_admin' && (
                  <RouteSetupPanel
                    key={data.route.id}
                    activeTab="route"
                    onRequestTab={selectWorkspaceTab}
                    route={data.route}
                    stops={data.stops}
                    tileConfig={mapTileConfig}
                    schools={data.schools}
                    buses={data.buses}
                    drivers={data.drivers}
                    profiles={data.profiles}
                    tripPatterns={data.tripPatterns}
                    schedules={data.schedules}
                    services={data.busServices}
                    assignments={data.assignments}
                    returnedBusId={returnedBusId}
                    returnedDriverId={returnedDriverId}
                    returnedServiceId={returnedServiceId}
                    onSaved={() => { setDirtyTab(null); setRevision((n) => n + 1); }}
                  />
                )}
                <Card className="p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-[var(--color-text)]">Trip stop order</h2>
                      <p className="text-sm text-[var(--color-text-muted)]">
                        {selectedPattern?.display_name ?? direction}
                      </p>
                    </div>
                    <div className="flex rounded-lg border border-[var(--color-border)] p-1">
                      {(['forward', 'reverse'] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={'rounded-md px-3 py-2 text-sm font-semibold ' + (direction === value ? 'bg-[var(--color-action)] text-white' : 'text-[var(--color-text)]')}
                          onClick={() => setDirection(value)}
                        >
                          {data.tripPatterns.find((pattern) => pattern.direction === value)?.display_name ?? value}
                        </button>
                      ))}
                    </div>
                  </div>
                  {data.stops.length === 0 ? (
                    <p className="mt-4 text-sm text-[var(--color-text-muted)]">No stops have been added.</p>
                  ) : (
                    <ol className="mt-4 grid gap-2 sm:grid-cols-2">
                      {displayedStops.map((stop, index) => {
                        const planned = data.schedules.find((schedule) =>
                          schedule.route_trip_pattern_id === selectedPattern?.id && schedule.route_stop_id === stop.id,
                        )?.planned_arrival_time;
                        return (
                          <li key={stop.id} className="flex gap-3 rounded-xl bg-[var(--color-surface-subtle)] p-3 text-sm">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-selection)] font-bold text-[var(--color-action)]">{index + 1}</span>
                            <div className="min-w-0">
                              <p className="font-semibold text-[var(--color-text)]">{stop.stop_name}</p>
                              {planned && <p className="mt-1 text-[var(--color-text-muted)]">Planned {planned.slice(0, 5)}</p>}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </Card>
                <details className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                  <summary className="cursor-pointer text-sm font-semibold text-[var(--color-text)]">Operational notes</summary>
                  <div className="mt-4"><OperationalNotesPanel targetEntity="route" targetId={data.route.id} /></div>
                </details>
              </div>
            )}

            {activeTab === 'overview' && profile?.role === 'tenant_admin' && (
              <RouteSetupPanel
                key={data.route.id}
                activeTab="overview"
                onRequestTab={selectWorkspaceTab}
                route={data.route}
                stops={data.stops}
                tileConfig={mapTileConfig}
                schools={data.schools}
                buses={data.buses}
                drivers={data.drivers}
                profiles={data.profiles}
                tripPatterns={data.tripPatterns}
                schedules={data.schedules}
                services={data.busServices}
                assignments={data.assignments}
                returnedBusId={returnedBusId}
                returnedDriverId={returnedDriverId}
                returnedServiceId={returnedServiceId}
                onSaved={() => { setDirtyTab(null); setRevision((n) => n + 1); }}
              />
            )}

            {(activeTab === 'assignments' || activeTab === 'students') && profile?.role === 'tenant_admin' && (
              <RouteSetupPanel
                key={data.route.id}
                activeTab={activeTab}
                onRequestTab={selectWorkspaceTab}
                route={data.route}
                stops={data.stops}
                tileConfig={mapTileConfig}
                schools={data.schools}
                buses={data.buses}
                drivers={data.drivers}
                profiles={data.profiles}
                tripPatterns={data.tripPatterns}
                schedules={data.schedules}
                services={data.busServices}
                assignments={data.assignments}
                returnedBusId={returnedBusId}
                returnedDriverId={returnedDriverId}
                returnedServiceId={returnedServiceId}
                onSaved={() => {
                  if (searchParams.has('newBusId') || searchParams.has('newDriverId')) {
                    navigate('/admin/routes/' + data.route.id + '#route-service', { replace: true });
                  }
                  setDirtyTab(null);
                  setRevision((n) => n + 1);
                }}
              />
            )}

            {activeTab === 'assignments' && profile?.role !== 'tenant_admin' && (
              <Card className="p-5 text-sm text-[var(--color-text-muted)]">
                Transportation assignments are managed by the school authority administrator.
              </Card>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
