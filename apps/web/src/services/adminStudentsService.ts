import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { Guardian, Student, StudentGuardian, StudentStatus } from '@/types/studentGuardian';
import type {
  Bus,
  BusRouteAssignment,
  Route,
  RouteStop,
  StudentBusAssignment,
} from '@/types/transportation';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

const studentColumns =
  'id, tenant_id, school_id, first_name, last_name, preferred_name, grade, status, created_at, updated_at';

function logDevError(context: string, error: unknown) {
  if (import.meta.env.DEV) {
    console.error(context, error);
  }
}

export interface CreateStudentInput {
  firstName: string;
  lastName: string;
  preferredName: string | null;
  grade: string | null;
  schoolId: string | null;
}

export interface UpdateStudentInput {
  firstName?: string;
  lastName?: string;
  preferredName?: string | null;
  grade?: string | null;
  schoolId?: string | null;
}

export interface AdminStudentDetail {
  student: Student;
  schoolName: string | null;
  busAssignment: StudentBusAssignment | null;
  busService: BusRouteAssignment | null;
  bus: Bus | null;
  route: Route | null;
  pickupStop: RouteStop | null;
  dropoffStop: RouteStop | null;
  guardians: Guardian[];
  guardianLinks: Array<StudentGuardian & { guardian: Guardian; profileStatus: string | null }>;
}

function cleanText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Fetch all students visible to the current admin (RLS-scoped to their tenant).
 */
export async function fetchAdminStudents(): Promise<Student[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('students')
    .select(studentColumns)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (error) {
    logDevError('Failed to load admin students', error);
    throw new Error('Unable to load students.');
  }
  return (data ?? []) as Student[];
}

/**
 * Load one student and only the records directly attached to that student.
 * Every query remains RLS-scoped; the client never downloads a tenant-wide
 * guardian, route, stop, or bus list for the detail view.
 */
