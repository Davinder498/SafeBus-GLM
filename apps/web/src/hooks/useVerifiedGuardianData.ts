import { useCallback, useEffect, useRef, useState } from 'react';
import { useSharedBusTracking } from '@/hooks/useSharedBusTracking';
import { useAuth } from '@/contexts/useAuth';
import type { TrackingInvalidationKind } from '@/lib/trackingInvalidations';
import { useTrackingInvalidations } from '@/hooks/useTrackingInvalidations';

type LoadState<T> = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: T };
const REFRESH_INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 10_000;

export interface GuardianRefreshPolicy {
  intervalMs?: number;
  jitterMs?: number;
  liveMinIntervalMs?: number;
  maxRetryMs?: number;
  throttleLocationOnly?: boolean;
  sharedTopics?: readonly string[];
}

/** Server authorization remains authoritative; cached data is never an offline fallback. */
export function useVerifiedGuardianData<T>(
  fetchData: (signal: AbortSignal) => Promise<T>,
  scope = '',
  policy: GuardianRefreshPolicy = {},
  selectTrackingTopics?: (data: T) => readonly string[],
) {
  const {
    intervalMs = REFRESH_INTERVAL_MS,
    jitterMs = 0,
    liveMinIntervalMs = 0,
    maxRetryMs = intervalMs,
    throttleLocationOnly = false,
  } = policy;
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [snapshot, setSnapshot] = useState<{
    userId: string | null;
    scope: string;
    state: LoadState<T>;
    refreshing: boolean;
    lastRefreshedAt: string | null;
  }>({ userId, scope, state: { kind: 'loading' }, refreshing: false, lastRefreshedAt: null });
  const loadRef = useRef<(source?: 'live' | 'poll' | 'control') => void>(() => {});
  const clearRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => loadRef.current(), []);
  const clear = useCallback(() => clearRef.current(), []);
  const invalidate = useCallback(
    (kind?: TrackingInvalidationKind) => {
      loadRef.current(throttleLocationOnly && kind !== 'location' ? 'control' : 'live');
    },
    [throttleLocationOnly],
  );
  const current = snapshot.userId === userId && snapshot.scope === scope;
  const topics =
    current && snapshot.state.kind === 'ready'
      ? (selectTrackingTopics?.(snapshot.state.data) ?? policy.sharedTopics ?? [])
      : [];
  const sharedDisconnected = useCallback(() => {
    clear();
    // Losing the shared channel must not cancel the periodic verification loop.
    // Revalidate immediately; hidden/offline guards still prevent network work.
    loadRef.current('control');
  }, [clear]);
  useSharedBusTracking(userId, topics, invalidate, sharedDisconnected);
  const legacyInvalidate = useCallback(
    (kind?: TrackingInvalidationKind) => {
      // Current clients use shared GPS hints plus secured periodic reads. The
      // personal channel remains for control/authorization events only, even
      // while a shared channel is unavailable. Old Android bundles are unchanged.
      if (kind === 'location') return;
      invalidate(kind);
    },
    [invalidate],
  );
  const connectionState = useTrackingInvalidations({
    topic: userId ? `safebus:guardian:${userId}` : null,
    onInvalidate: legacyInvalidate,
    onDisconnected: clear,
  });

  useEffect(() => {
    let disposed = false;
    let queued: 'live' | 'control' | null = null;
    let liveTimer: ReturnType<typeof setTimeout> | null = null;
    let liveEligibleAt = 0;
    let failures = 0;
    const jitter = () => Math.floor(Math.random() * jitterMs);
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
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
      if (pollTimer !== null) clearTimeout(pollTimer);
      pollTimer = null;
      if (liveTimer !== null) clearTimeout(liveTimer);
      liveTimer = null;
      const previous = request;
      request = null;
      queued = null;
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
    const schedulePoll = () => {
      if (disposed) return;
      if (pollTimer !== null) clearTimeout(pollTimer);
      pollTimer = setTimeout(
        () => {
          pollTimer = null;
          load('poll');
        },
        Math.min(maxRetryMs, intervalMs * 2 ** Math.min(failures, 8)) + jitter(),
      );
    };
    const load = (source?: 'live' | 'poll' | 'control') => {
      if (disposed || !userId) return;
      if (!navigator.onLine || document.visibilityState !== 'visible') {
        clearData();
        return;
      }
      // Bound invalidation-driven home traffic even during continuous GPS input.
      // Keep one trailing check; later hints cannot push its deadline back.
      if (source === 'live' && Date.now() < liveEligibleAt) {
        if (liveTimer === null)
          liveTimer = setTimeout(() => {
            liveTimer = null;
            load('live');
          }, liveEligibleAt - Date.now());
        return;
      }
      if (request) {
        // A periodic check cannot make an active verification obsolete. A live
        // event/manual request can, so retain exactly one follow-up for those.
        if (source !== 'poll') {
          const followUp = source === 'live' ? 'live' : 'control';
          if (queued !== 'control') queued = followUp;
        }
        return;
      }
      if (pollTimer !== null) clearTimeout(pollTimer);
      pollTimer = null;

      if (liveTimer !== null) clearTimeout(liveTimer);
      liveTimer = null;
      liveEligibleAt = Date.now() + liveMinIntervalMs + (liveMinIntervalMs ? jitter() : 0);
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
        failures = state.kind === 'error' ? failures + 1 : 0;
        setSnapshot((previous) => ({
          userId,
          scope,
          state,
          refreshing: false,
          lastRefreshedAt:
            state.kind === 'ready' ? new Date().toISOString() : previous.lastRefreshedAt,
        }));
        if (queued) {
          const followUp = queued;
          queued = null;
          queueMicrotask(() => load(followUp));
        } else schedulePoll();
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
    const visibilityChanged = () => {
      if (document.visibilityState === 'visible') load();
      else clearData();
    };
    document.addEventListener('visibilitychange', visibilityChanged);
    // Clear offline data even when realtime is unavailable.
    window.addEventListener('offline', clearData);
    const online = () => load();
    window.addEventListener('online', online);
    return () => {
      disposed = true;
      cancel();
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('offline', clearData);
      window.removeEventListener('online', online);
    };
  }, [
    fetchData,
    scope,
    userId,
    intervalMs,
    jitterMs,
    liveMinIntervalMs,
    maxRetryMs,
    throttleLocationOnly,
  ]);

  // Hide the previous principal/scope before effect cleanup runs.
  return {
    state: current ? snapshot.state : { kind: 'loading' as const },
    refreshing: current && snapshot.refreshing,
    lastRefreshedAt: current ? snapshot.lastRefreshedAt : null,
    connectionState,
    refresh,
  };
}
