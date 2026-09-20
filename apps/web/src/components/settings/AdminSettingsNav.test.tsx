import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
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

async function renderSettingsNav(path: string, showBilling: boolean) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(
      <MemoryRouter initialEntries={[path]}>
        <AdminSettingsNav showBilling={showBilling} />
      </MemoryRouter>,
    );
  });

  return container;
}

describe('AdminSettingsNav', () => {
  it('keeps billing hidden from non-tenant administrators', async () => {
    const container = await renderSettingsNav('/admin/settings', false);

    expect(Array.from(container.querySelectorAll('a')).map((link) => link.textContent)).toEqual([
      'OrganizationAccount and organization context',
    ]);
  });

  it('shows billing as a tenant-admin settings section and marks it active', async () => {
    const container = await renderSettingsNav('/admin/settings/billing', true);
    const links = Array.from(container.querySelectorAll('a'));

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/admin/settings',
      '/admin/settings/billing',
    ]);
    expect(
      links.find((link) => link.getAttribute('aria-current') === 'page')?.textContent,
    ).toContain('Subscription & billing');
  });
});
