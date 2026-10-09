import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserNotification } from '@safebus/types';
import { NotificationsPage } from './NotificationsPage';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  detail: vi.fn(),
  read: vi.fn(),
  archive: vi.fn(),
  refresh: vi.fn(),
  role: 'guardian',
}));
vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'profile', role: mocks.role } }),
}));
vi.mock('@/contexts/AppSurfaceContext', () => ({ useAppSurface: () => 'web' }));
vi.mock('@/contexts/useNotifications', () => ({
  useNotifications: () => ({
    unreadCount: 0,
    connectionState: 'connected',
    refreshNotifications: mocks.refresh,
  }),
}));
vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
  adminNavGroups: [],
  driverNavGroups: [],
  guardianNavGroups: [],
  platformNavGroups: [],
}));
vi.mock('@/services/notificationService', () => ({
  fetchNotifications: mocks.fetch,
  fetchNotificationDetail: mocks.detail,
  setNotificationsRead: mocks.read,
  archiveNotifications: mocks.archive,
  markAllNotificationsRead: vi.fn(),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const row: UserNotification = {
  id: 'event-1',
  eventType: 'trip_completed',
  category: 'trip_status',
  severity: 'info',
  title: 'Trip completed',
  body: 'Trip “Afternoon” for Bus 01 on Route 01 was completed by Alex Singh at 2:12 PM on Oct 9, 2026.',
  occurredAt: '2026-10-09T20:12:00Z',
  createdAt: '2026-10-09T20:12:00Z',
  readAt: null,
  archivedAt: null,
  destinationPath: '/notifications?notification=event-1',
};
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  mocks.role = 'guardian';
  mocks.fetch.mockReset().mockResolvedValue([]);
  mocks.detail.mockReset().mockResolvedValue(row);
  mocks.read.mockReset().mockResolvedValue(1);
  mocks.archive.mockReset().mockResolvedValue(1);
  mocks.refresh.mockReset().mockResolvedValue(undefined);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});
async function render(path = '/notifications?notification=event-1') {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <NotificationsPage />
      </MemoryRouter>,
    ),
  );
}
describe('notification detail links', () => {
  it('opens authorized details absent from the current inbox and marks only that event read', async () => {
    await render();
    expect(container.textContent).toContain(row.body);
    expect(container.textContent).toContain('Notification details');
    expect(container.textContent).not.toContain('This notification is no longer available');
    expect(mocks.detail).toHaveBeenCalledWith('event-1');
    expect(mocks.read).toHaveBeenCalledWith(['event-1'], true);
    expect(container.querySelector('#notification-detail-heading')).toBe(document.activeElement);
  });
  it('does not disclose or mark an unavailable notification', async () => {
    mocks.detail.mockResolvedValue(null);
    await render();
    expect(container.textContent).toContain('This notification is no longer available');
    expect(container.textContent).not.toContain(row.body);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('allows a hidden external-alert detail to be archived without adding it to the inbox', async () => {
    await render();
    const button = Array.from(container.querySelectorAll('button')).find(
      (item) => item.textContent?.trim() === 'Archive',
    );
    await act(async () => button?.click());
    expect(mocks.archive).toHaveBeenCalledWith(['event-1']);
    expect(container.textContent).not.toContain('Notification details');
  });
  it('keeps driver queries restricted to assignment notifications', async () => {
    mocks.role = 'driver';
    await render('/notifications');
    expect(mocks.fetch).toHaveBeenCalledWith({
      limit: 30,
      unreadOnly: false,
      category: 'assignments',
    });
    expect(mocks.detail).not.toHaveBeenCalled();
  });
});
