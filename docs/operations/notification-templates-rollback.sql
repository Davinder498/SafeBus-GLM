-- Bounded function rollback; run only through the protected release workflow.
CREATE OR REPLACE FUNCTION safebus_private.on_trip_operational_status_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare v_trip public.driver_trips; v_event text; v_severity text; v_driver_profile uuid;
begin
  if new.operational_status = 'normal' or (tg_op = 'UPDATE' and old.operational_status = new.operational_status and old.reason_code is not distinct from new.reason_code) then return new; end if;
  select * into v_trip from public.driver_trips where id = new.driver_trip_id and tenant_id = new.tenant_id;
  if not found then return new; end if;
  v_event := case new.operational_status when 'late' then 'trip_late' else 'trip_missing' end;
  v_severity := case new.operational_status when 'missing' then 'urgent' else 'warning' end;
  perform safebus_private.notify_trip_audience(new.tenant_id, new.driver_trip_id, v_trip.route_id,
    v_event, 'operations', v_severity, 'trip_operational_status', new.id, new.set_at);
  select d.profile_id into v_driver_profile from public.drivers d where d.id = v_trip.driver_id and d.status = 'active';
  perform safebus_private.enqueue_user_notification(new.tenant_id, v_driver_profile, v_event, 'operations',
    v_severity, 'trip_operational_status', new.id,
    'trip_operational_status:' || new.id::text || ':' || new.operational_status || ':driver',
    new.set_at, null, new.driver_trip_id, null);
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
      p_source_type || ':' || p_source_id::text || ':' || p_event_type || ':guardian_trip',
      p_occurred_at, null, p_trip_id, v_school_id);
  end loop;

  if p_event_type in (
    'trip_cancelled', 'trip_late', 'trip_missing', 'traffic_disruption',
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
        p_source_type || ':' || p_source_id::text || ':' || p_event_type || ':admin',
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

CREATE OR REPLACE FUNCTION safebus_private.on_guardian_access_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare v_profile uuid; v_effective boolean;
begin
  select profile_id into v_profile from public.guardians where id = new.guardian_id;
  v_effective := new.status = 'active' and (new.access_expires_at is null or new.access_expires_at > now());
  if not v_effective then
    update public.push_notification_outbox o set status = 'cancelled', cancelled_at = now(), lease_owner = null, lease_expires_at = null
    from public.user_notifications n where o.notification_id = n.id and n.recipient_profile_id = v_profile
      and n.student_id = new.student_id and o.status in ('pending', 'retry', 'processing');
  end if;
  if v_profile is not null then
    perform safebus_private.enqueue_user_notification(new.tenant_id, v_profile, 'guardian_access_changed',
      'service_changes', 'info', 'student_guardian', new.id,
      'student_guardian:' || new.id::text || ':' || extract(epoch from new.updated_at)::bigint::text,
      new.updated_at, case when v_effective then new.student_id else null end, null, null);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.on_student_service_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'pg_temp'
AS $function$
declare v_recipient record; v_school uuid;
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'seat_number' - 'updated_at')
      = (to_jsonb(old) - 'seat_number' - 'updated_at') then
    return new; -- Seat-only edits do not send service-change notifications.
  end if;
  select r.school_id into v_school from public.bus_route_assignments bra join public.routes r on r.id = bra.route_id where bra.id = new.bus_route_assignment_id;
  for v_recipient in
    select g.profile_id from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id and g.status = 'active'
    where sg.student_id = new.student_id and sg.tenant_id = new.tenant_id and sg.status = 'active'
      and (sg.access_expires_at is null or sg.access_expires_at > now())
  loop
    perform safebus_private.enqueue_user_notification(new.tenant_id, v_recipient.profile_id,
      'student_service_changed', 'service_changes', 'info', 'student_bus_assignment', new.id,
      'student_bus_assignment:' || new.id::text || ':' || extract(epoch from new.updated_at)::bigint::text,
      new.updated_at, new.student_id, null, v_school);
  end loop;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.on_driver_assignment_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare v_profile uuid; v_event text; v_row public.driver_route_assignments;
