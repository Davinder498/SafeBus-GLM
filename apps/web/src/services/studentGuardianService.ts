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
 * Create or reactivate a student-guardian link via the secure
 * admin_link_student_guardian() RPC.
 *
 * The RPC is SECURITY DEFINER and validates:
 *   - caller is an authenticated transportation write admin
 *   - student is active and in the caller's tenant
 *   - guardian is active and in the caller's tenant
 *   - if an active link exists, raises a friendly duplicate error
 *   - if an inactive link exists, reactivates it
 *   - if no link exists, inserts a new one
 *
 * The client passes only student_id, guardian_id, and relationship — no
 * tenant_id. Raw backend errors are logged in DEV only; the RPC's friendly
 * error messages are passed through.
 */
export async function createStudentGuardianLink(input: {
  studentId: string;
  guardianId: string;
  relationship: string;
  defaultTenantId: string | null;
}): Promise<StudentGuardian> {
  const client = requireSupabase();

  // defaultTenantId is no longer sent to the server — the RPC derives it from
  // the authenticated user. We keep the parameter for API compatibility but
  // only use it for a client-side guard.
  if (!input.defaultTenantId) {
    throw new Error('Use an account with a tenant before saving this link.');
  }

  const { data, error } = await client.rpc('admin_link_student_guardian', {
    p_student_id: input.studentId,
    p_guardian_id: input.guardianId,
    p_relationship: input.relationship,
    p_can_receive_notifications: true,
  });

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to link student guardian', error);
    }
    const message = error.message ?? 'We could not save the student guardian link. Please try again.';
    // Pass through the RPC's friendly error messages.
    if (message.includes('already linked')) {
      throw new Error('This student is already linked to this guardian.');
    }
    if (message.includes('Student not found') || message.includes('Guardian not found')) {
      throw new Error('We could not save the student guardian link. Please try again.');
    }
    if (message.includes('Only an admin')) {
      throw new Error('We could not save the student guardian link. Please try again.');
    }
    throw new Error('We could not save the student guardian link. Please try again.');
  }

  return data as StudentGuardian;
}

/**
 * Permanently delete a guardian record. RLS restricts this to tenant admins
 * in the guardian's tenant. Related student_guardians rows cascade via
 * ON DELETE CASCADE.
 */
export async function deleteGuardian(guardianId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('guardians').delete().eq('id', guardianId);

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to delete guardian', error);
    }
    throw new Error('We could not delete the guardian. Please try again.');
  }
}

/**
 * Deactivate a student-guardian link via the secure
 * admin_deactivate_student_guardian() RPC. The RPC validates that the link
 * belongs to the caller's tenant and that the caller is an admin.
 */
export async function deactivateStudentGuardianLink(linkId: string): Promise<void> {
  const client = requireSupabase();

  const { error } = await client.rpc('admin_deactivate_student_guardian', {
    p_link_id: linkId,
  });

  if (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to deactivate student guardian link', error);
    }
    throw new Error('We could not update the student guardian link. Please try again.');
  }
}
