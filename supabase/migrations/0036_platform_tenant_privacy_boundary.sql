-- Phase 12.6 - platform control-plane / tenant data-plane privacy boundary.
--
-- Platform Super Admins may operate tenant lifecycle and safe onboarding
-- summaries, but must not receive routine RLS/RPC access to tenant
-- operational records (students, guardians, routes, manifests, trips, events,
-- or live locations).

-- Remove legacy broad Platform Super Admin table-read policies from tenant
-- operational tables. Tenant-scoped admin/driver/guardian policies remain in
-- place and continue to enforce current_tenant_id()/assignment based access.
drop policy if exists "schools select platform admin" on public.schools;
drop policy if exists "students select platform admin" on public.students;
drop policy if exists "guardians select platform admin" on public.guardians;
drop policy if exists "student guardians select platform admin" on public.student_guardians;
drop policy if exists "buses select platform admin" on public.buses;
drop policy if exists "drivers select platform admin" on public.drivers;
drop policy if exists "routes select platform admin" on public.routes;
drop policy if exists "route stops select platform admin" on public.route_stops;
drop policy if exists "student route assignments select platform admin" on public.student_route_assignments;
drop policy if exists "driver_trips select platform admin" on public.driver_trips;
drop policy if exists "driver_trip_location_updates select platform admin" on public.driver_trip_location_updates;
drop policy if exists "driver_trip_current_locations select platform admin" on public.driver_trip_current_locations;
drop policy if exists "driver_route_assignments select platform admin" on public.driver_route_assignments;

-- Later combined admin policies included platform_super_admin as a broad table
-- reader. Replace them with tenant-scoped versions only.
drop policy if exists "bus_route_assignments select admin" on public.bus_route_assignments;
create policy "bus_route_assignments select tenant admin"
  on public.bus_route_assignments for select to authenticated
  using (
    public.current_user_role() in ('tenant_admin', 'school_admin', 'transportation_admin')
    and tenant_id = public.current_tenant_id()
  );

drop policy if exists "student_bus_assignments select admin" on public.student_bus_assignments;
create policy "student_bus_assignments select tenant admin"
  on public.student_bus_assignments for select to authenticated
  using (
    public.current_user_role() in ('tenant_admin', 'school_admin', 'transportation_admin')
    and tenant_id = public.current_tenant_id()
  );

-- Platform Super Admins are no longer tenant operational write admins.
create or replace function public.is_transportation_write_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    public.current_user_role() in ('tenant_admin', 'school_admin', 'transportation_admin'),
    false
  );
$$;

create or replace function public.can_write_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    public.current_user_role() in ('tenant_admin', 'school_admin', 'transportation_admin')
    and p_tenant_id = public.current_tenant_id(),
    false
  );
$$;

create or replace function public.can_write_school(p_tenant_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      public.current_user_role() in ('tenant_admin', 'transportation_admin')
      and p_tenant_id = public.current_tenant_id()
      and exists (select 1 from public.schools s where s.id = p_school_id and s.tenant_id = p_tenant_id)
    )
    or (
      public.current_user_role() = 'school_admin'
      and p_tenant_id = public.current_tenant_id()
      and p_school_id = public.current_school_id()
    ),
    false
  );
$$;

create or replace function public.can_write_driver_profile(p_tenant_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_user_role() in ('tenant_admin', 'transportation_admin')
    and p_tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.profiles p
      where p.id = p_profile_id and p.tenant_id = p_tenant_id and p.role = 'driver'
    ),
    false
  );
$$;

