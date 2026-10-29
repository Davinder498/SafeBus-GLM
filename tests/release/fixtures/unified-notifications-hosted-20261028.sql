CREATE OR REPLACE FUNCTION public.cancel_guardian_notification_email(p_outbox_id uuid, p_failure_category text, p_failure_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'Service role required.' using errcode = '42501'; end if;
  update public.guardian_notification_outbox set status='cancelled', cancelled_at=now(), claim_expires_at=null, claimed_at=null, failure_category=coalesce(p_failure_category,'eligibility_revoked'), failure_reason=left(coalesce(p_failure_reason,'delivery_cancelled'),120) where id=p_outbox_id and status='processing';
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_guardian_notification_email_batch(p_batch_size integer DEFAULT 25, p_lease_seconds integer DEFAULT 120, p_max_attempts integer DEFAULT 5, p_provider_limit_per_minute integer DEFAULT 50)
 RETURNS TABLE(id uuid, tenant_id uuid, guardian_id uuid, student_id uuid, student_trip_event_id uuid, notification_type text, attempt_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Guardian notification claiming requires service role.' using errcode = '42501';
  end if;

  update public.guardian_notification_outbox o
  set status = 'cancelled', cancelled_at = now(), claimed_at = null, claim_expires_at = null,
      failure_category = 'eligibility_revoked', failure_reason = 'guardian_email_no_longer_authorized'
  where o.status in ('pending', 'processing')
    and not safebus_private.guardian_email_outbox_is_eligible(o.id);

  return query
  with provider_capacity as (
    select greatest(0, least(coalesce(p_provider_limit_per_minute, 50), 1000)
      - count(*) filter (where last_attempted_at >= now() - interval '1 minute'))::integer remaining
    from public.guardian_notification_outbox
  ), tenant_capacity as (
    select policy.tenant_id,
      greatest(0, policy.tenant_daily_limit - count(o.id) filter (
        where o.status = 'delivered' and o.delivered_at >= now() - interval '24 hours'))::integer daily_remaining,
      greatest(0, policy.tenant_per_minute_limit - count(o.id) filter (
        where o.last_attempted_at >= now() - interval '1 minute'))::integer minute_remaining
    from public.guardian_notification_delivery_policies policy
    left join public.guardian_notification_outbox o on o.tenant_id = policy.tenant_id
    where policy.privacy_review_status = 'approved' and exists (select 1 from public.tenants notification_authority where notification_authority.id=policy.tenant_id and notification_authority.status='active')
      and policy.privacy_approved_at is not null
    group by policy.tenant_id, policy.tenant_daily_limit, policy.tenant_per_minute_limit
  ), locked as (
    select candidate.*
    from tenant_capacity capacity
    cross join lateral (
      select o.id, o.available_after, o.created_at
      from public.guardian_notification_outbox o
      where o.tenant_id = capacity.tenant_id
        and (o.status = 'pending' or (o.status = 'processing' and o.claim_expires_at < now()))
        and o.available_after <= now()
        and o.attempt_count < p_max_attempts
        and safebus_private.guardian_email_outbox_is_eligible(o.id)
      order by o.available_after, o.created_at, o.id
      limit least(capacity.daily_remaining, capacity.minute_remaining, 100)
      for update of o skip locked
    ) candidate
    where capacity.daily_remaining > 0 and capacity.minute_remaining > 0
  ), candidates as (
    select locked.id from locked cross join provider_capacity
    order by locked.available_after, locked.created_at, locked.id
    limit least(greatest(1, least(coalesce(p_batch_size, 25), 100)),
      (select remaining from provider_capacity))
  ), claimed as (
    update public.guardian_notification_outbox o
    set status = 'processing', attempt_count = o.attempt_count + 1,
        claimed_at = now(),
        claim_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 900))),
        last_attempted_at = now(), failure_reason = null, failure_category = null
    from candidates where o.id = candidates.id returning o.*
  )
  select claimed.id, claimed.tenant_id, claimed.guardian_id, claimed.student_id,
    claimed.student_trip_event_id, claimed.notification_type, claimed.attempt_count
  from claimed order by claimed.available_after, claimed.created_at, claimed.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_guardian_notification_email_batch_v2(p_batch_size integer DEFAULT 25, p_lease_seconds integer DEFAULT 120, p_max_attempts integer DEFAULT 5, p_provider_limit_per_minute integer DEFAULT 50)
 RETURNS TABLE(id uuid, tenant_id uuid, guardian_id uuid, student_id uuid, student_trip_event_id uuid, notification_type text, attempt_count integer)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select * from public.claim_guardian_notification_email_batch(
    p_batch_size, p_lease_seconds, p_max_attempts, p_provider_limit_per_minute
  );
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

