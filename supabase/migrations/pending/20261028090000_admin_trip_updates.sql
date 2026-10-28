-- Reviewed hosted forward change: school authority admin Trip updates.
-- The preconditions fail closed if the live function bodies drift.
DO $guard$
BEGIN
  IF (SELECT md5(replace(pg_get_functiondef('safebus_private.capture_notification_inbox_visibility()'::regprocedure), chr(13), ''))) <> '09222d7ec08eebd5bbb7bc0b5ed1bd6b'
     OR (SELECT md5(replace(pg_get_functiondef('safebus_private.notify_trip_audience(uuid,uuid,uuid,text,text,text,text,uuid,timestamptz)'::regprocedure), chr(13), ''))) <> '3dde9189a228401d643531162ad02607' THEN
    RAISE EXCEPTION 'School authority notification function drift' USING ERRCODE = 'P0001';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION safebus_private.capture_notification_inbox_visibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.recipient_role in ('tenant_admin', 'transportation_admin', 'school_admin')
    and new.event_type not in (
      'trip_started', 'trip_completed', 'trip_cancelled', 'trip_late', 'trip_missing', 'traffic_disruption',
      'weather_disruption', 'road_closure', 'mechanical_disruption', 'delivery_health_incident'
    ) then
    return null;
  end if;
  if new.recipient_role in ('guardian', 'driver', 'tenant_admin', 'school_admin', 'transportation_admin') then
    new.in_app_visible := coalesce((
      select s.in_app_enabled from public.user_notification_settings s
      where s.profile_id = new.recipient_profile_id and s.tenant_id = new.tenant_id
    ), true) and coalesce((
      select c.in_app_enabled from public.user_notification_category_preferences c
      where c.profile_id = new.recipient_profile_id and c.category = new.category
    ), true);
  else
    new.in_app_visible := true;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.notify_trip_audience(p_tenant_id uuid, p_trip_id uuid, p_route_id uuid, p_event_type text, p_category text, p_severity text, p_source_type text, p_source_id uuid, p_occurred_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_recipient record; v_trip public.driver_trips%rowtype; v_school_id uuid;
begin
  select * into v_trip from public.driver_trips
  where id = p_trip_id and tenant_id = p_tenant_id and route_id = p_route_id;
  if not found then return; end if;
  select school_id into v_school_id from public.routes
  where id = v_trip.route_id and tenant_id = p_tenant_id;

  for v_recipient in
    select distinct g.profile_id
    from public.student_bus_assignments sba
    join public.bus_route_assignments bra
      on bra.id = sba.bus_route_assignment_id and bra.tenant_id = sba.tenant_id
      and bra.route_id = v_trip.route_id and bra.bus_id = v_trip.bus_id
      and bra.route_trip_pattern_id = v_trip.route_trip_pattern_id
      and sba.route_trip_pattern_id = v_trip.route_trip_pattern_id
      and bra.status = 'active'
      and (bra.effective_from is null or bra.effective_from <= v_trip.service_date)
      and (bra.effective_to is null or bra.effective_to >= v_trip.service_date)
    join public.students student
      on student.id = sba.student_id and student.tenant_id = sba.tenant_id and student.status = 'active'
    join public.student_guardians sg
      on sg.student_id = student.id and sg.tenant_id = student.tenant_id and sg.status = 'active'
      and (sg.access_expires_at is null or sg.access_expires_at > now())
    join public.guardians g
      on g.id = sg.guardian_id and g.tenant_id = sg.tenant_id and g.status = 'active'
    where sba.tenant_id = p_tenant_id and sba.status = 'active'
      and sba.effective_from <= v_trip.service_date
      and (sba.effective_to is null or sba.effective_to >= v_trip.service_date)
  loop
    perform safebus_private.enqueue_user_notification(p_tenant_id, v_recipient.profile_id,
      p_event_type, p_category, p_severity, p_source_type, p_source_id,
      p_source_type || ':' || p_source_id::text || ':' || p_event_type || ':guardian_trip' || case when p_source_type = 'trip_operational_status' then ':' || extract(epoch from p_occurred_at)::text else '' end,
      p_occurred_at, null, p_trip_id, v_school_id);
  end loop;

  if p_event_type in (
    'trip_started', 'trip_completed', 'trip_cancelled', 'trip_late', 'trip_missing', 'traffic_disruption',
    'weather_disruption', 'road_closure', 'mechanical_disruption'
  ) then
    for v_recipient in
      select p.id as profile_id from public.profiles p
      where p.tenant_id = p_tenant_id and p.status = 'active'
        and (p.role in ('tenant_admin', 'transportation_admin')
          or (p.role = 'school_admin' and p.school_id = v_school_id))
    loop
      perform safebus_private.enqueue_user_notification(p_tenant_id, v_recipient.profile_id,
        p_event_type, p_category, p_severity, p_source_type, p_source_id,
        p_source_type || ':' || p_source_id::text || ':' || p_event_type || ':admin' || case when p_source_type = 'trip_operational_status' then ':' || extract(epoch from p_occurred_at)::text else '' end,
        p_occurred_at, null, p_trip_id, v_school_id);
    end loop;
  end if;
  if p_event_type in ('trip_started', 'trip_completed', 'trip_cancelled', 'traffic_disruption', 'weather_disruption', 'road_closure', 'mechanical_disruption') then
    for v_recipient in
      select d.profile_id from public.driver_trips trip
      join public.drivers d on d.id = trip.driver_id and d.tenant_id = trip.tenant_id and d.status = 'active'
      where trip.id = p_trip_id and trip.tenant_id = p_tenant_id and trip.route_id = p_route_id
    loop
      perform safebus_private.enqueue_user_notification(p_tenant_id, v_recipient.profile_id, p_event_type,
        p_category, p_severity, p_source_type, p_source_id,
        p_source_type || ':' || p_source_id::text || ':' || p_event_type || ':driver', p_occurred_at, null, p_trip_id, null);
    end loop;
  end if;
end;
$function$;