export async function fetchAdminStudentDetail(studentId: string): Promise<AdminStudentDetail> {
  const client = requireSupabase();
  const { data: studentData, error: studentError } = await client
    .from('students')
    .select(studentColumns)
    .eq('id', studentId)
    .maybeSingle();

  if (studentError) {
    logDevError('Failed to load admin student detail', studentError);
    throw new Error('Unable to load this student.');
  }
  if (!studentData) throw new Error('This student is not available.');

  const student = studentData as Student;
  const [schoolResult, assignmentResult, guardianLinksResult] = await Promise.all([
    student.school_id
      ? client.from('schools').select('name').eq('id', student.school_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    client
      .from('student_bus_assignments')
      .select(
        'id, tenant_id, student_id, bus_route_assignment_id, pickup_stop_id, dropoff_stop_id, effective_from, effective_to, status, created_at, updated_at',
      )
      .eq('student_id', student.id)
      .eq('status', 'active')
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from('student_guardians')
      .select('id, tenant_id, student_id, guardian_id, relationship, can_receive_notifications, status, admin_note, status_comment, created_at, updated_at')
      .eq('student_id', student.id),
  ]);

  if (schoolResult.error || assignmentResult.error || guardianLinksResult.error) {
    throw new Error('Some student details could not be loaded.');
  }

  const busAssignment = (assignmentResult.data as StudentBusAssignment | null) ?? null;
  let busService: BusRouteAssignment | null = null;
  let bus: Bus | null = null;
  let route: Route | null = null;
  let pickupStop: RouteStop | null = null;
  let dropoffStop: RouteStop | null = null;

  if (busAssignment) {
    const { data: serviceData, error: serviceError } = await client
      .from('bus_route_assignments')
      .select(
        'id, tenant_id, bus_id, route_id, trip_type, effective_from, effective_to, status, created_at, updated_at',
      )
      .eq('id', busAssignment.bus_route_assignment_id)
      .maybeSingle();
    if (serviceError) throw new Error('The student bus service could not be loaded.');
    busService = (serviceData as BusRouteAssignment | null) ?? null;

    if (busService) {
      const [busResult, routeResult, pickupResult, dropoffResult] = await Promise.all([
        client
          .from('buses')
          .select(
            'id, tenant_id, school_id, bus_number, license_plate, capacity, status, created_at, updated_at',
          )
          .eq('id', busService.bus_id)
          .maybeSingle(),
        client
          .from('routes')
          .select(
            'id, tenant_id, school_id, route_name, route_code, route_type, status, created_at, updated_at',
          )
          .eq('id', busService.route_id)
          .maybeSingle(),
        busAssignment.pickup_stop_id
          ? client
              .from('route_stops')
              .select(
                'id, tenant_id, route_id, school_id, stop_name, stop_order, planned_arrival_time, latitude, longitude, status, created_at, updated_at',
              )
              .eq('id', busAssignment.pickup_stop_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        busAssignment.dropoff_stop_id
          ? client
              .from('route_stops')
              .select(
                'id, tenant_id, route_id, school_id, stop_name, stop_order, planned_arrival_time, latitude, longitude, status, created_at, updated_at',
              )
              .eq('id', busAssignment.dropoff_stop_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (busResult.error || routeResult.error || pickupResult.error || dropoffResult.error) {
        throw new Error('The student transportation details could not be loaded.');
      }
      bus = (busResult.data as Bus | null) ?? null;
      route = (routeResult.data as Route | null) ?? null;
      pickupStop = (pickupResult.data as RouteStop | null) ?? null;
      dropoffStop = (dropoffResult.data as RouteStop | null) ?? null;
    }
  }

  const guardianIds = (guardianLinksResult.data ?? []).map(
    (link) => (link as { guardian_id: string }).guardian_id,
  );
  let guardians: Guardian[] = [];
  let guardianLinks: AdminStudentDetail['guardianLinks'] = [];
  if (guardianIds.length > 0) {
    const { data, error } = await client
      .from('guardians')
      .select(
        'id, tenant_id, profile_id, first_name, last_name, full_name, email, phone, status, created_at, updated_at',
      )
      .in('id', guardianIds)
      .order('full_name', { ascending: true });
    if (error) throw new Error('The linked guardians could not be loaded.');
    guardians = (data ?? []) as Guardian[];
    const profileIds = guardians.map((guardian) => guardian.profile_id).filter(Boolean);
    const profileStatuses = new Map<string, string>();
    if (profileIds.length > 0) {
      const profilesResult = await client.from('profiles').select('id, status').in('id', profileIds);
      if (profilesResult.error) throw new Error('Guardian invitation status could not be loaded.');
      for (const profile of profilesResult.data ?? []) {
        profileStatuses.set(profile.id, profile.status);
      }
    }
    guardianLinks = (guardianLinksResult.data ?? []).flatMap((row) => {
      const link = row as StudentGuardian;
      const guardian = guardians.find((item) => item.id === link.guardian_id);
      return guardian ? [{ ...link, guardian, profileStatus: profileStatuses.get(guardian.profile_id) ?? null }] : [];
    });
  }

  return {
    student,
    schoolName: (schoolResult.data as { name: string } | null)?.name ?? null,
    busAssignment,
    busService,
    bus,
    route,
    pickupStop,
    dropoffStop,
    guardians,
    guardianLinks,
  };
}

/**
 * Create a new student. The tenant_id is derived from the admin's profile,
 * never trusted from the form input. Raw backend errors are logged in DEV only.
 */
export async function createStudent(
  input: CreateStudentInput,
  defaultTenantId: string | null,
): Promise<Student> {
  const client = requireSupabase();

  if (!defaultTenantId) {
    throw new Error('Use an account with a tenant before saving this student.');
  }

  if (!input.firstName.trim() || !input.lastName.trim()) {
    throw new Error('First name and last name are required.');
  }

  const { data, error } = await client
    .from('students')
    .insert({
      tenant_id: defaultTenantId,
      school_id: input.schoolId || null,
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      preferred_name: cleanText(input.preferredName ?? ''),
      grade: cleanText(input.grade ?? ''),
      status: 'active',
    })
    .select(studentColumns)
    .single();

  if (error) {
    logDevError('Failed to create student', error);
    throw new Error('We could not save the student. Please try again.');
  }

  return data as Student;
}

/**
 * Update an existing student's basic details. Only the admin's tenant is
 * accessible (RLS enforces this).
 */
export async function updateStudent(
  studentId: string,
  input: UpdateStudentInput,
): Promise<Student> {
  const client = requireSupabase();

  const update: Record<string, unknown> = {};
  if (input.firstName !== undefined) update.first_name = input.firstName.trim();
  if (input.lastName !== undefined) update.last_name = input.lastName.trim();
  if (input.preferredName !== undefined) update.preferred_name = cleanText(input.preferredName);
  if (input.grade !== undefined) update.grade = cleanText(input.grade);
  if (input.schoolId !== undefined) update.school_id = input.schoolId || null;

  const { data, error } = await client
    .from('students')
    .update(update)
    .eq('id', studentId)
    .select(studentColumns)
    .single();

  if (error) {
    logDevError('Failed to update student', error);
    throw new Error('We could not update the student. Please try again.');
  }

  return data as Student;
}

/**
 * Permanently delete a student record. RLS restricts this to tenant admins
 * in the student's tenant. Related rows (student_guardians,
 * student_route_assignments) cascade automatically via ON DELETE CASCADE.
 */
export async function deleteStudent(studentId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('students').delete().eq('id', studentId);

  if (error) {
    logDevError('Failed to delete student', error);
    throw new Error('We could not delete the student. Please try again.');
  }
}

/**
 * Set a student's status (active/inactive). Used for deactivate/reactivate.
 */
export async function setStudentStatus(
  studentId: string,
  status: StudentStatus,
): Promise<Student> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('students')
    .update({ status })
    .eq('id', studentId)
    .select(studentColumns)
    .single();

  if (error) {
    logDevError('Failed to update student status', error);
    throw new Error('We could not update the student status. Please try again.');
  }

  return data as Student;
}
