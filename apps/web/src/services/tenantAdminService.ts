import { supabase, supabaseConfigError } from '@/lib/supabase';
import type { Json } from '@safebus/types/database';

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
  return supabase;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface AdminProfile {
  id: string;
  tenant_id: string | null;
  school_id: string | null;
  full_name: string;
  email: string;
  role: 'platform_super_admin' | 'tenant_admin' | 'school_admin' | 'transportation_admin' | 'driver' | 'guardian';
  status: 'invited' | 'active' | 'suspended' | 'disabled';
  created_at: string;
  updated_at: string;
}

export interface AuditEvent {
  id: string;
  created_at: string;
  actor_profile_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  outcome: string;
  detail: Record<string, unknown>;
  tenant_id: string | null;
}

export interface BulkImportBatch {
  id: string;
  tenant_id: string;
  created_by_profile_id: string;
  record_type: 'student' | 'guardian' | 'driver';
  file_name: string | null;
  status: 'staging' | 'validated' | 'committed' | 'rolled_back' | 'failed';
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  dry_run: boolean;
  summary: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  committed_at: string | null;
}

export interface BulkImportStageResult {
  batchId: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  dryRun: boolean;
  canCommit: boolean;
}

export interface TenantSchoolOption {
  id: string;
  name: string;
  status: string;
}

export interface TenantAdminInvitation {
  id: string;
  email: string;
  full_name: string;
  role: 'tenant_admin' | 'school_admin' | 'transportation_admin';
  status: string;
  delivery_status: string;
  expires_at: string;
  last_sent_at: string | null;
}

export interface BulkImportErrorRow {
  row_number: number;
  record_type: string;
  row_data: Record<string, unknown>;
  validation_errors: string[];
}

export interface BulkInvitationDeliveryRow {
  id: string;
  email: string;
  full_name: string;
  role: 'guardian' | 'driver';
  status: string;
  delivery_status: string;
  last_delivery_error: string | null;
  delivery_attempts: number;
}

// ---------------------------------------------------------------------------
// Administrator management
// ---------------------------------------------------------------------------
export async function fetchTenantAdmins(): Promise<AdminProfile[]> {
  const { data, error } = await client()
    .from('profiles')
    .select('id, tenant_id, school_id, full_name, email, role, status, created_at, updated_at')
    .in('role', ['tenant_admin', 'school_admin', 'transportation_admin'])
    .order('full_name', { ascending: true });
  if (error) throw new Error('Unable to load administrators.');
  return (data ?? []) as AdminProfile[];
}

export async function fetchTenantSchools(): Promise<TenantSchoolOption[]> {
  const { data, error } = await client()
    .from('schools')
    .select('id, name, status')
    .eq('status', 'active')
    .order('name', { ascending: true });
  if (error) throw new Error('Unable to load schools.');
  return (data ?? []) as TenantSchoolOption[];
}

export async function fetchTenantAdminInvitations(): Promise<TenantAdminInvitation[]> {
  const { data, error } = await client()
    .from('tenant_onboarding_invitations')
    .select('id, email, full_name, role, status, delivery_status, expires_at, last_sent_at')
    .in('role', ['tenant_admin', 'school_admin', 'transportation_admin'])
    .order('created_at', { ascending: false });
  if (error) throw new Error('Unable to load administrator invitations.');
  return (data ?? []) as TenantAdminInvitation[];
}

