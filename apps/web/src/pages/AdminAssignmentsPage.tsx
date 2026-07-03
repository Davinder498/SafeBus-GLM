import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { getVisibleStudents } from '@/services/studentGuardianService';
import {
  getVisibleRoutes,
  getVisibleRouteStops,
  getVisibleStudentRouteAssignments,
} from '@/services/transportationStructureService';
import type { Student } from '@/types/studentGuardian';
import type {
  Route,
  RouteStop,
  StudentRouteAssignment,
  StudentRouteAssignmentStatus,
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
  const [assignments, setAssignments] = useState<StudentRouteAssignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAssignments() {
      setLoading(true);
      setError(null);

      try {
        const [nextAssignments, nextStudents, nextRoutes, nextStops] = await Promise.all([
          getVisibleStudentRouteAssignments(),
          getVisibleStudents(),
          getVisibleRoutes(),
          getVisibleRouteStops(),
        ]);

        if (active) {
          setAssignments(nextAssignments);
          setStudents(nextStudents);
          setRoutes(nextRoutes);
          setStops(nextStops);
        }
      } catch (assignmentsError) {
        if (active) {
          setError(
            assignmentsError instanceof Error
              ? assignmentsError.message
              : 'Unable to load assignments.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadAssignments();

    return () => {
      active = false;
    };
  }, []);

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

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Assignments"
          title="Visible student route assignments"
          description="Read-only student route assignments returned by Supabase under the current admin user's RLS permissions."
        />

        <Card className="border-navy-100 bg-navy-50 p-5">
          <p className="text-sm font-semibold text-navy-900">
            Student route assignment imports and edits will be added in a later milestone.
          </p>
        </Card>

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
                  <StatusPill tone={assignmentStatusTone[assignment.status]}>
                    {assignment.status}
                  </StatusPill>
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
