-- Prepared, unapplied. Requires reviewed hosted reconciliation, recovery evidence,
-- rollback-only rehearsal and protected approval. Never replay migration history.
create extension if not exists btree_gist with schema extensions;
set search_path = pg_catalog, public, extensions;

alter table public.student_bus_assignments
  add column seat_number integer,
  add constraint student_bus_assignments_seat_positive check (seat_number > 0),
  add constraint student_bus_assignments_seat_overlap exclude using gist (
    tenant_id with =,
    bus_route_assignment_id with =,
    seat_number with =,
    daterange(effective_from, effective_to, '[]') with &&
  ) where (status = 'active' and seat_number is not null);

-- Use the API's READ COMMITTED isolation. A snapshot-isolated capacity editor
-- could otherwise miss a reservation committed while waiting for the bus lock.
create function safebus_private.validate_student_seat_capacity()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
declare v_capacity integer; v_bus_id uuid; v_check boolean;
begin
  if new.seat_number is null then return new; end if;
  v_check := new.status = 'active' and (new.effective_to is null or new.effective_to >= current_date);
  if tg_op = 'INSERT' then v_check := true;
  elsif new.seat_number is distinct from old.seat_number
     or new.bus_route_assignment_id is distinct from old.bus_route_assignment_id then v_check := true;
  end if;
  if not v_check then return new; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Seat and capacity changes require READ COMMITTED isolation.' using errcode = '0A000';
  end if;
  select bra.bus_id into v_bus_id from public.bus_route_assignments bra
    where bra.id = new.bus_route_assignment_id and bra.tenant_id = new.tenant_id for share;
  select b.capacity into v_capacity from public.buses b
    where b.id = v_bus_id and b.tenant_id = new.tenant_id for update;
  if not found then raise exception 'Bus service is not available.' using errcode = '23514'; end if;
  if v_capacity is not null and new.seat_number > v_capacity then
    raise exception 'Seat number exceeds this bus capacity.'
      using errcode = '23514', constraint = 'student_seat_bus_capacity';
  end if;
  return new;
end;
$$;
revoke all on function safebus_private.validate_student_seat_capacity() from public, anon, authenticated, service_role;
create trigger validate_student_seat_capacity before insert or update on public.student_bus_assignments
  for each row execute function safebus_private.validate_student_seat_capacity();

create function safebus_private.validate_bus_capacity_reservations()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
begin
  if new.capacity is null or new.capacity is not distinct from old.capacity then return new; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Seat and capacity changes require READ COMMITTED isolation.' using errcode = '0A000';
  end if;
  -- UPDATE already owns the bus row lock used by the assignment trigger.
  if exists (
    select 1 from public.student_bus_assignments sba
    join public.bus_route_assignments bra on bra.id = sba.bus_route_assignment_id and bra.tenant_id = sba.tenant_id
    where bra.bus_id = new.id and bra.tenant_id = new.tenant_id and bra.status = 'active'
      and (bra.effective_to is null or bra.effective_to >= current_date)
      and sba.status = 'active' and (sba.effective_to is null or sba.effective_to >= current_date)
      and sba.seat_number > new.capacity
  ) then
    raise exception 'Bus capacity cannot be lower than a currently or future reserved seat.'
      using errcode = '23514', constraint = 'bus_capacity_reserved_seat';
  end if;
  return new;
end;
$$;
revoke all on function safebus_private.validate_bus_capacity_reservations() from public, anon, authenticated, service_role;
create trigger validate_bus_capacity_reservations before update of capacity on public.buses
  for each row execute function safebus_private.validate_bus_capacity_reservations();

-- Cover service reparenting/reactivation as well as student-row writes.
create function safebus_private.validate_bus_service_seat_capacity()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
declare v_capacity integer;
begin
  if new.status <> 'active' or (new.effective_to is not null and new.effective_to < current_date) then return new; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Seat and capacity changes require READ COMMITTED isolation.' using errcode = '0A000';
  end if;
  select b.capacity into v_capacity from public.buses b
    where b.id = new.bus_id and b.tenant_id = new.tenant_id for update;
  if exists (select 1 from public.student_bus_assignments sba
    where sba.bus_route_assignment_id = new.id and sba.status = 'active'
      and (sba.effective_to is null or sba.effective_to >= current_date) and sba.seat_number > v_capacity) then
    raise exception 'Seat number exceeds this bus capacity.'
      using errcode = '23514', constraint = 'student_seat_bus_capacity';
  end if;
  return new;
