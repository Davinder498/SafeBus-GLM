import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DropdownMenu, DropdownItem } from '@/components/ui/DropdownMenu';
import type { MapTileConfig } from '@/config/mapTiles';
import { useAuth } from '@/contexts/useAuth';
import {
  fetchAdminBusWorkspace,
  type AdminBusStudentAssignment,
} from '@/services/adminBusWorkspaceService';
import {
  getVisibleRouteServiceDays,
  saveRouteServiceDays,
} from '@/services/phase6OperationsService';
import {
  setBusRouteService,
  endBusRouteService,
  setStudentBusServiceStatus,
  setStudentBusService,
  type BusServiceOption,
} from '@/services/studentBusAssignmentService';
import { getVisibleRoutes, saveRouteDefinition } from '@/services/transportationStructureService';
import type { DriverRouteAssignment } from '@/types/driverAssignments';
import type { OrganizationProfile, School } from '@/types/organization';
import type {
  Bus,
  Driver,
  Route,
  RouteServiceDay,
  RouteStop,
  RouteTripPattern,
  RouteTripStopSchedule,
  SaveRouteDefinitionInput,
} from '@/types/transportation';
import { groupDirectionalAssignments } from '@/utils/directionalAssignments';
import { DirectionalStudentBusAssignmentForm } from './DirectionalStudentBusAssignmentForm';
import { RouteDriverSetupForm } from './RouteDriverSetupForm';
import { RoutePathEditor } from './RoutePathEditor';
import { RouteWithStopsForm } from './RouteWithStopsForm';
import { RouteBusAssignmentForm } from './TransportAssignmentForms';

