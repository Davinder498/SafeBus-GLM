import { createClient } from '@supabase/supabase-js';
import type { Database } from '@safebus/types/database';
import { supabase, supabaseConfigError, supabaseEnv } from '@/lib/supabase';

/**
 * Verify knowledge of the current password in an isolated, non-persistent
 * Supabase Auth client. Unlike updateUser({ current_password }), this check
 * fails closed even if the hosted Auth project option is not yet enabled.
 * Never reuse the temporary session as the application's signed-in session.
 */
export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  if (!supabase || !supabaseEnv.url || !supabaseEnv.anonKey) {
    throw new Error(supabaseConfigError ?? 'Account security is unavailable.');
  }

  const existing = await supabase.auth.getUser();
  const user = existing.data.user;
  if (existing.error || !user?.id || !user.email) {
    throw new Error('Sign in again before changing your password.');
  }

  if (!currentPassword || currentPassword === newPassword) {
    throw new Error('Choose a new password different from your current password.');
  }

  const policy = await supabase.rpc('enforce_new_password_policy', { p_password: newPassword });
  if (policy.error) throw new Error('Your new password does not meet SafeBus password requirements.');

  const verifier = createClient<Database>(supabaseEnv.url, supabaseEnv.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  try {
    const proof = await verifier.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (proof.error || proof.data.user?.id !== user.id || !proof.data.session) {
      throw new Error('Current password is incorrect. Please try again.');
    }
  } finally {
    // Revoke only the temporary proof session; never sign out the active app.
    await verifier.auth.signOut({ scope: 'local' }).catch(() => undefined);
  }

  const updated = await supabase.auth.updateUser({
    password: newPassword,
    current_password: currentPassword,
  });
  if (updated.error) {
    throw new Error('Unable to update your password. Please sign in again and try.');
  }

  // Record the security event without submitting either password.
  void supabase.rpc('record_own_auth_event', {
    p_action: 'auth.password_changed',
    p_outcome: 'success',
    p_detail: {},
  });
}
