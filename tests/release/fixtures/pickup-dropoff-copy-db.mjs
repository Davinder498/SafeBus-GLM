import { readFile } from 'node:fs/promises';
import { createNotificationTemplateDb, id } from './notification-templates-db.mjs';

export { id, startTrip } from './notification-templates-db.mjs';
const read = (path) => readFile(new URL('../../../' + path, import.meta.url), 'utf8');
export const readCopyMigration = () =>
  read('supabase/migrations/pending/20261028222656_pickup_dropoff_notification_copy.sql');

export async function createPickupDropoffDb({ migrate = true } = {}) {
  const db = await createNotificationTemplateDb();
  try {
    await db.exec(`
      alter table students add last_name text;
      alter trigger trip_event on student_trip_events rename to student_trip_events_notify;
      alter table guardians add email text;
      create table route_stops(id uuid primary key,tenant_id uuid,route_id uuid,stop_name text,status text default 'active');
      alter table student_trip_events add route_stop_id uuid, add created_by uuid, alter column id set default gen_random_uuid();
      alter table student_bus_assignments add pickup_stop_id uuid, add dropoff_stop_id uuid;
      alter table guardian_notification_outbox add constraint pickup_email_unique unique(tenant_id,guardian_id,student_trip_event_id,notification_type);
      create function safebus_private.current_driver_id() returns uuid language sql stable as $$ select id from drivers where profile_id=auth.uid() $$;
      update students set first_name='Alex',last_name='Morgan' where id='${id(14)}';
      update students set first_name='Jamie',last_name='Morgan' where id='${id(15)}';
      update profiles set email='guardian@example.test' where id='${id(2)}';
      insert into route_stops(id,tenant_id,route_id,stop_name) values
        ('${id(60)}','${id(1)}','${id(21)}','Maple Street'),('${id(61)}','${id(1)}','${id(21)}','School entrance');
      update student_bus_assignments set pickup_stop_id='${id(60)}',dropoff_stop_id='${id(61)}';
    `);
    await db.exec(await read('tests/release/fixtures/pickup-dropoff-copy-hosted-20261028.sql'));
    await db.exec(await read('tests/release/fixtures/pickup-dropoff-push-hosted-20261028.sql'));
    await db.exec(await read('tests/release/fixtures/pickup-dropoff-source-hosted-20261028.sql'));
    if (migrate) await db.exec(await readCopyMigration());
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

export function databaseClient(db) {
  return {
    query: async (sql, params) => (params ? db.query(sql, params) : (await db.exec(sql)).at(-1)),
  };
}

export async function recordEvent(db, eventType = 'picked_up', studentId = id(14)) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(3)]);
  await db.query('select safebus_private.record_student_trip_event_for_active_trip($1,$2)', [
    studentId,
    eventType,
  ]);
}
