import type { RealtimeChannel } from '@supabase/supabase-js';
import type { SafeBusSupabaseClient } from '@/lib/supabase';

export type TrackingConnectionState =
  'connecting' | 'connected' | 'reconnecting' | 'offline' | 'unavailable';

interface Listener {
  onState: (state: TrackingConnectionState) => void;
  onInvalidate: () => void;
  onDisconnected: () => void;
}

interface Entry {
  listeners: Set<Listener>;
  state: TrackingConnectionState;
  start: () => void;
  close: () => Promise<void>;
}

interface Pool {
  active: Map<string, Entry>;
  closing: Map<string, Promise<void>>;
}

const pools = new WeakMap<SafeBusSupabaseClient, Pool>();
const INVALIDATION_COALESCE_MS = 150;

/** Shares only coordinate-free signals, never fetched data or authorization results. */
function createEntry(client: SafeBusSupabaseClient, topic: string): Entry {
  let disposed = false;
  let hasJoined = false;
  let channel: RealtimeChannel | null = null;
  let invalidateTimer: ReturnType<typeof setTimeout> | null = null;
  let stableTimer: ReturnType<typeof setTimeout> | null = null;
  const entry: Entry = {
    listeners: new Set(),
    state: navigator.onLine ? 'connecting' : 'offline',
    start,
    close,
  };

  function setState(state: TrackingConnectionState) {
    if (disposed) return;
    entry.state = state;
    for (const listener of entry.listeners) listener.onState(state);
  }

  function cancelStableTimer() {
    if (stableTimer !== null) clearTimeout(stableTimer);
    stableTimer = null;
  }

  function invalidate() {
    if (
      disposed ||
      invalidateTimer !== null ||
      !navigator.onLine ||
      document.visibilityState !== 'visible'
    )
      return;
    invalidateTimer = setTimeout(() => {
      invalidateTimer = null;
      if (disposed || !navigator.onLine || document.visibilityState !== 'visible') return;
      for (const listener of entry.listeners) listener.onInvalidate();
    }, INVALIDATION_COALESCE_MS);
  }

  function disconnect(state: TrackingConnectionState) {
    if (disposed) return;
    cancelStableTimer();
    setState(state);
    // Clear each consumer before permitting any new authoritative RPC response.
    for (const listener of entry.listeners) listener.onDisconnected();
    invalidate();
  }

  const offline = () => disconnect('offline');
  const online = () => {
    setState(hasJoined ? 'reconnecting' : 'connecting');
    invalidate();
  };

  function start() {
    if (disposed) return;
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    try {
      channel = client.channel(topic, { config: { private: true } });
      channel.on('broadcast', { event: 'tracking_changed' }, invalidate).subscribe((status) => {
        if (disposed) return;
        if (status === 'SUBSCRIBED') {
          hasJoined = true;
          cancelStableTimer();
          invalidate();
          stableTimer = setTimeout(() => {
            stableTimer = null;
            if (disposed || !navigator.onLine) return;
            setState('connected');
          }, 1_000);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          cancelStableTimer();
          if (hasJoined) disconnect(navigator.onLine ? 'reconnecting' : 'offline');
          else setState(navigator.onLine ? 'unavailable' : 'offline');
        }
      });
    } catch {
      setState(navigator.onLine ? 'unavailable' : 'offline');
    }
  }

  async function close() {
    disposed = true;
    window.removeEventListener('offline', offline);
    window.removeEventListener('online', online);
    if (invalidateTimer !== null) clearTimeout(invalidateTimer);
    cancelStableTimer();
    if (channel) {
      try {
        await client.removeChannel(channel);
      } catch {
        // Polling remains authoritative; local teardown still releases this topic.
      } finally {
        channel.teardown();
      }
    }
  }

  return entry;
}

/** Last consumer owns teardown. A replacement waits for the old topic to be released. */
export function subscribeToTrackingInvalidations(
  client: SafeBusSupabaseClient,
  topic: string,
  listener: Listener,
): () => void {
  let pool = pools.get(client);
  if (!pool) {
    pool = { active: new Map(), closing: new Map() };
    pools.set(client, pool);
  }
  let entry = pool.active.get(topic);
  const created = !entry;
  if (!entry) {
    entry = createEntry(client, topic);
    pool.active.set(topic, entry);
  }
  entry.listeners.add(listener);
  listener.onState(entry.state);
  if (created) {
    const previous = pool.closing.get(topic);
    if (previous) void previous.then(entry.start);
    else entry.start();
  }

  const owner = pool;
  const subscription = entry;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    subscription.listeners.delete(listener);
    if (subscription.listeners.size !== 0) return;
    if (owner.active.get(topic) === subscription) owner.active.delete(topic);
    const previous = owner.closing.get(topic);
    const disposal = subscription.close();
    // Preserve an earlier teardown even if this replacement unmounts before
    // it starts (StrictMode or fast navigation can create several generations).
    const closing = Promise.all([previous, disposal]).then(() => {});
    owner.closing.set(topic, closing);
    void closing.then(() => {
      if (owner.closing.get(topic) === closing) owner.closing.delete(topic);
    });
  };
}
