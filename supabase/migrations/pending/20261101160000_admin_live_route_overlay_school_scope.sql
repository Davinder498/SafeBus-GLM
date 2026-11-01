-- Prepared, unapplied SafeBus authorization correction.
-- Do not adopt before protected release review, synthetic tenant fixtures,
-- read-after-write verification, and rollback approval.
--
-- Security issue: prior SECURITY DEFINER implementation checked tenant + role
-- but returned every active tenant route even when called by school_admin.
-- This correction constrains school_admin to their own school by the joined
-- route record. School-less routes remain invisible to school_admin.
-- No change to returned columns, non-school admin scope, or GPS collection.
--
-- The definition below matches the observed deployed function's arguments,
-- return columns, owner-privileged execution, and search_path. It deliberately
-- does not enable direct table access or expose student/guardian data.
create or replace function public.get_admin_live_route_overlays()
returns table (
  route_id uuid,
  route_code text,
  route_name text,
  route_kind text,
  map_color text,
  trip_pattern_id uuid,
  trip_name text,
  direction text,
  stops jsonb,
  route_shape_geojson jsonb,
  route_shape_version integer,
  route_shape_distance_meters double precision
)
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'safebus_private', 'auth',
                  'extensions', 'realtime', 'pg_temp'
as $function$
  with active_routes as (
    select distinct dt.route_id, dt.route_trip_pattern_id, dt.route_shape_id
    from public.driver_trips dt
    where dt.status = 'active'
      and dt.tenant_id = safebus_private.current_tenant_id()
      and auth.uid() is not null
      and safebus_private.current_user_role() in
          ('tenant_admin', 'school_admin', 'transportation_admin')
  )
  select
    r.id, r.route_code, r.route_name, r.route_kind, r.map_color,
    rtp.id, rtp.display_name, rtp.direction,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', rs.id,
          'name', rs.stop_name,
          'order', rs.stop_order,
          'latitude', rs.latitude,
          'longitude', rs.longitude,
          'plannedArrivalTime', rs.planned_arrival_time
        )
        order by case when rtp.direction = 'reverse'
          then -rs.stop_order else rs.stop_order end
      ) filter (where rs.latitude is not null and rs.longitude is not null),
      '[]'::jsonb
    ),
    extensions.st_asgeojson(shape.path)::jsonb,
    shape.version,
    shape.distance_meters
  from active_routes ar
  join public.routes r
    on r.id = ar.route_id
   and r.tenant_id = safebus_private.current_tenant_id()
  join public.route_trip_patterns rtp
    on rtp.id = ar.route_trip_pattern_id
   and rtp.route_id = r.id
   and rtp.tenant_id = r.tenant_id
  left join public.route_stops rs
    on rs.route_id = r.id
   and rs.tenant_id = r.tenant_id
   and rs.status = 'active'
  left join lateral (
    select rs2.*
    from public.route_shapes rs2
    where rs2.tenant_id = r.tenant_id
      and (
        rs2.id = ar.route_shape_id
        or (
          ar.route_shape_id is null
          and rs2.route_id = r.id
          and rs2.status = 'published'
          and rs2.effective_to is null
        )
      )
    order by case when rs2.id = ar.route_shape_id then 0 else 1 end,
             rs2.version desc
    limit 1
  ) shape on true
  where
    -- Critical authorization predicate: never let an authenticated
    -- school administrator infer another school's route, stops or geometry.
    (
      safebus_private.current_user_role() <> 'school_admin'
      or (
        safebus_private.current_school_id() is not null
        and r.school_id = safebus_private.current_school_id()
      )
    )
  group by
    r.id, r.route_code, r.route_name, r.route_kind, r.map_color,
    rtp.id, rtp.display_name, rtp.direction,
    shape.path, shape.version, shape.distance_meters
  order by r.route_code, rtp.display_name;
$function$;

revoke all on function public.get_admin_live_route_overlays()
  from public, anon;
grant execute on function public.get_admin_live_route_overlays()
  to authenticated;

comment on function public.get_admin_live_route_overlays() is
  'Tenant-authorized active route overlays; school admins see only their own school''s routes. Security definer, no student or guardian data.';
