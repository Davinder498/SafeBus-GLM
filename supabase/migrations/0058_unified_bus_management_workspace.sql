-- SafeBus Alberta - unified tenant-admin bus management workspace
--
-- Adds one tenant-scoped read model for the bus editor and two atomic lifecycle
-- operations. Assignments are deactivated, never deleted, so operational
-- history remains available.

create or replace function public.get_admin_bus_workspace(p_bus_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_bus jsonb;
  v_routes jsonb;
  v_drivers jsonb;
  v_students jsonb;
begin
  if not public.is_transportation_write_admin()
    or public.current_tenant_id() is null then
    raise exception 'Admin tenant context is required.'
      using errcode = '42501';
  end if;

  select to_jsonb(bus_row)
  into v_bus
  from (
    select
      b.id,
      b.tenant_id,
      b.school_id,
      b.bus_number,
      b.license_plate,
      b.capacity,
      b.status,
      b.created_at,
      b.updated_at,
      s.name as school_name
    from public.buses b
    left join public.schools s
      on s.id = b.school_id
      and s.tenant_id = b.tenant_id
    where b.id = p_bus_id
      and b.tenant_id = public.current_tenant_id()
  ) bus_row;

  if v_bus is null then
    raise exception 'Bus not found.' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(to_jsonb(route_row) order by route_row.created_at desc), '[]'::jsonb)
  into v_routes
  from (
    select
      bra.id,
      bra.tenant_id,
      bra.bus_id,
      bra.route_id,
      bra.route_trip_pattern_id,
      bra.trip_type,
      bra.effective_from,
      bra.effective_to,
      bra.status,
      bra.created_at,
      bra.updated_at,
      r.route_name,
      r.route_code,
      r.status as route_status,
      coalesce(rtp.display_name, bra.trip_type) as trip_name,
      coalesce(
        rtp.direction,
        case when bra.trip_type = 'evening' then 'reverse' else 'forward' end
      ) as direction,
      exists (
        select 1
        from public.driver_route_assignments dra
        join public.driver_trips dt
          on dt.driver_route_assignment_id = dra.id
          and dt.tenant_id = dra.tenant_id
          and dt.status = 'active'
        where dra.bus_route_assignment_id = bra.id
          and dra.tenant_id = bra.tenant_id
      ) as has_active_trip
    from public.bus_route_assignments bra
    join public.routes r
      on r.id = bra.route_id
      and r.tenant_id = bra.tenant_id
    left join public.route_trip_patterns rtp
      on rtp.id = bra.route_trip_pattern_id
      and rtp.route_id = bra.route_id
      and rtp.tenant_id = bra.tenant_id
    where bra.bus_id = p_bus_id
      and bra.tenant_id = public.current_tenant_id()
  ) route_row;

  select coalesce(jsonb_agg(to_jsonb(driver_row) order by driver_row.created_at desc), '[]'::jsonb)
  into v_drivers
  from (
    select
      dra.id,
      dra.tenant_id,
      dra.driver_id,
      dra.bus_id,
      dra.route_id,
      dra.route_trip_pattern_id,
      dra.bus_route_assignment_id,
      dra.trip_type,
      dra.status,
      dra.effective_from,
      dra.effective_to,
      dra.created_at,
      dra.updated_at,
      p.full_name as driver_name,
      p.email as driver_email,
      exists (
        select 1
        from public.driver_trips dt
        where dt.driver_route_assignment_id = dra.id
          and dt.tenant_id = dra.tenant_id
          and dt.status = 'active'
      ) as has_active_trip
    from public.driver_route_assignments dra
    join public.drivers d
      on d.id = dra.driver_id
      and d.tenant_id = dra.tenant_id
    join public.profiles p
      on p.id = d.profile_id
      and p.tenant_id = dra.tenant_id
    where dra.bus_id = p_bus_id
      and dra.tenant_id = public.current_tenant_id()
  ) driver_row;

  select coalesce(jsonb_agg(to_jsonb(student_row) order by student_row.created_at desc), '[]'::jsonb)
  into v_students
  from (
    select
      sba.id,
      sba.tenant_id,
      sba.student_id,
      sba.bus_route_assignment_id,
      sba.route_trip_pattern_id,
      sba.pickup_stop_id,
      sba.dropoff_stop_id,
      sba.effective_from,
      sba.effective_to,
      sba.status,
      sba.created_at,
      sba.updated_at,
      concat_ws(' ', s.first_name, s.last_name) as student_name,
      ps.stop_name as pickup_stop_name,
      ds.stop_name as dropoff_stop_name
    from public.student_bus_assignments sba
    join public.bus_route_assignments bra
      on bra.id = sba.bus_route_assignment_id
      and bra.tenant_id = sba.tenant_id
    join public.students s
      on s.id = sba.student_id
      and s.tenant_id = sba.tenant_id
    left join public.route_stops ps
      on ps.id = sba.pickup_stop_id
      and ps.tenant_id = sba.tenant_id
    left join public.route_stops ds
      on ds.id = sba.dropoff_stop_id
      and ds.tenant_id = sba.tenant_id
    where bra.bus_id = p_bus_id
      and sba.tenant_id = public.current_tenant_id()
  ) student_row;

  return jsonb_build_object(
    'bus', v_bus,
    'routeAssignments', v_routes,
    'driverAssignments', v_drivers,
    'studentAssignments', v_students
  );
end;
$$;

