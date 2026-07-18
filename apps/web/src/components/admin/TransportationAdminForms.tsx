import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { OrganizationProfile, School } from '@/types/organization';
import type { Student } from '@/types/studentGuardian';
import { StudentSearchPicker } from '@/components/admin/StudentSearchPicker';
import type {
  AssignmentStatus,
  CreateAssignmentInput,
} from '@/types/driverAssignments';
import type {
  Bus,
  BusStatus,
  CreateBusInput,
  CreateDriverInput,
  CreateRouteInput,
  CreateRouteStopInput,
  CreateStudentRouteAssignmentInput,
  Driver,
  DriverStatus,
  Route,
  RouteStatus,
  RouteStop,
  RouteStopStatus,
  RouteTripPattern,
  RouteType,
  StudentRouteAssignment,
  StudentRouteAssignmentStatus,
  UpdateBusInput,
  UpdateDriverInput,
  UpdateRouteInput,
  UpdateRouteStopInput,
  UpdateStudentRouteAssignmentInput,
} from '@/types/transportation';

type SubmitState = 'idle' | 'saving';

const fieldClassName = 'mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base';
const labelClassName = 'block text-sm font-semibold text-gray-700';
const optionalOption = <option value="">Not assigned</option>;

function cleanText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNullableNumber(value: string): number | null {
  if (value.trim() === '') return null;
  return Number(value);
}

function getSchoolTenantId(schools: School[], schoolId: string | null): string | null {
  if (!schoolId) return null;
  return schools.find((school) => school.id === schoolId)?.tenant_id ?? null;
}

function getStudentName(student: Student) {
  return student.preferred_name
    ? `${student.first_name} ${student.last_name} (${student.preferred_name})`
    : `${student.first_name} ${student.last_name}`;
}

export function InlineFormShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="border-navy-100 bg-white p-5">
      <h2 className="text-lg font-bold text-navy-900">{title}</h2>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export function AdminWriteMessage({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <Card className="border-success-100 bg-success-50 p-4">
      <p className="text-sm font-semibold text-success-700">{message}</p>
    </Card>
  );
}

export function AdminWriteError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <Card className="border-danger-100 bg-danger-50 p-4">
      <p className="text-sm font-semibold text-danger-700">{message}</p>
    </Card>
  );
}

