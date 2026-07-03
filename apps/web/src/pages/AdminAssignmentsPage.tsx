import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminWriteError,
  AdminWriteMessage,
  InlineFormShell,
  StudentRouteAssignmentForm,
} from '@/components/admin/TransportationAdminForms';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { getVisibleStudents } from '@/services/studentGuardianService';
import {
  createStudentRouteAssignment,
  getVisibleRoutes,
  getVisibleRouteStops,
  getVisibleStudentRouteAssignments,
  updateStudentRouteAssignment,
} from '@/services/transportationStructureService';
import type { Student } from '@/types/studentGuardian';
import type {
  CreateStudentRouteAssignmentInput,
  Route,
  RouteStop,
  StudentRouteAssignment,
  StudentRouteAssignmentStatus,
  UpdateStudentRouteAssignmentInput,
} from '@/types/transportation';

const assignmentStatusTone: Record<StudentRouteAssignmentStatus, 'success' | 'danger' | 'neutral'> =
  {
    active: 'success',
    inactive: 'neutral',
    archived: 'danger',
  };

function formatDate(value: string | null) {
  if (!value) return 'Open ended';
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

export function AdminAssignmentsPage() {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<StudentRouteAssignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<StudentRouteAssignment | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [nextAssignments, nextStudents, nextRoutes, nextStops] = await Promise.all([
        getVisibleStudentRouteAssignments(),
        getVisibleStudents(),
        getVisibleRoutes(),
        getVisibleRouteStops(),
      ]);
      setAssignments(nextAssignments);
      setStudents(nextStudents);
      setRoutes(nextRoutes);
      setStops(nextStops);
    } catch (assignmentsError) {
      setError(
        assignmentsError instanceof Error
          ? assignmentsError.message
          : 'Unable to load assignments.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const studentNames = useMemo(() => {
    return new Map(students.map((student) => [student.id, getStudentName(student)]));
  }, [students]);

  const routeLabels = useMemo(() => {
    return new Map(routes.map((route) => [route.id, `${route.route_code} - ${route.route_name}`]));
  }, [routes]);

  const stopNames = useMemo(() => {
    return new Map(stops.map((stop) => [stop.id, stop.stop_name]));
  }, [stops]);

  const filteredAssignments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return assignments;

    return assignments.filter((assignment) =>
      [
        assignment.status,
        studentNames.get(assignment.student_id) ?? assignment.student_id,
        routeLabels.get(assignment.route_id) ?? assignment.route_id,
        assignment.pickup_stop_id ? stopNames.get(assignment.pickup_stop_id) : null,
        assignment.dropoff_stop_id ? stopNames.get(assignment.dropoff_stop_id) : null,
        assignment.effective_from,
        assignment.effective_to,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [assignments, query, routeLabels, stopNames, studentNames]);

  async function handleCreateAssignment(
    input: CreateStudentRouteAssignmentInput | UpdateStudentRouteAssignmentInput,
  ) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await createStudentRouteAssignment(input as CreateStudentRouteAssignmentInput);
      setShowCreateForm(false);
      setSuccessMessage('Student route assignment created.');
      await loadAssignments();
    } catch (createError) {
      setWriteError(
        createError instanceof Error
          ? createError.message
          : 'Unable to create student route assignment.',
      );
    }
  }

  async function handleUpdateAssignment(
    input: CreateStudentRouteAssignmentInput | UpdateStudentRouteAssignmentInput,
  ) {
    if (!editingAssignment) return;
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await updateStudentRouteAssignment(
        editingAssignment.id,
        input as UpdateStudentRouteAssignmentInput,
      );
      setEditingAssignment(null);
      setSuccessMessage('Student route assignment updated.');
      await loadAssignments();
    } catch (updateError) {
      setWriteError(
        updateError instanceof Error
          ? updateError.message
          : 'Unable to update student route assignment.',
      );
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Assignments"
          title="Visible student route assignments"
          description="Student route assignments returned by Supabase under the current admin user's RLS permissions."
        />

        {canWrite && (
          <div className="flex">
            <Button type="button" onClick={() => {
              setEditingAssignment(null);
              setShowCreateForm(true);
              setWriteError(null);
              setSuccessMessage(null);
            }}>
              Add assignment
            </Button>
          </div>
        )}

        <AdminWriteMessage message={successMessage} />
        <AdminWriteError message={writeError} />

        {canWrite && showCreateForm && (
          <InlineFormShell title="Add student route assignment">
            <StudentRouteAssignmentForm
              assignment={null}
              students={students}
              routes={routes}
              stops={stops}
              onSubmit={handleCreateAssignment}
              onCancel={() => setShowCreateForm(false)}
            />
          </InlineFormShell>
        )}

        {canWrite && editingAssignment && (
          <InlineFormShell title="Edit student route assignment">
            <StudentRouteAssignmentForm
              assignment={editingAssignment}
              students={students}
              routes={routes}
              stops={stops}
              onSubmit={handleUpdateAssignment}
              onCancel={() => setEditingAssignment(null)}
            />
          </InlineFormShell>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="assignment-search">
            Search assignments
          </label>
          <input
            id="assignment-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by student, route, stop, date, or status"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </div>

        {loading && (
          <DataState
            title="Loading assignments"
            message="Fetching assignment records visible to you."
          />
        )}
        {error && <DataState title="Unable to load assignments" message={error} />}
        {!loading && !error && assignments.length === 0 && (
          <DataState
            title="No assignments visible"
            message="No student route assignments are available for this account under the current RLS policies."
          />
        )}
        {!loading && !error && assignments.length > 0 && filteredAssignments.length === 0 && (
          <DataState
            title="No assignments match"
            message="Try a different student, route, stop, date, or status search."
          />
        )}

        {!loading && !error && filteredAssignments.length > 0 && (
          <section className="grid gap-4">
            {filteredAssignments.map((assignment) => (
              <Card key={assignment.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">
                      {studentNames.get(assignment.student_id) ?? assignment.student_id}
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {routeLabels.get(assignment.route_id) ?? assignment.route_id}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill tone={assignmentStatusTone[assignment.status]}>
                      {assignment.status}
                    </StatusPill>
                    {canWrite && (
                      <Button type="button" size="sm" variant="secondary" onClick={() => {
                        setShowCreateForm(false);
                        setEditingAssignment(assignment);
                        setWriteError(null);
                        setSuccessMessage(null);
                      }}>
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                  <p className="text-gray-600">
                    Pickup stop:{' '}
                    <span className="font-semibold text-navy-900">
                      {assignment.pickup_stop_id
                        ? (stopNames.get(assignment.pickup_stop_id) ?? assignment.pickup_stop_id)
                        : 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Dropoff stop:{' '}
                    <span className="font-semibold text-navy-900">
                      {assignment.dropoff_stop_id
                        ? (stopNames.get(assignment.dropoff_stop_id) ?? assignment.dropoff_stop_id)
                        : 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Effective dates:{' '}
                    <span className="font-semibold text-navy-900">
                      {formatDate(assignment.effective_from)} to{' '}
                      {formatDate(assignment.effective_to)}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Assignment id:{' '}
                    <span className="font-semibold text-navy-900">{assignment.id}</span>
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