end;
$$;
revoke all on function safebus_private.validate_bus_service_seat_capacity() from public, anon, authenticated, service_role;
create trigger validate_bus_service_seat_capacity before update of bus_id, tenant_id, status, effective_to on public.bus_route_assignments
  for each row execute function safebus_private.validate_bus_service_seat_capacity();

create or replace function public.admin_set_student_bus_service_with_seat(
  p_student_id uuid,
  p_bus_id uuid,
  p_route_id uuid,
  p_seat_number integer,
  p_direction_scope text default 'both',
  p_forward_pickup_stop_id uuid default null,
  p_forward_dropoff_stop_id uuid default null,
  p_reverse_pickup_stop_id uuid default null,
  p_reverse_dropoff_stop_id uuid default null,
  p_effective_from date default current_date,
  p_effective_to date default null,
  p_existing_assignment_ids uuid[] default array[]::uuid[]
)
returns setof public.student_bus_assignments
language plpgsql
security definer
set search_path = pg_catalog, public, safebus_private, pg_temp
as $$
declare
  v_tenant_id uuid := safebus_private.current_tenant_id();
  v_existing_ids uuid[] := coalesce(p_existing_assignment_ids, array[]::uuid[]);
  v_pattern public.route_trip_patterns;
  v_bus_service public.bus_route_assignments;
  v_assignment public.student_bus_assignments;
  v_pickup_stop_id uuid;
  v_dropoff_stop_id uuid;
