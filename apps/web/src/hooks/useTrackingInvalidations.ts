import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  subscribeToTrackingInvalidations,
  type TrackingConnectionState,
} from '@/lib/trackingInvalidations';

export type { TrackingConnectionState } from '@/lib/trackingInvalidations';

interface UseTrackingInvalidationsOptions {
  topic: string | null;
  onInvalidate: () => void;
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
    return subscribeToTrackingInvalidations(client, topic, {
      onState: (state) => setSnapshot({ topic, state }),
      onInvalidate: () => invalidateRef.current(),
      onDisconnected: () => disconnectedRef.current?.(),
    });
  }, [topic]);

  return snapshot.topic === topic ? snapshot.state : initialState;
}
