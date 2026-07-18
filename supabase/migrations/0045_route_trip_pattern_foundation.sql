-- SafeBus Alberta - route/trip pattern foundation
--
-- A route is one physical A -> B corridor. A route trip pattern is one
-- traversal of that corridor (forward or reverse). This migration is additive:
-- legacy route_type/trip_type columns remain populated during the hosted-DEV
-- cutover and may be removed only by the guarded 0046 migration.

alter table public.routes
  add column route_kind text,
  add column map_color text,
  add column definition_status text not null default 'incomplete';

update public.routes
set
  route_kind = case when route_type = 'field_trip' then 'field_trip' else 'regular' end,
  map_color = '#' || upper(substr(md5(id::text), 1, 6));

alter table public.routes
  alter column route_kind set not null,
  alter column map_color set not null,
  add constraint routes_route_kind_check check (route_kind in ('regular', 'field_trip')),
  add constraint routes_map_color_check check (map_color ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint routes_definition_status_check check (
    definition_status in ('incomplete', 'ready')
  );

-- Route definitions are a tenant-admin responsibility. Existing read policies
-- remain unchanged for operational viewers.
drop policy if exists "routes insert admin" on public.routes;
drop policy if exists "routes update admin" on public.routes;
drop policy if exists "route stops insert admin" on public.route_stops;
drop policy if exists "route stops update admin" on public.route_stops;

create policy "routes insert tenant admin"
  on public.routes for insert to authenticated
  with check (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
    and public.can_write_school(tenant_id, school_id)
  );

create policy "routes update tenant admin"
  on public.routes for update to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  )
  with check (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
    and public.can_write_school(tenant_id, school_id)
  );

create policy "route stops insert tenant admin"
  on public.route_stops for insert to authenticated
  with check (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
    and public.can_write_route_stop(tenant_id, route_id)
  );

create policy "route stops update tenant admin"
  on public.route_stops for update to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  )
  with check (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
    and public.can_write_route_stop(tenant_id, route_id)
  );

create table public.route_trip_patterns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  direction text not null,
  display_name text not null,
  status text not null default 'active',
  schedule_review_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_trip_patterns_direction_check check (
    direction in ('forward', 'reverse')
  ),
  constraint route_trip_patterns_display_name_check check (
    char_length(btrim(display_name)) between 1 and 100
  ),
  constraint route_trip_patterns_status_check check (
    status in ('active', 'inactive')
  ),
  constraint route_trip_patterns_route_direction_unique unique (route_id, direction),
  constraint route_trip_patterns_tenant_id_id_unique unique (tenant_id, id),
  constraint route_trip_patterns_route_id_id_unique unique (route_id, id)
);

create table public.route_trip_stop_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  route_trip_pattern_id uuid not null references public.route_trip_patterns(id) on delete cascade,
  route_stop_id uuid not null references public.route_stops(id) on delete cascade,
  planned_arrival_time time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_trip_stop_schedules_pattern_stop_unique unique (
    route_trip_pattern_id,
    route_stop_id
  )
);

create index route_trip_patterns_tenant_idx
  on public.route_trip_patterns(tenant_id);
create index route_trip_patterns_route_idx
  on public.route_trip_patterns(route_id);
create index route_trip_stop_schedules_tenant_idx
  on public.route_trip_stop_schedules(tenant_id);
create index route_trip_stop_schedules_route_idx
  on public.route_trip_stop_schedules(route_id);
create index route_trip_stop_schedules_pattern_idx
  on public.route_trip_stop_schedules(route_trip_pattern_id);
create index route_trip_stop_schedules_stop_idx
  on public.route_trip_stop_schedules(route_stop_id);

create trigger set_updated_at_route_trip_patterns
  before update on public.route_trip_patterns
  for each row execute function public.set_updated_at();

create trigger set_updated_at_route_trip_stop_schedules
  before update on public.route_trip_stop_schedules
  for each row execute function public.set_updated_at();

insert into public.route_trip_patterns (
  tenant_id,
  route_id,
  direction,
  display_name,
  status,
  schedule_review_required
)
select r.tenant_id, r.id, pattern.direction, pattern.display_name, 'active', true
from public.routes r
cross join (
  values ('forward', 'Outbound'), ('reverse', 'Return')
) as pattern(direction, display_name)
on conflict (route_id, direction) do nothing;

insert into public.route_trip_stop_schedules (
  tenant_id,
  route_id,
  route_trip_pattern_id,
  route_stop_id,
  planned_arrival_time
)
select
  rs.tenant_id,
  rs.route_id,
  rtp.id,
  rs.id,
  case
    when rtp.direction = 'forward'
      and (
        r.route_type = 'morning'
        or exists (
          select 1
          from public.driver_route_assignments dra
          where dra.route_id = r.id and dra.trip_type = 'morning'
        )
      )
      then rs.planned_arrival_time
    when rtp.direction = 'reverse'
      and (
        r.route_type = 'afternoon'
        or exists (
          select 1
          from public.driver_route_assignments dra
          where dra.route_id = r.id and dra.trip_type = 'evening'
        )
      )
      then rs.planned_arrival_time
    else null
  end
from public.route_stops rs
join public.routes r on r.id = rs.route_id and r.tenant_id = rs.tenant_id
join public.route_trip_patterns rtp
  on rtp.route_id = rs.route_id and rtp.tenant_id = rs.tenant_id
where rs.status <> 'archived'
on conflict (route_trip_pattern_id, route_stop_id) do nothing;

create or replace function public.enforce_route_trip_pattern_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.tenant_id is distinct from old.tenant_id
    or new.route_id is distinct from old.route_id
    or new.direction is distinct from old.direction then
    raise exception 'A trip pattern tenant, route, and direction are immutable.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enforce_route_trip_pattern_identity
  before update of tenant_id, route_id, direction
  on public.route_trip_patterns
  for each row execute function public.enforce_route_trip_pattern_identity();

create or replace function public.validate_route_trip_pattern_pair()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_route_id uuid;
  v_pattern_count integer;
  v_direction_count integer;
begin
  if tg_table_name = 'routes' then
    v_route_id := new.id;
  elsif tg_op = 'DELETE' then
    v_route_id := old.route_id;
  else
    v_route_id := new.route_id;
  end if;

  -- Cascading pattern deletes after a route deletion are valid.
  if not exists (select 1 from public.routes where id = v_route_id) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  select
    count(*),
    count(distinct direction) filter (where direction in ('forward', 'reverse'))
  into v_pattern_count, v_direction_count
  from public.route_trip_patterns
  where route_id = v_route_id;

  if v_pattern_count <> 2 or v_direction_count <> 2 then
    raise exception 'Every route must have exactly one forward and one reverse trip pattern.'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create constraint trigger validate_route_trip_pattern_pair_on_route
  after insert or update on public.routes
  deferrable initially deferred
  for each row execute function public.validate_route_trip_pattern_pair();