begin
  if auth.uid() is null
    or v_tenant_id is null
    or not safebus_private.is_transportation_write_admin() then
    raise exception 'Admin tenant context is required.' using errcode = '42501';
  end if;
  if p_direction_scope is null or p_direction_scope not in ('both', 'forward', 'reverse') then
    raise exception 'Direction scope must be both, forward, or reverse.' using errcode = '22023';
  end if;
  if p_effective_from is null
    or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'Use a valid student service date range.' using errcode = '22007';
  end if;

  if (select count(*) from public.route_trip_patterns rtp
      where rtp.route_id = p_route_id and rtp.tenant_id = v_tenant_id
        and rtp.status = 'active' and not rtp.schedule_review_required
        and (p_direction_scope = 'both' or rtp.direction = p_direction_scope))
      <> (case when p_direction_scope = 'both' then 2 else 1 end) then
    raise exception 'The bus does not cover every requested route direction and date range.'
      using errcode = '23514';
  end if;

  perform 1
  from public.students s
  where s.id = p_student_id and s.tenant_id = v_tenant_id and s.status = 'active'
  for update;
  if not found then
    raise exception 'Choose an active student in your organization.' using errcode = '23514';
  end if;

  if cardinality(v_existing_ids) > 0 then
    perform 1
    from public.student_bus_assignments sba
    where sba.id = any(v_existing_ids)
      and sba.tenant_id = v_tenant_id
      and sba.student_id = p_student_id
    for update;

    if (
      select count(*)
      from public.student_bus_assignments sba
      join public.bus_route_assignments bra on bra.id = sba.bus_route_assignment_id
      where sba.id = any(v_existing_ids)
        and sba.tenant_id = v_tenant_id
        and sba.student_id = p_student_id
        and bra.bus_id = p_bus_id
        and bra.route_id = p_route_id
    ) <> cardinality(v_existing_ids) then
      raise exception 'Student assignments do not belong to this bus and route.'
        using errcode = '42501';
    end if;
  end if;

  if exists (
    select 1
    from public.student_bus_assignments existing
    join public.bus_route_assignments bra on bra.id = existing.bus_route_assignment_id
    join public.route_trip_patterns rtp on rtp.id = existing.route_trip_pattern_id
    where existing.tenant_id = v_tenant_id
      and existing.student_id = p_student_id
      and existing.status = 'active'
      and not (existing.id = any(v_existing_ids))
      and rtp.route_id = p_route_id
      and (p_direction_scope = 'both' or rtp.direction = p_direction_scope)
      and daterange(existing.effective_from, coalesce(existing.effective_to, 'infinity'::date), '[]')
          && daterange(p_effective_from, coalesce(p_effective_to, 'infinity'::date), '[]')
  ) then
    raise exception 'The student already has service for a requested route direction and date range.'
      using errcode = '23P01';
  end if;

  for v_pattern in
    select rtp.*
    from public.route_trip_patterns rtp
    where rtp.route_id = p_route_id
      and rtp.tenant_id = v_tenant_id
      and rtp.status = 'active'
      and not rtp.schedule_review_required
      and (p_direction_scope = 'both' or rtp.direction = p_direction_scope)
    order by rtp.direction
  loop
    select bra.* into v_bus_service
    from public.bus_route_assignments bra
    where bra.tenant_id = v_tenant_id
      and bra.bus_id = p_bus_id
      and bra.route_id = p_route_id
      and bra.route_trip_pattern_id = v_pattern.id
      and bra.status = 'active'
      and (bra.effective_from is null or bra.effective_from <= p_effective_from)
      and (
        (p_effective_to is null and bra.effective_to is null)
        or (p_effective_to is not null and (bra.effective_to is null or bra.effective_to >= p_effective_to))
      )
    order by bra.effective_from desc nulls last
    limit 1;

    if not found then
      raise exception 'The bus does not cover every requested route direction and date range.'
        using errcode = '23514';
    end if;

    if v_pattern.direction = 'reverse' then
      v_pickup_stop_id := p_reverse_pickup_stop_id;
      v_dropoff_stop_id := p_reverse_dropoff_stop_id;
    else
      v_pickup_stop_id := p_forward_pickup_stop_id;
      v_dropoff_stop_id := p_forward_dropoff_stop_id;
    end if;

    select sba.* into v_assignment
    from public.student_bus_assignments sba
    where sba.id = any(v_existing_ids)
      and sba.route_trip_pattern_id = v_pattern.id
    limit 1;

    if found then
      update public.student_bus_assignments
      set bus_route_assignment_id = v_bus_service.id,
          route_trip_pattern_id = v_pattern.id,
          pickup_stop_id = v_pickup_stop_id,
          dropoff_stop_id = v_dropoff_stop_id,
          effective_from = p_effective_from,
          effective_to = p_effective_to,
          seat_number = p_seat_number,
          status = 'active'
      where id = v_assignment.id
      returning * into v_assignment;
    else
      insert into public.student_bus_assignments (
        tenant_id, student_id, bus_route_assignment_id, route_trip_pattern_id,
        pickup_stop_id, dropoff_stop_id, effective_from, effective_to, seat_number, status
      ) values (
        v_tenant_id, p_student_id, v_bus_service.id, v_pattern.id,
        v_pickup_stop_id, v_dropoff_stop_id, p_effective_from, p_effective_to, p_seat_number, 'active'
      ) returning * into v_assignment;
    end if;
  end loop;

  update public.student_bus_assignments sba
  set status = 'inactive',
      effective_to = case
        when sba.effective_from > current_date then sba.effective_from
        when sba.effective_to is null or sba.effective_to > current_date then current_date
        else sba.effective_to
      end
  from public.route_trip_patterns rtp
  where sba.id = any(v_existing_ids)
    and rtp.id = sba.route_trip_pattern_id
    and not (p_direction_scope = 'both' or rtp.direction = p_direction_scope);

  return query
  select sba.*
  from public.student_bus_assignments sba
  join public.bus_route_assignments bra on bra.id = sba.bus_route_assignment_id
  join public.route_trip_patterns rtp on rtp.id = sba.route_trip_pattern_id
  where sba.tenant_id = v_tenant_id
    and sba.student_id = p_student_id
    and sba.status = 'active'
    and bra.bus_id = p_bus_id
    and bra.route_id = p_route_id
    and sba.effective_from = p_effective_from
    and sba.effective_to is not distinct from p_effective_to
    and (p_direction_scope = 'both' or rtp.direction = p_direction_scope)
  order by rtp.direction;
