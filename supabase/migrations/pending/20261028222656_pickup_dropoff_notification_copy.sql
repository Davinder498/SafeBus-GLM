-- Forward-only pickup/drop-off copy. No history replay or delivery.
DO $baseline$
DECLARE item record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.student_trip_events'::regclass
    AND tgname='student_trip_events_notify' AND tgenabled='O'
    AND pg_get_triggerdef(oid)='CREATE TRIGGER student_trip_events_notify AFTER INSERT ON public.student_trip_events FOR EACH ROW EXECUTE FUNCTION safebus_private.on_student_trip_event_notification()') THEN
    RAISE EXCEPTION 'Pickup/drop-off source trigger differs.' USING ERRCODE='55000';
  END IF;
  FOR item IN SELECT * FROM (VALUES
    ('safebus_private.notification_copy_before_announcements(user_notifications)', 'd8d709cf3a6667031a24914a0bfa5d78'),
    ('safebus_private.notification_push_copy(user_notifications)', '6ec7c2d0cc486cf5faa81ce166b933de'),
    ('safebus_private.on_student_trip_event_notification()', 'e16d5e4a42ca76739d3296e7da0eccde'),
    ('public.claim_push_notification_deliveries(text, integer, integer)', 'ed3c664547c96cc29cb2c27938c0c4e8'),
    ('public.resolve_push_notification_delivery(uuid, text)', '53d7b1c1f98c8ce21a596e088353ca0e')
  ) expected(signature, digest) LOOP
    IF to_regprocedure(item.signature) IS NULL OR md5(replace(pg_get_functiondef(to_regprocedure(item.signature)), chr(13), '')) <> item.digest THEN
      RAISE EXCEPTION 'Pickup/drop-off template baseline differs.' USING ERRCODE='55000';
    END IF;
  END LOOP;
  IF to_regclass('safebus_private.pickup_dropoff_event_copies') IS NOT NULL
    OR to_regprocedure('safebus_private.pickup_dropoff_event_copy(uuid,uuid,uuid,uuid,text)') IS NOT NULL
    OR to_regprocedure('public.resolve_guardian_pickup_dropoff_email_payload(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Pickup/drop-off copy is already or partially installed.' USING ERRCODE='55000';
  END IF;
END;
$baseline$;

CREATE TABLE safebus_private.pickup_dropoff_event_copies (
  student_trip_event_id uuid PRIMARY KEY REFERENCES public.student_trip_events(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  driver_trip_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('student_picked_up', 'student_dropped_off')),
  title text NOT NULL,
  body text NOT NULL
);
ALTER TABLE safebus_private.pickup_dropoff_event_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE safebus_private.pickup_dropoff_event_copies FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION safebus_private.pickup_dropoff_event_copy(p_event_id uuid, p_tenant_id uuid, p_student_id uuid, p_trip_id uuid, p_event_type text)
RETURNS TABLE(title text, body text)
LANGUAGE sql STABLE SET search_path TO '' AS $function$
  select coalesce(saved.title, case p_event_type when 'student_picked_up' then 'Pickup recorded' else 'Drop-off recorded' end),
    coalesce(saved.body,
      coalesce(nullif(trim(concat_ws(' ', nullif(trim(student.first_name), ''), nullif(trim(student.last_name), ''))), ''), 'Student name unavailable')
      || case p_event_type when 'student_picked_up' then ' was picked up on ' else ' was dropped off on ' end
      || case when labels.bus_number is null then 'bus number unavailable'
        else 'Bus ' || regexp_replace(labels.bus_number, '^bus\s+', '', 'i') end
      || ' at ' || coalesce(nullif(trim(stop.stop_name), ''), 'stop unavailable') || '.')
  from (values (1)) anchor(value)
  left join public.student_trip_events event
    on event.id=p_event_id and event.tenant_id=p_tenant_id and event.student_id=p_student_id
      and event.driver_trip_id=p_trip_id
      and event.event_type=case p_event_type when 'student_picked_up' then 'picked_up' when 'student_dropped_off' then 'dropped_off' end
  left join safebus_private.pickup_dropoff_event_copies saved
    on saved.student_trip_event_id=event.id and saved.tenant_id=event.tenant_id
      and saved.student_id=event.student_id and saved.driver_trip_id=event.driver_trip_id and saved.event_type=p_event_type
  left join public.students student on student.id=event.student_id and student.tenant_id=event.tenant_id
  left join public.driver_trips trip on trip.id=event.driver_trip_id and trip.tenant_id=event.tenant_id
  left join public.buses bus on bus.id=trip.bus_id and bus.tenant_id=event.tenant_id
  left join public.route_stops stop
    on stop.id=event.route_stop_id and stop.tenant_id=event.tenant_id and stop.route_id=trip.route_id
  cross join lateral (select coalesce(nullif(trim(trip.bus_number_snapshot), ''), nullif(trim(bus.bus_number), '')) as bus_number) labels
  where p_event_type in ('student_picked_up', 'student_dropped_off');
$function$;

CREATE OR REPLACE FUNCTION safebus_private.on_student_trip_event_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare v_recipient record; v_school uuid;
begin
  if not exists (
    select 1 from public.driver_trips trip
    join public.students student on student.id=new.student_id and student.tenant_id=trip.tenant_id
    where trip.id=new.driver_trip_id and trip.tenant_id=new.tenant_id
  ) then
    raise exception 'Student event context is invalid.' using errcode='23514';
  end if;
  insert into safebus_private.pickup_dropoff_event_copies
    (student_trip_event_id,tenant_id,student_id,driver_trip_id,event_type,title,body)
  select new.id,new.tenant_id,new.student_id,new.driver_trip_id,
    case new.event_type when 'picked_up' then 'student_picked_up' else 'student_dropped_off' end,
    copy.title,copy.body
  from safebus_private.pickup_dropoff_event_copy(new.id,new.tenant_id,new.student_id,new.driver_trip_id,
    case new.event_type when 'picked_up' then 'student_picked_up' else 'student_dropped_off' end) copy
  on conflict (student_trip_event_id) do nothing;
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

CREATE OR REPLACE FUNCTION safebus_private.notification_copy_before_announcements(n user_notifications)
 RETURNS TABLE(title text, body text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select copy.title,copy.body
  from safebus_private.pickup_dropoff_event_copy(n.source_id,n.tenant_id,n.student_id,n.driver_trip_id,n.event_type) copy
  where n.source_type='student_trip_event' and n.event_type in ('student_picked_up','student_dropped_off')
  union all
  select safebus_private.notification_event_title(n.event_type),
    case n.event_type
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
  ) context
  where n.event_type not in ('student_picked_up','student_dropped_off');
$function$;

CREATE OR REPLACE FUNCTION safebus_private.notification_push_copy(n user_notifications)
 RETURNS TABLE(title text, body text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select safebus_private.notification_preview_text(c.title, 100),
    case when n.event_type in ('student_picked_up','student_dropped_off') then c.body
      else safebus_private.notification_preview_text(c.body, 240) end
  from (
    select 'School authority announcement'::text as title, 'A new announcement is available.'::text as body
    where n.event_type = 'authority_announcement'
    union all
    select copy.title, copy.body from safebus_private.notification_copy(n) copy
    where n.event_type <> 'authority_announcement'
  ) c;
$function$;
CREATE OR REPLACE FUNCTION public.resolve_guardian_pickup_dropoff_email_payload(p_outbox_id uuid)
RETURNS TABLE(recipient_email text, notification_type text, title text, body text, event_occurred_at timestamp with time zone, tenant_timezone text, idempotency_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required.' using errcode='42501';
  end if;
  return query
  select nullif(trim(coalesce(guardian.email,profile.email)),''),outbox.notification_type,copy.title,copy.body,
    event.event_time,coalesce(nullif(trim(authority.timezone),''),'America/Edmonton'),
    'guardian-notification-outbox:' || outbox.id::text
  from public.guardian_notification_outbox outbox
  join public.guardians guardian on guardian.id=outbox.guardian_id and guardian.tenant_id=outbox.tenant_id and guardian.status='active'
  join public.profiles profile on profile.id=guardian.profile_id and profile.tenant_id=guardian.tenant_id
    and profile.status='active' and profile.role='guardian'
  join public.tenants authority on authority.id=outbox.tenant_id and authority.status='active'
  join public.student_trip_events event on event.id=outbox.student_trip_event_id and event.tenant_id=outbox.tenant_id
    and event.student_id=outbox.student_id
    and event.event_type=case outbox.notification_type when 'student_picked_up' then 'picked_up' when 'student_dropped_off' then 'dropped_off' end
  cross join lateral safebus_private.pickup_dropoff_event_copy(event.id,event.tenant_id,event.student_id,event.driver_trip_id,outbox.notification_type) copy
  where outbox.id=p_outbox_id and outbox.status='processing'
    and outbox.user_notification_id is null
    and safebus_private.guardian_email_outbox_is_eligible(outbox.id);
end;
$function$;

REVOKE ALL ON FUNCTION safebus_private.pickup_dropoff_event_copy(uuid,uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_guardian_pickup_dropoff_email_payload(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_guardian_pickup_dropoff_email_payload(uuid) TO service_role;


CREATE OR REPLACE FUNCTION public.claim_push_notification_deliveries(p_worker_id text, p_limit integer DEFAULT 50, p_lease_seconds integer DEFAULT 120)
 RETURNS TABLE(outbox_id uuid, tenant_id uuid, notification_id uuid, device_id uuid, fcm_token text, event_type text, category text, severity text, preview_mode text, android_channel text, collapse_key text, title text, body text, attempt_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  if length(trim(coalesce(p_worker_id,''))) not between 1 and 120 or p_limit not between 1 and 200 or p_lease_seconds not between 30 and 600 then
    raise exception 'Invalid claim request.' using errcode='22023'; end if;

  update public.push_notification_outbox o set status='cancelled',cancelled_at=now(),lease_owner=null,lease_expires_at=null
  where o.status in ('pending','retry','processing') and (
    not exists (
      select 1 from public.user_notifications n
      join public.profiles p on p.id=n.recipient_profile_id and p.status='active'
      join public.android_push_devices d on d.id=o.device_id and d.profile_id=p.id and d.status='active'
        and d.permission_state='granted' and d.last_seen_at>now()-interval '90 days'
      join public.user_notification_settings s on s.profile_id=p.id and s.push_enabled
      join public.user_notification_category_preferences cp on cp.profile_id=p.id and cp.category=n.category and cp.push_enabled
      join public.guardian_notification_delivery_policies pol on pol.tenant_id=n.tenant_id
        and pol.privacy_review_status='approved' and exists (select 1 from public.tenants notification_authority where notification_authority.id=pol.tenant_id and notification_authority.status='active')
      where n.id=o.notification_id
        and (n.event_type <> 'authority_announcement' or safebus_private.announcement_recipient_is_current(n))
      and (n.recipient_role <> 'driver' or safebus_private.driver_notification_is_eligible(n))
      and (p.role<>'guardian' or (n.student_id is null and (n.driver_trip_id is null
          or safebus_private.guardian_trip_notification_is_eligible(n, true))) or exists(
          select 1 from public.student_guardians sg join public.guardians g on g.id=sg.guardian_id and g.profile_id=p.id and g.tenant_id=n.tenant_id and g.status='active'
          join public.guardian_student_push_preferences gp on gp.student_guardian_id=sg.id and gp.category=n.category and gp.push_enabled
          where sg.student_id=n.student_id and sg.status='active' and sg.can_receive_notifications
            and (sg.access_expires_at is null or sg.access_expires_at>now())))
    )
  );

  -- Recover abandoned worker leases without retrying exhausted deliveries forever.
  with exhausted as (
    select o.id from public.push_notification_outbox o
    where o.status = 'processing' and o.lease_expires_at < now() and o.attempt_count >= 5
    order by o.lease_expires_at, o.id for update of o skip locked limit p_limit
  )
  update public.push_notification_outbox o set status = 'failed', failure_category = 'lease_expired',
    failure_code = 'ATTEMPTS_EXHAUSTED', failed_at = now(), last_error_at = now(),
    lease_owner = null, lease_expires_at = null, updated_at = now()
  from exhausted e where o.id = e.id;

  return query with candidates as (
    select o.id from public.push_notification_outbox o
    join public.guardian_notification_delivery_policies pol on pol.tenant_id=o.tenant_id
    where (o.status in ('pending','retry') or (o.status = 'processing' and o.lease_expires_at < now())) and o.available_after<=now() and o.attempt_count<5
      and (o.lease_expires_at is null or o.lease_expires_at<now())
      and (select count(*) from public.push_notification_outbox x where x.tenant_id=o.tenant_id
        and x.delivered_at>=date_trunc('day',now())) < pol.push_tenant_daily_limit
      and (select count(*) from public.push_notification_outbox x where x.tenant_id=o.tenant_id
        and x.updated_at>=now()-interval '1 minute' and x.status in ('processing','delivered')) < pol.push_tenant_per_minute_limit
    order by o.available_after,o.created_at,o.id for update of o skip locked limit p_limit
  ), claimed as (
    update public.push_notification_outbox o set status='processing',attempt_count=o.attempt_count+1,
      lease_owner=trim(p_worker_id),lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
    from candidates c where o.id=c.id returning o.*
  )
  select c.id,c.tenant_id,n.id,c.device_id,d.fcm_token,n.event_type,n.category,n.severity,s.preview_mode,
    case when n.severity='urgent' then 'urgent_operations' when n.category='assignments' then 'assignments' else 'trip_updates' end,
    'notification-'||n.id::text,
    copy.title, copy.body,c.attempt_count
  from claimed c join public.user_notifications n on n.id=c.notification_id
    join public.android_push_devices d on d.id=c.device_id
    join public.user_notification_settings s on s.profile_id=n.recipient_profile_id
    cross join lateral safebus_private.notification_push_copy(n) copy;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_push_notification_delivery(p_outbox_id uuid, p_worker_id text)
 RETURNS TABLE(outbox_id uuid, tenant_id uuid, notification_id uuid, device_id uuid, fcm_token text, event_type text, category text, severity text, preview_mode text, android_channel text, collapse_key text, title text, body text, attempt_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  if not exists(
    select 1 from public.push_notification_outbox o
    join public.user_notifications n on n.id=o.notification_id
    join public.profiles p on p.id=n.recipient_profile_id and p.status='active'
    join public.android_push_devices d on d.id=o.device_id and d.profile_id=p.id and d.status='active'
      and d.permission_state='granted' and d.last_seen_at>now()-interval '90 days'
    join public.user_notification_settings s on s.profile_id=p.id and s.push_enabled
    join public.user_notification_category_preferences cp on cp.profile_id=p.id and cp.category=n.category and cp.push_enabled
    join public.guardian_notification_delivery_policies pol on pol.tenant_id=n.tenant_id
      and pol.privacy_review_status='approved' and exists (select 1 from public.tenants notification_authority where notification_authority.id=pol.tenant_id and notification_authority.status='active')
    where o.id=p_outbox_id and o.status='processing' and o.lease_owner=p_worker_id and o.lease_expires_at>now()
      and (n.event_type <> 'authority_announcement' or safebus_private.announcement_recipient_is_current(n))
      and (n.recipient_role <> 'driver' or safebus_private.driver_notification_is_eligible(n))
      and (p.role<>'guardian' or (n.student_id is null and (n.driver_trip_id is null
          or safebus_private.guardian_trip_notification_is_eligible(n, true))) or exists(
        select 1 from public.student_guardians sg join public.guardians g on g.id=sg.guardian_id and g.profile_id=p.id and g.tenant_id=n.tenant_id and g.status='active'
        join public.guardian_student_push_preferences gp on gp.student_guardian_id=sg.id and gp.category=n.category and gp.push_enabled
        where sg.student_id=n.student_id and sg.status='active' and sg.can_receive_notifications
          and (sg.access_expires_at is null or sg.access_expires_at>now())))
  ) then
    update public.push_notification_outbox set status='cancelled',cancelled_at=now(),failure_category='eligibility_revoked',lease_owner=null,lease_expires_at=null where id=p_outbox_id and status='processing' and lease_owner=p_worker_id;
    return;
  end if;
  return query select o.id,o.tenant_id,n.id,o.device_id,d.fcm_token,n.event_type,n.category,n.severity,s.preview_mode,
    case when n.severity='urgent' then 'urgent_operations' when n.category='assignments' then 'assignments' else 'trip_updates' end,
    'notification-'||n.id::text,
    copy.title, copy.body,o.attempt_count
  from public.push_notification_outbox o join public.user_notifications n on n.id=o.notification_id
    join public.android_push_devices d on d.id=o.device_id join public.user_notification_settings s on s.profile_id=n.recipient_profile_id
  cross join lateral safebus_private.notification_push_copy(n) copy
  where o.id=p_outbox_id and o.status='processing' and o.lease_owner=p_worker_id;
end;
$function$;
