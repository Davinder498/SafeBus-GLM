import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BusFront,
  CheckCircle2,
  CircleDashed,
  Pencil,
  PlayCircle,
  Power,
  School,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { StudentBusAssignmentForm } from '@/components/admin/StudentBusAssignmentForm';
import { StudentForm, type StudentFormInput } from '@/components/admin/StudentForm';
import { InlineFormShell } from '@/components/admin/TransportationAdminForms';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import {
  deleteStudent,
  fetchAdminStudentDetail,
  setStudentStatus,
  updateStudent,
  type AdminStudentDetail,
} from '@/services/adminStudentsService';
import {
  createStudentBusAssignment,
  fetchAdminBusServices,
  updateStudentBusAssignment,
  type BusServiceOption,
} from '@/services/studentBusAssignmentService';
import { getVisibleRouteStops } from '@/services/transportationStructureService';
import type { School as SchoolRecord } from '@/types/organization';
import type {
  CreateStudentBusAssignmentInput,
  RouteStop,
  UpdateStudentBusAssignmentInput,
} from '@/types/transportation';

function studentName(detail: AdminStudentDetail) {
  const { student } = detail;
  return student.preferred_name
    ? `${student.first_name} ${student.last_name} (${student.preferred_name})`
    : `${student.first_name} ${student.last_name}`;
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-navy-900">{value}</dd>
    </div>
  );
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
  const [managingBus, setManagingBus] = useState(false);
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [busServices, setBusServices] = useState<BusServiceOption[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canWrite =
    !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);
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
      setManagingBus(false);
      setEditing(true);
    } catch {
      setWriteError('School options could not be loaded.');
    }
  }

  async function startManagingBus() {
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
      setManagingBus(true);
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

  async function saveBusAssignment(
    input: CreateStudentBusAssignmentInput | UpdateStudentBusAssignmentInput,
  ) {
    if (!detail) return;
    setWriteError(null);
    try {
      if (detail.busAssignment) {
        await updateStudentBusAssignment(
          detail.busAssignment.id,
          input as UpdateStudentBusAssignmentInput,
        );
      } else {
        await createStudentBusAssignment(input as CreateStudentBusAssignmentInput);
      }
      setManagingBus(false);
      setMessage('Student transportation updated.');
      await loadDetail();
    } catch (error) {
      const next =
        error instanceof Error ? error : new Error('Unable to update transportation.');
      setWriteError(next.message);
      throw next;
    }
  }

  async function removeBusAssignment() {
    if (!detail?.busAssignment || busy) return;
    setBusy(true);
    setWriteError(null);
    try {
      await updateStudentBusAssignment(detail.busAssignment.id, { status: 'inactive' });
      setManagingBus(false);
      setMessage('Bus assignment removed.');
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

  const assigned = !!detail?.busAssignment && !!detail.bus && !!detail.route;
  const rosterActive = detail?.student.status === 'active';

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
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
              eyebrow="Student record"
              title={studentName(detail)}
              description="Student details, guardian connections, transportation, and administrative actions."
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

            <section className="grid gap-4 lg:grid-cols-3">
              <Card className="p-5">
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-navy-50 p-2 text-navy-700">
                    <School className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      School
                    </p>
                    <p className="mt-1 font-bold text-navy-900">
                      {detail.schoolName ?? 'Not assigned'}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-start gap-3">
                  <span
                    className={`rounded-lg p-2 ${assigned ? 'bg-success-50 text-success-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {assigned ? (
                      <CheckCircle2 className="h-5 w-5" aria-hidden />
                    ) : (
                      <CircleDashed className="h-5 w-5" aria-hidden />
                    )}
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Transportation
                    </p>
                    <p className="mt-1 font-bold text-navy-900">
                      {assigned
                        ? `Bus ${detail.bus?.bus_number} · ${detail.route?.route_code}`
                        : 'Not assigned'}
                    </p>
                    {assigned && (
                      <p className="mt-1 text-sm text-slate-600">{detail.route?.route_name}</p>
                    )}
                  </div>
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex items-start gap-3">
                  <span
                    className={`rounded-lg p-2 ${rosterActive ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'}`}
                  >
                    {rosterActive ? (
                      <ShieldCheck className="h-5 w-5" aria-hidden />
                    ) : (
                      <Power className="h-5 w-5" aria-hidden />
                    )}
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Roster availability
                    </p>
                    <p className="mt-1 font-bold text-navy-900">
                      {rosterActive ? 'Available for transportation' : 'Not in active workflows'}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {rosterActive
                        ? 'The student can be assigned to current bus service.'
                        : 'The record is retained but excluded from current operations.'}
                    </p>
                  </div>
                </div>
              </Card>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <Card className="p-5">
                <div className="flex items-center gap-2">
                  <UserRound className="h-5 w-5 text-navy-700" aria-hidden />
                  <h2 className="text-lg font-bold text-navy-900">Student details</h2>
                </div>
                <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                  <DetailItem label="Legal name" value={`${detail.student.first_name} ${detail.student.last_name}`} />
                  <DetailItem label="Preferred name" value={detail.student.preferred_name ?? 'Not provided'} />
                  <DetailItem label="Grade" value={detail.student.grade ?? 'Not provided'} />
                  <DetailItem
                    label="Pickup stop"
                    value={detail.pickupStop?.stop_name ?? 'Not assigned'}
                  />
                  <DetailItem
                    label="Drop-off stop"
                    value={detail.dropoffStop?.stop_name ?? 'Not assigned'}
                  />
                </dl>
              </Card>

              <Card className="p-5">
                <div className="flex items-center gap-2">
                  <UsersRound className="h-5 w-5 text-navy-700" aria-hidden />
                  <h2 className="text-lg font-bold text-navy-900">Linked guardians</h2>
                </div>
                {detail.guardians.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-600">No guardian is linked.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-slate-100">
                    {detail.guardians.map((guardian) => (
                      <li key={guardian.id} className="py-3 first:pt-0 last:pb-0">
                        <p className="font-semibold text-navy-900">{guardian.full_name}</p>
                        <p className="text-sm text-slate-600">{guardian.email}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  to="/admin/guardians"
                  className="mt-4 inline-flex text-sm font-semibold text-navy-700 hover:underline"
                >
                  Manage guardian connections
                </Link>
              </Card>
            </section>

            {canWrite && (
              <Card className="p-5">
                <h2 className="text-lg font-bold text-navy-900">Actions</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Changes are restricted by your tenant and role permissions.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    leftIcon={<Pencil className="h-4 w-4" aria-hidden />}
                    onClick={() => void startEditing()}
                  >
                    Edit details
                  </Button>
                  {rosterActive && (
                    <Button
                      type="button"
                      variant="outline"
                      leftIcon={<BusFront className="h-4 w-4" aria-hidden />}
                      onClick={() => void startManagingBus()}
                    >
                      {assigned ? 'Manage transportation' : 'Assign transportation'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
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
                    {rosterActive ? 'Remove from active roster' : 'Return to active roster'}
                  </Button>
                  {canDelete && (
                    <Button
                      type="button"
                      variant="danger"
                      leftIcon={<Trash2 className="h-4 w-4" aria-hidden />}
                      onClick={() => setConfirmDelete(true)}
                    >
                      Delete student
                    </Button>
                  )}
                </div>
              </Card>
            )}

            {editing && (
              <StudentForm
                title="Edit student details"
                schools={schools}
                initial={detail.student}
                onSubmit={saveStudent}
                onCancel={() => setEditing(false)}
              />
            )}

            {managingBus && (
              <InlineFormShell
                title={`${assigned ? 'Manage' : 'Assign'} transportation for ${studentName(detail)}`}
              >
                <StudentBusAssignmentForm
                  assignment={detail.busAssignment}
                  fixedStudentId={detail.student.id}
                  studentLabel={studentName(detail)}
                  services={busServices}
                  stops={routeStops}
                  defaultTenantId={profile?.tenant_id ?? null}
                  onSubmit={saveBusAssignment}
                  onCancel={() => setManagingBus(false)}
                />
                {detail.busAssignment && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void removeBusAssignment()}
                    disabled={busy}
                  >
                    Remove bus assignment
                  </Button>
                )}
              </InlineFormShell>
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
