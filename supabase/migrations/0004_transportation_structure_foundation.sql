-- SafeBus Alberta - transportation structure foundation
--
-- Read-only/admin foundation for buses, drivers, routes, stops, and
-- student route assignments. This migration intentionally excludes trips,
-- live GPS, QR codes, scan events, notifications, imports, and integrations.

create table public.buses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  bus_number text not null,
  license_plate text,
  capacity integer,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buses_status_check check (
    status in ('active', 'maintenance', 'inactive', 'retired')
  ),
  constraint buses_capacity_check check (
    capacity is null or capacity >= 0
  ),
  constraint buses_tenant_bus_number_unique unique (tenant_id, bus_number)
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  employee_number text,
  phone text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drivers_status_check check (
    status in ('active', 'inactive', 'suspended', 'archived')
  ),
  constraint drivers_profile_tenant_unique unique (profile_id, tenant_id)
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  route_name text not null,
  route_code text not null,
  route_type text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routes_route_type_check check (
    route_type in ('morning', 'afternoon', 'special', 'field_trip')
  ),
  constraint routes_status_check check (
    status in ('active', 'inactive', 'archived')
  ),
  constraint routes_tenant_route_code_unique unique (tenant_id, route_code)
);

create table public.route_stops (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  stop_name text not null,
  stop_order integer not null,
  planned_arrival_time time,
  latitude numeric,
  longitude numeric,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_stops_stop_order_check check (stop_order > 0),
  constraint route_stops_latitude_check check (
    latitude is null or latitude between -90 and 90
  ),
  constraint route_stops_longitude_check check (
    longitude is null or longitude between -180 and 180
  ),
  constraint route_stops_status_check check (
    status in ('active', 'inactive', 'archived')
  ),
  constraint route_stops_route_order_unique unique (route_id, stop_order)
);

create table public.student_route_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete cascade,
  pickup_stop_id uuid references public.route_stops(id) on delete set null,
  dropoff_stop_id uuid references public.route_stops(id) on delete set null,
  effective_from date not null default current_date,
  effective_to date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_route_assignments_status_check check (
    status in ('active', 'inactive', 'archived')
  ),
  constraint student_route_assignments_effective_dates_check check (
    effective_to is null or effective_to >= effective_from
  )
);

create index buses_tenant_id_idx on public.buses(tenant_id);
create index buses_school_id_idx on public.buses(school_id);
create index drivers_tenant_id_idx on public.drivers(tenant_id);
create index drivers_profile_id_idx on public.drivers(profile_id);
create index routes_tenant_id_idx on public.routes(tenant_id);
create index routes_school_id_idx on public.routes(school_id);
create index route_stops_tenant_id_idx on public.route_stops(tenant_id);
create index route_stops_route_id_idx on public.route_stops(route_id);
create index student_route_assignments_tenant_id_idx on public.student_route_assignments(tenant_id);
create index student_route_assignments_student_id_idx on public.student_route_assignments(student_id);
create index student_route_assignments_route_id_idx on public.student_route_assignments(route_id);
create index student_route_assignments_pickup_stop_id_idx on public.student_route_assignments(pickup_stop_id);
create index student_route_assignments_dropoff_stop_id_idx on public.student_route_assignments(dropoff_stop_id);

create trigger set_updated_at_buses
  before update on public.buses
  for each row execute function public.set_updated_at();

create trigger set_updated_at_drivers
  before update on public.drivers
  for each row execute function public.set_updated_at();

create trigger set_updated_at_routes
  before update on public.routes
  for each row execute function public.set_updated_at();

create trigger set_updated_at_route_stops
  before update on public.route_stops
  for each row execute function public.set_updated_at();

create trigger set_updated_at_student_route_assignments
  before update on public.student_route_assignments
  for each row execute function public.set_updated_at();

alter table public.buses enable row level security;
alter table public.drivers enable row level security;
alter table public.routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.student_route_assignments enable row level security;

create policy "buses select platform admin"
  on public.buses for select to authenticated
  using (public.is_platform_super_admin());

create policy "buses select tenant admin"
  on public.buses for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "buses select school or transportation admin"
  on public.buses for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() = 'transportation_admin'
      or school_id = public.current_school_id()
    )
  );

create policy "drivers select platform admin"
  on public.drivers for select to authenticated
  using (public.is_platform_super_admin());

create policy "drivers select tenant admin"
  on public.drivers for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "drivers select school or transportation admin"
  on public.drivers for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() = 'transportation_admin'
      or exists (
        select 1
        from public.profiles p
        where p.id = drivers.profile_id
          and p.school_id = public.current_school_id()
      )
    )
  );

create policy "drivers select own"
  on public.drivers for select to authenticated
  using (
    public.current_user_role() = 'driver'
    and tenant_id = public.current_tenant_id()
    and profile_id = auth.uid()
  );

create policy "routes select platform admin"
  on public.routes for select to authenticated
  using (public.is_platform_super_admin());

create policy "routes select tenant admin"
  on public.routes for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "routes select school or transportation admin"
  on public.routes for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() = 'transportation_admin'
      or school_id = public.current_school_id()
    )
  );

create policy "route stops select platform admin"
  on public.route_stops for select to authenticated
  using (public.is_platform_super_admin());

create policy "route stops select tenant admin"
  on public.route_stops for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "route stops select school or transportation admin"
  on public.route_stops for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() = 'transportation_admin'
      or exists (
        select 1
        from public.routes r
        where r.id = route_stops.route_id
          and r.school_id = public.current_school_id()
      )
    )
  );

create policy "student route assignments select platform admin"
  on public.student_route_assignments for select to authenticated
  using (public.is_platform_super_admin());

create policy "student route assignments select tenant admin"
  on public.student_route_assignments for select to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  );

create policy "student route assignments select school or transportation admin"
  on public.student_route_assignments for select to authenticated
  using (
    public.is_school_or_transportation_admin()
    and tenant_id = public.current_tenant_id()
    and (
      public.current_user_role() = 'transportation_admin'
      or exists (
        select 1
        from public.students s
        where s.id = student_route_assignments.student_id
          and s.school_id = public.current_school_id()
      )
    )
  );

grant select on table public.buses to authenticated;
grant select on table public.drivers to authenticated;
grant select on table public.routes to authenticated;
grant select on table public.route_stops to authenticated;
grant select on table public.student_route_assignments to authenticated;
