-- SafeBus Alberta - students ride a bus service, not a route record
--
-- A bus service binds a bus to a route for a service direction/time period.
-- Student pickup/drop-off choices belong to that service and must be stops on
-- its route. Schools are optional stop attributes, allowing one route and bus
-- service to serve multiple schools.

alter table public.route_stops
  add column if not exists school_id uuid references public.schools(id) on delete set null;

create index if not exists route_stops_school_id_idx on public.route_stops(school_id);

create or replace function public.validate_route_stop_school()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.school_id is not null and not exists (
    select 1 from schools s where s.id = new.school_id and s.tenant_id = new.tenant_id and s.status = 'active'
  ) then raise exception 'School stop must use an active school in the route tenant.' using errcode = '23514'; end if;
  return new;
end $$;
create trigger validate_route_stop_school
  before insert or update of school_id, tenant_id on public.route_stops
  for each row execute function public.validate_route_stop_school();

create table public.bus_route_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bus_id uuid not null references public.buses(id) on delete restrict,
  route_id uuid not null references public.routes(id) on delete restrict,
  trip_type text not null,
  effective_from date,
  effective_to date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bus_route_assignments_trip_type_check check (trip_type in ('morning', 'evening')),
  constraint bus_route_assignments_status_check check (status in ('active', 'inactive')),
  constraint bus_route_assignments_dates_check check (
    effective_to is null or effective_from is null or effective_to >= effective_from
  )
);

create unique index bus_route_assignments_active_unique
  on public.bus_route_assignments(tenant_id, bus_id, route_id, trip_type)
  where status = 'active';
create index bus_route_assignments_tenant_status_idx on public.bus_route_assignments(tenant_id, status);
create index bus_route_assignments_bus_idx on public.bus_route_assignments(bus_id);
create index bus_route_assignments_route_idx on public.bus_route_assignments(route_id);

create trigger set_updated_at_bus_route_assignments
  before update on public.bus_route_assignments
  for each row execute function public.set_updated_at();

create table public.student_bus_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  bus_route_assignment_id uuid not null references public.bus_route_assignments(id) on delete restrict,
  pickup_stop_id uuid references public.route_stops(id) on delete set null,
  dropoff_stop_id uuid references public.route_stops(id) on delete set null,
  effective_from date not null default current_date,
  effective_to date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_bus_assignments_status_check check (status in ('active', 'inactive', 'archived')),
  constraint student_bus_assignments_dates_check check (effective_to is null or effective_to >= effective_from)
);

create index student_bus_assignments_tenant_created_idx on public.student_bus_assignments(tenant_id, created_at desc, id);
create index student_bus_assignments_student_idx on public.student_bus_assignments(student_id);
create index student_bus_assignments_service_idx on public.student_bus_assignments(bus_route_assignment_id);
create index student_bus_assignments_pickup_idx on public.student_bus_assignments(pickup_stop_id);
create index student_bus_assignments_dropoff_idx on public.student_bus_assignments(dropoff_stop_id);
create unique index student_bus_assignments_active_unique
  on public.student_bus_assignments(student_id, bus_route_assignment_id)
  where status = 'active';

create trigger set_updated_at_student_bus_assignments
  before update on public.student_bus_assignments
  for each row execute function public.set_updated_at();

create or replace function public.bus_service_entities_in_tenant(
  p_tenant_id uuid, p_bus_id uuid, p_route_id uuid
) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from buses where id = p_bus_id and tenant_id = p_tenant_id and status = 'active')
     and exists (select 1 from routes where id = p_route_id and tenant_id = p_tenant_id and status = 'active');
$$;

create or replace function public.student_bus_assignment_entities_in_tenant(
  p_tenant_id uuid, p_student_id uuid, p_service_id uuid,
  p_pickup_stop_id uuid, p_dropoff_stop_id uuid
) returns boolean language sql stable security definer set search_path = public as $$
  with service as (
    select route_id from bus_route_assignments
    where id = p_service_id and tenant_id = p_tenant_id and status = 'active'
  )
  select exists (select 1 from students where id = p_student_id and tenant_id = p_tenant_id and status = 'active')
    and exists (select 1 from service)
    and (p_pickup_stop_id is null or exists (
      select 1 from route_stops rs join service svc on svc.route_id = rs.route_id
      where rs.id = p_pickup_stop_id and rs.tenant_id = p_tenant_id and rs.status = 'active'
    ))
    and (p_dropoff_stop_id is null or exists (
      select 1 from route_stops rs join service svc on svc.route_id = rs.route_id
      where rs.id = p_dropoff_stop_id and rs.tenant_id = p_tenant_id and rs.status = 'active'
    ));
