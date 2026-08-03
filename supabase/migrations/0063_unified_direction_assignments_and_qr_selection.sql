-- SafeBus Alberta - unified directional assignments and QR route selection
--
-- Admins manage a bus/route or student/bus service once while the database
-- preserves the two immutable route-direction records required by manifests,
-- stop ordering, guardian visibility, and GPS history. A driver scan resolves
-- the bus first, then the driver selects one currently effective direction.

create or replace function public.admin_set_bus_route_service(
  p_bus_id uuid,
  p_route_id uuid,
  p_direction_scope text default 'both',
  p_effective_from date default current_date,
  p_effective_to date default null,
  p_existing_assignment_ids uuid[] default array[]::uuid[]
)
returns setof public.bus_route_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_existing_ids uuid[] := coalesce(p_existing_assignment_ids, array[]::uuid[]);
  v_pattern public.route_trip_patterns;
  v_assignment public.bus_route_assignments;
  v_expected_count integer;
begin
  if auth.uid() is null
    or v_tenant_id is null
    or not public.is_transportation_write_admin() then
    raise exception 'Admin tenant context is required.' using errcode = '42501';
  end if;

  if p_direction_scope not in ('both', 'forward', 'reverse') then
    raise exception 'Direction scope must be both, forward, or reverse.' using errcode = '22023';
  end if;
  if p_effective_from is null
    or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'Use a valid route service date range.' using errcode = '22007';
  end if;

  perform 1
  from public.buses b
  where b.id = p_bus_id and b.tenant_id = v_tenant_id and b.status = 'active'
  for update;
  if not found then
    raise exception 'Choose an active bus in your organization.' using errcode = '23514';
  end if;

  perform 1
  from public.routes r
  where r.id = p_route_id
    and r.tenant_id = v_tenant_id
    and r.status = 'active'
    and r.definition_status = 'ready'
  for update;
  if not found then
    raise exception 'Choose an active, map-ready route.' using errcode = '23514';
  end if;

  select count(*) into v_expected_count
  from public.route_trip_patterns rtp
  where rtp.route_id = p_route_id
    and rtp.tenant_id = v_tenant_id
    and rtp.status = 'active'
    and not rtp.schedule_review_required
    and (p_direction_scope = 'both' or rtp.direction = p_direction_scope);

  if v_expected_count <> (case when p_direction_scope = 'both' then 2 else 1 end) then
    raise exception 'The selected route does not have every requested reviewed direction.'
      using errcode = '23514';
  end if;

  if cardinality(v_existing_ids) > 0 then
    perform 1
    from public.bus_route_assignments bra
    where bra.id = any(v_existing_ids)
    for update;

    if (
      select count(*)
      from public.bus_route_assignments bra
      where bra.id = any(v_existing_ids)
        and bra.tenant_id = v_tenant_id
        and bra.bus_id = p_bus_id
        and bra.route_id = p_route_id
    ) <> cardinality(v_existing_ids) then
      raise exception 'Route service assignments do not belong to this bus and route.'
        using errcode = '42501';
    end if;

    if exists (
      select 1
      from public.driver_trips dt
      join public.bus_route_assignments bra
        on bra.id = any(v_existing_ids)
        and bra.tenant_id = dt.tenant_id
        and bra.bus_id = dt.bus_id
        and bra.route_id = dt.route_id
        and bra.route_trip_pattern_id = dt.route_trip_pattern_id
      where dt.tenant_id = v_tenant_id and dt.status = 'active'
    ) then
      raise exception 'End the active bus run before changing this route service.'
        using errcode = '55006';
    end if;
  end if;

  if exists (
    select 1
    from public.bus_route_assignments existing
    join public.route_trip_patterns rtp
      on rtp.id = existing.route_trip_pattern_id
      and rtp.tenant_id = existing.tenant_id
    where existing.tenant_id = v_tenant_id
      and existing.status = 'active'
      and not (existing.id = any(v_existing_ids))
      and rtp.route_id = p_route_id
      and (p_direction_scope = 'both' or rtp.direction = p_direction_scope)
      and daterange(
        coalesce(existing.effective_from, '-infinity'::date),
        coalesce(existing.effective_to, 'infinity'::date),
        '[]'
      ) && daterange(p_effective_from, coalesce(p_effective_to, 'infinity'::date), '[]')
  ) then
    raise exception 'A requested route direction already has a bus for those dates.'
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
    select bra.* into v_assignment
    from public.bus_route_assignments bra
    where bra.id = any(v_existing_ids)
      and bra.route_trip_pattern_id = v_pattern.id
    limit 1;

    if found then
      update public.bus_route_assignments
      set effective_from = p_effective_from,
          effective_to = p_effective_to,
          status = 'active'
      where id = v_assignment.id
      returning * into v_assignment;
    else
      insert into public.bus_route_assignments (
        tenant_id, bus_id, route_id, route_trip_pattern_id, trip_type,
        effective_from, effective_to, status
      ) values (
        v_tenant_id, p_bus_id, p_route_id, v_pattern.id,
        case when v_pattern.direction = 'reverse' then 'evening' else 'morning' end,
        p_effective_from, p_effective_to, 'active'
      ) returning * into v_assignment;
    end if;
  end loop;

  -- Directions removed from an existing group are ended together with their
  -- dependent planning and student rows. Historical records are retained.
  for v_assignment in
    select bra.*
    from public.bus_route_assignments bra
    join public.route_trip_patterns rtp on rtp.id = bra.route_trip_pattern_id
    where bra.id = any(v_existing_ids)
      and not (p_direction_scope = 'both' or rtp.direction = p_direction_scope)
  loop
    update public.driver_route_assignments
    set status = 'inactive'
    where bus_route_assignment_id = v_assignment.id
      and tenant_id = v_tenant_id
      and status = 'active';

    update public.student_bus_assignments
    set status = 'inactive',
        effective_to = case
          when effective_from > current_date then effective_from
          when effective_to is null or effective_to > current_date then current_date
          else effective_to
        end
    where bus_route_assignment_id = v_assignment.id
      and tenant_id = v_tenant_id
      and status = 'active';

    update public.bus_route_assignments
    set status = 'inactive',
        effective_to = case
          when effective_from > current_date then effective_from
          when effective_to is null or effective_to > current_date then current_date
          else effective_to
        end
    where id = v_assignment.id;
  end loop;

  return query
  select bra.*
  from public.bus_route_assignments bra
  join public.route_trip_patterns rtp on rtp.id = bra.route_trip_pattern_id
  where bra.tenant_id = v_tenant_id
    and bra.bus_id = p_bus_id
    and bra.route_id = p_route_id
    and bra.status = 'active'
    and bra.effective_from = p_effective_from
    and bra.effective_to is not distinct from p_effective_to
    and (p_direction_scope = 'both' or rtp.direction = p_direction_scope)
  order by rtp.direction;
