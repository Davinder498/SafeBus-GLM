-- SafeBus Alberta - bounded tenant-admin dashboard and list queries

create or replace function public.admin_page_size(p_page_size integer)
returns integer language sql immutable as $$
  select case when p_page_size in (25, 50, 100) then p_page_size else 50 end;
$$;

create or replace function public.get_admin_paginated_list(
  p_entity text,
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default '',
  p_status text default null,
  p_school_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := public.admin_page_size(p_page_size);
  v_offset integer;
  v_search text := '%' || lower(trim(coalesce(p_search, ''))) || '%';
  v_result jsonb;
begin
  if not public.is_transportation_write_admin() or v_tenant is null then
    raise exception 'Admin tenant context is required' using errcode = '42501';
  end if;
  v_offset := (v_page - 1) * v_size;

  if p_entity = 'students' then
    with filtered as (
      select s.*, sc.name as school_name
      from students s left join schools sc on sc.id = s.school_id
      where s.tenant_id = v_tenant
        and (p_status is null or s.status::text = p_status)
        and (p_school_id is null or s.school_id = p_school_id)
        and (trim(coalesce(p_search, '')) = '' or lower(concat_ws(' ', s.first_name, s.last_name, s.preferred_name, s.grade, s.school_student_number, sc.name)) like v_search)
    ), page_rows as (
      select * from filtered order by last_name, first_name, id limit v_size offset v_offset
    )
    select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb), 'totalCount', (select count(*) from filtered), 'page', v_page, 'pageSize', v_size)
      into v_result from page_rows;
  elsif p_entity = 'guardians' then
    with filtered as (
      select g.*, count(sg.id) filter (where sg.status = 'active')::integer as active_link_count
      from guardians g left join student_guardians sg on sg.guardian_id = g.id
      where g.tenant_id = v_tenant
        and (p_status is null or g.status::text = p_status)
        and (trim(coalesce(p_search, '')) = '' or lower(concat_ws(' ', g.full_name, g.email, g.phone, g.status)) like v_search)
      group by g.id
    ), page_rows as (select * from filtered order by full_name, id limit v_size offset v_offset)
    select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb), 'totalCount', (select count(*) from filtered), 'page', v_page, 'pageSize', v_size) into v_result from page_rows;
  elsif p_entity = 'student_assignments' then
    with filtered as (
      select a.*, concat_ws(' ', s.first_name, s.last_name) as student_name, r.route_name, r.route_code,
        ps.stop_name as pickup_stop_name, ds.stop_name as dropoff_stop_name
      from student_route_assignments a join students s on s.id = a.student_id join routes r on r.id = a.route_id
      left join route_stops ps on ps.id = a.pickup_stop_id left join route_stops ds on ds.id = a.dropoff_stop_id
      where a.tenant_id = v_tenant and (p_status is null or a.status::text = p_status)
        and (trim(coalesce(p_search, '')) = '' or lower(concat_ws(' ', s.first_name, s.last_name, r.route_name, r.route_code, ps.stop_name, ds.stop_name, a.status)) like v_search)
    ), page_rows as (select * from filtered order by created_at desc, id limit v_size offset v_offset)
    select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb), 'totalCount', (select count(*) from filtered), 'page', v_page, 'pageSize', v_size) into v_result from page_rows;
  elsif p_entity = 'driver_assignments' then
    with filtered as (
      select a.*, r.route_name, r.route_code, b.bus_number, p.full_name as driver_name
      from driver_route_assignments a join routes r on r.id = a.route_id join buses b on b.id = a.bus_id
      join drivers d on d.id = a.driver_id join profiles p on p.id = d.profile_id
      where a.tenant_id = v_tenant and (p_status is null or a.status::text = p_status)
        and (trim(coalesce(p_search, '')) = '' or lower(concat_ws(' ', r.route_name, r.route_code, b.bus_number, p.full_name, a.trip_type, a.status)) like v_search)
    ), page_rows as (select * from filtered order by created_at desc, id limit v_size offset v_offset)
    select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb), 'totalCount', (select count(*) from filtered), 'page', v_page, 'pageSize', v_size) into v_result from page_rows;
  elsif p_entity = 'drivers' then
    with filtered as (
      select d.*, p.full_name, p.email
      from drivers d join profiles p on p.id = d.profile_id
      where d.tenant_id = v_tenant and (p_status is null or d.status::text = p_status)
        and (p_school_id is null or p.school_id = p_school_id)
        and (trim(coalesce(p_search, '')) = '' or lower(concat_ws(' ', p.full_name, p.email, d.employee_number, d.phone, d.status)) like v_search)
    ), page_rows as (select * from filtered order by full_name, id limit v_size offset v_offset)
    select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb), 'totalCount', (select count(*) from filtered), 'page', v_page, 'pageSize', v_size) into v_result from page_rows;
  elsif p_entity = 'buses' then
    with filtered as (
      select b.*, sc.name as school_name from buses b left join schools sc on sc.id = b.school_id
      where b.tenant_id = v_tenant and (p_status is null or b.status::text = p_status)
        and (p_school_id is null or b.school_id = p_school_id)
        and (trim(coalesce(p_search, '')) = '' or lower(concat_ws(' ', b.bus_number, b.license_plate, sc.name, b.status)) like v_search)
    ), page_rows as (select * from filtered order by bus_number, id limit v_size offset v_offset)
    select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb), 'totalCount', (select count(*) from filtered), 'page', v_page, 'pageSize', v_size) into v_result from page_rows;
  elsif p_entity = 'routes' then
    with filtered as (
      select r.*, sc.name as school_name,
        count(distinct rs.id) filter (where rs.status <> 'archived')::integer as stop_count,
        count(distinct da.id) filter (where da.status = 'active')::integer as active_assignment_count
      from routes r left join schools sc on sc.id = r.school_id left join route_stops rs on rs.route_id = r.id
      left join driver_route_assignments da on da.route_id = r.id
      where r.tenant_id = v_tenant and (p_status is null or r.status::text = p_status)
        and (p_school_id is null or r.school_id = p_school_id)
        and (trim(coalesce(p_search, '')) = '' or lower(concat_ws(' ', r.route_name, r.route_code, sc.name, r.status)) like v_search)
      group by r.id, sc.name
    ), page_rows as (select * from filtered order by route_code, id limit v_size offset v_offset)
    select jsonb_build_object('rows', coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb), 'totalCount', (select count(*) from filtered), 'page', v_page, 'pageSize', v_size) into v_result from page_rows;
  else
    raise exception 'Unsupported admin list';
  end if;
  return v_result;