create constraint trigger validate_route_trip_pattern_pair_on_pattern
  after insert or update or delete on public.route_trip_patterns
  deferrable initially deferred
  for each row execute function public.validate_route_trip_pattern_pair();

alter table public.driver_route_assignments
  add column route_trip_pattern_id uuid references public.route_trip_patterns(id) on delete restrict;

alter table public.bus_route_assignments
  add column route_trip_pattern_id uuid references public.route_trip_patterns(id) on delete restrict;

alter table public.student_bus_assignments
  add column route_trip_pattern_id uuid references public.route_trip_patterns(id) on delete restrict;

alter table public.driver_trips
  add column route_trip_pattern_id uuid references public.route_trip_patterns(id) on delete restrict,
  add column trip_name_snapshot text;

update public.driver_route_assignments dra
set route_trip_pattern_id = rtp.id
from public.route_trip_patterns rtp
where rtp.route_id = dra.route_id
  and rtp.tenant_id = dra.tenant_id
  and rtp.direction = case when dra.trip_type = 'evening' then 'reverse' else 'forward' end;

update public.bus_route_assignments bra
set route_trip_pattern_id = rtp.id
from public.route_trip_patterns rtp
where rtp.route_id = bra.route_id
  and rtp.tenant_id = bra.tenant_id
  and rtp.direction = case when bra.trip_type = 'evening' then 'reverse' else 'forward' end;

update public.student_bus_assignments sba
set route_trip_pattern_id = bra.route_trip_pattern_id
from public.bus_route_assignments bra
where bra.id = sba.bus_route_assignment_id
  and bra.tenant_id = sba.tenant_id;

update public.driver_trips dt
set
  route_trip_pattern_id = rtp.id,
  trip_name_snapshot = rtp.display_name
from public.route_trip_patterns rtp
where rtp.route_id = dt.route_id
  and rtp.tenant_id = dt.tenant_id
  and rtp.direction = case when dt.trip_type = 'evening' then 'reverse' else 'forward' end;

create index driver_route_assignments_pattern_idx
  on public.driver_route_assignments(route_trip_pattern_id);
create index bus_route_assignments_pattern_idx
  on public.bus_route_assignments(route_trip_pattern_id);
create index student_bus_assignments_pattern_idx
  on public.student_bus_assignments(route_trip_pattern_id);
create index driver_trips_pattern_idx
  on public.driver_trips(route_trip_pattern_id);

create or replace function public.route_definition_is_ready(p_route_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where rs.status = 'active') >= 2
    and count(*) filter (
      where rs.status = 'active'
        and (
          rs.latitude is null
          or rs.longitude is null
          or rs.latitude not between -90 and 90
          or rs.longitude not between -180 and 180
        )
    ) = 0
    and count(*) filter (where rs.status = 'active')
      = count(distinct rs.stop_order) filter (where rs.status = 'active')
    and coalesce(min(rs.stop_order) filter (where rs.status = 'active'), 0) = 1
    and coalesce(max(rs.stop_order) filter (where rs.status = 'active'), 0)
      = count(*) filter (where rs.status = 'active')
    and (
      select count(*) = 2
      from public.route_trip_patterns rtp
      where rtp.route_id = p_route_id
        and rtp.direction in ('forward', 'reverse')
    )
  from public.route_stops rs
  where rs.route_id = p_route_id;
$$;

update public.routes r
set definition_status = case
  when public.route_definition_is_ready(r.id) then 'ready'
  else 'incomplete'
end;

create or replace function public.validate_route_trip_reference()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pattern public.route_trip_patterns;
begin
  if new.route_trip_pattern_id is null then
    return new;
  end if;

  select * into v_pattern
  from public.route_trip_patterns
  where id = new.route_trip_pattern_id;

  if not found
    or v_pattern.tenant_id <> new.tenant_id
    or v_pattern.route_id <> new.route_id then
    raise exception 'Trip pattern must belong to the assignment route and tenant.'
      using errcode = '23514';
  end if;

  if tg_table_name = 'student_bus_assignments' then
    if not exists (
      select 1
      from public.bus_route_assignments bra
      where bra.id = new.bus_route_assignment_id
        and bra.tenant_id = new.tenant_id
        and bra.route_trip_pattern_id = new.route_trip_pattern_id
    ) then
      raise exception 'Student trip pattern must match the selected bus service.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger validate_driver_assignment_trip_pattern
  before insert or update of tenant_id, route_id, route_trip_pattern_id
  on public.driver_route_assignments
  for each row execute function public.validate_route_trip_reference();

create trigger validate_bus_assignment_trip_pattern
  before insert or update of tenant_id, route_id, route_trip_pattern_id
  on public.bus_route_assignments
  for each row execute function public.validate_route_trip_reference();

create trigger validate_driver_trip_pattern
  before insert or update of tenant_id, route_id, route_trip_pattern_id
  on public.driver_trips
  for each row execute function public.validate_route_trip_reference();

create or replace function public.validate_student_bus_trip_pattern()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.bus_route_assignments;
begin
  select * into v_assignment
  from public.bus_route_assignments
  where id = new.bus_route_assignment_id;

  if not found
    or v_assignment.tenant_id <> new.tenant_id
    or v_assignment.route_trip_pattern_id is distinct from new.route_trip_pattern_id then
    raise exception 'Student trip pattern must match the selected bus service.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_student_bus_assignment_trip_pattern
  before insert or update of tenant_id, bus_route_assignment_id, route_trip_pattern_id
  on public.student_bus_assignments
  for each row execute function public.validate_student_bus_trip_pattern();

create or replace function public.validate_route_trip_schedule_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.route_trip_patterns rtp
    join public.route_stops rs
      on rs.id = new.route_stop_id
      and rs.route_id = rtp.route_id
      and rs.tenant_id = rtp.tenant_id
    where rtp.id = new.route_trip_pattern_id
      and rtp.route_id = new.route_id
      and rtp.tenant_id = new.tenant_id
  ) then
    raise exception 'Trip schedule pattern and stop must belong to the same route and tenant.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_route_trip_schedule_scope
  before insert or update on public.route_trip_stop_schedules
  for each row execute function public.validate_route_trip_schedule_scope();

create or replace function public.validate_bus_trip_pattern_overlap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'active'
    and new.route_trip_pattern_id is not null
    and exists (
      select 1
      from public.bus_route_assignments existing
      where existing.id <> new.id
        and existing.tenant_id = new.tenant_id
        and existing.route_trip_pattern_id = new.route_trip_pattern_id
        and existing.status = 'active'
        and daterange(
          coalesce(existing.effective_from, '-infinity'::date),
          coalesce(existing.effective_to, 'infinity'::date),
          '[]'
        ) && daterange(
          coalesce(new.effective_from, '-infinity'::date),
          coalesce(new.effective_to, 'infinity'::date),
          '[]'
        )
    ) then
    raise exception 'This trip already has a bus assigned for the selected dates.'
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger validate_bus_trip_pattern_overlap
  before insert or update of route_trip_pattern_id, effective_from, effective_to, status
  on public.bus_route_assignments
  for each row execute function public.validate_bus_trip_pattern_overlap();

