import type { AppSurface } from '@/contexts/AppSurfaceContext';

export const ANDROID_PASSWORD_RESET_REDIRECT =
  'com.safebusalberta.app://auth/update-password';

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getPasswordResetRedirect(surface: AppSurface, webOrigin: string): string {
  return surface === 'native-mobile'
    ? ANDROID_PASSWORD_RESET_REDIRECT
    : `${webOrigin}/update-password`;
}
