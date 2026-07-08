-- SafeBus Alberta - guardian live trip visibility foundation
--
-- Milestone 6A: secure backend foundation for guardian live trip visibility.
--
-- This migration is ADDITIVE ONLY. It creates a single SECURITY DEFINER RPC:
--   public.get_guardian_live_trip_visibility()
--
-- No tables are created, altered, or dropped. No existing RLS policies are
-- changed. No data is deleted. No grants on live-location/trip tables are added
-- for guardians — guardians read live trip data ONLY through this RPC.
--
-- PRODUCT QUESTION ANSWERED:
--   "For this logged-in guardian, which linked student routes currently have an
--    active trip, and what is the latest safe live bus location for that trip?"
--
-- RETURN SHAPE (minimal and safe):
--   student_id, student_name, route_id, route_name, pickup_stop_name,
--   dropoff_stop_name, trip_status, has_active_trip,
--   last_location_latitude, last_location_longitude, last_location_recorded_at
--
-- DELIBERATELY EXCLUDED:
--   - no raw bus_id
--   - no driver_id / driver phone / driver name
--   - no internal trip UUID
--   - no speed (admin monitoring RPC 0010 does not expose speed either)
--   - no historical location trail (only the single current-location row)
--   - no admin-only monitoring fields
--   - no cross-tenant rows
--   - no unlinked / inactive-link / inactive-student rows
--   - no ended/completed trips shown as active
--
-- ROW INCLUSION POLICY (documented):
--   A row is returned for each of the caller's actively LINKED students who have
--   an ACTIVE route assignment. If that route has no active trip right now, the
--   row is still returned with has_active_trip = false and null location fields
--   so the UI can show "No active trip right now". Students without any route
--   assignment are not returned by this RPC (they have no possible live trip);
--   they remain visible via get_guardian_student_route_visibility() (0015).
--
-- SECURITY MODEL:
--   This function is SECURITY DEFINER and bypasses table-level RLS. The REAL
--   security guarantee is the function's own explicit checks:
--     1. auth.uid() is not null
--     2. current_user_role() = 'guardian'
--     3. current_guardian_id() is not null (active guardian record in tenant)
--     4. current_tenant_id() is not null (known tenant)
--     5. only students linked via ACTIVE student_guardians to
--        current_guardian_id() are returned
--     6. only the caller's tenant is visible (students/links/routes/trips/
--        locations are all tenant-filtered to current_tenant_id())
--     7. only ACTIVE trips (status = 'active') are joined; completed/cancelled
--        trips are never shown as active
--     8. only the single latest current-location row of the active trip is
--        returned; driver_trip_location_updates (history) is never read here
--   Drivers, tenant admins, and other non-guardian roles get zero rows.
--   Execute is granted only to authenticated; public and anon are revoked.
--   No dynamic SQL is used. Object references are schema-qualified.

create or replace function public.get_guardian_live_trip_visibility()
returns table (
  student_id uuid,
  student_name text,
  route_id uuid,
  route_name text,
  pickup_stop_name text,
  dropoff_stop_name text,
  trip_status text,
  has_active_trip boolean,
  last_location_latitude double precision,
  last_location_longitude double precision,
  last_location_recorded_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    s.id as student_id,
    (s.first_name || ' ' || s.last_name) as student_name,
    r.id as route_id,
    r.route_name as route_name,
    ps.stop_name as pickup_stop_name,
    ds.stop_name as dropoff_stop_name,
    t.status as trip_status,
    (t.id is not null) as has_active_trip,
    loc.latitude as last_location_latitude,
    loc.longitude as last_location_longitude,
    loc.recorded_at as last_location_recorded_at
  from public.students s
  -- Active guardian-student link to the CALLER only.
  join public.student_guardians sg
    on sg.student_id = s.id
    and sg.guardian_id = public.current_guardian_id()
    and sg.status = 'active'
    and sg.tenant_id = s.tenant_id
  -- Active route assignment for the student.
  join public.student_route_assignments sra
    on sra.student_id = s.id
    and sra.status = 'active'
    and sra.tenant_id = s.tenant_id
  -- The assigned route (must be in the student's tenant).
  join public.routes r
    on r.id = sra.route_id
    and r.tenant_id = s.tenant_id
  -- Pickup / drop-off stop names (LEFT JOIN: stops may be null/unset).
  left join public.route_stops ps
    on ps.id = sra.pickup_stop_id
  left join public.route_stops ds
    on ds.id = sra.dropoff_stop_id
  -- The single latest ACTIVE trip on this route in the caller's tenant.
  -- Deterministic: at most one row via ORDER BY started_at DESC + LIMIT 1.
  -- Completed/cancelled trips are excluded by status = 'active'.
  left join lateral (
    select dt.id, dt.status, dt.started_at
    from public.driver_trips dt
    where dt.route_id = r.id
      and dt.tenant_id = s.tenant_id
      and dt.status = 'active'
    order by dt.started_at desc
    limit 1
  ) t on true
  -- Latest current location of that active trip only (no history trail).
  -- Tenant is re-asserted defense-in-depth even though it is implied via t.id.
  left join public.driver_trip_current_locations loc
    on loc.driver_trip_id = t.id
    and loc.tenant_id = s.tenant_id
  where s.status = 'active'
    and s.tenant_id = public.current_tenant_id()
    and auth.uid() is not null
    and public.current_user_role() = 'guardian'
    and public.current_guardian_id() is not null
    and public.current_tenant_id() is not null
  order by s.last_name, s.first_name, r.route_name;
$$;

comment on function public.get_guardian_live_trip_visibility() is
  'Guardian-scoped read of live trip visibility for actively linked students. '
  'Returns one row per linked student with an active route assignment. Joins the '
  'latest ACTIVE driver_trips row on the route and its current location only — '
  'no history trail, no bus/driver ids, no speed, no trip uuid. Completed/'
  'cancelled trips are never shown as active. SECURITY DEFINER; internal role/'
  'guardian/tenant checks are the primary enforcement (table RLS is bypassed '
  'inside the function). Drivers, admins, and other roles get zero rows.';

-- Privilege hardening: make the execute grant model explicit.
revoke all on function public.get_guardian_live_trip_visibility() from public;
revoke all on function public.get_guardian_live_trip_visibility() from anon;
grant execute on function public.get_guardian_live_trip_visibility() to authenticated;