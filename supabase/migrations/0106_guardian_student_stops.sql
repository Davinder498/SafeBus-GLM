-- Guardian-scoped stop labels for current student bus assignments.
-- No coordinates, addresses, other students, or operational identifiers leave this function.
create or replace function public.get_guardian_student_stops()
returns table (
  student_id uuid,
  bus_number text,
  trip_name text,
  direction text,
  pickup_stop_name text,
  dropoff_stop_name text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_guardian_id uuid;
  v_tenant_id uuid;
begin
  if auth.uid() is null
    or public.current_user_role() is distinct from 'guardian'::public.user_role then
    raise exception 'Guardian student stops require an active guardian login.'
      using errcode = '42501';
  end if;

  v_tenant_id := public.current_tenant_id();
  v_guardian_id := public.current_guardian_id();
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
    dropoff.stop_name
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

revoke all on function public.get_guardian_student_stops() from public, anon;
grant execute on function public.get_guardian_student_stops() to authenticated;
