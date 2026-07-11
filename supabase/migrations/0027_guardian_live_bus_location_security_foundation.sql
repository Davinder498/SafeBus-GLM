-- SafeBus Alberta - guardian live bus location security foundation
--
-- Milestone 11A: backend-only guardian live bus map security foundation.
--
-- This migration is ADDITIVE ONLY. It creates one narrow SECURITY DEFINER RPC:
--   public.get_guardian_student_live_bus_location_state()
--
-- The RPC accepts no guardian-controlled identity or scope parameters. Caller
-- identity is derived only from auth.uid(), current_user_role(),
-- current_tenant_id(), and current_guardian_id().
--
-- RETURN SHAPE:
--   student_id, location_state, latitude, longitude, location_recorded_at,
--   location_age_seconds
--
-- CONTROLLED location_state VALUES:
--   fresh   - current valid coordinates recorded within the accepted admin
--             fleet freshness threshold of 2 minutes.
--   stale   - current valid coordinates exist, but are older than 2 minutes;
--             stale coordinates are withheld.
--   missing - one applicable active trip exists, but no matching current
--             location row exists.
--   invalid - a matching current row is unsafe to represent, or one student
--             resolves to multiple different active trips.
--
-- DELIBERATELY EXCLUDED:
--   guardian identity/contact data, student names, route/trip/bus/driver IDs,
--   driver identity/contact data, speed, device metadata, history, manifest
--   data, pickup/drop-off events, addresses, stops, route geometry, QR data,
--   notifications, ETA, and realtime/polling behavior.
--
-- SECURITY MODEL:
--   SECURITY DEFINER bypasses table RLS, so all authorization is enforced
--   inside this function:
--     1. auth.uid() must exist.
--     2. current_user_role() must be guardian.
--     3. current_guardian_id() must resolve to an active guardian row.
--     4. current_tenant_id() must resolve to the caller tenant.
--     5. students must be active and in the caller tenant.
--     6. student_guardians must be active, same-tenant, and linked to the
--        caller's active guardian identity.
--     7. route assignments must be active, same-tenant, and date-applicable.
--     8. active trips must be same-tenant and on an assigned route.
--     9. active trips must reference same-tenant active bus and driver rows.
--    10. current location rows must match the selected trip, tenant, route,
--        bus, and driver.
--   No guardian SELECT grants or RLS policies are added on live-location tables.

