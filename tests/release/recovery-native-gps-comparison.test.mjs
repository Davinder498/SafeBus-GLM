import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  createRecoveryGpsComparison,
  GPS_ORIGINAL_MD5,
} from '../../scripts/lib/recovery-native-gps-comparison.mjs';

const acl = ['postgres=X/postgres', 'authenticated=X/postgres', 'service_role=X/postgres'];
const original = {
  md5: GPS_ORIGINAL_MD5,
  definition: 'CREATE OR REPLACE FUNCTION test_restore() RETURNS void LANGUAGE sql AS $$select 1$$;',
  owner: 'postgres',
  acl,
  body: 'INSERT INTO safebus_private.driver_tracking_state(device_id) VALUES(v_device.id) ON CONFLICT DO NOTHING;',
};
const optimized = {
  ...original,
  md5: '00112233445566778899aabbccddeeff',
  body: "SELECT * INTO v_state FROM safebus_private.driver_tracking_state; last_seen_at<now()-interval '30 seconds'",
};
async function fileReader(path) {
  if (path.includes('20261123095000'))
    return '--heartbeat CREATE OR REPLACE FUNCTION public.ingest_driver_location_event(';
  if (path.includes('20261123113000'))
    return '--cursor CREATE OR REPLACE FUNCTION public.ingest_driver_location_event(';
  throw Error('UNEXPECTED_FILE');
}
function fake({ current = original, failMarker = null } = {}) {
  const calls = [];
  let state = current, txBefore = null;
  return {
    calls,
    current: () => state,
    db: {
      async query(sql) {
        calls.push(sql);
        if (sql.includes('from pg_proc p')) return { rows: [state] };
        if (sql === 'begin') { txBefore = state; return { rows: [] }; }
        if (sql === 'rollback') { state = txBefore ?? state; txBefore = null; return { rows: [] }; }
        if (sql === 'commit') { txBefore = null; return { rows: [] }; }
        if (failMarker && sql.includes(failMarker)) throw Error('SIMULATED_SQL_FAILURE');
        if (sql.includes('--cursor CREATE OR REPLACE FUNCTION')) state = optimized;
        if (sql === original.definition) state = original;
        return { rows: [] };
      },
    },
  };
}

test('Recovery GPS comparison validates source, permissions, atomic upgrade and verified restore', async () => {
  const f = fake();
  const c = await createRecoveryGpsComparison(f.db, { readFile: fileReader });
  assert.equal(c.evidence.originalMd5, GPS_ORIGINAL_MD5);
  assert.equal(c.evidence.migrationsSha256.length, 2);
  await c.install();
  assert.equal(f.current().md5, optimized.md5);
  await c.restore();
  assert.equal(f.current().md5, GPS_ORIGINAL_MD5);
  assert.equal(c.restored, true);
  await c.restore(); // no extra commits
  assert.equal(f.calls.filter(s => s === 'commit').length, 2);
});

test('Recovery comparison refuses a changed base or broadened grants before any SQL', async () => {
  for (const current of [
    { ...original, md5: '00000000000000000000000000000000' },
    { ...original, acl: ['PUBLIC=X/postgres', ...acl] },
  ]) {
    const f = fake({ current });
    await assert.rejects(createRecoveryGpsComparison(f.db, { readFile: fileReader }),
      /CAPACITY_GPS_(BASELINE|PERMISSION)_DRIFT/);
    assert.equal(f.calls.includes('begin'), false);
  }
});

test('SQL failure rolls back without leaving a changed function', async () => {
  const f = fake({ failMarker: '--cursor CREATE OR REPLACE FUNCTION' });
  const c = await createRecoveryGpsComparison(f.db, { readFile: fileReader });
  await assert.rejects(c.install(), /SIMULATED_SQL_FAILURE/);
  assert.equal(f.current().md5, GPS_ORIGINAL_MD5);
  assert.equal(f.calls.filter(s => s === 'rollback').length, 1);
  await c.restore();
  assert.equal(c.restored, true);
});

test('Recovery comparison can restore after the optimized HTTP phase fails', async () => {
  const f = fake();
  const c = await createRecoveryGpsComparison(f.db, { readFile: fileReader });
  await c.install();
  await c.restore();
  assert.equal(c.restored, true);
  assert.equal(f.current().md5, GPS_ORIGINAL_MD5);
});

test('compare workflow requires ten buses and distinct protected confirmation', async () => {
  const [runner, workflow] = await Promise.all([
    fs.readFile('scripts/run-recovery-capacity.mjs', 'utf8'),
    fs.readFile('.github/workflows/run-recovery-capacity.yml', 'utf8'),
  ]);
  assert.match(runner, /gpsCompare && buses !== 10/);
  assert.match(runner, /gpsCompare \? "RUN_RECOVERY_GPS_COMPARE"/);
  assert.match(runner, /sequenceOffset: 20/);
  assert.match(runner, /sequenceOffset: 40/);
  assert.match(runner, /await gpsComparison.restore\(\)/);
  assert.match(runner, /await capacityQuarantine\(db\)/);
  assert.match(runner, /await cleanupCapacity\(db, scope\)/);
  assert.match(workflow, /inputs.buses == '10' && inputs.workload == 'android_gps_compare'/);
  assert.match(workflow, /RUN_RECOVERY_GPS_COMPARE/);
});
