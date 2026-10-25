import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppSurfaceProvider } from '@/contexts/AppSurfaceContext';
import type { AuthContextValue, ProfileRole } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { MfaPage } from '@/pages/MfaPage';

const mocks = vi.hoisted(() => ({
  auth: {} as AuthContextValue,
  enroll: vi.fn(),
  listFactors: vi.fn(),
  unenroll: vi.fn(),
  challengeAndVerify: vi.fn(),
  refreshSession: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock('@/contexts/useAuth', () => ({ useAuth: () => mocks.auth }));
vi.mock('@/lib/supabase', () => ({
  supabaseConfigError: null,
  supabase: {
    rpc: mocks.rpc,
    auth: {
      refreshSession: mocks.refreshSession,
      mfa: {
        enroll: mocks.enroll,
        listFactors: mocks.listFactors,
        unenroll: mocks.unenroll,
        challengeAndVerify: mocks.challengeAndVerify,
      },
    },
  },
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root | null = null;
const factor = { id: 'factor-1', factorType: 'totp', friendlyName: 'SafeBus authenticator' };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth = {
    session: { user: { id: 'user' } },
    profile: { id: 'user', role: 'guardian', status: 'active' },
    loading: false,
    authError: null,
    mfaLoading: false,
    mfaStatus: { currentLevel: 'aal1', nextLevel: 'aal1', verifiedFactors: [] },
    signOut: vi.fn(),
    refreshMfa: vi.fn(async () => mocks.auth.mfaStatus),
  } as unknown as AuthContextValue;
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.refreshSession.mockResolvedValue({ error: null });
  mocks.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
  mocks.enroll.mockResolvedValue({
    data: { id: 'new-factor', totp: { qr_code: '<svg/>', secret: 'synthetic-key' } },
    error: null,
  });
  mocks.challengeAndVerify.mockResolvedValue({ error: null });
  mocks.unenroll.mockResolvedValue({ error: null });
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});
function Destination() {
  const location = useLocation();
  return (
    <p>
      {location.pathname}
      {location.search}
      {location.hash}:{JSON.stringify(location.state)}
    </p>
  );
}
async function render(path = '/account/security', guard = false) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <AppSurfaceProvider
        surface={mocks.auth.profile?.role === 'tenant_admin' ? 'web' : 'native-mobile'}
      >
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/account/security"
              element={
                guard ? (
                  <ProtectedRoute allowedRoles={['guardian', 'driver', 'tenant_admin']}>
                    <p>Preferences available</p>
                  </ProtectedRoute>
                ) : (
                  <MfaPage />
                )
              }
            />
            <Route path="/mfa" element={<Destination />} />
            <Route path="/notifications/settings" element={<Destination />} />
            <Route path="/driver/settings" element={<Destination />} />
          </Routes>
        </MemoryRouter>
      </AppSurfaceProvider>,
    );
  });
  return container;
}
async function click(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll('button')].find((b) =>
    b.textContent?.includes(label),
  );
  expect(button).toBeTruthy();
  await act(async () => button?.click());
}
async function submit(container: HTMLElement, code: string) {
  const input = container.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, code);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () =>
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
}

it.each<ProfileRole>(['guardian', 'driver'])(
  'lets a %s use preferences without enrolling in MFA',
  async (role) => {
    mocks.auth.profile!.role = role;
    expect((await render('/account/security', true)).textContent).toContain(
      'Preferences available',
    );
  },
);
it.each<ProfileRole>(['guardian', 'driver', 'tenant_admin'])(
  'requires MFA for an enrolled %s and preserves the requested destination',
  async (role) => {
    mocks.auth.profile!.role = role;
    mocks.auth.mfaStatus = { currentLevel: 'aal1', nextLevel: 'aal2', verifiedFactors: [factor] };
    const c = await render('/account/security?tab=security#authenticator', true);
    expect(c.textContent).toContain('/mfa');
    expect(c.textContent).toContain('/account/security?tab=security#authenticator');
  },
);
it('keeps MFA mandatory for an administrator without an enrolled factor', async () => {
  mocks.auth.profile!.role = 'tenant_admin';
  expect((await render('/account/security', true)).textContent).toContain('/mfa');
});
it('allows an enrolled user after verification', async () => {
  mocks.auth.mfaStatus = { currentLevel: 'aal2', nextLevel: 'aal2', verifiedFactors: [factor] };
  expect((await render('/account/security', true)).textContent).toContain('Preferences available');
});
it('lets a guardian enroll and verify an authenticator from account settings', async () => {
  const c = await render();
  await click(c, 'Set up authenticator app');
  expect(mocks.enroll).toHaveBeenCalledWith({
    factorType: 'totp',
    friendlyName: 'SafeBus authenticator',
  });
  expect(c.querySelector('img')?.src).toContain('%3Csvg%2F%3E');
  await submit(c, '123456');
  expect(mocks.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'new-factor', code: '123456' });
  expect(c.textContent).toContain('/notifications/settings:');
});
it('requires a new code to remove MFA even in an already verified session', async () => {
  mocks.auth.mfaStatus = { currentLevel: 'aal2', nextLevel: 'aal2', verifiedFactors: [factor] };
  const c = await render();
  await click(c, 'Remove authenticator');
  expect(mocks.unenroll).not.toHaveBeenCalled();
  await submit(c, '654321');
  expect(mocks.challengeAndVerify).toHaveBeenCalledWith({ factorId: factor.id, code: '654321' });
  expect(mocks.unenroll).toHaveBeenCalledWith({ factorId: factor.id });
  expect(mocks.challengeAndVerify.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.unenroll.mock.invocationCallOrder[0],
  );
  expect(c.textContent).toContain('/notifications/settings:');
});
it('keeps the authenticator when fresh verification fails', async () => {
  mocks.auth.mfaStatus = { currentLevel: 'aal2', nextLevel: 'aal2', verifiedFactors: [factor] };
  mocks.challengeAndVerify.mockResolvedValue({ error: { message: 'Invalid authenticator code' } });
  const c = await render();
  await click(c, 'Remove authenticator');
  await submit(c, '111111');
  expect(mocks.unenroll).not.toHaveBeenCalled();
  expect(c.textContent).toContain('Invalid authenticator code');
});

it('returns a driver to Driver settings after enrollment', async () => {
  mocks.auth.profile!.role = 'driver';
  const c = await render();
  await click(c, 'Set up authenticator app');
  await submit(c, '123456');
  expect(c.textContent).toContain('/driver/settings:');
});
