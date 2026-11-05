import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ clients: vi.fn() }));
vi.mock('../../netlify/functions/billing-shared.mjs', () => ({
  createServerClients: mocks.clients,
  json: (statusCode, body) => ({
    statusCode,
    body: JSON.stringify(body),
    headers: { 'cache-control': 'no-store' },
  }),
}));
import { handler } from '../../netlify/functions/retention-cases.mjs';
let user;
beforeEach(() => {
  user = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'caller' } }, error: null })) },
    rpc: vi
      .fn()
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValue({ data: [], error: null }),
  };
  mocks.clients.mockReturnValue({ user, admin: { storage: { from: vi.fn() } } });
});
const event = (action = 'list', data = {}) => ({
  httpMethod: 'POST',
  headers: { authorization: 'Bearer caller-token' },
  body: JSON.stringify({ action, data }),
});
it('forwards caller authentication; database owns role and authority enforcement', async () => {
  const response = await handler(event());
  expect(response.statusCode).toBe(200);
  expect(mocks.clients).toHaveBeenCalledWith('caller-token');
  expect(user.rpc).toHaveBeenCalledWith('manage_retention_case', { p_action: 'list', p_data: {} });
});
it('rejects unsigned, malformed and unbounded requests before database mutation', async () => {
  expect((await handler({ ...event(), headers: {} })).statusCode).toBe(401);
  expect((await handler(event('create', { unexpected: 'data' }))).statusCode).toBe(400);
  expect((await handler({ ...event(), body: 'x'.repeat(4097) })).statusCode).toBe(400);
  expect(user.rpc).not.toHaveBeenCalled();
});
it('denial and unavailable migrations remain explicit; provider details are never returned', async () => {
  user.rpc
    .mockReset()
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ error: { code: '42501', message: 'PRIVATE TENANT DATA' } });
  const denied = await handler(event('release', { id: 'case', confirm: 'release' }));
  expect(denied.statusCode).toBe(403);
  expect(denied.body).not.toContain('PRIVATE');
  user.rpc
    .mockReset()
    .mockResolvedValueOnce({ data: true })
    .mockResolvedValueOnce({ error: { code: 'PGRST202' } });
  expect((await handler(event())).statusCode).toBe(503);
});
it('cannot download an unlisted or other authority archive with service privileges', async () => {
  const response = await handler(
    event('archive_read', { id: 'other-case', chunkId: 'other-chunk' }),
  );
  expect(response.statusCode).toBe(404);
  expect(mocks.clients.mock.results.at(-1).value.admin.storage.from).not.toHaveBeenCalled();
});
