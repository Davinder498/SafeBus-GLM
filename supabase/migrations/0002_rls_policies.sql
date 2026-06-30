-- SafeBus Alberta — Row Level Security policies
-- Phase 2 (Backend)
--
-- Principle: tenant_id = auth.jwt() ->> 'tenant_id'
-- Platform super admin bypasses tenant filter.
-- Parent sees only own linked student + assigned active bus.

-- Helper: extract tenant_id from JWT
create or replace function auth.tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'tenant_id', '')::uuid;
$$;

-- Helper: check if current user is platform super admin
create or replace function auth.is_platform_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'role') = 'platform_super_admin', false);
$$;

-- Helper: get current user's role
create or replace function auth.current_role()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'role';
$$;

-- ─── Enable RLS on all sensitive tables ──────────────────────────────────

alter table schools enable row level security;
alter table profiles enable row level security;
alter table students enable row level security;
alter table guardians enable row level security;
alter table student_guardians enable row level security;
alter table buses enable row level security;
alter table drivers enable row level security;
alter table routes enable row level security;
alter table route_stops enable row level security;
alter table student_route_assignments enable row level security;
alter table trips enable row level security;
alter table live_bus_locations enable row level security;
alter table trip_location_history enable row level security;
alter table student_badges enable row level security;
alter table student_scan_events enable row level security;
alter table trip_alerts enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;
alter table imports enable row level security;
alter table consents enable row level security;
alter table terms_acceptances enable row level security;
alter table security_incidents enable row level security;

-- ─── Schools ───────────────────────────────────────────────────────────────

create policy "schools: tenant read"
  on schools for select to authenticated
  using (tenant_id = auth.tenant_id() or auth.is_platform_super_admin());

create policy "schools: tenant admin write"
  on schools for all to authenticated
  using (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'platform_super_admin')
  )
  with check (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'platform_super_admin')
  );

-- ─── Profiles ─────────────────────────────────────────────────────────────

create policy "profiles: self or tenant admin read"
  on profiles for select to authenticated
  using (
    id = auth.uid()
    or tenant_id = auth.tenant_id()
    or auth.is_platform_super_admin()
  );

create policy "profiles: tenant admin write"
  on profiles for all to authenticated
  using (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'platform_super_admin')
  )
  with check (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'platform_super_admin')
  );

-- ─── Students ─────────────────────────────────────────────────────────────

create policy "students: tenant read"
  on students for select to authenticated
  using (tenant_id = auth.tenant_id() or auth.is_platform_super_admin());

create policy "students: admin write"
  on students for all to authenticated
  using (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin')
  )
  with check (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin')
  );

-- ─── Guardians ────────────────────────────────────────────────────────────

create policy "guardians: tenant read"
  on guardians for select to authenticated
  using (tenant_id = auth.tenant_id() or auth.is_platform_super_admin());

create policy "guardians: admin write"
  on guardians for all to authenticated
  using (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin')
  )
  with check (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin')
  );

-- ─── Buses ────────────────────────────────────────────────────────────────

create policy "buses: tenant read"
  on buses for select to authenticated
  using (tenant_id = auth.tenant_id() or auth.is_platform_super_admin());

create policy "buses: admin write"
  on buses for all to authenticated
  using (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'transportation_admin', 'platform_super_admin')
  )
  with check (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'transportation_admin', 'platform_super_admin')
  );

-- ─── Drivers ──────────────────────────────────────────────────────────────

create policy "drivers: tenant read"
  on drivers for select to authenticated
  using (tenant_id = auth.tenant_id() or auth.is_platform_super_admin());

create policy "drivers: admin write"
  on drivers for all to authenticated
  using (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'transportation_admin', 'platform_super_admin')
  )
  with check (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'transportation_admin', 'platform_super_admin')
  );

-- ─── Routes & Stops ───────────────────────────────────────────────────────

create policy "routes: tenant read"
  on routes for select to authenticated
  using (tenant_id = auth.tenant_id() or auth.is_platform_super_admin());

create policy "routes: admin write"
  on routes for all to authenticated
  using (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'transportation_admin', 'platform_super_admin')
  )
  with check (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'transportation_admin', 'platform_super_admin')
  );

create policy "route_stops: tenant read"
  on route_stops for select to authenticated
  using (
    route_id in (
      select id from routes where tenant_id = auth.tenant_id()
    ) or auth.is_platform_super_admin()
  );

create policy "route_stops: admin write"
  on route_stops for all to authenticated
  using (
    route_id in (
      select id from routes
      where tenant_id = auth.tenant_id()
      and auth.current_role() in ('tenant_admin', 'transportation_admin', 'platform_super_admin')
    )
  );

-- ─── Trips ────────────────────────────────────────────────────────────────

create policy "trips: tenant read"
  on trips for select to authenticated
  using (tenant_id = auth.tenant_id() or auth.is_platform_super_admin());

