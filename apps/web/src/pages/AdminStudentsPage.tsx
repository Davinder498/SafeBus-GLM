import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import {
  createStudent,
  fetchAdminStudents,
  setStudentStatus,
  updateStudent,
} from '@/services/adminStudentsService';
import type { School } from '@/types/organization';
import type { Student, StudentStatus } from '@/types/studentGuardian';

const studentStatusTone: Record<StudentStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  inactive: 'neutral',
  transferred: 'warning',
  archived: 'danger',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function getStudentName(student: Student) {
  return student.preferred_name
    ? `${student.first_name} ${student.last_name} (${student.preferred_name})`
    : `${student.first_name} ${student.last_name}`;
}

export function AdminStudentsPage() {
  const { profile } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingStatusStudentId, setPendingStatusStudentId] = useState<string | null>(null);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextStudents, nextSchools] = await Promise.all([
        fetchAdminStudents(),
        getVisibleSchools(),
      ]);
      setStudents(nextStudents);
      setSchools(nextSchools);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load students.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const schoolNames = useMemo(() => {
    return new Map(schools.map((school) => [school.id, school.name]));
  }, [schools]);

  const filteredStudents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return students;
    return students.filter((student) => {
      return [
        student.first_name,
        student.last_name,
        student.preferred_name,
        student.grade,
        student.school_student_number,
        student.status,
        student.school_id ? (schoolNames.get(student.school_id) ?? student.school_id) : 'No school',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, schoolNames, students]);

  async function handleCreate(input: {
    firstName: string;
    lastName: string;
    preferredName: string;
    grade: string;
    schoolStudentNumber: string;
    schoolId: string;
  }) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await createStudent(
        {
          firstName: input.firstName,
          lastName: input.lastName,
          preferredName: input.preferredName,
          grade: input.grade,
          schoolStudentNumber: input.schoolStudentNumber,
          schoolId: input.schoolId || null,
        },
        profile?.tenant_id ?? null,
      );
      setShowCreateForm(false);
      setSuccessMessage('Student created.');
      await load();
    } catch (createError) {
      setWriteError(createError instanceof Error ? createError.message : 'Unable to create student.');
    }
  }

  async function handleUpdate(studentId: string, input: {
    firstName: string;
    lastName: string;
    preferredName: string;
    grade: string;
    schoolStudentNumber: string;
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
        schoolStudentNumber: input.schoolStudentNumber,
        schoolId: input.schoolId || null,
      });
      setEditingStudent(null);
      setSuccessMessage('Student updated.');
      await load();
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
      await load();
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
      await load();
    } catch (reactivateError) {
      setWriteError(reactivateError instanceof Error ? reactivateError.message : 'Unable to reactivate student.');
    } finally {
      setPendingStatusStudentId(null);
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Students"
          title="Students"
          description="Manage student records for your transportation account. Add, edit, and deactivate students."
        />

        {canWrite && (
          <div className="flex">
            <Button type="button" onClick={() => {
              setEditingStudent(null);
              setShowCreateForm(true);
              setWriteError(null);
              setSuccessMessage(null);
            }}>
              Add student
            </Button>
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
          <StudentForm
            title="Add student"
            schools={schools}
            onSubmit={(input) => handleCreate(input)}
            onCancel={() => setShowCreateForm(false)}
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

        <div>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="student-search">
            Search students
          </label>
          <input
            id="student-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, grade, status, or school number"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </div>

        {loading && (
          <DataState title="Loading students" message="Fetching student records visible to you." />
        )}
        {error && <DataState title="Unable to load students" message={error} />}
        {!loading && !error && students.length === 0 && (
          <DataState
            title="No students added yet"
            message="Add your first student to start building the roster."
          />
        )}
        {!loading && !error && students.length > 0 && filteredStudents.length === 0 && (
          <DataState
            title="No students match"
            message="Try a different name, grade, status, or school number search."
          />
        )}

        {!loading && !error && filteredStudents.length > 0 && (
          <section className="grid gap-4">
            {filteredStudents.map((student) => (
              <Card key={student.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">{getStudentName(student)}</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {student.school_id ? (schoolNames.get(student.school_id) ?? student.school_id) : 'No school'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill tone={studentStatusTone[student.status]}>{student.status}</StatusPill>
                    {canWrite && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setShowCreateForm(false);
                            setEditingStudent(student);
                            setWriteError(null);
                            setSuccessMessage(null);
                          }}
                        >
                          Edit
                        </Button>
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
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                  <p className="text-gray-600">
                    Grade: <span className="font-semibold text-navy-900">{student.grade ?? 'Not assigned'}</span>
                  </p>
                  <p className="text-gray-600">
                    School number: <span className="font-semibold text-navy-900">{student.school_student_number ?? 'Not assigned'}</span>
                  </p>
                  <p className="text-gray-600">
                    Created: <span className="font-semibold text-navy-900">{formatDate(student.created_at)}</span>
                  </p>
                  <p className="text-gray-600">
                    Student id: <span className="font-semibold text-navy-900">{student.id}</span>
                  </p>
                </div>
              </Card>
            ))}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------------------
// Student form component
// ---------------------------------------------------------------------------

interface StudentFormProps {
  title: string;
  schools: School[];
  initial?: Student;
  onSubmit: (input: {
    firstName: string;
    lastName: string;
    preferredName: string;
    grade: string;
    schoolStudentNumber: string;
    schoolId: string;
  }) => Promise<void>;
  onCancel: () => void;
}

function StudentForm({ title, schools, initial, onSubmit, onCancel }: StudentFormProps) {
  const [firstName, setFirstName] = useState(initial?.first_name ?? '');
  const [lastName, setLastName] = useState(initial?.last_name ?? '');
  const [preferredName, setPreferredName] = useState(initial?.preferred_name ?? '');
  const [grade, setGrade] = useState(initial?.grade ?? '');
  const [schoolStudentNumber, setSchoolStudentNumber] = useState(initial?.school_student_number ?? '');
  const [schoolId, setSchoolId] = useState(initial?.school_id ?? '');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setFormError('First name and last name are required.');
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        firstName,
        lastName,
        preferredName,
        grade,
        schoolStudentNumber,
        schoolId,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-lg font-bold text-navy-900">{title}</h2>
      {formError && <p className="mt-2 text-sm font-semibold text-danger-700">{formError}</p>}
      <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="student-first-name">
          First name
          <input
            id="student-first-name"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
            required
          />
        </label>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="student-last-name">
          Last name
          <input
            id="student-last-name"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
            required
          />
        </label>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="student-preferred-name">
          Preferred name (optional)
          <input
            id="student-preferred-name"
            type="text"
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </label>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="student-grade">
          Grade (optional)
          <input
            id="student-grade"
            type="text"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </label>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="student-number">
          School number (optional)
          <input
            id="student-number"
            type="text"
            value={schoolStudentNumber}
            onChange={(e) => setSchoolStudentNumber(e.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </label>
        <label className="block text-sm font-semibold text-gray-700" htmlFor="student-school">
          School (optional)
          <select
            id="student-school"
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          >
            <option value="">No school</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
      </form>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Button type="button" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving' : 'Save student'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}
