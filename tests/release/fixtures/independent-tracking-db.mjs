import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sharedFeedFixture, sharedMigration } from './shared-bus-feed-db.mjs';
export const migrationPath =
  'supabase/migrations/pending/20261116220000_independent_shared_tracking_workers.sql';
export const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const topic =
  'safebus:bus:' +
  createHash('sha256')
    .update(id(6) + ':safebus:bus:v1')
    .digest('hex');
export async function independentTrackingFixture(t) {
  const db = await sharedFeedFixture(t);
  await db.exec(
    await fs.readFile(
      'supabase/migrations/pending/20261111190123_tracking_history_indexed_cleanup.sql',
      'utf8',
    ),
  );
  await db.exec(await fs.readFile(sharedMigration, 'utf8'));
  return db;
}
export async function seedSharedTrip(db, count = 1) {
  await db.exec(`insert into tenants(id) values('${id(1)}');
    insert into drivers(id,tenant_id) values('${id(2)}','${id(1)}');
    insert into buses(id,tenant_id) values('${id(3)}','${id(1)}');
    insert into routes(id,tenant_id) values('${id(4)}','${id(1)}');
    insert into route_trip_patterns(id,tenant_id,route_id) values('${id(5)}','${id(1)}','${id(4)}');
    insert into driver_trips(id,tenant_id,driver_id,bus_id,route_id,route_trip_pattern_id)
      values('${id(6)}','${id(1)}','${id(2)}','${id(3)}','${id(4)}','${id(5)}');
    insert into bus_route_assignments(id,tenant_id,bus_id,route_id,route_trip_pattern_id)
      values('${id(7)}','${id(1)}','${id(3)}','${id(4)}','${id(5)}');`);
  for (let n = 0; n < count; n++) {
    const a = 100 + n * 10;
    await db.exec(`insert into profiles(id,tenant_id) values('${id(a)}','${id(1)}');
      insert into guardians(id,tenant_id,profile_id) values('${id(a + 1)}','${id(1)}','${id(a)}');
      insert into students(id,tenant_id) values('${id(a + 2)}','${id(1)}');
      insert into student_guardians(id,tenant_id,student_id,guardian_id) values('${id(a + 3)}','${id(1)}','${id(a + 2)}','${id(a + 1)}');
      insert into student_bus_assignments(id,tenant_id,student_id,bus_route_assignment_id,route_trip_pattern_id,effective_from)
        values('${id(a + 4)}','${id(1)}','${id(a + 2)}','${id(7)}','${id(5)}',(now() at time zone 'America/Edmonton')::date);`);
  }
  await db.query(
    "select set_config('test.uid',$1,false),set_config('test.tenant',$2,false),set_config('test.session','active',false),set_config('test.mfa','complete',false),set_config('realtime.topic',$3,false)",
    [id(100), id(1), topic],
  );
}
