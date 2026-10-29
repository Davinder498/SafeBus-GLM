-- Forward reconciliation against the production-designated BusSafe catalog.
-- Worker leases are server-only and protect against stale email completions.

DO $baseline$
DECLARE f record;
BEGIN
 FOR f IN SELECT * FROM (VALUES
  ('safebus_private.notify_trip_audience(uuid, uuid, uuid, text, text, text, text, uuid, timestamp with time zone)','13aa8d12ec0e2ebecd20685c598b4e76'),
  ('safebus_private.notification_event_title(text)','c93f513d47283ba578f9512e87afd470'),
  ('safebus_private.pickup_dropoff_event_copy(uuid, uuid, uuid, uuid, text)','43a6aa43ac62e9dc1bfc93a9ff8e3af2'),
  ('safebus_private.on_student_trip_event_notification()','7c8c8fab769af318a545bda5638301cf'),
  ('safebus_private.notification_copy_before_announcements(user_notifications)','77a52408bbf1b30f6e0c38f7f9e61c17'),
  ('safebus_private.notification_push_copy(user_notifications)','3b7de6391d319b754eabf54d2b0bdbf2'),
  ('safebus_private.on_trip_operational_status_notification()','45afa708883dd3bd18f56c8b81ec9eef'),
  ('safebus_private.enqueue_user_notification(uuid, uuid, text, text, text, text, uuid, text, timestamp with time zone, uuid, uuid, uuid)','36646188bf8054a3e8671f6b8a371b96'),
  ('safebus_private.notification_recipient_can_access(user_notifications)','48a17749d0dcaed891c7a864ceed42a6'),
  ('safebus_private.notification_email_outbox_is_eligible(uuid)','3aa71f93f292ed3cb56b5191838b78a9'),
  ('public.resolve_push_notification_delivery(uuid, text)','c757bb8a4037b4175c7fbcb3c18b92ac'),
  ('public.claim_push_notification_deliveries(text, integer, integer)','f7140538aa6303d242e391cc46554cfe'),
  ('public.claim_guardian_notification_email_batch(integer, integer, integer, integer)','f08ea91221a6147f0b172f5d93d1e559')
 ) x(signature,digest) LOOP
 IF md5(replace(pg_get_functiondef(to_regprocedure(f.signature)),chr(13),'')) IS DISTINCT FROM f.digest THEN
 RAISE EXCEPTION 'Notification baseline differs: %',f.signature USING ERRCODE='55000'; END IF;
 END LOOP;
