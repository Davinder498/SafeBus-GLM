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