end;
$$;

create function public.get_driver_active_trip_student_manifest_v2()
returns table (
  active_trip_id uuid,
  student_id uuid,
  student_display_name text,
  route_name text,
  trip_name text,
  bus_number text,
  trip_status text,
  trip_direction text,
  pickup_stop_name text,
  dropoff_stop_name text,
  assignment_status text,
  pickup_event_time timestamptz,
  dropoff_event_time timestamptz,
  student_trip_status text,
  seat_number integer
)
language sql
security definer
set search_path = pg_catalog, public, safebus_private, pg_temp
as $$
  with active_trip as (
    select
      dt.id,
      dt.tenant_id,
      dt.driver_id,
      dt.bus_id,
      dt.route_id,
      dt.route_trip_pattern_id,
      dt.trip_name_snapshot,
      dt.status,
      dt.service_date,
      dt.started_at
    from public.driver_trips dt
    join public.drivers d
      on d.id = dt.driver_id
      and d.tenant_id = dt.tenant_id
      and d.status = 'active'
    join public.buses b
      on b.id = dt.bus_id
      and b.tenant_id = dt.tenant_id
      and b.status = 'active'
    where auth.uid() is not null
      and safebus_private.current_user_role() = 'driver'
      and dt.tenant_id = safebus_private.current_tenant_id()
      and dt.driver_id = safebus_private.current_driver_id()
      and dt.status = 'active'
    order by dt.started_at desc
    limit 1
  ),
  eligible_assignments as (
    select
      at.id as active_trip_id,
      sba.student_id,
      sba.pickup_stop_id,
      sba.dropoff_stop_id,
      sba.seat_number,
      sba.status as assignment_status
    from active_trip at
    join public.student_bus_assignments sba
      on sba.tenant_id = at.tenant_id
      and sba.route_trip_pattern_id = at.route_trip_pattern_id
      and sba.status = 'active'
      and sba.effective_from <= at.service_date
      and (sba.effective_to is null or sba.effective_to >= at.service_date)
    join public.bus_route_assignments bra
      on bra.id = sba.bus_route_assignment_id
      and bra.tenant_id = at.tenant_id
      and bra.bus_id = at.bus_id
      and bra.route_id = at.route_id
      and bra.route_trip_pattern_id = at.route_trip_pattern_id
      and bra.status = 'active'
      and (bra.effective_from is null or bra.effective_from <= at.service_date)
      and (bra.effective_to is null or bra.effective_to >= at.service_date)
  ),
  event_state as (
    select
      e.driver_trip_id,
      e.student_id,
      max(e.event_time) filter (where e.event_type = 'picked_up') as pickup_event_time,
      max(e.event_time) filter (where e.event_type = 'dropped_off') as dropoff_event_time
    from public.student_trip_events e
    join active_trip at
      on at.id = e.driver_trip_id
      and at.tenant_id = e.tenant_id
    group by e.driver_trip_id, e.student_id
  )
  select
    at.id,
    s.id,
    case when s.id is null then null else concat_ws(' ', s.first_name, s.last_name) end,
    r.route_name,
    at.trip_name_snapshot,
    b.bus_number,
    at.status,
    rtp.direction,
    ps.stop_name,
    ds.stop_name,
    ea.assignment_status,
    es.pickup_event_time,
    es.dropoff_event_time,
    case
      when s.id is null then null
      when es.dropoff_event_time is not null then 'dropped_off'
      when es.pickup_event_time is not null then 'picked_up'
      else 'not_picked_up'
    end,
    ea.seat_number
  from active_trip at
  join public.routes r
    on r.id = at.route_id
    and r.tenant_id = at.tenant_id
    and r.status = 'active'
  join public.buses b
    on b.id = at.bus_id
    and b.tenant_id = at.tenant_id
    and b.status = 'active'
  join public.route_trip_patterns rtp
    on rtp.id = at.route_trip_pattern_id
    and rtp.route_id = at.route_id
    and rtp.tenant_id = at.tenant_id
  left join eligible_assignments ea on ea.active_trip_id = at.id
  left join public.students s
    on s.id = ea.student_id
    and s.tenant_id = at.tenant_id
    and s.status = 'active'
  left join event_state es
    on es.driver_trip_id = at.id
    and es.student_id = s.id
  left join public.route_stops ps
    on ps.id = ea.pickup_stop_id
    and ps.tenant_id = at.tenant_id
    and ps.route_id = at.route_id
    and ps.status = 'active'
  left join public.route_stops ds
    on ds.id = ea.dropoff_stop_id
    and ds.tenant_id = at.tenant_id
    and ds.route_id = at.route_id
    and ds.status = 'active'
  order by s.last_name nulls last, s.first_name nulls last, r.route_name;
