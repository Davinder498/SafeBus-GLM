-- SafeBus Alberta - planned driver/bus assignments
--
-- Driver route assignments are an administrative plan only. They communicate
-- expected work to drivers but never authorize or create an operational trip.
-- The QR-only start_bus_tracking_from_qr() flow remains the sole source of the
-- authoritative driver, bus, route, tracking-session, and trip relationship.

-- The original partial unique index ignored effective dates and prevented a
-- future plan for the same driver/service from coexisting with the current
-- plan. The route-trip overlap trigger added in migration 0045 is date-aware
-- and remains the governing constraint.
drop index if exists public.driver_route_assignments_active_unique;

create or replace function public.admin_set_driver_bus_assignment(
  p_driver_id uuid,
  p_bus_route_assignment_id uuid,
  p_effective_from date,
  p_effective_to date default null,
  p_existing_assignment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp
as $$
declare
  v_tenant_id uuid := safebus_private.current_tenant_id();
  v_service public.bus_route_assignments;
  v_existing public.driver_route_assignments;
  v_assignment public.driver_route_assignments;
  v_replacement_cutoff date;
  v_effective_today boolean;
begin
  if auth.uid() is null
    or v_tenant_id is null
    or safebus_private.current_user_role() <> 'tenant_admin' then
    raise exception 'Tenant administrator context is required.'
      using errcode = '42501';
  end if;

  if p_driver_id is null
    or p_bus_route_assignment_id is null
    or p_effective_from is null
    or (p_effective_to is not null and p_effective_to < p_effective_from) then
    raise exception 'Enter a valid planned assignment date range.'
      using errcode = '22007';
  end if;

  select bra.*
  into v_service
  from public.bus_route_assignments bra
  join public.buses b
    on b.id = bra.bus_id
    and b.tenant_id = bra.tenant_id
    and b.status = 'active'
  join public.routes r
    on r.id = bra.route_id
    and r.tenant_id = bra.tenant_id
    and r.status = 'active'
    and r.definition_status = 'ready'
  join public.route_trip_patterns rtp
    on rtp.id = bra.route_trip_pattern_id
    and rtp.tenant_id = bra.tenant_id
    and rtp.route_id = bra.route_id
    and rtp.status = 'active'
    and not rtp.schedule_review_required
  where bra.id = p_bus_route_assignment_id
    and bra.tenant_id = v_tenant_id
    and bra.status = 'active'
  for update of bra;

  if not found then
    raise exception 'Select an active, ready bus service in this organization.'
      using errcode = 'P0002';
  end if;

  if (v_service.effective_from is not null and p_effective_from < v_service.effective_from)
    or (p_effective_to is null and v_service.effective_to is not null)
    or (
      p_effective_to is not null
      and v_service.effective_to is not null
      and p_effective_to > v_service.effective_to
    ) then
    raise exception 'Planned dates must be within the selected bus service dates.'
      using errcode = '22007';
  end if;

  perform 1
  from public.drivers d
  where d.id = p_driver_id
    and d.tenant_id = v_tenant_id
    and d.status = 'active'
  for update;

  if not found then
    raise exception 'Select an active driver in this organization.'
      using errcode = '23514';
  end if;

  if p_existing_assignment_id is not null then
    select dra.*
    into v_existing
    from public.driver_route_assignments dra
    where dra.id = p_existing_assignment_id
      and dra.tenant_id = v_tenant_id
    for update;

    if not found then
      raise exception 'Planned driver assignment not found.'
        using errcode = 'P0002';
    end if;

    if v_existing.status <> 'active' then
      raise exception 'Historical planned assignments cannot be changed.'
        using errcode = '55006';
    end if;

    -- Driver detail edits may change the bus or dates, but not the route-trip
    -- pattern/direction. Bus workspace edits may change the driver only when
    -- the source planning row already belongs to that exact bus service.
    if not (
      (
        v_existing.driver_id = p_driver_id
        and v_existing.route_trip_pattern_id = v_service.route_trip_pattern_id
      )
      or v_existing.bus_route_assignment_id = v_service.id
    ) then
      raise exception 'The replacement must keep the same planned route direction or bus service.'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.driver_trips dt
      where dt.tenant_id = v_tenant_id
        and dt.status in ('active', 'paused')
        and (
          dt.driver_route_assignment_id = v_existing.id
          or (
            dt.driver_id = v_existing.driver_id
            and dt.bus_id = v_existing.bus_id
            and dt.route_id = v_existing.route_id
            and dt.route_trip_pattern_id = v_existing.route_trip_pattern_id
          )
        )
    ) then
      raise exception 'End or cancel the current trip before changing this planned assignment.'
        using errcode = '55006';
    end if;
  end if;

  v_effective_today := p_effective_from <= current_date
    and (p_effective_to is null or p_effective_to >= current_date);

  if v_effective_today and exists (
    select 1
    from public.driver_trips dt
    where dt.tenant_id = v_tenant_id
      and dt.status in ('active', 'paused')
      and (
        dt.driver_id = p_driver_id
        or (
          dt.bus_id = v_service.bus_id
          and dt.route_id = v_service.route_id
          and dt.route_trip_pattern_id = v_service.route_trip_pattern_id
        )
      )
  ) then
    raise exception 'End or cancel the current trip before changing today''s planned assignment.'
      using errcode = '55006';
  end if;

  if p_existing_assignment_id is not null then
    if p_effective_from > current_date
      and (
        v_existing.effective_from is null
        or p_effective_from > v_existing.effective_from
      ) then
      v_replacement_cutoff := p_effective_from - 1;

      update public.driver_route_assignments
      set
        effective_to = case
          when effective_to is null then v_replacement_cutoff
          else least(effective_to, v_replacement_cutoff)
        end,
        status = case
          when coalesce(effective_to, v_replacement_cutoff) < current_date then 'inactive'
          else 'active'
        end
      where id = v_existing.id;
    else
      update public.driver_route_assignments
      set status = 'inactive'
      where id = v_existing.id;
    end if;
  end if;

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

revoke all on function public.admin_set_driver_bus_assignment(uuid, uuid, date, date, uuid) from public;
revoke all on function public.admin_set_driver_bus_assignment(uuid, uuid, date, date, uuid) from anon;
grant execute on function public.admin_set_driver_bus_assignment(uuid, uuid, date, date, uuid) to authenticated;

comment on function public.admin_set_driver_bus_assignment(uuid, uuid, date, date, uuid) is
  'Atomically creates or replaces a tenant-admin planned driver/bus assignment. Planning never starts a trip; QR-confirmed driver_trips remain operational truth.';
