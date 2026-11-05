import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, type AuthContextValue } from './AuthContext';
import { useAuth } from './useAuth';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  profile: vi.fn(),
  assurance: vi.fn(),
  factors: vi.fn(),
  rpc: vi.fn(),
  listener: null as null | ((event: AuthChangeEvent, session: Session | null) => void),
}));
vi.mock('@/lib/supabase', () => ({
  supabaseConfigError: null,
  supabase: {
    from: () => ({
      select: () => ({ eq: (_: string, id: string) => ({ single: () => mocks.profile(id) }) }),
    }),
    rpc: mocks.rpc,
    auth: {
      getSession: mocks.getSession,
      signInWithPassword: mocks.signIn,
      signOut: mocks.signOut,
      onAuthStateChange: (listener: typeof mocks.listener) => {
        mocks.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      mfa: { getAuthenticatorAssuranceLevel: mocks.assurance, listFactors: mocks.factors },
    },
  },
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
let root: Root;
let auth: AuthContextValue;
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function session(id: string, token = id): Session {
  return { access_token: token, user: { id } } as Session;
}
function profile(id: string) {
  return {
    data: { id, role: id === 'a' ? 'tenant_admin' : 'guardian', status: 'active' },
    error: null,
  };
}
function Probe() {
  auth = useAuth();
  return (
    <output>
      {auth.session?.user.id}:{auth.profile?.id}:{auth.mfaStatus.currentLevel}:
      {String(auth.loading)}
    </output>
  );
}
async function emit(event: AuthChangeEvent, next: Session | null) {
  await act(async () => {
    mocks.listener!(event, next);
  });
}
async function render() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
  return container;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.listener = null;
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.profile.mockImplementation(async (id: string) => profile(id));
  mocks.assurance.mockResolvedValue({
    data: { currentLevel: 'aal1', nextLevel: 'aal1' },
    error: null,
  });
  mocks.factors.mockResolvedValue({ data: { all: [] }, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.signOut.mockImplementation(async () => {
    mocks.listener!('SIGNED_OUT', null);
    return { error: null };
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.innerHTML = '';
});

it('ignores a startup session lookup superseded by a new sign-in', async () => {
  const startup = deferred<unknown>();
  mocks.getSession.mockReturnValue(startup.promise);
  await render();
  await emit('SIGNED_IN', session('b'));
  await act(async () => startup.resolve({ data: { session: session('a') }, error: null }));
  expect(auth.session?.user.id).toBe('b');
  expect(auth.profile?.id).toBe('b');
});
it('does not restore a delayed profile after sign-out', async () => {
  const pending = deferred<unknown>();
  mocks.profile.mockReturnValueOnce(pending.promise);
  await render();
  await emit('SIGNED_IN', session('a'));
  await emit('SIGNED_OUT', null);
  await act(async () => pending.resolve(profile('a')));
  expect(auth.session).toBeNull();
  expect(auth.profile).toBeNull();
  expect(auth.mfaStatus.currentLevel).toBeNull();
  expect(auth.loading).toBe(false);
});
it('does not mix a previous account profile with the current session', async () => {
  const pending = deferred<unknown>();
  mocks.profile.mockReturnValueOnce(pending.promise);
  await render();
  await emit('SIGNED_IN', session('a'));
  await emit('SIGNED_IN', session('b'));
  await act(async () => pending.resolve(profile('a')));
  expect(auth.session?.user.id).toBe('b');
  expect(auth.profile?.id).toBe('b');
});
it('does not let an old profile failure clear the new account', async () => {
  const pending = deferred<unknown>();
  mocks.profile.mockReturnValueOnce(pending.promise);
  await render();
  await emit('SIGNED_IN', session('a'));
  await emit('SIGNED_IN', session('b'));
  await act(async () => pending.reject(new Error('Old request failed')));
  expect(auth.profile?.id).toBe('b');
  expect(auth.authError).toBeNull();
});
it('discards MFA assurance from the previous session', async () => {
  const pending = deferred<unknown>();
  mocks.assurance.mockReturnValueOnce(pending.promise);
  await render();
  await emit('SIGNED_IN', session('a'));
  await emit('SIGNED_IN', session('b'));
  await act(async () =>
    pending.resolve({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }),
  );
  expect(auth.profile?.id).toBe('b');
  expect(auth.mfaStatus.currentLevel).toBe('aal1');
});
it('clears previous account state immediately while the next profile is loading', async () => {
  await render();
  await emit('SIGNED_IN', session('a'));
  const pending = deferred<unknown>();
  mocks.profile.mockReturnValueOnce(pending.promise);
  await emit('SIGNED_IN', session('b'));
  expect(auth.profile).toBeNull();
  expect(auth.mfaStatus.currentLevel).toBeNull();
  expect(auth.loading).toBe(true);
  await act(async () => pending.resolve(profile('b')));
  expect(auth.profile?.id).toBe('b');
});
it('rejects an explicit profile refresh that finishes after an account switch', async () => {
  await render();
  await emit('SIGNED_IN', session('a'));
  const pending = deferred<unknown>();
  mocks.profile.mockReturnValueOnce(pending.promise);
  let result!: Promise<unknown>;
  await act(async () => {
    result = auth.refreshProfile().catch((error) => error);
  });
  await emit('SIGNED_IN', session('b'));
  await act(async () => pending.resolve(profile('a')));
  expect(await result).toBeInstanceOf(Error);
  expect(auth.profile?.id).toBe('b');
});
it('does not resurrect a sign-in response that finishes after sign-out', async () => {
  await render();
  const pending = deferred<unknown>();
  mocks.signIn.mockReturnValueOnce(pending.promise);
  let result!: Promise<unknown>;
  await act(async () => {
    result = auth.signIn('member@example.test', 'test-only').catch((error) => error);
  });
  await emit('SIGNED_OUT', null);
  await act(async () => pending.resolve({ data: { session: session('a') }, error: null }));
  expect(await result).toBeInstanceOf(Error);
  expect(auth.session).toBeNull();
  expect(auth.profile).toBeNull();
});

it('keeps the next session loading when an old request finishes', async () => {
  const first = deferred<unknown>();
  const second = deferred<unknown>();
  mocks.profile.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  await render();
  await emit('SIGNED_IN', session('a'));
  await emit('SIGNED_IN', session('b'));
  await act(async () => first.resolve(profile('a')));
  expect(auth.profile).toBeNull();
  expect(auth.loading).toBe(true);
  await act(async () => second.resolve(profile('b')));
  expect(auth.profile?.id).toBe('b');
  expect(auth.loading).toBe(false);
});

it('rejects a manual MFA refresh that finishes after sign-out', async () => {
  await render();
  await emit('SIGNED_IN', session('a'));
  const pending = deferred<unknown>();
  mocks.assurance.mockReturnValueOnce(pending.promise);
  let result!: Promise<unknown>;
  await act(async () => {
    result = auth.refreshMfa().catch((error) => error);
  });
  await emit('SIGNED_OUT', null);
  await act(async () =>
    pending.resolve({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }),
  );
  expect(await result).toBeInstanceOf(Error);
  expect(auth.mfaStatus.currentLevel).toBeNull();
  expect(auth.mfaLoading).toBe(false);
});

it('does not clear a new session when an old sign-in fails', async () => {
  await render();
  const pending = deferred<unknown>();
  mocks.signIn.mockReturnValueOnce(pending.promise);
  let result!: Promise<unknown>;
  await act(async () => {
    result = auth.signIn('member@example.test', 'test-only').catch((error) => error);
  });
  await emit('SIGNED_IN', session('b'));
  await act(async () =>
    pending.resolve({ data: { session: null }, error: { message: 'Old failure' } }),
  );
  expect(await result).toBeInstanceOf(Error);
  expect(auth.profile?.id).toBe('b');
  expect(auth.session?.user.id).toBe('b');
});

it.each(['USER_UPDATED', 'MFA_CHALLENGE_VERIFIED', 'TOKEN_REFRESHED'] as const)(
  'rehydrates the current account when %s replaces its token',
  async (event) => {
    await render();
    await emit('SIGNED_IN', session('a'));
    await emit(event, session('a', 'new-session-token'));
    expect(auth.profile?.id).toBe('a');
    expect(auth.loading).toBe(false);
    expect(auth.mfaStatus.currentLevel).toBe('aal1');
  },
);

it('allows the normal sign-in event and returned result to finish together', async () => {
  await render();
  mocks.signIn.mockImplementation(async () => {
    const next = session('a');
    mocks.listener!('SIGNED_IN', next);
    return { data: { session: next }, error: null };
  });
  let result;
  await act(async () => {
    result = await auth.signIn('member@example.test', 'test-only');
  });
  expect(result).toMatchObject({ id: 'a', role: 'tenant_admin' });
  expect(auth.authError).toBeNull();
  expect(auth.loading).toBe(false);
  expect(auth.profile?.id).toBe('a');
});

it.each(['platform_super_admin', 'tenant_admin', 'transportation_admin', 'guardian', 'driver'])(
  'preserves normal profile loading for %s',
  async (role) => {
    mocks.profile.mockResolvedValue({
      data: { id: 'member', role, status: 'active' },
      error: null,
    });
    await render();
    await emit('SIGNED_IN', session('member'));
    expect(auth.profile?.role).toBe(role);
    expect(auth.loading).toBe(false);
  },
);

it('continues to reject the retired school_admin role', async () => {
  mocks.profile.mockResolvedValue({
    data: { id: 'member', role: 'school_admin', status: 'active' },
    error: null,
  });
  await render();
  await emit('SIGNED_IN', session('member'));
  expect(auth.profile).toBeNull();
  expect(auth.authError).toContain('unsupported role');
});

it('ignores a delayed revocation result for a superseded session', async () => {
  const pending = deferred<unknown>();
  mocks.rpc.mockImplementation((name: string) =>
    name === 'is_current_user_session_active'
      ? pending.promise
      : Promise.resolve({ data: true, error: null }),
  );
  await render();
  await emit('SIGNED_IN', session('a'));
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  await emit('SIGNED_IN', session('b'));
  await act(async () => pending.resolve({ data: false, error: null }));
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(auth.profile?.id).toBe('b');
});

it('clears a revoked session even when the Auth sign-out request fails', async () => {
  const pending = deferred<unknown>();
  mocks.profile.mockReturnValueOnce(pending.promise);
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name !== 'is_current_user_session_active',
    error: null,
  }));
  mocks.signOut.mockRejectedValue(new Error('Offline'));
  await render();
  await emit('SIGNED_IN', session('a'));
  await act(async () => pending.resolve(profile('a')));
  expect(auth.session).toBeNull();
  expect(auth.profile).toBeNull();
  expect(auth.mfaStatus.currentLevel).toBeNull();
  expect(auth.loading).toBe(false);
});

it('does not interrupt a password update when USER_UPDATED keeps the same token', async () => {
  await render();
  await emit('SIGNED_IN', session('a'));
  mocks.profile.mockClear();
  await emit('USER_UPDATED', session('a'));
  expect(mocks.profile).not.toHaveBeenCalled();
  expect(auth.profile?.id).toBe('a');
  expect(auth.loading).toBe(false);
});

it('discards old assurance after the same account receives a new token', async () => {
  const pending = deferred<unknown>();
  mocks.assurance.mockReturnValueOnce(pending.promise);
  await render();
  await emit('SIGNED_IN', session('a', 'old-token'));
  await emit('TOKEN_REFRESHED', session('a', 'new-token'));
  await act(async () =>
    pending.resolve({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null }),
  );
  expect(auth.session?.access_token).toBe('new-token');
  expect(auth.profile?.id).toBe('a');
  expect(auth.mfaStatus.currentLevel).toBe('aal1');
});
