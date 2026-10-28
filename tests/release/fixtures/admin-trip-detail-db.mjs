// Embedded PostgreSQL only. Synthetic identities and records; no network/provider calls.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const tripDetailMigration = () =>
  readFile(
    new URL(
      '../../../supabase/migrations/pending/20261028114543_admin_trip_operations_detail.sql',
      import.meta.url,
    ),
    'utf8',
  );

export async function tripDetailDb() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema safebus_private; create schema extensions;
    create table tenants(id uuid primary key,status text default 'active');
    create table profiles(id uuid primary key,tenant_id uuid,school_id uuid,role text,status text default 'active',full_name text);
    create table schools(id uuid primary key,tenant_id uuid,name text);
    create table buses(id uuid primary key,tenant_id uuid,bus_number text);
    create table drivers(id uuid primary key,tenant_id uuid,profile_id uuid);
    create table routes(id uuid primary key,tenant_id uuid,school_id uuid,route_name text,route_code text,map_color text);
    create table route_trip_patterns(id uuid primary key,tenant_id uuid,route_id uuid,display_name text,direction text);
    create table driver_trips(id uuid primary key,tenant_id uuid,driver_id uuid,bus_id uuid,route_id uuid,route_trip_pattern_id uuid,
      service_date date,status text,started_at timestamptz,ended_at timestamptz,bus_number_snapshot text,trip_name_snapshot text,route_shape_id uuid);
    create table driver_trip_current_locations(driver_trip_id uuid primary key,tenant_id uuid,driver_id uuid,bus_id uuid,route_id uuid,
      latitude float8,longitude float8,recorded_at timestamptz,speed_mps float8,accuracy_m float8);
    create table route_stops(id uuid primary key,tenant_id uuid,route_id uuid,school_id uuid,stop_name text,stop_order int,
      latitude float8,longitude float8,status text default 'active');
    create table route_trip_stop_schedules(tenant_id uuid,route_id uuid,route_trip_pattern_id uuid,route_stop_id uuid,planned_arrival_time time);
    create table route_shapes(id uuid primary key,tenant_id uuid,route_id uuid,path text,version int,status text);
    create table students(id uuid primary key,tenant_id uuid,school_id uuid,first_name text,last_name text);
    create table bus_route_assignments(id uuid primary key,tenant_id uuid,bus_id uuid,route_id uuid,route_trip_pattern_id uuid,effective_from date,effective_to date,status text);
    create table student_bus_assignments(id uuid primary key,tenant_id uuid,student_id uuid,bus_route_assignment_id uuid,
      route_trip_pattern_id uuid,pickup_stop_id uuid,dropoff_stop_id uuid,seat_number int,effective_from date,effective_to date,status text,created_at timestamptz default now());
    create table student_trip_events(tenant_id uuid,driver_trip_id uuid,student_id uuid,event_type text,event_time timestamptz,route_stop_id uuid);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
    create function public.is_current_user_session_active() returns boolean language sql stable as $$ select coalesce(current_setting('test.active',true),'true')='true' $$;
    create function safebus_private.has_verified_mfa() returns boolean language sql stable as $$ select coalesce(current_setting('test.mfa',true),'true')='true' $$;
    create function safebus_private.current_user_role() returns text language sql stable security definer as $$ select role from public.profiles where id=auth.uid() and status='active' $$;
    create function safebus_private.current_tenant_id() returns uuid language sql stable security definer as $$ select p.tenant_id from public.profiles p join public.tenants t on t.id=p.tenant_id and t.status='active' where p.id=auth.uid() and p.status='active' $$;
    create function safebus_private.current_school_id() returns uuid language sql stable security definer as $$ select school_id from public.profiles where id=auth.uid() $$;
    -- PostGIS and ETA are provider-independent seams. The hosted rehearsal compiles
    -- against actual PostGIS and the actual ETA function, without stubs.
    create function extensions.st_asgeojson(text) returns text language sql immutable as $$ select $1 $$;
    create function safebus_private.calculate_safe_route_eta(uuid,uuid,uuid,float8,float8,float8,timestamptz)
      returns table(eta_label text,next_stop_name text) language sql stable as $$ select '5–10 min'::text,'School'::text $$;
    grant usage on schema public,auth,safebus_private,extensions to authenticated;
    grant execute on all functions in schema auth,safebus_private,extensions to authenticated;
  `);
  for (const table of [
    'profiles',
    'schools',
    'buses',
    'drivers',
    'routes',
    'route_trip_patterns',
    'driver_trips',
    'driver_trip_current_locations',
    'route_stops',
    'route_trip_stop_schedules',
    'route_shapes',
    'students',
    'bus_route_assignments',
    'student_bus_assignments',
  ]) {
    await db.exec(`alter table ${table} enable row level security;
      grant select on ${table} to authenticated;
      create policy scoped_admin on ${table} for select to authenticated using (
        tenant_id=safebus_private.current_tenant_id() and safebus_private.current_user_role() in ('tenant_admin','school_admin','transportation_admin')
      );
      create policy session_and_mfa on ${table} as restrictive for select to authenticated using (
        public.is_current_user_session_active() and safebus_private.has_verified_mfa()
      );`);
  }
  await db.exec(`alter table student_trip_events enable row level security;
    create policy student_school on students as restrictive for select to authenticated using (
      safebus_private.current_user_role()<>'school_admin' or school_id=safebus_private.current_school_id());
    create policy route_school on routes as restrictive for select to authenticated using (
      safebus_private.current_user_role()<>'school_admin' or school_id=safebus_private.current_school_id());
    insert into tenants(id) values('${id(1)}'),('${id(99)}');
    insert into schools values('${id(10)}','${id(1)}','First school'),('${id(11)}','${id(1)}','Second school');
    insert into profiles(id,tenant_id,school_id,role,full_name) values
      ('${id(2)}','${id(1)}',null,'tenant_admin','Authority admin'),
      ('${id(3)}','${id(1)}','${id(10)}','school_admin','School admin'),
      ('${id(4)}','${id(1)}',null,'transportation_admin','Transportation admin'),
      ('${id(5)}','${id(1)}',null,'driver','Driver'),('${id(6)}','${id(1)}',null,'guardian','Guardian'),
      ('${id(7)}',null,null,'platform_super_admin','Platform admin'),
      ('${id(8)}','${id(99)}',null,'tenant_admin','Other authority admin');
    insert into buses values('${id(20)}','${id(1)}','BUS-01');
    insert into drivers values('${id(21)}','${id(1)}','${id(5)}');
    insert into routes values('${id(22)}','${id(1)}','${id(10)}','First route','R1','#2563eb'),
      ('${id(23)}','${id(1)}','${id(11)}','Second route','R2','#2563eb');
    insert into route_trip_patterns values('${id(24)}','${id(1)}','${id(22)}','Outbound','forward'),
      ('${id(25)}','${id(1)}','${id(22)}','Return','reverse'),('${id(26)}','${id(1)}','${id(23)}','Other school','forward');
    insert into route_stops(id,tenant_id,route_id,school_id,stop_name,stop_order,latitude,longitude) values
      ('${id(30)}','${id(1)}','${id(22)}','${id(10)}','Start',1,53,-113),
      ('${id(31)}','${id(1)}','${id(22)}','${id(10)}','School',2,53.01,-113);
    insert into route_trip_stop_schedules values('${id(1)}','${id(22)}','${id(24)}','${id(30)}','08:00'),
      ('${id(1)}','${id(22)}','${id(24)}','${id(31)}','08:30');
    insert into students values('${id(40)}','${id(1)}','${id(10)}','Assigned','Student'),
      ('${id(41)}','${id(1)}','${id(10)}','Recorded','Student'),('${id(42)}','${id(1)}','${id(11)}','Other school','Student');
    insert into bus_route_assignments values('${id(43)}','${id(1)}','${id(20)}','${id(22)}','${id(24)}','2026-01-01',null,'active');
    insert into student_bus_assignments(id,tenant_id,student_id,bus_route_assignment_id,route_trip_pattern_id,pickup_stop_id,dropoff_stop_id,seat_number,effective_from,status) values
      ('${id(44)}','${id(1)}','${id(40)}','${id(43)}','${id(24)}','${id(30)}','${id(31)}',4,'2026-01-01','active');
    select set_config('test.uid','${id(2)}',false);
  `);
  return db;
}
