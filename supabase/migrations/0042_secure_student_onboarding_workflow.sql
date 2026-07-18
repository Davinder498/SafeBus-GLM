-- SafeBus Alberta - secure tenant-admin student onboarding workflow
--
-- Adds bounded, tenant-scoped search RPCs and one transactional RPC that can
-- create a student, link an existing/provisioned guardian, create or reuse a
-- route and bus, create or reuse route stops, and assign the student to the
-- resulting bus service.
--
-- Guardian Auth invitations are intentionally not created in Postgres. They
-- remain in the server-only onboarding function. That function provisions the
-- guardian first and passes only its tenant-scoped guardian id to this RPC.

create index if not exists guardians_tenant_active_name_prefix_idx
  on public.guardians (tenant_id, (lower(full_name)) text_pattern_ops, id)
  where status = 'active';

create index if not exists guardians_tenant_active_email_prefix_idx
  on public.guardians (tenant_id, (lower(email)) text_pattern_ops, id)
  where status = 'active';

create index if not exists routes_tenant_active_name_prefix_idx
  on public.routes (tenant_id, (lower(route_name)) text_pattern_ops, id)
  where status = 'active';

create index if not exists routes_tenant_active_code_prefix_idx
  on public.routes (tenant_id, (lower(route_code)) text_pattern_ops, id)
  where status = 'active';

create index if not exists buses_tenant_active_number_prefix_idx
  on public.buses (tenant_id, (lower(bus_number)) text_pattern_ops, id)
  where status = 'active';

