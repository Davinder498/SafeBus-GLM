-- Structural security regression for migration 0032.
do $$
declare v_definition text;
begin
  if to_regclass('public.bus_route_assignments') is null then raise exception 'Missing bus_route_assignments'; end if;
  if to_regclass('public.student_bus_assignments') is null then raise exception 'Missing student_bus_assignments'; end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.route_stops'::regclass and attname = 'school_id' and not attisdropped) then raise exception 'Missing school stops'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.bus_route_assignments'::regclass) then raise exception 'Bus service RLS disabled'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.student_bus_assignments'::regclass) then raise exception 'Student bus assignment RLS disabled'; end if;
  select pg_get_functiondef('public.student_bus_assignment_entities_in_tenant(uuid,uuid,uuid,uuid,uuid)'::regprocedure) into v_definition;
  if position('rs.route_id' in v_definition) = 0 or position('p_tenant_id' in v_definition) = 0 then raise exception 'Stop validation is not route and tenant scoped'; end if;
  select pg_get_functiondef('public.record_student_trip_event_for_active_trip(uuid,text)'::regprocedure) into v_definition;
  if position('bra.bus_id = v_trip.bus_id' in v_definition) = 0 or position('route_stop_id' in v_definition) = 0 then raise exception 'Trip events are not bound to bus and stop'; end if;
  if has_table_privilege('anon', 'public.student_bus_assignments', 'SELECT') then raise exception 'Anonymous student assignment read'; end if;
end $$;
