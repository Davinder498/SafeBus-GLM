import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  BusFront,
  CalendarDays,
  IdCard,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Power,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { DriverPlannedBusAssignmentForm } from '@/components/admin/BusWorkspaceForms';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { OperationalNotesPanel } from '@/components/admin/OperationalNotesPanel';
import { InlineFormShell } from '@/components/admin/TransportationAdminForms';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/contexts/useAuth';
import {
  fetchAdminDriverDetail,
  revokeDriverTrackingDevices,
  type AdminDriverDetail,
} from '@/services/adminPeopleService';
import {
  fetchAdminPlannedDriverAssignments,
  setPlannedDriverAssignment,
} from '@/services/driverAssignmentService';
import {
  fetchAdminBusServices,
  type BusServiceOption,
} from '@/services/studentBusAssignmentService';
import {
  deleteDriver,
  DuplicateIdentifierError,
  updateDriver,
  type DuplicateField,
} from '@/services/transportationStructureService';
import type {
  PlannedDriverAssignment,
  SetPlannedDriverAssignmentInput,
} from '@/types/driverAssignments';
import { busWorkspaceLifecycle } from '@/utils/busWorkspace';

type DriverDetailFieldErrors = Partial<
  Record<Extract<DuplicateField, 'phone' | 'licenseNumber'>, string>
>;

type DriverFormState = {
  phone: string;
  licenseNumber: string;
  licenseIssueDate: string;
  licenseExpiryDate: string;
  licenseClass: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
};

function displayName(detail: AdminDriverDetail) {
  return (
    `${detail.profile.first_name ?? ''} ${detail.profile.last_name ?? ''}`.trim() ||
    detail.profile.full_name
  );
}

function toForm(detail: AdminDriverDetail): DriverFormState {
  const { driver } = detail;
  return {
    phone: driver.phone ?? '',
    licenseNumber: driver.license_number ?? '',
    licenseIssueDate: driver.license_issue_date ?? '',
    licenseExpiryDate: driver.license_expiry_date ?? '',
    licenseClass: driver.license_class ?? '5',
    addressLine1: driver.address_line1 ?? '',
    addressLine2: driver.address_line2 ?? '',
    city: driver.city ?? '',
    province: driver.province ?? 'AB',
    postalCode: driver.postal_code ?? '',
  };
}

function formatDate(value: string | null) {
  if (!value) return 'Not provided';
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function normalizePostalCode(value: string) {
  const compact = value.toUpperCase().replace(/\s+/g, '');
  return compact.length === 6
    ? `${compact.slice(0, 3)} ${compact.slice(3)}`
    : value.trim().toUpperCase();
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-navy-900">{value}</dd>
    </div>
  );
}