create or replace function public.validate_driver_trip_pattern_overlap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'active'
    and new.route_trip_pattern_id is not null
    and exists (
      select 1
      from public.driver_route_assignments existing
      where existing.id <> new.id
        and existing.tenant_id = new.tenant_id
        and existing.route_trip_pattern_id = new.route_trip_pattern_id
        and existing.status = 'active'
        and daterange(
          coalesce(existing.effective_from, '-infinity'::date),
          coalesce(existing.effective_to, 'infinity'::date),
          '[]'
        ) && daterange(
          coalesce(new.effective_from, '-infinity'::date),
          coalesce(new.effective_to, 'infinity'::date),
          '[]'
        )
    ) then
    raise exception 'This trip already has a driver assigned for the selected dates.'
      using errcode = '23P01';
  end if;
  return new;
end;
$$;

create trigger validate_driver_trip_pattern_overlap
  before insert or update of route_trip_pattern_id, effective_from, effective_to, status
  on public.driver_route_assignments
  for each row execute function public.validate_driver_trip_pattern_overlap();

create or replace function public.validate_new_trip_assignment_readiness()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'active'
    and new.route_trip_pattern_id is not null
    and (
      not public.route_definition_is_ready(new.route_id)
      or not exists (
        select 1
        from public.route_trip_patterns rtp
        where rtp.id = new.route_trip_pattern_id
          and rtp.route_id = new.route_id
          and rtp.tenant_id = new.tenant_id
          and rtp.status = 'active'
          and not rtp.schedule_review_required
      )
    ) then
    raise exception 'New assignments require a ready route and reviewed active trip.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_new_driver_trip_assignment_readiness
  before insert or update of route_trip_pattern_id, route_id, status on public.driver_route_assignments
  for each row execute function public.validate_new_trip_assignment_readiness();

create trigger validate_new_bus_trip_assignment_readiness
  before insert or update of route_trip_pattern_id, route_id, status on public.bus_route_assignments
  for each row execute function public.validate_new_trip_assignment_readiness();

create or replace function public.validate_student_trip_stop_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_direction text;
  v_route_id uuid;
  v_pickup_order integer;
  v_dropoff_order integer;
begin
  select rtp.direction, bra.route_id
  into v_direction, v_route_id
  from public.bus_route_assignments bra
  join public.route_trip_patterns rtp
    on rtp.id = bra.route_trip_pattern_id
    and rtp.route_id = bra.route_id
    and rtp.tenant_id = bra.tenant_id
  where bra.id = new.bus_route_assignment_id
    and bra.tenant_id = new.tenant_id;

  if v_direction is null then
    return new;
  end if;

  if new.pickup_stop_id is not null then
    select stop_order into v_pickup_order
    from public.route_stops
    where id = new.pickup_stop_id
      and route_id = v_route_id
      and tenant_id = new.tenant_id
      and status = 'active';
    if v_pickup_order is null then
      raise exception 'Pickup stop must be active on the selected trip route.'
        using errcode = '23514';
    end if;
  end if;

  if new.dropoff_stop_id is not null then
    select stop_order into v_dropoff_order
    from public.route_stops
    where id = new.dropoff_stop_id
      and route_id = v_route_id
      and tenant_id = new.tenant_id
      and status = 'active';
    if v_dropoff_order is null then
      raise exception 'Drop-off stop must be active on the selected trip route.'
        using errcode = '23514';
    end if;
  end if;

  if v_pickup_order is not null and v_dropoff_order is not null
    and (
      (v_direction = 'forward' and v_pickup_order > v_dropoff_order)
      or (v_direction = 'reverse' and v_pickup_order < v_dropoff_order)
    ) then
    raise exception 'Pickup and drop-off stops must follow the selected trip direction.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_student_trip_stop_order
  before insert or update of bus_route_assignment_id, pickup_stop_id, dropoff_stop_id
  on public.student_bus_assignments
  for each row execute function public.validate_student_trip_stop_order();

alter table public.route_trip_patterns enable row level security;
alter table public.route_trip_stop_schedules enable row level security;

create policy "route trip patterns select tenant operational roles"
  on public.route_trip_patterns for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in (
      'tenant_admin', 'school_admin', 'transportation_admin', 'driver'
    )
    and (
      public.current_user_role() <> 'school_admin'
      or exists (
        select 1 from public.routes r
        where r.id = route_trip_patterns.route_id
          and r.school_id = public.current_school_id()
      )
    )
  );

create policy "route trip patterns insert tenant admin"
  on public.route_trip_patterns for insert to authenticated
  with check (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.routes r
      where r.id = route_trip_patterns.route_id
        and r.tenant_id = route_trip_patterns.tenant_id
    )
  );

create policy "route trip patterns update tenant admin"
  on public.route_trip_patterns for update to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  )
  with check (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "route trip schedules select tenant operational roles"
  on public.route_trip_stop_schedules for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_user_role() in (
      'tenant_admin', 'school_admin', 'transportation_admin', 'driver'
    )
    and (
      public.current_user_role() <> 'school_admin'
      or exists (
        select 1 from public.routes r
        where r.id = route_trip_stop_schedules.route_id
          and r.school_id = public.current_school_id()
      )
    )
  );

