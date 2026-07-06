import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminWriteError,
  AdminWriteMessage,
  DriverAssignmentForm,
  InlineFormShell,
} from '@/components/admin/TransportationAdminForms';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { getVisibleProfiles } from '@/services/adminOrganizationService';
import {
  createDriverAssignment,
  fetchAdminAssignments,
  updateAssignmentStatus,
} from '@/services/driverAssignmentService';
import { getVisibleBuses, getVisibleDrivers, getVisibleRoutes } from '@/services/transportationStructureService';
import type { OrganizationProfile } from '@/types/organization';
import type { Bus, Driver, Route } from '@/types/transportation';
import type { CreateAssignmentInput, DriverRouteAssignment } from '@/types/driverAssignments';

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function AdminDriverAssignmentsPage() {
  const { profile } = useAuth();
  const [assignments, setAssignments] = useState<DriverRouteAssignment[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [profiles, setProfiles] = useState<OrganizationProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assignmentData, driverData, busData, routeData, profileData] = await Promise.all([
        fetchAdminAssignments(),
        getVisibleDrivers(),
        getVisibleBuses(),
        getVisibleRoutes(),
        getVisibleProfiles(),
      ]);
      setAssignments(assignmentData);
      setDrivers(driverData);
      setBuses(busData);
      setRoutes(routeData);
      setProfiles(profileData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load driver assignments.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const profileLabels = useMemo(() => {
    return new Map(
      profiles.map((p) => [p.id, `${p.full_name} (${p.email})`]),
    );
  }, [profiles]);

  const driverNames = useMemo(() => {
    return new Map(
      profiles.map((p) => [p.id, p.full_name]),
    );
  }, [profiles]);

  const busLabels = useMemo(() => {
    return new Map(buses.map((b) => [b.id, b.bus_number]));
  }, [buses]);

  const routeNames = useMemo(() => {
    return new Map(routes.map((r) => [r.id, r.route_name]));
  }, [routes]);

  async function handleCreate(input: CreateAssignmentInput) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await createDriverAssignment(input, profile?.tenant_id ?? null);
      setShowCreateForm(false);
      setSuccessMessage('Assignment created.');
      await load();
    } catch (createError) {
      setWriteError(createError instanceof Error ? createError.message : 'Unable to create assignment.');
    }
  }

  async function handleDeactivate(assignmentId: string) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await updateAssignmentStatus(assignmentId, 'inactive');
      setSuccessMessage('Assignment deactivated.');
      await load();
    } catch (deactivateError) {
      setWriteError(deactivateError instanceof Error ? deactivateError.message : 'Unable to deactivate assignment.');
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Assignments"
          title="Driver assignments"
          description="Assign drivers to buses and routes. Drivers start trips from their active assignments."
        />

        {canWrite && (
          <div className="flex">
            <Button type="button" onClick={() => {
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
          <InlineFormShell title="Add driver assignment">
            <DriverAssignmentForm
              drivers={drivers}
              buses={buses}
              routes={routes}
              profileLabels={profileLabels}
              defaultTenantId={profile?.tenant_id ?? null}
              onSubmit={handleCreate}
              onCancel={() => setShowCreateForm(false)}
            />
          </InlineFormShell>
        )}

        {loading && (
          <DataState title="Loading assignments" message="Fetching driver assignments visible to you." />
        )}
        {error && <DataState title="Unable to load assignments" message={error} />}
        {!loading && !error && assignments.length === 0 && (
          <DataState
            title="No assignments visible"
            message="No driver assignments are available for this account. Create one to get started."
          />
        )}

        {!loading && !error && assignments.length > 0 && (
          <section className="grid gap-4">
            {assignments.map((assignment) => (
              <Card key={assignment.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">
                      {routeNames.get(assignment.route_id) ?? 'Unknown route'}
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                      Bus {busLabels.get(assignment.bus_id) ?? assignment.bus_id} &middot;{' '}
                      {assignment.trip_type}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      Driver: {driverNames.get(assignment.driver_id) ?? assignment.driver_id}
                    </p>
                    {assignment.effective_from && (
                      <p className="mt-1 text-sm text-gray-600">
                        Effective from {formatDate(assignment.effective_from)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill tone={assignment.status === 'active' ? 'success' : 'neutral'}>
                      {assignment.status}
                    </StatusPill>
                    {canWrite && assignment.status === 'active' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleDeactivate(assignment.id)}
                      >
                        Deactivate
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
