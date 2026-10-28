CREATE OR REPLACE FUNCTION safebus_private.notification_copy_before_announcements(n user_notifications)
 RETURNS TABLE(title text, body text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select safebus_private.notification_event_title(n.event_type),
    case n.event_type
      when 'student_picked_up' then 'A pickup was recorded on ' || context.bus_label || ' for ' || context.route_label || '.'
      when 'student_dropped_off' then 'A drop-off was recorded on ' || context.bus_label || ' for ' || context.route_label || '.'
      when 'trip_started' then context.trip_label || ' for ' || context.route_label || ' has started with ' || context.bus_label || '.'
      when 'trip_completed' then context.trip_label || ' for ' || context.route_label || ' has been completed by ' || context.bus_label || '.'
      when 'trip_cancelled' then context.trip_label || ' for ' || context.route_label || ' has been cancelled.'
      when 'trip_late' then context.bus_subject || ' is delayed on ' || context.route_label || '.'
      when 'trip_missing' then context.bus_subject || ' on ' || context.route_label || ' has been reported missing from service.'
      when 'traffic_disruption' then 'A traffic disruption has been reported for ' || context.bus_label || ' on ' || context.route_label || '.'
      when 'weather_disruption' then 'A weather disruption has been reported for ' || context.bus_label || ' on ' || context.route_label || '.'
      when 'road_closure' then 'A road closure has been reported for ' || context.route_label || ', affecting ' || context.bus_label || '.'
      when 'mechanical_disruption' then 'A mechanical issue has been reported for ' || context.bus_label || ' on ' || context.route_label || '.'
      when 'driver_assignment_created' then 'You have been assigned to ' || context.bus_label || ' on ' || context.route_label || '.'
      when 'driver_assignment_changed' then 'Your assignment for ' || context.bus_label || ' on ' || context.route_label || ' has changed.'
      when 'driver_assignment_ended' then 'Your assignment for ' || context.bus_label || ' on ' || context.route_label || ' has ended.'
      when 'student_service_changed' then 'Your student’s bus service assignment has changed.'
      when 'guardian_access_changed' then 'Your access to a linked student has changed.'
      when 'delivery_health_incident' then 'Some notifications could not be delivered.'
      when 'provider_configuration_incident' then 'A notification service configuration needs attention.'
      else 'A SafeBus notification is available.'
    end
  from (values (1)) anchor(value)
  left join public.driver_trips trip on trip.id = n.driver_trip_id and trip.tenant_id = n.tenant_id
  left join public.driver_route_assignments assignment
    on n.source_type = 'driver_route_assignment' and assignment.id = n.source_id and assignment.tenant_id = n.tenant_id
      and exists (select 1 from public.drivers recipient_driver where recipient_driver.id = assignment.driver_id
        and recipient_driver.profile_id = n.recipient_profile_id and recipient_driver.tenant_id = n.tenant_id)
  left join public.buses bus on bus.id = coalesce(trip.bus_id, assignment.bus_id) and bus.tenant_id = n.tenant_id
  left join public.routes route on route.id = coalesce(trip.route_id, assignment.route_id) and route.tenant_id = n.tenant_id
  left join public.route_trip_patterns pattern on pattern.id = trip.route_trip_pattern_id and pattern.tenant_id = n.tenant_id
  cross join lateral (select
    coalesce(nullif(trim(trip.bus_number_snapshot), ''), nullif(trim(bus.bus_number), '')) as bus_name,
    coalesce(nullif(trim(route.route_code), ''), nullif(trim(route.route_name), '')) as route_name,
    coalesce(nullif(trim(trip.trip_name_snapshot), ''), nullif(trim(pattern.display_name), '')) as trip_name
  ) labels
  cross join lateral (select
    case when labels.bus_name is null then 'the assigned bus' else 'bus ' || regexp_replace(labels.bus_name, '^bus\s+', '', 'i') end as bus_label,
    case when labels.bus_name is null then 'The assigned bus' else 'Bus ' || regexp_replace(labels.bus_name, '^bus\s+', '', 'i') end as bus_subject,
    case when labels.route_name is null then 'the assigned route' else 'route ' || regexp_replace(labels.route_name, '^route\s+', '', 'i') end as route_label,
    case when labels.trip_name is null then 'The trip'
      when labels.trip_name ~* '\mtrip\M' then labels.trip_name
      else labels.trip_name || ' trip' end as trip_label
  ) context;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.notification_push_copy(n user_notifications)
 RETURNS TABLE(title text, body text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select safebus_private.notification_preview_text(c.title, 100),
    safebus_private.notification_preview_text(c.body, 240)
  from (
    select 'School authority announcement'::text as title, 'A new announcement is available.'::text as body
    where n.event_type = 'authority_announcement'
    union all
    select copy.title, copy.body from safebus_private.notification_copy(n) copy
    where n.event_type <> 'authority_announcement'
  ) c;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.on_student_trip_event_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare v_recipient record; v_school uuid;
begin
  select r.school_id into v_school from public.driver_trips dt join public.routes r on r.id = dt.route_id where dt.id = new.driver_trip_id;
  for v_recipient in
    select g.profile_id
    from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id and g.tenant_id = sg.tenant_id
    where sg.tenant_id = new.tenant_id and sg.student_id = new.student_id and sg.status = 'active'
      and g.status = 'active' and (sg.access_expires_at is null or sg.access_expires_at > now())
  loop
    perform safebus_private.enqueue_user_notification(new.tenant_id, v_recipient.profile_id,
      case new.event_type when 'picked_up' then 'student_picked_up' else 'student_dropped_off' end,
      'pickup_dropoff', 'info', 'student_trip_event', new.id,
      'student_trip_event:' || new.id::text, new.event_time, new.student_id, new.driver_trip_id, v_school);
  end loop;
  return new;
end;
$function$;
