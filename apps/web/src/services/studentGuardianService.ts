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
 * Create or reactivate a student-guardian link.
 *
 * The table has a hard unique constraint on (student_id, guardian_id), so if a
 * link (active OR inactive) already exists for the same pair, a direct INSERT
 * will fail. This function:
 *   1. Checks if an existing link exists for the same student + guardian.
 *   2. If an ACTIVE link exists: throws a friendly "already linked" error.
 *   3. If an INACTIVE link exists: reactivates it (updates status to 'active'
 *      and refreshes the relationship). Preserves history — no hard delete.
 *   4. If no link exists: inserts a new active link.
 *
 * The tenant_id is derived from the admin's profile, never trusted from the
 * form input. Raw backend errors are logged in DEV only.
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

  const linkColumns = 'id, tenant_id, student_id, guardian_id, relationship, can_receive_notifications, status, created_at, updated_at';

  // 1. Check if an existing link (any status) exists for this student + guardian.
  const { data: existing, error: lookupError } = await client
    .from('student_guardians')
    .select(linkColumns)
    .eq('student_id', input.studentId)
    .eq('guardian_id', input.guardianId)
    .maybeSingle();

  if (lookupError) {
    if (import.meta.env.DEV) {
      console.error('Failed to look up existing student guardian link', lookupError);
    }
    throw new Error('We could not save the student guardian link. Please try again.');
  }

  // 2. If an active link already exists, reject with a friendly message.
  if (existing && (existing as StudentGuardian).status === 'active') {
    throw new Error('This student is already linked to this guardian.');
  }

  // 3. If an inactive link exists, reactivate it.
  if (existing) {
    const { data: reactivated, error: reactivateError } = await client
      .from('student_guardians')
      .update({
        status: 'active',
        relationship: input.relationship,
        can_receive_notifications: true,
      })
      .eq('id', (existing as StudentGuardian).id)
      .select(linkColumns)
      .single();

    if (reactivateError) {
      if (import.meta.env.DEV) {
        console.error('Failed to reactivate student guardian link', reactivateError);
      }
      throw new Error('We could not save the student guardian link. Please try again.');
    }

    return reactivated as StudentGuardian;
  }

  // 4. No existing link — insert a new one.
  const { data: inserted, error: insertError } = await client
    .from('student_guardians')
    .insert({
      tenant_id: input.defaultTenantId,
      student_id: input.studentId,
      guardian_id: input.guardianId,
      relationship: input.relationship,
      can_receive_notifications: true,
      status: 'active',
    })
    .select(linkColumns)
    .single();

  if (insertError) {
    if (import.meta.env.DEV) {
      console.error('Failed to create student guardian link', insertError);
    }
    throw new Error('We could not save the student guardian link. Please try again.');
  }

  return inserted as StudentGuardian;
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