$$;

create or replace function public.get_guardian_student_stops_v2()
returns table (
  student_id uuid,
  bus_number text,
  trip_name text,
  direction text,
  pickup_stop_name text,
  dropoff_stop_name text,
  seat_number integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, safebus_private, pg_temp
as $$
declare
  v_guardian_id uuid;
  v_tenant_id uuid;
begin
  if auth.uid() is null
    or safebus_private.current_user_role() is distinct from 'guardian'::public.user_role then
    raise exception 'Guardian student stops require an active guardian login.'
      using errcode = '42501';
  end if;

  v_tenant_id := safebus_private.current_tenant_id();
  v_guardian_id := safebus_private.current_guardian_id();
  if v_tenant_id is null or v_guardian_id is null then
    raise exception 'Guardian student stops require an active guardian identity.'
      using errcode = '42501';
  end if;

  return query
  select distinct
    s.id,
    b.bus_number,
    rtp.display_name,
    rtp.direction::text,
    pickup.stop_name,
    dropoff.stop_name,
    sba.seat_number
  from public.student_guardians sg
  join public.students s
    on s.id = sg.student_id
   and s.tenant_id = sg.tenant_id
   and s.status = 'active'
  join public.student_bus_assignments sba
    on sba.student_id = s.id
   and sba.tenant_id = s.tenant_id
   and sba.status = 'active'
   and sba.effective_from <= current_date
   and (sba.effective_to is null or sba.effective_to >= current_date)
  join public.bus_route_assignments bra
    on bra.id = sba.bus_route_assignment_id
   and bra.tenant_id = s.tenant_id
   and bra.route_trip_pattern_id = sba.route_trip_pattern_id
   and bra.status = 'active'
   and (bra.effective_from is null or bra.effective_from <= current_date)
   and (bra.effective_to is null or bra.effective_to >= current_date)
  join public.buses b
    on b.id = bra.bus_id
   and b.tenant_id = s.tenant_id
   and b.status = 'active'
  join public.routes r
    on r.id = bra.route_id
   and r.tenant_id = s.tenant_id
   and r.status = 'active'
  join public.route_trip_patterns rtp
    on rtp.id = bra.route_trip_pattern_id
   and rtp.route_id = bra.route_id
   and rtp.tenant_id = bra.tenant_id
   and rtp.status = 'active'
  left join public.route_stops pickup
    on pickup.id = sba.pickup_stop_id
   and pickup.tenant_id = s.tenant_id
   and pickup.route_id = bra.route_id
   and pickup.status = 'active'
  left join public.route_stops dropoff
    on dropoff.id = sba.dropoff_stop_id
   and dropoff.tenant_id = s.tenant_id
   and dropoff.route_id = bra.route_id
   and dropoff.status = 'active'
  where sg.guardian_id = v_guardian_id
    and sg.tenant_id = v_tenant_id
    and sg.status = 'active'
    and (sg.access_expires_at is null or sg.access_expires_at > now())
  order by s.id, b.bus_number, rtp.display_name, rtp.direction::text,
    pickup.stop_name, dropoff.stop_name;
end;
$$;

create function public.get_admin_bus_services_with_capacity()
returns jsonb language sql stable security invoker
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('bus_capacity', b.capacity)), '[]'::jsonb)
  from public.get_admin_bus_services() s
  join public.buses b on b.id = s.bus_id and b.tenant_id = s.tenant_id;