end;
$$;

create or replace function public.admin_end_bus_route_service(
  p_assignment_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_ids uuid[] := coalesce(p_assignment_ids, array[]::uuid[]);
  v_driver_count integer;
  v_student_count integer;
begin
  if auth.uid() is null
    or v_tenant_id is null
    or not public.is_transportation_write_admin() then
    raise exception 'Admin tenant context is required.' using errcode = '42501';
  end if;
  if cardinality(v_ids) = 0
    or (select count(*) from public.bus_route_assignments bra
        where bra.id = any(v_ids) and bra.tenant_id = v_tenant_id) <> cardinality(v_ids) then
    raise exception 'Route service assignments were not found.' using errcode = 'P0002';
  end if;

  perform 1 from public.bus_route_assignments bra where bra.id = any(v_ids) for update;
  if exists (
    select 1
    from public.driver_trips dt
    join public.bus_route_assignments bra
      on bra.id = any(v_ids)
      and bra.tenant_id = dt.tenant_id
      and bra.bus_id = dt.bus_id
      and bra.route_id = dt.route_id
      and bra.route_trip_pattern_id = dt.route_trip_pattern_id
    where dt.tenant_id = v_tenant_id and dt.status = 'active'
  ) then
    raise exception 'End the active bus run before ending this route service.'
      using errcode = '55006';
  end if;

  update public.driver_route_assignments
  set status = 'inactive'
  where bus_route_assignment_id = any(v_ids)
    and tenant_id = v_tenant_id
    and status = 'active';
  get diagnostics v_driver_count = row_count;

  update public.student_bus_assignments
  set status = 'inactive',
      effective_to = case
        when effective_from > current_date then effective_from
        when effective_to is null or effective_to > current_date then current_date
        else effective_to
      end
  where bus_route_assignment_id = any(v_ids)
    and tenant_id = v_tenant_id
    and status = 'active';
  get diagnostics v_student_count = row_count;

  update public.bus_route_assignments
  set status = 'inactive',
      effective_to = case
        when effective_from > current_date then effective_from
        when effective_to is null or effective_to > current_date then current_date
        else effective_to
      end
  where id = any(v_ids) and tenant_id = v_tenant_id and status = 'active';

  return jsonb_build_object(
    'busRouteAssignmentIds', to_jsonb(v_ids),
    'driverAssignmentsEnded', v_driver_count,
    'studentAssignmentsEnded', v_student_count
  );
end;
$$;

create or replace function public.admin_set_student_bus_service(
  p_student_id uuid,
  p_bus_id uuid,
  p_route_id uuid,
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
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_existing_ids uuid[] := coalesce(p_existing_assignment_ids, array[]::uuid[]);
  v_pattern public.route_trip_patterns;
  v_bus_service public.bus_route_assignments;
  v_assignment public.student_bus_assignments;
  v_pickup_stop_id uuid;
  v_dropoff_stop_id uuid;
begin
  if auth.uid() is null
    or v_tenant_id is null
    or not public.is_transportation_write_admin() then
    raise exception 'Admin tenant context is required.' using errcode = '42501';
  end if;
  if p_direction_scope not in ('both', 'forward', 'reverse') then
    raise exception 'Direction scope must be both, forward, or reverse.' using errcode = '22023';
  end if;
  if p_effective_from is null
    or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'Use a valid student service date range.' using errcode = '22007';
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
          status = 'active'
      where id = v_assignment.id
      returning * into v_assignment;
    else
      insert into public.student_bus_assignments (
        tenant_id, student_id, bus_route_assignment_id, route_trip_pattern_id,
        pickup_stop_id, dropoff_stop_id, effective_from, effective_to, status
      ) values (
        v_tenant_id, p_student_id, v_bus_service.id, v_pattern.id,
        v_pickup_stop_id, v_dropoff_stop_id, p_effective_from, p_effective_to, 'active'
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

create or replace function public.admin_set_student_bus_service_status(
  p_assignment_ids uuid[],
  p_status text,
  p_end_service boolean default false
)
returns setof public.student_bus_assignments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_ids uuid[] := coalesce(p_assignment_ids, array[]::uuid[]);
begin
  if auth.uid() is null
    or v_tenant_id is null
    or not public.is_transportation_write_admin() then
    raise exception 'Admin tenant context is required.' using errcode = '42501';
  end if;
  if p_status not in ('active', 'inactive', 'archived') then
    raise exception 'Unsupported student service status.' using errcode = '22023';
  end if;
  if cardinality(v_ids) = 0
    or (select count(*) from public.student_bus_assignments sba
        where sba.id = any(v_ids) and sba.tenant_id = v_tenant_id) <> cardinality(v_ids) then
    raise exception 'Student service assignments were not found.' using errcode = 'P0002';
  end if;

  perform 1 from public.student_bus_assignments sba where sba.id = any(v_ids) for update;

  if p_status = 'active' and exists (
    select 1
    from public.student_bus_assignments sba
    join public.bus_route_assignments bra on bra.id = sba.bus_route_assignment_id
    where sba.id = any(v_ids)
      and (bra.status <> 'active'
        or (bra.effective_to is not null and bra.effective_to < current_date))
  ) then
    raise exception 'The bus route service is no longer active.' using errcode = '55006';
  end if;

  update public.student_bus_assignments
  set status = p_status,
      effective_to = case
        when not p_end_service then effective_to
        when effective_from > current_date then effective_from
        when effective_to is null or effective_to > current_date then current_date
        else effective_to
      end
  where id = any(v_ids) and tenant_id = v_tenant_id;

  return query
  select sba.* from public.student_bus_assignments sba
  where sba.id = any(v_ids) and sba.tenant_id = v_tenant_id
  order by sba.route_trip_pattern_id;
end;
$$;

create or replace function public.get_bus_qr_start_options(p_qr_token text)
returns table (
  bus_route_assignment_id uuid,
  bus_number text,
  route_code text,
  route_name text,
  trip_name text,
  direction text,
  resumed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_driver_id uuid := public.current_driver_id();
  v_hash text;
  v_bus public.buses;
  v_existing_trip public.driver_trips;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver'
    or v_tenant_id is null or v_driver_id is null then
    raise exception 'Only an active driver can scan a bus.' using errcode = '42501';
  end if;
  if p_qr_token is null or p_qr_token !~ '^sbus_bus_v1_[A-Za-z0-9_-]{40,80}$' then
    raise exception 'Bus QR could not be verified.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.drivers d
    where d.id = v_driver_id and d.tenant_id = v_tenant_id and d.status = 'active'
  ) then
    raise exception 'An active driver identity is required.' using errcode = '42501';
  end if;

  v_hash := public.hash_bus_tracking_token(p_qr_token);
  select b.* into v_bus
  from public.bus_qr_credentials c
  join public.buses b on b.id = c.bus_id and b.tenant_id = c.tenant_id
  where c.token_hash = v_hash
    and c.status = 'active'
    and c.tenant_id = v_tenant_id
    and b.status = 'active';
  if not found then
    raise exception 'Bus QR could not be verified.' using errcode = 'P0002';
  end if;

  select dt.* into v_existing_trip
  from public.driver_trips dt
  where dt.driver_id = v_driver_id and dt.tenant_id = v_tenant_id and dt.status = 'active';
  if found and v_existing_trip.bus_id <> v_bus.id then
    raise exception 'End your active trip before scanning another bus.' using errcode = '55006';
  end if;

  return query
  select bra.id, v_bus.bus_number, r.route_code, r.route_name,
    rtp.display_name, rtp.direction, v_existing_trip.id is not null
  from public.bus_route_assignments bra
  join public.routes r
    on r.id = bra.route_id and r.tenant_id = bra.tenant_id
    and r.status = 'active' and r.definition_status = 'ready'
  join public.route_trip_patterns rtp
    on rtp.id = bra.route_trip_pattern_id and rtp.route_id = bra.route_id
    and rtp.tenant_id = bra.tenant_id and rtp.status = 'active'
    and not rtp.schedule_review_required
  where bra.tenant_id = v_tenant_id
    and bra.bus_id = v_bus.id
    and (
      (v_existing_trip.id is null
        and bra.status = 'active'
        and (bra.effective_from is null or bra.effective_from <= current_date)
        and (bra.effective_to is null or bra.effective_to >= current_date))
      or
      (v_existing_trip.id is not null
        and bra.route_id = v_existing_trip.route_id
        and bra.route_trip_pattern_id = v_existing_trip.route_trip_pattern_id)
    )
  order by r.route_code, rtp.direction;
end;
$$;

-- Replace the old immediate, prepared-dispatch start contract with an exact
-- bus assignment choice made after the QR has securely resolved the bus.
drop function if exists public.start_bus_tracking_from_qr(text);

create or replace function public.start_bus_tracking_from_qr(
  p_qr_token text,
  p_bus_route_assignment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_driver_id uuid := public.current_driver_id();
  v_hash text;
  v_credential public.bus_qr_credentials;
  v_bus public.buses;
  v_assignment public.bus_route_assignments;
  v_pattern public.route_trip_patterns;
  v_trip public.driver_trips;
  v_existing_trip public.driver_trips;
  v_session_token text;
  v_session_hash text;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver'
    or v_tenant_id is null or v_driver_id is null then
    raise exception 'Only an active driver can scan a bus.' using errcode = '42501';
  end if;
  if p_qr_token is null or p_qr_token !~ '^sbus_bus_v1_[A-Za-z0-9_-]{40,80}$'
    or p_bus_route_assignment_id is null then
    raise exception 'Bus QR and route choice could not be verified.' using errcode = '22023';
  end if;

  perform 1 from public.drivers d
  where d.id = v_driver_id and d.tenant_id = v_tenant_id and d.status = 'active'
  for update;
  if not found then
    raise exception 'An active driver identity is required.' using errcode = '42501';
  end if;

  v_hash := public.hash_bus_tracking_token(p_qr_token);
  select c.* into v_credential
  from public.bus_qr_credentials c
  where c.token_hash = v_hash and c.status = 'active'
  for update;
  if not found or v_credential.tenant_id <> v_tenant_id then
    raise exception 'Bus QR could not be verified.' using errcode = 'P0002';
  end if;

  select b.* into v_bus
  from public.buses b
  where b.id = v_credential.bus_id and b.tenant_id = v_tenant_id and b.status = 'active'
  for update;
  if not found then
    raise exception 'This bus is not active.' using errcode = '55006';
  end if;

  select bra.* into v_assignment
  from public.bus_route_assignments bra
  join public.routes r
    on r.id = bra.route_id and r.tenant_id = bra.tenant_id
    and r.status = 'active' and r.definition_status = 'ready'
  join public.route_trip_patterns rtp
    on rtp.id = bra.route_trip_pattern_id and rtp.route_id = bra.route_id
    and rtp.tenant_id = bra.tenant_id and rtp.status = 'active'
    and not rtp.schedule_review_required
  where bra.id = p_bus_route_assignment_id
    and bra.bus_id = v_bus.id
    and bra.tenant_id = v_tenant_id
  for update of bra;
  if not found then
    raise exception 'The selected route direction is not assigned to this bus.' using errcode = 'P0002';
  end if;

  select rtp.* into v_pattern
  from public.route_trip_patterns rtp
  where rtp.id = v_assignment.route_trip_pattern_id
    and rtp.tenant_id = v_tenant_id;

  select dt.* into v_existing_trip
  from public.driver_trips dt
  where dt.driver_id = v_driver_id and dt.tenant_id = v_tenant_id and dt.status = 'active'
  for update;

  if found then
    if v_existing_trip.bus_id <> v_bus.id then
      raise exception 'End your active trip before scanning another bus.' using errcode = '55006';
    end if;
    if v_existing_trip.route_id <> v_assignment.route_id
      or v_existing_trip.route_trip_pattern_id <> v_assignment.route_trip_pattern_id then
      raise exception 'The active bus run direction cannot be changed while resuming.'
        using errcode = '55006';
    end if;
    v_trip := v_existing_trip;
  else
    if v_assignment.status <> 'active'
      or (v_assignment.effective_from is not null and v_assignment.effective_from > current_date)
      or (v_assignment.effective_to is not null and v_assignment.effective_to < current_date) then
      raise exception 'The selected route direction is not active today.' using errcode = '55006';
    end if;
    if exists (
      select 1 from public.driver_trips dt
      where dt.bus_id = v_bus.id and dt.tenant_id = v_tenant_id and dt.status = 'active'
    ) then
      raise exception 'This bus already has an active trip.' using errcode = '55006';
    end if;

    begin
      insert into public.driver_trips (
        tenant_id, driver_id, bus_id, route_id, route_trip_pattern_id,
        driver_route_assignment_id, route_shape_id, bus_number_snapshot,
        trip_name_snapshot, trip_type, status, service_date, started_at
      ) values (
        v_tenant_id, v_driver_id, v_bus.id, v_assignment.route_id,
        v_assignment.route_trip_pattern_id, null,
        public.current_route_shape_id_for_route(v_assignment.route_id, v_tenant_id),
        v_bus.bus_number, v_pattern.display_name,
        case when v_pattern.direction = 'reverse' then 'evening' else 'morning' end,
        'active', current_date, now()
      ) returning * into v_trip;
    exception when unique_violation then
      raise exception 'This driver or bus already has an active trip.' using errcode = '55006';
    end;
  end if;

  update public.bus_tracking_sessions
  set status = 'revoked', ended_at = now()
  where status = 'active'
    and (driver_trip_id = v_trip.id or driver_id = v_driver_id or bus_id = v_bus.id);

  loop
    v_session_token := public.create_bus_tracking_session_token();
    v_session_hash := public.hash_bus_tracking_token(v_session_token);
    exit when not exists (
      select 1 from public.bus_tracking_sessions where session_token_hash = v_session_hash
    );
  end loop;

  insert into public.bus_tracking_sessions (
    tenant_id, driver_trip_id, driver_id, bus_id, bus_qr_credential_id,
    session_token_hash
  ) values (
    v_tenant_id, v_trip.id, v_driver_id, v_bus.id, v_credential.id,
    v_session_hash
  );

  return jsonb_build_object(
    'trip', to_jsonb(v_trip),
    'trackingToken', v_session_token,
    'busNumber', v_bus.bus_number,
    'resumed', v_existing_trip.id is not null
  );
end;
$$;

revoke all on function public.admin_set_bus_route_service(
  uuid, uuid, text, date, date, uuid[]
) from public, anon;
revoke all on function public.admin_set_student_bus_service(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, date, date, uuid[]
) from public, anon;
revoke all on function public.admin_end_bus_route_service(uuid[]) from public, anon;
revoke all on function public.admin_set_student_bus_service_status(uuid[], text, boolean) from public, anon;
revoke all on function public.get_bus_qr_start_options(text) from public, anon;
revoke all on function public.start_bus_tracking_from_qr(text, uuid) from public, anon;

grant execute on function public.admin_set_bus_route_service(
  uuid, uuid, text, date, date, uuid[]
) to authenticated;
grant execute on function public.admin_set_student_bus_service(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, date, date, uuid[]
) to authenticated;
grant execute on function public.admin_end_bus_route_service(uuid[]) to authenticated;
grant execute on function public.admin_set_student_bus_service_status(uuid[], text, boolean) to authenticated;
grant execute on function public.get_bus_qr_start_options(text) to authenticated;
grant execute on function public.start_bus_tracking_from_qr(text, uuid) to authenticated;

comment on function public.admin_set_bus_route_service(uuid, uuid, text, date, date, uuid[]) is
  'Atomically manages one bus-to-route service across both, forward-only, or reverse-only direction records.';
comment on function public.admin_set_student_bus_service(
  uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, date, date, uuid[]
) is
  'Atomically manages a student bus service across direction-specific assignments and validates direction-correct stops.';
comment on function public.admin_end_bus_route_service(uuid[]) is
  'Atomically ends one grouped bus route service and its active dependent assignments after active-run checks.';
comment on function public.admin_set_student_bus_service_status(uuid[], text, boolean) is
  'Atomically activates, deactivates, or archives every direction in one grouped student bus service.';
comment on function public.get_bus_qr_start_options(text) is
  'Resolves a valid bus QR for an active tenant driver and returns only currently selectable route-direction assignments.';
comment on function public.start_bus_tracking_from_qr(text, uuid) is
  'Starts or resumes GPS tracking after a driver selects an exact active route direction belonging to the scanned bus.';
comment on table public.bus_run_dispatches is
  'Historical prepared-run records retained for audit. QR starts no longer require or create a prepared dispatch.';
