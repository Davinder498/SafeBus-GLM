import { supabase, supabaseConfigError } from '@/lib/supabase';
import { DuplicateIdentifierError } from '@/services/transportationStructureService';

function client() { if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.'); return supabase; }

async function callOnboarding<T>(body: Record<string, unknown>): Promise<T> {
  const c = client();
  const { data: session } = await c.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('Sign in required.');
  const response = await fetch('/.netlify/functions/safebus-onboarding', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json().catch(() => ({})) : {};
  if (!response.ok) {
    if (typeof payload.error === 'string') {
      const message = payload.error;
      if (message.includes('driving licence number') || message.includes('driver licence number') || message.includes('licence number')) {
        throw new DuplicateIdentifierError('licenseNumber', message);
      }
      if (message.includes('email address') || message.includes('email is already') || message.includes('email is already linked') || message.includes('email belongs')) {
        throw new DuplicateIdentifierError('email', message);
      }
      if (message.includes('phone number')) {
        throw new DuplicateIdentifierError('phone', message);
      }
      throw new Error(message);
    }
    // Detect non-JSON responses (HTML SPA fallback when Netlify Functions are
    // not served — e.g. running `vite` instead of `netlify dev` locally).
    if (!isJson || response.status === 404) {
      throw new Error('We could not reach the onboarding service. Nothing was confirmed; please try again once.');
    }
    throw new Error(
      response.status >= 500
        ? 'The onboarding service did not confirm completion. Nothing was confirmed; please try again once.'
        : 'The onboarding request was rejected. Review the form and try again.',
    );
  }
  return payload as T;
}

export interface PlatformTenantSummary { tenant_id: string; tenant_name: string; tenant_type: string; tenant_status: string; tenant_created_at: string; first_tenant_admin_profile_id: string | null; first_tenant_admin_name: string | null; first_tenant_admin_email: string | null; tenant_admin_status: 'invited' | 'active' | 'suspended' | 'disabled' | 'missing'; active_tenant_admin_count: number; latest_invitation_status: string; latest_invitation_at: string | null; setup_readiness: 'not_started' | 'in_progress' | 'ready'; has_buses: boolean; has_drivers: boolean; has_routes: boolean; has_students: boolean; last_onboarding_activity_at: string | null; }
export interface PlatformFirstAdminInvitation { invitation_id: string; tenant_id: string; invited_profile_id: string; status: string; last_sent_at: string | null; expires_at: string; delivery_status: string; }

export async function fetchPlatformTenantSummaries(): Promise<PlatformTenantSummary[]> { const { data, error } = await client().rpc('get_platform_tenant_onboarding_summary_secure'); if (error) throw new Error('Unable to load tenant onboarding summary.'); return (data ?? []) as PlatformTenantSummary[]; }
export async function fetchPlatformFirstAdminInvitations(): Promise<PlatformFirstAdminInvitation[]> { const { data, error } = await client().rpc('get_platform_first_admin_invitation_status'); if (error) throw new Error('Unable to load first administrator invitation status.'); return (data ?? []) as PlatformFirstAdminInvitation[]; }
export async function createTenantWithAdmin(input: { tenantName: string; tenantType: string; schoolName: string; city: string; adminName: string; adminEmail: string }) { return callOnboarding<{ tenant: { id: string; name: string }; school: { id: string; name: string } | null; invitationStatus: 'sent' | 'resent' | 'recovery_sent'; recipientEmail: string }>({ kind: 'createTenant', ...input }); }
export interface InviteTenantMemberInput {
  role: 'driver' | 'guardian';
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  licenseNumber?: string;
  licenseIssueDate?: string;
  licenseExpiryDate?: string;
  licenseClass?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  studentLinks?: Array<{ studentId: string; relationship: string }>;
}
export async function inviteTenantMember(input: InviteTenantMemberInput) { return callOnboarding<{ status: 'sent' | 'resent' | 'recovery_sent'; guardianId: string | null; driverId: string | null; recipientEmail: string }>({ kind: 'inviteMember', ...input }); }
export async function updateInvitation(invitationId: string, action: 'resend' | 'cancel' | 'revoke') { return callOnboarding<{ status: string }>({ kind: 'invitationAction', invitationId, action }); }
export async function updateTenantLifecycle(tenantId: string, status: 'active' | 'suspended' | 'disabled') { return callOnboarding<{ status: string }>({ kind: 'tenantLifecycle', tenantId, status }); }

// Phase 5: Invite an additional tenant administrator or sub-administrator.
export async function inviteAdministrator(input: {
  tenantId?: string;
  fullName: string;
  email: string;
  role: 'tenant_admin' | 'school_admin' | 'transportation_admin';
  schoolId?: string;
}) {
  return callOnboarding<{ profileId: string; tenantId: string; status: string }>({ kind: 'inviteAdministrator', ...input });
}

// Phase 5: Emergency recovery (platform super-admin).
export async function emergencyRecovery(profileId: string, tenantId: string) {
  return callOnboarding<{ profileId: string; tenantId: string; status: string }>({ kind: 'emergencyRecovery', profileId, tenantId });
}

export async function departAdministrator(profileId: string) {
  return callOnboarding<{ profileId: string; status: string }>({ kind: 'departAdministrator', profileId });
}

export async function suspendAdministrator(profileId: string) {
  return callOnboarding<{ profileId: string; status: string }>({ kind: 'suspendAdministrator', profileId });
}

export async function restoreAdministrator(profileId: string) {
  return callOnboarding<{ profileId: string; status: string }>({ kind: 'restoreAdministrator', profileId });
}

export async function dispatchBulkInvitations(batchId: string, limit = 10) {
  return callOnboarding<{
    batchId: string;
    claimed: number;
    sent: number;
    failed: number;
    summary: Record<string, number>;
  }>({ kind: 'bulkInvitationDispatch', batchId, limit });
}
