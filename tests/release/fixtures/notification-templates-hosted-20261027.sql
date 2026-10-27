-- Read-only hosted function snapshot, no records or credentials.
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

CREATE OR REPLACE FUNCTION public.get_user_notification_detail(p_id uuid)
 RETURNS TABLE(id uuid, event_type text, category text, severity text, title text, body text, occurred_at timestamp with time zone, created_at timestamp with time zone, read_at timestamp with time zone, archived_at timestamp with time zone, destination_path text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select n.id, n.event_type, n.category, n.severity, copy.title, copy.body,
    n.occurred_at, n.created_at, n.read_at, n.archived_at, '/notifications?notification=' || n.id::text
  from public.user_notifications n cross join lateral safebus_private.notification_copy(n) copy
  where n.id = p_id and n.recipient_profile_id = (select auth.uid()) and n.archived_at is null
    and safebus_private.notification_recipient_can_access(n);
$function$;

CREATE OR REPLACE FUNCTION public.get_user_notifications(p_limit integer DEFAULT 30, p_before_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_before_id uuid DEFAULT NULL::uuid, p_unread_only boolean DEFAULT false, p_category text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, event_type text, category text, severity text, title text, body text, occurred_at timestamp with time zone, created_at timestamp with time zone, read_at timestamp with time zone, archived_at timestamp with time zone, destination_path text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active') then
    raise exception 'Active authentication is required.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'Limit must be between 1 and 100.' using errcode = '22023';
  end if;
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'Both cursor fields are required.' using errcode = '22023';
  end if;
  if p_category is not null and p_category not in ('pickup_dropoff', 'trip_status', 'service_changes', 'assignments', 'operations', 'delivery_health', 'platform') then
    raise exception 'Invalid category.' using errcode = '22023';
  end if;
  return query select n.id, n.event_type, n.category, n.severity, copy.title, copy.body,
    n.occurred_at, n.created_at, n.read_at, n.archived_at, '/notifications?notification=' || n.id::text
  from public.user_notifications n
  cross join lateral safebus_private.notification_copy(n) copy
  where n.recipient_profile_id = (select auth.uid()) and n.archived_at is null and n.in_app_visible
    and safebus_private.notification_recipient_can_access(n)
    and (not coalesce(p_unread_only, false) or n.read_at is null)
    and (p_category is null or n.category = p_category or (p_category = 'operations' and n.category = 'service_changes'))
    and (p_before_created_at is null or (n.created_at, n.id) < (p_before_created_at, p_before_id))
  order by n.created_at desc, n.id desc limit p_limit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_notification_delivery_incident(p_tenant_id uuid, p_incident_code text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare v_profile record;v_count integer:=0;v_id uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  if p_incident_code not in ('firebase_configuration','firebase_authentication','provider_unavailable','queue_stalled','quota_exhausted') then
    raise exception 'Invalid incident code.' using errcode='22023'; end if;
  if p_tenant_id is null then
    for v_profile in select id from public.profiles where role='platform_super_admin' and status='active' loop
      v_id:=safebus_private.enqueue_user_notification(null,v_profile.id,'provider_configuration_incident','platform','warning',
        'platform_provider',null,'platform_provider:'||p_incident_code||':'||date_trunc('hour',now())::text,now());
      if v_id is not null then v_count:=v_count+1;end if;
    end loop;
  else
    for v_profile in select id from public.profiles where tenant_id=p_tenant_id and role in('tenant_admin','transportation_admin') and status='active' loop
      v_id:=safebus_private.enqueue_user_notification(p_tenant_id,v_profile.id,'delivery_health_incident','delivery_health','warning',
        'delivery_health',null,'delivery_health:'||p_incident_code||':'||date_trunc('hour',now())::text,now());
      if v_id is not null then v_count:=v_count+1;end if;
    end loop;
  end if;
  return v_count;
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

CREATE OR REPLACE FUNCTION safebus_private.capture_notification_inbox_visibility()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.recipient_role in ('tenant_admin', 'transportation_admin', 'school_admin')
    and new.event_type not in (
      'trip_cancelled', 'trip_late', 'trip_missing', 'traffic_disruption',
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

CREATE OR REPLACE FUNCTION safebus_private.driver_can_access_notification(p_notification user_notifications)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p_notification.recipient_profile_id = (select auth.uid())
    and safebus_private.driver_notification_is_eligible(p_notification);
$function$;

CREATE OR REPLACE FUNCTION safebus_private.driver_notification_is_eligible(n user_notifications)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select n.recipient_role = 'driver' and n.student_id is null and exists (
    select 1 from public.profiles p
    join public.tenants t on t.id = p.tenant_id and t.status = 'active'
    join public.drivers d on d.profile_id = p.id and d.tenant_id = p.tenant_id and d.status = 'active'
    where p.id = n.recipient_profile_id and p.tenant_id = n.tenant_id and p.role = 'driver' and p.status = 'active'
    and (
      (n.category = 'assignments' and n.event_type in ('driver_assignment_created', 'driver_assignment_changed', 'driver_assignment_ended'))
      or safebus_private.announcement_recipient_is_current(n)
      or (n.event_type in ('trip_started', 'trip_completed', 'trip_cancelled', 'trip_late', 'trip_missing',
        'traffic_disruption', 'weather_disruption', 'road_closure', 'mechanical_disruption')
        and n.category in ('trip_status', 'operations') and exists (
          select 1 from public.driver_trips trip where trip.id = n.driver_trip_id
            and trip.tenant_id = n.tenant_id and trip.driver_id = d.id
        ))
    )
  );
$function$;

CREATE OR REPLACE FUNCTION safebus_private.enqueue_push_for_notification(p_notification_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_notification public.user_notifications;
begin
  select * into v_notification from public.user_notifications where id = p_notification_id;
  if not found or v_notification.recipient_role in ('tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin') then return; end if;
  insert into public.push_notification_outbox(tenant_id, notification_id, device_id, available_after)
  select v_notification.tenant_id, v_notification.id, d.id,
    safebus_private.next_push_availability(v_notification.tenant_id, v_notification.recipient_profile_id, v_notification.event_type)
  from public.android_push_devices d
  join public.user_notification_settings s on s.profile_id = d.profile_id and s.push_enabled
  join public.user_notification_category_preferences cp on cp.profile_id = d.profile_id
    and cp.category = v_notification.category and cp.push_enabled
  join public.guardian_notification_delivery_policies pol on pol.tenant_id = v_notification.tenant_id
    and pol.privacy_review_status = 'approved' and exists (select 1 from public.tenants notification_authority where notification_authority.id=pol.tenant_id and notification_authority.status='active')
  where (v_notification.event_type <> 'authority_announcement' or safebus_private.announcement_recipient_is_current(v_notification))
    and (v_notification.recipient_role <> 'driver' or safebus_private.driver_notification_is_eligible(v_notification))
    and d.profile_id = v_notification.recipient_profile_id and d.status = 'active'
    and d.permission_state = 'granted' and d.last_seen_at > now() - interval '90 days'
    and (
      v_notification.recipient_role <> 'guardian' or (v_notification.student_id is null and (v_notification.driver_trip_id is null
        or safebus_private.guardian_trip_notification_is_eligible(v_notification, true))) or exists (
        select 1 from public.student_guardians sg
        join public.guardians g on g.id = sg.guardian_id and g.profile_id = v_notification.recipient_profile_id
        join public.guardian_student_push_preferences gp on gp.student_guardian_id = sg.id
          and gp.category = v_notification.category and gp.push_enabled
        where sg.student_id = v_notification.student_id and sg.status = 'active'
          and sg.can_receive_notifications and (sg.access_expires_at is null or sg.access_expires_at > now())
      )
    )
  on conflict (notification_id, device_id) do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.enqueue_user_notification(p_tenant_id uuid, p_recipient_profile_id uuid, p_event_type text, p_category text, p_severity text, p_source_type text, p_source_id uuid, p_deduplication_key text, p_occurred_at timestamp with time zone, p_student_id uuid DEFAULT NULL::uuid, p_driver_trip_id uuid DEFAULT NULL::uuid, p_school_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare v_id uuid; v_role public.user_role;
begin
  select role into v_role from public.profiles where id = p_recipient_profile_id and status = 'active'
    and (tenant_id = p_tenant_id or (role = 'platform_super_admin' and p_tenant_id is null));
  if not found then return null; end if;
  if v_role = 'platform_super_admin' and (p_category <> 'platform' or p_student_id is not null or p_driver_trip_id is not null) then return null; end if;
  insert into public.user_notifications(tenant_id, recipient_profile_id, recipient_role, event_type, category,
    severity, source_type, source_id, student_id, driver_trip_id, school_id, deduplication_key, occurred_at)
  values (p_tenant_id, p_recipient_profile_id, v_role, p_event_type, p_category, p_severity,
    p_source_type, p_source_id, p_student_id, p_driver_trip_id, p_school_id, p_deduplication_key, coalesce(p_occurred_at, now()))
  on conflict (recipient_profile_id, deduplication_key) do nothing returning id into v_id;
  if v_id is not null then
    perform safebus_private.enqueue_push_for_notification(v_id);
    perform safebus_private.send_notification_invalidation(p_recipient_profile_id, v_id);
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.guardian_trip_notification_is_eligible(n user_notifications, p_push_only boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select n.recipient_role = 'guardian' and exists (
    select 1
    from public.driver_trips trip
    join public.profiles profile
      on profile.id = n.recipient_profile_id and profile.tenant_id = trip.tenant_id
      and profile.role = 'guardian' and profile.status = 'active'
    join public.guardians guardian
      on guardian.profile_id = profile.id and guardian.tenant_id = trip.tenant_id
      and guardian.status = 'active'
    join public.student_guardians sg
      on sg.guardian_id = guardian.id and sg.tenant_id = trip.tenant_id and sg.status = 'active'
      and (sg.access_expires_at is null or sg.access_expires_at > now())
    join public.students student
      on student.id = sg.student_id and student.tenant_id = trip.tenant_id and student.status = 'active'
    join public.student_bus_assignments sba
      on sba.student_id = student.id and sba.tenant_id = trip.tenant_id and sba.status = 'active'
      and sba.route_trip_pattern_id = trip.route_trip_pattern_id
      and sba.effective_from <= trip.service_date
      and (sba.effective_to is null or sba.effective_to >= trip.service_date)
    join public.bus_route_assignments bra
      on bra.id = sba.bus_route_assignment_id and bra.tenant_id = trip.tenant_id
      and bra.bus_id = trip.bus_id and bra.route_id = trip.route_id
      and bra.route_trip_pattern_id = trip.route_trip_pattern_id and bra.status = 'active'
      and (bra.effective_from is null or bra.effective_from <= trip.service_date)
      and (bra.effective_to is null or bra.effective_to >= trip.service_date)
    where trip.id = n.driver_trip_id and trip.tenant_id = n.tenant_id
      and (not p_push_only or (sg.can_receive_notifications and exists (
        select 1 from public.guardian_student_push_preferences preference
        where preference.student_guardian_id = sg.id and preference.category = n.category
          and preference.push_enabled
      )))
  );
$function$;

CREATE OR REPLACE FUNCTION safebus_private.notification_access_before_announcements(n user_notifications)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.id = n.recipient_profile_id
      and p.role = n.recipient_role and p.status = 'active'
      and (
        (p.role = 'platform_super_admin' and n.tenant_id is null and n.category = 'platform'
          and n.student_id is null and n.driver_trip_id is null and n.school_id is null)
        or (p.tenant_id = n.tenant_id and (
          (p.role = 'driver' and n.student_id is null and safebus_private.driver_can_access_notification(n))
          or (p.role in ('tenant_admin', 'transportation_admin') and n.student_id is null)
          or (p.role = 'school_admin' and p.school_id = n.school_id and n.student_id is null)
          or (p.role = 'guardian' and exists (
            select 1 from public.guardians g
            where g.profile_id = p.id and g.tenant_id = p.tenant_id and g.status = 'active'
              and ((n.student_id is null and (n.driver_trip_id is null
                or safebus_private.guardian_trip_notification_is_eligible(n, false))) or exists (
                select 1 from public.student_guardians sg
                where sg.guardian_id = g.id and sg.tenant_id = g.tenant_id and sg.student_id = n.student_id
                  and sg.status = 'active' and (sg.access_expires_at is null or sg.access_expires_at > now())
              ))
          ))
        ))
      )
  );
$function$;

CREATE OR REPLACE FUNCTION safebus_private.notification_copy(n user_notifications)
 RETURNS TABLE(title text, body text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select a.title, a.body from safebus_private.authority_announcements a
  where n.event_type = 'authority_announcement' and n.source_type = 'authority_announcement'
    and a.id = n.source_id and a.tenant_id = n.tenant_id
  union all
  select c.title, c.body from safebus_private.notification_copy_before_announcements(n) c
  where n.event_type <> 'authority_announcement';
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

CREATE OR REPLACE FUNCTION safebus_private.notification_recipient_can_access(n user_notifications)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select safebus_private.notification_access_before_announcements(n)
    and (n.event_type <> 'authority_announcement' or safebus_private.announcement_recipient_is_current(n));
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

CREATE OR REPLACE FUNCTION safebus_private.on_driver_trip_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare v_event text; v_severity text := 'info';
begin
  if tg_op = 'INSERT' and new.status = 'active' then v_event := 'trip_started';
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'completed' then v_event := 'trip_completed';
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status and new.status = 'cancelled' then v_event := 'trip_cancelled'; v_severity := 'urgent';
  else return new;
  end if;
  perform safebus_private.notify_trip_audience(new.tenant_id, new.id, new.route_id, v_event,
    'trip_status', v_severity, 'driver_trip', new.id, coalesce(new.ended_at, new.started_at, now()));
  return new;
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

CREATE OR REPLACE FUNCTION safebus_private.on_trip_exception_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare v_trip public.driver_trips; v_event text; v_severity text := 'warning';
begin
  v_event := case new.exception_type
    when 'traffic_delay' then 'traffic_disruption'
    when 'weather_delay' then 'weather_disruption'
    when 'road_closure' then 'road_closure'
    when 'mechanical_issue' then 'mechanical_disruption'
    else null end;
  if v_event is null then return new; end if;
  if v_event in ('road_closure', 'mechanical_disruption') then v_severity := 'urgent'; end if;
  select * into v_trip from public.driver_trips where id = new.driver_trip_id and tenant_id = new.tenant_id;
  if found then perform safebus_private.notify_trip_audience(new.tenant_id, new.driver_trip_id, v_trip.route_id,
    v_event, 'operations', v_severity, 'trip_exception', new.id, new.occurred_at); end if;
  return new;
end;
$function$;

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

CREATE OR REPLACE FUNCTION safebus_private.apply_guardian_delivery_defaults_to_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_email_enabled boolean := false;
  v_email_set_at timestamptz;
  v_any_push boolean := false;
begin
  if new.status = 'active' then
    select
      g.pickup_dropoff_email_enabled,
      g.email_preferences_set_at,
      coalesce((select bool_or(cp.push_enabled)
        from public.user_notification_category_preferences cp
        where cp.profile_id = g.profile_id
          and cp.category in ('pickup_dropoff', 'trip_status', 'operations', 'service_changes')), false)
    into v_email_enabled, v_email_set_at, v_any_push
    from public.guardians g
    where g.id = new.guardian_id
      and g.tenant_id = new.tenant_id
      and g.status = 'active';
  end if;

  new.can_receive_notifications := (
    (coalesce(v_email_enabled, false) and v_email_set_at is not null)
    or coalesce(v_any_push, false)
  );
  new.notify_pickup := coalesce(v_email_enabled, false) and v_email_set_at is not null;
  new.notify_dropoff := new.notify_pickup;
  new.notification_preferences_set_at := case
    when new.can_receive_notifications then coalesce(v_email_set_at, now())
    else null
  end;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.sync_guardian_push_defaults_to_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_profile_id uuid;
begin
  select g.profile_id into v_profile_id
  from public.guardians g
  where g.id = new.guardian_id
    and g.tenant_id = new.tenant_id
    and g.status = 'active';

  insert into public.guardian_student_push_preferences(
    student_guardian_id, category, push_enabled, preferences_set_at, updated_at
  )
  select
    new.id,
    category.name,
    coalesce((select cp.push_enabled
      from public.user_notification_category_preferences cp
      where cp.profile_id = v_profile_id and cp.category = category.name), false),
    now(),
    now()
  from (values ('pickup_dropoff'), ('trip_status'), ('operations'), ('service_changes')) category(name)
  on conflict (student_guardian_id, category) do update
  set push_enabled = excluded.push_enabled,
      preferences_set_at = excluded.preferences_set_at,
      updated_at = excluded.updated_at;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.claim_push_notification_deliveries(text, integer, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_push_notification_deliveries(text, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.get_user_notification_detail(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_notification_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_notification_detail(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_user_notifications(integer, timestamp with time zone, uuid, boolean, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_notifications(integer, timestamp with time zone, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_notifications(integer, timestamp with time zone, uuid, boolean, text) TO service_role;
REVOKE ALL ON FUNCTION public.record_notification_delivery_incident(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_notification_delivery_incident(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.resolve_push_notification_delivery(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_push_notification_delivery(uuid, text) TO service_role;
REVOKE ALL ON FUNCTION safebus_private.capture_notification_inbox_visibility() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.driver_can_access_notification(user_notifications) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.driver_notification_is_eligible(user_notifications) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.enqueue_push_for_notification(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.enqueue_user_notification(uuid, uuid, text, text, text, text, uuid, text, timestamp with time zone, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.guardian_trip_notification_is_eligible(user_notifications, boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.notification_access_before_announcements(user_notifications) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.notification_copy(user_notifications) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.notification_copy_before_announcements(user_notifications) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.notification_recipient_can_access(user_notifications) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION safebus_private.notification_recipient_can_access(user_notifications) TO authenticated;
REVOKE ALL ON FUNCTION safebus_private.notify_trip_audience(uuid, uuid, uuid, text, text, text, text, uuid, timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.on_driver_assignment_notification() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.on_driver_trip_notification() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.on_guardian_access_notification() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.on_student_service_notification() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.on_student_trip_event_notification() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.on_trip_exception_notification() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.on_trip_operational_status_notification() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION safebus_private.apply_guardian_delivery_defaults_to_link() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION safebus_private.apply_guardian_delivery_defaults_to_link() TO service_role;
GRANT EXECUTE ON FUNCTION safebus_private.apply_guardian_delivery_defaults_to_link() TO authenticated;
REVOKE ALL ON FUNCTION safebus_private.sync_guardian_push_defaults_to_link() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION safebus_private.sync_guardian_push_defaults_to_link() TO service_role;
GRANT EXECUTE ON FUNCTION safebus_private.sync_guardian_push_defaults_to_link() TO authenticated;
CREATE TRIGGER student_guardians_notify AFTER INSERT OR UPDATE OF status, access_expires_at ON public.student_guardians FOR EACH ROW EXECUTE FUNCTION safebus_private.on_guardian_access_notification();
CREATE TRIGGER student_guardians_sync_push_defaults AFTER INSERT OR UPDATE OF guardian_id, tenant_id, status, access_expires_at ON public.student_guardians FOR EACH ROW EXECUTE FUNCTION safebus_private.sync_guardian_push_defaults_to_link();
CREATE TRIGGER zz_student_guardians_apply_delivery_defaults BEFORE INSERT OR UPDATE OF guardian_id, tenant_id, status, access_expires_at ON public.student_guardians FOR EACH ROW EXECUTE FUNCTION safebus_private.apply_guardian_delivery_defaults_to_link();
