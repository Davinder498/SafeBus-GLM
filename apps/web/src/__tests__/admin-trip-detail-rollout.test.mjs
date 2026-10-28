// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, afterAll, it, expect } from 'vitest';
import {
  tripDetailDb,
  tripDetailMigration,
} from '../../../../tests/release/fixtures/admin-trip-detail-db.mjs';
import {
  operationalSnapshot,
  operationalRestoreSql,
  verifyOperationalSnapshot,
  rehearseOperational,
} from '../../../../scripts/lib/operational-rollout.mjs';

let db, config;
const client = {
  query: async (sql, args) => (args ? db.query(sql, args) : (await db.exec(sql)).at(-1)),
};
beforeAll(async () => {
  db = await tripDetailDb();
  await db.exec(`create table user_notification_settings(profile_id uuid);
    create table user_notification_category_preferences(profile_id uuid,category text);
    create table guardian_student_push_preferences(student_guardian_id uuid,category text);
    create table user_notifications(id uuid); create table push_notification_outbox(id uuid); create table guardian_notification_outbox(id uuid);`);
  const hosted = JSON.parse(await readFile('../../config/pending/admin-trip-detail.json', 'utf8'));
  config = {
    ...hosted,
    functions: hosted.functions.filter((f) => f.before.md5 === null),
    policies: hosted.policies.filter((p) => p.before === null),
  };
  await db.exec('begin');
  await db.exec(await tripDetailMigration());
  const after = await operationalSnapshot(client, config);
  // Synthetic identity helpers return text instead of the hosted enum; PostgreSQL
  // consequently deparses the otherwise identical event policy with text casts.
  config.policies[0].after = after.policies[0];
  for (const actual of after.functions) {
    const expected = config.functions.find((f) => f.signature === actual.signature);
    expect(actual.md5).toBe(expected.after.md5);
    expected.owner = actual.owner;
  }
  await db.exec('rollback');
}, 60_000);
afterAll(async () => db?.close());

it('rehearses new functions/policy/column privileges and restores their exact absence', async () => {
  const before = await operationalSnapshot(client, config);
  verifyOperationalSnapshot(before, config, 'before');
  await rehearseOperational(client, await tripDetailMigration(), config);
  expect(await operationalSnapshot(client, config)).toEqual(before);
  await db.exec('begin');
  try {
    await db.exec(await tripDetailMigration());
    verifyOperationalSnapshot(await operationalSnapshot(client, config), config, 'after');
    await db.exec(operationalRestoreSql(before, config));
    expect(await operationalSnapshot(client, config)).toEqual(before);
  } finally {
    await db.exec('rollback');
  }
});

it('fails closed for partial installation, unexpected policy changes or column grants', async () => {
  await db.exec('begin');
  try {
    await db.exec('grant select(event_time) on student_trip_events to authenticated');
    const actual = await operationalSnapshot(client, config);
    expect(() => verifyOperationalSnapshot(actual, config, 'before')).toThrow(
      'OPERATIONAL_GRANT_DRIFT',
    );
  } finally {
    await db.exec('rollback');
  }
});

it('rejects partial adoption and a broadened installed function ACL', async () => {
  await db.exec('begin');
  try {
    await db.exec(await tripDetailMigration());
    const after = await operationalSnapshot(client, config);
    expect(() => verifyOperationalSnapshot(after, config, 'before')).toThrow(
      'OPERATIONAL_FUNCTION_DRIFT',
    );
    await db.exec('grant execute on function public.get_admin_trip_detail(uuid) to anon');
    const broadened = await operationalSnapshot(client, config);
    expect(() => verifyOperationalSnapshot(broadened, config, 'after')).toThrow(
      'OPERATIONAL_FUNCTION_DRIFT',
    );
  } finally {
    await db.exec('rollback');
  }
});
