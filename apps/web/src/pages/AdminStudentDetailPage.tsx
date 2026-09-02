import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BusFront,
  Pencil,
  PlayCircle,
  Power,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { DirectionalStudentBusAssignmentForm } from '@/components/admin/DirectionalStudentBusAssignmentForm';
import { StudentGuardianManager } from '@/components/admin/StudentGuardianManager';
import { StudentForm, type StudentFormInput } from '@/components/admin/StudentForm';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import {
  deleteStudent,
  fetchAdminStudentDetail,
  setStudentStatus,
  updateStudent,
  type AdminStudentDetail,
  type AdminStudentTransportationAssignment,
} from '@/services/adminStudentsService';
import {
  fetchAdminBusServices,
  setStudentBusService,
  setStudentBusServiceStatus,
  type BusServiceOption,
  type SetStudentBusServiceInput,
} from '@/services/studentBusAssignmentService';
import { getVisibleRouteStops } from '@/services/transportationStructureService';
import type { School as SchoolRecord } from '@/types/organization';
import type { RouteStop } from '@/types/transportation';
import {
  groupDirectionalAssignments,
  type DirectionalAssignmentGroup,
} from '@/utils/directionalAssignments';

type StudentTransportationGroup =
  DirectionalAssignmentGroup<AdminStudentTransportationAssignment>;

function studentName(detail: AdminStudentDetail) {
  const { student } = detail;
  return student.preferred_name
    ? `${student.first_name} ${student.last_name} (${student.preferred_name})`
    : `${student.first_name} ${student.last_name}`;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-navy-900">{value}</dd>
    </div>
  );
}

function readableValue(value: string | null | undefined, fallback = 'Not assigned') {
  if (!value) return fallback;
  return value.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase());
}

function readableDate(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(parsed);
}

