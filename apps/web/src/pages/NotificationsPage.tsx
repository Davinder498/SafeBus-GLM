import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationCategory, UserNotification } from '@safebus/types';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Archive, ArrowRight, CheckCheck, Settings, X } from 'lucide-react';
import {
  DashboardLayout,
  adminNavGroups,
  driverNavGroups,
  guardianNavGroups,
  platformNavGroups,
} from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { useAuth } from '@/contexts/useAuth';
import { useNotifications } from '@/contexts/useNotifications';
import {
  archiveNotifications,
  fetchNotifications,
  markAllNotificationsRead,
  setNotificationsRead,
} from '@/services/notificationService';
import { cn } from '@/utils/cn';

const categories: Array<{ value: NotificationCategory | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'trip_status', label: 'Trips' },
  { value: 'operations', label: 'Operations' },
  { value: 'pickup_dropoff', label: 'Pickup & drop-off' },
  { value: 'service_changes', label: 'Service changes' },
  { value: 'assignments', label: 'Assignments' },
  { value: 'delivery_health', label: 'Delivery health' },
  { value: 'platform', label: 'Platform' },
];

const guardianMobileCategories: Array<{ value: NotificationCategory; label: string }> = [
  { value: 'trip_status', label: 'Trips' },
  { value: 'service_changes', label: 'Service alerts' },
  { value: 'pickup_dropoff', label: 'Boarding' },
];

const driverMobileCategories: Array<{ value: NotificationCategory; label: string }> = [
  { value: 'assignments', label: 'Assignment alerts' },
];

function formatEventLabel(value: UserNotification['eventType']) {
  if (value === 'driver_assignment_created') return 'Assignment created';
  if (value === 'driver_assignment_changed') return 'Assignment changed';
  if (value === 'driver_assignment_ended') return 'Assignment ended';
  const label = value.replaceAll('_', ' ');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const time = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);

  if (isToday) return `Today, ${time}`;

  return `${new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)}, ${time}`;
}

