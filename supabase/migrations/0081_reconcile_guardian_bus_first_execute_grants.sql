-- SafeBus Alberta - reconcile guardian bus-first RPC execute grants
--
-- Migration 0061 retired the route-oriented guardian browser RPCs in favour
-- of the single bus-first contract. Hosted DEV retained authenticated EXECUTE
-- on one legacy function, so restate the complete privilege boundary
-- idempotently without changing any function definitions.

revoke all on function public.get_guardian_student_route_visibility()
  from public, anon, authenticated;
revoke all on function public.get_guardian_live_trip_visibility()
  from public, anon, authenticated;
revoke all on function public.get_guardian_live_route_overlays()
  from public, anon, authenticated;
revoke all on function public.get_guardian_student_trip_event_visibility()
  from public, anon, authenticated;
revoke all on function public.get_guardian_student_live_bus_location_state()
  from public, anon, authenticated;

revoke all on function public.get_guardian_bus_visibility()
  from public, anon;
grant execute on function public.get_guardian_bus_visibility()
  to authenticated;

comment on function public.get_guardian_bus_visibility() is
  'Guardian-only bus-first view for linked students. Legacy route-oriented '
  'guardian RPCs are not browser-executable.';
