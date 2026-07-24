import { useEffect, useMemo, useState } from 'react';
import { AdminPagination } from '@/components/admin/AdminPagination';
import {
  AdminWriteError,
  AdminWriteMessage,
  BusForm,
  InlineFormShell,
} from '@/components/admin/TransportationAdminForms';
import { StudentBusAssignmentForm } from '@/components/admin/StudentBusAssignmentForm';
import { BusDriverAssignmentForm } from '@/components/admin/TransportAssignmentForms';
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
import {
  getVisibleProfiles,
  getVisibleSchools,
} from '@/services/adminOrganizationService';
import {
  createDriverAssignment,
  fetchAdminAssignments,
} from '@/services/driverAssignmentService';
import {
  createStudentBusAssignment,
  fetchAdminBusServices,
  type BusServiceOption,
} from '@/services/studentBusAssignmentService';
import {
  createBus,
  deleteBus,
  getVisibleDrivers,
  getVisibleRouteStops,
  updateBus,
} from '@/services/transportationStructureService';
import type { OrganizationProfile, School } from '@/types/organization';
import type { CreateAssignmentInput, DriverRouteAssignment } from '@/types/driverAssignments';
import type {
  Bus,
  BusStatus,
  CreateBusInput,
  CreateStudentBusAssignmentInput,
  Driver,
  RouteStop,
  UpdateBusInput,
} from '@/types/transportation';
import { activeDriverForBusService } from '@/utils/transportAssignments';

