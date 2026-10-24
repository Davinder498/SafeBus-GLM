import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
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
  await act(async () =>
    root?.render(
      <MemoryRouter>
        <AdminNotificationSettingsPage />
      </MemoryRouter>,
    ),
  );
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

function toggle(container: HTMLElement, label: string): HTMLButtonElement {
  const match = container.querySelector(`[role="switch"][aria-label="${label}"]`);
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing switch: ${label}`);
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
  it('shows compact notification controls without policy or channel cards', async () => {
    const container = await renderPage();
    expect(container.textContent).toContain('The in-app inbox remains available');
    expect(container.textContent).toContain('Email and phone alerts');
    expect(container.textContent).toContain('Android push');
    expect(container.textContent).toContain('Delivery health summary');
    expect(container.querySelector('h1')?.textContent).toBe('Notification settings');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/notifications');
    expect(container.querySelector('nav[aria-label="Settings sections"]')).toBeNull();
    expect(toggle(container, 'Email and phone alerts').getAttribute('aria-checked')).toBe('true');
    expect(toggle(container, 'Email and phone alerts').disabled).toBe(false);
    expect(toggle(container, 'Android push').disabled).toBe(false);
    expect(container.textContent).not.toMatch(
      /privacy approval|Delivery channels|External delivery/i,
    );
    expect(container.querySelector('[data-card-type]')).toBeNull();
  });

  it.each(['pending', 'rejected', 'approved'] as const)(
    'keeps unconfigured controls disabled when status is %s without an approval timestamp',
    async (status) => {
      const container = await renderPage({
        ...active,
        notificationsEnabled: false,
        pushNotificationsEnabled: false,
        emailEffective: false,
        pushEffective: false,
        privacyReviewStatus: status,
        privacyApprovedAt: null,
      });
      expect(container.textContent).toContain('Email and phone alerts are not available');
      expect(container.textContent).not.toMatch(/privacy approval|External delivery/i);
      expect(toggle(container, 'Email and phone alerts').disabled).toBe(true);
      expect(toggle(container, 'Android push').disabled).toBe(true);
      expect(mocks.setDelivery).not.toHaveBeenCalled();
      expect(mocks.setPush).not.toHaveBeenCalled();
    },
  );

  it('confirms a tenant-wide pause and keeps the updated state', async () => {
    const paused = {
      ...active,
      notificationsEnabled: false,
      emailEffective: false,
      pushEffective: false,
    };
    mocks.setDelivery.mockResolvedValue(paused);
    const container = await renderPage();

    await act(async () => toggle(container, 'Email and phone alerts').click());
    expect(container.textContent).toContain('New email and Android push deliveries will stop');
    expect(mocks.setDelivery).not.toHaveBeenCalled();
    await act(async () => button(container, 'Pause alerts').click());

    expect(mocks.setDelivery).toHaveBeenCalledWith(false);
    expect(container.textContent).toContain('Email and phone alerts paused.');
    expect(toggle(container, 'Email and phone alerts').getAttribute('aria-checked')).toBe('false');
    expect(toggle(container, 'Email and phone alerts').disabled).toBe(false);
  });

  it('confirms Android push changes independently', async () => {
    const pushDisabled = {
      ...active,
      pushNotificationsEnabled: false,
      pushEffective: false,
    };
    mocks.setPush.mockResolvedValue(pushDisabled);
    const container = await renderPage();

    await act(async () => toggle(container, 'Android push').click());
    await act(async () => button(container, 'Disable push', true).click());

    expect(mocks.setPush).toHaveBeenCalledWith(false);
    expect(container.textContent).toContain('Android push disabled.');
    expect(toggle(container, 'Android push').getAttribute('aria-checked')).toBe('false');
    expect(toggle(container, 'Android push').disabled).toBe(false);
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

    expect(container.textContent).toContain(
      'Paused with email and phone alerts; your choice is saved',
    );
    expect(toggle(container, 'Android push').getAttribute('aria-checked')).toBe('true');
    expect(toggle(container, 'Android push').disabled).toBe(true);
    await act(async () => toggle(container, 'Email and phone alerts').click());
    await act(async () => button(container, 'Resume alerts').click());

    expect(mocks.setDelivery).toHaveBeenCalledWith(true);
    expect(container.textContent).toContain('Email and phone alerts resumed.');
    expect(toggle(container, 'Email and phone alerts').getAttribute('aria-checked')).toBe('true');
    expect(toggle(container, 'Android push').disabled).toBe(false);
  });

  it('keeps confirmation busy until the save completes and reports failures', async () => {
    const save = deferred<TenantNotificationSettings>();
    mocks.setDelivery.mockReturnValue(save.promise);
    const container = await renderPage();

    await act(async () => toggle(container, 'Email and phone alerts').click());
    await act(async () => button(container, 'Pause alerts').click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(button(container, 'Working…').disabled).toBe(true);

    await act(async () => save.reject(new Error('Delivery update failed.')));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Delivery update failed.',
    );
    expect(toggle(container, 'Email and phone alerts').getAttribute('aria-checked')).toBe('true');
  });

  it('offers retry after a settings load failure', async () => {
    mocks.fetchSettings.mockRejectedValueOnce(new Error('Settings unavailable.'));
    const container = await renderPage();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'Settings unavailable.',
    );
    mocks.fetchSettings.mockResolvedValue(active);
    await act(async () => button(container, 'Try again').click());
    expect(toggle(container, 'Email and phone alerts').getAttribute('aria-checked')).toBe('true');
  });
});