create policy "route trip schedules insert tenant admin"
  on public.route_trip_stop_schedules for insert to authenticated
  with check (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "route trip schedules update tenant admin"
  on public.route_trip_stop_schedules for update to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  )
  with check (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "route trip schedules delete tenant admin"
  on public.route_trip_stop_schedules for delete to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

grant select, insert, update on public.route_trip_patterns to authenticated;
grant select, insert, update, delete on public.route_trip_stop_schedules to authenticated;

-- Atomic tenant-admin route definition writer.
create or replace function public.admin_save_route_definition(
  p_route jsonb,
  p_stops jsonb,
  p_trip_patterns jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_route_id uuid;
  v_school_id uuid;
  v_route_name text;
  v_route_code text;
  v_route_kind text;
  v_map_color text;
  v_status text;
  v_ready boolean;
  v_stop jsonb;
  v_pattern jsonb;
  v_stop_id uuid;
  v_pattern_id uuid;
  v_client_key text;
  v_stop_ids jsonb := '{}'::jsonb;
  v_active_count integer;
begin
  if auth.uid() is null
    or public.current_user_role() <> 'tenant_admin'
    or v_tenant_id is null then
    raise exception 'Only an active tenant administrator can save route definitions.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_route) <> 'object'
    or jsonb_typeof(p_stops) <> 'array'
    or jsonb_typeof(p_trip_patterns) <> 'array' then
    raise exception 'Route, stops, and trip patterns must use the documented JSON shape.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_route) key
    where key not in (
      'id', 'schoolId', 'routeName', 'routeCode', 'routeKind', 'mapColor', 'status'
    )
  ) then
    raise exception 'Route contains an unsupported field.' using errcode = '22023';
  end if;

  v_route_id := nullif(p_route->>'id', '')::uuid;
  v_school_id := nullif(p_route->>'schoolId', '')::uuid;
  v_route_name := btrim(coalesce(p_route->>'routeName', ''));
  v_route_code := btrim(coalesce(p_route->>'routeCode', ''));
  v_route_kind := coalesce(nullif(p_route->>'routeKind', ''), 'regular');
  v_map_color := upper(coalesce(nullif(p_route->>'mapColor', ''), '#2563EB'));
  v_status := coalesce(nullif(p_route->>'status', ''), 'inactive');

  if char_length(v_route_name) not between 1 and 100
    or char_length(v_route_code) not between 1 and 40 then
    raise exception 'Route name must be 1-100 characters and route code 1-40 characters.'
      using errcode = '22023';
  end if;
  if v_route_kind not in ('regular', 'field_trip')
    or v_status not in ('active', 'inactive', 'archived')
    or v_map_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Route kind, status, or map color is invalid.' using errcode = '22023';
  end if;
  if v_school_id is not null and not exists (
    select 1 from public.schools s
    where s.id = v_school_id and s.tenant_id = v_tenant_id and s.status = 'active'
  ) then
    raise exception 'Primary school must be active and belong to your tenant.'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.routes r
    where r.tenant_id = v_tenant_id
      and lower(r.route_code) = lower(v_route_code)
      and r.id is distinct from v_route_id
  ) then
    raise exception 'A route with this code already exists in your tenant.'
      using errcode = '23505';
  end if;
  if exists (
    select 1 from public.routes r
    where r.tenant_id = v_tenant_id
      and v_status = 'active'
      and r.status = 'active'
      and upper(r.map_color) = v_map_color
      and r.id is distinct from v_route_id
  ) then
    raise exception 'Choose a different color from the other active routes.'
      using errcode = '23505';
  end if;

  if v_route_id is null then
    insert into public.routes (
      tenant_id, school_id, route_name, route_code, route_type,
      route_kind, map_color, definition_status, status
    ) values (
      v_tenant_id, v_school_id, v_route_name, v_route_code,
      case when v_route_kind = 'field_trip' then 'field_trip' else 'special' end,
      v_route_kind, v_map_color, 'incomplete', 'inactive'
    )
    returning id into v_route_id;
  else
    if not exists (
      select 1 from public.routes r
      where r.id = v_route_id and r.tenant_id = v_tenant_id
    ) then
      raise exception 'Route not found in your tenant.' using errcode = 'P0002';
    end if;
    update public.routes
    set
      school_id = v_school_id,
      route_name = v_route_name,
      route_code = v_route_code,
      route_type = case when v_route_kind = 'field_trip' then 'field_trip' else 'special' end,
      route_kind = v_route_kind,
      map_color = v_map_color,
      status = 'inactive'
    where id = v_route_id and tenant_id = v_tenant_id;
  end if;

  if jsonb_array_length(p_stops) > 500 then
    raise exception 'A route cannot contain more than 500 stops.' using errcode = '22023';
  end if;

  -- Move existing orders out of the requested range so swaps/reordering do not
  -- trip the existing route/order unique constraint mid-transaction.
  update public.route_stops
  set stop_order = stop_order + 10000
  where route_id = v_route_id
    and tenant_id = v_tenant_id;

  for v_stop in select value from jsonb_array_elements(p_stops)
  loop
    if jsonb_typeof(v_stop) <> 'object'
      or exists (
        select 1 from jsonb_object_keys(v_stop) key
        where key not in (
          'id', 'clientKey', 'schoolId', 'stopName', 'stopOrder',
          'latitude', 'longitude', 'status'
        )
      ) then
      raise exception 'A stop contains an unsupported field.' using errcode = '22023';
    end if;

    v_client_key := btrim(coalesce(v_stop->>'clientKey', ''));
    if v_client_key = '' or char_length(v_client_key) > 100 then
      raise exception 'Every stop needs a stable client key.' using errcode = '22023';
    end if;
    if v_stop_ids ? v_client_key then
      raise exception 'Stop client keys must be unique.' using errcode = '22023';
    end if;
    if char_length(btrim(coalesce(v_stop->>'stopName', ''))) not between 1 and 120
      or coalesce((v_stop->>'stopOrder')::integer, 0) <= 0
      or coalesce(v_stop->>'status', 'active') not in ('active', 'inactive') then
      raise exception 'Each stop needs a valid name, order, and status.'
        using errcode = '22023';
    end if;
    if nullif(v_stop->>'latitude', '') is not null
      and (v_stop->>'latitude')::numeric not between -90 and 90 then
      raise exception 'Stop latitude must be between -90 and 90.' using errcode = '22023';
    end if;
    if nullif(v_stop->>'longitude', '') is not null
      and (v_stop->>'longitude')::numeric not between -180 and 180 then
      raise exception 'Stop longitude must be between -180 and 180.' using errcode = '22023';
    end if;
    v_school_id := nullif(v_stop->>'schoolId', '')::uuid;
    if v_school_id is not null and not exists (
      select 1 from public.schools s
      where s.id = v_school_id and s.tenant_id = v_tenant_id and s.status = 'active'
    ) then
      raise exception 'A stop school is outside your tenant or inactive.'
        using errcode = '23514';
    end if;

    v_stop_id := nullif(v_stop->>'id', '')::uuid;
    if v_stop_id is null then
      insert into public.route_stops (
        tenant_id, route_id, school_id, stop_name, stop_order,
        planned_arrival_time, latitude, longitude, status
      ) values (
        v_tenant_id, v_route_id, v_school_id, btrim(v_stop->>'stopName'),
        (v_stop->>'stopOrder')::integer, null,
        nullif(v_stop->>'latitude', '')::numeric,
        nullif(v_stop->>'longitude', '')::numeric,
        coalesce(v_stop->>'status', 'active')
      )
      returning id into v_stop_id;
    else
      update public.route_stops
      set
        school_id = v_school_id,
        stop_name = btrim(v_stop->>'stopName'),
        stop_order = (v_stop->>'stopOrder')::integer,
        latitude = nullif(v_stop->>'latitude', '')::numeric,
        longitude = nullif(v_stop->>'longitude', '')::numeric,
        status = coalesce(v_stop->>'status', 'active')
      where id = v_stop_id
        and route_id = v_route_id
        and tenant_id = v_tenant_id;
      if not found then
        raise exception 'A stop does not belong to this route.' using errcode = '23514';
      end if;
    end if;
    v_stop_ids := v_stop_ids || jsonb_build_object(v_client_key, v_stop_id);
  end loop;

  update public.route_stops
  set status = 'archived'
  where route_id = v_route_id
    and tenant_id = v_tenant_id
    and status <> 'archived'
    and not (id = any (
      select value::text::uuid
      from jsonb_each_text(v_stop_ids)
    ));

  if jsonb_array_length(p_trip_patterns) <> 2
    or (
      select count(distinct value->>'direction')
      from jsonb_array_elements(p_trip_patterns)
    ) <> 2
    or exists (
      select 1 from jsonb_array_elements(p_trip_patterns)
      where value->>'direction' not in ('forward', 'reverse')
    ) then
    raise exception 'Provide exactly one forward and one reverse trip.'
      using errcode = '22023';
  end if;

  for v_pattern in select value from jsonb_array_elements(p_trip_patterns)
  loop
    if jsonb_typeof(v_pattern) <> 'object'
      or exists (
        select 1 from jsonb_object_keys(v_pattern) key
        where key not in (
          'id', 'direction', 'displayName', 'status', 'stopTimes'
        )
      ) then
      raise exception 'A trip pattern contains an unsupported field.'
        using errcode = '22023';
    end if;
    if char_length(btrim(coalesce(v_pattern->>'displayName', ''))) not between 1 and 100
      or coalesce(v_pattern->>'status', 'active') not in ('active', 'inactive')
      or jsonb_typeof(coalesce(v_pattern->'stopTimes', '{}'::jsonb)) <> 'object' then
      raise exception 'Trip name, status, or stop times are invalid.'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_object_keys(coalesce(v_pattern->'stopTimes', '{}'::jsonb)) key
      where not (v_stop_ids ? key)
    ) then
      raise exception 'A trip time references a stop outside this route.'
        using errcode = '23514';
    end if;

    select id into v_pattern_id
    from public.route_trip_patterns
    where route_id = v_route_id
      and tenant_id = v_tenant_id
      and direction = v_pattern->>'direction'
    for update;

    if not found then
      insert into public.route_trip_patterns (
        tenant_id, route_id, direction, display_name, status,
        schedule_review_required
      ) values (
        v_tenant_id, v_route_id, v_pattern->>'direction',
        btrim(v_pattern->>'displayName'), coalesce(v_pattern->>'status', 'active'),
        false
      )
      returning id into v_pattern_id;
    else
      update public.route_trip_patterns
      set
        display_name = btrim(v_pattern->>'displayName'),
        status = coalesce(v_pattern->>'status', 'active'),
        schedule_review_required = false
      where id = v_pattern_id;
    end if;

    insert into public.route_trip_stop_schedules (
      tenant_id, route_id, route_trip_pattern_id, route_stop_id,
      planned_arrival_time
    )
    select
      v_tenant_id,
      v_route_id,
      v_pattern_id,
      (entry.value #>> '{}')::uuid,
      nullif(v_pattern->'stopTimes'->>entry.key, '')::time
    from jsonb_each(v_stop_ids) entry
    on conflict (route_trip_pattern_id, route_stop_id)
    do update set planned_arrival_time = excluded.planned_arrival_time;

    delete from public.route_trip_stop_schedules schedule
    where schedule.route_trip_pattern_id = v_pattern_id
      and not (schedule.route_stop_id = any (
        select value::text::uuid
        from jsonb_each_text(v_stop_ids)
      ));
  end loop;

  select count(*) into v_active_count
  from public.route_stops
  where route_id = v_route_id and status = 'active';

  v_ready := public.route_definition_is_ready(v_route_id);
  if v_status = 'active' and not v_ready then
    raise exception 'An active route requires at least two ordered stops with valid coordinates.'
      using errcode = '23514';
  end if;

  update public.routes
  set
    definition_status = case when v_ready then 'ready' else 'incomplete' end,
    status = case when v_status = 'active' and v_ready then 'active' else v_status end
  where id = v_route_id and tenant_id = v_tenant_id;

  return jsonb_build_object(
    'routeId', v_route_id,
    'definitionStatus', case when v_ready then 'ready' else 'incomplete' end,
    'activeStopCount', v_active_count
  );
end;
$$;

comment on function public.admin_save_route_definition(jsonb, jsonb, jsonb) is
  'Atomically creates or updates a tenant route, its ordered coordinate stops, two directional trip patterns, and direction-specific stop schedules. Tenant scope is derived from the active authenticated tenant_admin profile.';

revoke all on function public.admin_save_route_definition(jsonb, jsonb, jsonb) from public;
revoke all on function public.admin_save_route_definition(jsonb, jsonb, jsonb) from anon;
grant execute on function public.admin_save_route_definition(jsonb, jsonb, jsonb) to authenticated;

drop function if exists public.get_admin_bus_services();
create function public.get_admin_bus_services()
returns table (
  id uuid,
  tenant_id uuid,
  bus_id uuid,
  route_id uuid,
  route_trip_pattern_id uuid,
  trip_type text,
  trip_name text,
  direction text,
  effective_from date,
  effective_to date,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  bus_number text,
  route_name text,
  route_code text
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  select
    bra.id,
    bra.tenant_id,
    bra.bus_id,
    bra.route_id,
    bra.route_trip_pattern_id,
    bra.trip_type,
    coalesce(rtp.display_name, bra.trip_type),
    coalesce(
      rtp.direction,
      case when bra.trip_type = 'evening' then 'reverse' else 'forward' end
    ),
    bra.effective_from,
    bra.effective_to,
    bra.status,
    bra.created_at,
    bra.updated_at,
    b.bus_number,
    r.route_name,
    r.route_code
  from public.bus_route_assignments bra
  join public.buses b on b.id = bra.bus_id and b.tenant_id = bra.tenant_id
  join public.routes r on r.id = bra.route_id and r.tenant_id = bra.tenant_id
  left join public.route_trip_patterns rtp
    on rtp.id = bra.route_trip_pattern_id
    and rtp.route_id = bra.route_id
    and rtp.tenant_id = bra.tenant_id
  where public.is_transportation_write_admin()
    and bra.tenant_id = public.current_tenant_id()
    and bra.status = 'active'
    and b.status = 'active'
    and r.status = 'active'
  order by b.bus_number, r.route_code, coalesce(rtp.direction, bra.trip_type);
$$;

revoke all on function public.get_admin_bus_services() from public;
revoke all on function public.get_admin_bus_services() from anon;
grant execute on function public.get_admin_bus_services() to authenticated;

create or replace function public.get_admin_student_bus_assignments_page(
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default '',
  p_status text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
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
    select
      a.*,
      concat_ws(' ', s.first_name, s.last_name) as student_name,
      b.bus_number,
      r.route_name,
      r.route_code,
      bra.trip_type,
      coalesce(rtp.display_name, bra.trip_type) as trip_name,
      coalesce(
        rtp.direction,
        case when bra.trip_type = 'evening' then 'reverse' else 'forward' end
      ) as direction,
      ps.stop_name as pickup_stop_name,
      ds.stop_name as dropoff_stop_name
    from public.student_bus_assignments a
    join public.students s on s.id = a.student_id
    join public.bus_route_assignments bra on bra.id = a.bus_route_assignment_id
    join public.buses b on b.id = bra.bus_id
    join public.routes r on r.id = bra.route_id
    left join public.route_trip_patterns rtp
      on rtp.id = bra.route_trip_pattern_id
      and rtp.route_id = bra.route_id
      and rtp.tenant_id = bra.tenant_id
    left join public.route_stops ps on ps.id = a.pickup_stop_id
    left join public.route_stops ds on ds.id = a.dropoff_stop_id
    where a.tenant_id = v_tenant
      and (p_status is null or a.status = p_status)
      and (
        trim(coalesce(p_search, '')) = ''
        or lower(concat_ws(
          ' ',
          s.first_name,
          s.last_name,
          b.bus_number,
          r.route_name,
          r.route_code,
          coalesce(rtp.display_name, bra.trip_type),
          ps.stop_name,
          ds.stop_name,
          a.status
        )) like v_search
      )
  ), page_rows as (
    select *
    from filtered
    order by created_at desc, id
    limit v_size offset ((v_page - 1) * v_size)
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb),
    'totalCount', (select count(*) from filtered),
    'page', v_page,
    'pageSize', v_size
  )
  into v_result
  from page_rows;

  return v_result;
end;
$$;

revoke all on function public.get_admin_student_bus_assignments_page(integer, integer, text, text) from public;
revoke all on function public.get_admin_student_bus_assignments_page(integer, integer, text, text) from anon;
grant execute on function public.get_admin_student_bus_assignments_page(integer, integer, text, text) to authenticated;

-- Static operational geometry is intentionally separate from high-frequency
-- live-location reads so the frontend can cache it.
create or replace function public.get_admin_live_route_overlays()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(route_overlay order by route_overlay->>'routeCode'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'routeId', r.id,
      'routeCode', r.route_code,
      'routeName', r.route_name,
      'routeKind', r.route_kind,
      'mapColor', r.map_color,
      'tripPatternId', rtp.id,
      'tripName', rtp.display_name,
      'direction', rtp.direction,
      'stops', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', rs.id,
          'name', rs.stop_name,
          'order', rs.stop_order,
          'latitude', rs.latitude,
          'longitude', rs.longitude,
          'plannedArrivalTime', rtss.planned_arrival_time
        ) order by
          case when rtp.direction = 'forward' then rs.stop_order end asc,
          case when rtp.direction = 'reverse' then rs.stop_order end desc
        ), '[]'::jsonb)
        from public.route_stops rs
        left join public.route_trip_stop_schedules rtss
          on rtss.route_trip_pattern_id = rtp.id
          and rtss.route_stop_id = rs.id
        where rs.route_id = r.id
          and rs.tenant_id = r.tenant_id
          and rs.status = 'active'
          and rs.latitude is not null
          and rs.longitude is not null
      )
    ) as route_overlay
    from public.driver_trips dt
    join public.routes r
      on r.id = dt.route_id and r.tenant_id = dt.tenant_id
    join public.route_trip_patterns rtp
      on rtp.id = dt.route_trip_pattern_id
      and rtp.route_id = r.id
      and rtp.tenant_id = r.tenant_id
    where auth.uid() is not null
      and public.current_user_role() in (
        'tenant_admin', 'school_admin', 'transportation_admin'
      )
      and dt.status = 'active'
      and dt.tenant_id = public.current_tenant_id()
      and (
        public.current_user_role() <> 'school_admin'
        or r.school_id = public.current_school_id()
      )
    group by r.id, r.route_code, r.route_name, r.route_kind, r.map_color,
      rtp.id, rtp.display_name, rtp.direction
  ) overlays;