export function AdminDriverDetailPage() {
  const { driverId } = useParams<{ driverId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [detail, setDetail] = useState<AdminDriverDetail | null>(null);
  const [form, setForm] = useState<DriverFormState | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<DriverDetailFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRevokeDevices, setConfirmRevokeDevices] = useState(false);
  const [plannedAssignments, setPlannedAssignments] = useState<PlannedDriverAssignment[]>([]);
  const [busServices, setBusServices] = useState<BusServiceOption[]>([]);
  const [assignmentForm, setAssignmentForm] = useState<PlannedDriverAssignment | null | undefined>(
    undefined,
  );
  const canWrite = profile?.role === 'tenant_admin';

  const load = useCallback(async () => {
    if (!driverId) {
      setLoadError('This driver is not available.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [next, nextAssignments, nextServices] = await Promise.all([
        fetchAdminDriverDetail(driverId),
        fetchAdminPlannedDriverAssignments(driverId),
        canWrite ? fetchAdminBusServices() : Promise.resolve([]),
      ]);
      setDetail(next);
      setForm(toForm(next));
      setPlannedAssignments(nextAssignments);
      setBusServices(nextServices);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load this driver.');
    } finally {
      setLoading(false);
    }
  }, [canWrite, driverId]);

  async function savePlannedAssignment(input: SetPlannedDriverAssignmentInput) {
    if (!driverId) return;
    setWriteError(null);
    setMessage(null);
    await setPlannedDriverAssignment(input);
    const [nextAssignments, nextServices] = await Promise.all([
      fetchAdminPlannedDriverAssignments(driverId),
      fetchAdminBusServices(),
    ]);
    setPlannedAssignments(nextAssignments);
    setBusServices(nextServices);
    setAssignmentForm(undefined);
    setMessage(
      input.existingAssignmentId
        ? 'Planned bus assignment updated. Earlier planning remains in history.'
        : 'Planned bus assignment added.',
    );
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!driverId || !form || busy) return;
    if (form.licenseExpiryDate < form.licenseIssueDate) {
      setWriteError('Licence expiry date must be on or after the issue date.');
      return;
    }
    if (!/^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i.test(form.postalCode.trim())) {
      setWriteError('Enter a valid Canadian postal code.');
      return;
    }
    setBusy(true);
    setWriteError(null);
    setFieldErrors({});
    setMessage(null);
    try {
      await updateDriver(driverId, {
        phone: form.phone.trim(),
        license_number: form.licenseNumber.trim().toUpperCase(),
        license_issue_date: form.licenseIssueDate,
        license_expiry_date: form.licenseExpiryDate,
        license_class: form.licenseClass,
        address_line1: form.addressLine1.trim(),
        address_line2: form.addressLine2.trim() || null,
        city: form.city.trim(),
        province: form.province.trim().toUpperCase(),
        postal_code: normalizePostalCode(form.postalCode),
      });
      setEditing(false);
      setMessage('Driver licence and contact details updated.');
      await load();
    } catch (error) {
      if (
        error instanceof DuplicateIdentifierError &&
        ['phone', 'licenseNumber'].includes(error.field)
      ) {
        setFieldErrors({ [error.field]: error.message });
        setWriteError(null);
      } else {
        setWriteError(error instanceof Error ? error.message : 'Unable to update the driver.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleAccess() {
    if (!driverId || !detail || busy) return;
    setBusy(true);
    setWriteError(null);
    setFieldErrors({});
    setMessage(null);
    try {
      const nextStatus = detail.driver.status === 'active' ? 'inactive' : 'active';
      await updateDriver(driverId, { status: nextStatus });
      setMessage(
        nextStatus === 'active'
          ? 'Driver returned to the active operations roster.'
          : 'Driver removed from the active operations roster.',
      );
      await load();
    } catch (error) {
      setWriteError(
        error instanceof Error ? error.message : 'Unable to update driver availability.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeDriver() {
    if (!driverId || busy) return;
    setBusy(true);
    setWriteError(null);
    setFieldErrors({});
    try {
      await deleteDriver(driverId);
      navigate('/admin/drivers', { replace: true });
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : 'Unable to delete the driver.');
      setConfirmDelete(false);
      setBusy(false);
    }
  }

  async function revokeTrackingDevices() {
    if (!detail || busy) return;
    setBusy(true);
    setWriteError(null);
    setMessage(null);
    try {
      const revoked = await revokeDriverTrackingDevices(detail.profile.id);
      setConfirmRevokeDevices(false);
      setMessage(
        revoked === 1
          ? 'One driver phone tracking credential and all SafeBus sessions were revoked.'
          : `${revoked} driver phone tracking credentials and all SafeBus sessions were revoked.`,
      );
    } catch (error) {
      setWriteError(
        error instanceof Error ? error.message : 'Unable to revoke driver phone tracking.',
      );
    } finally {
      setBusy(false);
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
        <Link
          to="/admin/drivers"
          className="inline-flex items-center gap-2 text-sm font-semibold text-navy-700 hover:text-navy-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to drivers
        </Link>
        {loading && (
          <DataState
            title="Loading driver"
            message="Fetching driver account and licence details."
          />
        )}
        {loadError && <DataState title="Unable to load driver" message={loadError} />}
        {!loading && detail && form && (
          <>
            <PageHeader
              eyebrow="Driver details"
              title={displayName(detail)}
              description="Contact, licence, address, and operational availability are managed here."
              action={
                canWrite ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setEditing((value) => !value)}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                      {editing ? 'Close edit' : 'Edit details'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void toggleAccess()}
                    >
                      <Power className="h-4 w-4" aria-hidden />
                      {detail.driver.status === 'active'
                        ? 'Remove from roster'
                        : 'Return to roster'}
                    </Button>
                    <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Delete driver
                    </Button>
                  </div>
                ) : undefined
              }
            />
            {writeError && (
              <Card className="border-danger-200 bg-danger-50 p-4" role="alert">
                <p className="text-sm font-semibold text-danger-700">{writeError}</p>
              </Card>
            )}
            {message && (
              <Card className="border-success-200 bg-success-50 p-4" role="status">
                <p className="text-sm font-semibold text-success-700">{message}</p>
              </Card>
            )}

            {editing && (
              <Card className="p-5">
                <h2 className="font-bold text-navy-900">Edit driver details</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Identity and login email are controlled by the secure account workflow.
                </p>
                <form className="mt-5 space-y-5" onSubmit={(event) => void save(event)}>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Field
                      label="Phone number"
                      htmlFor="edit-driver-phone"
                      required
                      error={fieldErrors.phone}
                    >
                      <Input
                        id="edit-driver-phone"
                        type="tel"
                        maxLength={40}
                        required
                        invalid={!!fieldErrors.phone}
                        value={form.phone}
                        onChange={(event) => {
                          setForm({ ...form, phone: event.target.value });
                          setFieldErrors((current) => ({ ...current, phone: undefined }));
                        }}
                      />
                    </Field>
                    <Field
                      label="Licence number"
                      htmlFor="edit-driver-licence"
                      required
                      error={fieldErrors.licenseNumber}
                    >
                      <Input
                        id="edit-driver-licence"
                        maxLength={64}
                        required
                        invalid={!!fieldErrors.licenseNumber}
                        value={form.licenseNumber}
                        onChange={(event) => {
                          setForm({ ...form, licenseNumber: event.target.value });
                          setFieldErrors((current) => ({ ...current, licenseNumber: undefined }));
                        }}
                      />
                    </Field>
                    <Field label="Issue date" htmlFor="edit-driver-issue" required>
                      <Input
                        id="edit-driver-issue"
                        type="date"
                        required
                        value={form.licenseIssueDate}
                        onChange={(event) =>
                          setForm({ ...form, licenseIssueDate: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Expiry date" htmlFor="edit-driver-expiry" required>
                      <Input
                        id="edit-driver-expiry"
                        type="date"
                        min={form.licenseIssueDate || undefined}
                        required
                        value={form.licenseExpiryDate}
                        onChange={(event) =>
                          setForm({ ...form, licenseExpiryDate: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Licence class" htmlFor="edit-driver-class" required>
                      <Select
                        id="edit-driver-class"
                        value={form.licenseClass}
                        onChange={(event) => setForm({ ...form, licenseClass: event.target.value })}
                      >
                        {['1', '2', '3', '4', '5', '6', '7'].map((value) => (
                          <option key={value} value={value}>
                            Class {value}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field
                      label="Address line 1"
                      htmlFor="edit-driver-address-1"
                      required
                      className="lg:col-span-2"
                    >
                      <Input
                        id="edit-driver-address-1"
                        maxLength={160}
                        required
                        value={form.addressLine1}
                        onChange={(event) => setForm({ ...form, addressLine1: event.target.value })}
                      />
                    </Field>
                    <Field label="Address line 2" htmlFor="edit-driver-address-2" hint="Optional">
                      <Input
                        id="edit-driver-address-2"
                        maxLength={160}
                        value={form.addressLine2}
                        onChange={(event) => setForm({ ...form, addressLine2: event.target.value })}
                      />
                    </Field>
                    <Field label="City" htmlFor="edit-driver-city" required>
                      <Input
                        id="edit-driver-city"
                        maxLength={100}
                        required
                        value={form.city}
                        onChange={(event) => setForm({ ...form, city: event.target.value })}
                      />
                    </Field>
                    <Field label="Province" htmlFor="edit-driver-province" required>
                      <Input
                        id="edit-driver-province"
                        maxLength={2}
                        required
                        value={form.province}
                        onChange={(event) =>
                          setForm({ ...form, province: event.target.value.toUpperCase() })
                        }
                      />
                    </Field>
                    <Field label="Postal code" htmlFor="edit-driver-postal" required>
                      <Input
                        id="edit-driver-postal"
                        maxLength={7}
                        required
                        value={form.postalCode}
                        onChange={(event) =>
                          setForm({ ...form, postalCode: event.target.value.toUpperCase() })
                        }
                      />
                    </Field>
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" loading={busy}>
                      Save changes
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setForm(toForm(detail));
                        setEditing(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </Card>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-navy-50 text-navy-700">
                    <UserRound className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <h2 className="font-bold text-navy-900">Account and contact</h2>
                    <p className="text-sm text-slate-600">Login and operational contact details.</p>
                  </div>
                </div>
                <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                  <DetailItem
                    label="First name"
                    value={detail.profile.first_name ?? detail.profile.full_name}
                  />
                  <DetailItem
                    label="Last name"
                    value={detail.profile.last_name ?? 'Not separated'}
                  />
                  <DetailItem label="Email login" value={detail.profile.email} />
                  <DetailItem label="Phone" value={detail.driver.phone ?? 'Not provided'} />
                </dl>
                <div className="mt-5 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-success-600" aria-hidden />
                  <StatusPill
                    tone={
                      detail.profile.status === 'active'
                        ? 'success'
                        : detail.profile.status === 'invited'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {detail.profile.status === 'active'
                      ? 'Account activated'
                      : detail.profile.status === 'invited'
                        ? 'Invitation pending'
                        : 'Account unavailable'}
                  </StatusPill>
                </div>
              </Card>
              <Card className="p-5">
                <div className="flex items-center gap-3">
                  <IdCard className="h-5 w-5 text-navy-700" aria-hidden />
                  <h2 className="font-bold text-navy-900">Driver licence</h2>
                </div>
                <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                  <DetailItem
                    label="Licence number"
                    value={detail.driver.license_number ?? 'Not provided'}
                  />
                  <DetailItem
                    label="Class"
                    value={
                      detail.driver.license_class
                        ? `Class ${detail.driver.license_class}`
                        : 'Not provided'
                    }
                  />
                  <DetailItem
                    label="Issue date"
                    value={formatDate(detail.driver.license_issue_date)}
                  />
                  <DetailItem
                    label="Expiry date"
                    value={formatDate(detail.driver.license_expiry_date)}
                  />
                </dl>
                <p className="mt-5 flex items-center gap-2 text-xs text-slate-500">
                  <CalendarDays className="h-4 w-4" aria-hidden />
                  Licence readiness appears on the roster without exposing the licence number.
                </p>
              </Card>
            </div>
            <Card className="p-5" data-testid="driver-planned-assignments">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 gap-3">
                  <BusFront className="mt-0.5 h-5 w-5 shrink-0 text-navy-700" aria-hidden />
                  <div>
                    <h2 className="font-bold text-navy-900">Planned bus assignments</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Administrative guidance for the driver. Scanning the bus QR confirms the bus
                      and route actually operated.
                    </p>
                  </div>
                </div>
                {canWrite && detail.driver.status === 'active' && (
                  <Button
                    type="button"
                    size="sm"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => setAssignmentForm(null)}
                  >
                    Assign planned bus
                  </Button>
                )}
              </div>

              {assignmentForm !== undefined && (
                <div className="mt-5">
                  <InlineFormShell
                    title={assignmentForm ? 'Edit planned bus assignment' : 'Assign planned bus'}
                  >
                    <DriverPlannedBusAssignmentForm
                      key={assignmentForm?.id ?? 'new-planned-assignment'}
                      driverId={detail.driver.id}
                      assignment={assignmentForm}
                      services={busServices}
                      onSubmit={savePlannedAssignment}
                      onCancel={() => setAssignmentForm(undefined)}
                    />
                  </InlineFormShell>
                </div>
              )}

              {plannedAssignments.length === 0 ? (
                <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">
                  No planned bus assignments yet.
                </div>
              ) : (
                <div className="mt-5 space-y-6">
                  {(['current', 'upcoming', 'history'] as const).map((bucket) => {
                    const items = plannedAssignments.filter(
                      (assignment) => busWorkspaceLifecycle(assignment) === bucket,
                    );
                    if (items.length === 0) return null;
                    return (
                      <section key={bucket} aria-label={`${bucket} planned assignments`}>
                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                          {bucket === 'current'
                            ? 'Current plan'
                            : bucket === 'upcoming'
                              ? 'Upcoming plan'
                              : 'Planning history'}
                        </h3>
                        <div className="mt-2 grid gap-3 lg:grid-cols-2">
                          {items.map((assignment) => (
                            <div
                              key={assignment.id}
                              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-bold text-navy-900">
                                    Bus {assignment.bus_number}
                                  </p>
                                  <p className="mt-1 text-sm text-slate-600">
                                    Plate {assignment.license_plate ?? 'not recorded'}
                                  </p>
                                </div>
                                <StatusPill
                                  tone={
                                    bucket === 'current'
                                      ? 'success'
                                      : bucket === 'upcoming'
                                        ? 'info'
                                        : 'neutral'
                                  }
                                >
                                  {bucket}
                                </StatusPill>
                              </div>
                              <p className="mt-3 text-sm font-semibold text-slate-800">
                                {assignment.route_code} · {assignment.route_name}
                              </p>
                              <p className="mt-1 text-sm text-slate-600">
                                {assignment.trip_name} ·{' '}
                                {assignment.direction === 'forward' ? 'Outbound' : 'Return'}
                              </p>
                              <p className="mt-2 text-sm text-slate-600">
                                {assignment.effective_from
                                  ? formatDate(assignment.effective_from)
                                  : 'No start date'}{' '}
                                –{' '}
                                {assignment.effective_to
                                  ? formatDate(assignment.effective_to)
                                  : 'Open ended'}
                              </p>
                              <div className="mt-4 flex flex-wrap gap-2">
                                {canWrite && bucket !== 'history' && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setAssignmentForm(assignment)}
                                  >
                                    Edit planned assignment
                                  </Button>
                                )}
                                {assignment.bus_route_assignment_id && (
                                  <Link
                                    to={`/admin/buses/${assignment.bus_id}?tab=drivers&service=${assignment.bus_route_assignment_id}`}
                                    className="inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold text-navy-700 hover:bg-navy-50"
                                  >
                                    Open bus workspace
                                  </Link>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </Card>
            <Card className="border-warning-200 bg-warning-50 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 gap-3">
                  <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-warning-700" aria-hidden />
                  <div>
                    <h2 className="font-bold text-navy-900">Personal phone tracking access</h2>
                    <p className="mt-1 text-sm leading-6 text-gray-700">
                      Revoke SafeBus tracking credentials and signed-in sessions immediately when
                      this driver's phone is lost, stolen, replaced, or compromised. This does not
                      inspect or erase any personal content on the phone.
                    </p>
                  </div>
                </div>
                {canWrite && (
                  <Button
                    type="button"
                    variant="secondary"
                    className="shrink-0 whitespace-nowrap"
                    disabled={busy}
                    onClick={() => setConfirmRevokeDevices(true)}
                    data-testid="admin-revoke-driver-tracking-devices"
                  >
                    Revoke phone tracking
                  </Button>
                )}
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-navy-700" aria-hidden />
                <h2 className="font-bold text-navy-900">Mailing address</h2>
              </div>
              <p className="mt-4 text-sm font-semibold leading-6 text-navy-900">
                {detail.driver.address_line1 ?? 'Not provided'}
                {detail.driver.address_line2 ? (
                  <>
                    <br />
                    {detail.driver.address_line2}
                  </>
                ) : null}
                <br />
                {[detail.driver.city, detail.driver.province, detail.driver.postal_code]
                  .filter(Boolean)
                  .join(', ') || 'Location not provided'}
              </p>
              <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <Mail className="h-4 w-4" aria-hidden />
                Visible only to authorized staff under tenant-scoped RLS.
              </p>
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <Phone className="h-4 w-4" aria-hidden />
                Driver home address is never shown on the roster.
              </p>
            </Card>
            <OperationalNotesPanel targetEntity="driver" targetId={detail.driver.id} />
          </>
        )}
        <ConfirmDialog
          open={confirmRevokeDevices}
          title={`Revoke phone tracking for ${detail ? displayName(detail) : 'this driver'}?`}
          description="All active SafeBus tracking credentials and signed-in sessions for this driver will stop working. The driver must sign in again and acknowledge the current location notice to register an eligible phone."
          confirmLabel="Revoke tracking"
          destructive
          busy={busy}
          onConfirm={() => void revokeTrackingDevices()}
          onCancel={() => setConfirmRevokeDevices(false)}
        />
        <ConfirmDialog
          open={confirmDelete}
          title={`Delete ${detail ? displayName(detail) : 'driver'}?`}
          description="This permanently deletes the driver record and its route assignments. The authentication account is retained for audit and must be handled separately."
          confirmLabel="Delete driver"
          destructive
          busy={busy}
          onConfirm={() => void removeDriver()}
          onCancel={() => setConfirmDelete(false)}
        />
      </div>
    </DashboardLayout>
  );
}
