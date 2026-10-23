import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminAuditSearchPage } from './AdminAuditSearchPage';
import { searchAuditEvents } from '@/services/tenantAdminService';

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
  adminNavGroups: [],
}));
vi.mock('@/services/tenantAdminService', () => ({
  searchAuditEvents: vi.fn(async () => [
    {
      id: 'audit-1',
      created_at: '2026-10-23T12:00:00Z',
      action: 'tenant.suspended',
      actor_email: 'admin@example.test',
      actor_role: 'tenant_admin',
      target_type: 'tenant',
      target_label: 'Example School Division',
      outcome: 'success',
    },
  ]),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

it('searches the existing account audit records using the school authority name', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<AdminAuditSearchPage />));
  const input = container.querySelector<HTMLInputElement>('#audit-target')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'School authority',
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => container.querySelector<HTMLButtonElement>('button')?.click());
  expect(searchAuditEvents).toHaveBeenCalledWith(expect.objectContaining({ targetType: 'tenant' }));
  const table = container.querySelector('tbody')!;
  expect(table.textContent).toContain('School authority suspended');
  expect(table.textContent).toContain('School authority admin');
  expect(table.textContent).toContain('Example School Division');
  expect(table.textContent).not.toContain('tenant_admin');
});
