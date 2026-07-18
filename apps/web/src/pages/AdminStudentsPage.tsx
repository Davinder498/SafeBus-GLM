import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CircleDashed,
  Eye,
  FileSpreadsheet,
  PauseCircle,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { StudentCsvImportPanel } from '@/components/admin/StudentCsvImportPanel';
import { StudentForm, type StudentFormInput } from '@/components/admin/StudentForm';
import { StudentOnboardingForm } from '@/components/admin/StudentOnboardingForm';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
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
import type { Student } from '@/types/studentGuardian';

type AdminStudentRow = Student & {
  school_name: string | null;
  bus_assignment_id: string | null;
  bus_number: string | null;
  route_name: string | null;
  route_code: string | null;
};

function getStudentName(student: Student) {
  return student.preferred_name
    ? `${student.first_name} ${student.last_name} (${student.preferred_name})`
    : `${student.first_name} ${student.last_name}`;
}

export function AdminStudentsPage() {
  const { profile } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const list = usePaginatedAdminList<AdminStudentRow>('students');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canWrite =
    !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

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
    } catch (error) {
      const next = error instanceof Error ? error : new Error('Unable to create student.');
      setWriteError(next.message);
      throw next;
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
    } catch (error) {
      const next = error instanceof Error ? error : new Error('Unable to create student.');
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

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Students"
          title="Students"
          description="A clean roster view of students, schools, and current transportation assignments."
        />

        {canWrite && !showCreateForm && !showCsvImport && (
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              leftIcon={<UserPlus className="h-4 w-4" aria-hidden />}
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
                leftIcon={<FileSpreadsheet className="h-4 w-4" aria-hidden />}
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

        {canWrite && showCreateForm && (
          profile?.role === 'tenant_admin' ? (
            <StudentOnboardingForm
              schools={schools}
              onSubmit={handleOnboardingCreate}
              onCancel={() => setShowCreateForm(false)}
            />
          ) : (
            <StudentForm
              title="Add student"
              schools={schools}
              onSubmit={handleCreate}
              onCancel={() => setShowCreateForm(false)}
            />
          )
        )}

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
            placeholder="Search by student, school, route, or bus"
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
            message="Add your first student to start building the transportation roster."
          />
        )}

        {!list.loading && !list.error && list.rows.length > 0 && (
          <section className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-[720px] w-full table-fixed text-left">
                <thead className="border-b border-slate-200 bg-slate-50/80">
                  <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="w-[34%] px-5 py-3">Student</th>
                    <th className="w-[27%] px-5 py-3">School</th>
                    <th className="w-[29%] px-5 py-3">Transportation</th>
                    <th className="w-[10%] px-5 py-3 text-right">
                      <span className="sr-only">View</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.rows.map((student) => {
                    const assigned = !!student.bus_assignment_id && !!student.bus_number;
                    return (
                      <tr
                        key={student.id}
                        className="h-16 whitespace-nowrap transition-colors hover:bg-slate-50/70"
                      >
                        <td className="overflow-hidden px-5 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-700">
                              <UserRound className="h-4 w-4" aria-hidden />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-bold text-navy-900">
                                {getStudentName(student)}
                              </span>
                              {student.status !== 'active' && (
                                <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                                  <PauseCircle className="h-3.5 w-3.5" aria-hidden />
                                  Outside active roster
                                </span>
                              )}
                            </span>
                          </div>
                        </td>
                        <td className="truncate px-5 py-3 text-sm text-slate-600">
                          {student.school_name ?? 'Not assigned'}
                        </td>
                        <td className="overflow-hidden px-5 py-3">
                          <span className="flex min-w-0 items-center gap-2">
                            {assigned ? (
                              <CheckCircle2
                                className="h-4 w-4 shrink-0 text-success-600"
                                aria-hidden
                              />
                            ) : (
                              <CircleDashed
                                className="h-4 w-4 shrink-0 text-slate-400"
                                aria-hidden
                              />
                            )}
                            <span
                              className={`truncate text-sm ${assigned ? 'font-semibold text-navy-900' : 'text-slate-500'}`}
                            >
                              {assigned
                                ? `Bus ${student.bus_number} · ${student.route_code ?? student.route_name ?? 'Route'}`
                                : 'Not assigned'}
                            </span>
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <Link
                            to={`/admin/students/${student.id}`}
                            aria-label={`View ${getStudentName(student)}`}
                            className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-navy-700 transition-colors hover:bg-navy-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
                          >
                            <Eye className="h-4 w-4" aria-hidden />
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
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
