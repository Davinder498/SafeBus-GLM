import test from 'node:test';
import assert from 'node:assert/strict';
import {
  quarantineCapacity,
  disconnectCapacityClients,
  capacityFetch,
} from '../../scripts/lib/recovery-capacity-lifecycle.mjs';

test('quarantine retries only bounded timeout/lock failures and verifies closure', async () => {
  let revokes = 0,
    verified = 0,
    waits = 0;
  const db = {
    query: async (sql) => {
      if (sql.startsWith('revoke') && ++revokes < 3)
        throw Object.assign(Error('timeout'), { code: '57014' });
      if (sql.startsWith('select')) verified++;
      return { rows: [] };
    },
  };
  await quarantineCapacity(db, async () => {
    waits++;
  });
  assert.equal(revokes, 3);
  assert.equal(waits, 2);
  assert.equal(verified, 1);
  for (const code of ['57014', '42501']) {
    let attempts = 0;
    await assert.rejects(
      quarantineCapacity(
        {
          query: async () => {
            attempts++;
            throw Object.assign(Error('failure'), { code });
          },
        },
        async () => {},
      ),
    );
    assert.equal(attempts, code === '57014' ? 3 : 1);
  }
  await assert.rejects(
    quarantineCapacity({ query: async () => ({ rows: [{}] }) }, async () => {}),
    /CAPACITY_API_EXPOSED/,
  );
});

test('failed channel removal still closes every socket and auth timer', async () => {
  let disconnected = 0,
    stopped = 0;
  await disconnectCapacityClients(
    [true, false].map((fail) => ({
      client: {
        removeAllChannels: async () => {
          if (fail) throw Error('unsubscribe');
        },
        auth: {
          stopAutoRefresh: () => {
            stopped++;
          },
        },
        realtime: {
          disconnect: async () => {
            disconnected++;
          },
        },
      },
    })),
  );
  assert.equal(disconnected, 2);
  assert.equal(stopped, 2);
});

test('workload cancellation aborts pending fetches without cancelling cleanup requests', async () => {
  const controller = new AbortController();
  let workloadSignal, cleanupSignal;
  const origin = 'https://example.test';
  await capacityFetch(
    origin,
    {},
    {
      origin,
      signal: controller.signal,
      fetchImpl: async (_url, init) => {
        workloadSignal = init.signal;
      },
    },
  );
  await capacityFetch(
    origin,
    {},
    {
      origin,
      fetchImpl: async (_url, init) => {
        cleanupSignal = init.signal;
      },
    },
  );
  controller.abort();
  assert.equal(workloadSignal.aborted, true);
  assert.equal(cleanupSignal.aborted, false);
  assert.throws(
    () => capacityFetch('https://other.test', {}, { origin }),
    /CAPACITY_ORIGIN_REJECTED/,
  );
});

import { recoverCapacityScope } from '../../scripts/lib/recovery-capacity-recovery.mjs';
test('5,000-driver recovery accepts only a uniquely owned partial setup', () => {
  const run = '123-1';
  const input = {
    run,
    buses: 5000,
    tenants: [1, 2].map((i) => ({
      id: `00000000-0000-0000-0000-00000000000${i}`,
      type: 'demo',
      name: `Capacity Load ${run} ${i}`,
    })),
    users: [0, 1].map((i) => ({ run, email: `capacity-load-${run}-${i}@example.test` })),
  };
  assert.equal(recoverCapacityScope(input).emails.length, 5000);
  for (const invalid of [
    { ...input.users[1], run: '123-2' },
    { ...input.users[1], email: `capacity-load-${run}-5000@example.test` },
    input.users[0],
  ]) {
    assert.throws(() => recoverCapacityScope({ ...input, users: [input.users[0], invalid] }));
  }
});

test('recovery requires exact run-owned tenants and every expected synthetic identity', () => {
  const input = {
    run: '44270874052-1',
    buses: 10,
    tenants: [1, 2].map((i) => ({
      id: `00000000-0000-0000-0000-00000000000${i}`,
      type: 'demo',
      name: `Capacity Load 44270874052-1 ${i}`,
    })),
    users: Array.from({ length: 61 }, (_, i) => ({
      run: '44270874052-1',
      email: `capacity-load-44270874052-1-${i}@example.test`,
    })),
  };
  assert.equal(recoverCapacityScope(input).emails.length, 61);
  const mutations = [
    (x) => {
      x.run = '44270874052-2';
    },
    (x) => {
      x.users.pop();
    },
    (x) => {
      x.users[0].run = 'foreign';
    },
    (x) => {
      x.users[0].email = 'other@example.test';
    },
    (x) => {
      x.users[0] = x.users[1];
    },
    (x) => {
      x.tenants[0].type = 'district';
    },
    (x) => {
      x.tenants[0].name = 'Customer';
    },
    (x) => {
      x.tenants.pop();
    },
    (x) => {
      x.tenants.push(x.tenants[0]);
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(input);
    mutate(copy);
    assert.throws(() => recoverCapacityScope(copy), /CAPACITY_(CLEANUP_OWNERSHIP|SCOPE_INVALID)/);
  }
});
