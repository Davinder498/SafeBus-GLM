// Embedded PostgreSQL only. No network, production identities, or provider calls.
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

export const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const read = (name) => readFile(new URL(`../../../${name}`, import.meta.url), 'utf8');
export const dateBaseline = async () =>
  JSON.parse(await read('tests/release/fixtures/alberta-service-dates-hosted-20261028.json'));
export const searchBaseline = async () =>
  JSON.parse(await read('tests/release/fixtures/admin-ongoing-search-hosted-20261028.json'));
export const serviceDateMigration = () =>
  read('supabase/migrations/pending/20261028065508_alberta_service_dates.sql');

export async function serviceDateDb() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema safebus_private;
      create schema extensions; create schema realtime;
      create type user_role as enum ('tenant_admin','school_admin','transportation_admin','driver','guardian','platform_super_admin');
      create table tenants(id uuid primary key,status text default 'active');
      create table profiles(id uuid primary key,tenant_id uuid,school_id uuid,role user_role,status text default 'active',full_name text);
      create table drivers(id uuid primary key,tenant_id uuid,profile_id uuid,status text default 'active');
      create table buses(id uuid primary key,tenant_id uuid,school_id uuid,bus_number text,status text default 'active');
      create table routes(id uuid primary key,tenant_id uuid,school_id uuid,route_name text,route_code text,status text default 'active',definition_status text default 'ready');
      create table route_trip_patterns(id uuid primary key,tenant_id uuid,route_id uuid,display_name text,direction text default 'forward',status text default 'active',schedule_review_required boolean default false);
      create table bus_route_assignments(id uuid primary key,tenant_id uuid,bus_id uuid,route_id uuid,route_trip_pattern_id uuid,status text default 'active',effective_from date,effective_to date);
      create table driver_route_assignments(id uuid primary key,tenant_id uuid,driver_id uuid,bus_id uuid,route_id uuid,route_trip_pattern_id uuid,bus_route_assignment_id uuid,status text default 'active',effective_from date,effective_to date);
      create table driver_trips(id uuid primary key default gen_random_uuid(),tenant_id uuid,driver_id uuid,bus_id uuid,route_id uuid,route_trip_pattern_id uuid,driver_route_assignment_id uuid,route_shape_id uuid,bus_number_snapshot text,trip_name_snapshot text,trip_type text,status text default 'active',service_date date default current_date,started_at timestamptz default now(),ended_at timestamptz,updated_at timestamptz);
      create table bus_run_dispatches(id uuid primary key default gen_random_uuid(),tenant_id uuid,bus_id uuid,bus_route_assignment_id uuid,route_id uuid,route_trip_pattern_id uuid,service_date date default current_date,prepared_by uuid,status text default 'ready',cancelled_at timestamptz);
      create table bus_qr_credentials(id uuid primary key,tenant_id uuid,bus_id uuid,token_hash text,status text default 'active');
      create table bus_tracking_sessions(id uuid default gen_random_uuid(),tenant_id uuid,driver_trip_id uuid,driver_id uuid,bus_id uuid,bus_qr_credential_id uuid,session_token_hash text,status text default 'active',ended_at timestamptz);
      create table students(id uuid primary key,tenant_id uuid,status text default 'active',first_name text,last_name text);
      create table guardians(id uuid primary key,tenant_id uuid,profile_id uuid,status text default 'active');
      create table student_guardians(id uuid primary key,tenant_id uuid,student_id uuid,guardian_id uuid,status text default 'active',access_expires_at timestamptz);
      create table student_bus_assignments(id uuid primary key default gen_random_uuid(),tenant_id uuid,student_id uuid,bus_route_assignment_id uuid,route_trip_pattern_id uuid,status text default 'active',effective_from date default current_date,effective_to date,pickup_stop_id uuid,dropoff_stop_id uuid,seat_number integer);
      create table student_route_assignments(id uuid primary key default gen_random_uuid(),effective_from date default current_date);
      create table route_stops(id uuid primary key,tenant_id uuid,route_id uuid,stop_name text,stop_order integer,status text default 'active');
      create table route_trip_stop_schedules(tenant_id uuid,route_id uuid,route_trip_pattern_id uuid,route_stop_id uuid,planned_arrival_time time);
      create table driver_trip_current_locations(driver_trip_id uuid,tenant_id uuid,route_id uuid,bus_id uuid,driver_id uuid,latitude double precision,longitude double precision,recorded_at timestamptz,speed_mps double precision);
      create function safebus_private.calculate_safe_route_eta(uuid,uuid,uuid,double precision,double precision,double precision,timestamptz)
        returns table(eta_status text,eta_min_minutes integer,eta_max_minutes integer,eta_label text)
        language sql as $$ select 'unavailable'::text,null::integer,null::integer,'Unavailable'::text $$;
      create table user_notification_settings(profile_id uuid);
      create table user_notification_category_preferences(profile_id uuid,category text);
      create table guardian_student_push_preferences(student_guardian_id uuid,category text);
      create table user_notifications(id uuid);
      create table push_notification_outbox(id uuid);
      create table guardian_notification_outbox(id uuid);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create function safebus_private.current_user_role() returns user_role language sql stable security definer as $$ select role from public.profiles where id=auth.uid() and status='active' $$;
      create function safebus_private.current_tenant_id() returns uuid language sql stable security definer as $$ select p.tenant_id from public.profiles p join public.tenants t on t.id=p.tenant_id and t.status='active' where p.id=auth.uid() and p.status='active' $$;
      create function safebus_private.current_school_id() returns uuid language sql stable security definer as $$ select school_id from public.profiles where id=auth.uid() $$;
      create function safebus_private.current_driver_id() returns uuid language sql stable security definer as $$ select id from public.drivers where profile_id=auth.uid() and status='active' $$;
      create function safebus_private.current_guardian_id() returns uuid language sql stable security definer as $$ select id from public.guardians where profile_id=auth.uid() and status='active' $$;
      create function safebus_private.is_transportation_write_admin() returns boolean language sql stable as $$ select safebus_private.current_user_role() in ('tenant_admin','school_admin','transportation_admin') $$;
      create function safebus_private.current_route_shape_id_for_route(uuid,uuid) returns uuid language sql as $$ select null::uuid $$;
      create function safebus_private.hash_bus_tracking_token(text) returns text language sql immutable as $$ select md5($1) $$;
      create function safebus_private.create_bus_tracking_session_token() returns text language sql volatile as $$ select gen_random_uuid()::text $$;
      grant usage on schema safebus_private,auth to authenticated;
      grant select on all tables in schema public to authenticated;
      set check_function_bodies=off;
    `);
    const baseline = await dateBaseline();
    // Function headers declare a few additional composite dependencies. These
    // empty tables are never used by the behavioral scenarios below.
    const relations = new Set();
    for (const entry of baseline.functions) {
      for (const match of entry.definition.matchAll(/\bpublic\.([a-z_]+)(?:%rowtype|\s*[;,])/gi))
        relations.add(match[1]);
    }
    for (const relation of relations)
      await db.exec(`create table if not exists public.${relation}(id uuid)`);
    for (const entry of [...baseline.functions, await searchBaseline()]) {
      await db.exec(entry.definition);
      await db.exec(
        `revoke all on function ${entry.signature} from public,anon,authenticated,service_role`,
      );
      if (entry.acl.some((acl) => acl.startsWith('authenticated=')))
        await db.exec(`grant execute on function ${entry.signature} to authenticated`);
      if (entry.acl.some((acl) => acl.startsWith('service_role=')))
        await db.exec(`grant execute on function ${entry.signature} to service_role`);
    }
    for (const p of baseline.policies) {
      await db.exec(`alter table ${p.schemaname}.${p.tablename} enable row level security;
        create policy "${p.policyname}" on ${p.schemaname}.${p.tablename} for select to authenticated using (${p.qual})`);
    }
    await db.exec(`
      insert into tenants(id) values('${id(1)}'),('${id(90)}');
      insert into profiles(id,tenant_id,school_id,role,full_name) values
        ('${id(2)}','${id(1)}','${id(80)}','tenant_admin','Admin'),
        ('${id(3)}','${id(1)}','${id(80)}','driver','Driver'),
        ('${id(4)}','${id(1)}','${id(80)}','guardian','Guardian');
      insert into drivers(id,tenant_id,profile_id) values('${id(13)}','${id(1)}','${id(3)}');
      insert into guardians(id,tenant_id,profile_id) values('${id(14)}','${id(1)}','${id(4)}');
      insert into buses(id,tenant_id,school_id,bus_number) values('${id(20)}','${id(1)}','${id(80)}','01');
      insert into routes(id,tenant_id,school_id,route_name,route_code) values('${id(21)}','${id(1)}','${id(80)}','Route 01','01');
      insert into route_trip_patterns(id,tenant_id,route_id,display_name) values('${id(22)}','${id(1)}','${id(21)}','Outbound');
      insert into bus_route_assignments(id,tenant_id,bus_id,route_id,route_trip_pattern_id,effective_from,effective_to)
        values('${id(23)}','${id(1)}','${id(20)}','${id(21)}','${id(22)}','2026-10-27','2026-10-27');
      insert into driver_route_assignments(id,tenant_id,driver_id,bus_id,route_id,route_trip_pattern_id,bus_route_assignment_id,effective_from,effective_to)
        values('${id(24)}','${id(1)}','${id(13)}','${id(20)}','${id(21)}','${id(22)}','${id(23)}','2026-10-27','2026-10-27');
      insert into students(id,tenant_id) values('${id(30)}','${id(1)}'),('${id(31)}','${id(1)}');
      insert into student_guardians(id,tenant_id,guardian_id,student_id) values('${id(32)}','${id(1)}','${id(14)}','${id(30)}');
      insert into student_bus_assignments(tenant_id,student_id,bus_route_assignment_id,route_trip_pattern_id,effective_from,effective_to)
        select '${id(1)}',id,'${id(23)}','${id(22)}','2026-10-27','2026-10-27' from students;
      insert into bus_qr_credentials(id,tenant_id,bus_id,token_hash) values('${id(25)}','${id(1)}','${id(20)}',md5('sbus_bus_v1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
      select set_config('test.uid','${id(2)}',false);
    `);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