create policy "trips: admin write"
  on trips for all to authenticated
  using (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'transportation_admin', 'platform_super_admin')
  )
  with check (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'transportation_admin', 'platform_super_admin')
  );

-- Drivers can update their own trips (start/end)
create policy "trips: driver update own"
  on trips for update to authenticated
  using (
    driver_id in (
      select id from drivers
      where profile_id = auth.uid()
      and auth.current_role() = 'driver'
    )
    and status in ('scheduled', 'active', 'delayed', 'gps_stale', 'gps_lost')
  );

-- ─── Live Bus Locations ───────────────────────────────────────────────────

-- Admins read all tenant buses
create policy "live_bus_locations: tenant admin read"
  on live_bus_locations for select to authenticated
  using (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin')
  );

-- Drivers can read their own active trip location
create policy "live_bus_locations: driver read own"
  on live_bus_locations for select to authenticated
  using (
    trip_id in (
      select id from trips
      where driver_id in (
        select id from drivers where profile_id = auth.uid()
      )
      and auth.current_role() = 'driver'
    )
  );

-- Guardians read only assigned active trip location
create policy "live_bus_locations: guardian read assigned"
  on live_bus_locations for select to authenticated
  using (
    auth.current_role() = 'guardian'
    and trip_id in (
      select t.id from trips t
      join student_route_assignments sra on sra.route_id = t.route_id
      join student_guardians sg on sg.student_id = sra.student_id
      join guardians g on g.id = sg.guardian_id
      where g.profile_id = auth.uid()
      and t.status in ('active', 'delayed')
    )
  );

-- Drivers insert their own pings (Edge Function also validates)
create policy "live_bus_locations: driver insert own"
  on live_bus_locations for insert to authenticated
  with check (
    trip_id in (
      select id from trips
      where driver_id in (
        select id from drivers where profile_id = auth.uid()
      )
      and status in ('active', 'delayed')
      and auth.current_role() = 'driver'
    )
  );

-- Drivers update their own bus location
create policy "live_bus_locations: driver update own"
  on live_bus_locations for update to authenticated
  using (
    trip_id in (
      select id from trips
      where driver_id in (
        select id from drivers where profile_id = auth.uid()
      )
      and status in ('active', 'delayed')
      and auth.current_role() = 'driver'
    )
  );

-- ─── Trip Location History ────────────────────────────────────────────────

create policy "trip_location_history: tenant admin read"
  on trip_location_history for select to authenticated
  using (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin')
  );

create policy "trip_location_history: driver insert own"
  on trip_location_history for insert to authenticated
  with check (
    trip_id in (
      select id from trips
      where driver_id in (
        select id from drivers where profile_id = auth.uid()
      )
      and status in ('active', 'delayed')
      and auth.current_role() = 'driver'
    )
  );

-- ─── Notifications ────────────────────────────────────────────────────────

create policy "notifications: own read"
  on notifications for select to authenticated
  using (
    profile_id = auth.uid()
    or (tenant_id = auth.tenant_id() and auth.current_role() in ('tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin'))
  );

create policy "notifications: own update"
  on notifications for update to authenticated
  using (profile_id = auth.uid());

-- ─── Consents ─────────────────────────────────────────────────────────────

create policy "consents: own or admin read"
  on consents for select to authenticated
  using (
    profile_id = auth.uid()
    or (tenant_id = auth.tenant_id() and auth.current_role() in ('tenant_admin', 'platform_super_admin'))
  );

create policy "consents: own insert"
  on consents for insert to authenticated
  with check (profile_id = auth.uid());

create policy "consents: own revoke"
  on consents for update to authenticated
  using (profile_id = auth.uid());

-- ─── Terms Acceptances ────────────────────────────────────────────────────

create policy "terms_acceptances: own read"
  on terms_acceptances for select to authenticated
  using (
    profile_id = auth.uid()
    or auth.is_platform_super_admin()
  );

create policy "terms_acceptances: own insert"
  on terms_acceptances for insert to authenticated
  with check (profile_id = auth.uid());

-- terms_versions is readable by all authenticated users
alter table terms_versions enable row level security;
create policy "terms_versions: read all"
  on terms_versions for select to authenticated
  using (true);

-- ─── Audit Logs (admin read only) ─────────────────────────────────────────

create policy "audit_logs: tenant admin read"
  on audit_logs for select to authenticated
  using (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'platform_super_admin')
    or auth.is_platform_super_admin()
  );

-- ─── Imports ──────────────────────────────────────────────────────────────

create policy "imports: tenant admin read"
  on imports for select to authenticated
  using (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin')
  );

create policy "imports: admin write"
  on imports for all to authenticated
  using (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin')
  )
  with check (
    tenant_id = auth.tenant_id()
    and auth.current_role() in ('tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin')
  );

-- ─── Security Incidents (platform super admin only) ──────────────────────

create policy "security_incidents: super admin only"
  on security_incidents for all to authenticated
  using (auth.is_platform_super_admin())
  with check (auth.is_platform_super_admin());
