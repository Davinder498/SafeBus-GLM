import { describe, expect, it, vi } from 'vitest';
import { verifyActiveCallerSession } from '../../netlify/functions/session-security.mjs';

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
    const rpc = vi.fn().mockResolvedValue({ data: true, error: { message: 'private database details' } });
    expect(await verifyActiveCallerSession({ rpc })).toEqual({
      statusCode: 503, message: 'Unable to verify your session. Try again shortly.',
    });
  });

  it('denies access when verification throws', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('connection failed'));
    expect(await verifyActiveCallerSession({ rpc })).toMatchObject({ statusCode: 503 });
  });
});