create or replace function public.search_admin_guardians(
  p_search text,
  p_limit integer default 20
)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  profile_status text
)
language sql
stable
security invoker
set search_path = public
as $$
  select g.id, g.full_name, g.email, g.phone, p.status::text
  from public.guardians g
  join public.profiles p
    on p.id = g.profile_id
   and p.tenant_id = g.tenant_id
   and p.role = 'guardian'
  where public.current_user_role() = 'tenant_admin'
    and g.tenant_id = public.current_tenant_id()
    and g.status = 'active'
    and (
      lower(g.full_name) like lower(trim(p_search)) || '%'
      or lower(g.email) like lower(trim(p_search)) || '%'
    )
  order by g.full_name, g.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.search_admin_routes(
  p_search text,
  p_limit integer default 20
)
returns table (
  id uuid,
  route_name text,
  route_code text,
  route_type text
)
language sql
stable
security invoker
set search_path = public
as $$
  select r.id, r.route_name, r.route_code, r.route_type
  from public.routes r
  where public.current_user_role() = 'tenant_admin'
    and r.tenant_id = public.current_tenant_id()
    and r.status = 'active'
    and (
      lower(r.route_name) like lower(trim(p_search)) || '%'
      or lower(r.route_code) like lower(trim(p_search)) || '%'
    )
  order by r.route_code, r.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.search_admin_buses(
  p_search text,
  p_limit integer default 20
)
returns table (
  id uuid,
  bus_number text,
  license_plate text,
  capacity integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select b.id, b.bus_number, b.license_plate, b.capacity
  from public.buses b
  where public.current_user_role() = 'tenant_admin'
    and b.tenant_id = public.current_tenant_id()
    and b.status = 'active'
    and lower(b.bus_number) like lower(trim(p_search)) || '%'
  order by b.bus_number, b.id
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.get_admin_route_stop_options(p_route_id uuid)
returns table (
  id uuid,
  stop_name text,
  stop_order integer,
  planned_arrival_time time
)
language sql
stable
security invoker
set search_path = public
as $$
  select rs.id, rs.stop_name, rs.stop_order, rs.planned_arrival_time
  from public.route_stops rs
  join public.routes r
    on r.id = rs.route_id
   and r.tenant_id = rs.tenant_id
  where public.current_user_role() = 'tenant_admin'
    and rs.tenant_id = public.current_tenant_id()
    and rs.route_id = p_route_id
    and rs.status = 'active'
    and r.status = 'active'
  order by rs.stop_order, rs.id
  limit 250;
$$;

create or replace function public.admin_create_student_onboarding(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_student_id uuid;
  v_school_id uuid;
  v_guardian_id uuid;
  v_guardian_link_id uuid;
  v_route_id uuid;
  v_bus_id uuid;
  v_service_id uuid;
  v_pickup_stop_id uuid;
  v_dropoff_stop_id uuid;
  v_assignment_id uuid;
  v_first_name text := btrim(coalesce(p_payload #>> '{student,firstName}', ''));
  v_last_name text := btrim(coalesce(p_payload #>> '{student,lastName}', ''));
  v_preferred_name text := nullif(btrim(coalesce(p_payload #>> '{student,preferredName}', '')), '');
  v_grade text := nullif(btrim(coalesce(p_payload #>> '{student,grade}', '')), '');
  v_school_student_number text := nullif(btrim(coalesce(p_payload #>> '{student,schoolStudentNumber}', '')), '');
  v_relationship text := coalesce(nullif(btrim(p_payload #>> '{guardian,relationship}'), ''), 'guardian');
  v_transportation_enabled boolean := coalesce((p_payload #>> '{transportation,enabled}')::boolean, false);
  v_route_name text;
  v_route_code text;
  v_route_type text;
  v_bus_number text;
  v_license_plate text;
  v_capacity integer;
  v_trip_type text;
  v_effective_from date;
  v_stop_order integer;
  v_pickup_mode text;
  v_dropoff_mode text;
  v_new_stop_name text;
  v_new_stop_time time;
  v_link public.student_guardians;
begin
  if auth.uid() is null or v_tenant_id is null then
    raise exception 'Authentication and tenant context are required.' using errcode = '42501';
  end if;

  if public.current_user_role() <> 'tenant_admin' then
    raise exception 'Only a tenant administrator can use student onboarding.' using errcode = '42501';
  end if;

  if p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or octet_length(p_payload::text) > 32768 then
    raise exception 'Invalid student onboarding payload.' using errcode = '22023';
  end if;

  if v_first_name = '' or v_last_name = '' then
    raise exception 'Student first name and last name are required.' using errcode = '22023';
  end if;

  if length(v_first_name) > 100
     or length(v_last_name) > 100
     or length(coalesce(v_preferred_name, '')) > 100
     or length(coalesce(v_grade, '')) > 40
     or length(coalesce(v_school_student_number, '')) > 100 then
    raise exception 'One or more student fields are too long.' using errcode = '22023';
  end if;

  v_school_id := nullif(p_payload #>> '{student,schoolId}', '')::uuid;
  if v_school_id is not null and not exists (
    select 1
    from public.schools s
    where s.id = v_school_id
      and s.tenant_id = v_tenant_id
      and s.status = 'active'
  ) then
    raise exception 'School not found in your tenant.' using errcode = 'P0002';
  end if;

  v_guardian_id := nullif(p_payload #>> '{guardian,id}', '')::uuid;
  if v_guardian_id is not null then
    if v_relationship not in ('mother', 'father', 'guardian', 'caregiver', 'other') then
      raise exception 'Invalid guardian relationship.' using errcode = '22023';
    end if;
    if not exists (
      select 1
      from public.guardians g
      join public.profiles p
        on p.id = g.profile_id
       and p.tenant_id = g.tenant_id
       and p.role = 'guardian'
      where g.id = v_guardian_id
        and g.tenant_id = v_tenant_id
        and g.status = 'active'
        and p.status in ('invited', 'active')
    ) then
      raise exception 'Guardian not found in your tenant.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.students (
    tenant_id,
    school_id,
    first_name,
    last_name,
    preferred_name,
    grade,
    school_student_number,
    status
  )
  values (
    v_tenant_id,
    v_school_id,
    v_first_name,
    v_last_name,
    v_preferred_name,
    v_grade,
    v_school_student_number,
    'active'
  )
  returning id into v_student_id;

  if v_guardian_id is not null then
    select * into v_link
    from public.admin_link_student_guardian(
      v_student_id,
      v_guardian_id,
      v_relationship,
      true
    );
    v_guardian_link_id := v_link.id;
  end if;

  if v_transportation_enabled then
    v_route_id := nullif(p_payload #>> '{transportation,route,id}', '')::uuid;
    if v_route_id is null then
      v_route_name := btrim(coalesce(p_payload #>> '{transportation,route,name}', ''));
      v_route_code := btrim(coalesce(p_payload #>> '{transportation,route,code}', ''));
      v_route_type := coalesce(nullif(btrim(p_payload #>> '{transportation,route,type}'), ''), 'morning');
      if v_route_name = '' or v_route_code = '' then
        raise exception 'Route name and code are required for a new route.' using errcode = '22023';
      end if;
      if length(v_route_name) > 160 or length(v_route_code) > 40 then
        raise exception 'Route name or code is too long.' using errcode = '22023';
      end if;
      if v_route_type not in ('morning', 'afternoon', 'special', 'field_trip') then
        raise exception 'Invalid route type.' using errcode = '22023';
      end if;
      insert into public.routes (
        tenant_id, school_id, route_name, route_code, route_type, status
      )
      values (
        v_tenant_id, v_school_id, v_route_name, v_route_code, v_route_type, 'active'
      )
      returning id into v_route_id;
    elsif not exists (
      select 1
      from public.routes r
      where r.id = v_route_id
        and r.tenant_id = v_tenant_id
        and r.status = 'active'
    ) then
      raise exception 'Route not found in your tenant.' using errcode = 'P0002';
    end if;

    v_bus_id := nullif(p_payload #>> '{transportation,bus,id}', '')::uuid;
    if v_bus_id is null then
      v_bus_number := btrim(coalesce(p_payload #>> '{transportation,bus,number}', ''));
      v_license_plate := nullif(btrim(coalesce(p_payload #>> '{transportation,bus,licensePlate}', '')), '');
      v_capacity := nullif(p_payload #>> '{transportation,bus,capacity}', '')::integer;
      if v_bus_number = '' then
        raise exception 'Bus number is required for a new bus.' using errcode = '22023';
      end if;
      if length(v_bus_number) > 40 or length(coalesce(v_license_plate, '')) > 40 then
        raise exception 'Bus number or license plate is too long.' using errcode = '22023';
      end if;
      if v_capacity is not null and (v_capacity < 0 or v_capacity > 200) then
        raise exception 'Bus capacity must be between 0 and 200.' using errcode = '22023';
      end if;
      insert into public.buses (
        tenant_id, school_id, bus_number, license_plate, capacity, status
      )
      values (
        v_tenant_id, v_school_id, v_bus_number, v_license_plate, v_capacity, 'active'
      )
      returning id into v_bus_id;
    elsif not exists (
      select 1
      from public.buses b
      where b.id = v_bus_id
        and b.tenant_id = v_tenant_id
        and b.status = 'active'
    ) then
      raise exception 'Bus not found in your tenant.' using errcode = 'P0002';
    end if;

    v_pickup_mode := coalesce(nullif(p_payload #>> '{transportation,pickupStop,mode}', ''), 'none');
    v_dropoff_mode := coalesce(nullif(p_payload #>> '{transportation,dropoffStop,mode}', ''), 'none');
    if v_pickup_mode not in ('none', 'existing', 'new')
       or v_dropoff_mode not in ('none', 'existing', 'new') then
      raise exception 'Invalid stop selection mode.' using errcode = '22023';
    end if;

    if v_pickup_mode = 'existing' then
      v_pickup_stop_id := nullif(p_payload #>> '{transportation,pickupStop,id}', '')::uuid;
      if v_pickup_stop_id is null or not exists (
        select 1
        from public.route_stops rs
        where rs.id = v_pickup_stop_id
          and rs.tenant_id = v_tenant_id
          and rs.route_id = v_route_id
          and rs.status = 'active'
      ) then
        raise exception 'Pickup stop not found on the selected route.' using errcode = 'P0002';
      end if;
    end if;

    if v_dropoff_mode = 'existing' then
      v_dropoff_stop_id := nullif(p_payload #>> '{transportation,dropoffStop,id}', '')::uuid;
      if v_dropoff_stop_id is null or not exists (
        select 1
        from public.route_stops rs
        where rs.id = v_dropoff_stop_id
          and rs.tenant_id = v_tenant_id
          and rs.route_id = v_route_id
          and rs.status = 'active'
      ) then
        raise exception 'Drop-off stop not found on the selected route.' using errcode = 'P0002';
      end if;
    end if;

    if v_pickup_mode = 'new' or v_dropoff_mode = 'new' then
      -- Serialize stop-order allocation for this route so concurrent
      -- onboarding requests cannot claim the same route stop order.
      perform pg_advisory_xact_lock(hashtextextended(v_route_id::text, 0));
    end if;

    if v_pickup_mode = 'new' then
      v_new_stop_name := btrim(coalesce(p_payload #>> '{transportation,pickupStop,name}', ''));
      v_new_stop_time := nullif(p_payload #>> '{transportation,pickupStop,plannedTime}', '')::time;
      if v_new_stop_name = '' or length(v_new_stop_name) > 160 then
        raise exception 'A valid pickup stop name is required.' using errcode = '22023';
      end if;
      select coalesce(max(rs.stop_order), 0) + 1
      into v_stop_order
      from public.route_stops rs
      where rs.route_id = v_route_id;
      insert into public.route_stops (
        tenant_id, route_id, school_id, stop_name, stop_order,
        planned_arrival_time, latitude, longitude, status
      )
      values (
        v_tenant_id, v_route_id, v_school_id, v_new_stop_name, v_stop_order,
        v_new_stop_time, null, null, 'active'
      )
      returning id into v_pickup_stop_id;
    end if;

    if v_dropoff_mode = 'new' then
      v_new_stop_name := btrim(coalesce(p_payload #>> '{transportation,dropoffStop,name}', ''));
      v_new_stop_time := nullif(p_payload #>> '{transportation,dropoffStop,plannedTime}', '')::time;
      if v_new_stop_name = '' or length(v_new_stop_name) > 160 then
        raise exception 'A valid drop-off stop name is required.' using errcode = '22023';
      end if;
      select coalesce(max(rs.stop_order), 0) + 1
      into v_stop_order
      from public.route_stops rs
      where rs.route_id = v_route_id;
      insert into public.route_stops (
        tenant_id, route_id, school_id, stop_name, stop_order,
        planned_arrival_time, latitude, longitude, status
      )
      values (
        v_tenant_id, v_route_id, v_school_id, v_new_stop_name, v_stop_order,
        v_new_stop_time, null, null, 'active'
      )
      returning id into v_dropoff_stop_id;
    end if;

    v_trip_type := coalesce(nullif(p_payload #>> '{transportation,tripType}', ''), 'morning');
    if v_trip_type not in ('morning', 'evening') then
      raise exception 'Invalid bus service trip type.' using errcode = '22023';
    end if;
    v_effective_from := coalesce(
      nullif(p_payload #>> '{transportation,effectiveFrom}', '')::date,
      current_date
    );

    insert into public.bus_route_assignments (
      tenant_id, bus_id, route_id, trip_type, effective_from, status
    )
    values (
      v_tenant_id, v_bus_id, v_route_id, v_trip_type, v_effective_from, 'active'
    )
    on conflict (tenant_id, bus_id, route_id, trip_type)
      where status = 'active'
    do update set updated_at = now()
    returning id into v_service_id;

    insert into public.student_bus_assignments (
      tenant_id,
      student_id,
      bus_route_assignment_id,
      pickup_stop_id,
      dropoff_stop_id,
      effective_from,
      status
    )
    values (
      v_tenant_id,
      v_student_id,
      v_service_id,
      v_pickup_stop_id,
      v_dropoff_stop_id,
      v_effective_from,
      'active'
    )
    returning id into v_assignment_id;
  end if;

  return jsonb_build_object(
    'studentId', v_student_id,
    'guardianLinkId', v_guardian_link_id,
    'routeId', v_route_id,
    'busId', v_bus_id,
    'busServiceId', v_service_id,
    'studentBusAssignmentId', v_assignment_id,
    'pickupStopId', v_pickup_stop_id,
    'dropoffStopId', v_dropoff_stop_id
  );
end;
$$;

revoke all on function public.search_admin_guardians(text, integer) from public, anon;
revoke all on function public.search_admin_routes(text, integer) from public, anon;
revoke all on function public.search_admin_buses(text, integer) from public, anon;
revoke all on function public.get_admin_route_stop_options(uuid) from public, anon;
revoke all on function public.admin_create_student_onboarding(jsonb) from public, anon;

grant execute on function public.search_admin_guardians(text, integer) to authenticated;
grant execute on function public.search_admin_routes(text, integer) to authenticated;
grant execute on function public.search_admin_buses(text, integer) to authenticated;
grant execute on function public.get_admin_route_stop_options(uuid) to authenticated;
grant execute on function public.admin_create_student_onboarding(jsonb) to authenticated;

comment on function public.admin_create_student_onboarding(jsonb) is
  'Tenant-admin-only transactional student onboarding. Tenant scope is derived '
  'from auth context. Existing entity ids are revalidated inside the tenant. '
  'No service-role or guardian-controlled tenant id is accepted.';
