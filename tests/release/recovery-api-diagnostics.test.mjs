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