$$;

revoke all on function public.admin_set_student_bus_service_with_seat(uuid,uuid,uuid,integer,text,uuid,uuid,uuid,uuid,date,date,uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.admin_set_student_bus_service_with_seat(uuid,uuid,uuid,integer,text,uuid,uuid,uuid,uuid,date,date,uuid[]) to authenticated;
revoke all on function public.get_driver_active_trip_student_manifest_v2() from public, anon, authenticated, service_role;
grant execute on function public.get_driver_active_trip_student_manifest_v2() to authenticated;
revoke all on function public.get_guardian_student_stops_v2() from public, anon, authenticated, service_role;
grant execute on function public.get_guardian_student_stops_v2() to authenticated;
revoke all on function public.get_admin_bus_services_with_capacity() from public, anon, authenticated, service_role;
grant execute on function public.get_admin_bus_services_with_capacity() to authenticated;

create or replace function safebus_private.on_student_service_notification()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, safebus_private, pg_temp as $$
declare v_recipient record; v_school uuid;
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'seat_number' - 'updated_at')
      = (to_jsonb(old) - 'seat_number' - 'updated_at') then
    return new; -- Seat-only edits do not send service-change notifications.
  end if;
  select r.school_id into v_school from public.bus_route_assignments bra join public.routes r on r.id = bra.route_id where bra.id = new.bus_route_assignment_id;
  for v_recipient in
    select g.profile_id from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id and g.status = 'active'
    where sg.student_id = new.student_id and sg.tenant_id = new.tenant_id and sg.status = 'active'
      and (sg.access_expires_at is null or sg.access_expires_at > now())
  loop
    perform safebus_private.enqueue_user_notification(new.tenant_id, v_recipient.profile_id,
      'student_service_changed', 'service_changes', 'info', 'student_bus_assignment', new.id,
      'student_bus_assignment:' || new.id::text || ':' || extract(epoch from new.updated_at)::bigint::text,
      new.updated_at, new.student_id, null, v_school);
  end loop;
  return new;
end;
$$;
revoke all on function safebus_private.on_student_service_notification() from public, anon, authenticated, service_role;