export function AdminStudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [detail, setDetail] = useState<AdminStudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState<
    StudentTransportationGroup | null | undefined
  >(undefined);
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [busServices, setBusServices] = useState<BusServiceOption[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);
  const canDelete = profile?.role === 'tenant_admin';

  const loadDetail = useCallback(async () => {
    if (!studentId) {
      setLoadError('This student is not available.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      setDetail(await fetchAdminStudentDetail(studentId));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load this student.');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  async function startEditing() {
    setWriteError(null);
    setMessage(null);
    try {
      if (schools.length === 0) setSchools(await getVisibleSchools());
      setAssignmentForm(undefined);
      setEditing(true);
    } catch {
      setWriteError('School options could not be loaded.');
    }
  }

  async function startManagingBus(group: StudentTransportationGroup | null) {
    setWriteError(null);
    setMessage(null);
    try {
      const [services, stops] = await Promise.all([
        fetchAdminBusServices(),
        getVisibleRouteStops(),
      ]);
      setBusServices(services);
      setRouteStops(stops);
      setEditing(false);
      setAssignmentForm(group);
    } catch {
      setWriteError('Transportation options could not be loaded.');
    }
  }

  async function saveStudent(input: StudentFormInput) {
    if (!detail) return;
    setWriteError(null);
    try {
      await updateStudent(detail.student.id, {
        firstName: input.firstName,
        lastName: input.lastName,
        preferredName: input.preferredName,
        grade: input.grade,
        schoolId: input.schoolId || null,
      });
      setEditing(false);
      setMessage('Student details updated.');
      await loadDetail();
    } catch (error) {
      const next = error instanceof Error ? error : new Error('Unable to update student.');
      setWriteError(next.message);
      throw next;
    }
  }

  async function saveBusAssignment(input: SetStudentBusServiceInput) {
    if (!detail) return;
    setWriteError(null);
    try {
      await setStudentBusService(input);
      setAssignmentForm(undefined);
      setMessage('Student transportation updated.');
      await loadDetail();
    } catch (error) {
      const next = error instanceof Error ? error : new Error('Unable to update transportation.');
      setWriteError(next.message);
      throw next;
    }
  }

  async function removeBusAssignment(group: StudentTransportationGroup) {
    if (busy) return;
    setBusy(true);
    setWriteError(null);
    try {
      await setStudentBusServiceStatus(
        group.assignments.map((assignment) => assignment.id),
        'archived',
        true,
      );
      setAssignmentForm(undefined);
      setMessage('Student transportation removed.');
      await loadDetail();
    } catch (error) {
      setWriteError(
        error instanceof Error ? error.message : 'Unable to remove the bus assignment.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeRosterAvailability() {
    if (!detail || busy) return;
    setBusy(true);
    setWriteError(null);
    setEditing(false);
    setAssignmentForm(undefined);
    try {
      const nextStatus = detail.student.status === 'active' ? 'inactive' : 'active';
      await setStudentStatus(detail.student.id, nextStatus);
      setMessage(
        nextStatus === 'active'
          ? 'Student returned to the active transportation roster.'
          : 'Student removed from active transportation workflows.',
      );
      await loadDetail();
    } catch (error) {
      setWriteError(
        error instanceof Error ? error.message : 'Unable to update roster availability.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!detail || busy) return;
    setBusy(true);
    setWriteError(null);
    try {
      await deleteStudent(detail.student.id);
      navigate('/admin/students', { replace: true });
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Unable to delete student.');
      setConfirmDelete(false);
      setBusy(false);
    }
  }

  const transportationGroups = useMemo(
    () =>
      detail
        ? groupDirectionalAssignments(
            detail.transportationAssignments,
            (assignment) =>
              `${assignment.bus_service?.bus_id ?? 'unknown-bus'}|${assignment.bus_service?.route_id ?? 'unknown-route'}`,
            (assignment) => assignment.direction,
          )
        : [],
    [detail],
  );
  const assigned = transportationGroups.length > 0;
  const rosterActive = detail?.student.status === 'active';

  async function refreshAfterGuardianChange(nextMessage: string) {
    setMessage(nextMessage);
    await loadDetail();
  }

  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-6">
        <Link
          to="/admin/students"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-navy-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to students
        </Link>

        {loading && <DataState title="Loading student" message="Fetching the student record." />}
        {loadError && <DataState title="Student unavailable" message={loadError} />}

        {detail && !loading && (
          <>
            <PageHeader
              eyebrow="Student workspace"
              title={studentName(detail)}
              description="Manage the student, guardians, school, bus service, route, and route stops from one place."
            />

            {writeError && (
              <Card className="border-danger-200 bg-danger-50 p-4">
                <p className="text-sm font-semibold text-danger-700">{writeError}</p>
              </Card>
            )}
            {message && (
              <Card className="border-success-200 bg-success-50 p-4">
                <p className="text-sm font-semibold text-success-700">{message}</p>
              </Card>
            )}

            {editing ? (
              <StudentForm
                title="Edit student details"
                schools={schools}
                initial={detail.student}
                onSubmit={saveStudent}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <Card className="p-5" data-testid="student-details-section">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <UserRound className="h-5 w-5 text-navy-700" aria-hidden />
                    <h2 className="text-lg font-bold text-navy-900">Student details</h2>
                  </div>
                  {canWrite && (
                    <Button
                      className="w-full sm:w-auto"
                      type="button"
                      size="sm"
                      variant="outline"
                      leftIcon={<Pencil className="h-4 w-4" aria-hidden />}
                      onClick={() => void startEditing()}
                    >
                      Edit details
                    </Button>
                  )}
                </div>
                <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                  <DetailItem
                    label="Legal name"
                    value={`${detail.student.first_name} ${detail.student.last_name}`}
                  />
                  <DetailItem
                    label="Preferred name"
                    value={detail.student.preferred_name ?? 'Not provided'}
                  />
                  <DetailItem label="Grade" value={detail.student.grade ?? 'Not provided'} />
                  <DetailItem label="School" value={detail.schoolName ?? 'Not assigned'} />
                </dl>
              </Card>
            )}

            <Card className="p-5" data-testid="student-guardians-section">
              <div className="flex items-center gap-2">
                <UsersRound className="h-5 w-5 text-navy-700" aria-hidden />
                <h2 className="text-lg font-bold text-navy-900">Guardians</h2>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Connect guardians, send invitations, and manage each relationship without leaving
                this student.
              </p>
              {canWrite && (
                <StudentGuardianManager
                  detail={detail}
                  tenantId={profile?.tenant_id ?? null}
                  onChanged={refreshAfterGuardianChange}
                />
              )}
            </Card>

            <Card className="p-5" data-testid="student-transportation-section">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <BusFront className="h-5 w-5 text-navy-700" aria-hidden />
                  <h2 className="text-lg font-bold text-navy-900">Transportation</h2>
                </div>
                {canWrite && rosterActive && assignmentForm === undefined && (
                  <Button
                    className="w-full sm:w-auto"
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => void startManagingBus(null)}
                  >
                    {assigned ? 'Add transportation' : 'Assign transportation'}
                  </Button>
                )}
              </div>
              {!rosterActive && (
                <p className="mt-4 rounded-lg bg-warning-50 p-3 text-sm font-semibold text-warning-700">
                  Reactivate the student to manage their transportation.
                </p>
              )}
              {assignmentForm !== undefined ? (
                <div className="mt-5 space-y-4">
                  <DirectionalStudentBusAssignmentForm
                    key={assignmentForm?.id ?? 'new-student-transportation'}
                    assignments={assignmentForm?.assignments ?? []}
                    fixedStudentId={detail.student.id}
                    studentLabel={studentName(detail)}
                    services={busServices}
                    stops={routeStops}
                    selectionMode="bus-route"
                    onSubmit={saveBusAssignment}
                    onCancel={() => setAssignmentForm(undefined)}
                  />
                </div>
              ) : transportationGroups.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-600">
                  No transportation is assigned. Add outbound, return, or both directions when
                  service is confirmed.
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  {transportationGroups.map((group) => {
                    const reference = group.forward ?? group.reverse;
                    const routeLabel = reference?.route
                      ? `${reference.route.route_code} · ${reference.route.route_name}`
                      : 'Assigned route';
                    return (
                      <section
                        key={group.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                        data-testid="student-transportation-group"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h3 className="font-bold text-navy-900">{routeLabel}</h3>
                            <p className="mt-1 text-sm text-slate-600">
                              Outbound and return are shown separately below.
                            </p>
                          </div>
                          {canWrite && rosterActive && (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                aria-label={`Edit transportation for ${routeLabel}`}
                                onClick={() => void startManagingBus(group)}
                              >
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                aria-label={`Remove transportation for ${routeLabel}`}
                                disabled={busy}
                                onClick={() => void removeBusAssignment(group)}
                              >
                                Remove
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          {(
                            [
                              ['forward', 'Outbound', group.forward],
                              ['reverse', 'Return', group.reverse],
                            ] as const
                          ).map(([direction, label, assignment]) => (
                            <article
                              key={direction}
                              className="rounded-xl border border-slate-200 bg-white p-4"
                              data-testid={`student-transportation-${direction}`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <h4 className="font-bold text-navy-900">{label}</h4>
                                <StatusPill tone={assignment ? 'success' : 'neutral'}>
                                  {assignment ? 'Assigned' : 'Not assigned'}
                                </StatusPill>
                              </div>
                              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                                <DetailItem label="Direction" value={label} />
                                <DetailItem
                                  label="Bus"
                                  value={
                                    assignment?.bus
                                      ? `Bus ${assignment.bus.bus_number}`
                                      : 'Not assigned'
                                  }
                                />
                                <DetailItem
                                  label="Pickup stop"
                                  value={assignment?.pickup_stop?.stop_name ?? 'Not assigned'}
                                />
                                <DetailItem
                                  label="Drop-off stop"
                                  value={assignment?.dropoff_stop?.stop_name ?? 'Not assigned'}
                                />
                                <DetailItem
                                  label="Effective from"
                                  value={readableDate(assignment?.effective_from, 'Not assigned')}
                                />
                                <DetailItem
                                  label="Effective to"
                                  value={readableDate(
                                    assignment?.effective_to,
                                    assignment ? 'Ongoing (no end date)' : 'Not assigned',
                                  )}
                                />
                              </dl>
                            </article>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </Card>

            <Card className="p-5" data-testid="student-status-section">
              <div className="flex items-center gap-2">
                {rosterActive ? (
                  <Power className="h-5 w-5 text-success-700" aria-hidden />
                ) : (
                  <PlayCircle className="h-5 w-5 text-warning-700" aria-hidden />
                )}
                <h2 className="text-lg font-bold text-navy-900">Student status</h2>
              </div>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <StatusPill
                    tone={
                      rosterActive
                        ? 'success'
                        : detail.student.status === 'archived'
                          ? 'danger'
                          : detail.student.status === 'transferred'
                            ? 'warning'
                            : 'neutral'
                    }
                  >
                    {readableValue(detail.student.status)}
                  </StatusPill>
                  <p className="mt-2 text-sm text-slate-600">
                    {rosterActive
                      ? 'This student is available for current transportation workflows.'
                      : 'The record is retained but excluded from current transportation workflows.'}
                  </p>
                </div>
                {canWrite && (
                  <Button
                    className="w-full sm:w-auto"
                    type="button"
                    variant={rosterActive ? 'ghost' : 'outline'}
                    leftIcon={
                      rosterActive ? (
                        <Power className="h-4 w-4" aria-hidden />
                      ) : (
                        <PlayCircle className="h-4 w-4" aria-hidden />
                      )
                    }
                    onClick={() => void changeRosterAvailability()}
                    disabled={busy}
                  >
                    {rosterActive ? 'Deactivate student' : 'Reactivate student'}
                  </Button>
                )}
              </div>
            </Card>

            {canDelete && (
              <Card
                className="border-danger-200 bg-danger-50/40 p-5"
                data-testid="student-danger-section"
              >
                <div className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-danger-700" aria-hidden />
                  <h2 className="text-lg font-bold text-danger-700">Danger zone</h2>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  Permanently delete this student, guardian links, and transportation assignments.
                </p>
                <Button
                  className="mt-4 w-full sm:w-auto"
                  type="button"
                  variant="danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete student
                </Button>
              </Card>
            )}
          </>
        )}

        <ConfirmDialog
          open={confirmDelete}
          title={`Delete ${detail ? studentName(detail) : 'student'}`}
          description="This permanently deletes the student record, guardian links, and transportation assignments. This action cannot be undone."
          confirmLabel="Delete student"
          destructive
          busy={busy}
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      </div>
    </DashboardLayout>
  );
}