export function BusForm({
  bus,
  schools,
  defaultTenantId,
  onSubmit,
  onCancel,
}: {
  bus: Bus | null;
  schools: School[];
  defaultTenantId: string | null;
  onSubmit: (input: CreateBusInput | UpdateBusInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [schoolId, setSchoolId] = useState(bus?.school_id ?? '');
  const [busNumber, setBusNumber] = useState(bus?.bus_number ?? '');
  const [licensePlate, setLicensePlate] = useState(bus?.license_plate ?? '');
  const [capacity, setCapacity] = useState(bus?.capacity?.toString() ?? '');
  const [status, setStatus] = useState<BusStatus>(bus?.status ?? 'active');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const tenantId = bus?.tenant_id ?? getSchoolTenantId(schools, schoolId || null) ?? defaultTenantId;
    const parsedCapacity = parseNullableNumber(capacity);

    if (!tenantId) {
      setFormError('Use an account with a tenant before saving this bus.');
      return;
    }

    if (!busNumber.trim()) {
      setFormError('Bus number is required.');
      return;
    }

    if (parsedCapacity != null && (!Number.isInteger(parsedCapacity) || parsedCapacity < 0)) {
      setFormError('Capacity must be a whole number greater than or equal to zero.');
      return;
    }

    setSubmitState('saving');
    try {
      const input = {
        tenant_id: tenantId,
        school_id: schoolId || null,
        bus_number: busNumber.trim(),
        license_plate: cleanText(licensePlate),
        capacity: parsedCapacity,
        status,
      };
      await onSubmit(
        bus
          ? {
              school_id: input.school_id,
              bus_number: input.bus_number,
              license_plate: input.license_plate,
              capacity: input.capacity,
              status: input.status,
            }
          : input,
      );
    } finally {
      setSubmitState('idle');
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      {formError && <p className="text-sm font-semibold text-danger-700">{formError}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClassName}>
          Bus number
          <input className={fieldClassName} value={busNumber} onChange={(event) => setBusNumber(event.target.value)} />
        </label>
        <label className={labelClassName}>
          License plate
          <input className={fieldClassName} value={licensePlate} onChange={(event) => setLicensePlate(event.target.value)} />
        </label>
        <label className={labelClassName}>
          Capacity
          <input className={fieldClassName} inputMode="numeric" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
        </label>
        <label className={labelClassName}>
          School (optional)
          <select className={fieldClassName} value={schoolId} onChange={(event) => setSchoolId(event.target.value)}>
            {optionalOption}
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          Status
          <select className={fieldClassName} value={status} onChange={(event) => setStatus(event.target.value as BusStatus)}>
            <option value="active">Active</option>
            <option value="maintenance">Maintenance</option>
            <option value="inactive">Inactive</option>
            <option value="retired">Retired</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={submitState === 'saving'}>{submitState === 'saving' ? 'Saving' : 'Save bus'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function DriverForm({
  driver,
  profiles,
  onSubmit,
  onCancel,
}: {
  driver: Driver | null;
  profiles: OrganizationProfile[];
  onSubmit: (input: CreateDriverInput | UpdateDriverInput) => Promise<void>;
  onCancel: () => void;
}) {
  const driverProfiles = useMemo(() => profiles.filter((profile) => profile.role === 'driver'), [profiles]);
  const [profileId, setProfileId] = useState(driver?.profile_id ?? driverProfiles[0]?.id ?? '');
  const [employeeNumber, setEmployeeNumber] = useState(driver?.employee_number ?? '');
  const [phone, setPhone] = useState(driver?.phone ?? '');
  const [status, setStatus] = useState<DriverStatus>(driver?.status ?? 'active');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  useEffect(() => {
    if (!profileId && driverProfiles[0]) setProfileId(driverProfiles[0].id);
  }, [driverProfiles, profileId]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const selectedProfile = profiles.find((profile) => profile.id === profileId);
    const tenantId = driver?.tenant_id ?? selectedProfile?.tenant_id ?? null;

    if (!profileId || !selectedProfile) {
      setFormError('Choose an existing driver profile.');
      return;
    }

    if (!tenantId) {
      setFormError('The selected driver profile must belong to a tenant.');
      return;
    }

    setSubmitState('saving');
    try {
      const input = {
        tenant_id: tenantId,
        profile_id: profileId,
        employee_number: cleanText(employeeNumber),
        phone: cleanText(phone),
        status,
      };
      await onSubmit(
        driver
          ? {
              profile_id: input.profile_id,
              employee_number: input.employee_number,
              phone: input.phone,
              status: input.status,
            }
          : input,
      );
    } finally {
      setSubmitState('idle');
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      {formError && <p className="text-sm font-semibold text-danger-700">{formError}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClassName}>
          Driver profile
          <select className={fieldClassName} value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            <option value="">Choose driver</option>
            {driverProfiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.full_name} ({profile.email})
              </option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          Employee number
          <input className={fieldClassName} value={employeeNumber} onChange={(event) => setEmployeeNumber(event.target.value)} />
        </label>
        <label className={labelClassName}>
          Phone
          <input className={fieldClassName} value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label className={labelClassName}>
          Status
          <select className={fieldClassName} value={status} onChange={(event) => setStatus(event.target.value as DriverStatus)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={submitState === 'saving'}>{submitState === 'saving' ? 'Saving' : 'Save driver'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function RouteForm({
  route,
  schools,
  defaultTenantId,
  onSubmit,
  onCancel,
}: {
  route: Route | null;
  schools: School[];
  defaultTenantId: string | null;
  onSubmit: (input: CreateRouteInput | UpdateRouteInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [schoolId, setSchoolId] = useState(route?.school_id ?? '');
  const [routeName, setRouteName] = useState(route?.route_name ?? '');
  const [routeCode, setRouteCode] = useState(route?.route_code ?? '');
  const [routeType, setRouteType] = useState<RouteType>(route?.route_type ?? 'morning');
  const [status, setStatus] = useState<RouteStatus>(route?.status ?? 'active');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    // School is optional. Derive the tenant from the existing route, the
    // selected school (if any), or the admin's default tenant id.
    const tenantId = route?.tenant_id ?? getSchoolTenantId(schools, schoolId || null) ?? defaultTenantId;

    if (!tenantId) {
      setFormError('Use an account with a tenant before saving this route.');
      return;
    }

    if (!routeName.trim() || !routeCode.trim()) {
      setFormError('Route name and route code are required.');
      return;
    }

    setSubmitState('saving');
    try {
      const input = {
        tenant_id: tenantId,
        school_id: schoolId || null,
        route_name: routeName.trim(),
        route_code: routeCode.trim(),
        route_type: routeType,
        status,
      };
      await onSubmit(
        route
          ? {
              school_id: input.school_id,
              route_name: input.route_name,
              route_code: input.route_code,
              route_type: input.route_type,
              status: input.status,
            }
          : input,
      );
    } finally {
      setSubmitState('idle');
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      {formError && <p className="text-sm font-semibold text-danger-700">{formError}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClassName}>
          Route name
          <input className={fieldClassName} value={routeName} onChange={(event) => setRouteName(event.target.value)} />
        </label>
        <label className={labelClassName}>
          Route code
          <input className={fieldClassName} value={routeCode} onChange={(event) => setRouteCode(event.target.value)} />
        </label>
        <label className={labelClassName}>
          Route type
          <select className={fieldClassName} value={routeType} onChange={(event) => setRouteType(event.target.value as RouteType)}>
            <option value="morning">Morning</option>
            <option value="afternoon">Afternoon</option>
            <option value="special">Special</option>
            <option value="field_trip">Field trip</option>
          </select>
        </label>
        <label className={labelClassName}>
          School (optional)
          <select className={fieldClassName} value={schoolId} onChange={(event) => setSchoolId(event.target.value)}>
            <option value="">No school selected</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          Status
          <select className={fieldClassName} value={status} onChange={(event) => setStatus(event.target.value as RouteStatus)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={submitState === 'saving'}>{submitState === 'saving' ? 'Saving' : 'Save route'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function RouteStopForm({
  stop,
  routes,
  onSubmit,
  onCancel,
}: {
  stop: RouteStop | null;
  routes: Route[];
  onSubmit: (input: CreateRouteStopInput | UpdateRouteStopInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [routeId, setRouteId] = useState(stop?.route_id ?? routes[0]?.id ?? '');
  const [stopName, setStopName] = useState(stop?.stop_name ?? '');
  const [stopOrder, setStopOrder] = useState(stop?.stop_order.toString() ?? '');
  const [plannedArrivalTime, setPlannedArrivalTime] = useState(stop?.planned_arrival_time?.slice(0, 5) ?? '');
  const [latitude, setLatitude] = useState(stop?.latitude?.toString() ?? '');
  const [longitude, setLongitude] = useState(stop?.longitude?.toString() ?? '');
  const [status, setStatus] = useState<RouteStopStatus>(stop?.status ?? 'active');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  useEffect(() => {
    if (!routeId && routes[0]) setRouteId(routes[0].id);
  }, [routeId, routes]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const selectedRoute = routes.find((route) => route.id === routeId);
    const parsedOrder = Number(stopOrder);
    const parsedLatitude = parseNullableNumber(latitude);
    const parsedLongitude = parseNullableNumber(longitude);

    if (!selectedRoute) {
      setFormError('Choose a route before saving this stop.');
      return;
    }

    if (!stopName.trim()) {
      setFormError('Stop name is required.');
      return;
    }

    if (!Number.isInteger(parsedOrder) || parsedOrder <= 0) {
      setFormError('Stop order must be a whole number greater than zero.');
      return;
    }

    if (parsedLatitude != null && (parsedLatitude < -90 || parsedLatitude > 90)) {
      setFormError('Latitude must be between -90 and 90.');
      return;
    }

    if (parsedLongitude != null && (parsedLongitude < -180 || parsedLongitude > 180)) {
      setFormError('Longitude must be between -180 and 180.');
      return;
    }

    setSubmitState('saving');
    try {
      const input = {
        tenant_id: selectedRoute.tenant_id,
        route_id: routeId,
        stop_name: stopName.trim(),
        stop_order: parsedOrder,
        planned_arrival_time: plannedArrivalTime || null,
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        status,
      };
      await onSubmit(
        stop
          ? {
              route_id: input.route_id,
              stop_name: input.stop_name,
              stop_order: input.stop_order,
              planned_arrival_time: input.planned_arrival_time,
              latitude: input.latitude,
              longitude: input.longitude,
              status: input.status,
            }
          : input,
      );
    } finally {
      setSubmitState('idle');
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      {formError && <p className="text-sm font-semibold text-danger-700">{formError}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClassName}>
          Route
          <select className={fieldClassName} value={routeId} onChange={(event) => setRouteId(event.target.value)}>
            <option value="">Choose route</option>
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.route_code} - {route.route_name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          Stop name
          <input className={fieldClassName} value={stopName} onChange={(event) => setStopName(event.target.value)} />
        </label>
        <label className={labelClassName}>
          Stop order
          <input className={fieldClassName} inputMode="numeric" value={stopOrder} onChange={(event) => setStopOrder(event.target.value)} />
        </label>
        <label className={labelClassName}>
          Planned arrival time
          <input className={fieldClassName} type="time" value={plannedArrivalTime} onChange={(event) => setPlannedArrivalTime(event.target.value)} />
        </label>
        <label className={labelClassName}>
          Latitude
          <input className={fieldClassName} inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} />
        </label>
        <label className={labelClassName}>
          Longitude
          <input className={fieldClassName} inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} />
        </label>
        <label className={labelClassName}>
          Status
          <select className={fieldClassName} value={status} onChange={(event) => setStatus(event.target.value as RouteStopStatus)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={submitState === 'saving'}>{submitState === 'saving' ? 'Saving' : 'Save stop'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function StudentRouteAssignmentForm({
  assignment,
  students,
  routes,
  stops,
  defaultTenantId,
  studentLabel,
  onSubmit,
  onCancel,
}: {
  assignment: StudentRouteAssignment | null;
  students: Student[];
  routes: Route[];
  stops: RouteStop[];
  defaultTenantId?: string | null;
  studentLabel?: string;
  onSubmit: (
    input: CreateStudentRouteAssignmentInput | UpdateStudentRouteAssignmentInput,
  ) => Promise<void>;
  onCancel: () => void;
}) {
  const [studentId, setStudentId] = useState(assignment?.student_id ?? students[0]?.id ?? '');
  const [routeId, setRouteId] = useState(assignment?.route_id ?? routes[0]?.id ?? '');
  const [pickupStopId, setPickupStopId] = useState(assignment?.pickup_stop_id ?? '');
  const [dropoffStopId, setDropoffStopId] = useState(assignment?.dropoff_stop_id ?? '');
  const [effectiveFrom, setEffectiveFrom] = useState(assignment?.effective_from ?? new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState(assignment?.effective_to ?? '');
  const [status, setStatus] = useState<StudentRouteAssignmentStatus>(assignment?.status ?? 'active');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  const routeStops = useMemo(
    () => stops.filter((stop) => stop.route_id === routeId && (stop.status === 'active' || stop.id === assignment?.pickup_stop_id || stop.id === assignment?.dropoff_stop_id)),
    [assignment?.dropoff_stop_id, assignment?.pickup_stop_id, routeId, stops],
  );
  const selectableStudents = useMemo(
    () => students.filter((student) => student.status === 'active' || student.id === assignment?.student_id),
    [assignment?.student_id, students],
  );
  const selectableRoutes = useMemo(
    () => routes.filter((route) => route.status === 'active' || route.id === assignment?.route_id),
    [assignment?.route_id, routes],
  );

  useEffect(() => {
    if (!studentId && students[0]) setStudentId(students[0].id);
    if (!routeId && routes[0]) setRouteId(routes[0].id);
  }, [routeId, routes, studentId, students]);

  useEffect(() => {
    if (pickupStopId && !routeStops.some((stop) => stop.id === pickupStopId)) setPickupStopId('');
    if (dropoffStopId && !routeStops.some((stop) => stop.id === dropoffStopId)) setDropoffStopId('');
  }, [dropoffStopId, pickupStopId, routeStops]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const selectedRoute = routes.find((route) => route.id === routeId);

    if (!studentId || !selectedRoute || (!defaultTenantId && !students.find((student) => student.id === studentId))) {
      setFormError('Choose a student and route before saving this assignment.');
      return;
    }

    if (!effectiveFrom) {
      setFormError('Effective from date is required.');
      return;
    }

    if (effectiveTo && effectiveTo < effectiveFrom) {
      setFormError('Effective to date must be on or after the effective from date.');
      return;
    }

    setSubmitState('saving');
    try {
      const input = {
        tenant_id: defaultTenantId ?? students.find((student) => student.id === studentId)!.tenant_id,
        student_id: studentId,
        route_id: routeId,
        pickup_stop_id: pickupStopId || null,
        dropoff_stop_id: dropoffStopId || null,
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
        status,
      };
      await onSubmit(
        assignment
          ? {
              student_id: input.student_id,
              route_id: input.route_id,
              pickup_stop_id: input.pickup_stop_id,
              dropoff_stop_id: input.dropoff_stop_id,
              effective_from: input.effective_from,
              effective_to: input.effective_to,
              status: input.status,
            }
          : input,
      );
    } finally {
      setSubmitState('idle');
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      {formError && <p className="text-sm font-semibold text-danger-700">{formError}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClassName}>
          Student
          {students.length > 0 ? (
            <select className={fieldClassName} value={studentId} onChange={(event) => setStudentId(event.target.value)}>
              <option value="">Choose student</option>
              {selectableStudents.map((student) => <option key={student.id} value={student.id}>{getStudentName(student)}</option>)}
            </select>
          ) : <StudentSearchPicker value={studentId} initialLabel={studentLabel} onChange={setStudentId} />}
        </label>
        <label className={labelClassName}>
          Route
          <select className={fieldClassName} value={routeId} onChange={(event) => setRouteId(event.target.value)}>
            <option value="">Choose route</option>
            {selectableRoutes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.route_code} - {route.route_name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          Pickup stop
          <select className={fieldClassName} value={pickupStopId} onChange={(event) => setPickupStopId(event.target.value)}>
            {optionalOption}
            {routeStops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.stop_order}. {stop.stop_name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          Dropoff stop
          <select className={fieldClassName} value={dropoffStopId} onChange={(event) => setDropoffStopId(event.target.value)}>
            {optionalOption}
            {routeStops.map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.stop_order}. {stop.stop_name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          Effective from
          <input className={fieldClassName} type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
        </label>
        <label className={labelClassName}>
          Effective to
          <input className={fieldClassName} type="date" value={effectiveTo} onChange={(event) => setEffectiveTo(event.target.value)} />
        </label>
        <label className={labelClassName}>
          Status
          <select className={fieldClassName} value={status} onChange={(event) => setStatus(event.target.value as StudentRouteAssignmentStatus)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={submitState === 'saving'}>{submitState === 'saving' ? 'Saving' : 'Save assignment'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function DriverAssignmentForm({
  drivers,
  buses,
  routes,
  tripPatterns,
  profileLabels,
  defaultTenantId,
  onSubmit,
  onCancel,
}: {
  drivers: Driver[];
  buses: Bus[];
  routes: Route[];
  tripPatterns: RouteTripPattern[];
  profileLabels: Map<string, string>;
  defaultTenantId: string | null;
  onSubmit: (input: CreateAssignmentInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [driverId, setDriverId] = useState('');
  const [busId, setBusId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [tripPatternId, setTripPatternId] = useState('');
  const [status, setStatus] = useState<AssignmentStatus>('active');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!defaultTenantId) {
      setFormError('Use an account with a tenant before saving this assignment.');
      return;
    }
    const selectedPattern = tripPatterns.find((pattern) => pattern.id === tripPatternId);
    if (!driverId || !busId || !routeId || !selectedPattern) {
      setFormError('Driver, bus, route, and named trip are required.');
      return;
    }
    if (!effectiveFrom) {
      setFormError('An effective-from date is required.');
      return;
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      setFormError('Effective-to date must be on or after effective-from date.');
      return;
    }

    setSubmitState('saving');
    try {
      await onSubmit({
        driverId,
        busId,
        routeId,
        tripPatternId,
        tripType: selectedPattern.direction === 'reverse' ? 'evening' : 'morning',
        status,
        effectiveFrom,
        effectiveTo: effectiveTo || null,
      });
    } finally {
      setSubmitState('idle');
    }
  }

  return (
    <form className="grid gap-4" onSubmit={handleSubmit}>
      {formError && <p className="text-sm font-semibold text-danger-700">{formError}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <label className={labelClassName}>
          Driver
          <select className={fieldClassName} value={driverId} onChange={(event) => setDriverId(event.target.value)}>
            <option value="">Select a driver</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {profileLabels.get(driver.profile_id) ?? driver.employee_number ?? driver.profile_id}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          Bus
          <select className={fieldClassName} value={busId} onChange={(event) => setBusId(event.target.value)}>
            <option value="">Select a bus</option>
            {buses.map((bus) => (
              <option key={bus.id} value={bus.id}>
                Bus {bus.bus_number}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          Route
          <select
            className={fieldClassName}
            value={routeId}
            onChange={(event) => {
              setRouteId(event.target.value);
              setTripPatternId('');
            }}
          >
            <option value="">Select a route</option>
            {routes.map((route) => (
              <option key={route.id} value={route.id}>
                {route.route_name} ({route.route_code})
              </option>
            ))}
          </select>
        </label>
        <label className={labelClassName}>
          Named trip
          <select className={fieldClassName} value={tripPatternId} onChange={(event) => setTripPatternId(event.target.value)}>
            <option value="">Select a trip</option>
            {tripPatterns
              .filter((pattern) => pattern.route_id === routeId && pattern.status === 'active')
              .map((pattern) => (
                <option key={pattern.id} value={pattern.id}>
                  {pattern.display_name} ({pattern.direction === 'forward' ? 'Start → End' : 'End → Start'})
                </option>
              ))}
          </select>
        </label>
        <label className={labelClassName}>
          Status
          <select className={fieldClassName} value={status} onChange={(event) => setStatus(event.target.value as AssignmentStatus)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <label className={labelClassName}>
          Effective from
          <input
            className={fieldClassName}
            type="date"
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </label>
        <label className={labelClassName}>
          Effective to
          <input
            className={fieldClassName}
            type="date"
            value={effectiveTo}
            min={effectiveFrom}
            onChange={(event) => setEffectiveTo(event.target.value)}
          />
        </label>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={submitState === 'saving'}>{submitState === 'saving' ? 'Saving' : 'Save assignment'}</Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
