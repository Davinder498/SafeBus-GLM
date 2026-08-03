-- SafeBus Alberta - server-enforced bus route assignment edits and renewals
--
-- Route assignment identity and active-trip safety previously depended on the
-- admin UI. These tenant-scoped writers make those rules authoritative in
-- Postgres and preserve historical rows when an assignment is renewed.

create or replace function public.admin_update_bus_route_assignment(
  p_bus_route_assignment_id uuid,
  p_route_id uuid,
  p_route_trip_pattern_id uuid,
  p_trip_type text,
  p_effective_from date,
  p_effective_to date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_service public.bus_route_assignments;
  v_updated public.bus_route_assignments;
  v_identity_changed boolean;
begin
  if auth.uid() is null
    or v_tenant_id is null
    or not public.is_transportation_write_admin() then
    raise exception 'Admin tenant context is required.'
      using errcode = '42501';
  end if;

  if p_route_id is null
    or p_route_trip_pattern_id is null
    or p_effective_from is null
    or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'Enter a valid route assignment and date range.'
      using errcode = '22007';
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

  if v_service.status <> 'active' then
    raise exception 'Historical route assignments cannot be edited. Renew the assignment instead.'
      using errcode = '55006';
  end if;

  if not exists (
    select 1
    from public.buses b
    join public.routes r
      on r.id = p_route_id
      and r.tenant_id = b.tenant_id
      and r.status = 'active'
    join public.route_trip_patterns rtp
      on rtp.id = p_route_trip_pattern_id
      and rtp.route_id = r.id
      and rtp.tenant_id = r.tenant_id
      and rtp.status = 'active'
      and not rtp.schedule_review_required
    where b.id = v_service.bus_id
      and b.tenant_id = v_tenant_id
      and b.status = 'active'
      and p_trip_type = case when rtp.direction = 'reverse' then 'evening' else 'morning' end
  ) then
    raise exception 'Choose an active bus and a map-ready route with a reviewed named trip.'
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
    raise exception 'End the active trip before updating this route assignment.'
      using errcode = '55006';
  end if;

  v_identity_changed :=
    v_service.route_id is distinct from p_route_id
    or v_service.route_trip_pattern_id is distinct from p_route_trip_pattern_id
    or v_service.trip_type is distinct from p_trip_type;

  if v_identity_changed and (
    exists (
      select 1
      from public.driver_route_assignments dra
      where dra.bus_route_assignment_id = v_service.id
        and dra.tenant_id = v_tenant_id
    )
    or exists (
      select 1
      from public.student_bus_assignments sba
      where sba.bus_route_assignment_id = v_service.id
        and sba.tenant_id = v_tenant_id
    )
  ) then
    raise exception 'Route and named trip cannot change after people or history are linked. Create a new assignment instead.'
      using errcode = '55006';
  end if;

  update public.bus_route_assignments
  set
    route_id = p_route_id,
    route_trip_pattern_id = p_route_trip_pattern_id,
    trip_type = p_trip_type,
    effective_from = p_effective_from,
    effective_to = p_effective_to
  where id = v_service.id
    and tenant_id = v_tenant_id
  returning * into v_updated;

  return to_jsonb(v_updated);
end;
$$;

create or replace function public.admin_renew_bus_route_assignment(
  p_bus_route_assignment_id uuid,
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
  v_renewed public.bus_route_assignments;
begin
  if auth.uid() is null
    or v_tenant_id is null
    or not public.is_transportation_write_admin() then
    raise exception 'Admin tenant context is required.'
      using errcode = '42501';
  end if;

  if p_effective_from is null
    or p_effective_from < current_date
    or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'Renewal must start today or later and use a valid date range.'
      using errcode = '22007';
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

  if v_service.status = 'active'
    and (v_service.effective_to is null or v_service.effective_to >= current_date) then
    raise exception 'Only a historical or expired route assignment can be renewed.'
      using errcode = '55006';
  end if;

  if not exists (
    select 1
    from public.buses b
    join public.routes r
      on r.id = v_service.route_id
      and r.tenant_id = b.tenant_id
      and r.status = 'active'
    join public.route_trip_patterns rtp
      on rtp.id = v_service.route_trip_pattern_id
      and rtp.route_id = r.id
      and rtp.tenant_id = r.tenant_id
      and rtp.status = 'active'
      and not rtp.schedule_review_required
    where b.id = v_service.bus_id
      and b.tenant_id = v_tenant_id
      and b.status = 'active'
      and v_service.trip_type = case when rtp.direction = 'reverse' then 'evening' else 'morning' end
  ) then
    raise exception 'This historical assignment cannot be renewed until its bus, route, and named trip are active and ready.'
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
    raise exception 'End the active trip before renewing this route assignment.'
      using errcode = '55006';
  end if;

  update public.driver_route_assignments
  set status = 'inactive'
  where bus_route_assignment_id = v_service.id
    and tenant_id = v_tenant_id
    and status = 'active';

  update public.student_bus_assignments
  set status = 'inactive'
  where bus_route_assignment_id = v_service.id
    and tenant_id = v_tenant_id
    and status = 'active';

  update public.bus_route_assignments
  set status = 'inactive'
  where id = v_service.id
    and tenant_id = v_tenant_id
    and status = 'active';

  insert into public.bus_route_assignments (
    tenant_id,
    bus_id,
    route_id,
    route_trip_pattern_id,
    trip_type,
    effective_from,
    effective_to,
    status
  )
  values (
    v_tenant_id,
    v_service.bus_id,
    v_service.route_id,
    v_service.route_trip_pattern_id,
    v_service.trip_type,
    p_effective_from,
    p_effective_to,
    'active'
  )
  returning * into v_renewed;

  return to_jsonb(v_renewed);
end;
$$;

-- All route-assignment updates now pass through audited server operations.
drop policy if exists "bus_route_assignments update admin" on public.bus_route_assignments;
revoke update on public.bus_route_assignments from authenticated;

revoke all on function public.admin_update_bus_route_assignment(uuid, uuid, uuid, text, date, date)
  from public;
revoke all on function public.admin_update_bus_route_assignment(uuid, uuid, uuid, text, date, date)
  from anon;
grant execute on function public.admin_update_bus_route_assignment(uuid, uuid, uuid, text, date, date)
  to authenticated;

revoke all on function public.admin_renew_bus_route_assignment(uuid, date, date) from public;
revoke all on function public.admin_renew_bus_route_assignment(uuid, date, date) from anon;
grant execute on function public.admin_renew_bus_route_assignment(uuid, date, date) to authenticated;

comment on function public.admin_update_bus_route_assignment(uuid, uuid, uuid, text, date, date) is
  'Tenant-scoped route assignment editor that rejects active-trip changes and locks route identity after dependent history exists.';
comment on function public.admin_renew_bus_route_assignment(uuid, date, date) is
  'Atomically closes an expired or historical route assignment and creates a new active date range without rewriting history.';
