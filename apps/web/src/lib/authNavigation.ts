import type { AppSurface } from '@/contexts/AppSurfaceContext';

export const ANDROID_PASSWORD_RESET_REDIRECT = 'com.safebusalberta.app://auth/update-password';

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getPasswordResetRedirect(surface: AppSurface, webOrigin: string): string {
  return surface === 'native-mobile'
    ? ANDROID_PASSWORD_RESET_REDIRECT
    : `${webOrigin}/update-password`;
}

/**
 * Supabase can return a valid recovery session to the configured Site URL when
 * a requested redirect is unavailable. Always move that session to the
 * password form and replace the URL so recovery credentials cannot remain in
 * browser history.
 */
export function navigateToPasswordUpdate(): void {
  window.history.replaceState({}, '', '/update-password');
  window.dispatchEvent(new PopStateEvent('popstate'));
}
