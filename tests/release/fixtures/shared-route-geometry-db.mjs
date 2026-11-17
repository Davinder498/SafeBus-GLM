import fs from 'node:fs/promises';
import { postgis } from '@electric-sql/pglite-postgis';
import { sharedFeedFixture, sharedMigration } from './shared-bus-feed-db.mjs';
import { seedSharedTrip, id } from './independent-tracking-db.mjs';
export { id };
export const migrationPath = 'supabase/migrations/pending/20261117053238_shared_route_geometry.sql';
export async function geometryFixture(t) {
  const db = await sharedFeedFixture(t, { extensions: { postgis } });
  await db.exec(`create schema extensions; create extension postgis with schema extensions;
    alter table buses add column bus_number text default 'TEST-1', add column license_plate text default 'SYNTHETIC';
    alter table routes add column route_name text default 'Synthetic route';
    alter table route_trip_patterns add column direction text default 'forward', add column display_name text default 'Morning';
    alter table driver_trips add column route_shape_id uuid, add column started_at timestamptz default now();
    alter table driver_trip_current_locations add column driver_id uuid, add column bus_id uuid, add column route_id uuid,
      add column recorded_at timestamptz default now(), add column accuracy_m double precision default 5,
      add column speed_mps double precision default 8;
    alter table students add column preferred_name text, add column first_name text default 'Synthetic';
    alter table student_bus_assignments add column pickup_stop_id uuid, add column dropoff_stop_id uuid;
    create table route_stops(id uuid primary key,tenant_id uuid,route_id uuid,stop_name text,stop_order integer,
      latitude numeric,longitude numeric,status text default 'active');
    create table route_trip_stop_schedules(tenant_id uuid,route_id uuid,route_trip_pattern_id uuid,route_stop_id uuid,planned_arrival_time time);
    create table route_shapes(id uuid primary key,tenant_id uuid,route_id uuid,path extensions.geometry(LineString,4326));
  `);
  await db.exec(await fs.readFile(sharedMigration, 'utf8'));
  // Preserve the previously shipped function for exact-output comparison.
  const previous = (
    await db.query(
      "select pg_get_functiondef('public.get_guardian_bus_service_lines(text)'::regprocedure) as def",
    )
  ).rows[0].def;
  await db.exec(
    previous.replace(
      'public.get_guardian_bus_service_lines(',
      'public.previous_guardian_service_lines(',
    ),
  );
  await seedSharedTrip(db, 2);
  await db.exec(`insert into route_stops(id,tenant_id,route_id,stop_name,stop_order,latitude,longitude) values
    ('${id(20)}','${id(1)}','${id(4)}','First',1,53.50,-113.50),
    ('${id(21)}','${id(1)}','${id(4)}','Middle',2,53.51,-113.50),
    ('${id(22)}','${id(1)}','${id(4)}','Last',3,53.52,-113.50);
    insert into route_trip_stop_schedules values
    ('${id(1)}','${id(4)}','${id(5)}','${id(20)}','08:00'),
    ('${id(1)}','${id(4)}','${id(5)}','${id(21)}','08:05'),
    ('${id(1)}','${id(4)}','${id(5)}','${id(22)}','08:10');
    insert into route_shapes values('${id(23)}','${id(1)}','${id(4)}',extensions.st_geomfromtext('LINESTRING(-113.5 53.5,-113.5 53.51,-113.5 53.52)',4326));
    update driver_trips set route_shape_id='${id(23)}';
    insert into driver_trip_current_locations(driver_trip_id,tenant_id,driver_id,bus_id,route_id,latitude,longitude)
      values('${id(6)}','${id(1)}','${id(2)}','${id(3)}','${id(4)}',53.505,-113.5);
    update students set first_name=case when id='${id(102)}' then 'Parent A child' else 'Parent B child' end;
    update student_bus_assignments set pickup_stop_id='${id(20)}',dropoff_stop_id='${id(22)}';
  `);
  return db;
}
export const readLine = async (db) =>
  (await db.query("select public.get_guardian_bus_service_lines('TEST-1') as result")).rows[0]
    .result;
