import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: { url: string }) => void),
  launch: vi.fn(),
  setSession: vi.fn(),
  exchange: vi.fn(),
  verify: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (_: string, callback: typeof mocks.listener) => {
      mocks.listener = callback;
    }),
    getLaunchUrl: mocks.launch,
  },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      setSession: mocks.setSession,
      exchangeCodeForSession: mocks.exchange,
      verifyOtp: mocks.verify,
    },
  },
}));
vi.mock('@/lib/authNavigation', () => ({
  ANDROID_PASSWORD_RESET_REDIRECT: 'com.safebusalberta.app://auth/update-password',
  navigateToPasswordUpdate: mocks.navigate,
}));
const url = 'com.safebusalberta.app://auth/update-password?code=synthetic-code';
function deferred() {
  let resolve!: (value: { error: null }) => void;
  const promise = new Promise<{ error: null }>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const request of [
    mocks.launch,
    mocks.setSession,
    mocks.exchange,
    mocks.verify,
    mocks.navigate,
  ])
    request.mockReset();
  sessionStorage.clear();
  mocks.listener = null;
  mocks.launch.mockResolvedValue(undefined);
  for (const request of [mocks.setSession, mocks.exchange, mocks.verify])
    request.mockResolvedValue({ error: null });
});
async function install() {
  await (await import('./authDeepLinks')).installNativeAuthDeepLinks();
}

it('allows reopening the same link after a failed cold-start exchange', async () => {
  mocks.launch.mockResolvedValue({ url });
  mocks.exchange.mockResolvedValueOnce({ error: { message: 'Network unavailable' } });
  await install();
  expect(sessionStorage.getItem('safebus.passwordRecoveryError')).toBeTruthy();
  mocks.listener!({ url });
  await vi.waitFor(() => expect(mocks.exchange).toHaveBeenCalledTimes(2));
  await vi.waitFor(() =>
    expect(sessionStorage.getItem('safebus.passwordRecoveryError')).toBeNull(),
  );
});
it('deduplicates launch and foreground callbacks while the exchange is pending', async () => {
  const pending = deferred();
  mocks.exchange.mockReturnValue(pending.promise);
  mocks.launch.mockResolvedValue({ url });
  const starting = install();
  await vi.waitFor(() => expect(mocks.exchange).toHaveBeenCalledOnce());
  mocks.listener!({ url });
  mocks.listener!({ url });
  pending.resolve({ error: null });
  await starting;
  expect(mocks.exchange).toHaveBeenCalledOnce();
  expect(mocks.navigate).toHaveBeenCalledOnce();
});
it('does not exchange a successfully consumed link again', async () => {
  mocks.launch.mockResolvedValue({ url });
  await install();
  mocks.listener!({ url });
  await Promise.resolve();
  expect(mocks.exchange).toHaveBeenCalledOnce();
  expect(mocks.navigate).toHaveBeenCalledOnce();
});
it.each([
  ['#access_token=synthetic-access&refresh_token=synthetic-refresh&type=recovery', 'session'],
  ['?token_hash=synthetic-hash&type=recovery', 'otp'],
] as const)('allows retry after a rejected %s callback', async (suffix, kind) => {
  const request = kind === 'session' ? mocks.setSession : mocks.verify;
  request.mockRejectedValueOnce(new Error('Offline'));
  const link = 'com.safebusalberta.app://auth/update-password' + suffix;
  mocks.launch.mockResolvedValue({ url: link });
  await install();
  mocks.listener!({ url: link });
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  await vi.waitFor(() =>
    expect(sessionStorage.getItem('safebus.passwordRecoveryError')).toBeNull(),
  );
});
it('ignores unapproved destinations and non-recovery links', async () => {
  await install();
  for (const link of [
    'https://untrusted.example/update-password?code=synthetic',
    'com.safebusalberta.app://auth/update-password?code=synthetic&type=signup',
  ])
    mocks.listener!({ url: link });
  await Promise.resolve();
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(mocks.navigate).not.toHaveBeenCalled();
});
it('does not store link credentials or raw provider errors in recovery feedback', async () => {
  mocks.exchange.mockRejectedValue(new Error('private-provider-detail synthetic-code'));
  mocks.launch.mockResolvedValue({ url });
  await install();
  const feedback = sessionStorage.getItem('safebus.passwordRecoveryError')!;
  expect(feedback).not.toContain('synthetic-code');
  expect(feedback).not.toContain('private-provider-detail');
  expect(mocks.navigate).toHaveBeenCalledWith();
});
it('serializes different reset links so a delayed older exchange cannot finish last', async () => {
  const pending = deferred();
  mocks.exchange.mockReturnValueOnce(pending.promise);
  await install();
  mocks.listener!({ url });
  await vi.waitFor(() => expect(mocks.exchange).toHaveBeenCalledOnce());
  mocks.listener!({ url: url.replace('synthetic-code', 'synthetic-new-code') });
  await Promise.resolve();
  expect(mocks.exchange).toHaveBeenCalledOnce();
  pending.resolve({ error: null });
  await vi.waitFor(() => expect(mocks.exchange).toHaveBeenCalledTimes(2));
  expect(mocks.exchange).toHaveBeenLastCalledWith('synthetic-new-code');
});
