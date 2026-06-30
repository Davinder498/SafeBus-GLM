/**
 * SafeBus Alberta — Auth helpers.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AcceptInvitationRequest, AuthSession, LoginRequest } from '@safebus/types';
import { loginSchema, acceptInvitationSchema } from './validation.ts';
import { NotAuthenticatedError, ValidationError, toSafeBusError } from './errors.ts';

export async function login(supabase: SupabaseClient, request: LoginRequest): Promise<AuthSession> {
  const parsed = loginSchema.safeParse(request);
  if (!parsed.success) {
    throw new ValidationError('Invalid login details', parsed.error.flatten().fieldErrors as never);
  }
  const { email, password } = parsed.data;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw toSafeBusError(error);
  if (!data.session || !data.user) throw new NotAuthenticatedError();

  // Fetch profile to get role + tenant_id
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, tenant_id, full_name')
    .eq('auth_user_id', data.user.id)
    .single();

  if (profileError) throw toSafeBusError(profileError);

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? 0,
    user: {
      id: data.user.id,
      email: data.user.email ?? email,
      role: profile?.role ?? 'guardian',
      tenantId: profile?.tenant_id ?? null,
      fullName: profile?.full_name ?? '',
    },
  };
}

export async function logout(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw toSafeBusError(error);
}

export async function requestPasswordReset(
  supabase: SupabaseClient,
  email: string,
  redirectTo: string,
): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw toSafeBusError(error);
}

export async function acceptInvitation(
  _supabase: SupabaseClient,
  request: AcceptInvitationRequest,
): Promise<AuthSession> {
  const parsed = acceptInvitationSchema.safeParse(request);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid invitation details',
      parsed.error.flatten().fieldErrors as never,
    );
  }
  // Invitation flow is handled via Edge Function — this is a placeholder
  // that will be wired up in Phase 2 (Backend).
  throw new Error('acceptInvitation not yet implemented — see Phase 2');
}

export async function getCurrentSession(supabase: SupabaseClient): Promise<AuthSession | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw toSafeBusError(error);
  if (!data.session) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, tenant_id, full_name')
    .eq('auth_user_id', data.session.user.id)
    .single();

  if (profileError) throw toSafeBusError(profileError);

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? 0,
    user: {
      id: data.session.user.id,
      email: data.session.user.email ?? '',
      role: profile?.role ?? 'guardian',
      tenantId: profile?.tenant_id ?? null,
      fullName: profile?.full_name ?? '',
    },
  };
}