create or replace function public.get_guardian_student_live_bus_location_state()
returns table (
  student_id uuid,
  location_state text,
  latitude double precision,
  longitude double precision,
  location_recorded_at timestamptz,
  location_age_seconds bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_guardian_id uuid;
  v_tenant_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Guardian live bus location access requires authentication.' using errcode = '42501';
  end if;

  if public.current_user_role() is distinct from 'guardian'::public.user_role then
    raise exception 'Guardian live bus location access requires an active guardian role.' using errcode = '42501';
  end if;

  v_tenant_id := public.current_tenant_id();
  v_guardian_id := public.current_guardian_id();

  if v_tenant_id is null or v_guardian_id is null then
    raise exception 'Guardian live bus location access requires an active guardian identity.' using errcode = '42501';
  end if;

  return query
  with eligible_students as (
    select distinct s.id as student_id, s.tenant_id
    from public.students s
    join public.student_guardians sg
      on sg.student_id = s.id
     and sg.tenant_id = s.tenant_id
     and sg.guardian_id = v_guardian_id
     and sg.status = 'active'
    where s.tenant_id = v_tenant_id
      and s.status = 'active'
  ),
  active_trip_candidates as (
    select distinct
      es.student_id,
      dt.id as driver_trip_id,
      dt.tenant_id,
      dt.driver_id,
      dt.bus_id,
      dt.route_id,
      dt.started_at
    from eligible_students es
    join public.student_route_assignments sra
      on sra.student_id = es.student_id
     and sra.tenant_id = es.tenant_id
     and sra.status = 'active'
     and sra.effective_from <= current_date
     and (sra.effective_to is null or sra.effective_to >= current_date)
    join public.routes r
      on r.id = sra.route_id
     and r.tenant_id = es.tenant_id
     and r.status = 'active'
    join public.driver_trips dt
      on dt.route_id = r.id
     and dt.tenant_id = es.tenant_id
     and dt.status = 'active'
    join public.buses b
      on b.id = dt.bus_id
     and b.tenant_id = es.tenant_id
     and b.status = 'active'
    join public.drivers d
      on d.id = dt.driver_id
     and d.tenant_id = es.tenant_id
     and d.status = 'active'
  ),
  trip_rollup as (
    select
      atc.student_id,
      count(distinct atc.driver_trip_id) as active_trip_count,
      min(atc.driver_trip_id) as only_driver_trip_id
    from active_trip_candidates atc
    group by atc.student_id
  ),
  selected_trip as (
    select atc.*
    from active_trip_candidates atc
    join trip_rollup tr
      on tr.student_id = atc.student_id
     and tr.active_trip_count = 1
     and tr.only_driver_trip_id = atc.driver_trip_id
  ),
  located as (
    select
      tr.student_id,
      tr.active_trip_count,
      loc.latitude as raw_latitude,
      loc.longitude as raw_longitude,
      loc.recorded_at as raw_recorded_at,
      case
        when loc.recorded_at is null then null::bigint
        else floor(extract(epoch from (now() - loc.recorded_at)))::bigint
      end as raw_age_seconds
    from trip_rollup tr
    left join selected_trip st
      on st.student_id = tr.student_id
    left join public.driver_trip_current_locations loc
      on loc.driver_trip_id = st.driver_trip_id
     and loc.tenant_id = st.tenant_id
     and loc.driver_id = st.driver_id
     and loc.bus_id = st.bus_id
     and loc.route_id = st.route_id
  ),
  classified as (
    select
      l.student_id,
      l.raw_latitude,
      l.raw_longitude,
      l.raw_recorded_at,
      l.raw_age_seconds,
      case
        when l.active_trip_count > 1 then 'invalid'
        when l.raw_recorded_at is null then 'missing'
        when l.raw_latitude is null
          or l.raw_longitude is null
          or l.raw_latitude < -90
          or l.raw_latitude > 90
          or l.raw_longitude < -180
          or l.raw_longitude > 180
          or l.raw_age_seconds is null
          or l.raw_age_seconds < 0
          or l.raw_recorded_at > now()
          then 'invalid'
        when l.raw_recorded_at < now() - interval '2 minutes' then 'stale'
        else 'fresh'
      end as safe_state
    from located l
  )
  select
    c.student_id,
    c.safe_state as location_state,
    case when c.safe_state = 'fresh' then c.raw_latitude else null::double precision end as latitude,
    case when c.safe_state = 'fresh' then c.raw_longitude else null::double precision end as longitude,
    case when c.safe_state in ('fresh', 'stale') then c.raw_recorded_at else null::timestamptz end as location_recorded_at,
    case when c.safe_state in ('fresh', 'stale') then greatest(c.raw_age_seconds, 0::bigint) else null::bigint end as location_age_seconds
  from classified c
  order by c.student_id;
end;
$$;

comment on function public.get_guardian_student_live_bus_location_state() is
  'Guardian-only SECURITY DEFINER RPC for Milestone 11A. Accepts no arguments; '
  'derives caller identity from auth.uid(), enforces active guardian role and '
  'active guardian identity, then follows active same-tenant student_guardians, '
  'students, applicable route assignments, active trips, active bus/driver, and '
  'matching current-location rows. Returns at most one row per eligible linked '
  'student with location_state fresh, stale, missing, or invalid. Freshness '
  'mirrors the accepted admin fleet threshold: 2 minutes. Fresh rows expose '
  'valid coordinates; stale coordinates are withheld; invalid and missing rows '
  'expose no coordinates or unsafe timestamp/age values. Ambiguous multiple '
  'active trips for one student return a single invalid row. No table-level '
  'guardian access to live-location data is granted.';

revoke all on function public.get_guardian_student_live_bus_location_state() from public;
revoke all on function public.get_guardian_student_live_bus_location_state() from anon;
grant execute on function public.get_guardian_student_live_bus_location_state() to authenticated;