const busStatusTone: Record<BusStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  maintenance: 'warning',
  inactive: 'neutral',
  retired: 'danger',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export function AdminBusesPage() {
  const { profile } = useAuth();
  const list = usePaginatedAdminList<Bus & { school_name: string | null }>('buses');
  const [schools, setSchools] = useState<School[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [profiles, setProfiles] = useState<OrganizationProfile[]>([]);
  const [busServices, setBusServices] = useState<BusServiceOption[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStop[]>([]);
  const [driverAssignments, setDriverAssignments] = useState<DriverRouteAssignment[]>([]);
  const [editingBus, setEditingBus] = useState<Bus | null>(null);
  const [assigningDriverBus, setAssigningDriverBus] = useState<Bus | null>(null);
  const [assigningStudentBus, setAssigningStudentBus] = useState<Bus | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deletingBus, setDeletingBus] = useState<Bus | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);
  const canAssignDriver = profile?.role === 'tenant_admin';
  const canDelete =
    !!profile && (profile.role === 'tenant_admin' || profile.role === 'platform_super_admin');

  async function loadAssignmentData() {
    const [schoolResult, driverResult, profileResult, serviceResult, assignmentResult, stopsResult] =
      await Promise.allSettled([
        getVisibleSchools(),
        getVisibleDrivers(),
        getVisibleProfiles(),
        fetchAdminBusServices(),
        fetchAdminAssignments(),
        getVisibleRouteStops(),
      ]);
    setSchools(schoolResult.status === 'fulfilled' ? schoolResult.value : []);
    setDrivers(driverResult.status === 'fulfilled' ? driverResult.value : []);
    setProfiles(profileResult.status === 'fulfilled' ? profileResult.value : []);
    setBusServices(serviceResult.status === 'fulfilled' ? serviceResult.value : []);
    setDriverAssignments(
      assignmentResult.status === 'fulfilled' ? assignmentResult.value : [],
    );
    setRouteStops(stopsResult.status === 'fulfilled' ? stopsResult.value : []);
  }

  useEffect(() => {
    void loadAssignmentData();
  }, []);

  const schoolNames = useMemo(() => {
    return new Map(schools.map((school) => [school.id, school.name]));
  }, [schools]);

  const profileLabels = useMemo(
    () => new Map(profiles.map((item) => [item.id, item.full_name])),
    [profiles],
  );

  async function handleCreateBus(input: CreateBusInput | UpdateBusInput) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await createBus(input as CreateBusInput);
      setShowCreateForm(false);
      setSuccessMessage('Bus created.');
      await list.reload();
    } catch (createError) {
      setWriteError(createError instanceof Error ? createError.message : 'Unable to create bus.');
      throw createError;
    }
  }

  async function handleUpdateBus(input: CreateBusInput | UpdateBusInput) {
    if (!editingBus) return;
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await updateBus(editingBus.id, input as UpdateBusInput);
      setEditingBus(null);
      setSuccessMessage('Bus updated.');
      await list.reload();
    } catch (updateError) {
      setWriteError(updateError instanceof Error ? updateError.message : 'Unable to update bus.');
      throw updateError;
    }
  }

  async function handleDeleteBus() {
    if (!deletingBus || deleting) return;
    setDeleting(true);
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await deleteBus(deletingBus.id);
      setDeletingBus(null);
      setSuccessMessage('Bus deleted.');
      await list.reload();
    } catch (deleteError) {
      setWriteError(deleteError instanceof Error ? deleteError.message : 'Unable to delete bus.');
    } finally {
      setDeleting(false);
    }
  }

  async function handleAssignDriver(input: CreateAssignmentInput) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await createDriverAssignment(input, profile?.tenant_id ?? null);
      setAssigningDriverBus(null);
      setSuccessMessage('Driver assigned to the bus trip.');
      await loadAssignmentData();
      await list.reload();
    } catch (assignError) {
      const message =
        assignError instanceof Error
          ? assignError.message
          : 'Unable to assign this driver.';
      setWriteError(message);
      throw assignError;
    }
  }

  async function handleAssignStudent(input: CreateStudentBusAssignmentInput) {
    setWriteError(null);
    setSuccessMessage(null);
    try {
      await createStudentBusAssignment(input);
      setAssigningStudentBus(null);
      setSuccessMessage('Student assigned to the bus service.');
      await loadAssignmentData();
      await list.reload();
    } catch (assignError) {
      const message =
        assignError instanceof Error
          ? assignError.message
          : 'Unable to assign this student to the bus.';
      setWriteError(message);
      throw assignError;
    }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Buses"
          title="Visible buses"
          description="Manage fleet records and assign drivers to each bus's active route trips."
        />

        {canWrite && (
          <div className="flex">
            <Button type="button" onClick={() => {
              setEditingBus(null);
              setShowCreateForm(true);
              setWriteError(null);
              setSuccessMessage(null);
            }}>
              Add bus
            </Button>
          </div>
        )}

        <AdminWriteMessage message={successMessage} />
        <AdminWriteError message={writeError} />

        {canAssignDriver && assigningDriverBus && (
          <InlineFormShell title={`Assign driver to Bus ${assigningDriverBus.bus_number}`}>
            <BusDriverAssignmentForm
              bus={assigningDriverBus}
              services={busServices.filter(
                (service) =>
                  service.bus_id === assigningDriverBus.id &&
                  service.status === 'active',
              )}
              drivers={drivers}
              profileLabels={profileLabels}
              onSubmit={handleAssignDriver}
              onCancel={() => setAssigningDriverBus(null)}
            />
          </InlineFormShell>
        )}


        {canWrite && assigningStudentBus && (
          <InlineFormShell title={`Assign student to Bus ${assigningStudentBus.bus_number}`}>
            <StudentBusAssignmentForm
              assignment={null}
              services={busServices.filter(
                (service) =>
                  service.bus_id === assigningStudentBus.id &&
                  service.status === 'active',
              )}
              stops={routeStops}
              defaultTenantId={profile?.tenant_id ?? null}
              onSubmit={(input) => handleAssignStudent(input as CreateStudentBusAssignmentInput)}
              onCancel={() => setAssigningStudentBus(null)}
            />
          </InlineFormShell>
        )}

        {canWrite && showCreateForm && (
          <InlineFormShell title="Add bus">
            <BusForm
              bus={null}
              schools={schools}
              defaultTenantId={profile?.tenant_id ?? null}
              onSubmit={handleCreateBus}
              onCancel={() => setShowCreateForm(false)}
            />
          </InlineFormShell>
        )}

        {canWrite && editingBus && (
          <InlineFormShell title={`Edit bus ${editingBus.bus_number}`}>
            <BusForm
              bus={editingBus}
              schools={schools}
              defaultTenantId={profile?.tenant_id ?? null}
              onSubmit={handleUpdateBus}
              onCancel={() => setEditingBus(null)}
            />
          </InlineFormShell>
        )}

        <div>
          <label className="block text-sm font-semibold text-gray-700" htmlFor="bus-search">
            Search buses
          </label>
          <input
            id="bus-search"
            type="search"
            value={list.searchInput}
            onChange={(event) => list.setSearchInput(event.target.value)}
            placeholder="Search by bus number, plate, status, capacity, or school"
            className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          />
        </div>

        {list.loading && (
          <DataState title="Loading buses" message="Fetching bus records visible to you." />
        )}
        {list.error && <DataState title="Unable to load buses" message={list.error} />}
        {!list.loading && !list.error && list.rows.length === 0 && (
          <DataState
            title="No buses visible"
            message="No bus records are available for this account under the current RLS policies."
          />
        )}
        {!list.loading && !list.error && list.rows.length > 0 && (
          <section className="grid gap-4">
            {list.rows.map((bus) => (
              <Card key={bus.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-navy-900">Bus {bus.bus_number}</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {bus.school_id
                        ? (bus.school_name ?? schoolNames.get(bus.school_id) ?? bus.school_id)
                        : 'No school assigned'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill tone={busStatusTone[bus.status]}>{bus.status}</StatusPill>
                    {canWrite && (
                      <>
                        {canAssignDriver && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setShowCreateForm(false);
                              setEditingBus(null);
                              setAssigningStudentBus(null);
                              setAssigningDriverBus(bus);
                              setWriteError(null);
                              setSuccessMessage(null);
                            }}
                            disabled={
                              !busServices.some(
                                (service) =>
                                  service.bus_id === bus.id &&
                                  service.status === 'active',
                              )
                            }
                          >
                            Assign driver
                          </Button>
                        )}

                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setShowCreateForm(false);
                              setEditingBus(null);
                              setAssigningDriverBus(null);
                              setAssigningStudentBus(bus);
                              setWriteError(null);
                              setSuccessMessage(null);
                            }}
                            disabled={
                              !busServices.some(
                                (service) =>
                                  service.bus_id === bus.id &&
                                  service.status === 'active',
                              )
                            }
                          >
                            Assign student
                          </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => {
                          setShowCreateForm(false);
                          setAssigningDriverBus(null);
                          setAssigningStudentBus(null);
                          setEditingBus(bus);
                          setWriteError(null);
                          setSuccessMessage(null);
                        }}>
                          Edit
                        </Button>
                      </>
                    )}
                    {canDelete && (
                      <Button
                        type="button"
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setEditingBus(null);
                          setShowCreateForm(false);
                          setDeletingBus(bus);
                          setWriteError(null);
                          setSuccessMessage(null);
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
                  <p className="text-gray-600">
                    License plate:{' '}
                    <span className="font-semibold text-navy-900">
                      {bus.license_plate ?? 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Capacity:{' '}
                    <span className="font-semibold text-navy-900">
                      {bus.capacity ?? 'Not assigned'}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Created:{' '}
                    <span className="font-semibold text-navy-900">
                      {formatDate(bus.created_at)}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    Bus id: <span className="font-semibold text-navy-900">{bus.id}</span>
                  </p>
                </div>
                <div className="mt-5 border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-bold text-navy-900">
                    Route trips and drivers
                  </h3>
                  {busServices.filter(
                    (service) =>
                      service.bus_id === bus.id && service.status === 'active',
                  ).length === 0 ? (
                    <p className="mt-2 text-sm text-gray-600">
                      Assign this bus from the Routes page before assigning a driver.
                    </p>
                  ) : (
                    <ul className="mt-3 grid gap-2 md:grid-cols-2">
                      {busServices
                        .filter(
                          (service) =>
                            service.bus_id === bus.id &&
                            service.status === 'active',
                        )
                        .map((service) => {
                          const assignment = activeDriverForBusService(
                            service,
                            driverAssignments,
                          );
                          const driver = drivers.find(
                            (item) => item.id === assignment?.driver_id,
                          );
                          return (
                            <li
                              key={service.id}
                              className="rounded-lg bg-gray-50 p-3"
                            >
                              <p className="font-semibold text-navy-900">
                                {service.route_code} · {service.trip_name}
                              </p>
                              <p className="mt-1 text-gray-600">
                                Driver:{' '}
                                <span className="font-semibold text-navy-900">
                                  {profileLabels.get(driver?.profile_id ?? '') ??
                                    'Not assigned'}
                                </span>
                              </p>
                            </li>
                          );
                        })}
                    </ul>
                  )}
                </div>
              </Card>
            ))}
            <AdminPagination page={list.page} pageSize={list.pageSize} totalCount={list.totalCount} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
          </section>
        )}
        <ConfirmDialog
          open={!!deletingBus}
          title={`Delete bus ${deletingBus?.bus_number ?? ''}`}
          description="This permanently deletes the bus record. This action cannot be undone."
          confirmLabel="Delete bus"
          destructive
          busy={deleting}
          onConfirm={() => void handleDeleteBus()}
          onCancel={() => setDeletingBus(null)}
        />
      </div>
    </DashboardLayout>
  );
}
