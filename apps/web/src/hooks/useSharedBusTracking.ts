import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  subscribeToTrackingInvalidations,
  type TrackingInvalidationKind,
} from '@/lib/trackingInvalidations';

import { validBusTrackingTopic } from '@/lib/sharedBusTracking';

/** Shares signals only. A topic is never proof of permission to read location. */
export function useSharedBusTracking(
  userId: string | null,
  topics: readonly string[],
  onInvalidate: (kind?: TrackingInvalidationKind) => void,
  onDisconnected: () => void,
): boolean {
  const topicKey = JSON.stringify([...new Set(topics.filter(validBusTrackingTopic))].sort());
  const key = JSON.stringify([userId, topicKey]);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const callbacks = useRef({ onInvalidate, onDisconnected });
  callbacks.current = { onInvalidate, onDisconnected };
  useEffect(() => {
    const client = supabase;
    const selected = JSON.parse(topicKey) as string[];
    if (!client || !userId || selected.length === 0) return;
    let disposed = false;
    let releases: (() => void)[] = [];
    const connected = new Set<string>();
    const reconcile = () => {
      if (!navigator.onLine || document.visibilityState !== 'visible') {
        for (const release of releases) release();
        releases = [];
        connected.clear();
        setReadyKey(null);
      } else if (releases.length === 0) {
        releases = selected.map((topic) =>
          subscribeToTrackingInvalidations(client, topic, {
            onState: (state) => {
              if (disposed) return;
              if (state === 'connected') connected.add(topic);
              else connected.delete(topic);
              setReadyKey(connected.size === selected.length ? key : null);
            },
            onInvalidate: (kind) => {
              if (!disposed) callbacks.current.onInvalidate(kind);
            },
            onDisconnected: () => {
              if (!disposed) callbacks.current.onDisconnected();
            },
          }),
        );
      }
    };
    reconcile();
    document.addEventListener('visibilitychange', reconcile);
    window.addEventListener('online', reconcile);
    window.addEventListener('offline', reconcile);
    return () => {
      disposed = true;
      for (const release of releases) release();
      document.removeEventListener('visibilitychange', reconcile);
      window.removeEventListener('online', reconcile);
      window.removeEventListener('offline', reconcile);
    };
  }, [key, topicKey, userId]);
  return readyKey === key && topics.length > 0;
}