begin
  v_row := new;
  select profile_id into v_profile from public.drivers where id = v_row.driver_id and tenant_id = v_row.tenant_id and status = 'active';
  if v_profile is null then return new; end if;
  if tg_op = 'INSERT' and new.status = 'active' then v_event := 'driver_assignment_created';
  elsif tg_op = 'UPDATE' and old.status = 'active' and new.status <> 'active' then v_event := 'driver_assignment_ended';
  elsif tg_op = 'UPDATE' and row(old.driver_id, old.bus_id, old.route_id, old.trip_type, old.effective_from, old.effective_to, old.status)
    is distinct from row(new.driver_id, new.bus_id, new.route_id, new.trip_type, new.effective_from, new.effective_to, new.status) then v_event := 'driver_assignment_changed';
  else return new; end if;
  perform safebus_private.enqueue_user_notification(v_row.tenant_id, v_profile, v_event, 'assignments', 'info',
    'driver_route_assignment', v_row.id,
    'driver_route_assignment:' || v_row.id::text || ':' || v_event || ':' || extract(epoch from v_row.updated_at)::bigint::text,
    v_row.updated_at, null, null, (select school_id from public.routes where id = v_row.route_id));
  return new;
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
        select 1 from public.student_guardians sg join public.guardians g on g.id=sg.guardian_id and g.profile_id=p.id
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
    case when s.preview_mode='limited' then case n.event_type
      when 'trip_cancelled' then 'Trip cancelled' when 'trip_missing' then 'Bus service missing'
      when 'trip_late' then 'Bus reported late' when 'mechanical_disruption' then 'Mechanical disruption'
      when 'road_closure' then 'Road closure' when 'driver_assignment_changed' then 'Assignment changed'
      when 'driver_assignment_created' then 'Assignment created' when 'driver_assignment_ended' then 'Assignment ended'
      when 'student_picked_up' then 'Pickup update' when 'student_dropped_off' then 'Drop-off update' else 'SafeBus update' end
      else 'SafeBus update' end,
    'Open SafeBus to view this update.',o.attempt_count
  from public.push_notification_outbox o join public.user_notifications n on n.id=o.notification_id
    join public.android_push_devices d on d.id=o.device_id join public.user_notification_settings s on s.profile_id=n.recipient_profile_id
  where o.id=p_outbox_id and o.status='processing' and o.lease_owner=p_worker_id;
