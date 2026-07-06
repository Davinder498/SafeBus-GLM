import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { Guardian, Student, StudentGuardian } from '@/types/studentGuardian';

function requireSupabase() {
  if (!supabase) {
    throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  }

  return supabase;
}

export async function getVisibleStudents(): Promise<Student[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('students')
    .select(
      'id, tenant_id, school_id, first_name, last_name, preferred_name, grade, school_student_number, status, created_at, updated_at',
    )
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Student[];
}

export async function getVisibleGuardians(): Promise<Guardian[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('guardians')
    .select('id, tenant_id, profile_id, full_name, email, phone, status, created_at, updated_at')
    .order('full_name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Guardian[];
}

export async function getVisibleStudentGuardianLinks(): Promise<StudentGuardian[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('student_guardians')
    .select(
      'id, tenant_id, student_id, guardian_id, relationship, can_receive_notifications, status, created_at, updated_at',
    )
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as StudentGuardian[];
}

export async function getMyLinkedStudents(): Promise<Student[]> {
  return getVisibleStudents();
}

/**
 * Create a student-guardian link. The tenant_id is derived from the student
 * (passed via defaultTenantId), never trusted from the form input. Raw backend
 * errors are logged in DEV only; a generic safe error is thrown.
 */
export async function createStudentGuardianLink(input: {
  studentId: string;
  guardianId: string;
  relationship: string;
  defaultTenantId: string | null;
}): Promise<StudentGuardian> {
  const client = requireSupabase();

  if (!input.defaultTenantId) {
    throw new Error('Use an account with a tenant before saving this link.');
  }

  const { data, error } = await client
    .from('student_guardians')
    .insert({
      tenant_id: input.defaultTenantId,
      student_id: input.studentId,
      guardian_id: input.guardianId,
      relationship: input.relationship,
      can_receive_notifications: true,
      status: 'active',
    })
    .select('id, tenant_id, student_id, guardian_id, relationship, can_receive_notifications, status, created_at, updated_at')
    .single();

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to create student guardian link', error);
    }
    throw new Error('We could not save the student guardian link. Please try again.');
  }

  return data as StudentGuardian;
}

/**
 * Deactivate a student-guardian link (set status to 'inactive').
 */
export async function deactivateStudentGuardianLink(linkId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('student_guardians')
    .update({ status: 'inactive' })
    .eq('id', linkId);

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to deactivate student guardian link', error);
    }
    throw new Error('We could not update the student guardian link. Please try again.');
  }
}
