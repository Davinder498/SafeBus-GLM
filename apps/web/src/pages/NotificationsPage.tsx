import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationCategory, UserNotification } from '@safebus/types';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Archive, CheckCheck, Settings, X } from 'lucide-react';
import {
  DashboardLayout,
  adminNavGroups,
  driverNavGroups,
  guardianNavGroups,
  platformNavGroups,
} from '@/components/layout/DashboardLayout';
import { NotificationUpdateCard } from '@/components/notifications/NotificationUpdateCard';
import { Button, buttonClass } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { useAuth } from '@/contexts/useAuth';
import { useNotifications } from '@/contexts/useNotifications';
import {
  archiveNotifications,
  fetchNotificationDetail,
  fetchNotifications,
  markAllNotificationsRead,
  setNotificationsRead,
} from '@/services/notificationService';
import { cn } from '@/utils/cn';
import { notificationCategoryChoices } from '@/utils/notificationCategories';

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
  const [detail, setDetail] = useState<UserNotification | null>(null);
  const [detailLoading, setDetailLoading] = useState(Boolean(requestedId));
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const markedFromLink = useRef(new Set<string>());
  const previousUnreadCount = useRef(unreadCount);

  const load = useCallback(
    async (background = false) => {
      if (!background) setLoading(true);
      setError(null);
      try {
        const rows = await fetchNotifications({
          limit: 30,
          unreadOnly,
          category: category || null,
        });
        setItems(rows);
        setHasMore(rows.length === 30);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : 'Notifications are temporarily unavailable.',
        );
      } finally {
        if (!background) setLoading(false);
      }
    },
    [category, unreadOnly],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (previousUnreadCount.current !== unreadCount) {
      previousUnreadCount.current = unreadCount;
      void load(true);
    }
  }, [load, unreadCount]);

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
  const categories =
    notificationCategoryChoices[profile?.role ?? ''] ?? notificationCategoryChoices.admin;
  const recipientMobileCategories = categories;
  const settingsPath = isDriver
    ? '/driver/settings'
    : profile?.role === 'guardian'
      ? '/notifications/settings'
      : admin
        ? '/admin/settings/notifications'
        : '/notifications/settings';

  const selectedItem = requestedId && detail?.id === requestedId ? detail : null;

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setDetailError(null);
    if (!requestedId) {
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    void fetchNotificationDetail(requestedId)
      .then((row) => {
        if (!cancelled) setDetail(row);
      })
      .catch((caught) => {
        if (!cancelled)
          setDetailError(
            caught instanceof Error ? caught.message : 'Unable to load this notification.',
          );
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestedId, profile?.id]);

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
        setDetail((current) =>
          current?.id === item.id
            ? { ...current, readAt: read ? (current.readAt ?? new Date().toISOString()) : null }
            : current,
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
    setActionError(null);
    try {
      await archiveNotifications([item.id]);
      if (item.id === requestedId) navigate('/notifications');
      await Promise.all([load(), refreshNotifications()]);
    } catch (caught) {
      setActionError(
        caught instanceof Error ? caught.message : 'Unable to archive this notification.',
      );
    }
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
        category: category || null,
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

  function selectFilter(next: 'all' | 'unread' | NotificationCategory) {
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
    <DashboardLayout title="Notification" portal={portal} navItems={[]} navGroups={navGroups}>
      <div
        className={cn(
          isRecipientMobile &&
            '-mx-3 -my-5 min-h-[calc(100vh-5rem)] bg-[var(--color-canvas)] px-3 py-5',
        )}
        data-ui="notification-inbox-page"
      >
        {isRecipientMobile ? (
          <header className="mb-4" data-ui="notification-mobile-header">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-baseline gap-2">
                <h1 className="text-xl font-bold tracking-tight text-navy-900">Notification</h1>
                {unreadCount > 0 ? (
                  <span className="shrink-0 text-[0.6875rem] font-semibold text-danger-600">
                    {unreadCount > 99 ? '99+' : unreadCount} new
                  </span>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Link
                  to={settingsPath}
                  aria-label="Notification settings"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-navy-700 hover:bg-white/70"
                >
                  <Settings className="h-5 w-5" aria-hidden />
                </Link>
                <button
                  type="button"
                  aria-label="Mark all read"
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-semibold text-navy-700 transition-colors hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void markAllRead()}
                  disabled={unreadCount === 0}
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                  <span className="hidden min-[420px]:inline">Mark all read</span>
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {isDriver
                ? 'Assignment, trip, and operational updates.'
                : 'Real-time trip, arrival, and service updates.'}
            </p>
          </header>
        ) : (
          <PageHeader
            title="Notification"
            description="Your SafeBus updates."
            action={
              settingsPath ? (
                <Link
                  to={settingsPath}
                  aria-label="Notification settings"
                  className={cn(buttonClass({ variant: 'ghost', size: 'sm' }), 'min-h-11')}
                >
                  <Settings className="h-4 w-4" aria-hidden />
                  Preferences
                </Link>
              ) : undefined
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
                onClick={() => selectFilter('all')}
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
                onClick={() => selectFilter('unread')}
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
                  onClick={() => selectFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 mb-4" data-ui="notification-filters">
            <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex w-max items-center gap-2">
                <div
                  className="flex items-center gap-2"
                  role="group"
                  aria-label="Filter updates"
                  data-ui="notification-filter-controls"
                >
                  <button
                    type="button"
                    className={cn(
                      'min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors',
                      !unreadOnly && !category
                        ? 'border-navy-800 bg-navy-800 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                    )}
                    aria-pressed={!unreadOnly && !category}
                    onClick={() => selectFilter('all')}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors',
                      unreadOnly
                        ? 'border-navy-800 bg-navy-800 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                    )}
                    aria-pressed={unreadOnly}
                    onClick={() => selectFilter('unread')}
                  >
                    Unread {unreadCount > 0 ? unreadCount : ''}
                  </button>
                  {categories.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={cn(
                        'min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors',
                        !unreadOnly && category === option.value
                          ? 'border-navy-800 bg-navy-800 text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                      )}
                      aria-pressed={!unreadOnly && category === option.value}
                      onClick={() => selectFilter(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-navy-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void markAllRead()}
                  disabled={unreadCount === 0}
                  data-ui="notification-mark-all-read"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden />
                  Mark all read
                </button>
              </div>
            </div>
            <div className="mt-2" data-ui="notification-filter-actions">
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
                  ref={detailHeadingRef}
                  tabIndex={-1}
                  className="text-sm font-semibold uppercase tracking-wide text-navy-700 outline-none"
                >
                  Notification details
                </h2>
              </div>
              <Button
                variant="ghost"
                onClick={() => navigate('/notifications')}
                aria-label="Close notification details"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {selectedItem.eventType === 'authority_announcement' && (
              <h3 className="mt-3 font-bold text-slate-900">{selectedItem.title}</h3>
            )}
            <p className="mt-3 whitespace-pre-wrap break-words font-semibold text-slate-900">
              {selectedItem.body}
            </p>
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
        {requestedId && detailLoading ? (
          <DataState title="Loading notification" message="Checking this update." />
        ) : null}
        {requestedId && detailError ? (
          <DataState title="Notification unavailable" message={detailError} />
        ) : null}
        {requestedId && !detailLoading && !detailError && !selectedItem ? (
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
          <div className="space-y-2" data-ui="notification-list">
            {items
              .filter((item) => item.id !== selectedItem?.id)
              .map((item) => (
                <Card
                  key={item.id}
                  className={cn(
                    'px-4 py-3',
                    isRecipientMobile &&
                      'border-slate-200 bg-white shadow-[0_2px_10px_rgb(15_42_68_/_0.05)]',
                  )}
                  data-ui="notification-card"
                  data-unread={!item.readAt}
                  data-selected={item.id === requestedId}
                  data-severity={item.severity}
                >
                  {isRecipientMobile ? (
                    <NotificationUpdateCard
                      item={item}
                      onRead={() => void setReadState(item, true)}
                      onArchive={() => void archive(item)}
                    />
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <button
                        className="min-h-11 min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
                        onClick={() => openNotification(item)}
                        aria-label={`Open notification: ${item.body}`}
                      >
                        {item.eventType === 'authority_announcement' && (
                          <span className="mb-1 block font-bold text-slate-950">{item.title}</span>
                        )}
                        <span className="flex items-start gap-2">
                          <span className="font-semibold text-slate-950">{item.body}</span>
                          {!item.readAt ? (
                            <span
                              className="mt-2 h-2 w-2 shrink-0 rounded-full"
                              data-ui="notification-unread-dot"
                              aria-label="Unread"
                            />
                          ) : null}
                        </span>
                      </button>
                      <Button
                        variant="ghost"
                        className="min-h-11 min-w-11"
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