$$;

alter table public.bus_route_assignments enable row level security;
alter table public.student_bus_assignments enable row level security;

create policy "bus_route_assignments select admin" on public.bus_route_assignments
  for select to authenticated using (
    public.is_transportation_write_admin() and (
      public.is_platform_super_admin() or tenant_id = public.current_tenant_id()
    )
  );
create policy "bus_route_assignments select own driver" on public.bus_route_assignments
  for select to authenticated using (
    public.current_user_role() = 'driver' and tenant_id = public.current_tenant_id()
    and exists (select 1 from driver_route_assignments dra where dra.driver_id = public.current_driver_id()
      and dra.bus_id = bus_route_assignments.bus_id and dra.route_id = bus_route_assignments.route_id and dra.trip_type = bus_route_assignments.trip_type and dra.status = 'active')
  );
create policy "bus_route_assignments insert admin" on public.bus_route_assignments
  for insert to authenticated with check (
    public.is_transportation_write_admin() and public.can_write_tenant(tenant_id)
    and public.bus_service_entities_in_tenant(tenant_id, bus_id, route_id)
  );
create policy "bus_route_assignments update admin" on public.bus_route_assignments
  for update to authenticated using (public.is_transportation_write_admin() and public.can_write_tenant(tenant_id))
  with check (public.is_transportation_write_admin() and public.can_write_tenant(tenant_id)
    and public.bus_service_entities_in_tenant(tenant_id, bus_id, route_id));

create policy "student_bus_assignments select admin" on public.student_bus_assignments
  for select to authenticated using (
    public.is_transportation_write_admin() and (
      public.is_platform_super_admin() or tenant_id = public.current_tenant_id()
    )
  );
create policy "student_bus_assignments select linked guardian" on public.student_bus_assignments
  for select to authenticated using (
    tenant_id = public.current_tenant_id() and exists (
      select 1 from student_guardians sg join guardians g on g.id = sg.guardian_id
      where sg.student_id = student_bus_assignments.student_id and sg.status = 'active'
        and g.profile_id = auth.uid() and g.status = 'active'
    )
  );
create policy "student_bus_assignments insert admin" on public.student_bus_assignments
  for insert to authenticated with check (
    public.is_transportation_write_admin() and public.can_write_tenant(tenant_id)
    and public.student_bus_assignment_entities_in_tenant(tenant_id, student_id, bus_route_assignment_id, pickup_stop_id, dropoff_stop_id)
  );
create policy "student_bus_assignments update admin" on public.student_bus_assignments
  for update to authenticated using (public.is_transportation_write_admin() and public.can_write_tenant(tenant_id))
  with check (public.is_transportation_write_admin() and public.can_write_tenant(tenant_id)
    and public.student_bus_assignment_entities_in_tenant(tenant_id, student_id, bus_route_assignment_id, pickup_stop_id, dropoff_stop_id));

grant select, insert, update on public.bus_route_assignments to authenticated;
grant select, insert, update on public.student_bus_assignments to authenticated;

-- Seed bus services from existing operational driver assignments.
insert into public.bus_route_assignments (tenant_id, bus_id, route_id, trip_type, effective_from, effective_to, status)
select distinct on (tenant_id, bus_id, route_id, trip_type)
  tenant_id, bus_id, route_id, trip_type, effective_from, effective_to, status
from public.driver_route_assignments
order by tenant_id, bus_id, route_id, trip_type, case when status = 'active' then 0 else 1 end, created_at desc
on conflict (tenant_id, bus_id, route_id, trip_type) where status = 'active' do nothing;

alter table public.driver_route_assignments
  add column if not exists bus_route_assignment_id uuid references public.bus_route_assignments(id) on delete restrict;

update public.driver_route_assignments dra set bus_route_assignment_id = bra.id
from public.bus_route_assignments bra
where dra.bus_route_assignment_id is null and bra.tenant_id = dra.tenant_id and bra.bus_id = dra.bus_id
  and bra.route_id = dra.route_id and bra.trip_type = dra.trip_type and bra.status = 'active';

create index if not exists driver_route_assignments_bus_service_idx
  on public.driver_route_assignments(bus_route_assignment_id);

