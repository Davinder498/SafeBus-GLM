import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { StudentBusAssignmentForm } from '@/components/admin/StudentBusAssignmentForm';
import { StudentCsvImportPanel } from '@/components/admin/StudentCsvImportPanel';
import { StudentForm, type StudentFormInput } from '@/components/admin/StudentForm';
import { StudentOnboardingForm } from '@/components/admin/StudentOnboardingForm';
import { StudentQrCredentialPanel } from '@/components/admin/StudentQrCredentialPanel';
import { InlineFormShell } from '@/components/admin/TransportationAdminForms';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { usePaginatedAdminList } from '@/hooks/usePaginatedAdminList';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import { getVisibleRouteStops } from '@/services/transportationStructureService';
import { createStudentBusAssignment, fetchAdminBusServices, updateStudentBusAssignment, type BusServiceOption } from '@/services/studentBusAssignmentService';
import {
  createStudent,
  deleteStudent,
  setStudentStatus,
  updateStudent,
} from '@/services/adminStudentsService';
import {
  createStudentOnboarding,
  type CreateStudentOnboardingInput,
} from '@/services/studentOnboardingService';
import type { School } from '@/types/organization';
import type { Student, StudentStatus } from '@/types/studentGuardian';
import type { CreateStudentBusAssignmentInput, RouteStop, StudentBusAssignment, UpdateStudentBusAssignmentInput } from '@/types/transportation';

type AdminStudentRow = Student & {
  school_name: string | null;
  bus_assignment_id: string | null;
  bus_route_assignment_id: string | null;
  pickup_stop_id: string | null;
  dropoff_stop_id: string | null;
  bus_effective_from: string | null;
  bus_effective_to: string | null;
  bus_number: string | null;
  route_name: string | null;
  route_code: string | null;
  trip_type: 'morning' | 'evening' | null;
  pickup_stop_name: string | null;
  dropoff_stop_name: string | null;
};

const studentStatusTone: Record<StudentStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
  transferred: 'warning',
  archived: 'danger',
};

function getStudentName(student: Student) {
  return student.preferred_name
    ? `${student.first_name} ${student.last_name} (${student.preferred_name})`
    : `${student.first_name} ${student.last_name}`;
}

