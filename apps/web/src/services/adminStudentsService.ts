import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { Student, StudentStatus } from '@/types/studentGuardian';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }
  return supabase;
}

const studentColumns =
  'id, tenant_id, school_id, first_name, last_name, preferred_name, grade, school_student_number, status, created_at, updated_at';

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
  schoolStudentNumber: string | null;
  schoolId: string | null;
}

export interface UpdateStudentInput {
  firstName?: string;
  lastName?: string;
  preferredName?: string | null;
  grade?: string | null;
  schoolStudentNumber?: string | null;
  schoolId?: string | null;
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
      school_student_number: cleanText(input.schoolStudentNumber ?? ''),
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
  if (input.schoolStudentNumber !== undefined) update.school_student_number = cleanText(input.schoolStudentNumber);
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
