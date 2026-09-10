import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationCategory, UserNotification } from '@safebus/types';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Archive, CheckCheck, Settings, X } from 'lucide-react';
import { DashboardLayout, adminNavGroups, driverNavGroups, guardianNavGroups, platformNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/useAuth';
import { useNotifications } from '@/contexts/useNotifications';
import { archiveNotifications, fetchNotifications, markAllNotificationsRead, setNotificationsRead } from '@/services/notificationService';

const categories: Array<{ value: NotificationCategory | ''; label: string }> = [
  { value: '', label: 'All' }, { value: 'trip_status', label: 'Trips' },
  { value: 'operations', label: 'Operations' }, { value: 'pickup_dropoff', label: 'Pickup & drop-off' },
  { value: 'service_changes', label: 'Service changes' }, { value: 'assignments', label: 'Assignments' },
  { value: 'delivery_health', label: 'Delivery health' }, { value: 'platform', label: 'Platform' },
];

export function NotificationsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedId = searchParams.get('notification');
  const { profile } = useAuth();
  const { connectionState, refreshNotifications } = useNotifications();
  const [items, setItems] = useState<UserNotification[]>([]);
  const [category, setCategory] = useState<NotificationCategory | ''>('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const markedFromLink = useRef(new Set<string>());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const rows = await fetchNotifications({ limit: 30, unreadOnly, category: category || null }); setItems(rows); setHasMore(rows.length === 30); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Notifications are temporarily unavailable.'); }
    finally { setLoading(false); }
  }, [category, unreadOnly]);
  useEffect(() => { void load(); }, [load]);

  const admin = profile?.role && ['tenant_admin','school_admin','transportation_admin'].includes(profile.role);
  const portal = admin || profile?.role === 'platform_super_admin' ? 'admin' : profile?.role === 'driver' ? 'driver' : 'parent';
  const navGroups = profile?.role === 'platform_super_admin' ? platformNavGroups : admin ? adminNavGroups : profile?.role === 'driver' ? driverNavGroups : guardianNavGroups;

  const selectedItem = requestedId ? items.find((item) => item.id === requestedId) ?? null : null;

  const setReadState = useCallback(async (item: UserNotification, read: boolean) => {
    setActionError(null);
    try {
      await setNotificationsRead([item.id], read);
      setItems((current) => current.map((row) => row.id === item.id
        ? { ...row, readAt: read ? row.readAt ?? new Date().toISOString() : null }
        : row));
      await refreshNotifications();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Unable to update this notification.');
    }
  }, [refreshNotifications]);

  useEffect(() => {
    if (!selectedItem) return;
    detailHeadingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (!selectedItem.readAt && !markedFromLink.current.has(selectedItem.id)) {
      markedFromLink.current.add(selectedItem.id);
      void setReadState(selectedItem, true);
    }
  }, [selectedItem, setReadState]);

  function openNotification(item: UserNotification) {
    navigate(item.destinationPath);
  }
  async function archive(item: UserNotification) {
    await archiveNotifications([item.id]); await Promise.all([load(), refreshNotifications()]);
  }
  async function loadMore() {
    const last = items.at(-1); if (!last) return;
    setLoadingMore(true);
    try { const rows = await fetchNotifications({ limit: 30, cursor: { createdAt: last.createdAt, id: last.id }, unreadOnly, category: category || null }); setItems((current) => [...current, ...rows]); setHasMore(rows.length === 30); }
    finally { setLoadingMore(false); }
  }

  return <DashboardLayout title="Notifications" portal={portal} navItems={[]} navGroups={navGroups}>
    <PageHeader title="Notifications" description="Your authoritative BusSafe inbox. In-app updates remain available regardless of push settings."
      action={<Link to="/notifications/settings"><Button variant="secondary"><Settings className="mr-2 h-4 w-4" />Settings</Button></Link>} />
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <label className="text-sm font-medium text-slate-700">Category <select value={category} onChange={(e)=>setCategory(e.target.value as NotificationCategory | '')} className="ml-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
        {categories.map((option)=><option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>
      <label className="flex items-center gap-2 text-sm font-medium text-slate-700"><input type="checkbox" checked={unreadOnly} onChange={(e)=>setUnreadOnly(e.target.checked)} />Unread only</label>
      <Button variant="secondary" onClick={()=>void (async()=>{await markAllNotificationsRead();await Promise.all([load(),refreshNotifications()]);})()}><CheckCheck className="mr-2 h-4 w-4" />Mark all read</Button>
      <span className="text-xs text-slate-500" aria-live="polite">{connectionState === 'connected' ? 'Live updates connected' : connectionState === 'offline' ? 'Offline — showing saved results' : 'Updates refresh automatically'}</span>
    </div>
    {actionError ? <Card className="mb-4 border-red-200 bg-red-50 p-4" role="alert"><p className="text-sm text-red-800">{actionError}</p></Card> : null}
    {selectedItem ? <Card className="mb-4 border-blue-300 bg-blue-50/40 p-5" role="region" aria-labelledby="notification-detail-heading">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="notification-detail-heading" className="text-sm font-semibold uppercase tracking-wide text-blue-700">Notification details</h2>
          <h3 ref={detailHeadingRef} tabIndex={-1} className="mt-2 text-xl font-semibold text-slate-950 outline-none">{selectedItem.title}</h3>
        </div>
        <Button variant="ghost" onClick={()=>navigate('/notifications')} aria-label="Close notification details"><X className="h-5 w-5" /></Button>
      </div>
      <p className="mt-3 text-slate-700">{selectedItem.body}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="font-medium text-slate-500">Category</dt><dd className="mt-1 capitalize text-slate-900">{selectedItem.category.replace('_', ' ')}</dd></div>
        <div><dt className="font-medium text-slate-500">Priority</dt><dd className="mt-1 capitalize text-slate-900">{selectedItem.severity}</dd></div>
        <div><dt className="font-medium text-slate-500">Received</dt><dd className="mt-1 text-slate-900"><time dateTime={selectedItem.occurredAt}>{new Date(selectedItem.occurredAt).toLocaleString()}</time></dd></div>
      </dl>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={()=>void setReadState(selectedItem, !selectedItem.readAt)}>{selectedItem.readAt ? 'Mark unread' : 'Mark read'}</Button>
        <Button variant="ghost" onClick={()=>void archive(selectedItem)}><Archive className="mr-2 h-4 w-4" />Archive</Button>
      </div>
    </Card> : null}
    {!loading && !error && requestedId && !items.some((item)=>item.id===requestedId)?<Card className="mb-4 border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold text-slate-950">This notification is no longer available</h2><p className="mt-1 text-sm text-slate-600">It may have expired, been archived, or your access may have changed.</p></Card>:null}
    {loading ? <DataState title="Loading notifications" message="Checking your authorized inbox." /> : error ? <DataState title="Notifications unavailable" message={error} /> : items.length === 0 ? <DataState title="You’re all caught up" message="No notifications match these filters." /> : <div className="space-y-3">
      {items.map((item)=><Card key={item.id} className={`p-4 ${item.id===requestedId?'ring-2 ring-blue-500 ':''}${item.readAt ? '' : 'border-blue-300 bg-blue-50/40'}`}>
        <div className="flex items-start justify-between gap-4"><button className="min-w-0 flex-1 text-left" onClick={()=>openNotification(item)} aria-label={`Open notification: ${item.title}`}>
          <span className="flex items-center gap-2"><span className="font-semibold text-slate-950">{item.title}</span>{!item.readAt?<span className="h-2 w-2 rounded-full bg-blue-600" aria-label="Unread"/>:null}</span>
          <span className="mt-1 block text-sm text-slate-600">{item.body}</span><time className="mt-2 block text-xs text-slate-500" dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleString()}</time>
        </button><Button variant="ghost" onClick={()=>void archive(item)} aria-label={`Archive ${item.title}`}><Archive className="h-4 w-4" /></Button></div>
      </Card>)}
      {hasMore?<Button variant="secondary" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?'Loading…':'Load more'}</Button>:null}
    </div>}
  </DashboardLayout>;
}
