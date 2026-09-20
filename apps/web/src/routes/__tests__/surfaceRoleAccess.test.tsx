import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppSurfaceProvider, type AppSurface } from '@/contexts/AppSurfaceContext';
import {
  AuthContext,
  type AuthContextValue,
  type Profile,
  type ProfileRole,
} from '@/contexts/AuthContext';
import { LoginPage } from '@/pages/LoginPage';
import { AcceptInvitationPage } from '@/pages/AcceptInvitationPage';
import { UpdatePasswordPage } from '@/pages/UpdatePasswordPage';
import { PublicOnlyRoute } from '@/routes/PublicOnlyRoute';
import { AdminNotAvailablePage } from '../../../../mobile/src/pages/AdminNotAvailablePage';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  sessionStorage.clear();
});

function profile(role: ProfileRole, status = 'active'): Profile {
  return {
    id: `${role}-profile`,
    tenant_id: role === 'platform_super_admin' ? null : 'tenant-id',
    school_id: null,
    full_name: 'Test User',
    email: `${role}@example.test`,
    role,
    status,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function authValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  const admin = profile('tenant_admin');
  return {
    session: null,
    user: null,
    profile: null,
    loading: false,
    authError: null,
    configError: null,
    mfaStatus: { currentLevel: 'aal2', nextLevel: 'aal2', verifiedFactors: [] },
    mfaLoading: false,
    signIn: vi.fn(async () => admin),
    signOut: vi.fn(async () => undefined),
    requestPasswordReset: vi.fn(async () => undefined),
    completeInvitation: vi.fn(async () => admin),
    updatePassword: vi.fn(async () => undefined),
    refreshProfile: vi.fn(async () => admin),
    refreshMfa: vi.fn(async () => ({
      currentLevel: 'aal2',
      nextLevel: 'aal2',
      verifiedFactors: [],
    })),
    ...overrides,
  };
}

async function render(node: ReactNode, auth: AuthContextValue, surface: AppSurface = 'web') {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MemoryRouter>
        <AppSurfaceProvider surface={surface}>
          <AuthContext.Provider value={auth}>{node}</AuthContext.Provider>
        </AppSurfaceProvider>
      </MemoryRouter>,
    );
  });
  return container;
}

async function enter(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function submit(container: HTMLElement) {
  await act(async () => {
    container
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

describe('surface role access', () => {
  it('signs a driver out after a successful website login and directs them to mobile', async () => {
    const driver = profile('driver');
    const auth = authValue({
      signIn: vi.fn(async () => driver),
      signOut: vi.fn(async () => undefined),
    });
    const container = await render(<LoginPage />, auth);
    const [email, password] = Array.from(container.querySelectorAll('input'));
    await enter(email, 'driver@example.test');
    await enter(password, 'valid-password');
    await submit(container);

    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(container.textContent).toContain(
      'Driver and parent accounts use the BusSafe mobile app',
    );
  });

  it('signs an administrator out after a successful mobile login and directs them to web', async () => {
    const admin = profile('tenant_admin');
    const auth = authValue({
      signIn: vi.fn(async () => admin),
      signOut: vi.fn(async () => undefined),
    });
    const container = await render(<LoginPage />, auth, 'native-mobile');
    const [email, password] = Array.from(container.querySelectorAll('input'));
    await enter(email, 'admin@example.test');
    await enter(password, 'valid-password');
    await submit(container);

    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Administrator accounts use the BusSafe website');
  });

  it('ends an existing administrator session on the mobile web-only fallback', async () => {
    const admin = profile('tenant_admin');
    const auth = authValue({
      session: {} as AuthContextValue['session'],
      profile: admin,
      signOut: vi.fn(async () => undefined),
    });
    const container = await render(<AdminNotAvailablePage />, auth, 'native-mobile');

    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Admin access on web only');
  });

  it('ends an existing wrong-surface session before showing the login form', async () => {
    const driver = profile('driver');
    const auth = authValue({
      session: {} as AuthContextValue['session'],
      profile: driver,
      signOut: vi.fn(async () => undefined),
    });
    const container = await render(
      <PublicOnlyRoute>
        <LoginPage />
      </PublicOnlyRoute>,
      auth,
    );

    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Use the correct BusSafe app');
  });

  it('activates a driver invitation on web, signs out, and directs them to mobile', async () => {
    const invited = profile('driver', 'invited');
    const active = profile('driver');
    const auth = authValue({
      session: {} as AuthContextValue['session'],
      profile: invited,
      completeInvitation: vi.fn(async () => active),
      signOut: vi.fn(async () => undefined),
    });
    const container = await render(<AcceptInvitationPage />, auth);
    const [password, confirmation] = Array.from(container.querySelectorAll('input'));
    await enter(password, 'long-secure-password');
    await enter(confirmation, 'long-secure-password');
    await submit(container);

    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(container.textContent).toContain('Your account is ready. Open the BusSafe mobile app');
  });

  it('updates a driver password on web, signs out, and directs them to mobile', async () => {
    const driver = profile('driver');
    const auth = authValue({
      session: {} as AuthContextValue['session'],
      profile: driver,
      updatePassword: vi.fn(async () => undefined),
      signOut: vi.fn(async () => undefined),
    });
    const container = await render(<UpdatePasswordPage />, auth);
    const [password, confirmation] = Array.from(container.querySelectorAll('input'));
    await enter(password, 'long-secure-password');
    await enter(confirmation, 'long-secure-password');
    await submit(container);

    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(container.textContent).toContain(
      'Your password is updated. Open the BusSafe mobile app',
    );
  });
});
