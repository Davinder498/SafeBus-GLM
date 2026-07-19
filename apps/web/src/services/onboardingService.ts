import { supabase, supabaseConfigError } from '@/lib/supabase';

function client() { if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.'); return supabase; }

async function callOnboarding<T>(body: Record<string, unknown>): Promise<T> {
  const c = client();
  const { data: session } = await c.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('Sign in required.');
  const response = await fetch('/.netlify/functions/safebus-onboarding', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : response.status >= 500
          ? `The onboarding service returned HTTP ${response.status} before confirming completion. No new record was confirmed; retry once.`
          : 'The onboarding request was rejected. Review the form and try again.',
    );
  }
  return payload as T;
}

export interface PlatformTenantSummary { tenant_id: string; tenant_name: string; tenant_type: string; tenant_status: string; tenant_created_at: string; first_tenant_admin_profile_id: string | null; first_tenant_admin_name: string | null; first_tenant_admin_email: string | null; tenant_admin_status: 'invited' | 'active' | 'suspended' | 'disabled' | 'missing'; active_tenant_admin_count: number; latest_invitation_status: string; latest_invitation_at: string | null; setup_readiness: 'not_started' | 'in_progress' | 'ready'; has_buses: boolean; has_drivers: boolean; has_routes: boolean; has_students: boolean; last_onboarding_activity_at: string | null; }
export interface OnboardingInvitation { id: string; tenant_id: string; email: string; full_name: string; role: 'tenant_admin' | 'driver' | 'guardian'; status: string; invited_profile_id: string | null; last_sent_at: string | null; cancelled_at: string | null; created_at: string; }

export async function fetchPlatformTenantSummaries(): Promise<PlatformTenantSummary[]> { const { data, error } = await client().rpc('get_platform_tenant_onboarding_summary'); if (error) throw new Error('Unable to load tenant onboarding summary.'); return (data ?? []) as PlatformTenantSummary[]; }
export async function fetchInvitations(): Promise<OnboardingInvitation[]> { const { data, error } = await client().from('tenant_onboarding_invitations').select('id, tenant_id, email, full_name, role, status, invited_profile_id, last_sent_at, cancelled_at, created_at').order('created_at', { ascending: false }); if (error) throw new Error('Unable to load invitations.'); return (data ?? []) as OnboardingInvitation[]; }
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
export async function updateInvitation(invitationId: string, action: 'resend' | 'cancel') { return callOnboarding<{ status: string }>({ kind: 'invitationAction', invitationId, action }); }
export async function updateTenantLifecycle(tenantId: string, status: 'active' | 'suspended' | 'disabled') { return callOnboarding<{ status: string }>({ kind: 'tenantLifecycle', tenantId, status }); }
export async function updateTenantAdminLifecycle(profileId: string, status: 'active' | 'disabled') { return callOnboarding<{ status: string }>({ kind: 'tenantAdminLifecycle', profileId, status }); }
