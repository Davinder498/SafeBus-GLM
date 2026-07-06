-- SafeBus Alberta - make school optional for transportation operations
--
-- Milestone 4E: Transportation Domain Model Alignment.
--
-- Domain model correction: a tenant (school division / transportation operator
-- / contractor) can serve many schools, and core transportation operations
-- (buses, routes, route stops, trips) must not require a single school to be
-- selected. School is optional metadata/customer-site information.
--
-- Schema state before this migration:
--   public.buses.school_id      — already nullable (on delete set null)
--   public.routes.school_id     — NOT NULL (on delete cascade)  <-- the blocker
--   public.route_stops          — no school_id column
--   public.driver_trips         — no school_id column
--
-- This migration makes the smallest safe change: drop the NOT NULL constraint
-- on public.routes.school_id so a tenant admin can create a route without
-- selecting a school. The foreign key to schools(id) is preserved (a non-null
-- school_id still must reference an existing school). The existing on delete
-- cascade behavior is unchanged.
--
-- No tables are created, dropped, or renamed. No school data is deleted. No RLS
-- policies are changed. No grants are changed.
--
-- RLS note: the existing routes RLS policies use
--   school_id = public.current_school_id()
-- for school_admin. With school_id now nullable, school_admin users will not
-- see routes that have no school (null != current_school_id()). This is
-- acceptable and correct: school_admin scoping is by school, so school-less
-- routes are visible only to tenant_admin / transportation_admin /
-- platform_super_admin (whose policies scope by tenant, not school). Tenant
-- isolation is preserved.

alter table public.routes alter column school_id drop not null;

comment on column public.routes.school_id is
  'Optional school/customer-site this route primarily serves. Nullable as of '
  'Milestone 4E: a tenant can create routes without selecting a school. When '
  'present, must reference an existing schools(id) row in the same tenant.';
