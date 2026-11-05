import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ clients: vi.fn() }));
vi.mock('../../netlify/functions/billing-shared.mjs', () => ({
  createServerClients: mock.clients,
  json: (statusCode, data) => ({ statusCode, body: JSON.stringify(data) }),
}));
import { handler } from '../../netlify/functions/disposal-records.mjs';
let rpc;
const event = (action = 'preserve', data = {}) => ({
  httpMethod: 'POST',
  headers: { authorization: 'Bearer exact-token' },
  body: JSON.stringify({ action, data }),
});
beforeEach(() => {
  rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValue({ data: { confirmed: true } });
  mock.clients.mockReturnValue({
    user: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'caller' } } }) },
      rpc,
    },
  });
});
it('uses caller JWT, not privileged clients, and requires explicit confirmation', async () => {
  expect((await handler(event())).statusCode).toBe(200);
  expect(mock.clients).toHaveBeenCalledWith('exact-token');
  expect(rpc).toHaveBeenLastCalledWith('manage_disposal', { p_action: 'preserve', p_data: {} });
  rpc.mockReset().mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: {} });
  expect((await handler(event())).statusCode).toBe(503);
});
it('blocks malformed/unsigned/unbounded requests before access', async () => {
  expect((await handler({ ...event(), headers: {} })).statusCode).toBe(401);
  expect((await handler(event('preserve', { unexpected: 'bad' }))).statusCode).toBe(400);
  expect((await handler({ ...event(), body: 'x'.repeat(4097) })).statusCode).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it('denial and unavailable deployment remain visible without provider details', async () => {
  rpc
    .mockReset()
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ error: { code: '42501', message: 'private' } });
  const r = await handler(event());
  expect(r.statusCode).toBe(403);
  expect(r.body).not.toContain('private');
});
