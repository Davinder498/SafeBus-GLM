import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminPagination } from '@/components/admin/AdminPagination';
import {
  AdminWriteError,
  AdminWriteMessage,
  InlineFormShell,
} from '@/components/admin/TransportationAdminForms';
import { StudentBusAssignmentForm } from '@/components/admin/StudentBusAssignmentForm';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { usePaginatedAdminList } from '@/hooks/usePaginatedAdminList';
import { getVisibleRouteStops } from '@/services/transportationStructureService';
import { createStudentBusAssignment, fetchAdminBusServices, updateStudentBusAssignment, type BusServiceOption } from '@/services/studentBusAssignmentService';
import type {
  CreateStudentBusAssignmentInput,
  RouteStop,
  StudentBusAssignment,
  StudentBusAssignmentStatus,
  UpdateStudentBusAssignmentInput,
} from '@/types/transportation';

const assignmentStatusTone: Record<StudentBusAssignmentStatus, 'success' | 'danger' | 'neutral'> =
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

export function AdminAssignmentsPage() {
  const { profile } = useAuth();
  type AssignmentRow = StudentBusAssignment & { student_name: string; bus_number: string; route_name: string; route_code: string; trip_type: string; trip_name?: string; pickup_stop_name: string | null; dropoff_stop_name: string | null };
  const list = usePaginatedAdminList<AssignmentRow>('student_bus_assignments');
  const [services, setServices] = useState<BusServiceOption[]>([]);
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [editingAssignment, setEditingAssignment] = useState<AssignmentRow | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

  const loadAssignments = useCallback(async () => {
    try {
      const [nextServices, nextStops] = await Promise.all([
        fetchAdminBusServices(),
        getVisibleRouteStops(),
      ]);
      setServices(nextServices);
      setStops(nextStops);
    } catch (assignmentsError) {
      setWriteError(
        assignmentsError instanceof Error
          ? assignmentsError.message
          : 'Unable to load assignments.',
      );
    }
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const stopNames = useMemo(() => {
    return new Map(stops.map((stop) => [stop.id, stop.stop_name]));
  }, [stops]);

  async function handleCreateAssignment(
    input: CreateStudentBusAssignmentInput | UpdateStudentBusAssignmentInput,
  ) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await createStudentBusAssignment(input as CreateStudentBusAssignmentInput);
      setShowCreateForm(false);
      setSuccessMessage('Student assigned to the bus service.');
      await list.reload();
    } catch (createError) {
      setWriteError(
        createError instanceof Error
          ? createError.message
          : 'Unable to create student bus assignment.',
      );
    }
  }

  async function handleUpdateAssignment(
    input: CreateStudentBusAssignmentInput | UpdateStudentBusAssignmentInput,
  ) {
    if (!editingAssignment) return;
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await updateStudentBusAssignment(
        editingAssignment.id,
        input as UpdateStudentBusAssignmentInput,
      );
      setEditingAssignment(null);
      setSuccessMessage('Student bus assignment updated.');
      await list.reload();
    } catch (updateError) {
      setWriteError(
        updateError instanceof Error
          ? updateError.message
          : 'Unable to update student bus assignment.',
      );
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Assignments"
          title="Student bus assignments"
          description="Assign students to a bus service, then choose pickup and drop-off stops from that service's route."
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
          <InlineFormShell title="Assign student to bus">
            <StudentBusAssignmentForm
              assignment={null}
              defaultTenantId={profile?.tenant_id ?? null}
              services={services}
              stops={stops}
              onSubmit={handleCreateAssignment}
              onCancel={() => setShowCreateForm(false)}
            />
          </InlineFormShell>
        )}

        {canWrite && editingAssignment && (
          <InlineFormShell title="Edit student bus assignment">
            <StudentBusAssignmentForm
              assignment={editingAssignment}
              defaultTenantId={profile?.tenant_id ?? null}
              studentLabel={editingAssignment.student_name}
              services={services}
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
            value={list.searchInput}
            onChange={(event) => list.setSearchInput(event.target.value)}
            placeholder="Search by student, bus, route, stop, or status"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </div>

        {list.loading && (
          <DataState
            title="Loading assignments"
            message="Fetching assignment records visible to you."
          />
        )}
        {list.error && <DataState title="Unable to load assignments" message={list.error} />}
        {!list.loading && !list.error && list.rows.length === 0 && (
          <DataState
            title="No assignments visible"
            message="No students are assigned to bus services yet."
          />
        )}
        {!list.loading && !list.error && list.rows.length > 0 && (
          <section className="grid gap-4">
            {list.rows.map((assignment) => (
              <Card key={assignment.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">
                      {assignment.student_name ?? assignment.student_id}
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                      Bus {assignment.bus_number} / {assignment.route_code} - {assignment.route_name} ({assignment.trip_name ?? assignment.trip_type})
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
                        ? (assignment.pickup_stop_name ?? stopNames.get(assignment.pickup_stop_id) ?? assignment.pickup_stop_id)
                        : 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Dropoff stop:{' '}
                    <span className="font-semibold text-navy-900">
                      {assignment.dropoff_stop_id
                        ? (assignment.dropoff_stop_name ?? stopNames.get(assignment.dropoff_stop_id) ?? assignment.dropoff_stop_id)
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
            <AdminPagination page={list.page} pageSize={list.pageSize} totalCount={list.totalCount} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
