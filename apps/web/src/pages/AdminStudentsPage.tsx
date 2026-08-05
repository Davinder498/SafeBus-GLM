import { useEffect, useState } from 'react';
import { UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { StudentCsvImportPanel } from '@/components/admin/StudentCsvImportPanel';
import { StudentForm, type StudentFormInput } from '@/components/admin/StudentForm';
import { StudentOnboardingForm } from '@/components/admin/StudentOnboardingForm';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { usePaginatedAdminList } from '@/hooks/usePaginatedAdminList';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import { createStudent } from '@/services/adminStudentsService';
import {
  createStudentOnboarding,
  type CreateStudentOnboardingInput,
} from '@/services/studentOnboardingService';
import type { School } from '@/types/organization';
import type { Student, StudentStatus } from '@/types/studentGuardian';

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
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const list = usePaginatedAdminList<AdminStudentRow>('students');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

  useEffect(() => {
    void getVisibleSchools()
      .then(setSchools)
      .catch(() => setWriteError('School options could not be loaded.'));
  }, []);

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
      setWriteError(
        createError instanceof Error ? createError.message : 'Unable to create student.',
      );
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
    setSuccessMessage(`${count.toLocaleString()} student${count === 1 ? '' : 's'} imported.`);
    await list.reload();
  }

  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
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
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[860px] table-fixed text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80">
                  <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-[24%] px-5 py-3">Student</th>
                    <th className="w-[18%] px-5 py-3">School</th>
                    <th className="w-[10%] px-5 py-3">Grade</th>
                    <th className="w-[36%] px-5 py-3">Bus transportation</th>
                    <th className="w-[12%] px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.rows.map((student) => (
                    <tr
                      key={student.id}
                      tabIndex={0}
                      aria-label={`Open ${getStudentName(student)}`}
                      data-testid="student-roster-row"
                      className="h-[72px] cursor-pointer transition-colors hover:bg-slate-50/70 focus:outline-none focus-visible:bg-navy-50/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-navy-500"
                      onClick={() => navigate(`/admin/students/${student.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          navigate(`/admin/students/${student.id}`);
                        }
                      }}
                    >
                      <td className="overflow-hidden px-5 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-700">
                            <UserRound className="h-4 w-4" aria-hidden />
                          </span>
                          <span
                            className="truncate font-bold text-navy-900"
                            title={getStudentName(student)}
                          >
                            {getStudentName(student)}
                          </span>
                        </div>
                      </td>
                      <td className="overflow-hidden px-5 py-3 text-slate-600">
                        <span className="block truncate" title={student.school_name ?? 'No school'}>
                          {student.school_name ?? 'No school'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{student.grade ?? '—'}</td>
                      <td className="overflow-hidden px-5 py-3">
                        {student.bus_number ? (
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-navy-900">
                              Bus {student.bus_number}
                            </p>
                            <p
                              className="truncate text-xs text-slate-500"
                              title={`${student.route_code ?? 'No route'} / ${student.trip_type ?? 'No trip'} · ${student.pickup_stop_name ?? 'No pickup stop'} → ${student.dropoff_stop_name ?? 'No drop-off stop'}`}
                            >
                              {student.route_code ?? 'No route'} / {student.trip_type ?? 'No trip'}{' '}
                              · {student.pickup_stop_name ?? 'No pickup stop'} →{' '}
                              {student.dropoff_stop_name ?? 'No drop-off stop'}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-500">No bus assigned</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill tone={studentStatusTone[student.status]}>
                          {student.status}
                        </StatusPill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination
              page={list.page}
              pageSize={list.pageSize}
              totalCount={list.totalCount}
              onPageChange={list.setPage}
              onPageSizeChange={list.setPageSize}
            />
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