export function RouteSetupPanel({
  route,
  stops,
  schools,
  buses,
  drivers,
  profiles,
  tripPatterns,
  schedules,
  services,
  assignments,
  tileConfig,
  onSaved,
}: {
  route: Route;
  stops: RouteStop[];
  schools: School[];
  buses: Bus[];
  drivers: Driver[];
  profiles: OrganizationProfile[];
  tripPatterns: RouteTripPattern[];
  schedules: RouteTripStopSchedule[];
  services: BusServiceOption[];
  assignments: DriverRouteAssignment[];
  tileConfig: MapTileConfig;
  onSaved(): void;
}) {
  const { profile } = useAuth();
  const [ending, setEnding] = useState<{ label: string; save(): Promise<void> } | null>(null);
  const [endingBusy, setEndingBusy] = useState(false);
  const [endingError, setEndingError] = useState<string | null>(null);
  const [editing, setEditing] = useState(window.location.hash === '#route-details');
  const [addingBus, setAddingBus] = useState(false);
  const [editingBus, setEditingBus] = useState<BusServiceOption | null>(null);
  const [studentForm, setStudentForm] = useState<AdminBusStudentAssignment[] | null>(null);
  const [studentRevision, setStudentRevision] = useState(0);
  const [roster, setRoster] = useState<AdminBusStudentAssignment[]>([]);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [setup, setSetup] = useState<{ routes: Route[]; days: RouteServiceDay[] } | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pathPublished, setPathPublished] = useState<boolean | null>(null);
  const names = useMemo(() => new Map(profiles.map((p) => [p.id, p.full_name])), [profiles]);
  const busIds = useMemo(() => [...new Set(services.map((s) => s.bus_id))].sort(), [services]);
  useEffect(() => {
    if (window.location.hash === '#setup') document.getElementById('setup')?.scrollIntoView();
  }, []);
  useEffect(() => {
    let active = true;
    setSetupError(null);
    void Promise.all([getVisibleRoutes(), getVisibleRouteServiceDays()])
      .then(([routes, days]) => {
        if (active) setSetup({ routes, days: days.filter((d) => d.route_id === route.id) });
      })
      .catch(() => {
        if (active) setSetupError('Route settings could not be loaded. Reload before editing.');
      });
    return () => {
      active = false;
    };
  }, [route, studentRevision]);
  useEffect(() => {
    let active = true;
    setRosterLoading(true);
    setRosterError(null);
    const serviceIds = new Set(services.map((s) => s.id));
    void Promise.all(busIds.map(fetchAdminBusWorkspace))
      .then((workspaces) => {
        if (active)
          setRoster(
            workspaces
              .flatMap((w) => w.studentAssignments)
              .filter((a) => serviceIds.has(a.bus_route_assignment_id) && a.status !== 'archived'),
          );
      })
      .catch(() => {
        if (active)
          setRosterError(
            'Student assignments could not be loaded. Retry before changing students.',
          );
      })
      .finally(() => {
        if (active) setRosterLoading(false);
      });
    return () => {
      active = false;
    };
  }, [busIds, services, studentRevision]);
  const groups = groupDirectionalAssignments(
    roster,
    (a) => `${a.student_id}|${services.find((s) => s.id === a.bus_route_assignment_id)?.bus_id}`,
    (a) => services.find((s) => s.id === a.bus_route_assignment_id)?.direction ?? null,
  );
  async function saveDetails(payload: SaveRouteDefinitionInput) {
    if (!profile?.tenant_id) throw new Error('An active tenant is required.');
    const result = await saveRouteDefinition({
      ...payload,
      route: { ...payload.route, id: route.id },
    });
    if (result.routeId !== route.id)
      throw new Error('Unexpected route returned. Reload before continuing.');
    try {
      await saveRouteServiceDays({
        tenantId: profile.tenant_id,
        routeId: route.id,
        activeDays: payload.serviceDays,
      });
    } catch {
      onSaved();
      throw new Error(
        'Route details saved, but operating days were not saved. Retry saving these settings.',
      );
    }
    setEditing(false);
    setMessage('Route details, stops and regular schedule saved.');
    onSaved();
  }
  const eligible = route.status === 'active' && route.definition_status === 'ready';
  return (
    <div id="setup" data-testid="route-setup" className="space-y-6 scroll-mt-24">
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy-900">Route setup</h2>
        <p className="mt-2 text-sm text-gray-600">
          Work through each section here. Route details and road paths are reusable; service dates
          belong to the bus and driver plans. Each section saves separately.
        </p>
        <nav
          aria-label="Route setup sections"
          className="mt-4 flex flex-wrap gap-3 text-sm font-semibold text-navy-700"
        >
          <a href="#route-details">1. Details and stops</a>
          <a href="#road-path">2. Road path</a>
          <a href="#route-service">3. Bus, driver and schedule</a>
          <a href="#route-students">4. Students</a>
          <a href="#route-review">5. Review</a>
        </nav>
        {message && (
          <p role="status" className="mt-4 text-sm text-success-700">
            {message}
          </p>
        )}
      </Card>
      <Card id="route-details" className="scroll-mt-24 p-5">
        <h2 className="text-lg font-bold text-navy-900">1. Route details and stops</h2>
        <p className="my-3 text-sm text-gray-600">
          Set the name, directions, stop order, regular operating days and planned stop times. No
          start or end date is attached to the route.
        </p>
        {setupError && <p role="alert">{setupError}</p>}
        {editing && setup && !setupError ? (
          <RouteWithStopsForm
            route={route}
            existingStops={stops}
            existingTripPatterns={tripPatterns}
            existingSchedules={schedules}
            existingServiceDays={setup.days}
            existingRoutes={setup.routes}
            schools={schools}
            onSubmit={saveDetails}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <Button disabled={!setup || !!setupError} onClick={() => setEditing(true)}>
            Edit route details and stops
          </Button>
        )}
      </Card>
      <RoutePathEditor
        route={route}
        stops={stops}
        tileConfig={tileConfig}
        onPublishedStateChange={setPathPublished}
      />
      <Card id="route-service" className="scroll-mt-24 space-y-4 p-5">
        <h2 className="text-lg font-bold text-navy-900">3. Bus, driver and schedule</h2>
        <p className="text-sm text-gray-600">
          Choose a bus for the route directions, then assign its driver here. Set service dates when
          needed; leave the end date blank for ongoing service.
        </p>
        {!eligible && (
          <p className="text-sm text-warning-700">
            Save complete stops and activate the route in Route details before assigning a bus.
          </p>
        )}
        {addingBus || editingBus ? (
          <RouteBusAssignmentForm
            key={editingBus?.id ?? 'new'}
            route={route}
            buses={buses}
            tripPatterns={tripPatterns}
            existingAssignments={editingBus ? [editingBus] : []}
            onCancel={() => {
              setAddingBus(false);
              setEditingBus(null);
            }}
            onSubmit={async (input) => {
              await setBusRouteService({ ...input, routeId: route.id });
              setAddingBus(false);
              setEditingBus(null);
              setMessage('Bus service saved. Choose its driver below.');
              onSaved();
            }}
          />
        ) : (
          <Button disabled={!eligible} onClick={() => setAddingBus(true)}>
            Assign bus to route
          </Button>
        )}
        {services.length === 0 && (
          <p className="text-sm text-gray-600">No bus service has been assigned.</p>
        )}
        {services.map((service) => (
          <div key={service.id} className="space-y-3">
            <DropdownMenu
              trigger={
                <span className="inline-flex rounded-lg border border-navy-200 px-3 py-2 font-semibold text-navy-700">
                  Bus service: {service.trip_name}
                </span>
              }
              align="left"
            >
              <DropdownItem
                disabled={!eligible}
                onClick={() => {
                  setAddingBus(false);
                  setEditingBus(service);
                }}
              >
                Edit bus service: {service.trip_name}
              </DropdownItem>
              <DropdownItem
                destructive
                onClick={() => {
                  setEndingError(null);
                  setEnding({
                    label: `${service.trip_name} bus service`,
                    save: () => endBusRouteService([service.id]),
                  });
                }}
              >
                End bus service
              </DropdownItem>
            </DropdownMenu>
            <RouteDriverSetupForm
              service={service}
              drivers={drivers}
              names={names}
              assignments={assignments}
              onSaved={onSaved}
            />
          </div>
        ))}
      </Card>
      <Card id="route-students" className="scroll-mt-24 space-y-4 p-5">
        <h2 className="text-lg font-bold text-navy-900">4. Students and pickup/drop-off stops</h2>
        {rosterLoading && <p>Loading student assignments…</p>}
        {rosterError && (
          <div>
            <p role="alert">{rosterError}</p>
            <Button onClick={() => setStudentRevision((n) => n + 1)}>
              Retry student assignments
            </Button>
          </div>
        )}
        {!services.length && (
          <p className="text-sm text-gray-600">
            Assign a bus first, then select students and their stops.
          </p>
        )}
        {!rosterLoading && !rosterError && (
          <>
            {studentForm ? (
              <DirectionalStudentBusAssignmentForm
                key={studentForm.map((a) => a.id).join(',') || 'new'}
                assignments={studentForm}
                fixedStudentId={studentForm[0]?.student_id}
                studentLabel={studentForm[0]?.student_name}
                services={services}
                stops={stops}
                selectionMode="bus-route"
                fixedRouteId={route.id}
                onCancel={() => setStudentForm(null)}
                onSubmit={async (input) => {
                  await setStudentBusService({ ...input, routeId: route.id });
                  setStudentForm(null);
                  setMessage('Student service and stops saved.');
                  setStudentRevision((n) => n + 1);
                }}
              />
            ) : (
              <Button disabled={!services.length} onClick={() => setStudentForm([])}>
                Assign student to route
              </Button>
            )}
            {groups.length === 0 && (
              <p className="text-sm text-gray-600">
                No student service has been assigned to this route.
              </p>
            )}
            <ul className="space-y-3">
              {groups.map((group) => (
                <li key={group.id} className="rounded-lg border border-navy-200 p-3 text-sm">
                  <p className="font-semibold">{group.assignments[0].student_name}</p>
                  <p>Service status: {group.status}</p>
                  {group.assignments.map((a) => (
                    <p key={a.id}>
                      {services.find((s) => s.id === a.bus_route_assignment_id)?.trip_name} ·{' '}
                      {a.pickup_stop_name ?? 'Pickup not selected'} →{' '}
                      {a.dropoff_stop_name ?? 'Drop-off not selected'} · {a.effective_from} –{' '}
                      {a.effective_to ?? 'No end date'}
                    </p>
                  ))}
                  <DropdownMenu
                    trigger={
                      <span className="inline-flex rounded-lg border border-navy-200 px-3 py-2 font-semibold text-navy-700">
                        Student service actions
                      </span>
                    }
                    align="left"
                  >
                    <DropdownItem
                      disabled={group.status !== 'active'}
                      onClick={() => setStudentForm(group.assignments)}
                    >
                      Edit student service
                    </DropdownItem>
                    <DropdownItem
                      destructive
                      disabled={group.status !== 'active'}
                      onClick={() => {
                        setEndingError(null);
                        setEnding({
                          label: `${group.assignments[0].student_name} student service`,
                          save: async () => {
                            await setStudentBusServiceStatus(
                              group.assignments.map((a) => a.id),
                              'inactive',
                              true,
                            );
                          },
                        });
                      }}
                    >
                      End student service
                    </DropdownItem>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      <Card id="route-review" className="scroll-mt-24 p-5">
        <h2 className="text-lg font-bold text-navy-900">5. Review saved setup</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            Route: {eligible ? 'Active with complete stops' : 'Needs route details or activation'}
          </li>
          <li>
            Road path:{' '}
            {pathPublished === null
              ? 'Not verified'
              : pathPublished
                ? 'Published for new runs'
                : 'Needs a reviewed published path'}
          </li>
          <li>Bus services: {services.length}</li>
          <li>
            Drivers:{' '}
            {
              services.filter((s) =>
                assignments.some(
                  (a) => a.bus_route_assignment_id === s.id && a.status === 'active',
                ),
              ).length
            }{' '}
            of {services.length} bus services have a saved driver plan. Check their date coverage
            above.
          </li>
          <li>
            Students:{' '}
            {rosterLoading || rosterError
              ? 'Not verified'
              : new Set(roster.filter((a) => a.status === 'active').map((a) => a.student_id))
                  .size}{' '}
            assigned. Review pickup/drop-off stops above.
          </li>
        </ul>
        <p className="mt-3 text-sm text-gray-600">
          Start a new run to use a newly published road path. Runs already in progress keep their
          original path.
        </p>
      </Card>
      {endingError && (
        <p role="alert" className="text-danger-700">
          {endingError}
        </p>
      )}
      <ConfirmDialog
        open={!!ending}
        title={`End ${ending?.label ?? 'service'}`}
        description="End this assignment while preserving its history. Ending a bus service also ends its linked driver and student assignments."
        confirmLabel="End service"
        destructive
        busy={endingBusy}
        onCancel={() => setEnding(null)}
        onConfirm={() => {
          if (!ending || endingBusy) return;
          setEndingBusy(true);
          void ending
            .save()
            .then(() => {
              setEnding(null);
              setStudentForm(null);
              setEditingBus(null);
              setStudentRevision((n) => n + 1);
              setMessage('Service ended.');
              onSaved();
            })
            .catch((cause: unknown) => {
              setEnding(null);
              setEndingError(cause instanceof Error ? cause.message : 'Unable to end service.');
            })
            .finally(() => setEndingBusy(false));
        }}
      />
    </div>
  );
}
