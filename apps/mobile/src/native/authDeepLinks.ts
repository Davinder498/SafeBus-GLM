import { App as CapacitorApp } from '@capacitor/app';
import { supabase } from '@/lib/supabase';
import { parseNativePasswordRecoveryLink } from './authDeepLinkParsing';

let lastHandledUrl: string | null = null;

function navigateWithoutAuthTokens(path: string): void {
  window.history.replaceState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

async function handleNativeAuthUrl(value: string): Promise<void> {
  if (value === lastHandledUrl) return;
  const recovery = parseNativePasswordRecoveryLink(value);
  if (!recovery) return;
  lastHandledUrl = value;

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
  } catch (error) {
    sessionStorage.setItem(
      'safebus.passwordRecoveryError',
      error instanceof Error ? error.message : 'The password reset link is invalid or expired.',
    );
  } finally {
    navigateWithoutAuthTokens(recovery.destinationPath);
  }
}

export async function installNativeAuthDeepLinks(): Promise<void> {
  await CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    void handleNativeAuthUrl(url);
  });

  const launch = await CapacitorApp.getLaunchUrl();
  if (launch?.url) await handleNativeAuthUrl(launch.url);
}
