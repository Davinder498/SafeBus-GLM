import { it, expect, vi } from 'vitest';
import { disposeOneAccount } from '../../netlify/functions/disposal-accounts.mjs';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
it('removes only the reserved identity and requires authoritative completion', async () => {
  const c = {
    rpc: vi
      .fn()
      .mockResolvedValueOnce({ data: { id } })
      .mockResolvedValueOnce({ data: { completed: true } }),
    auth: { admin: { deleteUser: vi.fn().mockResolvedValue({ error: null }) } },
  };
  expect(await disposeOneAccount(c)).toBe('removed');
  expect(c.auth.admin.deleteUser).toHaveBeenCalledWith(id, false);
  expect(c.rpc).toHaveBeenLastCalledWith('disposal_account_work', {
    p_action: 'completed',
    p_id: id,
  });
});
it('does not delete after a failed or malformed claim', async () => {
  for (const claim of [{ error: {} }, { data: { id: 'bad' } }, { data: null }]) {
    const c = { rpc: vi.fn().mockResolvedValue(claim), auth: { admin: { deleteUser: vi.fn() } } };
    if (claim.data === null) expect(await disposeOneAccount(c)).toBe('idle');
    else await expect(disposeOneAccount(c)).rejects.toThrow();
    expect(c.auth.admin.deleteUser).not.toHaveBeenCalled();
  }
});
it('provider rejection and unverified completion cannot be reported as removed', async () => {
  const c = {
    rpc: vi.fn().mockResolvedValue({ data: { id } }),
    auth: {
      admin: {
        deleteUser: vi.fn().mockResolvedValue({ error: { status: 500, message: 'private' } }),
      },
    },
  };
  await expect(disposeOneAccount(c)).rejects.toThrow('RETENTION_LIFECYCLE_ACCOUNT_DELETE');
  expect(c.rpc).toHaveBeenCalledTimes(1);
  c.auth.admin.deleteUser.mockResolvedValue({ error: { status: 404 } });
  c.rpc
    .mockReset()
    .mockResolvedValueOnce({ data: { id } })
    .mockResolvedValueOnce({ data: { completed: false } });
  await expect(disposeOneAccount(c)).rejects.toThrow('RETENTION_LIFECYCLE_ACCOUNT_CONFIRM');
});
