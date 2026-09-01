import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { UserNotification } from '@safebus/types';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/useAuth';
import { fetchNotificationPreferences, fetchNotifications, fetchUnreadNotificationCount } from '@/services/notificationService';

export interface NotificationContextValue {
  unreadCount: number;
  connectionState: 'idle' | 'connected' | 'polling' | 'offline';
  refreshNotifications: () => Promise<void>;
}

export const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [connectionState, setConnectionState] = useState<NotificationContextValue['connectionState']>('idle');
  const [toast, setToast] = useState<UserNotification | null>(null);
  const previousNewest = useRef<string | null>(null);

  const refreshNotifications = useCallback(async () => {
    if (!user || !profile) { setUnreadCount(0); return; }
    try {
      const [count, latest] = await Promise.all([fetchUnreadNotificationCount(), fetchNotifications({ limit: 1 })]);
      setUnreadCount(count);
      const newest = latest[0];
      if (newest && previousNewest.current && newest.id !== previousNewest.current && document.visibilityState === 'visible') {
        setToast(newest);
        window.setTimeout(() => setToast((current) => current?.id === newest.id ? null : current), 6000);
      }
      previousNewest.current = newest?.id ?? previousNewest.current;
    } catch {
      setConnectionState(navigator.onLine ? 'polling' : 'offline');
    }
  }, [profile, user]);

  useEffect(() => {
    if (!user || !profile || !supabase) { setUnreadCount(0); setConnectionState('idle'); return; }
    void refreshNotifications();
    if (window.SafeBusNativePush) {
      void fetchNotificationPreferences().then((preferences) => preferences.pushEnabled
        ? window.SafeBusNativePush?.refresh()
        : window.SafeBusNativePush?.deactivate()).catch(() => undefined);
    }
    const pendingPath = sessionStorage.getItem('safebus.pendingNotificationPath');
    if (pendingPath?.startsWith('/notifications')) {
      sessionStorage.removeItem('safebus.pendingNotificationPath');
      if (`${window.location.pathname}${window.location.search}` !== pendingPath) window.location.assign(pendingPath);
    }
    const handleVisible = () => { if (document.visibilityState === 'visible') void refreshNotifications(); };
    const handleOnline = () => { setConnectionState('polling'); void refreshNotifications(); };
    const handleOffline = () => setConnectionState('offline');
    const handlePush = () => void refreshNotifications();
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('safebus:push-received', handlePush);
    const interval = window.setInterval(() => { if (navigator.onLine) void refreshNotifications(); }, 60_000);
    const channel = supabase.channel(`safebus:notifications:${user.id}`, { config: { private: true } })
      .on('broadcast', { event: 'notification_changed' }, () => void refreshNotifications())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setConnectionState('connected');
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') setConnectionState(navigator.onLine ? 'polling' : 'offline');
      });
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('safebus:push-received', handlePush);
      void supabase?.removeChannel(channel);
    };
  }, [profile, refreshNotifications, user]);

  const value = useMemo(() => ({ unreadCount, connectionState, refreshNotifications }), [connectionState, refreshNotifications, unreadCount]);
  return <NotificationContext.Provider value={value}>
    {children}
    <div aria-live="polite" aria-atomic="true" className="fixed right-4 top-4 z-[100] max-w-sm">
      {toast ? <button type="button" onClick={() => { window.location.assign(toast.destinationPath); }}
        className="rounded-xl border border-blue-200 bg-white p-4 text-left shadow-xl">
        <span className="block font-semibold text-slate-950">{toast.title}</span>
        <span className="mt-1 block text-sm text-slate-600">{toast.body}</span>
      </button> : null}
    </div>
  </NotificationContext.Provider>;
}
