// @vitest-environment node
import { expect, it } from 'vitest';
import {
  drainNotifications,
  mapConcurrent,
  runDeliveryWorker,
} from '../../../../supabase/functions/_shared/notification-worker.mjs';
it('bounds concurrent provider requests and drains multiple groups within one dispatch', async () => {
  let active = 0,
    maximum = 0,
    next = 0;
  const result = await drainNotifications({
    concurrency: 7,
    maxMessages: 5000,
    budgetMs: 10000,
    claim: async (n) =>
      next >= 5000 ? [] : Array.from({ length: Math.min(n, 100, 5000 - next) }, () => next++),
    deliver: async () => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return 'delivered';
    },
  });
  expect(maximum).toBeLessThanOrEqual(7);
  expect(result.delivered).toBe(5000);
});
it('stops claiming at the time budget and maximum message count', async () => {
  let time = 0;
  const result = await drainNotifications({
    now: () => time,
    budgetMs: 20,
    maxMessages: 20,
    claim: async () => [1, 2],
    deliver: async () => {
      time += 10;
      return 'delivered';
    },
  });
  expect(result.claimed).toBe(2);
});
it('does not promise exactly-once completion when settlement fails after provider acceptance', async () => {
  const calls = [];
  await expect(
    runDeliveryWorker({
      channel: 'push',
      workerId: 'test',
      send: async () => {
        calls.push('provider');
        return 'accepted';
      },
      classify: () => ({ retry: false }),
      retryDelay: () => 60,
      rpc: async (name) => {
        if (name === 'claim_notification_deliveries') return [{ id: 'id', attempt_count: 1 }];
        if (name === 'resolve_notification_deliveries') return [{ id: 'id' }];
        throw Error('database unavailable');
      },
    }),
  ).rejects.toThrow('database unavailable');
  expect(calls).toEqual(['provider']);
});
it('isolates individual request failures', async () => {
  const results = await mapConcurrent([1, 2, 3], 2, async (n) => {
    if (n === 2) throw Error('provider');
    return n;
  });
  expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
});