create or replace function public.can_write_student_roster(p_tenant_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_write_optional_school(p_tenant_id, p_school_id);
$$;

-- Operational admin RPCs must reject Platform Super Admins even though they are
-- authenticated. Platform summaries use get_platform_tenant_onboarding_summary.
-- PostgreSQL cannot change OUT-parameter return shapes with CREATE OR REPLACE,
-- so drop first to support hosted databases that still have an earlier RPC shape.
drop function if exists public.get_admin_live_fleet_monitoring();
create function public.get_admin_live_fleet_monitoring()
returns table (
  bus_label text,
  route_name text,
  driver_name text,
  trip_type text,
  status text,
  started_at timestamptz,
  latest_latitude double precision,
  latest_longitude double precision,
  latest_location_at timestamptz,
  speed_mps double precision,
  location_status text,
  issue_label text,
  next_stop_name text,
  eta_status text,
  eta_label text,
  eta_updated_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select b.bus_number, r.route_name, p.full_name, dt.trip_type, dt.status, dt.started_at,
    loc.latitude, loc.longitude, loc.recorded_at, loc.speed_mps,
    case when loc.recorded_at is null then 'missing' when loc.recorded_at < now() - interval '2 minutes' then 'stale' else 'live' end,
    case when loc.recorded_at is null then 'Missing GPS' when loc.recorded_at < now() - interval '2 minutes' then 'Stale GPS' when eta.eta_status is distinct from 'available' then 'Needs attention' when loc.speed_mps is null then 'Speed unavailable' else 'OK' end,
    eta.next_stop_name, eta.eta_status, eta.eta_label,
    case when eta.eta_status = 'available' then loc.recorded_at else null end
  from public.driver_trips dt
  join public.drivers d on d.id = dt.driver_id and d.tenant_id = dt.tenant_id
  join public.profiles p on p.id = d.profile_id and p.tenant_id = dt.tenant_id
  join public.buses b on b.id = dt.bus_id and b.tenant_id = dt.tenant_id
  join public.routes r on r.id = dt.route_id and r.tenant_id = dt.tenant_id
  left join public.driver_trip_current_locations loc on loc.driver_trip_id = dt.id and loc.tenant_id = dt.tenant_id and loc.driver_id = dt.driver_id and loc.bus_id = dt.bus_id and loc.route_id = dt.route_id
  left join lateral (
    select rs.id from public.route_stops rs
    where rs.route_id = dt.route_id and rs.status = 'active'
    order by case when dt.trip_type = 'evening' then -rs.stop_order else rs.stop_order end
    limit 1
  ) target on true
  left join lateral public.calculate_safe_route_eta(dt.route_id, target.id, dt.trip_type, loc.latitude, loc.longitude, loc.speed_mps, loc.recorded_at) eta on true
  where dt.status = 'active'
    and auth.uid() is not null
    and dt.tenant_id = public.current_tenant_id()
    and public.current_user_role() in ('tenant_admin','school_admin','transportation_admin')
  order by case when loc.recorded_at is null then 0 when loc.recorded_at < now() - interval '2 minutes' then 1 else 2 end, dt.started_at desc;
$$;

revoke all on function public.get_admin_live_fleet_monitoring() from public, anon;
grant execute on function public.get_admin_live_fleet_monitoring() to authenticated;

-- Safe platform summary contract: aggregate counts and lifecycle state only.
-- First Tenant Admin contact is the only person-level contact returned.
-- Drop first because the Phase 12.5 version returned a different OUT-parameter
-- row type, and CREATE OR REPLACE cannot change that signature.
drop function if exists public.get_platform_tenant_onboarding_summary();
create function public.get_platform_tenant_onboarding_summary()
returns table (
  tenant_id uuid,
  tenant_name text,
  tenant_type text,
  tenant_status text,
  tenant_created_at timestamptz,
  first_tenant_admin_name text,
  first_tenant_admin_email text,
  tenant_admin_status text,
  active_tenant_admin_count bigint,
  latest_invitation_status text,
  latest_invitation_at timestamptz,
  setup_readiness text,
  has_buses boolean,
  has_drivers boolean,
  has_routes boolean,
  has_students boolean,
  last_onboarding_activity_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with tenant_admins as (
    select distinct p.tenant_id,
      count(*) filter (where p.status = 'active') over (partition by p.tenant_id) as active_count,
      first_value(p.full_name) over (partition by p.tenant_id order by p.created_at) as first_name,
      first_value(p.email) over (partition by p.tenant_id order by p.created_at) as first_email,
      case
        when bool_or(p.status = 'active') over (partition by p.tenant_id) then 'activated'
        when bool_or(p.status = 'invited') over (partition by p.tenant_id) then 'invited'
        else 'missing'
      end as admin_status
    from public.profiles p
    where p.role = 'tenant_admin'
  ), latest_invites as (
    select distinct on (i.tenant_id) i.tenant_id, i.status, i.created_at, i.updated_at, i.last_sent_at, i.cancelled_at
    from public.tenant_onboarding_invitations i
    where i.role = 'tenant_admin'
    order by i.tenant_id, i.created_at desc
  ), readiness as (
    select t.id as tenant_id,
      exists (select 1 from public.buses b where b.tenant_id = t.id and b.status = 'active') has_buses,
      exists (select 1 from public.drivers d where d.tenant_id = t.id and d.status = 'active') has_drivers,
      exists (select 1 from public.routes r where r.tenant_id = t.id and r.status = 'active') has_routes,
      exists (select 1 from public.students s where s.tenant_id = t.id and s.status = 'active') has_students
    from public.tenants t
  )
  select t.id, t.name, t.type, t.status, t.created_at,
    ta.first_name, ta.first_email,
    coalesce(ta.admin_status, 'missing'), coalesce(ta.active_count, 0),
    coalesce(li.status, 'none'), li.created_at,
    case
      when not (coalesce(r.has_buses,false) or coalesce(r.has_drivers,false) or coalesce(r.has_routes,false) or coalesce(r.has_students,false)) then 'not_started'
      when coalesce(r.has_buses,false) and coalesce(r.has_drivers,false) and coalesce(r.has_routes,false) and coalesce(r.has_students,false) then 'ready'
      else 'in_progress'
    end,
    coalesce(r.has_buses,false), coalesce(r.has_drivers,false), coalesce(r.has_routes,false), coalesce(r.has_students,false),
    greatest(t.created_at, coalesce(li.updated_at, li.last_sent_at, li.cancelled_at, li.created_at, t.created_at))
  from public.tenants t
  left join tenant_admins ta on ta.tenant_id = t.id
  left join latest_invites li on li.tenant_id = t.id
  left join readiness r on r.tenant_id = t.id
  where public.is_platform_super_admin()
  order by t.created_at desc;
$$;

revoke all on function public.get_platform_tenant_onboarding_summary() from public, anon;
grant execute on function public.get_platform_tenant_onboarding_summary() to authenticated;

comment on function public.get_platform_tenant_onboarding_summary() is
  'Platform-safe onboarding summary. Returns tenant metadata, first tenant admin contact, aggregate readiness booleans, and invitation lifecycle state only; no student, guardian, driver, route, trip, event, manifest, or location records.';
