-- SafeBus Alberta - transportation admin write foundation
--
-- Admin-only insert/update policies for buses, drivers, routes, route stops,
-- and student route assignments. This migration intentionally excludes delete,
-- trips, live GPS, maps, QR codes, scan events, notifications, imports, and
-- integrations.

create or replace function public.is_transportation_write_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    public.current_user_role() in (
      'platform_super_admin',
      'tenant_admin',
      'school_admin',
      'transportation_admin'
    ),
    false
  );
$$;

create or replace function public.can_write_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select
    public.is_platform_super_admin()
    or (
      public.current_user_role() in ('tenant_admin', 'school_admin', 'transportation_admin')
      and p_tenant_id = public.current_tenant_id()
    );
$$;

create or replace function public.can_write_school(p_tenant_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      public.is_platform_super_admin()
      and exists (
        select 1
        from public.schools s
        where s.id = p_school_id
          and s.tenant_id = p_tenant_id
      )
    )
    or (
      public.current_user_role() = 'tenant_admin'
      and p_tenant_id = public.current_tenant_id()
      and exists (
        select 1
        from public.schools s
        where s.id = p_school_id
          and s.tenant_id = p_tenant_id
      )
    )
    or (
      public.current_user_role() = 'transportation_admin'
      and p_tenant_id = public.current_tenant_id()
      and exists (
        select 1
        from public.schools s
        where s.id = p_school_id
          and s.tenant_id = p_tenant_id
      )
    )
    or (
      public.current_user_role() = 'school_admin'
      and p_tenant_id = public.current_tenant_id()
      and p_school_id = public.current_school_id()
    );
$$;

create or replace function public.can_write_optional_school(p_tenant_id uuid, p_school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when p_school_id is null then public.can_write_tenant(p_tenant_id)
      else public.can_write_school(p_tenant_id, p_school_id)
    end;
$$;

create or replace function public.can_write_driver_profile(p_tenant_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (
      public.is_platform_super_admin()
      and exists (
        select 1
        from public.profiles p
        where p.id = p_profile_id
          and p.tenant_id = p_tenant_id
          and p.role = 'driver'
      )
    )
    or (
      public.current_user_role() = 'tenant_admin'
      and p_tenant_id = public.current_tenant_id()
      and exists (
        select 1
        from public.profiles p
        where p.id = p_profile_id
          and p.tenant_id = p_tenant_id
          and p.role = 'driver'
      )
    )
    or (
      public.current_user_role() = 'transportation_admin'
      and p_tenant_id = public.current_tenant_id()
      and exists (
        select 1
        from public.profiles p
        where p.id = p_profile_id
          and p.tenant_id = p_tenant_id
          and p.role = 'driver'
      )
    )
    or (
      public.current_user_role() = 'school_admin'
      and p_tenant_id = public.current_tenant_id()
      and exists (
        select 1
        from public.profiles p
        where p.id = p_profile_id
          and p.tenant_id = p_tenant_id
          and p.school_id = public.current_school_id()
          and p.role = 'driver'
      )
    );
$$;

create or replace function public.can_write_route_stop(p_tenant_id uuid, p_route_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.routes r
    where r.id = p_route_id
      and r.tenant_id = p_tenant_id
      and public.can_write_school(r.tenant_id, r.school_id)
  );
$$;

create or replace function public.can_write_student_route_assignment(
  p_tenant_id uuid,
  p_student_id uuid,
  p_route_id uuid,
  p_pickup_stop_id uuid,
  p_dropoff_stop_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.students s
    join public.routes r on r.id = p_route_id
    where s.id = p_student_id
      and s.tenant_id = p_tenant_id
      and r.tenant_id = p_tenant_id
      and public.can_write_school(s.tenant_id, s.school_id)
      and public.can_write_school(r.tenant_id, r.school_id)
      and (
        p_pickup_stop_id is null
        or exists (
          select 1
          from public.route_stops ps
          where ps.id = p_pickup_stop_id
            and ps.tenant_id = p_tenant_id
            and ps.route_id = p_route_id
        )
      )
      and (
        p_dropoff_stop_id is null
        or exists (
          select 1
          from public.route_stops ds
          where ds.id = p_dropoff_stop_id
            and ds.tenant_id = p_tenant_id
            and ds.route_id = p_route_id
        )
      )
  );
$$;

create policy "buses insert admin"
  on public.buses for insert to authenticated
  with check (
    public.is_transportation_write_admin()
    and public.can_write_optional_school(tenant_id, school_id)
  );

create policy "buses update admin"
  on public.buses for update to authenticated
  using (
    public.is_transportation_write_admin()
    and public.can_write_optional_school(tenant_id, school_id)
  )
  with check (
    public.is_transportation_write_admin()
    and public.can_write_optional_school(tenant_id, school_id)
  );

create policy "drivers insert admin"
  on public.drivers for insert to authenticated
  with check (
    public.is_transportation_write_admin()
    and public.can_write_driver_profile(tenant_id, profile_id)
  );

create policy "drivers update admin"
  on public.drivers for update to authenticated
  using (
    public.is_transportation_write_admin()
    and public.can_write_driver_profile(tenant_id, profile_id)
  )
  with check (
    public.is_transportation_write_admin()
    and public.can_write_driver_profile(tenant_id, profile_id)
  );

create policy "routes insert admin"
  on public.routes for insert to authenticated
  with check (
    public.is_transportation_write_admin()
    and public.can_write_school(tenant_id, school_id)
  );

create policy "routes update admin"
  on public.routes for update to authenticated
  using (
    public.is_transportation_write_admin()
    and public.can_write_school(tenant_id, school_id)
  )
  with check (
    public.is_transportation_write_admin()
    and public.can_write_school(tenant_id, school_id)
  );

create policy "route stops insert admin"
  on public.route_stops for insert to authenticated
  with check (
    public.is_transportation_write_admin()
    and public.can_write_route_stop(tenant_id, route_id)
  );

create policy "route stops update admin"
  on public.route_stops for update to authenticated
  using (
    public.is_transportation_write_admin()
    and public.can_write_route_stop(tenant_id, route_id)
  )
  with check (
    public.is_transportation_write_admin()
    and public.can_write_route_stop(tenant_id, route_id)
  );

create policy "student route assignments insert admin"
  on public.student_route_assignments for insert to authenticated
  with check (
    public.is_transportation_write_admin()
    and public.can_write_student_route_assignment(
      tenant_id,
      student_id,
      route_id,
      pickup_stop_id,
      dropoff_stop_id
    )
  );

create policy "student route assignments update admin"
  on public.student_route_assignments for update to authenticated
  using (
    public.is_transportation_write_admin()
    and public.can_write_student_route_assignment(
      tenant_id,
      student_id,
      route_id,
      pickup_stop_id,
      dropoff_stop_id
    )
  )
  with check (
    public.is_transportation_write_admin()
    and public.can_write_student_route_assignment(
      tenant_id,
      student_id,
      route_id,
      pickup_stop_id,
      dropoff_stop_id
    )
  );

grant insert, update on table public.buses to authenticated;
grant insert, update on table public.drivers to authenticated;
grant insert, update on table public.routes to authenticated;
grant insert, update on table public.route_stops to authenticated;
grant insert, update on table public.student_route_assignments to authenticated;
