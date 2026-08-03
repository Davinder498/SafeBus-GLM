import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, BusFront, Route as RouteIcon, UsersRound } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BusWorkspaceRouteForm } from '@/components/admin/BusWorkspaceForms';
import { StudentBusAssignmentForm } from '@/components/admin/StudentBusAssignmentForm';
import { BusQrCredentialPanel } from '@/components/admin/BusQrCredentialPanel';
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
  prepareBusRun,
  type AdminBusRouteAssignment,
  type AdminBusStudentAssignment,
  type AdminBusWorkspace,
  type AdminBusReadyDispatch,
} from '@/services/adminBusWorkspaceService';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import {
  createStudentBusAssignment,
  ensureBusRouteAssignment,
  updateStudentBusAssignment,
  type BusServiceOption,
} from '@/services/studentBusAssignmentService';
import {
  createBus,
  deleteBus,
  getVisibleRoutes,
  getVisibleRouteStops,
  getVisibleRouteTripPatterns,
  updateBus,
} from '@/services/transportationStructureService';
import type { School } from '@/types/organization';
import type {
  Bus,
  CreateBusInput,
  CreateStudentBusAssignmentInput,
  Route,
  RouteStop,
  RouteTripPattern,
  StudentBusAssignment,
  UpdateBusInput,
  UpdateStudentBusAssignmentInput,
} from '@/types/transportation';
import { cn } from '@/utils/cn';
import { busWorkspaceLifecycle, type BusWorkspaceLifecycle } from '@/utils/busWorkspace';

type WorkspaceTab = 'details' | 'routes' | 'students';
type LifecycleBucket = BusWorkspaceLifecycle;

const validTabs = new Set<WorkspaceTab>(['details', 'routes', 'students']);
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
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [endingRoute, setEndingRoute] = useState<AdminBusRouteAssignment | null>(null);
  const [ending, setEnding] = useState(false);
  const [preparingServiceId, setPreparingServiceId] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingBus, setDeletingBus] = useState(false);
  const [studentForm, setStudentForm] = useState<{
    assignment: AdminBusStudentAssignment | null;
  } | null>(null);

  const canManageRoutesAndDrivers = profile?.role === 'tenant_admin';
  const canDeleteBus = profile?.role === 'tenant_admin' || profile?.role === 'platform_super_admin';

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const optionResults = await Promise.allSettled([
      getVisibleSchools(),
      getVisibleRoutes(),
      getVisibleRouteTripPatterns(),
      getVisibleRouteStops(),
    ]);
    setSchools(optionResults[0].status === 'fulfilled' ? optionResults[0].value : []);
    setRoutes(optionResults[1].status === 'fulfilled' ? optionResults[1].value : []);
    setTripPatterns(optionResults[2].status === 'fulfilled' ? optionResults[2].value : []);
    setStops(optionResults[3].status === 'fulfilled' ? optionResults[3].value : []);

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

  async function confirmDeleteBus() {
    if (!workspace || deletingBus) return;
    setDeletingBus(true);
    setWriteError(null);
    try {
      await deleteBus(workspace.bus.id);
      navigate('/admin/buses', { replace: true });
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Unable to delete this bus.');
      setConfirmDeleteOpen(false);
    } finally {
      setDeletingBus(false);
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

  async function makeRunReady(service: AdminBusRouteAssignment) {
    setPreparingServiceId(service.id);
    setWriteError(null);
    setMessage(null);
    try {
      await prepareBusRun(service.id);
      setMessage(
        `Bus ${workspace?.bus.bus_number ?? ''} is ready for ${service.trip_name}. Any active driver can scan its QR to start.`,
      );
      await reloadWorkspace();
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Unable to prepare this run.');
    } finally {
      setPreparingServiceId(null);
    }
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
              ? 'Manage this bus, its named route trips, QR credential, and student roster.'
              : 'Save the bus details first to unlock route and student assignments.'
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
                {bus && <BusQrCredentialPanel busId={bus.id} busNumber={bus.bus_number} />}
                {bus && canDeleteBus && (
                  <div className="mt-6 border-t border-danger-100 pt-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-bold text-danger-800">Delete bus</h3>
                        <p className="mt-1 text-sm text-gray-600">
                          Permanently remove this bus after its active operational records are
                          cleared.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => setConfirmDeleteOpen(true)}
                      >
                        Delete bus
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {activeTab === 'routes' && bus && workspace && (
            <RoutesPanel
              bus={bus}
              routes={routes}
              tripPatterns={tripPatterns}
              assignments={workspace.routeAssignments}
              readyDispatch={workspace.readyDispatch}
              preparingServiceId={preparingServiceId}
              canManage={canManageRoutesAndDrivers}
              showForm={showRouteForm}
              onShowForm={() => setShowRouteForm(true)}
              onCancelForm={() => setShowRouteForm(false)}
              onSubmit={assignRoute}
              onEnd={setEndingRoute}
              onPrepare={(assignment) => void makeRunReady(assignment)}
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
      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`Delete bus ${bus?.bus_number ?? ''}?`}
        description="This permanently deletes the bus record. This action cannot be undone."
        confirmLabel="Delete bus"
        destructive
        busy={deletingBus}
        onConfirm={() => void confirmDeleteBus()}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </DashboardLayout>
  );
}

function RoutesPanel({
  bus,
  routes,
  tripPatterns,
  assignments,
  readyDispatch,
  preparingServiceId,
  canManage,
  showForm,
  onShowForm,
  onCancelForm,
  onSubmit,
  onEnd,
  onPrepare,
}: {
  bus: Bus;
  routes: Route[];
  tripPatterns: RouteTripPattern[];
  assignments: AdminBusRouteAssignment[];
  readyDispatch: AdminBusReadyDispatch | null;
  preparingServiceId: string | null;
  canManage: boolean;
  showForm: boolean;
  onShowForm: () => void;
  onCancelForm: () => void;
  onSubmit: (input: Parameters<typeof ensureBusRouteAssignment>[0]) => Promise<void>;
  onEnd: (assignment: AdminBusRouteAssignment) => void;
  onPrepare: (assignment: AdminBusRouteAssignment) => void;
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
      {readyDispatch && (
        <Card className="border-success-200 bg-success-50 p-4" data-testid="admin-ready-bus-run">
          <p className="text-sm font-bold text-success-800">Ready for driver scan</p>
          <p className="mt-1 text-sm text-success-800">
            Bus {bus.bus_number} · {readyDispatch.trip_name} ({readyDispatch.route_code})
          </p>
        </Card>
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
                      variant="secondary"
                      disabled={assignment.has_active_trip || preparingServiceId === assignment.id}
                      onClick={() => onPrepare(assignment)}
                      data-testid={`prepare-bus-run-${assignment.id}`}
                    >
                      {preparingServiceId === assignment.id
                        ? 'Preparing...'
                        : readyDispatch?.bus_route_assignment_id === assignment.id
                          ? 'Ready to scan'
                          : 'Make next run'}
                    </Button>
                  )}
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
