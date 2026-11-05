import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from '@/lib/supabase';
import { navigateToPasswordUpdate } from '@/lib/authNavigation';
import { parseNativePasswordRecoveryLink } from './authDeepLinkParsing';

let lastHandledUrl: string | null = null;
const pendingLinks = new Map<string, Promise<void>>();
let recoveryQueue: Promise<void> = Promise.resolve();

function handleNativeAuthUrl(value: string): Promise<void> {
  if (value === lastHandledUrl) return Promise.resolve();
  const recovery = parseNativePasswordRecoveryLink(value);
  if (!recovery) return Promise.resolve();
  const existing = pendingLinks.get(value);
  if (existing) return existing;

  // Cold-start and appUrlOpen can deliver the same one-time link. Coalesce
  // duplicates, and process different links in the order the user opens them.
  const pending = recoveryQueue
    .then(async () => {
      try {
        if (!supabase) throw new Error('Supabase is not configured.');
        if (recovery.errorDescription) throw new Error(recovery.errorDescription);

        if (recovery.accessToken && recovery.refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: recovery.accessToken,
            refresh_token: recovery.refreshToken,
          });
          if (error) throw error;
        } else if (recovery.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(recovery.code);
          if (error) throw error;
        } else if (recovery.tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: recovery.tokenHash,
            type: 'recovery',
          });
          if (error) throw error;
        } else {
          throw new Error('The password reset link is incomplete.');
        }

        sessionStorage.removeItem('safebus.passwordRecoveryError');
        // A failure must remain retryable: only remember a confirmed exchange.
        lastHandledUrl = value;
      } catch {
        sessionStorage.setItem(
          'safebus.passwordRecoveryError',
          'Unable to verify this password reset link. Check your connection and reopen it, or request a new link.',
        );
      } finally {
        navigateToPasswordUpdate();
      }
    })
    .finally(() => {
      pendingLinks.delete(value);
    });
  pendingLinks.set(value, pending);
  // Keep a failed handler from blocking subsequent user-initiated attempts.
  recoveryQueue = pending.catch(() => undefined);
  return pending;
}

export async function installNativeAuthDeepLinks(): Promise<void> {
  await CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    void handleNativeAuthUrl(url);
  });

  const launch = await CapacitorApp.getLaunchUrl();
  if (launch?.url) await handleNativeAuthUrl(launch.url);
}
