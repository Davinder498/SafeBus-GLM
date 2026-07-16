-- SafeBus Alberta - fix route hard-delete assignment cascades
--
-- Migration 0040 allows tenant admins to delete their own routes, but some
-- assignment foreign keys still use ON DELETE RESTRICT. That makes PostgREST
-- return 409 Conflict whenever a route has driver or bus-service assignments.
--
-- Route deletion is intended to remove route configuration and assignments.
-- Operational trip and location history remains protected by its existing
-- ON DELETE RESTRICT foreign keys, so a route with trip history is not erased.

alter table public.driver_route_assignments
  drop constraint if exists driver_route_assignments_route_id_fkey,
  add constraint driver_route_assignments_route_id_fkey
    foreign key (route_id) references public.routes(id) on delete cascade;

alter table public.bus_route_assignments
  drop constraint if exists bus_route_assignments_route_id_fkey,
  add constraint bus_route_assignments_route_id_fkey
    foreign key (route_id) references public.routes(id) on delete cascade;

-- A bus-service assignment owns its student and driver assignments. These
-- children must be removed before the service row can cascade from the route.
alter table public.student_bus_assignments
  drop constraint if exists student_bus_assignments_bus_route_assignment_id_fkey,
  add constraint student_bus_assignments_bus_route_assignment_id_fkey
    foreign key (bus_route_assignment_id)
    references public.bus_route_assignments(id) on delete cascade;

alter table public.driver_route_assignments
  drop constraint if exists driver_route_assignments_bus_route_assignment_id_fkey,
  add constraint driver_route_assignments_bus_route_assignment_id_fkey
    foreign key (bus_route_assignment_id)
    references public.bus_route_assignments(id) on delete cascade;
