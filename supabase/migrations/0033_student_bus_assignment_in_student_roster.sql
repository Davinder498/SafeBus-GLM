-- SafeBus Alberta - show optional bus service in the paginated student roster
--
-- Migration 0032 introduced student-to-bus service assignments. This
-- incremental migration keeps an already-applied 0032 immutable and extends
-- the existing scalable student list with the student's current assignment.

create or replace function public.get_admin_students_page(
  p_page integer default 1, p_page_size integer default 50, p_search text default '',
  p_status text default null, p_school_id uuid default null
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := public.admin_page_size(p_page_size);
  v_search text := '%' || lower(trim(coalesce(p_search, ''))) || '%';
  v_result jsonb;
begin
  if not public.is_transportation_write_admin() or v_tenant is null then
    raise exception 'Admin tenant context is required' using errcode = '42501';
  end if;

  with filtered as (
    select s.*, sc.name school_name,
      ba.id bus_assignment_id, ba.bus_route_assignment_id, ba.pickup_stop_id, ba.dropoff_stop_id,
      ba.effective_from bus_effective_from, ba.effective_to bus_effective_to,
      bra.bus_id, bra.route_id, bra.trip_type, b.bus_number, r.route_name, r.route_code,
      ps.stop_name pickup_stop_name, ds.stop_name dropoff_stop_name
    from students s
    left join schools sc on sc.id = s.school_id
    left join lateral (
      select sba.*
      from student_bus_assignments sba
      where sba.student_id = s.id
        and sba.tenant_id = s.tenant_id
        and sba.status = 'active'
        and sba.effective_from <= current_date
        and (sba.effective_to is null or sba.effective_to >= current_date)
      order by sba.effective_from desc, sba.created_at desc
      limit 1
    ) ba on true
    left join bus_route_assignments bra on bra.id = ba.bus_route_assignment_id
    left join buses b on b.id = bra.bus_id
    left join routes r on r.id = bra.route_id
    left join route_stops ps on ps.id = ba.pickup_stop_id
    left join route_stops ds on ds.id = ba.dropoff_stop_id
    where s.tenant_id = v_tenant
      and (p_status is null or s.status = p_status)
      and (p_school_id is null or s.school_id = p_school_id)
      and (
        trim(coalesce(p_search, '')) = ''
        or lower(concat_ws(' ', s.first_name, s.last_name, s.preferred_name, s.grade,
          s.school_student_number, sc.name, b.bus_number, r.route_name)) like v_search
      )
  ), page_rows as (
    select *
    from filtered
    order by last_name, first_name, id
    limit v_size offset ((v_page - 1) * v_size)
  )
  select jsonb_build_object(
    'rows', coalesce(jsonb_agg(to_jsonb(page_rows)), '[]'::jsonb),
    'totalCount', (select count(*) from filtered),
    'page', v_page,
    'pageSize', v_size
  ) into v_result
  from page_rows;

  return v_result;
end $$;

grant execute on function public.get_admin_students_page(integer, integer, text, text, uuid) to authenticated;
revoke all on function public.get_admin_students_page(integer, integer, text, text, uuid) from public, anon;