-- Migrate only legacy student rows whose route has an unambiguous active bus service.
insert into public.student_bus_assignments (
  id, tenant_id, student_id, bus_route_assignment_id, pickup_stop_id, dropoff_stop_id,
  effective_from, effective_to, status, created_at, updated_at
)
select sra.id, sra.tenant_id, sra.student_id, (array_agg(bra.id order by bra.id))[1], sra.pickup_stop_id, sra.dropoff_stop_id,
  sra.effective_from, sra.effective_to, sra.status, sra.created_at, sra.updated_at
from public.student_route_assignments sra
join public.bus_route_assignments bra on bra.tenant_id = sra.tenant_id and bra.route_id = sra.route_id and bra.status = 'active'
group by sra.id
having count(*) = 1
on conflict (id) do nothing;

-- Compatibility projection: existing secured guardian/driver/event RPCs continue
-- reading student_route_assignments while student_bus_assignments is authoritative.
create or replace function public.sync_student_bus_assignment_legacy()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_route_id uuid;
begin
  select route_id into v_route_id from bus_route_assignments where id = new.bus_route_assignment_id;
  insert into student_route_assignments (
    id, tenant_id, student_id, route_id, pickup_stop_id, dropoff_stop_id,
    effective_from, effective_to, status, created_at, updated_at
  ) values (
    new.id, new.tenant_id, new.student_id, v_route_id, new.pickup_stop_id, new.dropoff_stop_id,
    new.effective_from, new.effective_to, new.status, new.created_at, new.updated_at
  ) on conflict (id) do update set
    student_id = excluded.student_id, route_id = excluded.route_id,
    pickup_stop_id = excluded.pickup_stop_id, dropoff_stop_id = excluded.dropoff_stop_id,
    effective_from = excluded.effective_from, effective_to = excluded.effective_to,
    status = excluded.status, updated_at = excluded.updated_at;
  return new;
end $$;

create trigger sync_student_bus_assignment_legacy
  after insert or update on public.student_bus_assignments
  for each row execute function public.sync_student_bus_assignment_legacy();

comment on table public.student_route_assignments is
  'Legacy compatibility projection maintained from student_bus_assignments. New application writes must use student_bus_assignments.';

create or replace function public.get_admin_bus_services()
returns table (
  id uuid, tenant_id uuid, bus_id uuid, route_id uuid, trip_type text,
  effective_from date, effective_to date, status text, created_at timestamptz, updated_at timestamptz,
  bus_number text, route_name text, route_code text
)
language sql security invoker set search_path = public as $$
  select bra.id, bra.tenant_id, bra.bus_id, bra.route_id, bra.trip_type, bra.effective_from,
    bra.effective_to, bra.status, bra.created_at, bra.updated_at,
    b.bus_number, r.route_name, r.route_code
  from bus_route_assignments bra join buses b on b.id = bra.bus_id join routes r on r.id = bra.route_id
  where public.is_transportation_write_admin() and bra.tenant_id = public.current_tenant_id()
    and bra.status = 'active' and b.status = 'active' and r.status = 'active'
  order by b.bus_number, r.route_code, bra.trip_type;
$$;

create or replace function public.get_admin_student_bus_assignments_page(
  p_page integer default 1, p_page_size integer default 50,
  p_search text default '', p_status text default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := public.admin_page_size(p_page_size);
  v_search text := '%' || lower(trim(coalesce(p_search, ''))) || '%';
  v_result jsonb;
begin
  if not public.is_transportation_write_admin() or v_tenant is null then
    raise exception 'Admin tenant context is required' using errcode = '42501';
  end if;
  with filtered as (
    select a.*, concat_ws(' ', s.first_name, s.last_name) student_name,
      b.bus_number, r.route_name, r.route_code, bra.trip_type,
      ps.stop_name pickup_stop_name, ds.stop_name dropoff_stop_name
    from student_bus_assignments a
    join students s on s.id = a.student_id
    join bus_route_assignments bra on bra.id = a.bus_route_assignment_id
    join buses b on b.id = bra.bus_id join routes r on r.id = bra.route_id
    left join route_stops ps on ps.id = a.pickup_stop_id left join route_stops ds on ds.id = a.dropoff_stop_id
    where a.tenant_id = v_tenant and (p_status is null or a.status = p_status)
      and (trim(coalesce(p_search, '')) = '' or lower(concat_ws(' ', s.first_name, s.last_name,
        b.bus_number, r.route_name, r.route_code, bra.trip_type, ps.stop_name, ds.stop_name, a.status)) like v_search)
  ), page_rows as (
    select * from filtered order by created_at desc, id
    limit v_size offset ((v_page - 1) * v_size)
  )
  select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb),
    'totalCount', (select count(*) from filtered), 'page', v_page, 'pageSize', v_size)
  into v_result from page_rows;
  return v_result;
