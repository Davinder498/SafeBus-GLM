import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../netlify/lib/notification-email-cadence.mjs', () => ({ startEmailCadence: vi.fn() }));
import { startEmailCadence } from '../../netlify/lib/notification-email-cadence.mjs';
import { handler } from '../../netlify/functions/guardian-notification-email-scheduled.mjs';
afterEach(() => vi.clearAllMocks());
it('starts background delivery without provider work inside the short scheduled invocation', async () => {
  vi.mocked(startEmailCadence).mockResolvedValue(undefined);
  expect((await handler()).statusCode).toBe(202);
  expect(startEmailCadence).toHaveBeenCalledWith(expect.any(Number));
});
it('reports a failed handoff while work remains durably queued', async () => {
  vi.mocked(startEmailCadence).mockRejectedValue(Error('unavailable'));
  expect((await handler()).statusCode).toBe(500);
});
