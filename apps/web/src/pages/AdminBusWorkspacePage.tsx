import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, BusFront, Route as RouteIcon, UsersRound } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { BusWorkspaceRouteForm } from '@/components/admin/BusWorkspaceForms';
import { OperationalNotesPanel } from '@/components/admin/OperationalNotesPanel';
import { DirectionalStudentBusAssignmentForm } from '@/components/admin/DirectionalStudentBusAssignmentForm';
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
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';
import { useAuth } from '@/contexts/useAuth';
import {
  fetchAdminBusWorkspace,
  type AdminBusRouteAssignment,
  type AdminBusStudentAssignment,
  type AdminBusWorkspace,
} from '@/services/adminBusWorkspaceService';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import {
  endBusRouteService,
  setBusRouteService,
  setStudentBusService,
  setStudentBusServiceStatus,
  type BusServiceOption,
  type SetBusRouteServiceInput,
  type SetStudentBusServiceInput,
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
  Route,
  RouteStop,
  RouteTripPattern,
  UpdateBusInput,
} from '@/types/transportation';
import { cn } from '@/utils/cn';
import {
  busAssignmentEffectiveStatus,
  busWorkspaceLifecycle,
  type BusAssignmentEffectiveStatus,
  type BusWorkspaceLifecycle,
} from '@/utils/busWorkspace';
import {
  directionScopeLabel,
  groupDirectionalAssignments,
  type DirectionalAssignmentGroup,
} from '@/utils/directionalAssignments';

type WorkspaceTab = 'details' | 'routes' | 'students';
type LifecycleBucket = BusWorkspaceLifecycle;
type RouteFormMode = 'create' | 'edit' | 'renew';
type RouteAssignmentGroup = DirectionalAssignmentGroup<AdminBusRouteAssignment>;
type StudentAssignmentGroup = DirectionalAssignmentGroup<AdminBusStudentAssignment>;

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

