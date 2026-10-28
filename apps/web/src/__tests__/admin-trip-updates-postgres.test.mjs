// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  createNotificationTemplateDb,
  id,
  startTrip,
} from '../../../../tests/release/fixtures/notification-templates-db.mjs';

const migration = await readFile(
  new URL(
    '../../../../supabase/migrations/pending/20261028090000_admin_trip_updates.sql',
    import.meta.url,
  ),
  'utf8',
);
let db;
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;

beforeAll(async () => {
  db = await createNotificationTemplateDb();
  await db.exec(`insert into schools(id,tenant_id) values('${id(9)}','${id(1)}');
    insert into profiles(id,tenant_id,role,school_id,full_name) values
      ('${id(7)}','${id(1)}','transportation_admin',null,'Transportation admin'),
      ('${id(10)}','${id(1)}','school_admin','${id(9)}','Other school admin'),
      ('${id(11)}','${id(99)}','tenant_admin',null,'Other authority admin');
    insert into user_notification_settings(profile_id,tenant_id)
      select id,tenant_id from profiles where id in ('${id(7)}','${id(10)}','${id(11)}');
    insert into user_notification_category_preferences(profile_id,category)
      select p.id,c from profiles p cross join unnest(array['trip_status','operations']) c
      where p.id in ('${id(7)}','${id(10)}','${id(11)}');`);
}, 60_000);
afterAll(async () => db?.close());

it('shows the original omission in an actual trip-start trigger', async () => {
  await startTrip(db, 40);
  const counts = await rows(
    'select recipient_role::text as role,count(*)::int as total from user_notifications where driver_trip_id=$1 group by recipient_role order by role',
    [id(40)],
  );
  expect(counts).toEqual([
    { role: 'driver', total: 1 },
    { role: 'guardian', total: 1 },
  ]);
});

it('adds future trip starts and completions for the three scoped admin roles', async () => {
  // Hosted rehearsal checks the exact md5 guard. PGlite compiles and executes
  // the exact forward function definitions against synthetic data.
  await db.exec(migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION')));
  await db.exec(`update user_notification_category_preferences
    set in_app_enabled=false where profile_id='${id(7)}' and category='trip_status'`);
  await startTrip(db, 41);
  await db.query('update driver_trips set status=$1,ended_at=now() where id=$2', [
    'completed',
    id(41),
  ]);
  const delivered = await rows(
    `select recipient_profile_id::text as recipient,event_type,in_app_visible,category
     from user_notifications where driver_trip_id=$1 order by event_type,recipient_profile_id`,
    [id(41)],
  );
  for (const event of ['trip_started', 'trip_completed']) {
    const subset = delivered.filter((n) => n.event_type === event);
    expect(subset.map((n) => n.recipient)).toEqual([id(2), id(3), id(4), id(6), id(7)]);
    expect(subset.every((n) => n.category === 'trip_status')).toBe(true);
    expect(subset.find((n) => n.recipient === id(7)).in_app_visible).toBe(false);
    expect(subset.filter((n) => n.recipient !== id(7)).every((n) => n.in_app_visible)).toBe(true);
  }
  expect(delivered.some((n) => [id(10), id(11), id(5)].includes(n.recipient))).toBe(false);
  expect(
    (
      await rows('select count(*)::int as n from user_notifications where driver_trip_id=$1', [
        id(41),
      ])
    )[0].n,
  ).toBe(10);
});
