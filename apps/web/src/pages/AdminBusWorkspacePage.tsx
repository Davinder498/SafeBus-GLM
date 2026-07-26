import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, BusFront, Route as RouteIcon, UserRound, UsersRound } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  BusWorkspaceDriverForm,
  BusWorkspaceRouteForm,
} from '@/components/admin/BusWorkspaceForms';
import { StudentBusAssignmentForm } from '@/components/admin/StudentBusAssignmentForm';
import {
  AdminWriteError,
  AdminWriteMessage,
  BusForm,
  InlineFormShell,
} from '@/components/admin/TransportationAdminForms';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/contexts/useAuth';
import {
  endBusRouteAssignment,
  fetchAdminBusWorkspace,
  replaceBusTripDriver,
  type AdminBusDriverAssignment,
  type AdminBusRouteAssignment,
  type AdminBusStudentAssignment,
  type AdminBusWorkspace,
} from '@/services/adminBusWorkspaceService';
import { getVisibleProfiles, getVisibleSchools } from '@/services/adminOrganizationService';
import {
  createStudentBusAssignment,
  ensureBusRouteAssignment,
  updateStudentBusAssignment,
  type BusServiceOption,
} from '@/services/studentBusAssignmentService';
import {
  createBus,
  getVisibleDrivers,
  getVisibleRoutes,
  getVisibleRouteStops,
  getVisibleRouteTripPatterns,
  updateBus,
} from '@/services/transportationStructureService';
import type { OrganizationProfile, School } from '@/types/organization';
import type {
  Bus,
  CreateBusInput,
  CreateStudentBusAssignmentInput,
  Driver,
  Route,
  RouteStop,
  RouteTripPattern,
  StudentBusAssignment,
  UpdateBusInput,
  UpdateStudentBusAssignmentInput,
} from '@/types/transportation';
import { cn } from '@/utils/cn';
import { busWorkspaceLifecycle, type BusWorkspaceLifecycle } from '@/utils/busWorkspace';

type WorkspaceTab = 'details' | 'routes' | 'drivers' | 'students';
type LifecycleBucket = BusWorkspaceLifecycle;