create or replace function public.get_admin_bus_workspace(p_bus_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_caller public.profiles;
  v_bus jsonb;
  v_routes jsonb;
  v_drivers jsonb;
  v_students jsonb;
begin
  select * into v_caller
  from public.profiles
  where id = auth.uid() and status = 'active';

  if v_caller.id is null
    or v_caller.tenant_id is null
    or v_caller.role not in ('tenant_admin', 'transportation_admin', 'school_admin') then
    raise exception 'Admin tenant context is required.' using errcode = '42501';
  end if;

  select to_jsonb(bus_row)
  into v_bus
  from (
    select
      bus.id,
      bus.tenant_id,
      bus.school_id,
      bus.bus_number,
      detail.fleet_number,
      bus.license_plate,
      bus.capacity,
      bus.status,
      bus.created_at,
      bus.updated_at,
      school.name as school_name
    from public.buses bus
    left join public.bus_admin_details detail
      on detail.bus_id = bus.id and detail.tenant_id = bus.tenant_id
    left join public.schools school
      on school.id = bus.school_id and school.tenant_id = bus.tenant_id
    where bus.id = p_bus_id
      and bus.tenant_id = v_caller.tenant_id
  ) bus_row;

  if v_bus is null then
    raise exception 'Bus not found.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(to_jsonb(route_row) order by route_row.created_at desc), '[]'::jsonb)
  into v_routes
  from (
    select
      assignment.id,
      assignment.tenant_id,
      assignment.bus_id,
      assignment.route_id,
      assignment.route_trip_pattern_id,
      assignment.trip_type,
      assignment.effective_from,
      assignment.effective_to,
      assignment.status,
      assignment.created_at,
      assignment.updated_at,
      route.route_name,
      route.route_code,
      route.status as route_status,
      coalesce(pattern.display_name, assignment.trip_type) as trip_name,
      coalesce(
        pattern.direction,
        case when assignment.trip_type = 'evening' then 'reverse' else 'forward' end
      ) as direction,
      exists (
        select 1
        from public.driver_route_assignments driver_assignment
        join public.driver_trips trip
          on trip.driver_route_assignment_id = driver_assignment.id
         and trip.tenant_id = driver_assignment.tenant_id
         and trip.status = 'active'
        where driver_assignment.bus_route_assignment_id = assignment.id
          and driver_assignment.tenant_id = assignment.tenant_id
      ) as has_active_trip
    from public.bus_route_assignments assignment
    join public.routes route
      on route.id = assignment.route_id and route.tenant_id = assignment.tenant_id
    left join public.route_trip_patterns pattern
      on pattern.id = assignment.route_trip_pattern_id
     and pattern.route_id = assignment.route_id
     and pattern.tenant_id = assignment.tenant_id
    where assignment.bus_id = p_bus_id
      and assignment.tenant_id = v_caller.tenant_id
  ) route_row;

  select coalesce(jsonb_agg(to_jsonb(driver_row) order by driver_row.created_at desc), '[]'::jsonb)
  into v_drivers
  from (
    select
      assignment.id,
      assignment.tenant_id,
      assignment.driver_id,
      assignment.bus_id,
      assignment.route_id,
      assignment.route_trip_pattern_id,
      assignment.bus_route_assignment_id,
      assignment.trip_type,
      assignment.status,
      assignment.effective_from,
      assignment.effective_to,
      assignment.created_at,
      assignment.updated_at,
      profile.full_name as driver_name,
      profile.email as driver_email,
      exists (
        select 1
        from public.driver_trips trip
        where trip.driver_route_assignment_id = assignment.id
          and trip.tenant_id = assignment.tenant_id
          and trip.status = 'active'
      ) as has_active_trip
    from public.driver_route_assignments assignment
    join public.drivers driver
      on driver.id = assignment.driver_id and driver.tenant_id = assignment.tenant_id
    join public.profiles profile
      on profile.id = driver.profile_id and profile.tenant_id = assignment.tenant_id
    where assignment.bus_id = p_bus_id
      and assignment.tenant_id = v_caller.tenant_id
  ) driver_row;

  select coalesce(jsonb_agg(to_jsonb(student_row) order by student_row.created_at desc), '[]'::jsonb)
  into v_students
  from (
    select
      student_assignment.id,
      student_assignment.tenant_id,
      student_assignment.student_id,
      student_assignment.seat_number,
      student_assignment.bus_route_assignment_id,
      student_assignment.route_trip_pattern_id,
      student_assignment.pickup_stop_id,
      student_assignment.dropoff_stop_id,
      student_assignment.effective_from,
      student_assignment.effective_to,
      student_assignment.status,
      student_assignment.created_at,
      student_assignment.updated_at,
      concat_ws(' ', student.first_name, student.last_name) as student_name,
      pickup.stop_name as pickup_stop_name,
      dropoff.stop_name as dropoff_stop_name
    from public.student_bus_assignments student_assignment
    join public.bus_route_assignments bus_assignment
      on bus_assignment.id = student_assignment.bus_route_assignment_id
     and bus_assignment.tenant_id = student_assignment.tenant_id
    join public.students student
      on student.id = student_assignment.student_id
     and student.tenant_id = student_assignment.tenant_id
    left join public.route_stops pickup
      on pickup.id = student_assignment.pickup_stop_id
     and pickup.tenant_id = student_assignment.tenant_id
    left join public.route_stops dropoff
      on dropoff.id = student_assignment.dropoff_stop_id
     and dropoff.tenant_id = student_assignment.tenant_id
    where bus_assignment.bus_id = p_bus_id
      and student_assignment.tenant_id = v_caller.tenant_id
  ) student_row;

  return jsonb_build_object(
    'bus', v_bus,
    'routeAssignments', v_routes,
    'driverAssignments', v_drivers,
    'studentAssignments', v_students
  );
end;
$$;

revoke all on function public.get_admin_bus_workspace(uuid) from public, anon;
grant execute on function public.get_admin_bus_workspace(uuid) to authenticated;

reset search_path;
