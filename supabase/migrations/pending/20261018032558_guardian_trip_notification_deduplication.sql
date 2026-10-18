-- Prepared forward release only. Do not apply outside the protected workflow.
-- Trip-wide updates are one per guardian; child pickup/drop-off events stay separate.
-- No existing notifications or queues are rewritten or dispatched.
-- Reconcile these function bodies, recovery evidence and a bounded rollback
-- rehearsal before release. Existing public RPC signatures are preserved.

create or replace function safebus_private.guardian_trip_notification_is_eligible(
  n public.user_notifications, p_push_only boolean default false
) returns boolean language sql stable security definer set search_path = '' as $$
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
$$;


revoke all on function safebus_private.guardian_trip_notification_is_eligible(public.user_notifications,boolean)
  from public, anon, authenticated, service_role;


create or replace function safebus_private.notify_trip_audience(
  p_tenant_id uuid, p_trip_id uuid, p_route_id uuid, p_event_type text,
  p_category text, p_severity text, p_source_type text, p_source_id uuid,
  p_occurred_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
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
end;
$$;

create or replace function safebus_private.notification_recipient_can_access(n public.user_notifications)
returns boolean language sql stable security definer set search_path = '' as $$
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
$$;

create or replace function safebus_private.enqueue_push_for_notification(p_notification_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
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
    and pol.push_notifications_enabled and pol.privacy_review_status = 'approved'
  where d.profile_id = v_notification.recipient_profile_id and d.status = 'active'
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
$$;

create or replace function public.claim_push_notification_deliveries(
  p_worker_id text, p_limit integer default 50, p_lease_seconds integer default 120
) returns table(
  outbox_id uuid, tenant_id uuid, notification_id uuid, device_id uuid, fcm_token text,
  event_type text, category text, severity text, preview_mode text, android_channel text,
  collapse_key text, title text, body text, attempt_count integer
) language plpgsql security definer set search_path = '' as $$
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
        and pol.push_notifications_enabled and pol.privacy_review_status='approved'
      where n.id=o.notification_id
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
$$;

create or replace function public.resolve_push_notification_delivery(p_outbox_id uuid,p_worker_id text)
returns table(
  outbox_id uuid,tenant_id uuid,notification_id uuid,device_id uuid,fcm_token text,
  event_type text,category text,severity text,preview_mode text,android_channel text,
  collapse_key text,title text,body text,attempt_count integer
) language plpgsql security definer set search_path = '' as $$
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
      and pol.push_notifications_enabled and pol.privacy_review_status='approved'
    where o.id=p_outbox_id and o.status='processing' and o.lease_owner=p_worker_id and o.lease_expires_at>now()
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
$$;

create or replace function safebus_private.notification_email_outbox_is_eligible(p_outbox_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (safebus_private.guardian_email_outbox_is_eligible_legacy(p_outbox_id)
    and not exists (
      select 1 from public.guardian_notification_outbox o
      join public.user_notifications n on n.id = o.user_notification_id
      where o.id = p_outbox_id and n.recipient_role = 'guardian'
        and n.student_id is null and n.driver_trip_id is not null
        and not safebus_private.guardian_trip_notification_is_eligible(n, false)
    )
    -- Old per-child rows may already be queued when the worker is repaired.
    -- Select one eligible email for the same guardian and exact source event.
    and not exists (
      select 1 from public.guardian_notification_outbox current_outbox
      join public.user_notifications current_notice on current_notice.id = current_outbox.user_notification_id
      join public.user_notifications earlier_notice
        on earlier_notice.recipient_profile_id = current_notice.recipient_profile_id
        and earlier_notice.tenant_id = current_notice.tenant_id
        and earlier_notice.recipient_role = 'guardian'
        and earlier_notice.category in ('trip_status', 'operations')
        and earlier_notice.source_type = current_notice.source_type
        and earlier_notice.source_id = current_notice.source_id
        and earlier_notice.event_type = current_notice.event_type
        and earlier_notice.driver_trip_id = current_notice.driver_trip_id
        and (earlier_notice.created_at, earlier_notice.id) < (current_notice.created_at, current_notice.id)
      join public.guardian_notification_outbox earlier_outbox
        on earlier_outbox.user_notification_id = earlier_notice.id
        and earlier_outbox.guardian_id = current_outbox.guardian_id
        and earlier_outbox.tenant_id = current_outbox.tenant_id
        and earlier_outbox.status in ('pending', 'processing', 'delivered')
      where current_outbox.id = p_outbox_id
        and current_notice.recipient_role = 'guardian'
        and current_notice.driver_trip_id is not null
        and current_notice.category in ('trip_status', 'operations')
        and (earlier_outbox.status = 'delivered'
          or safebus_private.guardian_email_outbox_is_eligible_legacy(earlier_outbox.id))
    ))
  or exists (
    select 1
    from public.guardian_notification_outbox o
    join public.user_notifications n
      on n.id = o.user_notification_id
     and n.tenant_id = o.tenant_id
     and n.recipient_profile_id = o.recipient_profile_id
     and n.recipient_role = 'driver'::public.user_role
     and n.category = 'assignments'
     and n.event_type = o.notification_type
    join public.profiles p
      on p.id = o.recipient_profile_id
     and p.tenant_id = o.tenant_id
     and p.role = 'driver'::public.user_role
     and p.status = 'active'
    join public.drivers d
      on d.profile_id = p.id and d.tenant_id = p.tenant_id and d.status = 'active'
    join public.user_notification_settings s on s.profile_id = p.id and s.email_enabled
    join public.user_notification_category_preferences c
      on c.profile_id = p.id and c.category = 'assignments' and c.email_enabled
    join public.guardian_notification_delivery_policies policy
      on policy.tenant_id = p.tenant_id
     and policy.notifications_enabled
     and policy.privacy_review_status = 'approved'
     and policy.privacy_approved_at is not null
    where o.id = p_outbox_id
      and o.guardian_id is null
      and o.notification_type in (
        'driver_assignment_created', 'driver_assignment_changed', 'driver_assignment_ended'
      )
  );
$$;

revoke all on function public.claim_push_notification_deliveries(text,integer,integer),
  public.resolve_push_notification_delivery(uuid,text) from public, anon, authenticated;
grant execute on function public.claim_push_notification_deliveries(text,integer,integer),
  public.resolve_push_notification_delivery(uuid,text) to service_role;

create index if not exists user_notifications_guardian_trip_email_dedup_idx
  on public.user_notifications(recipient_profile_id,tenant_id,source_type,source_id,event_type,driver_trip_id,created_at,id)
  where recipient_role = 'guardian' and driver_trip_id is not null
    and category in ('trip_status', 'operations');

-- The repaired worker uses this versioned entry point, so deploying application
-- code before the approved schema release cannot drain the old duplicate queue.
create or replace function public.claim_guardian_notification_email_batch_v2(
  p_batch_size integer default 25,
  p_lease_seconds integer default 120,
  p_max_attempts integer default 5,
  p_provider_limit_per_minute integer default 50
) returns table (
  id uuid, tenant_id uuid, guardian_id uuid, student_id uuid,
  student_trip_event_id uuid, notification_type text, attempt_count integer
) language sql security invoker set search_path = '' as $$
  select * from public.claim_guardian_notification_email_batch(
    p_batch_size, p_lease_seconds, p_max_attempts, p_provider_limit_per_minute
  );
$$;
revoke all on function public.claim_guardian_notification_email_batch_v2(integer,integer,integer,integer)
  from public, anon, authenticated;
grant execute on function public.claim_guardian_notification_email_batch_v2(integer,integer,integer,integer)
  to service_role;
