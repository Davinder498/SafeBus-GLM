import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { getVisibleSchools } from '@/services/adminOrganizationService';
import { getVisibleStudents } from '@/services/studentGuardianService';
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
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStudents() {
      setLoading(true);
      setError(null);

      try {
        const [nextStudents, nextSchools] = await Promise.all([
          getVisibleStudents(),
          getVisibleSchools(),
        ]);

        if (active) {
          setStudents(nextStudents);
          setSchools(nextSchools);
        }
      } catch (studentsError) {
        if (active) {
          setError(
            studentsError instanceof Error ? studentsError.message : 'Unable to load students.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadStudents();

    return () => {
      active = false;
    };
  }, []);

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
        schoolNames.get(student.school_id),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, schoolNames, students]);

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Students"
          title="Visible student records"
          description="Read-only student records returned by Supabase under the current admin user's RLS permissions."
        />

        <Card className="border-navy-100 bg-navy-50 p-5">
          <p className="text-sm font-semibold text-navy-900">
            Student creation and bulk import will be handled through secure admin workflows in a
            later milestone.
          </p>
        </Card>

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
            title="No students visible"
            message="No student records are available for this account under the current RLS policies."
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
                      {schoolNames.get(student.school_id) ?? student.school_id}
                    </p>
                  </div>
                  <StatusPill tone={studentStatusTone[student.status]}>{student.status}</StatusPill>
                </div>
                <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                  <p className="text-gray-600">
                    Grade:{' '}
                    <span className="font-semibold text-navy-900">
                      {student.grade ?? 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    School number:{' '}
                    <span className="font-semibold text-navy-900">
                      {student.school_student_number ?? 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Created:{' '}
                    <span className="font-semibold text-navy-900">
                      {formatDate(student.created_at)}
                    </span>
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