export function NotificationsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedId = searchParams.get('notification');
  const appSurface = useAppSurface();
  const { profile } = useAuth();
  const isDriver = profile?.role === 'driver';
  const { unreadCount, connectionState, refreshNotifications } = useNotifications();
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
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchNotifications({
        limit: 30,
        unreadOnly,
        category: isDriver ? 'assignments' : category || null,
      });
      setItems(rows);
      setHasMore(rows.length === 30);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Notifications are temporarily unavailable.',
      );
    } finally {
      setLoading(false);
    }
  }, [category, isDriver, unreadOnly]);
  useEffect(() => {
    void load();
  }, [load]);

  const admin =
    profile?.role &&
    ['tenant_admin', 'school_admin', 'transportation_admin'].includes(profile.role);
  const portal =
    admin || profile?.role === 'platform_super_admin'
      ? 'admin'
      : profile?.role === 'driver'
        ? 'driver'
        : 'parent';
  const navGroups =
    profile?.role === 'platform_super_admin'
      ? platformNavGroups
      : admin
        ? adminNavGroups
        : profile?.role === 'driver'
          ? driverNavGroups
          : guardianNavGroups;
  const isRecipientMobile =
    appSurface === 'native-mobile' && (profile?.role === 'guardian' || isDriver);
  const recipientMobileCategories = isDriver
    ? driverMobileCategories
    : guardianMobileCategories;

  const selectedItem = requestedId ? (items.find((item) => item.id === requestedId) ?? null) : null;

  const setReadState = useCallback(
    async (item: UserNotification, read: boolean) => {
      setActionError(null);
      try {
        await setNotificationsRead([item.id], read);
        setItems((current) =>
          current.map((row) =>
            row.id === item.id
              ? { ...row, readAt: read ? (row.readAt ?? new Date().toISOString()) : null }
              : row,
          ),
        );
        await refreshNotifications();
      } catch (caught) {
        setActionError(
          caught instanceof Error ? caught.message : 'Unable to update this notification.',
        );
      }
    },
    [refreshNotifications],
  );

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
    await archiveNotifications([item.id]);
    await Promise.all([load(), refreshNotifications()]);
  }
  async function loadMore() {
    const last = items.at(-1);
    if (!last) return;
    setLoadingMore(true);
    try {
      const rows = await fetchNotifications({
        limit: 30,
        cursor: { createdAt: last.createdAt, id: last.id },
        unreadOnly,
        category: isDriver ? 'assignments' : category || null,
      });
      setItems((current) => [...current, ...rows]);
      setHasMore(rows.length === 30);
    } finally {
      setLoadingMore(false);
    }
  }

  async function markAllRead() {
    setActionError(null);
    try {
      await markAllNotificationsRead();
      await Promise.all([load(), refreshNotifications()]);
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'Unable to mark notifications as read.',
      );
    }
  }

  function selectMobileFilter(next: 'all' | 'unread' | NotificationCategory) {
    if (next === 'all') {
      setCategory('');
      setUnreadOnly(false);
      return;
    }
    if (next === 'unread') {
      setCategory('');
      setUnreadOnly(true);
      return;
    }
    setCategory(next);
    setUnreadOnly(false);
  }

  return (
    <DashboardLayout title="Notifications" portal={portal} navItems={[]} navGroups={navGroups}>
      <div
        className={cn(
          isRecipientMobile && '-mx-3 -my-5 min-h-[calc(100vh-5rem)] bg-[#f2f6f7] px-3 py-5',
        )}
        data-ui="notification-inbox-page"
      >
        {isRecipientMobile ? (
          <header className="mb-3" data-ui="notification-mobile-header">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-baseline gap-2">
                <h1 className="text-xl font-bold tracking-tight text-navy-900">Updates</h1>
                {unreadCount > 0 ? (
                  <span className="shrink-0 text-[0.6875rem] font-semibold text-danger-600">
                    {unreadCount > 99 ? '99+' : unreadCount} new
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-1.5 text-xs font-semibold text-navy-700 transition-colors hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void markAllRead()}
                disabled={unreadCount === 0}
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                Mark all read
              </button>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {isDriver
                ? 'Assignment updates connected to your driver account.'
                : 'Real-time trip, arrival, and service updates.'}
            </p>
          </header>
        ) : (
          <PageHeader
            title="Notifications"
            description="Your authoritative BusSafe inbox. In-app updates remain available regardless of push settings."
            action={
              <Link to={isDriver ? '/driver/settings' : '/notifications/settings'}>
                <Button variant="secondary">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              </Link>
            }
          />
        )}
        {isRecipientMobile ? (
          <div
            className="mb-3 -mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            data-ui="notification-filters"
          >
            <div
              className="flex w-max gap-1.5"
              role="group"
              aria-label="Filter updates"
              data-ui="notification-filter-controls"
            >
              <button
                type="button"
                className={cn(
                  'min-h-8 rounded-full border px-3 text-xs font-semibold transition-colors',
                  !unreadOnly && !category
                    ? 'border-navy-800 bg-navy-800 text-white'
                    : 'border-slate-200 bg-white/75 text-slate-600 hover:bg-white',
                )}
                aria-pressed={!unreadOnly && !category}
                onClick={() => selectMobileFilter('all')}
              >
                All {items.length > 0 ? items.length : ''}
              </button>
              <button
                type="button"
                className={cn(
                  'min-h-8 rounded-full border px-3 text-xs font-semibold transition-colors',
                  unreadOnly
                    ? 'border-navy-800 bg-navy-800 text-white'
                    : 'border-slate-200 bg-white/75 text-slate-600 hover:bg-white',
                )}
                aria-pressed={unreadOnly}
                onClick={() => selectMobileFilter('unread')}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-danger-500" aria-hidden />
                  Unread {unreadCount > 0 ? unreadCount : ''}
                </span>
              </button>
              {recipientMobileCategories.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    'min-h-8 rounded-full border px-3 text-xs font-semibold transition-colors',
                    !unreadOnly && category === option.value
                      ? 'border-navy-800 bg-navy-800 text-white'
                      : 'border-slate-200 bg-white/75 text-slate-600 hover:bg-white',
                  )}
                  aria-pressed={!unreadOnly && category === option.value}
                  onClick={() => selectMobileFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-6" data-ui="notification-filters">
            <div className="grid gap-3" data-ui="notification-filter-controls">
              <label className="grid gap-2 text-sm font-bold text-navy-900">
                Show updates
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as NotificationCategory | '')}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  {categories.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className="flex min-h-12 items-center justify-between gap-3 text-sm font-semibold text-navy-900"
                data-ui="notification-filter-toggle"
              >
                <span>Unread only</span>
                <input
                  type="checkbox"
                  checked={unreadOnly}
                  onChange={(e) => setUnreadOnly(e.target.checked)}
                />
              </label>
            </div>
            <div className="mt-4 flex flex-col gap-3" data-ui="notification-filter-actions">
              <Button variant="secondary" onClick={() => void markAllRead()}>
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </Button>
              <span className="text-xs font-medium text-slate-600" aria-live="polite">
                {connectionState === 'connected'
                  ? 'Live updates connected'
                  : connectionState === 'offline'
                    ? 'Offline — showing saved results'
                    : 'Updates refresh automatically'}
              </span>
            </div>
          </div>
        )}
        {actionError ? (
          <Card
            className="mb-4 border-red-200 bg-red-50 p-5"
            role="alert"
            data-ui="notification-error-card"
          >
            <p className="text-sm text-red-800">{actionError}</p>
          </Card>
        ) : null}
        {selectedItem ? (
          <Card
            className={cn(
              'mb-4 border-blue-300 bg-blue-50/40 p-5',
              isRecipientMobile && 'border-slate-200 bg-white !p-4 shadow-sm',
            )}
            role="region"
            aria-labelledby="notification-detail-heading"
            data-ui="notification-detail-card"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2
                  id="notification-detail-heading"
                  className="text-sm font-semibold uppercase tracking-wide text-navy-700"
                >
                  Notification details
                </h2>
                <h3
                  ref={detailHeadingRef}
                  tabIndex={-1}
                  className="mt-2 text-xl font-semibold text-slate-950 outline-none"
                >
                  {selectedItem.title}
                </h3>
              </div>
              <Button
                variant="ghost"
                onClick={() => navigate('/notifications')}
                aria-label="Close notification details"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <p className="mt-3 text-slate-700">{selectedItem.body}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="font-medium text-slate-500">Category</dt>
                <dd className="mt-1 capitalize text-slate-900">
                  {selectedItem.category.replace('_', ' ')}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Priority</dt>
                <dd className="mt-1 capitalize text-slate-900">{selectedItem.severity}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">Received</dt>
                <dd className="mt-1 text-slate-900">
                  <time dateTime={selectedItem.occurredAt}>
                    {new Date(selectedItem.occurredAt).toLocaleString()}
                  </time>
                </dd>
              </div>
            </dl>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => void setReadState(selectedItem, !selectedItem.readAt)}
              >
                {selectedItem.readAt ? 'Mark unread' : 'Mark read'}
              </Button>
              <Button variant="ghost" onClick={() => void archive(selectedItem)}>
                <Archive className="mr-2 h-4 w-4" />
                Archive
              </Button>
            </div>
          </Card>
        ) : null}
        {!loading && !error && requestedId && !items.some((item) => item.id === requestedId) ? (
          <Card
            className="mb-4 border-amber-200 bg-amber-50 p-5"
            data-ui="notification-unavailable-card"
          >
            <h2 className="font-semibold text-slate-950">
              This notification is no longer available
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              It may have expired, been archived, or your access may have changed.
            </p>
          </Card>
        ) : null}
        {loading ? (
          <DataState title="Loading notifications" message="Checking your authorized inbox." />
        ) : error ? (
          <DataState title="Notifications unavailable" message={error} />
        ) : items.length === 0 ? (
          <DataState title="You’re all caught up" message="No notifications match these filters." />
        ) : (
          <div
            className={cn('space-y-5', isRecipientMobile && 'space-y-3')}
            data-ui="notification-list"
          >
            {items.map((item) => (
              <Card
                key={item.id}
                className={cn(
                  'p-5',
                  isRecipientMobile &&
                    'border-slate-200 bg-white !p-4 shadow-[0_2px_10px_rgb(15_42_68_/_0.05)]',
                )}
                data-ui="notification-card"
                data-unread={!item.readAt}
                data-selected={item.id === requestedId}
                data-severity={item.severity}
              >
                {isRecipientMobile ? (
                  <article>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem] font-semibold">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1.5',
                              item.severity === 'urgent'
                                ? 'text-danger-700'
                                : item.severity === 'warning'
                                  ? 'text-warning-700'
                                  : 'text-navy-600',
                            )}
                          >
                            <span
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                item.severity === 'urgent'
                                  ? 'bg-danger-500'
                                  : item.severity === 'warning'
                                    ? 'bg-warning-500'
                                    : 'bg-navy-500',
                              )}
                              data-ui={!item.readAt ? 'notification-unread-dot' : undefined}
                              aria-hidden
                            />
                            {formatEventLabel(item.eventType)}
                          </span>
                          <span className="text-slate-400" aria-hidden>
                            •
                          </span>
                          <time className="font-medium text-slate-500" dateTime={item.occurredAt}>
                            {formatNotificationTime(item.occurredAt)}
                          </time>
                        </div>
                        <h2 className="mt-2 text-sm font-bold leading-5 text-navy-900">
                          {item.title}
                        </h2>
                      </div>
                      <button
                        type="button"
                        className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => void archive(item)}
                        aria-label={`Archive ${item.title}`}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-slate-600">{item.body}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-2.5">
                      <span className="text-[0.6875rem] font-medium text-slate-500">
                        {item.readAt ? 'Read' : 'New update'}
                      </span>
                      <button
                        type="button"
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-[#e7f8fb] px-3 text-xs font-semibold text-navy-700 transition-colors hover:bg-[#d8f2f6]"
                        onClick={() => openNotification(item)}
                        aria-label={`Open notification: ${item.title}`}
                      >
                        View update
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </article>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => openNotification(item)}
                      aria-label={`Open notification: ${item.title}`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-slate-950">{item.title}</span>
                        {!item.readAt ? (
                          <span
                            className="h-2 w-2 rounded-full"
                            data-ui="notification-unread-dot"
                            aria-label="Unread"
                          />
                        ) : null}
                      </span>
                      <span className="mt-1 block text-sm text-slate-600">{item.body}</span>
                      <time
                        className="mt-2 block text-xs text-slate-500"
                        dateTime={item.occurredAt}
                      >
                        {new Date(item.occurredAt).toLocaleString()}
                      </time>
                    </button>
                    <Button
                      variant="ghost"
                      onClick={() => void archive(item)}
                      aria-label={`Archive ${item.title}`}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </Card>
            ))}
            {hasMore ? (
              <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
