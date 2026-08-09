import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminPagination } from '@/components/admin/AdminPagination';
import {
  AdminWriteError,
  AdminWriteMessage,
  DriverAssignmentForm,
  InlineFormShell,
} from '@/components/admin/TransportationAdminForms';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/contexts/useAuth';
import { usePaginatedAdminList } from '@/hooks/usePaginatedAdminList';
import { getVisibleDriverProfiles } from '@/services/adminOrganizationService';
import { createDriverAssignment, updateAssignmentStatus } from '@/services/driverAssignmentService';
import { replaceBus, substituteDriver } from '@/services/phase6OperationsService';
import {
  getVisibleBuses,
  getVisibleDrivers,
  getVisibleRoutes,
  getVisibleRouteTripPatterns,
} from '@/services/transportationStructureService';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import type { OrganizationProfile } from '@/types/organization';
import type { Bus, Driver, Route, RouteTripPattern } from '@/types/transportation';
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
  const list = usePaginatedAdminList<
    DriverRouteAssignment & {
      route_name: string;
      route_code: string;
      bus_number: string;
      driver_name: string;
    }
  >('driver_assignments');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [tripPatterns, setTripPatterns] = useState<RouteTripPattern[]>([]);
  const [profiles, setProfiles] = useState<OrganizationProfile[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canWrite =
    profile?.role === 'tenant_admin' ||
    profile?.role === 'school_admin' ||
    profile?.role === 'transportation_admin';

  // Phase 6: substitute driver / replace bus workflow state
  const [substituteForId, setSubstituteForId] = useState<string | null>(null);
  const [substituteDriverId, setSubstituteDriverId] = useState('');
  const [replacingBusForId, setReplacingBusForId] = useState<string | null>(null);
  const [replacementBusId, setReplacementBusId] = useState('');
  const [substituting, setSubstituting] = useState(false);
  const [replacingBus, setReplacingBus] = useState(false);

  const load = useCallback(async () => {
    try {
      const [driverData, busData, routeData, profileData, patternData] = await Promise.all([
        getVisibleDrivers(),
        getVisibleBuses(),
        getVisibleRoutes(),
        getVisibleDriverProfiles(),
        getVisibleRouteTripPatterns().catch(() => []),
      ]);
      setDrivers(driverData);
      setBuses(busData);
      setRoutes(routeData);
      setProfiles(profileData);
      setTripPatterns(patternData);
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : 'Unable to load assignment options.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const profileLabels = useMemo(() => {
    return new Map(profiles.map((p) => [p.id, `${p.full_name} (${p.email})`]));
  }, [profiles]);

  const driverNames = useMemo(() => {
    return new Map(profiles.map((p) => [p.id, p.full_name]));
  }, [profiles]);

  const busLabels = useMemo(() => {
    return new Map(buses.map((b) => [b.id, b.bus_number]));
  }, [buses]);

  const routeNames = useMemo(() => {
    return new Map(routes.map((r) => [r.id, r.route_name]));
  }, [routes]);

  const tripNames = useMemo(
    () => new Map(tripPatterns.map((pattern) => [pattern.id, pattern.display_name])),
    [tripPatterns],
  );

  async function handleCreate(input: CreateAssignmentInput) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await createDriverAssignment(input, profile?.tenant_id ?? null);
      setShowCreateForm(false);
      setSuccessMessage('Assignment created.');
      await list.reload();
    } catch (createError) {
      setWriteError(
        createError instanceof Error ? createError.message : 'Unable to create assignment.',
      );
    }
  }

  async function handleDeactivate(assignmentId: string) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await updateAssignmentStatus(assignmentId, 'inactive');
      setSuccessMessage('Assignment deactivated.');
      await list.reload();
    } catch (deactivateError) {
      setWriteError(
        deactivateError instanceof Error
          ? deactivateError.message
          : 'Unable to deactivate assignment.',
      );
    }
  }

  // Phase 6: substitute driver / replace bus handlers
  async function handleSubstituteDriver(assignmentId: string) {
    setWriteError(null);
    setSuccessMessage(null);
    if (!substituteDriverId) {
      setWriteError('Choose a substitute driver.');
      return;
    }
    setSubstituting(true);
    try {
      await substituteDriver(assignmentId, substituteDriverId);
      setSubstituteForId(null);
      setSubstituteDriverId('');
      setSuccessMessage(
        'Substitute driver assigned. The previous assignment was ended and audited.',
      );
      await list.reload();
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : 'Unable to assign the substitute driver.');
    } finally {
      setSubstituting(false);
    }
  }

  async function handleReplaceBus(assignmentId: string) {
    setWriteError(null);
    setSuccessMessage(null);
    if (!replacementBusId) {
      setWriteError('Choose a replacement bus.');
      return;
    }
    setReplacingBus(true);
    try {
      await replaceBus(assignmentId, replacementBusId);
      setReplacingBusForId(null);
      setReplacementBusId('');
      setSuccessMessage('Replacement bus assigned. The previous assignment was ended and audited.');
      await list.reload();
    } catch (err) {
      setWriteError(err instanceof Error ? err.message : 'Unable to assign the replacement bus.');
    } finally {
      setReplacingBus(false);
    }
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
          eyebrow="Assignments"
          title="Driver assignments"
          description="Assign drivers to buses and routes. Drivers start trips from their active assignments."
        />

        {canWrite && (
          <div className="flex">
            <Button
              type="button"
              onClick={() => {
                setShowCreateForm(true);
                setWriteError(null);
                setSuccessMessage(null);
              }}
            >
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
              tripPatterns={tripPatterns}
              profileLabels={profileLabels}
              defaultTenantId={profile?.tenant_id ?? null}
              onSubmit={handleCreate}
              onCancel={() => setShowCreateForm(false)}
            />
          </InlineFormShell>
        )}

        <div>
          <label
            className="block text-sm font-semibold text-gray-700"
            htmlFor="driver-assignment-search"
          >
            Search assignments
          </label>
          <input
            id="driver-assignment-search"
            type="search"
            value={list.searchInput}
            onChange={(event) => list.setSearchInput(event.target.value)}
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3"
            placeholder="Search route, bus, driver, trip, or status"
          />
        </div>

        {list.loading && (
          <DataState
            title="Loading assignments"
            message="Fetching driver assignments visible to you."
          />
        )}
        {list.error && <DataState title="Unable to load assignments" message={list.error} />}
        {!list.loading && !list.error && list.rows.length === 0 && (
          <DataState
            title="No assignments visible"
            message="No driver assignments are available for this account. Create one to get started."
          />
        )}

        {!list.loading && !list.error && list.rows.length > 0 && (
          <section className="grid gap-4">
            {list.rows.map((assignment) => (
              <Card key={assignment.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">
                      {assignment.route_name ??
                        routeNames.get(assignment.route_id) ??
                        'Unknown route'}
                    </h2>
                    <p className="mt-1 text-sm text-gray-600">
                      Bus{' '}
                      {assignment.bus_number ??
                        busLabels.get(assignment.bus_id) ??
                        assignment.bus_id}{' '}
                      &middot;{' '}
                      {assignment.route_trip_pattern_id
                        ? (tripNames.get(assignment.route_trip_pattern_id) ?? assignment.trip_type)
                        : assignment.trip_type}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                      Driver:{' '}
                      {assignment.driver_name ??
                        driverNames.get(assignment.driver_id) ??
                        assignment.driver_id}
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
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid={`substitute-driver-toggle-${assignment.id}`}
                          onClick={() => {
                            setSubstituteForId(
                              substituteForId === assignment.id ? null : assignment.id,
                            );
                            setSubstituteDriverId('');
                            setReplacingBusForId(null);
                          }}
                        >
                          Substitute driver
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          data-testid={`replace-bus-toggle-${assignment.id}`}
                          onClick={() => {
                            setReplacingBusForId(
                              replacingBusForId === assignment.id ? null : assignment.id,
                            );
                            setReplacementBusId('');
                            setSubstituteForId(null);
                          }}
                        >
                          Replace bus
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => void handleDeactivate(assignment.id)}
                        >
                          Deactivate
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {canWrite && substituteForId === assignment.id && (
                  <div
                    className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
                    data-testid={`substitute-driver-form-${assignment.id}`}
                  >
                    <Field label="Substitute driver" htmlFor={`substitute-${assignment.id}`}>
                      <Select
                        id={`substitute-${assignment.id}`}
                        value={substituteDriverId}
                        onChange={(e) => setSubstituteDriverId(e.target.value)}
                      >
                        <option value="">Choose a substitute driver</option>
                        {drivers
                          .filter((d) => d.id !== assignment.driver_id && d.status === 'active')
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {driverNames.get(d.profile_id) ?? d.id}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        loading={substituting}
                        onClick={() => void handleSubstituteDriver(assignment.id)}
                      >
                        Assign substitute
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setSubstituteForId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {canWrite && replacingBusForId === assignment.id && (
                  <div
                    className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
                    data-testid={`replace-bus-form-${assignment.id}`}
                  >
                    <Field label="Replacement bus" htmlFor={`replacement-bus-${assignment.id}`}>
                      <Select
                        id={`replacement-bus-${assignment.id}`}
                        value={replacementBusId}
                        onChange={(e) => setReplacementBusId(e.target.value)}
                      >
                        <option value="">Choose a replacement bus</option>
                        {buses
                          .filter((b) => b.id !== assignment.bus_id && b.status === 'active')
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.bus_number}
                            </option>
                          ))}
                      </Select>
                    </Field>
                    <div className="mt-3 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        loading={replacingBus}
                        onClick={() => void handleReplaceBus(assignment.id)}
                      >
                        Assign replacement bus
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setReplacingBusForId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
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