CREATE OR REPLACE FUNCTION public.complete_guardian_notification_email(p_outbox_id uuid, p_provider_message_id text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
begin
  if current_user not in ('service_role', 'postgres') then raise exception 'Service role required.' using errcode = '42501'; end if;
  update public.guardian_notification_outbox
  set status = 'delivered', delivered_at = now(), provider_message_id = left(nullif(p_provider_message_id, ''), 200), claim_expires_at = null, claimed_at = null, failure_reason = null, failure_category = null
  where id = p_outbox_id and status = 'processing' and delivered_at is null and failed_at is null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_push_notification_delivery(p_outbox_id uuid, p_worker_id text, p_provider_message_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  update public.push_notification_outbox set status='delivered',provider_message_id=nullif(trim(p_provider_message_id),''),
    delivered_at=now(),lease_owner=null,lease_expires_at=null,updated_at=now()
  where id=p_outbox_id and status='processing' and lease_owner=p_worker_id;
  return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fail_guardian_notification_email(p_outbox_id uuid, p_failure_category text, p_failure_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  update public.guardian_notification_outbox
  set status = 'dead_lettered', dead_lettered_at = now(), claim_expires_at = null,
      claimed_at = null, failure_category = coalesce(p_failure_category, 'unknown'),
      failure_reason = left(coalesce(p_failure_reason, 'delivery_failed'), 120)
  where id = p_outbox_id and status = 'processing';
end;
$function$;

CREATE OR REPLACE FUNCTION public.fail_push_notification_delivery(p_outbox_id uuid, p_worker_id text, p_failure_category text, p_failure_code text, p_invalidate_device boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare v_device uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  update public.push_notification_outbox set status='failed',failure_category=left(p_failure_category,80),
    failure_code=left(p_failure_code,160),last_error_at=now(),failed_at=now(),lease_owner=null,lease_expires_at=null,updated_at=now()
  where id=p_outbox_id and status='processing' and lease_owner=p_worker_id returning device_id into v_device;
  if found and coalesce(p_invalidate_device,false) then
    update public.android_push_devices set status='invalid',invalidated_at=now(),last_failure_category=p_failure_category where id=v_device;
    update public.push_notification_outbox set status='cancelled',cancelled_at=now() where device_id=v_device and status in('pending','retry');
  end if;
  return v_device is not null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_guardian_notification_email_payload(p_outbox_id uuid)
 RETURNS TABLE(outbox_id uuid, tenant_id uuid, guardian_id uuid, recipient_email text, student_first_name text, notification_type text, event_created_at timestamp with time zone, tenant_timezone text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Guardian notification resolution requires service role.' using errcode = '42501';
  end if;

  return query
  select o.id, o.tenant_id, o.guardian_id,
    nullif(trim(coalesce(g.email, pr.email)), ''),
    case when o.user_notification_id is null
      then coalesce(nullif(trim(student.preferred_name), ''), student.first_name)
      else null
    end,
    o.notification_type,
    coalesce(notification.occurred_at, event.created_at),
    coalesce(nullif(trim(tenant.timezone), ''), 'America/Edmonton')
  from public.guardian_notification_outbox o
  join public.tenants tenant on tenant.id = o.tenant_id and tenant.status = 'active'
  join public.guardians g on g.id = o.guardian_id and g.tenant_id = o.tenant_id
  join public.profiles pr on pr.id = g.profile_id and pr.tenant_id = o.tenant_id
  left join public.user_notifications notification on notification.id = o.user_notification_id
  left join public.student_trip_events event on event.id = o.student_trip_event_id
  left join public.students student on student.id = o.student_id and student.tenant_id = o.tenant_id
  where o.id = p_outbox_id
    and o.status = 'processing'
    and safebus_private.guardian_email_outbox_is_eligible(o.id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_guardian_pickup_dropoff_email_payload(p_outbox_id uuid)
 RETURNS TABLE(recipient_email text, notification_type text, title text, body text, event_occurred_at timestamp with time zone, tenant_timezone text, idempotency_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION public.resolve_notification_email_recipient(p_outbox_id uuid)
 RETURNS TABLE(recipient_profile_id uuid, recipient_role text, recipient_email text, notification_type text, idempotency_key text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    o.recipient_profile_id,
    p.role::text,
    p.email,
    o.notification_type,
    case
      when o.guardian_id is not null then 'guardian-notification-outbox:' || o.id::text
      else 'notification-email-outbox:' || o.id::text
    end
  from public.guardian_notification_outbox o
  join public.profiles p on p.id = o.recipient_profile_id and p.tenant_id = o.tenant_id
  where o.id = p_outbox_id
    and o.status = 'processing'
    and safebus_private.notification_email_outbox_is_eligible(o.id)
    and p.status = 'active'
    and (
      (p.role = 'guardian' and o.guardian_id is not null)
      or (
        p.role = 'driver'
        and o.guardian_id is null
        and exists (select 1 from public.user_notifications n where n.id = o.user_notification_id
          and safebus_private.driver_notification_is_eligible(n))
        and exists (
          select 1 from public.drivers d
          where d.profile_id = p.id and d.tenant_id = p.tenant_id and d.status = 'active'
        )
      )
    );
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

CREATE OR REPLACE FUNCTION public.retry_guardian_notification_email(p_outbox_id uuid, p_failure_category text, p_failure_reason text, p_retry_after_seconds integer, p_max_attempts integer DEFAULT 5)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare v_attempts integer;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  select attempt_count into v_attempts
  from public.guardian_notification_outbox where id = p_outbox_id for update;
  if v_attempts >= p_max_attempts then
    update public.guardian_notification_outbox
    set status = 'dead_lettered', dead_lettered_at = now(), claim_expires_at = null,
        claimed_at = null, failure_category = coalesce(p_failure_category, 'unknown'),
        failure_reason = left(coalesce(p_failure_reason, 'delivery_failed'), 120)
    where id = p_outbox_id and status = 'processing';
  else
    update public.guardian_notification_outbox
    set status = 'pending',
        available_after = now() + make_interval(secs => greatest(60, least(coalesce(p_retry_after_seconds, 900), 86400))),
        claim_expires_at = null, claimed_at = null,
        failure_category = coalesce(p_failure_category, 'temporary_provider_error'),
        failure_reason = left(coalesce(p_failure_reason, 'temporary_delivery_failure'), 120)
    where id = p_outbox_id and status = 'processing';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.retry_push_notification_delivery(p_outbox_id uuid, p_worker_id text, p_failure_category text, p_failure_code text, p_available_after timestamp with time zone, p_retry_after_seconds integer DEFAULT NULL::integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  update public.push_notification_outbox set status=case when attempt_count>=5 then 'failed' else 'retry' end,
    available_after=greatest(coalesce(p_available_after,now()),now()), failure_category=left(p_failure_category,80),
    failure_code=left(p_failure_code,160),provider_retry_after_seconds=p_retry_after_seconds,last_error_at=now(),
    failed_at=case when attempt_count>=5 then now() else null end,lease_owner=null,lease_expires_at=null,updated_at=now()
  where id=p_outbox_id and status='processing' and lease_owner=p_worker_id;
  return found;
end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.enqueue_guardian_email_for_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_guardian_id uuid;
begin
  if new.recipient_role <> 'guardian'::public.user_role
    or new.category not in ('trip_status', 'operations', 'service_changes')
    or new.event_type not in (
      'trip_started', 'trip_completed', 'trip_cancelled',
      'trip_late', 'trip_missing', 'traffic_disruption', 'weather_disruption',
      'road_closure', 'mechanical_disruption', 'student_service_changed',
      'guardian_access_changed', 'authority_announcement'
    ) then
    return new;
  end if;

  select g.id into v_guardian_id
  from public.guardians g
  join public.profiles pr
    on pr.id = g.profile_id and pr.tenant_id = g.tenant_id
   and pr.role = 'guardian'::public.user_role and pr.status = 'active'
  join public.user_notification_settings settings
    on settings.profile_id = pr.id and settings.email_enabled
  join public.user_notification_category_preferences cp
    on cp.profile_id = pr.id and cp.category = new.category and cp.email_enabled
  join public.guardian_notification_delivery_policies policy
    on policy.tenant_id = g.tenant_id
   and policy.privacy_review_status = 'approved' and exists (select 1 from public.tenants notification_authority where notification_authority.id=policy.tenant_id and notification_authority.status='active')
   and policy.privacy_approved_at is not null
  where g.profile_id = new.recipient_profile_id
    and g.tenant_id = new.tenant_id
    and g.status = 'active'
    and (new.student_id is null or exists (
      select 1 from public.student_guardians sg
      where sg.tenant_id = g.tenant_id
        and sg.guardian_id = g.id
        and sg.student_id = new.student_id
        and sg.status = 'active'
        and (sg.access_expires_at is null or sg.access_expires_at > now())
    ));

  if v_guardian_id is not null then
    insert into public.guardian_notification_outbox(
      tenant_id, guardian_id, student_id, student_trip_event_id,
      user_notification_id, notification_type
    )
    values (
      new.tenant_id, v_guardian_id, new.student_id, null, new.id, new.event_type
    )
    on conflict (tenant_id, guardian_id, user_notification_id, notification_type)
      where user_notification_id is not null do nothing;
  end if;
  return new;
end;
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

CREATE OR REPLACE FUNCTION safebus_private.notification_email_outbox_is_eligible(p_outbox_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select (safebus_private.notification_email_before_announcements(p_outbox_id)
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
  );
$function$;

CREATE OR REPLACE FUNCTION safebus_private.notification_event_title(p_event_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case p_event_type
    when 'student_picked_up' then 'Pickup recorded'
    when 'student_dropped_off' then 'Drop-off recorded'
    when 'trip_started' then 'Trip started'
    when 'trip_completed' then 'Trip completed'
    when 'trip_cancelled' then 'Trip cancelled'
    when 'trip_late' then 'Bus delayed'
    when 'trip_missing' then 'Bus service missing'
    when 'traffic_disruption' then 'Traffic disruption'
    when 'weather_disruption' then 'Weather disruption'
    when 'road_closure' then 'Road closure'
    when 'mechanical_disruption' then 'Mechanical issue'
    when 'driver_assignment_created' then 'New assignment'
    when 'driver_assignment_changed' then 'Assignment changed'
    when 'driver_assignment_ended' then 'Assignment ended'
    when 'student_service_changed' then 'Bus service changed'
    when 'guardian_access_changed' then 'Student access changed'
    when 'delivery_health_incident' then 'Notification delivery issue'
    when 'provider_configuration_incident' then 'Notification configuration issue'
    when 'authority_announcement' then 'School authority announcement'
    else 'SafeBus notification' end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.notification_is_urgent(p_event_type text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
  select p_event_type in ('trip_cancelled', 'trip_missing', 'mechanical_disruption', 'road_closure');
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

CREATE OR REPLACE FUNCTION safebus_private.notification_recipient_can_access(n user_notifications)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.is_current_user_session_active()
    and safebus_private.has_completed_optional_mfa()
    and (n.recipient_role = 'platform_super_admin' or exists (
      select 1 from public.tenants authority where authority.id = n.tenant_id and authority.status = 'active'))
    and (n.recipient_role not in ('tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin')
      or safebus_private.has_verified_mfa())
    and safebus_private.notification_access_before_announcements(n)
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
    'trip_operational_status:' || new.id::text || ':' || new.operational_status || ':driver:' || extract(epoch from new.set_at)::text,
    new.set_at, null, new.driver_trip_id, null);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.pickup_dropoff_event_copy(p_event_id uuid, p_tenant_id uuid, p_student_id uuid, p_trip_id uuid, p_event_type text)
 RETURNS TABLE(title text, body text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
