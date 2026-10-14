-- Embedded PostgreSQL only. Minimal synthetic dependencies, NOT hosted QA seeds.
create role anon;
create role authenticated;
create role service_role;
create schema safebus_private;
create schema realtime;
create schema cron;
grant usage on schema safebus_private to authenticated, service_role;
create table public.tenants(id uuid primary key, status text not null default 'active');
create table public.profiles(id uuid primary key, tenant_id uuid, role text default 'guardian', status text default 'active');
create table public.drivers(id uuid primary key, tenant_id uuid, status text default 'active');
create table public.buses(id uuid primary key, tenant_id uuid, status text default 'active');
create table public.routes(id uuid primary key, tenant_id uuid, status text default 'active');
create table public.route_trip_patterns(id uuid primary key, tenant_id uuid, route_id uuid, status text default 'active');
create table public.driver_trips(
  id uuid primary key, tenant_id uuid, driver_id uuid, bus_id uuid, route_id uuid,
  route_trip_pattern_id uuid, status text default 'active'
);
create table public.driver_trip_current_locations(
  driver_trip_id uuid primary key references public.driver_trips(id), tenant_id uuid,
  latitude double precision, longitude double precision
);
create table public.students(id uuid primary key, tenant_id uuid, status text default 'active');
create table public.guardians(id uuid primary key, tenant_id uuid, profile_id uuid, status text default 'active');
create table public.student_guardians(
  id uuid primary key, tenant_id uuid, student_id uuid, guardian_id uuid,
  status text default 'active', access_expires_at timestamptz
);
create table public.bus_route_assignments(
  id uuid primary key, tenant_id uuid, bus_id uuid, route_id uuid, route_trip_pattern_id uuid,
  status text default 'active', effective_from date, effective_to date
);
create table public.student_bus_assignments(
  id uuid primary key, tenant_id uuid, student_id uuid, bus_route_assignment_id uuid,
  route_trip_pattern_id uuid, status text default 'active', effective_from date default current_date, effective_to date
);
create table public.student_route_assignments(
  tenant_id uuid, student_id uuid, route_id uuid, status text default 'active',
  effective_from date default current_date, effective_to date
);
create table realtime.captured(topic text, event text, payload jsonb, private boolean);
create table realtime.messages(id uuid primary key, payload jsonb, event text, topic text,
  private boolean, extension text, created_at timestamptz default now());
create table realtime.test_controls(fail_topic text, inject_location_for uuid);
insert into realtime.test_controls values(null,null);
create function realtime.test_message_insert()
returns trigger language plpgsql as $$
declare v_trip uuid;
begin
  if exists(select 1 from realtime.test_controls c where c.fail_topic = new.topic) then
    raise exception 'Synthetic broadcast failure' using errcode = 'P0001';
  end if;
  select inject_location_for into v_trip from realtime.test_controls;
  if v_trip is not null then
    update realtime.test_controls set inject_location_for = null;
    update public.driver_trip_current_locations set latitude = latitude + 0.001 where driver_trip_id = v_trip;
  end if;
  insert into realtime.captured values(new.topic,new.event,new.payload,new.private);
  return new;
end;
$$;
create trigger test_message_insert before insert on realtime.messages
  for each row execute function realtime.test_message_insert();
-- Reproduce the reviewed provider's warning-only failure semantics for the old
-- trip helpers. The new queued sender must NOT call this as its durable ACK.
create function realtime.send(payload jsonb, event text, topic text, private boolean)
returns void language plpgsql as $$
declare generated_id uuid := gen_random_uuid();
begin
  perform set_config('realtime.topic',topic,true);
  insert into realtime.messages(id,payload,event,topic,private,extension) values
    (generated_id, payload || jsonb_build_object('id',generated_id), event, topic, private, 'broadcast');
exception when others then
  raise warning 'Synthetic warning-only provider insertion failure';
end;
$$;
create function public.is_current_user_session_active() returns boolean language sql as $$ select false $$;
create table cron.test_jobs(name text primary key, schedule text, command text);
create view cron.job as select name as jobname, schedule, command, true as active,
  current_user::text as username from cron.test_jobs;
create function cron.schedule(job_name text, job_schedule text, job_command text)
returns bigint language sql as $$
  insert into cron.test_jobs values(job_name,job_schedule,job_command);
  select 1::bigint;
$$;
