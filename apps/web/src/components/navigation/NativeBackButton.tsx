import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';
import { useAppSurface } from '@/contexts/AppSurfaceContext';

export function nativeParent(path: string, driver: boolean): string {
  if (path === '/account') return driver ? '/driver' : '/parent';
  if (path === '/account/security/password' || path === '/account/security/mfa')
    return '/account/security';
  if (path === '/account-deletion') return '/privacy';
  if (
    path.startsWith('/account') ||
    path === '/privacy' ||
    path === '/support' ||
    path.includes('/settings')
  )
    return '/account';
  if (path.startsWith('/guardian/buses/')) return '/guardian/routes';
  if (path.startsWith('/driver/') || (driver && path === '/notifications')) return '/driver';
  if (path === '/reset-password' || path === '/update-password' || path === '/accept-invitation')
    return '/login';
  return '/parent';
}

export function isNativeRoot(path: string, driver: boolean, search = ''): boolean {
  if (path === '/account') return true;
  if (driver) return ['/driver', '/driver/pickup-drop-off', '/driver/history'].includes(path);
  return (
    ['/parent', '/guardian/routes', '/notifications'].includes(path) &&
    !(path === '/notifications' && new URLSearchParams(search).has('notification'))
  );
}

/** Pop in-app history; direct entry always has a safe, explicit parent. */
export function NativeBackButton({
  fallback,
  label = 'Back',
}: {
  fallback: string;
  label?: string;
}) {
  const surface = useAppSurface();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (surface !== 'native-mobile') return null;
  return (
    <button
      type="button"
      aria-label={label}
      data-ui="native-back"
      className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus)]"
      onClick={() => {
        // Password recovery and invitation entry must not navigate back into an external link.
        if (
          !['/reset-password', '/update-password', '/accept-invitation'].includes(pathname) &&
          typeof window.history.state?.idx === 'number' &&
          window.history.state.idx > 0
        )
          navigate(-1);
        else navigate(fallback, { replace: true });
      }}
    >
      <ArrowLeft className="h-6 w-6" aria-hidden />
    </button>
  );
}
