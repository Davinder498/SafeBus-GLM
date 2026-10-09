import { act, useContext } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { UserNotification } from '@safebus/types';
import {
  NotificationContext,
  NotificationProvider,
  type NotificationContextValue,
} from './NotificationContext';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  count: vi.fn(),
  user: { id: 'recipient' },
  profile: { id: 'recipient', role: 'guardian' },
}));
vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => ({ user: mocks.user, profile: mocks.profile }),
}));
vi.mock('@/services/notificationService', () => ({
  fetchNotifications: mocks.list,
  fetchUnreadNotificationCount: mocks.count,
  fetchNotificationPreferences: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return this;
      },
    }),
    removeChannel: vi.fn(),
  },
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root;
let container: HTMLDivElement;
let context: NotificationContextValue;
function Consumer() {
  context = useContext(NotificationContext)!;
  return null;
}
function notification(id: string, createdAt: string): UserNotification {
  return {
    id,
    createdAt,
    occurredAt: createdAt,
    eventType: 'trip_late',
    category: 'operations',
    severity: 'warning',
    title: 'Bus reported late',
    body: `Bus ${id} on Route 01 was reported late.`,
    readAt: null,
    archivedAt: null,
    destinationPath: '/notifications',
  };
}
beforeEach(() => {
  mocks.user = { id: 'recipient' };
  mocks.profile = { id: 'recipient', role: 'guardian' };
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  mocks.list.mockReset();
  mocks.count.mockReset().mockResolvedValue(1);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function render() {
  await act(async () =>
    root.render(
      <NotificationProvider>
        <Consumer />
      </NotificationProvider>,
    ),
  );
}

it('does not turn older entries exposed by archiving into new notification toasts', async () => {
  mocks.list.mockResolvedValue([notification('02', '2026-10-09T20:00:00Z')]);
  await render();
  mocks.list.mockResolvedValue([notification('01', '2026-10-09T19:00:00Z')]);
  await act(async () => context.refreshNotifications());
  expect(container.querySelector('[data-ui="notification-toast"]')).toBeNull();
  mocks.list.mockResolvedValue([notification('02', '2026-10-09T20:00:00Z')]);
  await act(async () => context.refreshNotifications());
  expect(container.querySelector('[data-ui="notification-toast"]')).toBeNull();
});

it('shows the server message for a genuinely newer update and expires its toast', async () => {
  mocks.list.mockResolvedValue([notification('01', '2026-10-09T19:00:00Z')]);
  await render();
  const next = notification('02', '2026-10-09T20:00:00Z');
  mocks.list.mockResolvedValue([next]);
  await act(async () => context.refreshNotifications());
  expect(container.querySelector('[data-ui="notification-toast"]')?.textContent).toContain(
    next.body,
  );
  await act(async () => vi.advanceTimersByTime(6000));
  expect(container.querySelector('[data-ui="notification-toast"]')).toBeNull();
});

it('discards a refresh that finishes after the authenticated recipient changes', async () => {
  let finish!: (value: UserNotification[]) => void;
  mocks.list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await render();
  mocks.user = { id: 'other-recipient' };
  mocks.profile = { id: 'other-recipient', role: 'guardian' };
  mocks.list.mockResolvedValue([notification('other', '2026-10-09T19:00:00Z')]);
  mocks.count.mockResolvedValue(2);
  await render();
  await act(async () => finish([notification('old-private-bus', '2026-10-09T20:00:00Z')]));
  expect(context.unreadCount).toBe(2);
  expect(container.querySelector('[data-ui="notification-toast"]')).toBeNull();
  expect(container.textContent).not.toContain('old-private-bus');
});