export function AdminStudentsPage() {
  const { profile } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [busServices, setBusServices] = useState<BusServiceOption[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const list = usePaginatedAdminList<AdminStudentRow>('students');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [busStudent, setBusStudent] = useState<AdminStudentRow | null>(null);
  const [qrStudent, setQrStudent] = useState<AdminStudentRow | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingStatusStudentId, setPendingStatusStudentId] = useState<string | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<AdminStudentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);
  const canDelete =
    !!profile && (profile.role === 'tenant_admin' || profile.role === 'platform_super_admin');

  useEffect(() => {
    void Promise.all([getVisibleSchools(), fetchAdminBusServices(), getVisibleRouteStops()])
      .then(([nextSchools, services, stops]) => { setSchools(nextSchools); setBusServices(services); setRouteStops(stops); })
      .catch(() => setWriteError('Some transportation options could not be loaded.'));
  }, []);

  function existingBusAssignment(student: AdminStudentRow): StudentBusAssignment | null {
    if (!student.bus_assignment_id || !student.bus_route_assignment_id || !student.bus_effective_from) return null;
    return { id: student.bus_assignment_id, tenant_id: student.tenant_id, student_id: student.id,
      bus_route_assignment_id: student.bus_route_assignment_id, pickup_stop_id: student.pickup_stop_id,
      dropoff_stop_id: student.dropoff_stop_id, effective_from: student.bus_effective_from,
      effective_to: student.bus_effective_to, status: 'active', created_at: student.created_at, updated_at: student.updated_at };
  }

  async function saveBusAssignment(input: CreateStudentBusAssignmentInput | UpdateStudentBusAssignmentInput) {
    if (!busStudent) return; setWriteError(null); setSuccessMessage(null);
    try {
      const existing = existingBusAssignment(busStudent);
      if (existing) await updateStudentBusAssignment(existing.id, input as UpdateStudentBusAssignmentInput);
      else await createStudentBusAssignment(input as CreateStudentBusAssignmentInput);
      setBusStudent(null); setSuccessMessage('Student bus assignment saved.'); await list.reload();
    } catch (error) { setWriteError(error instanceof Error ? error.message : 'Unable to save bus assignment.'); }
  }

  async function removeBusAssignment(student: AdminStudentRow) {
    if (!student.bus_assignment_id) return; setWriteError(null); setSuccessMessage(null);
    try { await updateStudentBusAssignment(student.bus_assignment_id, { status: 'inactive' }); setBusStudent(null); setSuccessMessage('Bus assignment removed. The student remains active without bus transportation.'); await list.reload(); }
    catch (error) { setWriteError(error instanceof Error ? error.message : 'Unable to remove bus assignment.'); }
  }

  async function handleCreate(input: StudentFormInput) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await createStudent(
        {
          firstName: input.firstName,
          lastName: input.lastName,
          preferredName: input.preferredName,
          grade: input.grade,
          schoolId: input.schoolId || null,
        },
        profile?.tenant_id ?? null,
      );
      setShowCreateForm(false);
      setSuccessMessage('Student created.');
      await list.reload();
    } catch (createError) {
      setWriteError(createError instanceof Error ? createError.message : 'Unable to create student.');
    }
  }

  async function handleOnboardingCreate(input: CreateStudentOnboardingInput) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      const result = await createStudentOnboarding(input);
      setShowCreateForm(false);
      setSuccessMessage(
        result.guardianInvitationStatus === 'sent'
          ? 'Student created and guardian invitation sent.'
          : result.guardianLinkId
            ? 'Student created and guardian linked.'
            : 'Student created.',
      );
      await list.reload();
    } catch (createError) {
      const next =
        createError instanceof Error ? createError : new Error('Unable to create student.');
      setWriteError(next.message);
      throw next;
    }
  }

  async function handleCsvImported(count: number) {
    setShowCsvImport(false);
    setWriteError(null);
    setSuccessMessage(
      `${count.toLocaleString()} student${count === 1 ? '' : 's'} imported.`,
    );
    await list.reload();
  }

  async function handleUpdate(studentId: string, input: {
    firstName: string;
    lastName: string;
    preferredName: string;
    grade: string;
    schoolId: string;
  }) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await updateStudent(studentId, {
        firstName: input.firstName,
        lastName: input.lastName,
        preferredName: input.preferredName,
        grade: input.grade,
        schoolId: input.schoolId || null,
      });
      setEditingStudent(null);
      setSuccessMessage('Student updated.');
      await list.reload();
    } catch (updateError) {
      setWriteError(updateError instanceof Error ? updateError.message : 'Unable to update student.');
    }
  }

  async function handleDeactivate(studentId: string) {
    if (pendingStatusStudentId) return;
    setPendingStatusStudentId(studentId);
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await setStudentStatus(studentId, 'inactive');
      setSuccessMessage('Student deactivated.');
      await list.reload();
    } catch (deactivateError) {
      setWriteError(deactivateError instanceof Error ? deactivateError.message : 'Unable to deactivate student.');
    } finally {
      setPendingStatusStudentId(null);
    }
  }

  async function handleReactivate(studentId: string) {
    if (pendingStatusStudentId) return;
    setPendingStatusStudentId(studentId);
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await setStudentStatus(studentId, 'active');
      setSuccessMessage('Student reactivated.');
      await list.reload();
    } catch (reactivateError) {
      setWriteError(reactivateError instanceof Error ? reactivateError.message : 'Unable to reactivate student.');
    } finally {
      setPendingStatusStudentId(null);
    }
  }

  async function handleDeleteStudent() {
    if (!deletingStudent || deleting) return;
    setDeleting(true);
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await deleteStudent(deletingStudent.id);
      setDeletingStudent(null);
      setSuccessMessage('Student deleted.');
      await list.reload();
    } catch (deleteError) {
      setWriteError(deleteError instanceof Error ? deleteError.message : 'Unable to delete student.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Students"
          title="Students"
          description="Manage student records for your transportation account. Add, edit, and deactivate students."
        />

        {canWrite && !showCreateForm && !showCsvImport && (
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => {
                setEditingStudent(null);
                setBusStudent(null);
                setQrStudent(null);
                setShowCreateForm(true);
                setShowCsvImport(false);
                setWriteError(null);
                setSuccessMessage(null);
              }}
            >
              Add student
            </Button>
            {profile?.role === 'tenant_admin' && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditingStudent(null);
                  setBusStudent(null);
                  setQrStudent(null);
                  setShowCsvImport(true);
                  setShowCreateForm(false);
                  setWriteError(null);
                  setSuccessMessage(null);
                }}
              >
                Import CSV
              </Button>
            )}
          </div>
        )}

        {writeError && (
          <Card className="border-danger-200 bg-danger-50 p-4">
            <p className="text-sm font-semibold text-danger-700">{writeError}</p>
          </Card>
        )}
        {successMessage && (
          <Card className="border-success-200 bg-success-50 p-4">
            <p className="text-sm font-semibold text-success-700">{successMessage}</p>
          </Card>
        )}

        {canWrite &&
          showCreateForm &&
          (profile?.role === 'tenant_admin' ? (
            <StudentOnboardingForm
              schools={schools}
              onSubmit={handleOnboardingCreate}
              onCancel={() => setShowCreateForm(false)}
            />
          ) : (
            <StudentForm
              title="Add student"
              schools={schools}
              onSubmit={(input) => handleCreate(input)}
              onCancel={() => setShowCreateForm(false)}
            />
          ))}

        {profile?.role === 'tenant_admin' && showCsvImport && (
          <StudentCsvImportPanel
            onImported={handleCsvImported}
            onCancel={() => setShowCsvImport(false)}
          />
        )}

        {canWrite && editingStudent && (
          <StudentForm
            title={`Edit ${editingStudent.first_name} ${editingStudent.last_name}`}
            schools={schools}
            initial={editingStudent}
            onSubmit={(input) => handleUpdate(editingStudent.id, input)}
            onCancel={() => setEditingStudent(null)}
          />
        )}

        {canWrite && qrStudent && (
          <StudentQrCredentialPanel studentId={qrStudent.id} studentName={getStudentName(qrStudent)} onClose={() => setQrStudent(null)} />
        )}

        {canWrite && busStudent && (
          <InlineFormShell title={`${busStudent.bus_assignment_id ? 'Manage' : 'Assign'} bus for ${getStudentName(busStudent)}`}>
            <StudentBusAssignmentForm assignment={existingBusAssignment(busStudent)} fixedStudentId={busStudent.id}
              studentLabel={getStudentName(busStudent)} services={busServices} stops={routeStops}
              defaultTenantId={profile?.tenant_id ?? null} onSubmit={saveBusAssignment} onCancel={() => setBusStudent(null)} />
            {busStudent.bus_assignment_id && <Button type="button" variant="ghost" onClick={() => void removeBusAssignment(busStudent)}>Remove bus assignment</Button>}
          </InlineFormShell>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="student-search">
            Search students
          </label>
          <input
            id="student-search"
            type="search"
            value={list.searchInput}
            onChange={(event) => list.setSearchInput(event.target.value)}
            placeholder="Search by name, grade, status, or school"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </div>

        {list.loading && (
          <DataState title="Loading students" message="Fetching student records visible to you." />
        )}
        {list.error && <DataState title="Unable to load students" message={list.error} />}
        {!list.loading && !list.error && list.rows.length === 0 && list.totalCount === 0 && (
          <DataState
            title="No students added yet"
            message="Add your first student to start building the roster."
          />
        )}
        {!list.loading && !list.error && list.rows.length > 0 && (
          <section className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50"><tr><th className="px-4 py-3">Student</th><th className="px-4 py-3">School</th><th className="px-4 py-3">Grade</th><th className="px-4 py-3">Bus transportation</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
            {list.rows.map((student) => (
              <tr key={student.id}>
                <td className="px-4 py-3 font-semibold text-navy-900">{getStudentName(student)}</td>
                <td className="px-4 py-3 text-gray-600">{student.school_name ?? 'No school'}</td>
                <td className="px-4 py-3">{student.grade ?? 'Not assigned'}</td>
                <td className="px-4 py-3">{student.bus_number ? <div><p className="font-semibold text-navy-900">Bus {student.bus_number}</p><p className="text-xs text-gray-500">{student.route_code} / {student.trip_type}</p><p className="text-xs text-gray-500">{student.pickup_stop_name ?? 'No pickup stop'} → {student.dropoff_stop_name ?? 'No drop-off stop'}</p></div> : <span className="text-gray-500">No bus assigned</span>}</td>
                <td className="px-4 py-3"><StatusPill tone={studentStatusTone[student.status]}>{student.status}</StatusPill></td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-2">
                    {canWrite && (
                      <>
                        <Link
                          to={`/admin/students/${student.id}`}
                          className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-navy-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
                        >
                          View
                        </Link>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setShowCreateForm(false);
                            setShowCsvImport(false);
                            setEditingStudent(student);
                            setWriteError(null);
                            setSuccessMessage(null);
                          }}
                        >
                          Edit
                        </Button>
                        {student.status === 'active' && <Button type="button" size="sm" variant="secondary" onClick={() => { setEditingStudent(null); setShowCreateForm(false); setShowCsvImport(false); setBusStudent(student); setWriteError(null); setSuccessMessage(null); }}>{student.bus_assignment_id ? 'Manage bus' : 'Assign bus'}</Button>}
                        {student.status === 'active' && <Button type="button" size="sm" variant="secondary" onClick={() => { setEditingStudent(null); setShowCreateForm(false); setShowCsvImport(false); setBusStudent(null); setQrStudent(student); setWriteError(null); setSuccessMessage(null); }} data-testid="admin-manage-student-qr">QR badge</Button>}
                        {student.status === 'active' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleDeactivate(student.id)}
                            disabled={pendingStatusStudentId === student.id}
                          >
                            {pendingStatusStudentId === student.id ? 'Deactivating…' : 'Deactivate'}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void handleReactivate(student.id)}
                            disabled={pendingStatusStudentId === student.id}
                          >
                            {pendingStatusStudentId === student.id ? 'Reactivating…' : 'Reactivate'}
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              setEditingStudent(null);
                              setShowCreateForm(false);
                              setShowCsvImport(false);
                              setBusStudent(null);
                              setQrStudent(null);
                              setDeletingStudent(student);
                              setWriteError(null);
                              setSuccessMessage(null);
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </>
                    )}
                  </div></td>
              </tr>
            ))}
                </tbody>
              </table>
            </div>
            <AdminPagination page={list.page} pageSize={list.pageSize} totalCount={list.totalCount} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
          </section>
        )}
        <ConfirmDialog
          open={!!deletingStudent}
          title={`Delete ${deletingStudent ? getStudentName(deletingStudent) : ''}`}
          description="This permanently deletes the student record along with their guardian links and route assignments. This action cannot be undone."
          confirmLabel="Delete student"
          destructive
          busy={deleting}
          onConfirm={() => void handleDeleteStudent()}
          onCancel={() => setDeletingStudent(null)}
        />
      </div>
    </DashboardLayout>
  );
}