end;
$function$;

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
          select 1 from public.student_guardians sg join public.guardians g on g.id=sg.guardian_id and g.profile_id=p.id
          join public.guardian_student_push_preferences gp on gp.student_guardian_id=sg.id and gp.category=n.category and gp.push_enabled
          where sg.student_id=n.student_id and sg.status='active' and sg.can_receive_notifications
            and (sg.access_expires_at is null or sg.access_expires_at>now())))
    )
  );

  return query with candidates as (
    select o.id from public.push_notification_outbox o
    join public.guardian_notification_delivery_policies pol on pol.tenant_id=o.tenant_id
    where o.status in ('pending','retry') and o.available_after<=now() and o.attempt_count<5
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
    case when s.preview_mode='limited' then
      case n.event_type when 'trip_cancelled' then 'Trip cancelled' when 'trip_missing' then 'Bus service missing'
        when 'trip_late' then 'Bus reported late' when 'mechanical_disruption' then 'Mechanical disruption'
        when 'road_closure' then 'Road closure' when 'driver_assignment_changed' then 'Assignment changed'
        when 'driver_assignment_created' then 'Assignment created' when 'driver_assignment_ended' then 'Assignment ended'
        when 'student_picked_up' then 'Pickup update' when 'student_dropped_off' then 'Drop-off update'
        else 'SafeBus update' end else 'SafeBus update' end,
    'Open SafeBus to view this update.',c.attempt_count
  from claimed c join public.user_notifications n on n.id=c.notification_id
    join public.android_push_devices d on d.id=c.device_id
    join public.user_notification_settings s on s.profile_id=n.recipient_profile_id;
end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.notification_recipient_can_access(n user_notifications)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select safebus_private.notification_access_before_announcements(n)
    and (n.event_type <> 'authority_announcement' or safebus_private.announcement_recipient_is_current(n));
$function$;

CREATE OR REPLACE FUNCTION safebus_private.notification_copy_before_announcements(n user_notifications)
 RETURNS TABLE(title text, body text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    case n.event_type
      when 'student_picked_up' then 'Pickup recorded'
      when 'student_dropped_off' then 'Drop-off recorded'
      when 'trip_started' then 'Trip started'
      when 'trip_completed' then 'Trip completed'
      when 'trip_cancelled' then 'Trip cancelled'
      when 'trip_late' then 'Bus reported late'
      when 'trip_missing' then 'Bus service missing'
      when 'traffic_disruption' then 'Traffic disruption'
      when 'weather_disruption' then 'Weather disruption'
      when 'road_closure' then 'Road closure'
      when 'mechanical_disruption' then 'Mechanical disruption'
      when 'driver_assignment_created' then 'Assignment created'
      when 'driver_assignment_changed' then 'Assignment changed'
      when 'driver_assignment_ended' then 'Assignment ended'
      when 'student_service_changed' then 'Bus service changed'
      when 'guardian_access_changed' then 'Access link changed'
      when 'delivery_health_incident' then 'Notification delivery incident'
      else 'BusSafe update'
    end,
    (case
      when n.event_type in ('student_picked_up', 'student_dropped_off') then
        case n.event_type when 'student_picked_up' then 'Pickup' else 'Drop-off' end ||
        ' was recorded for ' || coalesce(nullif(trim(student.preferred_name), ''), nullif(trim(student.first_name), ''), 'your child') ||
        ' on ' || context.bus_label || ', ' || context.route_label
      when n.event_type in ('trip_started', 'trip_completed', 'trip_cancelled') then
        'Trip' || case when context.trip_name is null then '' else ' “' || context.trip_name || '”' end ||
        ' for ' || context.bus_label || ' on ' || context.route_label ||
        case n.event_type when 'trip_started' then ' was started' when 'trip_completed' then ' was completed' else ' was cancelled' end ||
        ' by ' || coalesce(nullif(trim(driver_profile.full_name), ''), 'the driver')
      when n.event_type in ('trip_late', 'trip_missing', 'traffic_disruption', 'weather_disruption', 'road_closure', 'mechanical_disruption') then
        context.bus_label || ' on ' || context.route_label || case n.event_type
          when 'trip_late' then ' was reported late'
          when 'trip_missing' then ' was reported missing'
          when 'traffic_disruption' then ' has a reported traffic disruption'
          when 'weather_disruption' then ' has a reported weather disruption'
          when 'road_closure' then ' has a reported road closure'
          else ' has a reported mechanical problem' end
      when n.event_type in ('driver_assignment_created', 'driver_assignment_changed', 'driver_assignment_ended') then
        'Your assignment for ' || context.bus_label || ' on ' || context.route_label ||
        case n.event_type when 'driver_assignment_created' then ' was created' when 'driver_assignment_changed' then ' was changed' else ' ended' end
      else case n.event_type
        when 'student_service_changed' then 'Bus service changed'
        when 'guardian_access_changed' then 'Guardian access changed'
        when 'delivery_health_incident' then 'Notification delivery needs attention'
        when 'provider_configuration_incident' then 'Notification configuration needs attention'
        else 'A BusSafe update was recorded' end
    end) || ' at ' || to_char(n.occurred_at at time zone coalesce(nullif(trim(tenant.timezone), ''), 'America/Edmonton'), 'FMHH12:MI AM') ||
      ' on ' || to_char(n.occurred_at at time zone coalesce(nullif(trim(tenant.timezone), ''), 'America/Edmonton'), 'Mon FMDD, YYYY') || '.'
  from (values (1)) anchor(value)
  left join public.tenants tenant on tenant.id = n.tenant_id
  left join public.students student on student.id = n.student_id and student.tenant_id = n.tenant_id and student.status = 'active'
  left join public.driver_trips trip on trip.id = n.driver_trip_id and trip.tenant_id = n.tenant_id
  left join public.driver_route_assignments assignment
    on n.source_type = 'driver_route_assignment' and assignment.id = n.source_id and assignment.tenant_id = n.tenant_id
  left join public.student_bus_assignments student_assignment
    on n.source_type = 'student_bus_assignment' and student_assignment.id = n.source_id and student_assignment.tenant_id = n.tenant_id
  left join public.bus_route_assignments bus_assignment
    on bus_assignment.id = student_assignment.bus_route_assignment_id and bus_assignment.tenant_id = n.tenant_id
  left join public.buses bus on bus.id = coalesce(trip.bus_id, assignment.bus_id, bus_assignment.bus_id) and bus.tenant_id = n.tenant_id
  left join public.routes route on route.id = coalesce(trip.route_id, assignment.route_id, bus_assignment.route_id) and route.tenant_id = n.tenant_id
  left join public.route_trip_patterns pattern on pattern.id = trip.route_trip_pattern_id and pattern.tenant_id = n.tenant_id
  left join public.drivers driver on driver.id = trip.driver_id and driver.tenant_id = n.tenant_id
  left join public.profiles driver_profile on driver_profile.id = driver.profile_id and driver_profile.tenant_id = n.tenant_id
  cross join lateral (select
    case when coalesce(nullif(trim(trip.bus_number_snapshot), ''), nullif(trim(bus.bus_number), '')) is null then 'the assigned bus'
      else 'Bus ' || coalesce(nullif(trim(trip.bus_number_snapshot), ''), nullif(trim(bus.bus_number), '')) end as bus_label,
    case when coalesce(nullif(trim(route.route_code), ''), nullif(trim(route.route_name), '')) is null then 'the assigned route'
      else 'Route ' || coalesce(nullif(trim(route.route_code), ''), nullif(trim(route.route_name), '')) end as route_label,
    coalesce(nullif(trim(trip.trip_name_snapshot), ''), nullif(trim(pattern.display_name), '')) as trip_name
  ) context;
$function$;

DROP FUNCTION safebus_private.notification_push_copy(public.user_notifications);
DROP FUNCTION safebus_private.notification_preview_text(text, integer);
DROP FUNCTION safebus_private.notification_event_title(text);
ALTER TRIGGER zzzz_student_guardians_notify ON public.student_guardians RENAME TO student_guardians_notify;
