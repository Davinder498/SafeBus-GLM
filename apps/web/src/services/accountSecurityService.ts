import { createClient } from '@supabase/supabase-js';
import type { Database } from '@safebus/types/database';
import { supabase, supabaseEnv } from '@/lib/supabase';

/** Only explicitly approved account-security errors may be shown in the UI. */
export class AccountSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountSecurityError';
  }
}

export function accountSecurityErrorMessage(error: unknown): string {
  return error instanceof AccountSecurityError
    ? error.message
    : 'Unable to change your password right now. Please try again.';
}

/**
 * Verify knowledge of the current password in an isolated, non-persistent
 * Supabase Auth client. Unlike updateUser({ current_password }), this check
 * fails closed even if the hosted Auth project option is not yet enabled.
 * Never reuse the temporary session as the application's signed-in session.
 */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  if (!supabase || !supabaseEnv.url || !supabaseEnv.anonKey) {
    throw new AccountSecurityError('Account security is unavailable. Please try again later.');
  }

  // Bind both password verification and the subsequent mutation to one
  // application session. The isolated proof client signs into a separate
  // temporary session and must never authorize a different active account.
  const initial = await supabase.auth.getSession();
  const original = initial.data.session;
  if (initial.error || !original?.access_token || !original.user?.id) {
    throw new AccountSecurityError('Sign in again before changing your password.');
  }
  const existing = await supabase.auth.getUser();
  const user = existing.data.user;
  if (existing.error || !user?.id || !user.email || user.id !== original.user.id) {
    throw new AccountSecurityError('Sign in again before changing your password.');
  }

  if (!currentPassword || currentPassword === newPassword) {
    throw new AccountSecurityError('Choose a new password different from your current password.');
  }

  const policy = await supabase.rpc('enforce_new_password_policy', { p_password: newPassword });
  if (policy.error) {
    if (['42501', 'PGRST301', 'PGRST303'].includes(policy.error.code))
      throw new AccountSecurityError('Sign in again before changing your password.');
    if (policy.error.code === '22023')
      throw new AccountSecurityError('Your new password does not meet SafeBus password requirements.');
    throw new AccountSecurityError('Unable to check your new password. Check your connection and try again.');
  }

  const verifier = createClient<Database>(supabaseEnv.url, supabaseEnv.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const proof = await verifier.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (proof.error && proof.error.code !== 'invalid_credentials') {
      throw new AccountSecurityError(proof.error.status === 429
        ? 'Too many attempts. Wait a few minutes before trying again.'
        : 'Unable to verify your current password. Check your connection and try again.');
    }
    if (proof.error || proof.data.user?.id !== user.id || !proof.data.session) {
      throw new AccountSecurityError('Current password is incorrect. Please try again.');
    }
  } finally {
    // Revoke only the temporary proof session; never sign out the active app.
    await verifier.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }

  // A sign-out, account switch or token replacement during current-password
  // verification invalidates this operation. Reject rather than changing the
  // new session's credentials. The authenticated getUser result above supplies
  // the trusted identity; getSession here is only a same-session comparison.
  let current;
  try {
    current = await supabase.auth.getSession();
  } catch {
    throw new AccountSecurityError('Your session changed. Sign in again before changing your password.');
  }
  if (
    current.error ||
    current.data.session?.user.id !== user.id ||
    current.data.session?.access_token !== original.access_token
  ) {
    throw new AccountSecurityError('Your session changed. Sign in again before changing your password.');
  }
  const updated = await supabase.auth.updateUser({
    password: newPassword,
    current_password: currentPassword,
  });
  if (updated.error) {
    throw new AccountSecurityError('Unable to update your password. Please sign in again and try.');
  }

  // Record the security event without submitting either password.
  void supabase.rpc('record_own_auth_event', {
    p_action: 'auth.password_changed',
    p_outcome: 'success',
    p_detail: {},
  });
}