$$;

create or replace function public.get_guardian_live_route_overlays()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(route_overlay order by route_overlay->>'studentId'), '[]'::jsonb)
  from (
    select distinct jsonb_build_object(
      'studentId', s.id,
      'routeName', r.route_name,
      'routeCode', r.route_code,
      'mapColor', r.map_color,
      'tripName', rtp.display_name,
      'direction', rtp.direction,
      'stops', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'name', rs.stop_name,
          'order', rs.stop_order,
          'latitude', rs.latitude,
          'longitude', rs.longitude,
          'plannedArrivalTime', rtss.planned_arrival_time
        ) order by
          case when rtp.direction = 'forward' then rs.stop_order end asc,
          case when rtp.direction = 'reverse' then rs.stop_order end desc
        ), '[]'::jsonb)
        from public.route_stops rs
        left join public.route_trip_stop_schedules rtss
          on rtss.route_trip_pattern_id = rtp.id
          and rtss.route_stop_id = rs.id
        where rs.route_id = r.id
          and rs.tenant_id = r.tenant_id
          and rs.status = 'active'
          and rs.latitude is not null
          and rs.longitude is not null
      )
    ) as route_overlay
    from public.students s
    join public.student_guardians sg
      on sg.student_id = s.id
      and sg.guardian_id = public.current_guardian_id()
      and sg.tenant_id = s.tenant_id
      and sg.status = 'active'
    join public.student_route_assignments sra
      on sra.student_id = s.id
      and sra.tenant_id = s.tenant_id
      and sra.status = 'active'
    join public.routes r
      on r.id = sra.route_id and r.tenant_id = s.tenant_id
    join public.driver_trips dt
      on dt.route_id = r.id
      and dt.tenant_id = r.tenant_id
      and dt.status = 'active'
    join public.route_trip_patterns rtp
      on rtp.id = dt.route_trip_pattern_id
      and rtp.route_id = r.id
      and rtp.tenant_id = r.tenant_id
    where auth.uid() is not null
      and public.current_user_role() = 'guardian'
      and public.current_guardian_id() is not null
      and s.status = 'active'
      and s.tenant_id = public.current_tenant_id()
  ) overlays;
