import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { useTrackingInvalidations } from '@/hooks/useTrackingInvalidations';

/** Private invalidations are hints; the caller always reloads through its secured query. */
export function useAdminTripRefresh(refresh: () => void) {
  const { profile } = useAuth();
  const refreshRef = useRef(refresh);
  const lastSignalCheck = useRef(0);
  refreshRef.current = refresh;
  const check = useCallback(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) refreshRef.current();
  }, []);
  const onInvalidate = useCallback(() => {
    // GPS updates share this topic. Bound overview reads during a busy run;
    // polling and focus still refresh after a final coalesced signal.
    if (Date.now() - lastSignalCheck.current < 5_000) return;
    lastSignalCheck.current = Date.now();
    check();
  }, [check]);

  useTrackingInvalidations({
    topic: profile?.tenant_id ? `safebus:tenant:${profile.tenant_id}` : null,
    onInvalidate,
  });

  useEffect(() => {
    const interval = window.setInterval(check, 15_000);
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', check);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [check]);
}
