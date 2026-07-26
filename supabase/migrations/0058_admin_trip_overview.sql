-- SafeBus Alberta - tenant-scoped administrative trip summaries
--
-- Routes and route trip patterns are reusable definitions. driver_trips rows
-- are the dated operational runs returned here. This bounded RPC deliberately
-- excludes students, guardians, contact details, and location history.

create or replace function public.get_admin_trip_overview(p_limit integer default 50)
returns table (
  trip_id uuid,
  service_date date,
  status text,
  started_at timestamptz,
  ended_at timestamptz,
  route_name text,
  route_code text,
  trip_pattern_name text,
  direction text,
  bus_label text,
  driver_label text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if auth.uid() is null
    or public.current_user_role() not in (
      'tenant_admin', 'school_admin', 'transportation_admin'
    ) then
    raise exception 'Only an authorized tenant administrator can view trip summaries.'
      using errcode = '42501';
  end if;

  if v_tenant_id is null then
    raise exception 'An active tenant identity is required.' using errcode = '42501';
  end if;

  return query
  select
    dt.id,
    dt.service_date,
    dt.status,
    dt.started_at,
    dt.ended_at,
    r.route_name,
    r.route_code,
    coalesce(dt.trip_name_snapshot, rtp.display_name),
    rtp.direction,
    b.bus_number,
    p.full_name
  from public.driver_trips dt
  join public.routes r
    on r.id = dt.route_id
    and r.tenant_id = dt.tenant_id
  join public.route_trip_patterns rtp
    on rtp.id = dt.route_trip_pattern_id
    and rtp.route_id = dt.route_id
    and rtp.tenant_id = dt.tenant_id
  join public.buses b
    on b.id = dt.bus_id
    and b.tenant_id = dt.tenant_id
  join public.drivers d
    on d.id = dt.driver_id
    and d.tenant_id = dt.tenant_id
  join public.profiles p
    on p.id = d.profile_id
    and p.tenant_id = dt.tenant_id
  where dt.tenant_id = v_tenant_id
    and dt.status in ('active', 'completed', 'cancelled')
  order by dt.service_date desc, dt.started_at desc, dt.id
  limit v_limit;
end;
$$;

revoke all on function public.get_admin_trip_overview(integer) from public, anon;
grant execute on function public.get_admin_trip_overview(integer) to authenticated;

comment on function public.get_admin_trip_overview(integer) is
  'Bounded, tenant-scoped operational run summaries for tenant, school, and transportation administrators. SECURITY DEFINER with explicit authorization and tenant-safe joins.';
