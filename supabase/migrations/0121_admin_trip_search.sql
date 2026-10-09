-- Read-only recorded trip search. Prepare only: production adoption remains
-- subject to the protected release workflow. No existing RPC is replaced.
create function public.search_admin_trips(
  p_from_date date default null,
  p_to_date date default null,
  p_status text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_role text := public.current_user_role()::text;
  v_result jsonb;
begin
  if auth.uid() is null or v_tenant_id is null or v_role is null
    or v_role not in ('tenant_admin', 'school_admin', 'transportation_admin') then
    raise exception 'An authorized tenant administrator is required.' using errcode = '42501';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not in (25, 50, 100) then
    raise exception 'Invalid trip search page.' using errcode = '22023';
  end if;
  if (p_from_date is null) <> (p_to_date is null)
    or p_from_date > p_to_date
    or (p_from_date is not null and (not isfinite(p_from_date) or not isfinite(p_to_date))) then
    raise exception 'Choose valid inclusive service dates.' using errcode = '22023';
  end if;
  if p_status is not null and p_status not in ('active', 'paused', 'completed', 'cancelled') then
    raise exception 'Invalid trip status.' using errcode = '22023';
  end if;

  -- RLS applies to every relation under the authenticated caller. Retain
  -- explicit tenant-safe joins and school scope as additional restrictions.
  with filtered as materialized (
    select dt.id as trip_id, dt.service_date, dt.status, dt.started_at, dt.ended_at,
      r.route_name, r.route_code,
      coalesce(dt.trip_name_snapshot, rtp.display_name) as trip_pattern_name,
      rtp.direction, b.bus_number as bus_label, p.full_name as driver_label
    from public.driver_trips dt
    join public.routes r on r.id = dt.route_id and r.tenant_id = dt.tenant_id
    join public.route_trip_patterns rtp on rtp.id = dt.route_trip_pattern_id
      and rtp.route_id = dt.route_id and rtp.tenant_id = dt.tenant_id
    join public.buses b on b.id = dt.bus_id and b.tenant_id = dt.tenant_id
    join public.drivers d on d.id = dt.driver_id and d.tenant_id = dt.tenant_id
    join public.profiles p on p.id = d.profile_id and p.tenant_id = dt.tenant_id
    where dt.tenant_id = v_tenant_id
      and dt.status in ('active', 'paused', 'completed', 'cancelled')
      and (v_role <> 'school_admin' or r.school_id = public.current_school_id())
      and (p_from_date is null or dt.service_date >= p_from_date)
      and (p_to_date is null or dt.service_date <= p_to_date)
      and (p_status is null or dt.status = p_status)
  ), page_rows as (
    select * from filtered
    order by service_date desc, started_at desc, trip_id
    limit p_page_size offset ((p_page::bigint - 1) * p_page_size)
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(pr) order by pr.service_date desc, pr.started_at desc, pr.trip_id)
      from page_rows pr), '[]'::jsonb),
    'totalCount', (select count(*) from filtered)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.search_admin_trips(date, date, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.search_admin_trips(date, date, text, integer, integer) to authenticated;

comment on function public.search_admin_trips(date, date, text, integer, integer) is
  'Read-only recorded trip search with inclusive service-date filters, total matching count, bounded pages, caller RLS and explicit tenant/school restrictions.';
