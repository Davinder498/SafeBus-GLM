import { supabase, supabaseConfigError } from '@/lib/supabase';

function requireSupabase() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

export interface StudentQrCredentialResult {
  studentId: string;
  credentialId: string | null;
  status: 'active' | 'revoked';
  rawToken: string | null;
  createdAt: string;
}

export interface StudentQrCredentialStatus {
  studentId: string;
  hasActiveCredential: boolean;
  credentialStatus: string | null;
  credentialCreatedAt: string | null;
}

interface ManageRow { student_id: string; credential_id: string | null; status: 'active' | 'revoked'; raw_token: string | null; created_at: string }
interface StatusRow { student_id: string; has_active_credential: boolean; credential_status: string | null; credential_created_at: string | null }

function mapManage(row: ManageRow): StudentQrCredentialResult {
  return { studentId: row.student_id, credentialId: row.credential_id, status: row.status, rawToken: row.raw_token, createdAt: row.created_at };
}

export async function manageStudentQrCredential(studentId: string, action: 'generate' | 'rotate' | 'revoke'): Promise<StudentQrCredentialResult> {
  const { data, error } = await requireSupabase().rpc('manage_student_qr_credential', { p_student_id: studentId, p_action: action });
  if (error) throw new Error(error.message || 'Unable to manage QR credential.');
  return mapManage((data as ManageRow[])[0]);
}

export async function fetchStudentQrCredentialStatus(studentId: string): Promise<StudentQrCredentialStatus | null> {
  const { data, error } = await requireSupabase().rpc('get_admin_student_qr_credential_status', { p_student_id: studentId });
  if (error) throw new Error(error.message || 'Unable to load QR credential status.');
  const row = (data as StatusRow[])[0];
  if (!row) return null;
  return { studentId: row.student_id, hasActiveCredential: row.has_active_credential, credentialStatus: row.credential_status, credentialCreatedAt: row.credential_created_at };
}
