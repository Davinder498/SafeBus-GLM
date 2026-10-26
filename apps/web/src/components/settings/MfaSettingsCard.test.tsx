import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { MfaSettingsCard } from './MfaSettingsCard';

const mocks = vi.hoisted(() => ({ role: 'guardian', enabled: false }));
vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => ({
    profile: { role: mocks.role },
    mfaLoading: false,
    mfaStatus: { verifiedFactors: mocks.enabled ? [{ id: 'factor', factorType: 'totp' }] : [] },
  }),
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root;
let container: HTMLDivElement;
function Destination() {
  const location = useLocation();
  return (
    <p data-testid="destination">
      {location.pathname}:{JSON.stringify(location.state)}
    </p>
  );
}
async function render() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <MfaSettingsCard />
        <Destination />
      </MemoryRouter>,
    ),
  );
  return container.querySelector<HTMLButtonElement>('[role="switch"]')!;
}
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
it.each(['guardian', 'driver'])(
  'routes %s MFA switches through setup and verified removal',
  async (role) => {
    mocks.role = role;
    mocks.enabled = false;
    const toggle = await render();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await act(async () => toggle.click());
    expect(container.querySelector('[data-testid="destination"]')?.textContent).toBe(
      '/account/security:{"removeAuthenticator":false}',
    );
    mocks.enabled = true;
    await act(async () =>
      root.render(
        <MemoryRouter>
          <MfaSettingsCard />
          <Destination />
        </MemoryRouter>,
      ),
    );
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await act(async () => toggle.click());
    expect(container.querySelector('[data-testid="destination"]')?.textContent).toBe(
      '/account/security:{"removeAuthenticator":true}',
    );
  },
);
it.each(['platform_super_admin', 'tenant_admin', 'school_admin', 'transportation_admin'])(
  'keeps %s MFA required and its setup card accessible',
  async (role) => {
    mocks.role = role;
    mocks.enabled = true;
    const toggle = await render();
    expect(toggle.disabled).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('Required');
    const link = container.querySelector<HTMLAnchorElement>('a[aria-label="Manage MFA"]')!;
    await act(async () => link.click());
    expect(container.querySelector('[data-testid="destination"]')?.textContent).toContain(
      '/account/security:',
    );
  },
);