$$;

revoke all on function public.get_admin_live_route_overlays() from public;
revoke all on function public.get_admin_live_route_overlays() from anon;
grant execute on function public.get_admin_live_route_overlays() to authenticated;

revoke all on function public.get_guardian_live_route_overlays() from public;
revoke all on function public.get_guardian_live_route_overlays() from anon;
grant execute on function public.get_guardian_live_route_overlays() to authenticated;

comment on function public.get_guardian_live_route_overlays() is
  'Returns static geometry only for active routes currently serving students actively linked to the authenticated guardian. Excludes bus IDs, driver data, tenant IDs, other students, and location history.';

-- Start new driver trips from the immutable pattern on the assignment. The
-- legacy trip_type remains populated for backward compatibility.
create or replace function public.start_driver_trip_from_assignment(p_assignment_id uuid)
returns public.driver_trips
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assignment public.driver_route_assignments;
  v_pattern public.route_trip_patterns;
  v_trip public.driver_trips;
begin
  if public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can start a trip.' using errcode = '42501';
  end if;

  select * into v_assignment
  from public.driver_route_assignments
  where id = p_assignment_id
  for update;

  if not found then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;
  if v_assignment.tenant_id <> public.current_tenant_id()
    or v_assignment.driver_id <> public.current_driver_id() then
    raise exception 'This assignment does not belong to the current driver.'
      using errcode = '42501';
  end if;
  if v_assignment.status <> 'active'
    or (v_assignment.effective_from is not null and v_assignment.effective_from > current_date)
    or (v_assignment.effective_to is not null and v_assignment.effective_to < current_date) then
    raise exception 'This assignment is not active today.' using errcode = '55006';
  end if;
  if not exists (
    select 1
    from public.drivers d
    join public.buses b
      on b.id = v_assignment.bus_id
      and b.tenant_id = v_assignment.tenant_id
      and b.status = 'active'
    join public.routes r
      on r.id = v_assignment.route_id
      and r.tenant_id = v_assignment.tenant_id
      and r.status = 'active'
    where d.id = v_assignment.driver_id
      and d.tenant_id = v_assignment.tenant_id
      and d.status = 'active'
  ) then
    raise exception 'The assigned driver, bus, or route is not active.'
      using errcode = '55006';
  end if;

  select * into v_pattern
  from public.route_trip_patterns
  where id = v_assignment.route_trip_pattern_id
    and route_id = v_assignment.route_id
    and tenant_id = v_assignment.tenant_id
    and status = 'active';

  if not found then
    raise exception 'This assignment does not have an active trip pattern.'
      using errcode = '55006';
  end if;

  begin
    insert into public.driver_trips (
      tenant_id, driver_id, bus_id, route_id, route_trip_pattern_id,
      trip_name_snapshot, trip_type, status, service_date, started_at
    ) values (
      v_assignment.tenant_id, v_assignment.driver_id, v_assignment.bus_id,
      v_assignment.route_id, v_pattern.id, v_pattern.display_name,
      case when v_pattern.direction = 'reverse' then 'evening' else 'morning' end,
      'active', current_date, now()
    )
    returning * into v_trip;
  exception
    when unique_violation then
      raise exception 'The driver or bus already has an active trip.'
        using errcode = '55006';
  end;

  return v_trip;
