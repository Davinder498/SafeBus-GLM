import { supabase, supabaseConfigError } from '@/lib/supabase';

function client() { if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase is not configured.'); return supabase; }

async function callOnboarding<T>(body: Record<string, unknown>): Promise<T> {
  const c = client();
  const { data: session } = await c.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('Sign in required.');
  const response = await fetch('/.netlify/functions/safebus-onboarding', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Onboarding request failed.');
  return payload as T;
}

export interface PlatformTenantSummary { tenant_id: string; tenant_name: string; tenant_type: string; tenant_status: string; tenant_created_at: string; tenant_admin_status: string; latest_invitation_status: string; buses_count: number; drivers_count: number; routes_count: number; students_count: number; guardians_count: number; operationally_ready: boolean; }
export interface OnboardingInvitation { id: string; tenant_id: string; email: string; full_name: string; role: 'tenant_admin' | 'driver' | 'guardian'; status: string; invited_profile_id: string | null; last_sent_at: string | null; cancelled_at: string | null; created_at: string; }

export async function fetchPlatformTenantSummaries(): Promise<PlatformTenantSummary[]> { const { data, error } = await client().rpc('get_platform_tenant_onboarding_summary'); if (error) throw new Error('Unable to load tenant onboarding summary.'); return (data ?? []) as PlatformTenantSummary[]; }
export async function fetchInvitations(): Promise<OnboardingInvitation[]> { const { data, error } = await client().from('tenant_onboarding_invitations').select('id, tenant_id, email, full_name, role, status, invited_profile_id, last_sent_at, cancelled_at, created_at').order('created_at', { ascending: false }); if (error) throw new Error('Unable to load invitations.'); return (data ?? []) as OnboardingInvitation[]; }
export async function createTenantWithAdmin(input: { tenantName: string; tenantType: string; schoolName: string; city: string; adminName: string; adminEmail: string }) { return callOnboarding<{ tenant: { id: string; name: string } }>({ kind: 'createTenant', ...input }); }
export async function inviteTenantMember(input: { role: 'driver' | 'guardian'; fullName: string; email: string; phone?: string; employeeNumber?: string; studentLinks?: Array<{ studentId: string; relationship: string }> }) { return callOnboarding<{ status: string }>({ kind: 'inviteMember', ...input }); }
export async function updateInvitation(invitationId: string, action: 'resend' | 'cancel') { return callOnboarding<{ status: string }>({ kind: 'invitationAction', invitationId, action }); }
export async function updateTenantLifecycle(tenantId: string, status: 'active' | 'suspended' | 'disabled') { return callOnboarding<{ status: string }>({ kind: 'tenantLifecycle', tenantId, status }); }