end $$;

grant execute on function public.get_admin_bus_services() to authenticated;
grant execute on function public.get_admin_student_bus_assignments_page(integer, integer, text, text) to authenticated;
revoke all on function public.get_admin_bus_services() from public, anon;
revoke all on function public.get_admin_student_bus_assignments_page(integer, integer, text, text) from public, anon;

alter table public.student_trip_events
  add column if not exists route_stop_id uuid references public.route_stops(id) on delete set null;
create index if not exists student_trip_events_route_stop_idx on public.student_trip_events(route_stop_id);

create or replace function public.record_student_trip_event_for_active_trip(
  p_student_id uuid, p_event_type text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trip public.driver_trips;
  v_stop_id uuid;
  v_has_pickup boolean;
  v_has_dropoff boolean;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can record student trip events.' using errcode = '42501';
  end if;
  if p_student_id is null or p_event_type not in ('picked_up', 'dropped_off') then
    raise exception 'Invalid student trip event.' using errcode = '22023';
  end if;
  select dt.* into v_trip from driver_trips dt
  where dt.tenant_id = public.current_tenant_id() and dt.driver_id = public.current_driver_id()
    and dt.status = 'active' order by dt.started_at desc limit 1 for update;
  if not found then raise exception 'Active trip not found.' using errcode = 'P0002'; end if;

  select case when p_event_type = 'picked_up' then sba.pickup_stop_id else sba.dropoff_stop_id end
  into v_stop_id
  from student_bus_assignments sba
  join bus_route_assignments bra on bra.id = sba.bus_route_assignment_id
  where sba.student_id = p_student_id and sba.tenant_id = v_trip.tenant_id and sba.status = 'active'
    and bra.bus_id = v_trip.bus_id and bra.route_id = v_trip.route_id and bra.status = 'active'
    and sba.effective_from <= v_trip.service_date
    and (sba.effective_to is null or sba.effective_to >= v_trip.service_date)
  order by sba.effective_from desc limit 1;
  if not found then
    -- Transitional fallback for legacy rows created before this migration.
    select case when p_event_type = 'picked_up' then pickup_stop_id else dropoff_stop_id end
    into v_stop_id from student_route_assignments
    where student_id = p_student_id and tenant_id = v_trip.tenant_id and route_id = v_trip.route_id
      and status = 'active' and effective_from <= v_trip.service_date
      and (effective_to is null or effective_to >= v_trip.service_date)
    order by effective_from desc limit 1;
    if not found then raise exception 'Student is not assigned to this bus service.' using errcode = 'P0002'; end if;
  end if;
  if v_stop_id is null then raise exception 'The planned stop must be assigned before recording this event.' using errcode = '23514'; end if;
  if not exists (select 1 from route_stops where id = v_stop_id and route_id = v_trip.route_id and status = 'active') then
    raise exception 'The planned stop is not available on this route.' using errcode = '23514';
  end if;

  select exists(select 1 from student_trip_events where driver_trip_id = v_trip.id and student_id = p_student_id and event_type = 'picked_up'),
    exists(select 1 from student_trip_events where driver_trip_id = v_trip.id and student_id = p_student_id and event_type = 'dropped_off')
  into v_has_pickup, v_has_dropoff;
  if v_has_dropoff then raise exception 'Student trip is already complete.' using errcode = '23505'; end if;
  if p_event_type = 'picked_up' and v_has_pickup then raise exception 'Student is already picked up.' using errcode = '23505'; end if;
  if p_event_type = 'dropped_off' and not v_has_pickup then raise exception 'Student must be picked up first.' using errcode = '23514'; end if;

  insert into student_trip_events(tenant_id, driver_trip_id, student_id, route_stop_id, event_type, created_by)
  values(v_trip.tenant_id, v_trip.id, p_student_id, v_stop_id, p_event_type, auth.uid());
exception when unique_violation then
  raise exception 'Student trip event already recorded.' using errcode = '23505';
end $$;

comment on function public.record_student_trip_event_for_active_trip(uuid, text) is
  'Records pickup/drop-off only for a student assigned to the active trip bus service and derives the event stop from the secured assignment.';