end;
$$;

revoke all on function public.start_driver_trip_from_assignment(uuid) from public;
revoke all on function public.start_driver_trip_from_assignment(uuid) from anon;
grant execute on function public.start_driver_trip_from_assignment(uuid) to authenticated;

-- Pattern-aware ETA entrypoint. The established conservative calculation is
-- retained, but direction is now resolved from the immutable pattern rather
-- than accepted from the browser.
create or replace function public.calculate_safe_route_eta(
  p_route_id uuid,
  p_target_stop_id uuid,
  p_route_trip_pattern_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_speed_mps double precision,
  p_recorded_at timestamptz
)
returns table (
  eta_status text,
  eta_min_minutes integer,
  eta_max_minutes integer,
  eta_label text,
  target_stop_name text,
  target_stop_order integer,
  next_stop_name text,
  next_stop_order integer,
  progress_label text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select eta.*
  from public.route_trip_patterns rtp
  cross join lateral public.calculate_safe_route_eta(
    p_route_id,
    p_target_stop_id,
    case when rtp.direction = 'reverse' then 'evening' else 'morning' end,
    p_latitude,
    p_longitude,
    p_speed_mps,
    p_recorded_at
  ) eta
  where rtp.id = p_route_trip_pattern_id
    and rtp.route_id = p_route_id;
$$;

create or replace function public.get_admin_live_fleet_monitoring()
returns table (
  bus_label text,
  route_name text,
  driver_name text,
  trip_type text,
  status text,
  started_at timestamptz,
  latest_latitude double precision,
  latest_longitude double precision,
  latest_location_at timestamptz,
  speed_mps double precision,
  location_status text,
  issue_label text,
  next_stop_name text,
  eta_status text,
  eta_label text,
  eta_updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    b.bus_number,
    r.route_name,
    p.full_name,
    rtp.display_name,
    dt.status,
    dt.started_at,
    loc.latitude,
    loc.longitude,
    loc.recorded_at,
    loc.speed_mps,
    case
      when loc.recorded_at is null then 'missing'
      when loc.recorded_at > now() + interval '30 seconds' then 'invalid'
      when loc.recorded_at < now() - interval '2 minutes' then 'stale'
      else 'live'
    end,
    case
      when loc.recorded_at is null then 'Missing GPS'
      when loc.recorded_at > now() + interval '30 seconds' then 'Needs attention'
      when loc.recorded_at < now() - interval '2 minutes' then 'Stale GPS'
      when eta.eta_status is distinct from 'available' then 'Needs attention'
      when loc.speed_mps is null then 'Speed unavailable'
      else 'OK'
    end,
    eta.next_stop_name,
    eta.eta_status,
    eta.eta_label,
    case when eta.eta_status = 'available' then loc.recorded_at else null end
  from public.driver_trips dt
  join public.drivers d
    on d.id = dt.driver_id and d.tenant_id = dt.tenant_id
  join public.profiles p
    on p.id = d.profile_id and p.tenant_id = dt.tenant_id
  join public.buses b
    on b.id = dt.bus_id and b.tenant_id = dt.tenant_id
  join public.routes r
    on r.id = dt.route_id and r.tenant_id = dt.tenant_id
  join public.route_trip_patterns rtp
    on rtp.id = dt.route_trip_pattern_id
    and rtp.route_id = dt.route_id
    and rtp.tenant_id = dt.tenant_id
  left join public.driver_trip_current_locations loc
    on loc.driver_trip_id = dt.id
    and loc.tenant_id = dt.tenant_id
    and loc.driver_id = dt.driver_id
    and loc.bus_id = dt.bus_id
    and loc.route_id = dt.route_id
  left join lateral (
    select rs.id
    from public.route_stops rs
    where rs.route_id = dt.route_id and rs.status = 'active'
    order by
      case when rtp.direction = 'forward' then rs.stop_order end asc,
      case when rtp.direction = 'reverse' then rs.stop_order end desc
    limit 1
  ) target on true
  left join lateral public.calculate_safe_route_eta(
    dt.route_id,
    target.id,
    rtp.id,
    loc.latitude,
    loc.longitude,
    loc.speed_mps,
    loc.recorded_at
  ) eta on true
  where dt.status = 'active'
    and auth.uid() is not null
    and dt.tenant_id = public.current_tenant_id()
    and public.current_user_role() in (
      'tenant_admin', 'school_admin', 'transportation_admin'
    )
    and (
      public.current_user_role() <> 'school_admin'
      or r.school_id = public.current_school_id()
    )
  order by
    case
      when loc.recorded_at is null then 0
      when loc.recorded_at < now() - interval '2 minutes' then 1
      else 2
    end,
    dt.started_at desc;
$$;

create or replace function public.get_guardian_live_trip_visibility()
returns table (
  student_id uuid,
  student_name text,
  route_id uuid,
  route_name text,
  pickup_stop_name text,
  dropoff_stop_name text,
  relevant_stop_name text,
  trip_status text,
  has_active_trip boolean,
  last_location_latitude double precision,
  last_location_longitude double precision,
  last_location_recorded_at timestamptz,
  eta_status text,
  eta_min_minutes integer,
  eta_max_minutes integer,
  eta_label text,
  eta_updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    s.first_name || ' ' || s.last_name,
    r.id,
    r.route_name,
    ps.stop_name,
    ds.stop_name,
    case when trip.direction = 'reverse' then ds.stop_name else ps.stop_name end,
    trip.status,
    trip.id is not null,
    loc.latitude,
    loc.longitude,
    loc.recorded_at,
    case when trip.id is null then 'waiting_for_trip' else eta.eta_status end,
    eta.eta_min_minutes,
    eta.eta_max_minutes,
    case
      when trip.id is null then 'Waiting for the trip to start'
      else eta.eta_label
    end,
    case when eta.eta_status = 'available' then loc.recorded_at else null end
  from public.students s
  join public.student_guardians sg
    on sg.student_id = s.id
    and sg.guardian_id = public.current_guardian_id()
    and sg.status = 'active'
    and sg.tenant_id = s.tenant_id
  join public.student_route_assignments sra
    on sra.student_id = s.id
    and sra.status = 'active'
    and sra.tenant_id = s.tenant_id
  join public.routes r
    on r.id = sra.route_id and r.tenant_id = s.tenant_id
  left join public.route_stops ps
    on ps.id = sra.pickup_stop_id
    and ps.tenant_id = s.tenant_id
    and ps.route_id = r.id
    and ps.status = 'active'
  left join public.route_stops ds
    on ds.id = sra.dropoff_stop_id
    and ds.tenant_id = s.tenant_id
    and ds.route_id = r.id
    and ds.status = 'active'
  left join lateral (
    select
      dt.id,
      dt.status,
      dt.started_at,
      dt.bus_id,
      dt.route_id,
      dt.driver_id,
      dt.route_trip_pattern_id,
      rtp.direction
    from public.driver_trips dt
    join public.route_trip_patterns rtp
      on rtp.id = dt.route_trip_pattern_id
      and rtp.route_id = dt.route_id
      and rtp.tenant_id = dt.tenant_id
    join public.buses b
      on b.id = dt.bus_id and b.tenant_id = s.tenant_id and b.status = 'active'
    join public.drivers d
      on d.id = dt.driver_id and d.tenant_id = s.tenant_id and d.status = 'active'
    where dt.route_id = r.id
      and dt.tenant_id = s.tenant_id
      and dt.status = 'active'
    order by dt.started_at desc
    limit 1
  ) trip on true
  left join public.driver_trip_current_locations loc
    on loc.driver_trip_id = trip.id
    and loc.tenant_id = s.tenant_id
    and loc.route_id = r.id
    and loc.bus_id = trip.bus_id
    and loc.driver_id = trip.driver_id
  left join lateral public.calculate_safe_route_eta(
    r.id,
    case when trip.direction = 'reverse' then sra.dropoff_stop_id else sra.pickup_stop_id end,
    trip.route_trip_pattern_id,
    loc.latitude,
    loc.longitude,
    loc.speed_mps,
    loc.recorded_at
  ) eta on trip.id is not null
  where s.status = 'active'
    and s.tenant_id = public.current_tenant_id()
    and auth.uid() is not null
    and public.current_user_role() = 'guardian'
    and public.current_guardian_id() is not null
    and public.current_tenant_id() is not null
  order by s.last_name, s.first_name, r.route_name;
$$;

revoke all on function public.calculate_safe_route_eta(uuid, uuid, uuid, double precision, double precision, double precision, timestamptz) from public;
revoke all on function public.calculate_safe_route_eta(uuid, uuid, uuid, double precision, double precision, double precision, timestamptz) from anon;
revoke all on function public.calculate_safe_route_eta(uuid, uuid, uuid, double precision, double precision, double precision, timestamptz) from authenticated;

-- ETA calculation helpers are internal to the scoped admin/guardian visibility
-- RPCs. They must not be callable with arbitrary cross-tenant route IDs.
revoke all on function public.calculate_safe_route_eta(uuid, uuid, text, double precision, double precision, double precision, timestamptz) from public;
revoke all on function public.calculate_safe_route_eta(uuid, uuid, text, double precision, double precision, double precision, timestamptz) from anon;
revoke all on function public.calculate_safe_route_eta(uuid, uuid, text, double precision, double precision, double precision, timestamptz) from authenticated;

revoke all on function public.get_admin_live_fleet_monitoring() from public;
revoke all on function public.get_admin_live_fleet_monitoring() from anon;
grant execute on function public.get_admin_live_fleet_monitoring() to authenticated;

revoke all on function public.get_guardian_live_trip_visibility() from public;
revoke all on function public.get_guardian_live_trip_visibility() from anon;
grant execute on function public.get_guardian_live_trip_visibility() to authenticated;

-- Trigger functions are not public RPC interfaces.
revoke all on function public.validate_route_trip_reference() from public, anon;
revoke all on function public.enforce_route_trip_pattern_identity() from public, anon;
revoke all on function public.validate_route_trip_pattern_pair() from public, anon;
revoke all on function public.validate_student_bus_trip_pattern() from public, anon;
revoke all on function public.validate_route_trip_schedule_scope() from public, anon;
revoke all on function public.validate_bus_trip_pattern_overlap() from public, anon;
revoke all on function public.validate_driver_trip_pattern_overlap() from public, anon;
revoke all on function public.validate_new_trip_assignment_readiness() from public, anon;
revoke all on function public.validate_student_trip_stop_order() from public, anon;

revoke all on function public.route_definition_is_ready(uuid) from public, anon;
grant execute on function public.route_definition_is_ready(uuid) to authenticated;
