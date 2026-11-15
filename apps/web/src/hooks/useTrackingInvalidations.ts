import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  subscribeToTrackingInvalidations,
  type TrackingConnectionState,
  type TrackingInvalidationKind,
} from '@/lib/trackingInvalidations';

export type { TrackingConnectionState } from '@/lib/trackingInvalidations';

interface UseTrackingInvalidationsOptions {
  topic: string | null;
  onInvalidate: (kind?: TrackingInvalidationKind) => void;
  onDisconnected?: () => void;
}

/** Receive-only private signals; each consumer still performs its own secured RPC. */
export function useTrackingInvalidations({
  topic,
  onInvalidate,
  onDisconnected,
}: UseTrackingInvalidationsOptions): TrackingConnectionState {
  const initialState: TrackingConnectionState =
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'connecting';
  const [snapshot, setSnapshot] = useState<{
    topic: string | null;
    state: TrackingConnectionState;
  }>({ topic, state: initialState });
  const invalidateRef = useRef(onInvalidate);
  const disconnectedRef = useRef(onDisconnected);
  invalidateRef.current = onInvalidate;
  disconnectedRef.current = onDisconnected;

  useEffect(() => {
    const client = supabase;
    if (!client || !topic) {
      setSnapshot({ topic, state: 'unavailable' });
      return;
    }
    let release: (() => void) | null = null;
    const reconcile = () => {
      const active = navigator.onLine && document.visibilityState === 'visible';
      if (!active) {
        release?.();
        release = null;
        setSnapshot({ topic, state: navigator.onLine ? 'unavailable' : 'offline' });
        disconnectedRef.current?.();
      } else if (!release) {
        release = subscribeToTrackingInvalidations(client, topic, {
          onState: (state) => setSnapshot({ topic, state }),
          onInvalidate: (kind) => invalidateRef.current(kind),
          onDisconnected: () => disconnectedRef.current?.(),
        });
      }
    };
    reconcile();
    document.addEventListener('visibilitychange', reconcile);
    window.addEventListener('offline', reconcile);
    window.addEventListener('online', reconcile);
    return () => {
      document.removeEventListener('visibilitychange', reconcile);
      window.removeEventListener('offline', reconcile);
      window.removeEventListener('online', reconcile);
      release?.();
    };
  }, [topic]);

  return snapshot.topic === topic ? snapshot.state : initialState;
}