create or replace function public.admin_end_bus_route_assignment(
  p_bus_route_assignment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_service public.bus_route_assignments;
  v_driver_count integer;
  v_student_count integer;
begin
  if auth.uid() is null
    or v_tenant_id is null
    or not public.is_transportation_write_admin() then
    raise exception 'Admin tenant context is required.'
      using errcode = '42501';
  end if;

  select *
  into v_service
  from public.bus_route_assignments
  where id = p_bus_route_assignment_id
    and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Bus route assignment not found.'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.driver_route_assignments dra
    join public.driver_trips dt
      on dt.driver_route_assignment_id = dra.id
      and dt.tenant_id = dra.tenant_id
      and dt.status = 'active'
    where dra.bus_route_assignment_id = v_service.id
      and dra.tenant_id = v_tenant_id
  ) then
    raise exception 'End the active trip before ending this bus route assignment.'
      using errcode = '55006';
  end if;

  update public.driver_route_assignments
  set status = 'inactive'
  where bus_route_assignment_id = v_service.id
    and tenant_id = v_tenant_id
    and status = 'active';
  get diagnostics v_driver_count = row_count;

  update public.student_bus_assignments
  set status = 'inactive'
  where bus_route_assignment_id = v_service.id
    and tenant_id = v_tenant_id
    and status = 'active';
  get diagnostics v_student_count = row_count;

  update public.bus_route_assignments
  set status = 'inactive'
  where id = v_service.id
    and tenant_id = v_tenant_id;

  return jsonb_build_object(
    'busRouteAssignmentId', v_service.id,
    'driverAssignmentsEnded', v_driver_count,
    'studentAssignmentsEnded', v_student_count
  );
end;
$$;

create or replace function public.admin_replace_bus_trip_driver(
  p_bus_route_assignment_id uuid,
  p_driver_id uuid,
  p_effective_from date default current_date,
  p_effective_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_service public.bus_route_assignments;
  v_assignment public.driver_route_assignments;
begin
  if auth.uid() is null
    or v_tenant_id is null
    or not public.is_transportation_write_admin() then
    raise exception 'Admin tenant context is required.'
      using errcode = '42501';
  end if;

  if p_effective_from is null
    or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'Enter a valid driver assignment date range.'
      using errcode = '22007';
  end if;

  select *
  into v_service
  from public.bus_route_assignments
  where id = p_bus_route_assignment_id
    and tenant_id = v_tenant_id
    and status = 'active'
  for update;

  if not found then
    raise exception 'Active bus route assignment not found.'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.drivers d
    where d.id = p_driver_id
      and d.tenant_id = v_tenant_id
      and d.status = 'active'
  ) then
    raise exception 'Select an active driver in this organization.'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.driver_route_assignments dra
    join public.driver_trips dt
      on dt.driver_route_assignment_id = dra.id
      and dt.tenant_id = dra.tenant_id
      and dt.status = 'active'
    where dra.bus_route_assignment_id = v_service.id
      and dra.tenant_id = v_tenant_id
  ) then
    raise exception 'End the active trip before changing this driver.'
      using errcode = '55006';
  end if;

  update public.driver_route_assignments
  set status = 'inactive'
  where bus_route_assignment_id = v_service.id
    and tenant_id = v_tenant_id
    and status = 'active'
    and daterange(
      coalesce(effective_from, '-infinity'::date),
      coalesce(effective_to, 'infinity'::date),
      '[]'
    ) && daterange(
      p_effective_from,
      coalesce(p_effective_to, 'infinity'::date),
      '[]'
    );

  insert into public.driver_route_assignments (
    tenant_id,
    driver_id,
    bus_id,
    route_id,
    route_trip_pattern_id,
    bus_route_assignment_id,
    trip_type,
    status,
    effective_from,
    effective_to
  )
  values (
    v_tenant_id,
    p_driver_id,
    v_service.bus_id,
    v_service.route_id,
    v_service.route_trip_pattern_id,
    v_service.id,
    v_service.trip_type,
    'active',
    p_effective_from,
    p_effective_to
  )
  returning * into v_assignment;

  return to_jsonb(v_assignment);
end;
$$;

revoke all on function public.get_admin_bus_workspace(uuid) from public;
revoke all on function public.get_admin_bus_workspace(uuid) from anon;
grant execute on function public.get_admin_bus_workspace(uuid) to authenticated;

revoke all on function public.admin_end_bus_route_assignment(uuid) from public;
revoke all on function public.admin_end_bus_route_assignment(uuid) from anon;
grant execute on function public.admin_end_bus_route_assignment(uuid) to authenticated;

revoke all on function public.admin_replace_bus_trip_driver(uuid, uuid, date, date) from public;
revoke all on function public.admin_replace_bus_trip_driver(uuid, uuid, date, date) from anon;
grant execute on function public.admin_replace_bus_trip_driver(uuid, uuid, date, date) to authenticated;

comment on function public.get_admin_bus_workspace(uuid) is
  'Returns one RLS-scoped bus and its route-trip, driver, and student assignment history for the unified admin workspace.';
comment on function public.admin_end_bus_route_assignment(uuid) is
  'Atomically deactivates a bus route-trip assignment and linked active driver/student assignments after rejecting active-trip changes.';
comment on function public.admin_replace_bus_trip_driver(uuid, uuid, date, date) is
  'Atomically replaces overlapping driver assignments for one bus route trip after tenant, active-driver, and active-trip checks.';
