import test from 'node:test';
import assert from 'node:assert/strict';
import {
  channelFailureCode,
  withRealtimeStartupRetry,
  safeFailureCode,
} from '../../scripts/lib/recovery-api-diagnostics.mjs';

test('classifies missing partitions without exposing provider details', () => {
  assert.equal(
    channelFailureCode(new Error('MissingPartition: internal details')),
    'CHANNEL_MISSING_PARTITION',
  );
  assert.equal(
    channelFailureCode(new Error('no partition of relation "messages" found for row')),
    'CHANNEL_MISSING_PARTITION',
  );
  assert.equal(
    channelFailureCode(new Error('Unauthorized topic private-user-id')),
    'CHANNEL_AUTHORIZATION_DENIED',
  );
  assert.equal(channelFailureCode(new Error('provider token=secret')), 'CHANNEL_TRANSPORT_ERROR');
  assert.equal(safeFailureCode(new Error('provider token=secret')), 'UNCLASSIFIED_FAILURE');
  assert.equal(safeFailureCode(new Error('DELIVERY_TIMEOUT')), 'DELIVERY_TIMEOUT');
});
test('retries explicit partition startup failure then requires successful operation', async () => {
  let calls = 0;
  const delays = [];
  const result = await withRealtimeStartupRetry(
    async () => {
      if (++calls < 3) throw Error('CHANNEL_MISSING_PARTITION');
      return 'verified';
    },
    async (ms) => delays.push(ms),
  );
  assert.equal(result, 'verified');
  assert.deepEqual(delays, [1500, 3000]);
});
test('persistent missing partition fails after three attempts', async () => {
  let calls = 0;
  await assert.rejects(
    withRealtimeStartupRetry(
      async () => {
        calls++;
        throw Error('CHANNEL_MISSING_PARTITION');
      },
      async () => {},
    ),
    /CHANNEL_MISSING_PARTITION/,
  );
  assert.equal(calls, 3);
});
for (const code of [
  'CHANNEL_SCOPE_MISMATCH',
  'CHANNEL_AUTHORIZATION_DENIED',
  'CHANNEL_TRANSPORT_ERROR',
  'CHANNEL_TIMEOUT',
  'DELIVERY_TIMEOUT',
]) {
  test(`${code} is never retried or counted as success`, async () => {
    let calls = 0;
    await assert.rejects(
      withRealtimeStartupRetry(
        async () => {
          calls++;
          throw Error(code);
        },
        async () => assert.fail('must not wait'),
      ),
      new RegExp(code),
    );
    assert.equal(calls, 1);
  });
}

// Model the hosted cold-start sequence: subscription is admitted before the WAL
// stream is ready. The message must not be committed during that interval.
import {
  sendRecoveryProbe,
  broadcastReadyQuery,
} from '../../scripts/lib/recovery-broadcast-readiness.mjs';

test('cold start waits for streaming replication before committing one probe', async () => {
  const calls = [];
  let readinessChecks = 0;
  const db = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (sql === broadcastReadyQuery) return { rows: [{ ready: ++readinessChecks >= 3 }] };
      if (sql.startsWith('select realtime.send')) {
        assert.equal(readinessChecks, 3);
        assert.deepEqual(values, ['{"nonce":"test-nonce"}', 'capacity_probe', 'synthetic-topic']);
        return { rows: [] };
      }
      return { rows: [{ stored: true }] };
    },
  };
  const waits = [];
  await sendRecoveryProbe(db, { nonce: 'test-nonce', topic: 'synthetic-topic' }, async (ms) =>
    waits.push(ms),
  );
  assert.deepEqual(waits, [500, 500]);
  assert.equal(calls.filter((c) => c.sql.startsWith('select realtime.send')).length, 1);
  assert.deepEqual(calls.at(-1).values, ['synthetic-topic', 'test-nonce']);
});
test('unready replication fails without sending any probe', async () => {
  let checks = 0;
  await assert.rejects(
    sendRecoveryProbe(
      {
        query: async (sql) => {
          assert.equal(sql, broadcastReadyQuery);
          checks++;
          return { rows: [{ ready: false }] };
        },
      },
      { nonce: 'nonce', topic: 'topic' },
      async () => {},
    ),
    /BROADCAST_REPLICATION_NOT_READY/,
  );
  assert.equal(checks, 40);
});
test('swallowed send failure is identified before waiting for delivery', async () => {
  await assert.rejects(
    sendRecoveryProbe(
      {
        query: async (sql) => ({
          rows: [sql === broadcastReadyQuery ? { ready: true } : { stored: false }],
        }),
      },
      { nonce: 'nonce', topic: 'topic' },
      async () => assert.fail('already ready'),
    ),
    /BROADCAST_INSERT_NOT_CONFIRMED/,
  );
});
test('readiness query requires streaming and a completed logical slot', () => {
  for (const clause of [
    's.active',
    's.confirmed_flush_lsn is not null',
    's.restart_lsn is not null',
    "r.state='streaming'",
    's.database=current_database()',
    "s.plugin='pgoutput'",
  ])
    assert.ok(broadcastReadyQuery.includes(clause));
  assert.equal(
    safeFailureCode(Error('BROADCAST_REPLICATION_NOT_READY')),
    'BROADCAST_REPLICATION_NOT_READY',
  );
  assert.equal(
    safeFailureCode(Error('BROADCAST_INSERT_NOT_CONFIRMED')),
    'BROADCAST_INSERT_NOT_CONFIRMED',
  );
});
