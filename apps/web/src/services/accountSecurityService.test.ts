import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changeOwnPassword, AccountSecurityError, accountSecurityErrorMessage } from './accountSecurityService';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
  policy: vi.fn(),
  updateUser: vi.fn(),
  recordEvent: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@/lib/supabase', () => ({
  supabaseConfigError: null,
  supabaseEnv: { url: 'https://project.example.test', anonKey: 'public-key' },
  supabase: {
    auth: { getSession: mocks.getSession, getUser: mocks.getUser, updateUser: mocks.updateUser },
    rpc: vi.fn((name: string) =>
      name === 'enforce_new_password_policy' ? mocks.policy() : mocks.recordEvent(),
    ),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: 'user-one' }, access_token: 'current-application-session' } },
    error: null,
  });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: 'user-one', email: 'member@example.test' } },
    error: null,
  });
  mocks.policy.mockResolvedValue({ error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.recordEvent.mockResolvedValue({ error: null });
  mocks.signInWithPassword.mockResolvedValue({
    data: { user: { id: 'user-one' }, session: { access_token: 'ephemeral-session' } },
    error: null,
  });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.createClient.mockReturnValue({
    auth: { signInWithPassword: mocks.signInWithPassword, signOut: mocks.signOut },
  });
});

describe('authenticated current-password change', () => {
  it('validates the existing password with an isolated non-persistent auth client', async () => {
    await changeOwnPassword('old-secret', 'new-secret-long-enough');
    expect(mocks.createClient).toHaveBeenCalledWith(
      'https://project.example.test',
      'public-key',
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: 'member@example.test', password: 'old-secret',
    });
    expect(mocks.updateUser).toHaveBeenCalledWith({
      current_password: 'old-secret', password: 'new-secret-long-enough',
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('does not update credentials when current password is wrong', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null }, error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });
    await expect(changeOwnPassword('wrong-secret', 'new-secret-long-enough'))
      .rejects.toThrow('Current password is incorrect');
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('rejects an authenticated identity mismatch even when Supabase returned a session', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'another-user' }, session: {} }, error: null,
    });
    await expect(changeOwnPassword('old-secret', 'new-secret-long-enough'))
      .rejects.toThrow('Current password is incorrect');
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('rejects weak passwords before attempting current-password verification', async () => {
    mocks.policy.mockResolvedValue({ error: { code: '22023', message: 'Policy rejected' } });
    await expect(changeOwnPassword('old-secret', 'weak'))
      .rejects.toThrow('password requirements');
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('never changes another account when the active session is invalid', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'Expired' } });
    await expect(changeOwnPassword('old-secret', 'new-secret-long-enough'))
      .rejects.toThrow('Sign in again');
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });


  it('rejects password mutation if another user signs in while the proof is being checked', async () => {
    mocks.signInWithPassword.mockImplementation(async () => {
      mocks.getSession.mockResolvedValue({
        data: { session: { user: { id: 'user-two' }, access_token: 'different-session' } },
        error: null,
      });
      return { data: { user: { id: 'user-one' }, session: { access_token: 'ephemeral-session' } }, error: null };
    });
    await expect(changeOwnPassword('old-secret', 'new-secret-long-enough'))
      .rejects.toThrow('Your session changed');
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.recordEvent).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('rejects a token replacement for the same account while proving its old password', async () => {
    mocks.getSession
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'user-one' }, access_token: 'current-application-session' } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'user-one' }, access_token: 'new-session-token' } },
        error: null,
      });
    await expect(changeOwnPassword('old-secret', 'new-secret-long-enough'))
      .rejects.toThrow('Your session changed');
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('rejects a local session that disagrees with the Auth server verified user', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'user-two', email: 'member@example.test' } },
      error: null,
    });
    await expect(changeOwnPassword('old-secret', 'new-secret-long-enough'))
      .rejects.toThrow('Sign in again');
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('rejects an unverifiable session after the isolated password proof', async () => {
    mocks.getSession
      .mockResolvedValueOnce({
        data: { session: { user: { id: 'user-one' }, access_token: 'current-application-session' } },
        error: null,
      })
      .mockResolvedValueOnce({ data: { session: null }, error: { message: 'private session detail' } });
    await expect(changeOwnPassword('old-secret', 'new-secret-long-enough'))
      .rejects.toThrow('Your session changed');
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });

  it('does not announce success when Supabase fails the actual password update', async () => {
    mocks.updateUser.mockResolvedValue({ error: { message: 'Update rejected' } });
    await expect(changeOwnPassword('old-secret', 'new-secret-long-enough'))
      .rejects.toThrow('Unable to update your password');
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });
});

it('shows approved errors but hides raw backend details', () => {
  expect(accountSecurityErrorMessage(new AccountSecurityError('Current password is incorrect. Please try again.')))
    .toContain('Current password is incorrect');
  expect(accountSecurityErrorMessage(new Error('private database constraint detail')))
    .toBe('Unable to change your password right now. Please try again.');
});

it('does not label a network or rate-limit error as an incorrect password', async () => {
  mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 429, code: 'over_request_rate_limit' } });
  await expect(changeOwnPassword('old-secret', 'new-secret-long-enough')).rejects.toThrow('Too many attempts');
  expect(mocks.updateUser).not.toHaveBeenCalled();
  mocks.signInWithPassword.mockResolvedValue({ data: {}, error: { status: 0 } });
  await expect(changeOwnPassword('old-secret', 'new-secret-long-enough')).rejects.toThrow('Check your connection');
});
