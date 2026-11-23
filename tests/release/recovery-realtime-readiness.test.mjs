import test from 'node:test';
import assert from 'node:assert/strict';
import { assertRecoveryRealtimePartitions } from '../../scripts/lib/recovery-realtime-readiness.mjs';

function client(today, tomorrow, partitionCount = 7) {
  return {
    query: async (sql) => {
      assert.match(sql, /realtime\.messages/);
      assert.match(sql, /pg_inherits/);
      assert.match(sql, /clock_timestamp/);
      assert.match(sql, /pg_get_expr/);
      return { rows: [{ today_ready: today, tomorrow_ready: tomorrow, partition_count: partitionCount }] };
    },
  };
}

test('Recovery blocks native GPS and combined capacity loads before provisioning if today is missing', async () => {
  await assert.rejects(assertRecoveryRealtimePartitions(client(false, false, 5)),
    /CAPACITY_REALTIME_PARTITION_NOT_READY/);
});

test('Recovery blocks near-midnight jobs if the following day is missing', async () => {
  await assert.rejects(assertRecoveryRealtimePartitions(client(true, false, 5)),
    /CAPACITY_REALTIME_PARTITION_NOT_READY/);
});

test('Recovery accepts only a verified current-and-next-day partition layout', async () => {
  assert.deepEqual(await assertRecoveryRealtimePartitions(client(true, true)),
    { todayReady: true, tomorrowReady: true, partitionCount: 7 });
});

test('Recovery refuses a missing provider-owned catalog rather than creating a partition', async () => {
  await assert.rejects(
    assertRecoveryRealtimePartitions({ query: async () => ({ rows: [] }) }),
    /CAPACITY_REALTIME_PARTITION_NOT_READY/,
  );
});