export async function changeAdminRole(profileId: string, newRole: string, schoolId?: string | null) {
  const { data, error } = await client().rpc('tenant_change_admin_role', {
    p_profile_id: profileId,
    p_new_role: newRole,
    p_school_id: schoolId ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function transferAdministrator(profileId: string, tenantId?: string | null) {
  const { data, error } = await client().rpc('tenant_transfer_administrator', {
    p_profile_id: profileId,
    p_tenant_id: tenantId ?? null,
  });
  if (error) throw new Error(error.message);
  return data;
}

// ---------------------------------------------------------------------------
// Audit search
// ---------------------------------------------------------------------------
export interface AuditSearchFilters {
  action?: string | null;
  targetType?: string | null;
  actorProfileId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  limit?: number;
  offset?: number;
}

export async function searchAuditEvents(filters: AuditSearchFilters = {}): Promise<AuditEvent[]> {
  const { data, error } = await client().rpc('tenant_search_audit_events', {
    p_action: filters.action ?? null,
    p_target_type: filters.targetType ?? null,
    p_actor_profile_id: filters.actorProfileId ?? null,
    p_from_date: filters.fromDate ?? null,
    p_to_date: filters.toDate ?? null,
    p_limit: filters.limit ?? 100,
    p_offset: filters.offset ?? 0,
  });
  if (error) throw new Error('Unable to search audit events.');
  return (data ?? []) as AuditEvent[];
}

// ---------------------------------------------------------------------------
// Bulk import
// ---------------------------------------------------------------------------
export async function stageBulkImport(
  recordType: 'student' | 'guardian' | 'driver',
  rows: Record<string, unknown>[],
  fileName?: string,
  dryRun = true,
): Promise<BulkImportStageResult> {
  const { data, error } = await client().rpc('bulk_import_stage_rows', {
    p_record_type: recordType,
    p_rows: rows as unknown as Json,
    p_file_name: fileName ?? null,
    p_dry_run: dryRun,
  });
  if (error) throw new Error(error.message);
  return data as BulkImportStageResult;
}

export async function commitBulkImport(
  batchId: string,
): Promise<{ requiresInvitations: boolean; committed: number }> {
  const { data, error } = await client().rpc('bulk_import_commit', {
    p_batch_id: batchId,
    p_confirm: true,
  });
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as Partial<{ requiresInvitations: boolean; committed: number }>;
  return {
    requiresInvitations: result.requiresInvitations === true,
    committed: typeof result.committed === 'number' ? result.committed : 0,
  };
}

export async function rollbackBulkImport(batchId: string) {
  const { data, error } = await client().rpc('bulk_import_rollback', { p_batch_id: batchId });
  if (error) throw new Error(error.message);
  return data;
}

export async function getBulkImportErrors(batchId: string): Promise<BulkImportErrorRow[]> {
  const { data, error } = await client().rpc('bulk_import_get_errors', { p_batch_id: batchId });
  if (error) throw new Error(error.message);
  return (data ?? []) as BulkImportErrorRow[];
}

export async function fetchBulkImportBatches(): Promise<BulkImportBatch[]> {
  const { data, error } = await client()
    .from('bulk_import_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error('Unable to load import history.');
  return (data ?? []) as BulkImportBatch[];
}

// ---------------------------------------------------------------------------
// Invitation lifecycle
// ---------------------------------------------------------------------------
export async function getBulkDeliverySummary(batchId: string) {
  const { data, error } = await client().rpc('get_bulk_invitation_delivery_summary', {
    p_batch_id: batchId,
  });
  if (error) throw new Error(error.message);
  return data as Record<string, number>;
}

export async function fetchBulkInvitationDeliveryRows(
  batchId: string,
): Promise<BulkInvitationDeliveryRow[]> {
  const { data, error } = await client()
    .from('tenant_onboarding_invitations')
    .select(
      'id, email, full_name, role, status, delivery_status, last_delivery_error, delivery_attempts',
    )
    .eq('bulk_batch_id', batchId)
    .order('source_row_number', { ascending: true });
  if (error) throw new Error('Unable to load bulk invitation delivery details.');
  return (data ?? []) as BulkInvitationDeliveryRow[];
}

// Phase 5: Bulk invitation generation after validation/commit.
export async function generateBulkInvitations(batchId: string) {
  const { data, error } = await client().rpc('bulk_import_generate_invitations', {
    p_batch_id: batchId,
  });
  if (error) throw new Error(error.message);
  return data as { batchId: string; invitationsQueued: number; totalInvitations: number };
}
