import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { UpdatePasswordPage } from './UpdatePasswordPage';

vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => ({
    session: { user: { id: 'synthetic-admin' } },
    profile: { id: 'synthetic-admin', role: 'tenant_admin', status: 'active' },
    loading: false,
    authError: null,
    configError: null,
    updatePassword: vi.fn(),
    completeInvitation: vi.fn(),
    signOut: vi.fn(),
  }),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root;
beforeEach(() => {
  sessionStorage.clear();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '';
  sessionStorage.clear();
});
async function render() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <StrictMode>
        <MemoryRouter initialEntries={['/update-password']}>
          <UpdatePasswordPage />
        </MemoryRouter>
      </StrictMode>,
    );
  });
  return container;
}
it('clears the old recovery banner when a reopened link succeeds on the same page', async () => {
  sessionStorage.setItem('safebus.passwordRecoveryError', 'Previous recovery failed.');
  const container = await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'Previous recovery failed.',
  );
  expect(sessionStorage.getItem('safebus.passwordRecoveryError')).toBe('Previous recovery failed.');
  expect(container.querySelector('form')).toBeNull();
  sessionStorage.removeItem('safebus.passwordRecoveryError');
  await act(async () => {
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.querySelector('form')).not.toBeNull();
});
it('shows the latest sanitized failure when a second link fails on an already-open form', async () => {
  const container = await render();
  sessionStorage.setItem(
    'safebus.passwordRecoveryError',
    'Unable to verify this password reset link.',
  );
  await act(async () => {
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    'Unable to verify this password reset link.',
  );
  expect(container.querySelector('form')).toBeNull();
  expect(container.textContent).toContain('Request another reset link');
  expect(sessionStorage.getItem('safebus.passwordRecoveryError')).toBe(
    'Unable to verify this password reset link.',
  );
});