END;
$baseline$;
-- Source transactions save a durable intent; audience expansion is asynchronous.
CREATE TABLE safebus_private.notification_audience_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
 driver_trip_id uuid NOT NULL REFERENCES public.driver_trips(id) ON DELETE CASCADE,
 route_id uuid NOT NULL, event_type text NOT NULL, category text NOT NULL,
 severity text NOT NULL, source_type text NOT NULL, source_id uuid NOT NULL,
 occurred_at timestamp with time zone NOT NULL, attempts integer NOT NULL DEFAULT 0,
 available_after timestamp with time zone NOT NULL DEFAULT now(),
 failed_at timestamp with time zone, failure_code text,
 UNIQUE(source_type,source_id,event_type,occurred_at)
);
ALTER TABLE safebus_private.notification_audience_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.notification_audience_queue FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX notification_audience_due_idx ON safebus_private.notification_audience_queue(available_after,id) WHERE failed_at IS NULL;
CREATE OR REPLACE FUNCTION safebus_private.deliver_trip_notification_audience(p_tenant_id uuid, p_trip_id uuid, p_route_id uuid, p_event_type text, p_category text, p_severity text, p_source_type text, p_source_id uuid, p_occurred_at timestamp with time zone)
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
    where p_event_type<>'trip_missing' and sba.tenant_id = p_tenant_id and sba.status = 'active'
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
REVOKE ALL ON FUNCTION safebus_private.deliver_trip_notification_audience(uuid,uuid,uuid,text,text,text,text,uuid,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.expand_notification_audiences(p_limit integer DEFAULT 16)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare job safebus_private.notification_audience_queue; processed integer:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
 if p_limit is null or p_limit not between 1 and 32 then raise exception 'Invalid expansion limit.' using errcode='22023'; end if;
 for job in select * from safebus_private.notification_audience_queue q
  where q.failed_at is null and q.available_after<=now()
  order by q.available_after,q.id for update skip locked limit p_limit
 loop
  begin
   perform safebus_private.deliver_trip_notification_audience(job.tenant_id,job.driver_trip_id,job.route_id,
    job.event_type,job.category,job.severity,job.source_type,job.source_id,job.occurred_at);
   delete from safebus_private.notification_audience_queue where id=job.id;
   processed:=processed+1;
  exception when others then
   update safebus_private.notification_audience_queue set attempts=attempts+1,
    available_after=now()+interval '20 seconds',failed_at=case when attempts>=4 then now() else null end,
    failure_code=SQLSTATE where id=job.id;
  end;
 end loop;
 return processed;
end;
$function$;
REVOKE ALL ON FUNCTION public.expand_notification_audiences(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expand_notification_audiences(integer) TO service_role;

CREATE OR REPLACE FUNCTION safebus_private.notify_trip_audience(p_tenant_id uuid, p_trip_id uuid, p_route_id uuid, p_event_type text, p_category text, p_severity text, p_source_type text, p_source_id uuid, p_occurred_at timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 insert into safebus_private.notification_audience_queue(tenant_id,driver_trip_id,route_id,event_type,category,severity,source_type,source_id,occurred_at)
 select p_tenant_id,p_trip_id,p_route_id,p_event_type,p_category,p_severity,p_source_type,p_source_id,p_occurred_at
 from public.driver_trips where id=p_trip_id and tenant_id=p_tenant_id and route_id=p_route_id
 on conflict do nothing;
end;
$function$;



-- Small, bounded rate state: two provider rows and one row per authority/channel.
-- No student data. Locks reserve capacity before rows are handed to workers.
CREATE TABLE safebus_private.notification_dispatch_counters (
  channel text NOT NULL CHECK(channel IN ('push','email')),
  scope text NOT NULL,
  second_start timestamp with time zone NOT NULL DEFAULT date_trunc('second',now()),
  minute_start timestamp with time zone NOT NULL DEFAULT date_trunc('minute',now()),
  day_start timestamp with time zone NOT NULL DEFAULT date_trunc('day',now()),
  second_used integer NOT NULL DEFAULT 0,
  minute_used integer NOT NULL DEFAULT 0,
  day_used integer NOT NULL DEFAULT 0,
  last_served_at timestamp with time zone NOT NULL DEFAULT '-infinity',
  PRIMARY KEY(channel,scope)
);
ALTER TABLE safebus_private.notification_dispatch_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.notification_dispatch_counters FROM PUBLIC,anon,authenticated,service_role;
-- Account for work already delivered/leased before adopting atomic reservations.
INSERT INTO safebus_private.notification_dispatch_counters(channel,scope,minute_used,day_used)
 SELECT 'push',tenant_id::text,
 count(*) filter(where updated_at>=date_trunc('minute',now()) and status in('processing','delivered'))::integer,
 count(*) filter(where (delivered_at>=date_trunc('day',now()) and status='delivered') or status='processing')::integer
 FROM public.push_notification_outbox WHERE tenant_id IS NOT NULL GROUP BY tenant_id;
INSERT INTO safebus_private.notification_dispatch_counters(channel,scope,minute_used,day_used)
 SELECT 'email',tenant_id::text,count(*) filter(where last_attempted_at>=date_trunc('minute',now()))::integer,
 count(*) filter(where (delivered_at>=date_trunc('day',now()) and status='delivered') or status='processing')::integer
 FROM public.guardian_notification_outbox WHERE tenant_id IS NOT NULL GROUP BY tenant_id;
INSERT INTO safebus_private.notification_dispatch_counters(channel,scope,minute_used)
 SELECT 'push','provider',count(*) filter(where updated_at>=date_trunc('minute',now()) and status in('processing','delivered'))::integer FROM public.push_notification_outbox
 UNION ALL SELECT 'email','provider',count(*) filter(where last_attempted_at>=date_trunc('minute',now()))::integer FROM public.guardian_notification_outbox;


CREATE OR REPLACE FUNCTION safebus_private.reserve_notification_capacity(p_channel text,p_tenant_id uuid,p_requested integer,p_provider_minute integer)
RETURNS integer LANGUAGE plpgsql SET search_path TO '' AS $function$
declare provider safebus_private.notification_dispatch_counters; tenant safebus_private.notification_dispatch_counters;
  policy public.guardian_notification_delivery_policies; amount integer; daily integer; per_minute integer;
begin
  if p_channel not in ('push','email') or p_requested<1 or p_requested>200 or p_provider_minute<1 then return 0; end if;
  select * into policy from public.guardian_notification_delivery_policies where tenant_id=p_tenant_id and privacy_review_status='approved';
  if not found or not exists(select 1 from public.tenants where id=p_tenant_id and status='active') then return 0; end if;
  daily:=case p_channel when 'push' then policy.push_tenant_daily_limit else policy.tenant_daily_limit end;
  per_minute:=case p_channel when 'push' then policy.push_tenant_per_minute_limit else policy.tenant_per_minute_limit end;
  insert into safebus_private.notification_dispatch_counters(channel,scope) values(p_channel,'provider'),(p_channel,p_tenant_id::text) on conflict do nothing;
  -- All workers take locks in provider -> authority order.
  select * into provider from safebus_private.notification_dispatch_counters where channel=p_channel and scope='provider' for update;
  select * into tenant from safebus_private.notification_dispatch_counters where channel=p_channel and scope=p_tenant_id::text for update;
  if provider.second_start<>date_trunc('second',now()) then provider.second_used:=0; end if;
  if provider.minute_start<>date_trunc('minute',now()) then provider.minute_used:=0; end if;
  if tenant.minute_start<>date_trunc('minute',now()) then tenant.minute_used:=0; end if;
  if tenant.day_start<>date_trunc('day',now()) then tenant.day_used:=0; end if;
  amount:=greatest(0,least(p_requested,p_provider_minute-provider.minute_used,
    greatest(1,p_provider_minute/60)-provider.second_used,per_minute-tenant.minute_used,daily-tenant.day_used));
  if amount=0 then
    update safebus_private.notification_dispatch_counters set last_served_at=clock_timestamp() where channel=p_channel and scope=p_tenant_id::text;
    return 0;
  end if;
  update safebus_private.notification_dispatch_counters set second_start=date_trunc('second',now()),minute_start=date_trunc('minute',now()),
    second_used=provider.second_used+amount,minute_used=provider.minute_used+amount where channel=p_channel and scope='provider';
  update safebus_private.notification_dispatch_counters set minute_start=date_trunc('minute',now()),day_start=date_trunc('day',now()),
    minute_used=tenant.minute_used+amount,day_used=tenant.day_used+amount,last_served_at=clock_timestamp() where channel=p_channel and scope=p_tenant_id::text;
  return amount;
end;
$function$;
REVOKE ALL ON FUNCTION safebus_private.reserve_notification_capacity(text,uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE INDEX push_notification_due_authority_idx ON public.push_notification_outbox(tenant_id,available_after,created_at,id)
 WHERE status IN ('pending','retry','processing');
CREATE INDEX email_notification_due_authority_idx ON public.guardian_notification_outbox(tenant_id,available_after,created_at,id)
 WHERE status IN ('pending','processing');

-- One server-rendered email envelope for every permitted event. The original
-- scalar RPCs stay compatible while already-deployed workers drain their leases.
CREATE OR REPLACE FUNCTION public.resolve_notification_email_payload(p_outbox_id uuid)
RETURNS TABLE(recipient_profile_id uuid, recipient_email text, notification_type text, title text, body text, event_occurred_at timestamp with time zone, tenant_timezone text, idempotency_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare o public.guardian_notification_outbox; n public.user_notifications; e public.student_trip_events;
  profile public.profiles; guardian public.guardians; authority public.tenants;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  select * into o from public.guardian_notification_outbox where id=p_outbox_id and status='processing';
  if not found or not safebus_private.notification_email_outbox_is_eligible(o.id) then return; end if;
  if o.guardian_id is not null then
    select * into guardian from public.guardians where id=o.guardian_id and tenant_id=o.tenant_id and status='active';
    if not found then return; end if;
    select * into profile from public.profiles where id=guardian.profile_id and tenant_id=o.tenant_id and status='active' and role='guardian';
  else
    select * into profile from public.profiles where id=o.recipient_profile_id and tenant_id=o.tenant_id and status='active' and role='driver';
  end if;
  if not found then return; end if;
  select * into authority from public.tenants where id=o.tenant_id and status='active';
  if not found then return; end if;
  if o.user_notification_id is not null then
    select notice.* into n from public.user_notifications notice where notice.id=o.user_notification_id and notice.tenant_id=o.tenant_id
      and notice.recipient_profile_id=profile.id and notice.event_type=o.notification_type;
    if not found then return; end if;
  else
    select event.* into e from public.student_trip_events event
      join public.students student on student.id=event.student_id and student.tenant_id=event.tenant_id and student.status='active'
      where event.id=o.student_trip_event_id and event.tenant_id=o.tenant_id and event.student_id=o.student_id
      and event.event_type=case o.notification_type when 'student_picked_up' then 'picked_up' when 'student_dropped_off' then 'dropped_off' end;
    if not found then return; end if;
    n.tenant_id:=e.tenant_id; n.student_id:=e.student_id; n.driver_trip_id:=e.driver_trip_id;
    n.source_type:='student_trip_event'; n.source_id:=e.id; n.event_type:=o.notification_type; n.occurred_at:=e.event_time;
  end if;
  return query select profile.id,coalesce(nullif(trim(guardian.email),''),nullif(trim(profile.email),'')),n.event_type,
    copy.title,copy.body,n.occurred_at,coalesce(nullif(trim(authority.timezone),''),'America/Edmonton'),
    case when o.guardian_id is null then 'notification-email-outbox:' else 'guardian-notification-outbox:' end || o.id::text
  from safebus_private.notification_push_copy(n) copy;
end;
$function$;
REVOKE ALL ON FUNCTION public.resolve_notification_email_payload(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_notification_email_payload(uuid) TO service_role;
CREATE OR REPLACE FUNCTION safebus_private.notification_event_title(p_event_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_event_type
    when 'student_picked_up' then 'Student picked up'
    when 'student_dropped_off' then 'Student dropped off'
    when 'trip_started' then 'Trip started'
    when 'trip_completed' then 'Trip completed'
    when 'trip_cancelled' then 'Trip cancelled'
    when 'trip_late' then 'Bus delayed'
    when 'trip_missing' then 'Service unconfirmed'
    when 'traffic_disruption' then 'Traffic disruption'
    when 'weather_disruption' then 'Weather disruption'
    when 'road_closure' then 'Road closure'
    when 'mechanical_disruption' then 'Mechanical issue'
    when 'driver_assignment_created' then 'New assignment'
    when 'driver_assignment_changed' then 'Assignment changed'
    when 'driver_assignment_ended' then 'Assignment ended'
    when 'student_service_changed' then 'Student bus assignment changed'
    when 'guardian_access_changed' then 'Student access changed'
    when 'delivery_health_incident' then 'Notification delivery issue'
    when 'provider_configuration_incident' then 'Notification service issue'
    when 'authority_announcement' then 'New announcement'
    else 'SafeBus notification' end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.pickup_dropoff_event_copy(p_event_id uuid, p_tenant_id uuid, p_student_id uuid, p_trip_id uuid, p_event_type text)
 RETURNS TABLE(title text, body text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select safebus_private.notification_event_title(p_event_type),
      coalesce(nullif(trim(concat_ws(' ', nullif(trim(student.first_name), ''), nullif(trim(student.last_name), ''))), ''), 'Student name unavailable')
      || case p_event_type when 'student_picked_up' then ' was picked up on ' else ' was dropped off on ' end
      || case when labels.bus_number is null then 'bus number unavailable'
        else 'Bus ' || regexp_replace(labels.bus_number, '^bus\s+', '', 'i') end || '.'
  from (values (1)) anchor(value)
  left join public.student_trip_events event
    on event.id=p_event_id and event.tenant_id=p_tenant_id and event.student_id=p_student_id
      and event.driver_trip_id=p_trip_id
      and event.event_type=case p_event_type when 'student_picked_up' then 'picked_up' when 'student_dropped_off' then 'dropped_off' end
  left join public.students student on student.id=event.student_id and student.tenant_id=event.tenant_id
  left join public.driver_trips trip on trip.id=event.driver_trip_id and trip.tenant_id=event.tenant_id
  left join public.buses bus on bus.id=trip.bus_id and bus.tenant_id=event.tenant_id
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
      when 'trip_started' then context.trip_label || ' on ' || context.bus_label || ' has started.'
      when 'trip_completed' then context.trip_label || ' on ' || context.bus_label || ' has ended.'
      when 'trip_cancelled' then context.trip_label || ' on ' || context.bus_label || ' is cancelled.'
      when 'trip_late' then context.bus_subject || ' is delayed on ' || context.route_label || '.'
      when 'trip_missing' then 'Service for ' || context.bus_label || ' is currently unconfirmed.'
      when 'traffic_disruption' then 'Traffic is affecting ' || context.bus_label || '.'
      when 'weather_disruption' then 'Weather is affecting ' || context.bus_label || '.'
      when 'road_closure' then 'A road closure is affecting ' || context.bus_label || '.'
      when 'mechanical_disruption' then context.bus_subject || ' has a mechanical problem.'
      when 'driver_assignment_created' then 'You’re assigned to ' || context.bus_label || ' on ' || context.route_label || '.'
      when 'driver_assignment_changed' then 'Your ' || context.bus_label || ' assignment on ' || context.route_label || ' has changed.'
      when 'driver_assignment_ended' then 'Your ' || context.bus_label || ' assignment on ' || context.route_label || ' has ended.'
      when 'student_service_changed' then coalesce(nullif(trim(concat_ws(' ', student.first_name, student.last_name)), ''), 'Your student') || '’s bus assignment has changed.'
      when 'guardian_access_changed' then 'Your access to student updates has changed.'
      when 'delivery_health_incident' then 'Some notifications could not be delivered.'
      when 'provider_configuration_incident' then 'A notification service needs attention.'
      else 'A SafeBus notification is available.'
    end
  from (values (1)) anchor(value)
  left join public.students student on student.id=n.student_id and student.tenant_id=n.tenant_id
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
    case when labels.bus_name is null then 'the assigned bus' else 'Bus ' || regexp_replace(labels.bus_name, '^bus\s+', '', 'i') end as bus_label,
    case when labels.bus_name is null then 'The assigned bus' else 'Bus ' || regexp_replace(labels.bus_name, '^bus\s+', '', 'i') end as bus_subject,
    case when labels.route_name is null then 'the assigned route' else 'Route ' || regexp_replace(labels.route_name, '^route\s+', '', 'i') end as route_label,
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
  select c.title, c.body
  from (
    select 'New announcement'::text as title, 'Your school authority posted an announcement.'::text as body
    where n.event_type = 'authority_announcement'
    union all
    select copy.title, copy.body from safebus_private.notification_copy(n) copy
    where n.event_type <> 'authority_announcement'
  ) c;
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
  if v_event='trip_missing' then return new; end if;
  select d.profile_id into v_driver_profile from public.drivers d where d.id = v_trip.driver_id and d.status = 'active';
  perform safebus_private.enqueue_user_notification(new.tenant_id, v_driver_profile, v_event, 'operations',
    v_severity, 'trip_operational_status', new.id,
    'trip_operational_status:' || new.id::text || ':' || new.operational_status || ':driver:' || extract(epoch from new.set_at)::text,
    new.set_at, null, new.driver_trip_id, null);
  return new;
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
  if p_event_type='trip_missing' and v_role in ('guardian','driver') then return null; end if;
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

CREATE OR REPLACE FUNCTION safebus_private.notification_recipient_can_access(n user_notifications)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (n.event_type<>'trip_missing' or n.recipient_role not in ('guardian','driver'))
    and public.is_current_user_session_active()
    and safebus_private.has_completed_optional_mfa()
    and (n.recipient_role = 'platform_super_admin' or exists (
      select 1 from public.tenants authority where authority.id = n.tenant_id and authority.status = 'active'))
    and (n.recipient_role not in ('tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin')
      or safebus_private.has_verified_mfa())
    and safebus_private.notification_access_before_announcements(n)
    and (n.event_type <> 'authority_announcement' or safebus_private.announcement_recipient_is_current(n));
$function$;

CREATE OR REPLACE FUNCTION safebus_private.notification_email_outbox_is_eligible(p_outbox_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select not exists(select 1 from public.guardian_notification_outbox blocked where blocked.id=p_outbox_id and blocked.notification_type='trip_missing') and ((safebus_private.notification_email_before_announcements(p_outbox_id)
    and not exists (select 1 from public.guardian_notification_outbox o
      join public.user_notifications n on n.id = o.user_notification_id
      where o.id = p_outbox_id and n.event_type = 'authority_announcement'
        and not safebus_private.announcement_recipient_is_current(n)))
  or exists (
    select 1 from public.guardian_notification_outbox o
    join public.user_notifications n on n.id = o.user_notification_id
      and n.tenant_id = o.tenant_id and n.recipient_profile_id = o.recipient_profile_id and n.event_type = o.notification_type
    join public.user_notification_settings s on s.profile_id = n.recipient_profile_id and s.email_enabled
    join public.user_notification_category_preferences c on c.profile_id = s.profile_id and c.category = n.category and c.email_enabled
    join public.guardian_notification_delivery_policies policy on policy.tenant_id = n.tenant_id
      and policy.privacy_review_status = 'approved' and exists (select 1 from public.tenants notification_authority where notification_authority.id=policy.tenant_id and notification_authority.status='active') and policy.privacy_approved_at is not null
    where o.id = p_outbox_id and o.guardian_id is null and safebus_private.driver_notification_is_eligible(n)
  ));
$function$;


CREATE OR REPLACE FUNCTION safebus_private.push_notification_is_eligible(p_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO '' AS $function$
 select exists(
    select 1 from public.push_notification_outbox o
    join public.user_notifications n on n.id=o.notification_id
    join public.profiles p on p.id=n.recipient_profile_id and p.status='active'
    join public.android_push_devices d on d.id=o.device_id and d.profile_id=p.id and d.status='active'
      and d.permission_state='granted' and d.last_seen_at>now()-interval '90 days'
    join public.user_notification_settings s on s.profile_id=p.id and s.push_enabled
    join public.user_notification_category_preferences cp on cp.profile_id=p.id and cp.category=n.category and cp.push_enabled
    join public.guardian_notification_delivery_policies pol on pol.tenant_id=n.tenant_id
      and pol.privacy_review_status='approved' and exists (select 1 from public.tenants notification_authority where notification_authority.id=pol.tenant_id and notification_authority.status='active')
    where o.id=p_id and (n.event_type<>'trip_missing' or p.role not in ('guardian','driver'))
      and (n.event_type <> 'authority_announcement' or safebus_private.announcement_recipient_is_current(n))
      and (n.recipient_role <> 'driver' or safebus_private.driver_notification_is_eligible(n))
      and (p.role<>'guardian' or (n.student_id is null and (n.driver_trip_id is null
          or safebus_private.guardian_trip_notification_is_eligible(n, true))) or exists(
        select 1 from public.student_guardians sg join public.guardians g on g.id=sg.guardian_id and g.profile_id=p.id and g.tenant_id=n.tenant_id and g.status='active'
        join public.guardian_student_push_preferences gp on gp.student_guardian_id=sg.id and gp.category=n.category and gp.push_enabled
        where sg.student_id=n.student_id and sg.status='active' and sg.can_receive_notifications
          and (sg.access_expires_at is null or sg.access_expires_at>now())))
 );
$function$;
REVOKE ALL ON FUNCTION safebus_private.push_notification_is_eligible(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.resolve_push_notification_delivery(p_outbox_id uuid, p_worker_id text)
 RETURNS TABLE(outbox_id uuid, tenant_id uuid, notification_id uuid, device_id uuid, fcm_token text, event_type text, category text, severity text, preview_mode text, android_channel text, collapse_key text, title text, body text, attempt_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  if not exists(select 1 from public.push_notification_outbox where id=p_outbox_id and status='processing' and lease_owner=p_worker_id and lease_expires_at>now()) then return; end if;
  if not safebus_private.push_notification_is_eligible(p_outbox_id) then
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

CREATE OR REPLACE FUNCTION public.claim_push_notification_deliveries(p_worker_id text, p_limit integer DEFAULT 50, p_lease_seconds integer DEFAULT 120)
 RETURNS TABLE(outbox_id uuid, tenant_id uuid, notification_id uuid, device_id uuid, fcm_token text, event_type text, category text, severity text, preview_mode text, android_channel text, collapse_key text, title text, body text, attempt_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare authority record; ids uuid[]; allowed uuid[]; capacity integer; remaining integer:=p_limit;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
 perform public.expand_notification_audiences(16);
 if length(trim(coalesce(p_worker_id,''))) not between 1 and 120 or p_limit is null or p_limit not between 1 and 200 or p_lease_seconds is null or p_lease_seconds not between 30 and 600 then raise exception 'Invalid claim request.' using errcode='22023'; end if;
 for authority in
  select policy.tenant_id from public.guardian_notification_delivery_policies policy
  join public.tenants tenant on tenant.id=policy.tenant_id and tenant.status='active'
  left join safebus_private.notification_dispatch_counters state on state.channel='push' and state.scope=policy.tenant_id::text
  where policy.privacy_review_status='approved' and exists(
    select 1 from public.push_notification_outbox o where o.tenant_id=policy.tenant_id and o.available_after<=now()
      and (o.status in ('pending','retry') or (o.status='processing' and o.lease_expires_at<now())))
  order by coalesce(state.last_served_at,'-infinity'::timestamptz),policy.tenant_id limit 64
 loop
  select array_agg(candidate.id) into ids from (
   select o.id from public.push_notification_outbox o where o.tenant_id=authority.tenant_id and o.available_after<=now()
    and (o.status in ('pending','retry') or (o.status='processing' and o.lease_expires_at<now()))
   order by o.available_after,o.created_at,o.id for update skip locked limit remaining
  ) candidate;
  if ids is null then continue; end if;
  update public.push_notification_outbox o set status='failed',failed_at=now(),failure_category='lease_expired',failure_code='ATTEMPTS_EXHAUSTED',lease_owner=null,lease_expires_at=null
   where o.id=any(ids) and o.attempt_count>=5;
  update public.push_notification_outbox o set status='cancelled',cancelled_at=now(),failure_category='eligibility_revoked',lease_owner=null,lease_expires_at=null
   where o.id=any(ids) and o.status in ('pending','retry','processing') and not safebus_private.push_notification_is_eligible(o.id);
  select array_agg(o.id order by o.available_after,o.created_at,o.id) into allowed from public.push_notification_outbox o
   where o.id=any(ids) and o.status in ('pending','retry','processing') and o.attempt_count<5;
  if allowed is null then continue; end if;
  capacity:=safebus_private.reserve_notification_capacity('push',authority.tenant_id,least(cardinality(allowed),remaining),360000);
  if capacity=0 then continue; end if;
  return query with claimed as(
   update public.push_notification_outbox o set status='processing',attempt_count=o.attempt_count+1,
    lease_owner=trim(p_worker_id),lease_expires_at=now()+make_interval(secs=>p_lease_seconds),updated_at=now()
   where o.id=any(allowed[1:capacity]) returning o.*
  )
  select c.id,c.tenant_id,n.id,c.device_id,d.fcm_token,n.event_type,n.category,n.severity,s.preview_mode,
    case when n.severity='urgent' then 'urgent_operations' when n.category='assignments' then 'assignments' else 'trip_updates' end,
    'notification-'||n.id::text,
    copy.title, copy.body,c.attempt_count
  from claimed c join public.user_notifications n on n.id=c.notification_id
    join public.android_push_devices d on d.id=c.device_id
    join public.user_notification_settings s on s.profile_id=n.recipient_profile_id
    cross join lateral safebus_private.notification_push_copy(n) copy;
  remaining:=remaining-capacity;
  exit when remaining<=0;
 end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_guardian_notification_email_batch(p_batch_size integer DEFAULT 25, p_lease_seconds integer DEFAULT 120, p_max_attempts integer DEFAULT 5, p_provider_limit_per_minute integer DEFAULT 50)
 RETURNS TABLE(id uuid, tenant_id uuid, guardian_id uuid, student_id uuid, student_trip_event_id uuid, notification_type text, attempt_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare authority record; ids uuid[]; allowed uuid[]; capacity integer; remaining integer:=greatest(1,least(coalesce(p_batch_size,25),200));
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
 perform public.expand_notification_audiences(16);
 if p_provider_limit_per_minute is null or p_provider_limit_per_minute not between 1 and 600000 then raise exception 'Invalid provider limit.' using errcode='22023'; end if;
 for authority in
  select policy.tenant_id from public.guardian_notification_delivery_policies policy
  join public.tenants tenant on tenant.id=policy.tenant_id and tenant.status='active'
  left join safebus_private.notification_dispatch_counters state on state.channel='email' and state.scope=policy.tenant_id::text
  where policy.privacy_review_status='approved' and exists(
   select 1 from public.guardian_notification_outbox o where o.tenant_id=policy.tenant_id and o.available_after<=now()
    and (o.status='pending' or (o.status='processing' and o.claim_expires_at<now())))
  order by coalesce(state.last_served_at,'-infinity'::timestamptz),policy.tenant_id limit 64
 loop
  select array_agg(candidate.id) into ids from(
   select o.id from public.guardian_notification_outbox o where o.tenant_id=authority.tenant_id and o.available_after<=now()
    and (o.status='pending' or (o.status='processing' and o.claim_expires_at<now()))
   order by o.available_after,o.created_at,o.id for update skip locked limit remaining
  ) candidate;
  if ids is null then continue; end if;
  update public.guardian_notification_outbox o set status='failed',failed_at=now(),failure_category='attempts_exhausted',failure_reason='attempts_exhausted',claimed_at=null,claim_expires_at=null
   where o.id=any(ids) and o.attempt_count>=greatest(1,least(p_max_attempts,5));
  update public.guardian_notification_outbox o set status='cancelled',cancelled_at=now(),failure_category='eligibility_revoked',failure_reason='eligibility_revoked',claimed_at=null,claim_expires_at=null
   where o.id=any(ids) and o.status in('pending','processing') and not safebus_private.notification_email_outbox_is_eligible(o.id);
  select array_agg(o.id order by o.available_after,o.created_at,o.id) into allowed from public.guardian_notification_outbox o
   where o.id=any(ids) and o.status in('pending','processing') and o.attempt_count<greatest(1,least(p_max_attempts,5));
  if allowed is null then continue; end if;
  capacity:=safebus_private.reserve_notification_capacity('email',authority.tenant_id,least(cardinality(allowed),remaining),p_provider_limit_per_minute);
  if capacity=0 then continue; end if;
  return query with claimed as(
   update public.guardian_notification_outbox o set status='processing',attempt_count=o.attempt_count+1,
    claimed_at=now(),claim_expires_at=now()+make_interval(secs=>greatest(30,least(p_lease_seconds,900))),last_attempted_at=now(),failure_reason=null,failure_category=null
   where o.id=any(allowed[1:capacity]) returning o.*
  ) select c.id,c.tenant_id,c.guardian_id,c.student_id,c.student_trip_event_id,c.notification_type,c.attempt_count from claimed c;
  remaining:=remaining-capacity;
  exit when remaining<=0;
 end loop;
end;
$function$;


-- Raise old development ceilings for the reviewed accounts only. Custom lower
-- limits (including the existing 50/day, 5/minute push policy) remain intact.
ALTER TABLE public.guardian_notification_delivery_policies DROP CONSTRAINT guardian_notification_policy_limits_check;
ALTER TABLE public.guardian_notification_delivery_policies DROP CONSTRAINT guardian_notification_policy_push_limits_check;
ALTER TABLE public.guardian_notification_delivery_policies ADD CONSTRAINT guardian_notification_policy_limits_check
 CHECK(tenant_daily_limit BETWEEN 1 AND 100000000 AND tenant_per_minute_limit BETWEEN 1 AND 1000000);
ALTER TABLE public.guardian_notification_delivery_policies ADD CONSTRAINT guardian_notification_policy_push_limits_check
 CHECK(push_tenant_daily_limit BETWEEN 1 AND 100000000 AND push_tenant_per_minute_limit BETWEEN 1 AND 1000000);
ALTER TABLE public.guardian_notification_delivery_policies ALTER COLUMN tenant_daily_limit SET DEFAULT 10000000;
ALTER TABLE public.guardian_notification_delivery_policies ALTER COLUMN tenant_per_minute_limit SET DEFAULT 200000;
ALTER TABLE public.guardian_notification_delivery_policies ALTER COLUMN push_tenant_daily_limit SET DEFAULT 10000000;
ALTER TABLE public.guardian_notification_delivery_policies ALTER COLUMN push_tenant_per_minute_limit SET DEFAULT 200000;
UPDATE public.guardian_notification_delivery_policies SET tenant_daily_limit=10000000,tenant_per_minute_limit=200000,push_tenant_daily_limit=10000000,push_tenant_per_minute_limit=200000 WHERE tenant_id='49410f95-38da-4eed-aaef-c6b6b98e9a7c' AND tenant_daily_limit=500 AND tenant_per_minute_limit=20 AND push_tenant_daily_limit=500 AND push_tenant_per_minute_limit=20;
UPDATE public.guardian_notification_delivery_policies SET tenant_daily_limit=10000000,tenant_per_minute_limit=200000,push_tenant_daily_limit=10000000,push_tenant_per_minute_limit=200000 WHERE tenant_id='a7033cbe-9bc7-4508-89bd-0a19270a2c15' AND tenant_daily_limit=500 AND tenant_per_minute_limit=20 AND push_tenant_daily_limit=500 AND push_tenant_per_minute_limit=20;
UPDATE public.guardian_notification_delivery_policies SET tenant_daily_limit=10000000,tenant_per_minute_limit=200000,push_tenant_daily_limit=50,push_tenant_per_minute_limit=5 WHERE tenant_id='e19ab3b1-8346-4779-9fdb-46de90081a07' AND tenant_daily_limit=500 AND tenant_per_minute_limit=20 AND push_tenant_daily_limit=50 AND push_tenant_per_minute_limit=5;

-- Keep previously stored messages as restricted recovery evidence; the runtime
-- no longer reads or writes the pickup/drop-off-only snapshot table.
CREATE SCHEMA IF NOT EXISTS safebus_release;
REVOKE ALL ON SCHEMA safebus_release FROM PUBLIC,anon,authenticated;
ALTER TABLE safebus_private.pickup_dropoff_event_copies SET SCHEMA safebus_release;

DO $schedule$
DECLARE job bigint;
BEGIN
 SELECT jobid INTO job FROM cron.job WHERE jobname='safebus-push-notification-dispatcher'
   AND schedule='* * * * *' AND active AND md5(replace(command,chr(13),''))='18654e8b11867b111304574d35407735';
 IF job IS NULL THEN RAISE EXCEPTION 'Push schedule differs.' USING ERRCODE='55000'; END IF;
 PERFORM cron.alter_job(job,schedule:='20 seconds');
END;
$schedule$;



ALTER TABLE public.guardian_notification_outbox ADD COLUMN worker_id text;

CREATE OR REPLACE FUNCTION public.claim_notification_deliveries(p_channel text,p_worker_id text,p_limit integer DEFAULT 50,p_provider_minute integer DEFAULT 600)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare item record;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
 if p_channel is null or p_channel not in ('push','email') or length(trim(coalesce(p_worker_id,''))) not between 1 and 120 or p_limit is null or p_limit not between 1 and 200 then raise exception 'Invalid claim.' using errcode='22023'; end if;
 if p_channel='push' then
  for item in select * from public.claim_push_notification_deliveries(p_worker_id,p_limit,120)
  loop return next jsonb_build_object('id',item.outbox_id,'attempt_count',item.attempt_count); end loop;
 else
  for item in select * from public.claim_guardian_notification_email_batch(p_limit,120,5,p_provider_minute)
  loop
   update public.guardian_notification_outbox set worker_id=p_worker_id where id=item.id and status='processing';
   return next jsonb_build_object('id',item.id,'attempt_count',item.attempt_count);
  end loop;
 end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_notification_deliveries(p_channel text,p_worker_id text,p_ids uuid[])
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare item record; delivery record;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
 if p_channel is null or p_channel not in ('push','email') or cardinality(p_ids) is null or cardinality(p_ids)>200 or length(trim(coalesce(p_worker_id,''))) not between 1 and 120 then raise exception 'Invalid resolution.' using errcode='22023'; end if;
 if p_channel='push' then
  for item in select distinct id from unnest(p_ids) id loop
   for delivery in select * from public.resolve_push_notification_delivery(item.id,p_worker_id)
   loop return next to_jsonb(delivery)||jsonb_build_object('id',delivery.outbox_id); end loop;
  end loop;
 else
  for item in select o.id from public.guardian_notification_outbox o where o.id=any(p_ids)
   and o.status='processing' and o.worker_id=p_worker_id and o.claim_expires_at>now() for update
  loop
   select * into delivery from public.resolve_notification_email_payload(item.id);
   if not found then
    perform public.cancel_guardian_notification_email(item.id,'eligibility_revoked','eligibility_revoked');
   else return next to_jsonb(delivery)||jsonb_build_object('id',item.id); end if;
  end loop;
 end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.settle_notification_deliveries(p_channel text,p_worker_id text,p_results jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare item jsonb; v_id uuid; applied integer:=0;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
 if p_channel is null or p_channel not in ('push','email') or jsonb_typeof(p_results) is distinct from 'array' or jsonb_array_length(p_results)>200 or length(trim(coalesce(p_worker_id,''))) not between 1 and 120 then raise exception 'Invalid results.' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_results) loop
  v_id:=(item->>'id')::uuid;
  if p_channel='push' then
   perform 1 from public.push_notification_outbox o where o.id=v_id and o.status='processing' and o.lease_owner=p_worker_id and o.lease_expires_at>now() for update;
  else
   perform 1 from public.guardian_notification_outbox o where o.id=v_id and o.status='processing' and o.worker_id=p_worker_id and o.claim_expires_at>now() for update;
  end if;
  if not found then continue; end if;
  if item->>'state'='delivered' then
   if p_channel='push' then perform public.complete_push_notification_delivery(v_id,p_worker_id,item->>'provider_id');
   else perform public.complete_guardian_notification_email(v_id,item->>'provider_id'); end if;
  elsif item->>'state'='retry' then
   if p_channel='push' then perform public.retry_push_notification_delivery(v_id,p_worker_id,item->>'category',item->>'code',
      now()+make_interval(secs=>greatest(1,least(coalesce((item->>'retry_seconds')::integer,60),86400))),null);
   else perform public.retry_guardian_notification_email(v_id,item->>'category',item->>'code',greatest(1,least(coalesce((item->>'retry_seconds')::integer,300),86400)),5); end if;
  elsif item->>'state'='failed' then
   if p_channel='push' then perform public.fail_push_notification_delivery(v_id,p_worker_id,item->>'category',item->>'code',coalesce((item->>'invalidate_device')::boolean,false));
   else perform public.fail_guardian_notification_email(v_id,item->>'category',item->>'code'); end if;
  elsif item->>'state'='cancelled' then
   if p_channel='email' then perform public.cancel_guardian_notification_email(v_id,item->>'category',item->>'code');
   else update public.push_notification_outbox o set status='cancelled',cancelled_at=now(),lease_owner=null,lease_expires_at=null where o.id=v_id; end if;
  else raise exception 'Invalid result state.' using errcode='22023';
  end if;
  applied:=applied+1;
 end loop;
 return applied;
end;
$function$;
REVOKE ALL ON FUNCTION public.claim_notification_deliveries(text,text,integer,integer),public.resolve_notification_deliveries(text,text,uuid[]),public.settle_notification_deliveries(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_deliveries(text,text,integer,integer),public.resolve_notification_deliveries(text,text,uuid[]),public.settle_notification_deliveries(text,text,jsonb) TO service_role;
