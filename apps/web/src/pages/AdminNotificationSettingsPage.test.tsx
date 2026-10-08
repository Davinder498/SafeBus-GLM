import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantNotificationSettings } from '@safebus/types';
import { AdminNotificationSettingsPage } from './AdminNotificationSettingsPage';

const mocks = vi.hoisted(() => ({
  fetchSettings: vi.fn(),
  setDelivery: vi.fn(),
  setPush: vi.fn(),
}));

vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => ({ profile: { role: 'tenant_admin' } }),
}));
vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
  adminNavGroups: [],
}));
vi.mock('@/components/settings/AdminSettingsNav', () => ({
  AdminSettingsNav: () => <nav>Tenant settings</nav>,
}));
vi.mock('@/components/admin/NotificationDeliverySummaryCard', () => ({
  NotificationDeliverySummaryCard: () => <section>Delivery health summary</section>,
}));
vi.mock('@/services/tenantNotificationSettingsService', () => ({
  fetchTenantNotificationSettings: mocks.fetchSettings,
  setTenantNotificationDeliveryEnabled: mocks.setDelivery,
  setTenantPushNotificationsEnabled: mocks.setPush,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const active: TenantNotificationSettings = {
  notificationsEnabled: true,
  pushNotificationsEnabled: true,
  emailEffective: true,
  pushEffective: true,
  privacyReviewStatus: 'approved',
  privacyApprovedAt: '2026-10-01T18:00:00Z',
  updatedAt: '2026-10-01T18:00:00Z',
};

let root: Root | null = null;

async function renderPage(settings: TenantNotificationSettings = active) {
  mocks.fetchSettings.mockResolvedValue(settings);
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<AdminNotificationSettingsPage />));
  return container;
}

function button(container: HTMLElement, label: string, last = false): HTMLButtonElement {
  const matches = Array.from(container.querySelectorAll('button')).filter(
    (item) => item.textContent?.trim() === label,
  );
  const match = last ? matches.at(-1) : matches[0];
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing button: ${label}`);
  return match;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mocks.fetchSettings.mockReset();
  mocks.setDelivery.mockReset();
  mocks.setPush.mockReset();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('tenant notification settings', () => {
  it('shows the approved active policy and effective channels', async () => {
    const container = await renderPage();
    expect(container.textContent).toContain('External delivery is active');
    expect(container.textContent).toContain('In-app inbox');
    expect(container.textContent).toContain('Email');
    expect(container.textContent).toContain('Android push');
    expect(container.textContent).toContain('Delivery health summary');
    expect(button(container, 'Pause delivery').disabled).toBe(false);
    expect(button(container, 'Disable push').disabled).toBe(false);
  });

  it.each([
    ['pending', 'Awaiting privacy approval', 'External delivery is locked'],
    ['rejected', 'Privacy approval rejected', 'External delivery is unavailable'],
  ] as const)('locks external controls when privacy review is %s', async (status, label, title) => {
    const container = await renderPage({
      ...active,
      notificationsEnabled: false,
      pushNotificationsEnabled: false,
      emailEffective: false,
      pushEffective: false,
      privacyReviewStatus: status,
      privacyApprovedAt: null,
    });
    expect(container.textContent).toContain(label);
    expect(container.textContent).toContain(title);
    expect(container.textContent).not.toContain('Resume delivery');
    expect(button(container, 'Enable push').disabled).toBe(true);
  });

  it('confirms a tenant-wide pause and keeps the updated state', async () => {
    const paused = {
      ...active,
      notificationsEnabled: false,
      emailEffective: false,
      pushEffective: false,
    };
    mocks.setDelivery.mockResolvedValue(paused);
    const container = await renderPage();

    await act(async () => button(container, 'Pause delivery', true).click());
    expect(container.textContent).toContain('New email and Android push deliveries will stop');
    await act(async () => button(container, 'Pause delivery', true).click());

    expect(mocks.setDelivery).toHaveBeenCalledWith(false);
    expect(container.textContent).toContain('External delivery paused.');
    expect(container.textContent).toContain('External delivery is paused');
    expect(button(container, 'Resume delivery').disabled).toBe(false);
  });

  it('confirms Android push changes independently', async () => {
    const pushDisabled = {
      ...active,
      pushNotificationsEnabled: false,
      pushEffective: false,
    };
    mocks.setPush.mockResolvedValue(pushDisabled);
    const container = await renderPage();

    await act(async () => button(container, 'Disable push', true).click());
    await act(async () => button(container, 'Disable push', true).click());

    expect(mocks.setPush).toHaveBeenCalledWith(false);
    expect(container.textContent).toContain('Android push disabled.');
    expect(button(container, 'Enable push').disabled).toBe(false);
  });

  it('resumes a paused tenant and restores the saved push choice', async () => {
    const paused = {
      ...active,
      notificationsEnabled: false,
      emailEffective: false,
      pushEffective: false,
    };
    mocks.setDelivery.mockResolvedValue(active);
    const container = await renderPage(paused);

    expect(container.textContent).toContain('External delivery is paused');
    expect(button(container, 'Disable push').disabled).toBe(true);
    await act(async () => button(container, 'Resume delivery').click());
    await act(async () => button(container, 'Resume delivery', true).click());

    expect(mocks.setDelivery).toHaveBeenCalledWith(true);
    expect(container.textContent).toContain('External delivery resumed.');
    expect(container.textContent).toContain('External delivery is active');
    expect(button(container, 'Disable push').disabled).toBe(false);
  });

  it('keeps confirmation busy until the save completes and reports failures', async () => {
    const save = deferred<TenantNotificationSettings>();
    mocks.setDelivery.mockReturnValue(save.promise);
    const container = await renderPage();

    await act(async () => button(container, 'Pause delivery').click());
    await act(async () => button(container, 'Pause delivery', true).click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(button(container, 'Working…').disabled).toBe(true);

    await act(async () => save.reject(new Error('Delivery update failed.')));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Delivery update failed.',
    );
    expect(container.textContent).toContain('External delivery is active');
  });

  it('offers retry after a settings load failure', async () => {
    mocks.fetchSettings.mockRejectedValueOnce(new Error('Settings unavailable.'));
    const container = await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Settings unavailable.',
    );
    mocks.fetchSettings.mockResolvedValue(active);
    await act(async () => button(container, 'Try again').click());
    expect(container.textContent).toContain('External delivery is active');
  });
});