end;
$$;

create or replace function public.search_admin_students(p_search text, p_limit integer default 20)
returns table(id uuid, label text, school_name text)
language sql security invoker set search_path = public as $$
  select s.id, concat_ws(' ', s.first_name, s.last_name), sc.name
  from students s left join schools sc on sc.id = s.school_id
  where public.is_transportation_write_admin() and s.tenant_id = public.current_tenant_id() and s.status = 'active'
    and lower(concat_ws(' ', s.first_name, s.last_name, s.preferred_name, s.school_student_number)) like '%' || lower(trim(coalesce(p_search, ''))) || '%'
  order by s.last_name, s.first_name, s.id limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.get_admin_guardian_links(p_guardian_id uuid)
returns table(id uuid, student_id uuid, student_name text, relationship text, status text)
language sql security invoker set search_path = public as $$
  select sg.id, sg.student_id, concat_ws(' ', s.first_name, s.last_name), sg.relationship, sg.status::text
  from student_guardians sg join students s on s.id = sg.student_id
  where public.is_transportation_write_admin() and sg.tenant_id = public.current_tenant_id()
    and sg.guardian_id = p_guardian_id
  order by case when sg.status = 'active' then 0 else 1 end, s.last_name, s.first_name;
$$;

create or replace function public.get_admin_dashboard_overview()
returns jsonb language sql security invoker set search_path = public as $$
  with tenant as (select public.current_tenant_id() id), route_rows as (
    select r.id, r.tenant_id, r.school_id, r.route_name, r.route_code, r.route_type, r.status, r.created_at, r.updated_at,
      count(distinct rs.id) filter (where rs.status <> 'archived')::integer stop_count,
      count(distinct da.id) filter (where da.status = 'active')::integer active_assignment_count,
      case
        when exists (select 1 from driver_trips dt left join driver_trip_current_locations loc on loc.driver_trip_id = dt.id where dt.route_id = r.id and dt.status = 'active' and (loc.recorded_at is null or loc.recorded_at < now() - interval '2 minutes')) then 0
        when r.status = 'active' and count(distinct da.id) filter (where da.status = 'active') = 0 then 1
        when r.status = 'inactive' then 2 else 3 end priority
    from routes r left join route_stops rs on rs.route_id = r.id left join driver_route_assignments da on da.route_id = r.id
    where r.tenant_id = (select id from tenant) and r.status <> 'archived'
    group by r.id order by priority, r.updated_at desc, r.id limit 10
  )
  select case when not public.is_transportation_write_admin() or (select id from tenant) is null then null else jsonb_build_object(
    'routes', coalesce((select jsonb_agg(to_jsonb(route_rows) order by priority, updated_at desc) from route_rows), '[]'::jsonb)
  ) end;
$$;

grant execute on function public.get_admin_paginated_list(text, integer, integer, text, text, uuid) to authenticated;
grant execute on function public.search_admin_students(text, integer) to authenticated;
grant execute on function public.get_admin_guardian_links(uuid) to authenticated;
grant execute on function public.get_admin_dashboard_overview() to authenticated;
revoke all on function public.get_admin_paginated_list(text, integer, integer, text, text, uuid) from public, anon;
revoke all on function public.search_admin_students(text, integer) from public, anon;
revoke all on function public.get_admin_guardian_links(uuid) from public, anon;
revoke all on function public.get_admin_dashboard_overview() from public, anon;

create index if not exists students_tenant_name_page_idx on students(tenant_id, last_name, first_name, id);
create index if not exists students_tenant_status_school_idx on students(tenant_id, status, school_id);
create index if not exists guardians_tenant_name_page_idx on guardians(tenant_id, full_name, id);
create index if not exists student_route_assignments_tenant_created_idx on student_route_assignments(tenant_id, created_at desc, id);
create index if not exists driver_route_assignments_tenant_created_idx on driver_route_assignments(tenant_id, created_at desc, id);
create index if not exists routes_tenant_updated_idx on routes(tenant_id, updated_at desc, id);
