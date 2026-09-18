import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { useTrackingInvalidations } from '@/hooks/useTrackingInvalidations';

type LoadState<T> = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: T };
const REFRESH_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;

/** Server authorization remains authoritative; cached data is never an offline fallback. */
export function useVerifiedGuardianData<T>(
  fetchData: (signal: AbortSignal) => Promise<T>,
  scope = '',
) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [snapshot, setSnapshot] = useState<{
    userId: string | null;
    scope: string;
    state: LoadState<T>;
    refreshing: boolean;
    lastRefreshedAt: string | null;
  }>({ userId, scope, state: { kind: 'loading' }, refreshing: false, lastRefreshedAt: null });
  const loadRef = useRef<() => void>(() => {});
  const clearRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => loadRef.current(), []);
  const clear = useCallback(() => clearRef.current(), []);
  const connectionState = useTrackingInvalidations({
    topic: userId ? `safebus:guardian:${userId}` : null,
    onInvalidate: refresh,
    onDisconnected: clear,
  });

  useEffect(() => {
    let disposed = false;
    let queued = false;
    let request: { controller: AbortController; timeout: ReturnType<typeof setTimeout> } | null =
      null;
    setSnapshot({
      userId,
      scope,
      state: { kind: 'loading' },
      refreshing: false,
      lastRefreshedAt: null,
    });

    const cancel = () => {
      const previous = request;
      request = null;
      queued = false;
      if (previous) {
        clearTimeout(previous.timeout);
        previous.controller.abort();
      }
    };
    const clearData = () => {
      cancel();
      if (!disposed)
        setSnapshot((previous) => ({ ...previous, state: { kind: 'error' }, refreshing: false }));
    };
    const load = () => {
      if (disposed || !userId) return;
      if (!navigator.onLine || document.visibilityState !== 'visible') {
        clearData();
        return;
      }
      if (request) {
        queued = true;
        return;
      }

      const controller = new AbortController();
      const current = {
        controller,
        timeout: setTimeout(() => {
          finish({ kind: 'error' });
          controller.abort();
        }, REQUEST_TIMEOUT_MS),
      };
      request = current;
      setSnapshot((previous) => ({ ...previous, refreshing: true }));

      // Release the UI even if authentication or a transport ignores abort.
      function finish(state: LoadState<T>) {
        if (disposed || request !== current) return;
        clearTimeout(current.timeout);
        request = null;
        if (state.kind === 'error') controller.abort();
        setSnapshot((previous) => ({
          userId,
          scope,
          state,
          refreshing: false,
          lastRefreshedAt:
            state.kind === 'ready' ? new Date().toISOString() : previous.lastRefreshedAt,
        }));
        if (queued) {
          queued = false;
          queueMicrotask(load);
        }
      }
      void Promise.resolve()
        .then(() => {
          if (controller.signal.aborted) throw new Error('Request cancelled');
          return fetchData(controller.signal);
        })
        .then(
          (data) => finish({ kind: 'ready', data }),
          () => finish({ kind: 'error' }),
        );
    };
    loadRef.current = load;
    clearRef.current = clearData;
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, REFRESH_INTERVAL_MS);
    const visibilityChanged = () => {
      if (document.visibilityState === 'visible') load();
      else clearData();
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    // Clear offline data even when realtime is unavailable.
    window.addEventListener('offline', clearData);
    window.addEventListener('online', load);
    return () => {
      disposed = true;
      cancel();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('offline', clearData);
      window.removeEventListener('online', load);
    };
  }, [fetchData, scope, userId]);

  // Hide the previous principal/scope before effect cleanup runs.
  const current = snapshot.userId === userId && snapshot.scope === scope;
  return {
    state: current ? snapshot.state : { kind: 'loading' as const },
    refreshing: current && snapshot.refreshing,
    lastRefreshedAt: current ? snapshot.lastRefreshedAt : null,
    connectionState,
    refresh,
  };
}
