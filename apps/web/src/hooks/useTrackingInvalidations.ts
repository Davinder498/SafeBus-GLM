import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type TrackingConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'
  | 'unavailable';

interface UseTrackingInvalidationsOptions {
  topic: string | null;
  onInvalidate: () => void;
  onDisconnected?: () => void;
}

const INVALIDATION_COALESCE_MS = 150;

/** Subscribe to a receive-only private topic. Payloads are never trusted. */
export function useTrackingInvalidations({
  topic,
  onInvalidate,
  onDisconnected,
}: UseTrackingInvalidationsOptions): TrackingConnectionState {
  const [state, setState] = useState<TrackingConnectionState>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'connecting',
  );
  const invalidateRef = useRef(onInvalidate);
  const disconnectedRef = useRef(onDisconnected);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasConnectedRef = useRef(false);

  invalidateRef.current = onInvalidate;
  disconnectedRef.current = onDisconnected;

  const scheduleInvalidate = useCallback(() => {
    if (debounceRef.current) return;
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      invalidateRef.current();
    }, INVALIDATION_COALESCE_MS);
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client || !topic) {
      setState('unavailable');
      return;
    }

    let disposed = false;
    let stableConnectionTimer: ReturnType<typeof setTimeout> | null = null;
    setState(navigator.onLine ? 'connecting' : 'offline');

    const markDisconnected = (nextState: TrackingConnectionState) => {
      if (disposed) return;
      setState(nextState);
      disconnectedRef.current?.();
      scheduleInvalidate();
    };
    const handleOffline = () => markDisconnected('offline');
    const handleOnline = () => {
      if (disposed) return;
      setState(wasConnectedRef.current ? 'reconnecting' : 'connecting');
      scheduleInvalidate();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    const channel = client
      .channel(topic, { config: { private: true } })
      .on('broadcast', { event: 'tracking_changed' }, scheduleInvalidate)
      .subscribe((status) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          scheduleInvalidate();
          stableConnectionTimer = setTimeout(() => {
            if (disposed) return;
            wasConnectedRef.current = true;
            setState('connected');
          }, 1_000);
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          if (stableConnectionTimer) {
            clearTimeout(stableConnectionTimer);
            stableConnectionTimer = null;
          }
          if (wasConnectedRef.current) {
            markDisconnected(navigator.onLine ? 'reconnecting' : 'offline');
          } else {
            // Realtime may be unavailable or disabled for an environment. The
            // secured polling path remains authoritative and usable.
            setState(navigator.onLine ? 'unavailable' : 'offline');
          }
        }
      });

    return () => {
      disposed = true;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (stableConnectionTimer) clearTimeout(stableConnectionTimer);
      void client.removeChannel(channel);
    };
  }, [scheduleInvalidate, topic]);

  return state;
}
