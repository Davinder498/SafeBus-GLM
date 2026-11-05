import { describe, expect, it, vi } from 'vitest';
import {
  verifyActiveCallerSession,
  verifyRecentCallerAuthentication,
} from '../../netlify/functions/session-security.mjs';

describe('server session revocation boundary', () => {
  it('permits an explicitly active database session', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    expect(await verifyActiveCallerSession({ rpc })).toBeNull();
    expect(rpc).toHaveBeenCalledWith('is_current_user_session_active');
  });

  it.each([false, null, undefined, 'true', 1])('rejects a non-active result (%s)', async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    expect(await verifyActiveCallerSession({ rpc })).toMatchObject({ statusCode: 401 });
  });

  it('denies access without logging backend errors when verification fails', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: true, error: { message: 'private database details' } });
    expect(await verifyActiveCallerSession({ rpc })).toEqual({
      statusCode: 503,
      message: 'Unable to verify your session. Try again shortly.',
    });
  });

  it('denies access when verification throws', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('connection failed'));
    expect(await verifyActiveCallerSession({ rpc })).toMatchObject({ statusCode: 503 });
  });
});

describe('recent authentication belongs to the requesting verified token', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  const claims = {
    sub: 'caller',
    role: 'authenticated',
    session_id: '11111111-1111-4111-8111-111111111111',
    amr: [{ method: 'password', timestamp: now / 1000 - 60 }],
  };
  const check = (value) =>
    verifyRecentCallerAuthentication(
      {
        auth: {
          getClaims: vi.fn(async (token) => {
            expect(token).toBe('verified-token');
            return { data: { claims: value }, error: null };
          }),
        },
      },
      'verified-token',
      'caller',
      now,
    );
  it('accepts a recent sign-in even when the account-wide timestamp is absent', async () => {
    expect(await check(claims)).toBeNull();
  });
  it.each([
    {
      ...claims,
      amr: [{ method: 'password', timestamp: now / 1000 - 901 }],
      iat: now / 1000,
      last_sign_in_at: new Date(now).toISOString(),
    },
    { ...claims, amr: [{ method: 'token_refresh', timestamp: now / 1000 }] },
    { ...claims, amr: [{ method: 'totp', timestamp: now / 1000 }] },
    { ...claims, amr: [{ method: 'anonymous', timestamp: now / 1000 }] },
    { ...claims, amr: [{ method: 'password', timestamp: now / 1000 + 61 }] },
    { ...claims, amr: [{ method: 'password', timestamp: String(now / 1000) }] },
    { ...claims, amr: undefined },
    { ...claims, session_id: 'not-a-session' },
    { ...claims, sub: 'another-user' },
    { ...claims, role: 'service_role' },
  ])('denies stale, refreshed, malformed or foreign proof %#', async (value) => {
    expect(await check(value)).toMatchObject({ statusCode: 403 });
  });
  it('fails closed and masks verification errors', async () => {
    for (const getClaims of [
      vi.fn().mockRejectedValue(new Error('private-key')),
      vi.fn().mockResolvedValue({ error: { message: 'private-key' } }),
      vi.fn().mockResolvedValue(null),
    ]) {
      const result = await verifyRecentCallerAuthentication(
        { auth: { getClaims } },
        'token',
        'caller',
        now,
      );
      expect(result.statusCode).toBe(503);
      expect(result.message).not.toContain('private-key');
    }
  });
});
