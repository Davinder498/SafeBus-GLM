import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changeOwnPassword } from './accountSecurityService';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
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
    auth: { getUser: mocks.getUser, updateUser: mocks.updateUser },
    rpc: vi.fn((name: string) =>
      name === 'enforce_new_password_policy' ? mocks.policy() : mocks.recordEvent(),
    ),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
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
      data: { user: null, session: null }, error: { message: 'Invalid login credentials' },
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
    mocks.policy.mockResolvedValue({ error: { message: 'Policy rejected' } });
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

  it('does not announce success when Supabase fails the actual password update', async () => {
    mocks.updateUser.mockResolvedValue({ error: { message: 'Update rejected' } });
    await expect(changeOwnPassword('old-secret', 'new-secret-long-enough'))
      .rejects.toThrow('Unable to update your password');
    expect(mocks.recordEvent).not.toHaveBeenCalled();
  });
});
