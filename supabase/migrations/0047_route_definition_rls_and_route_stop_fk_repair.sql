-- SafeBus Alberta - route definition RLS and route-stop FK repair
--
-- Corrects two hosted-DEV schema regressions:
--   1. Migration 0045 accidentally changed tenant-admin route writes back to
--      can_write_school(), rejecting valid school-less routes under RLS.
--   2. Restores route_stops.route_id -> routes.id ON DELETE CASCADE when that
--      foreign key was removed manually.
--
-- This migration does not delete or rewrite route/stop data. If orphaned route
-- stops exist, it fails explicitly so they can be reviewed before the FK is
-- restored.

drop policy if exists "routes insert tenant admin" on public.routes;
drop policy if exists "routes update tenant admin" on public.routes;

create policy "routes insert tenant admin"
  on public.routes for insert to authenticated
  with check (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
    and public.can_write_optional_school(tenant_id, school_id)
  );

create policy "routes update tenant admin"
  on public.routes for update to authenticated
  using (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
  )
  with check (
    public.is_tenant_admin()
    and tenant_id = public.current_tenant_id()
    and public.can_write_optional_school(tenant_id, school_id)
  );

do $$
declare
  v_route_id_attnum smallint;
  v_routes_id_attnum smallint;
begin
  select attnum::smallint
  into v_route_id_attnum
  from pg_attribute
  where attrelid = 'public.route_stops'::regclass
    and attname = 'route_id'
    and not attisdropped;

  select attnum::smallint
  into v_routes_id_attnum
  from pg_attribute
  where attrelid = 'public.routes'::regclass
    and attname = 'id'
    and not attisdropped;

  if v_route_id_attnum is null or v_routes_id_attnum is null then
    raise exception 'Cannot restore route stop foreign key because the required columns are missing.';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.contype = 'f'
      and constraint_row.conrelid = 'public.route_stops'::regclass
      and constraint_row.confrelid = 'public.routes'::regclass
      and constraint_row.conkey = array[v_route_id_attnum]::smallint[]
      and constraint_row.confkey = array[v_routes_id_attnum]::smallint[]
      and constraint_row.confdeltype = 'c'
      and constraint_row.convalidated
  ) then
    if exists (
      select 1
      from public.route_stops route_stop
      left join public.routes route on route.id = route_stop.route_id
      where route.id is null
    ) then
      raise exception
        'Cannot restore route_stops.route_id foreign key while orphaned route stops exist.';
    end if;

    -- Reuse the foundation constraint name if a manually-created incompatible
    -- constraint currently occupies it.
    alter table public.route_stops
      drop constraint if exists route_stops_route_id_fkey;

    alter table public.route_stops
      add constraint route_stops_route_id_fkey
      foreign key (route_id)
      references public.routes(id)
      on delete cascade;
  end if;
end;
$$;
