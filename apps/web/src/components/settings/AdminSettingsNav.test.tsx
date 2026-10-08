import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProfileRole } from '@/contexts/AuthContext';
import { AdminSettingsNav } from './AdminSettingsNav';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  document.body.innerHTML = '';
});

async function renderSettingsNav(path: string, role: ProfileRole) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[path]}>
        <AdminSettingsNav role={role} />
      </MemoryRouter>,
    );
  });

  return container;
}

describe('AdminSettingsNav', () => {
  it('keeps tenant-owned support and billing hidden from delegated administrators', async () => {
    const container = await renderSettingsNav('/admin/settings', 'school_admin');

    expect(Array.from(container.querySelectorAll('a')).map((link) => link.textContent)).toEqual([
      'Organization',
      'Schools',
    ]);
  });

  it('shows billing as a tenant-admin settings section and marks it active', async () => {
    const container = await renderSettingsNav('/admin/settings/billing', 'tenant_admin');
    const links = Array.from(container.querySelectorAll('a'));

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/settings/support',
      '/admin/settings',
      '/admin/settings/schools',
      '/admin/settings/notifications',
      '/admin/settings/billing',
    ]);
    expect(
      links.find((link) => link.getAttribute('aria-current') === 'page')?.textContent,
    ).toContain('Subscription & billing');
  });

  it('shows tenant notification controls only to tenant administrators', async () => {
    const tenant = await renderSettingsNav('/admin/settings/notifications', 'tenant_admin');
    expect(tenant.textContent).toContain('Notifications');
    expect(tenant.querySelector('nav')?.className).not.toContain('overflow-x-auto');
    expect(tenant.querySelector('ul')?.className).toContain('flex-wrap');
    expect(
      Array.from(tenant.querySelectorAll('a'))
        .find((link) => link.getAttribute('aria-current') === 'page')
        ?.getAttribute('href'),
    ).toBe('/admin/settings/notifications');

    await act(async () => root?.unmount());
    root = null;
    document.body.innerHTML = '';
    const delegated = await renderSettingsNav('/admin/settings', 'transportation_admin');
    expect(delegated.textContent).not.toContain('Notifications');
  });
});
