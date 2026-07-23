-- SafeBus Alberta - driver completed trip history
--
-- Routes and trip patterns are reusable definitions. driver_trips are dated
-- operational runs that become active when a driver starts them and completed
-- when the driver ends them. This RPC exposes only the current driver's safe,
-- completed-run summary; it never returns students or location history.

create or replace function public.get_driver_completed_trip_history(p_limit integer default 50)
returns table (
  driver_trip_id uuid,
  service_date date,
  started_at timestamptz,
  ended_at timestamptz,
  route_name text,
  route_code text,
  trip_name text,
  direction text,
  bus_number text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_driver_id uuid := public.current_driver_id();
  v_tenant_id uuid := public.current_tenant_id();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if auth.uid() is null or public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can view completed trip history.' using errcode = '42501';
  end if;
  if v_driver_id is null or v_tenant_id is null then
    raise exception 'An active driver identity is required.' using errcode = '42501';
  end if;

  return query
  select
    dt.id,
    dt.service_date,
    dt.started_at,
    dt.ended_at,
    r.route_name,
    r.route_code,
    coalesce(dt.trip_name_snapshot, rtp.display_name),
    rtp.direction,
    b.bus_number
  from public.driver_trips dt
  join public.routes r
    on r.id = dt.route_id
    and r.tenant_id = dt.tenant_id
  join public.buses b
    on b.id = dt.bus_id
    and b.tenant_id = dt.tenant_id
  join public.route_trip_patterns rtp
    on rtp.id = dt.route_trip_pattern_id
    and rtp.route_id = dt.route_id
    and rtp.tenant_id = dt.tenant_id
  where dt.tenant_id = v_tenant_id
    and dt.driver_id = v_driver_id
    and dt.status = 'completed'
    and dt.ended_at is not null
  order by dt.ended_at desc, dt.id
  limit v_limit;
end;
$$;

revoke all on function public.get_driver_completed_trip_history(integer) from public, anon;
grant execute on function public.get_driver_completed_trip_history(integer) to authenticated;

comment on function public.get_driver_completed_trip_history(integer) is
  'Driver-only recent completed trip summaries. Includes inactive route definitions for historical accuracy and excludes students and locations.';