function assignmentStatusLabel(status: BusAssignmentEffectiveStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function assignmentStatusTone(
  status: BusAssignmentEffectiveStatus,
): 'success' | 'warning' | 'info' | 'neutral' {
  if (status === 'active') return 'success';
  if (status === 'scheduled') return 'info';
  if (status === 'expired' || status === 'inactive') return 'warning';
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
  const [routeForm, setRouteForm] = useState<{
    group: RouteAssignmentGroup | null;
    mode: RouteFormMode;
  } | null>(null);
  const [endingRoute, setEndingRoute] = useState<RouteAssignmentGroup | null>(null);
  const [ending, setEnding] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deletingBus, setDeletingBus] = useState(false);
  const [studentForm, setStudentForm] = useState<{
    group: StudentAssignmentGroup | null;
  } | null>(null);
  const [studentAction, setStudentAction] = useState<{
    group: StudentAssignmentGroup;
  } | null>(null);
  const [studentActionBusy, setStudentActionBusy] = useState(false);

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

  async function saveRouteAssignment(input: SetBusRouteServiceInput) {
    setWriteError(null);
    setMessage(null);
    if (routeForm?.mode === 'renew') {
      await setBusRouteService({ ...input, existingAssignmentIds: [] });
      setMessage('Route assignment renewed. The earlier assignment remains in history.');
    } else {
      await setBusRouteService(input);
      setMessage(routeForm?.group ? 'Route service updated.' : 'Route assigned to this bus.');
    }
    setRouteForm(null);
    await reloadWorkspace();
  }

  async function confirmEndRoute() {
    if (!endingRoute || ending) return;
    const closingExpired = endingRoute.assignments.every(
      (assignment) => busAssignmentEffectiveStatus(assignment) === 'expired',
    );
    setEnding(true);
    setWriteError(null);
    setMessage(null);
    try {
      await endBusRouteService(endingRoute.assignments.map((assignment) => assignment.id));
      setEndingRoute(null);
      setMessage(
        closingExpired
          ? 'Expired route assignment closed. Historical dates were preserved.'
          : 'Route service deassigned. Linked active assignments were ended.',
      );
      await reloadWorkspace();
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Unable to end this route service.');
    } finally {
      setEnding(false);
    }
  }

  async function saveStudentAssignment(input: SetStudentBusServiceInput) {
    setWriteError(null);
    setMessage(null);
    await setStudentBusService(input);
    setMessage(
      studentForm?.group ? 'Student assignment updated.' : 'Student assigned to this bus.',
    );
    setStudentForm(null);
    await reloadWorkspace();
  }

  async function confirmStudentAssignmentAction() {
    if (!studentAction || studentActionBusy) return;
    setStudentActionBusy(true);
    setWriteError(null);
    setMessage(null);
    const { group } = studentAction;
    try {
      await setStudentBusServiceStatus(
        group.assignments.map((assignment) => assignment.id),
        'archived',
        true,
      );
      setStudentAction(null);
      setMessage('Student removed from this bus.');
      await reloadWorkspace();
    } catch (error) {
      setWriteError(
        error instanceof Error ? error.message : 'Unable to update this student assignment.',
      );
      setStudentAction(null);
    } finally {
      setStudentActionBusy(false);
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

  const routeFormIdentityLocked = !!(
    workspace &&
    routeForm?.group &&
    (workspace.driverAssignments.some((assignment) =>
      routeForm.group?.assignments.some(
        (routeAssignment) => routeAssignment.id === assignment.bus_route_assignment_id,
      ),
    ) ||
      workspace.studentAssignments.some((assignment) =>
        routeForm.group?.assignments.some(
          (routeAssignment) => routeAssignment.id === assignment.bus_route_assignment_id,
        ),
      ))
  );

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
  const endingExpiredRoute =
    !!endingRoute &&
    endingRoute.assignments.every(
      (assignment) => busAssignmentEffectiveStatus(assignment) === 'expired',
    );
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
              ? 'Manage this bus, its route services, QR credential, and student roster.'
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
            <div className="space-y-5">
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
              {bus && <OperationalNotesPanel targetEntity="bus" targetId={bus.id} />}
            </div>
          )}

          {activeTab === 'routes' && bus && workspace && (
            <RoutesPanel
              bus={bus}
              routes={routes}
              tripPatterns={tripPatterns}
              assignments={workspace.routeAssignments}
              canManage={canManageRoutesAndDrivers}
              form={routeForm}
              formIdentityLocked={routeFormIdentityLocked || routeForm?.mode === 'renew'}
              onAdd={() => setRouteForm({ group: null, mode: 'create' })}
              onEdit={(group) => setRouteForm({ group, mode: 'edit' })}
              onRenew={(group) => setRouteForm({ group, mode: 'renew' })}
              onCancelForm={() => setRouteForm(null)}
              onSubmit={saveRouteAssignment}
              onEnd={setEndingRoute}
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
              onAdd={() => setStudentForm({ group: null })}
              onEdit={(group) => setStudentForm({ group })}
              onCancel={() => setStudentForm(null)}
              onSubmit={saveStudentAssignment}
              onDelete={(group) => setStudentAction({ group })}
              onGoRoutes={() => goToTab('routes')}
            />
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!endingRoute}
        title={`${endingExpiredRoute ? 'Close expired' : 'Deassign'} ${endingRoute?.assignments[0]?.route_code ?? ''} route service?`}
        description={
          endingExpiredRoute
            ? 'This closes the expired active record and linked active assignments without changing their historical end dates.'
            : 'This deassigns every direction in the route service and deactivates all linked driver and student assignments. History is preserved.'
        }
        confirmLabel={endingExpiredRoute ? 'Close expired' : 'Deassign route'}
        destructive
        busy={ending}
        onConfirm={() => void confirmEndRoute()}
        onCancel={() => setEndingRoute(null)}
      />
      <ConfirmDialog
        open={!!studentAction}
        title={`Remove ${studentAction?.group.assignments[0]?.student_name ?? 'student'} from this bus?`}
        description="This removes every direction of the student's bus assignment from this roster. The student remains in the Students directory, and operational history is retained."
        confirmLabel="Remove from bus"
        destructive
        busy={studentActionBusy}
        onConfirm={() => void confirmStudentAssignmentAction()}
        onCancel={() => setStudentAction(null)}
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
  canManage,
  form,
  formIdentityLocked,
  onAdd,
  onEdit,
  onRenew,
  onCancelForm,
  onSubmit,
  onEnd,
}: {
  bus: Bus;
  routes: Route[];
  tripPatterns: RouteTripPattern[];
  assignments: AdminBusRouteAssignment[];
  canManage: boolean;
  form: { group: RouteAssignmentGroup | null; mode: RouteFormMode } | null;
  formIdentityLocked: boolean;
  onAdd: () => void;
  onEdit: (group: RouteAssignmentGroup) => void;
  onRenew: (group: RouteAssignmentGroup) => void;
  onCancelForm: () => void;
  onSubmit: (input: SetBusRouteServiceInput) => Promise<void>;
  onEnd: (group: RouteAssignmentGroup) => void;
}) {
  const groups = groupDirectionalAssignments(
    assignments,
    (assignment) => assignment.route_id,
    (assignment) => assignment.direction,
  );
  const buckets: LifecycleBucket[] = ['current', 'upcoming', 'history'];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-navy-900">Route services</h2>
          <p className="mt-1 text-sm text-gray-600">
            Assign both directions together, or use one direction when buses differ.
          </p>
        </div>
        {canManage && !form && (
          <Button type="button" onClick={onAdd}>
            Assign route
          </Button>
        )}
      </div>
      {form && (
        <InlineFormShell
          title={
            form.mode === 'renew'
              ? 'Renew route assignment'
              : form.group
                ? 'Edit route service'
                : 'Assign route'
          }
        >
          <BusWorkspaceRouteForm
            key={`${form.mode}-${form.group?.id ?? 'new-route-assignment'}`}
            bus={bus}
            assignment={form.group?.assignments[0]}
            assignmentGroup={form.group?.assignments}
            mode={form.mode}
            identityLocked={formIdentityLocked}
            routes={routes}
            tripPatterns={tripPatterns}
            assignments={assignments}
            onSubmit={onSubmit}
            onCancel={onCancelForm}
          />
        </InlineFormShell>
      )}
      {groups.length === 0 ? (
        <DataState
          title="No routes assigned"
          message="Assign this bus to a reviewed route to continue."
        />
      ) : (
        <div className="space-y-6">
          {buckets.map((bucket) => {
            const bucketGroups = groups.filter(
              (group) => busWorkspaceLifecycle(group.assignments[0]) === bucket,
            );
            if (bucketGroups.length === 0) return null;
            return (
              <section key={bucket} className="space-y-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
                  {bucketLabel(bucket)}
                </h3>
                <div className="grid gap-3">
                  {bucketGroups.map((group) => {
                    const assignment = group.assignments[0];
                    const hasActiveTrip = group.assignments.some((item) => item.has_active_trip);
                    const expired = group.assignments.every(
                      (item) => busAssignmentEffectiveStatus(item) === 'expired',
                    );
                    return (
                      <Card
                        key={group.id}
                        className="p-5"
                        data-testid={`route-assignment-${assignment.id}`}
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-bold text-navy-900">
                                {assignment.route_code} · {assignment.route_name}
                              </h4>
                              <StatusPill tone="info">
                                {directionScopeLabel(group.directionScope)}
                              </StatusPill>
                            </div>
                            <p className="mt-2 text-sm text-gray-600">
                              {dateRange(group.effectiveFrom, group.effectiveTo)}
                            </p>
                            <p className="mt-1 text-sm text-gray-600">
                              {group.assignments.map((item) => item.trip_name).join(' · ')}
                            </p>
                            {hasActiveTrip && (
                              <p className="mt-2 text-sm font-semibold text-warning-700">
                                Bus run currently in progress
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill
                              tone={assignmentStatusTone(busAssignmentEffectiveStatus(assignment))}
                            >
                              {assignmentStatusLabel(busAssignmentEffectiveStatus(assignment))}
                            </StatusPill>
                            {canManage && bucket !== 'history' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={hasActiveTrip}
                                onClick={() => onEdit(group)}
                              >
                                Edit service
                              </Button>
                            )}
                            {canManage && (bucket !== 'history' || expired) && (
                              <Button
                                type="button"
                                size="sm"
                                variant="danger"
                                disabled={hasActiveTrip}
                                onClick={() => onEnd(group)}
                              >
                                {expired ? 'Close expired' : 'Deassign route'}
                              </Button>
                            )}
                            {canManage && bucket === 'history' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => onRenew(group)}
                              >
                                Renew assignment
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
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
  onDelete,
  onGoRoutes,
}: {
  bus: Bus;
  assignments: AdminBusStudentAssignment[];
  services: BusServiceOption[];
  serviceRecords: AdminBusRouteAssignment[];
  stops: RouteStop[];
  form: { group: StudentAssignmentGroup | null } | null;
  onAdd: () => void;
  onEdit: (group: StudentAssignmentGroup) => void;
  onCancel: () => void;
  onSubmit: (input: SetStudentBusServiceInput) => Promise<void>;
  onDelete: (group: StudentAssignmentGroup) => void;
  onGoRoutes: () => void;
}) {
  const serviceById = new Map(serviceRecords.map((service) => [service.id, service]));
  const rosterAssignments = assignments.filter((assignment) => assignment.status !== 'archived');
  const groups = groupDirectionalAssignments(
    rosterAssignments,
    (assignment) => {
      const service = serviceById.get(assignment.bus_route_assignment_id);
      return `${assignment.student_id}|${service?.route_id ?? assignment.bus_route_assignment_id}`;
    },
    (assignment) => serviceById.get(assignment.bus_route_assignment_id)?.direction ?? null,
  );

  if (services.length === 0 && groups.length === 0) {
    return (
      <DataState
        title="Assign a route first"
        message="Students are assigned through this bus’s active route directions."
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
            Assign students, update their bus service, or remove them from this bus.
          </p>
        </div>
        {!form && services.length > 0 && (
          <Button type="button" onClick={onAdd}>
            Assign student
          </Button>
        )}
      </div>
      {form && (
        <InlineFormShell title={form.group ? 'Update student assignment' : 'Assign student'}>
          <DirectionalStudentBusAssignmentForm
            key={form.group?.id ?? 'new-student-assignment'}
            assignments={form.group?.assignments}
            studentLabel={form.group?.assignments[0]?.student_name}
            fixedStudentId={form.group?.assignments[0]?.student_id}
            services={services}
            stops={stops}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        </InlineFormShell>
      )}
      {groups.length === 0 ? (
        <DataState
          title="No students assigned"
          message="Assign an existing student to one of this bus’s routes."
        />
      ) : (
        <Card className="overflow-visible p-0">
          <Table aria-label={`Student roster for bus ${bus.bus_number}`}>
            <TableHeader>
              <tr>
                <TableColumn>Student</TableColumn>
                <TableColumn>Route service</TableColumn>
                <TableColumn>Pickup</TableColumn>
                <TableColumn>Drop-off</TableColumn>
                <TableColumn>Service dates</TableColumn>
                <TableColumn>Status</TableColumn>
                <TableColumn className="w-16 text-right">Actions</TableColumn>
              </tr>
            </TableHeader>
            <TableBody>
              {groups.map((group) => {
                const assignment = group.assignments[0];
                const forwardService = group.forward
                  ? serviceById.get(group.forward.bus_route_assignment_id)
                  : null;
                const reverseService = group.reverse
                  ? serviceById.get(group.reverse.bus_route_assignment_id)
                  : null;
                const hasActiveService = group.assignments.every((item) =>
                  services.some((service) => service.id === item.bus_route_assignment_id),
                );
                const effectiveStatus = busAssignmentEffectiveStatus(assignment);
                const isExpired = group.assignments.every(
                  (item) => busAssignmentEffectiveStatus(item) === 'expired',
                );
                return (
                  <TableRow key={group.id} data-testid={`student-assignment-${assignment.id}`}>
                    <TableCell className="whitespace-nowrap font-bold text-navy-900">
                      {assignment.student_name}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-semibold text-navy-700">
                      <span className="block">
                        {forwardService?.route_code ??
                          reverseService?.route_code ??
                          'Previous route'}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {directionScopeLabel(group.directionScope)}
                      </span>
                    </TableCell>
                    <TableCell className="min-w-36">
                      {group.forward && (
                        <span className="block">
                          Outbound: {group.forward.pickup_stop_name ?? 'Not assigned'}
                        </span>
                      )}
                      {group.reverse && (
                        <span className="mt-1 block">
                          Return: {group.reverse.pickup_stop_name ?? 'Not assigned'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-36">
                      {group.forward && (
                        <span className="block">
                          Outbound: {group.forward.dropoff_stop_name ?? 'Not assigned'}
                        </span>
                      )}
                      {group.reverse && (
                        <span className="mt-1 block">
                          Return: {group.reverse.dropoff_stop_name ?? 'Not assigned'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-48 whitespace-nowrap text-slate-600">
                      {dateRange(assignment.effective_from, assignment.effective_to)}
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={assignmentStatusTone(effectiveStatus)}>
                        {assignmentStatusLabel(effectiveStatus)}
                      </StatusPill>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        {!isExpired && hasActiveService && (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => onEdit(group)}
                          >
                            Update assignment
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => onDelete(group)}
                        >
                          Remove from bus
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