const validTabs = new Set<WorkspaceTab>(['details', 'routes', 'drivers', 'students']);
function formatDate(value: string | null) {
  if (!value) return 'Open ended';
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function dateRange(from: string | null, to: string | null) {
  return `${from ? formatDate(from) : 'No start date'} – ${formatDate(to)}`;
}

function bucketLabel(bucket: LifecycleBucket) {
  if (bucket === 'current') return 'Current';
  if (bucket === 'upcoming') return 'Upcoming';
  return 'History';
}

function bucketTone(bucket: LifecycleBucket): 'success' | 'info' | 'neutral' {
  if (bucket === 'current') return 'success';
  if (bucket === 'upcoming') return 'info';
  return 'neutral';
}

export function AdminBusWorkspacePage() {
  const { busId } = useParams<{ busId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNew = !busId;
  const requestedTab = searchParams.get('tab') as WorkspaceTab | null;
  const activeTab =
    !isNew && requestedTab && validTabs.has(requestedTab) ? requestedTab : 'details';

  const [workspace, setWorkspace] = useState<AdminBusWorkspace | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [tripPatterns, setTripPatterns] = useState<RouteTripPattern[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [profiles, setProfiles] = useState<OrganizationProfile[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [endingRoute, setEndingRoute] = useState<AdminBusRouteAssignment | null>(null);
  const [ending, setEnding] = useState(false);
  const [driverService, setDriverService] = useState<AdminBusRouteAssignment | null>(null);
  const [studentForm, setStudentForm] = useState<{
    assignment: AdminBusStudentAssignment | null;
  } | null>(null);

  const canInviteDriver = profile?.role === 'tenant_admin';
  const canManageRoutesAndDrivers = profile?.role === 'tenant_admin';

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const optionResults = await Promise.allSettled([
      getVisibleSchools(),
      getVisibleRoutes(),
      getVisibleRouteTripPatterns(),
      getVisibleDrivers(),
      getVisibleProfiles(),
      getVisibleRouteStops(),
    ]);
    setSchools(optionResults[0].status === 'fulfilled' ? optionResults[0].value : []);
    setRoutes(optionResults[1].status === 'fulfilled' ? optionResults[1].value : []);
    setTripPatterns(optionResults[2].status === 'fulfilled' ? optionResults[2].value : []);
    setDrivers(optionResults[3].status === 'fulfilled' ? optionResults[3].value : []);
    setProfiles(optionResults[4].status === 'fulfilled' ? optionResults[4].value : []);
    setStops(optionResults[5].status === 'fulfilled' ? optionResults[5].value : []);

    if (busId) {
      try {
        setWorkspace(await fetchAdminBusWorkspace(busId));
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Unable to load this bus.');
      }
    } else {
      setWorkspace(null);
    }
    setLoading(false);
  }, [busId]);

  const reloadWorkspace = useCallback(async () => {
    if (!busId) return;
    setWorkspace(await fetchAdminBusWorkspace(busId));
  }, [busId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!detailsDirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [detailsDirty]);

  useEffect(() => {
    if (!workspace || activeTab !== 'drivers' || !canManageRoutesAndDrivers) return;
    const serviceId = searchParams.get('service');
    if (!serviceId) return;
    const service = workspace.routeAssignments.find((item) => item.id === serviceId);
    if (service && busWorkspaceLifecycle(service) !== 'history') setDriverService(service);
  }, [activeTab, canManageRoutesAndDrivers, searchParams, workspace]);

  function confirmDiscard() {
    return !detailsDirty || window.confirm('Discard unsaved bus detail changes?');
  }

  function goToTab(tab: WorkspaceTab) {
    if (isNew || !confirmDiscard()) return;
    setDetailsDirty(false);
    setSearchParams({ tab });
    setWriteError(null);
    setMessage(null);
  }

  function backToBuses() {
    if (!confirmDiscard()) return;
    navigate('/admin/buses');
  }

  async function saveBus(input: CreateBusInput | UpdateBusInput) {
    setWriteError(null);
    setMessage(null);
    try {
      if (workspace) {
        const updated = await updateBus(workspace.bus.id, input as UpdateBusInput);
        setWorkspace({ ...workspace, bus: { ...workspace.bus, ...updated } });
        setMessage('Bus details updated.');
      } else {
        const created = await createBus(input as CreateBusInput);
        setDetailsDirty(false);
        navigate(`/admin/buses/${created.id}?tab=routes`, { replace: true });
      }
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Unable to save this bus.');
      throw error;
    }
  }

  async function assignRoute(input: Parameters<typeof ensureBusRouteAssignment>[0]) {
    setWriteError(null);
    setMessage(null);
    await ensureBusRouteAssignment(input);
    setShowRouteForm(false);
    setMessage('Route trip assigned to this bus.');
    await reloadWorkspace();
  }

  async function confirmEndRoute() {
    if (!endingRoute || ending) return;
    setEnding(true);
    setWriteError(null);
    setMessage(null);
    try {
      await endBusRouteAssignment(endingRoute.id);
      setEndingRoute(null);
      setMessage('Route trip and its linked active assignments were ended.');
      await reloadWorkspace();
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Unable to end this route trip.');
    } finally {
      setEnding(false);
    }
  }

  async function saveDriver(input: Parameters<typeof replaceBusTripDriver>[0]) {
    setWriteError(null);
    setMessage(null);
    await replaceBusTripDriver(input);
    setDriverService(null);
    setMessage('Driver assignment saved.');
    setSearchParams({ tab: 'drivers' });
    await Promise.all([reloadWorkspace(), getVisibleDrivers().then(setDrivers)]);
  }

  function addDriver(service: AdminBusRouteAssignment) {
    if (!workspace) return;
    const returnTo = `/admin/buses/${workspace.bus.id}?tab=drivers&service=${service.id}`;
    navigate(`/admin/drivers?invite=1&returnTo=${encodeURIComponent(returnTo)}`);
  }

  async function saveStudentAssignment(
    input: CreateStudentBusAssignmentInput | UpdateStudentBusAssignmentInput,
  ) {
    setWriteError(null);
    setMessage(null);
    if (studentForm?.assignment) {
      await updateStudentBusAssignment(
        studentForm.assignment.id,
        input as UpdateStudentBusAssignmentInput,
      );
      setMessage('Student assignment updated.');
    } else {
      await createStudentBusAssignment(input as CreateStudentBusAssignmentInput);
      setMessage('Student assigned to this bus.');
    }
    setStudentForm(null);
    await reloadWorkspace();
  }

  async function deactivateStudent(assignment: AdminBusStudentAssignment) {
    setWriteError(null);
    setMessage(null);
    try {
      await updateStudentBusAssignment(assignment.id, { status: 'inactive' });
      setMessage('Student assignment deactivated.');
      await reloadWorkspace();
    } catch (error) {
      setWriteError(
        error instanceof Error ? error.message : 'Unable to deactivate this assignment.',
      );
    }
  }

  const busServices = useMemo<BusServiceOption[]>(() => {
    if (!workspace) return [];
    return workspace.routeAssignments
      .filter((assignment) => busWorkspaceLifecycle(assignment) !== 'history')
      .map((assignment) => ({
        ...assignment,
        bus_number: workspace.bus.bus_number,
      }));
  }, [workspace]);

  if (loading) {
    return (
      <DashboardLayout
        title="Admin Dashboard"
        portal="admin"
        navItems={[]}
        navGroups={adminNavGroups}
      >
        <DataState title="Loading bus workspace" message="Fetching bus and assignment details." />
      </DashboardLayout>
    );
  }

  if (loadError) {
    return (
      <DashboardLayout
        title="Admin Dashboard"
        portal="admin"
        navItems={[]}
        navGroups={adminNavGroups}
      >
        <div className="space-y-5">
          <Button
            type="button"
            variant="ghost"
            leftIcon={<ArrowLeft className="h-4 w-4" />}
            onClick={backToBuses}
          >
            Back to buses
          </Button>
          <DataState title="Unable to load bus workspace" message={loadError} />
        </div>
      </DashboardLayout>
    );
  }

  const bus = workspace?.bus ?? null;
  const tabs: Array<{ id: WorkspaceTab; label: string; icon: ReactNode }> = [
    { id: 'details', label: 'Bus details', icon: <BusFront className="h-4 w-4" /> },
    { id: 'routes', label: 'Routes', icon: <RouteIcon className="h-4 w-4" /> },
    { id: 'drivers', label: 'Drivers', icon: <UserRound className="h-4 w-4" /> },
    { id: 'students', label: 'Students', icon: <UsersRound className="h-4 w-4" /> },
  ];

  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-6">
        <Button
          type="button"
          variant="ghost"
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          onClick={backToBuses}
        >
          Back to buses
        </Button>
        <PageHeader
          eyebrow="Buses"
          title={bus ? `Bus ${bus.bus_number}` : 'Add bus'}
          description={
            bus
              ? 'Manage this bus, its named route trips, drivers, and student roster.'
              : 'Save the bus details first to unlock route, driver, and student assignments.'
          }
        />

        <div
          role="tablist"
          aria-label="Bus workspace sections"
          className="flex gap-2 overflow-x-auto border-b border-slate-200"
        >
          {tabs.map((tab) => {
            const disabled = isNew && tab.id !== 'details';
            return (
              <button
                key={tab.id}
                id={`bus-tab-${tab.id}`}
                role="tab"
                type="button"
                aria-selected={activeTab === tab.id}
                aria-controls={`bus-panel-${tab.id}`}
                disabled={disabled}
                onClick={() => goToTab(tab.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 disabled:cursor-not-allowed disabled:opacity-40',
                  activeTab === tab.id
                    ? 'border-navy-700 text-navy-800'
                    : 'border-transparent text-slate-500 hover:text-slate-800',
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>

        <AdminWriteMessage message={message} />
        <AdminWriteError message={writeError} />

        <section
          id={`bus-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`bus-tab-${activeTab}`}
        >
          {activeTab === 'details' && (
            <Card className="p-5">
              <h2 className="text-lg font-bold text-navy-900">
                {bus ? 'Bus details' : 'Create bus'}
              </h2>
              <div className="mt-5">
                <BusForm
                  key={bus?.updated_at ?? 'new-bus'}
                  bus={bus}
                  schools={schools}
                  defaultTenantId={profile?.tenant_id ?? null}
                  onSubmit={saveBus}
                  onCancel={backToBuses}
                  onDirtyChange={setDetailsDirty}
                />
              </div>
            </Card>
          )}

          {activeTab === 'routes' && bus && workspace && (
            <RoutesPanel
              bus={bus}
              routes={routes}
              tripPatterns={tripPatterns}
              assignments={workspace.routeAssignments}
              canManage={canManageRoutesAndDrivers}
              showForm={showRouteForm}
              onShowForm={() => setShowRouteForm(true)}
              onCancelForm={() => setShowRouteForm(false)}
              onSubmit={assignRoute}
              onEnd={setEndingRoute}
            />
          )}

          {activeTab === 'drivers' && bus && workspace && (
            <DriversPanel
              assignments={workspace.driverAssignments}
              services={workspace.routeAssignments}
              drivers={drivers}
              profiles={profiles}
              editingService={driverService}
              initialDriverId={searchParams.get('newDriverId') ?? undefined}
              canInviteDriver={canInviteDriver}
              canManage={canManageRoutesAndDrivers}
              onEdit={setDriverService}
              onAddDriver={addDriver}
              onSubmit={saveDriver}
              onCancel={() => setDriverService(null)}
              onGoRoutes={() => goToTab('routes')}
            />
          )}

          {activeTab === 'students' && bus && workspace && (
            <StudentsPanel
              bus={bus}
              assignments={workspace.studentAssignments}
              services={busServices}
              serviceRecords={workspace.routeAssignments}
              stops={stops}
              form={studentForm}
              onAdd={() => setStudentForm({ assignment: null })}
              onEdit={(assignment) => setStudentForm({ assignment })}
              onCancel={() => setStudentForm(null)}
              onSubmit={saveStudentAssignment}
              onDeactivate={(assignment) => void deactivateStudent(assignment)}
              onGoRoutes={() => goToTab('routes')}
            />
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!endingRoute}
        title={`End ${endingRoute?.route_code ?? ''} ${endingRoute?.trip_name ?? ''}?`}
        description="This deactivates the route-trip assignment and all linked active driver and student assignments. History is preserved."
        confirmLabel="End route trip"
        destructive
        busy={ending}
        onConfirm={() => void confirmEndRoute()}
        onCancel={() => setEndingRoute(null)}
      />
    </DashboardLayout>
  );
}

function RoutesPanel({
  bus,
  routes,
  tripPatterns,
  assignments,
  canManage,
  showForm,
  onShowForm,
  onCancelForm,
  onSubmit,
  onEnd,
}: {
  bus: Bus;
  routes: Route[];
  tripPatterns: RouteTripPattern[];
  assignments: AdminBusRouteAssignment[];
  canManage: boolean;
  showForm: boolean;
  onShowForm: () => void;
  onCancelForm: () => void;
  onSubmit: (input: Parameters<typeof ensureBusRouteAssignment>[0]) => Promise<void>;
  onEnd: (assignment: AdminBusRouteAssignment) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Route trips</h2>
          <p className="mt-1 text-sm text-gray-600">
            Outbound and return trips are separate assignments.
          </p>
        </div>
        {canManage && !showForm && (
          <Button type="button" onClick={onShowForm}>
            Assign route trip
          </Button>
        )}
      </div>
      {showForm && (
        <InlineFormShell title="Assign route trip">
          <BusWorkspaceRouteForm
            bus={bus}
            routes={routes}
            tripPatterns={tripPatterns}
            assignments={assignments}
            onSubmit={onSubmit}
            onCancel={onCancelForm}
          />
        </InlineFormShell>
      )}
      {assignments.length === 0 ? (
        <DataState
          title="No route trips assigned"
          message="Assign this bus to a reviewed named route trip to continue."
        />
      ) : (
        <BucketSections
          items={assignments}
          render={(assignment, bucket) => (
            <Card key={assignment.id} className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-bold text-navy-900">
                    {assignment.route_code} · {assignment.trip_name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">{assignment.route_name}</p>
                  <p className="mt-2 text-sm text-gray-600">
                    {dateRange(assignment.effective_from, assignment.effective_to)}
                  </p>
                  {assignment.has_active_trip && (
                    <p className="mt-2 text-sm font-semibold text-warning-700">
                      Trip currently in progress
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={bucketTone(bucket)}>{bucketLabel(bucket)}</StatusPill>
                  {canManage && bucket !== 'history' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={assignment.has_active_trip}
                      onClick={() => onEnd(assignment)}
                    >
                      End assignment
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          )}
        />
      )}
    </div>
  );
}

function DriversPanel({
  assignments,
  services,
  drivers,
  profiles,
  editingService,
  initialDriverId,
  canInviteDriver,
  canManage,
  onEdit,
  onAddDriver,
  onSubmit,
  onCancel,
  onGoRoutes,
}: {
  assignments: AdminBusDriverAssignment[];
  services: AdminBusRouteAssignment[];
  drivers: Driver[];
  profiles: OrganizationProfile[];
  editingService: AdminBusRouteAssignment | null;
  initialDriverId?: string;
  canInviteDriver: boolean;
  canManage: boolean;
  onEdit: (service: AdminBusRouteAssignment) => void;
  onAddDriver: (service: AdminBusRouteAssignment) => void;
  onSubmit: (input: Parameters<typeof replaceBusTripDriver>[0]) => Promise<void>;
  onCancel: () => void;
  onGoRoutes: () => void;
}) {
  const availableServices = services.filter(
    (service) => busWorkspaceLifecycle(service) !== 'history',
  );
  if (availableServices.length === 0) {
    return (
      <DataState
        title="Assign a route trip first"
        message="Drivers are assigned to a bus’s named route trips."
        action={
          canManage ? (
            <Button type="button" onClick={onGoRoutes}>
              Go to Routes
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-navy-900">Drivers by route trip</h2>
        <p className="mt-1 text-sm text-gray-600">
          Each named trip can have its own effective driver assignment.
        </p>
      </div>
      {canManage && editingService && (
        <InlineFormShell title="Assign or change driver">
          <BusWorkspaceDriverForm
            key={`${editingService.id}:${initialDriverId ?? ''}`}
            service={editingService}
            drivers={drivers}
            profiles={profiles}
            initialDriverId={initialDriverId}
            canInviteDriver={canInviteDriver}
            onAddDriver={() => onAddDriver(editingService)}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        </InlineFormShell>
      )}
      <div className="grid gap-4">
        {availableServices.map((service) => {
          const serviceAssignments = assignments.filter(
            (assignment) => assignment.bus_route_assignment_id === service.id,
          );
          const activeTrip = serviceAssignments.some((assignment) => assignment.has_active_trip);
          return (
            <Card key={service.id} className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-bold text-navy-900">
                    {service.route_code} · {service.trip_name}
                  </h3>
                  {serviceAssignments.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-600">No driver assigned.</p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {serviceAssignments.map((assignment) => {
                        const bucket = busWorkspaceLifecycle(assignment);
                        return (
                          <li
                            key={assignment.id}
                            className="rounded-lg bg-gray-50 px-4 py-3 text-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-navy-900">
                                {assignment.driver_name}
                              </span>
                              <StatusPill tone={bucketTone(bucket)}>
                                {bucketLabel(bucket)}
                              </StatusPill>
                            </div>
                            <p className="mt-1 text-gray-600">
                              {dateRange(assignment.effective_from, assignment.effective_to)}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {activeTrip && (
                    <p className="mt-3 text-sm font-semibold text-warning-700">
                      Trip currently in progress
                    </p>
                  )}
                </div>
                {canManage && (
                  <Button
                    type="button"
                    size="sm"
                    disabled={activeTrip}
                    onClick={() => onEdit(service)}
                  >
                    {serviceAssignments.some((item) => busWorkspaceLifecycle(item) === 'current')
                      ? 'Change driver'
                      : 'Assign driver'}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function StudentsPanel({
  bus,
  assignments,
  services,
  serviceRecords,
  stops,
  form,
  onAdd,
  onEdit,
  onCancel,
  onSubmit,
  onDeactivate,
  onGoRoutes,
}: {
  bus: Bus;
  assignments: AdminBusStudentAssignment[];
  services: BusServiceOption[];
  serviceRecords: AdminBusRouteAssignment[];
  stops: RouteStop[];
  form: { assignment: AdminBusStudentAssignment | null } | null;
  onAdd: () => void;
  onEdit: (assignment: AdminBusStudentAssignment) => void;
  onCancel: () => void;
  onSubmit: (
    input: CreateStudentBusAssignmentInput | UpdateStudentBusAssignmentInput,
  ) => Promise<void>;
  onDeactivate: (assignment: AdminBusStudentAssignment) => void;
  onGoRoutes: () => void;
}) {
  const serviceNames = new Map(
    serviceRecords.map((service) => [service.id, `${service.route_code} · ${service.trip_name}`]),
  );
  if (services.length === 0 && assignments.length === 0) {
    return (
      <DataState
        title="Assign a route trip first"
        message="Students are assigned to this bus through a named route trip."
        action={
          <Button type="button" onClick={onGoRoutes}>
            Go to Routes
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Student roster</h2>
          <p className="mt-1 text-sm text-gray-600">
            Manage students and stops for each named route trip.
          </p>
        </div>
        {!form && services.length > 0 && (
          <Button type="button" onClick={onAdd}>
            Assign student
          </Button>
        )}
      </div>
      {form && (
        <InlineFormShell title={form.assignment ? 'Edit student assignment' : 'Assign student'}>
          <StudentBusAssignmentForm
            key={form.assignment?.id ?? 'new-student-assignment'}
            assignment={form.assignment as StudentBusAssignment | null}
            studentLabel={form.assignment?.student_name}
            services={services}
            stops={stops}
            defaultTenantId={bus.tenant_id}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        </InlineFormShell>
      )}
      {assignments.length === 0 ? (
        <DataState
          title="No students assigned"
          message="Assign an existing student to one of this bus’s route trips."
        />
      ) : (
        <BucketSections
          items={assignments}
          render={(assignment, bucket) => (
            <Card key={assignment.id} className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-bold text-navy-900">{assignment.student_name}</h3>
                  <p className="mt-1 text-sm font-semibold text-navy-700">
                    {serviceNames.get(assignment.bus_route_assignment_id) ??
                      'Historical route trip'}
                  </p>
                  <div className="mt-3 grid gap-1 text-sm text-gray-600">
                    <p>Pickup: {assignment.pickup_stop_name ?? 'Not assigned'}</p>
                    <p>Drop-off: {assignment.dropoff_stop_name ?? 'Not assigned'}</p>
                    <p>{dateRange(assignment.effective_from, assignment.effective_to)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill tone={bucketTone(bucket)}>{bucketLabel(bucket)}</StatusPill>
                  {bucket !== 'history' &&
                    services.some(
                      (service) => service.id === assignment.bus_route_assignment_id,
                    ) && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => onEdit(assignment)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => onDeactivate(assignment)}
                        >
                          Deactivate
                        </Button>
                      </>
                    )}
                </div>
              </div>
            </Card>
          )}
        />
      )}
    </div>
  );
}

function BucketSections<
  T extends {
    id: string;
    status: string;
    effective_from: string | null;
    effective_to: string | null;
  },
>({ items, render }: { items: T[]; render: (item: T, bucket: LifecycleBucket) => ReactNode }) {
  const buckets: LifecycleBucket[] = ['current', 'upcoming', 'history'];
  return (
    <div className="space-y-6">
      {buckets.map((bucket) => {
        const bucketItems = items.filter((item) => busWorkspaceLifecycle(item) === bucket);
        if (bucketItems.length === 0) return null;
        return (
          <section key={bucket} className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
              {bucketLabel(bucket)}
            </h3>
            <div className="grid gap-3">{bucketItems.map((item) => render(item, bucket))}</div>
          </section>
        );
      })}
    </div>
  );
}
