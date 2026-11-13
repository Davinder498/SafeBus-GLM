import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/contexts/useAuth';
import { installBackNavigation } from './backNavigation';

// Serialize native setup/teardown, including React StrictMode's development replay.
let lifecycle = Promise.resolve();

export function NativeNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const { profile } = useAuth();
  const current = useRef({ pathname: location.pathname, home: '/login' });
  current.current = { pathname: location.pathname,
    home: profile?.role === 'driver' ? '/driver' : profile?.role === 'guardian' ? '/parent' : '/login' };
  const refresh = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let stopped = false;
    let dispose: (() => Promise<void>) | undefined;
    const setup = lifecycle.then(async () => {
      if (stopped) return;
      const controller = await installBackNavigation(
      () => ({ ...current.current, historyIndex: Number(window.history.state?.idx ?? 0) }),
      (destination) => {
        if (typeof destination === 'number') void navigateRef.current(destination);
        else void navigateRef.current(destination, { replace: true });
      },
      );
      if (stopped) await controller.dispose();
      else { dispose = controller.dispose; refresh.current = controller.refresh; }
    }).catch(() => undefined);
    lifecycle = setup;
    return () => {
      stopped = true;
      refresh.current = undefined;
      lifecycle = setup.then(async () => { await dispose?.(); }).catch(() => undefined);
    };
  }, []);
  useEffect(() => { refresh.current?.(); }, [location, profile?.role]);
  return null;
}
