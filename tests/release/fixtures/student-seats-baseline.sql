-- Embedded PostgreSQL fixture only. No hosted connection, identities or writes.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema extensions;
create schema safebus_private;
create type public.user_role as enum ('tenant_admin', 'transportation_admin', 'school_admin', 'guardian', 'driver');
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;
create function safebus_private.current_tenant_id() returns uuid language sql stable as $$
  select case when current_setting('test.session', true) = 'active'
    then nullif(current_setting('test.tenant', true), '')::uuid end;
$$;
create function safebus_private.current_user_role() returns public.user_role language sql stable as $$
  select case when current_setting('test.session', true) = 'active'
    then nullif(current_setting('test.role', true), '')::public.user_role end;
$$;
create function safebus_private.current_driver_id() returns uuid language sql stable as $$
  select nullif(current_setting('test.driver', true), '')::uuid;
$$;
create function safebus_private.current_guardian_id() returns uuid language sql stable as $$
  select nullif(current_setting('test.guardian', true), '')::uuid;
$$;
create function safebus_private.is_transportation_write_admin() returns boolean language sql stable as $$
  select coalesce(safebus_private.current_user_role() = 'tenant_admin', false);
$$;
create table public.buses (
  id uuid primary key, tenant_id uuid not null, capacity integer, bus_number text, status text default 'active',
  school_id uuid, license_plate text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.routes (
  id uuid primary key, tenant_id uuid not null, school_id uuid, route_name text, route_code text, status text default 'active'
);
create table public.route_trip_patterns (
  id uuid primary key, tenant_id uuid, route_id uuid, direction text, display_name text,
  status text default 'active', schedule_review_required boolean default false
);
create table public.bus_route_assignments (
  id uuid primary key, tenant_id uuid, bus_id uuid references public.buses, route_id uuid references public.routes,
  route_trip_pattern_id uuid references public.route_trip_patterns,
  status text default 'active', effective_from date, effective_to date, trip_type text default 'morning',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.students (
  id uuid primary key, tenant_id uuid, first_name text, last_name text, status text default 'active'
);
create table public.student_bus_assignments (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null, student_id uuid references public.students,
  bus_route_assignment_id uuid references public.bus_route_assignments,
  route_trip_pattern_id uuid references public.route_trip_patterns, pickup_stop_id uuid, dropoff_stop_id uuid,
  effective_from date not null default current_date, effective_to date, status text default 'active',
  created_at timestamptz default now(), updated_at timestamptz default now(),
  check(effective_to is null or effective_to >= effective_from)
);
alter table public.student_bus_assignments enable row level security;
create policy admin_assignments on public.student_bus_assignments to authenticated
  using (safebus_private.is_transportation_write_admin() and tenant_id = safebus_private.current_tenant_id())
  with check (safebus_private.is_transportation_write_admin() and tenant_id = safebus_private.current_tenant_id()
    and exists(select 1 from public.students s where s.id=student_id and s.tenant_id=student_bus_assignments.tenant_id)
    and exists(select 1 from public.bus_route_assignments b where b.id=bus_route_assignment_id and b.tenant_id=student_bus_assignments.tenant_id));
create table public.profiles(id uuid primary key, tenant_id uuid, role public.user_role, status text default 'active', full_name text, email text);
create table public.schools(id uuid primary key, tenant_id uuid, name text);
create table public.bus_admin_details(bus_id uuid, tenant_id uuid, fleet_number text);
create table public.driver_route_assignments(
  id uuid, tenant_id uuid, driver_id uuid, bus_id uuid, route_id uuid, route_trip_pattern_id uuid,
  bus_route_assignment_id uuid, trip_type text, status text, effective_from date, effective_to date,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.drivers(id uuid primary key, tenant_id uuid, profile_id uuid, status text default 'active');
create table public.driver_trips (
  id uuid primary key, tenant_id uuid, driver_id uuid, bus_id uuid, route_id uuid, route_trip_pattern_id uuid,
  driver_route_assignment_id uuid, trip_name_snapshot text, status text default 'active', service_date date default current_date, started_at timestamptz default now()
);
create table public.student_trip_events(driver_trip_id uuid, student_id uuid, tenant_id uuid, event_type text, event_time timestamptz);
create table public.route_stops(id uuid primary key, tenant_id uuid, route_id uuid, stop_name text, status text default 'active');
create table public.guardians(id uuid primary key, profile_id uuid, status text default 'active');
create table public.student_guardians (
  student_id uuid, guardian_id uuid, tenant_id uuid, status text default 'active', access_expires_at timestamptz
);
create table public.captured_notifications(tenant_id uuid, recipient_id uuid);
create function safebus_private.enqueue_user_notification(
  uuid,uuid,text,text,text,text,uuid,text,timestamptz,uuid,uuid,uuid
) returns void language sql as $$ insert into public.captured_notifications values($1,$2) $$;
create function public.get_admin_bus_services() returns setof public.bus_route_assignments
language sql security invoker as $$
  select * from public.bus_route_assignments where tenant_id=safebus_private.current_tenant_id()
    and safebus_private.is_transportation_write_admin();
$$;
grant usage on schema public, auth, safebus_private to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on public.student_bus_assignments to authenticated;
grant execute on all functions in schema auth, safebus_private to authenticated;
