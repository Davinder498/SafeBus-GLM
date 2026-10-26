-- Run only through the protected release workflow; rehearse with final ROLLBACK.
-- Restores definitions only; no preference, identity, queue, or notification writes.

-- Read-only BusSafe schema snapshot, 2026-10-26. No customer records or credentials.
-- Used only by embedded PostgreSQL tests and reviewed rollback preparation.
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
    where policy.notifications_enabled
      and policy.privacy_review_status = 'approved'
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
        and pol.push_notifications_enabled and pol.privacy_review_status='approved'
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

CREATE OR REPLACE FUNCTION public.get_tenant_notification_settings()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant_id uuid := safebus_private.current_tenant_id();
  v_policy public.guardian_notification_delivery_policies%rowtype;
  v_approved boolean;
begin
  if auth.uid() is null
    or safebus_private.current_user_role() is distinct from 'tenant_admin'::public.user_role
    or v_tenant_id is null then
    raise exception 'Tenant notification settings require an active tenant administrator.'
      using errcode = '42501';
  end if;

  select * into v_policy
  from public.guardian_notification_delivery_policies
  where tenant_id = v_tenant_id;

  if v_policy.tenant_id is null then
    raise exception 'Tenant notification policy is not configured.' using errcode = 'P0002';
  end if;

  v_approved := v_policy.privacy_review_status = 'approved'
    and v_policy.privacy_approved_at is not null;

  return jsonb_build_object(
    'notifications_enabled', v_policy.notifications_enabled,
    'push_notifications_enabled', v_policy.push_delivery_preference_enabled,
    'email_effective', v_approved and v_policy.notifications_enabled,
    'push_effective', v_approved and v_policy.notifications_enabled
      and v_policy.push_notifications_enabled,
    'privacy_review_status', v_policy.privacy_review_status,
    'privacy_approved_at', v_policy.privacy_approved_at,
    'updated_at', v_policy.updated_at
  );
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
      and pol.push_notifications_enabled and pol.privacy_review_status='approved'
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

CREATE OR REPLACE FUNCTION public.set_tenant_notification_delivery_enabled(p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant_id uuid := safebus_private.current_tenant_id();
  v_policy public.guardian_notification_delivery_policies%rowtype;
begin
  if auth.uid() is null
    or safebus_private.current_user_role() is distinct from 'tenant_admin'::public.user_role
    or v_tenant_id is null then
    raise exception 'Tenant notification settings require an active tenant administrator.'
      using errcode = '42501';
  end if;

  select * into v_policy
  from public.guardian_notification_delivery_policies
  where tenant_id = v_tenant_id
  for update;

  if v_policy.tenant_id is null then
    raise exception 'Tenant notification policy is not configured.' using errcode = 'P0002';
  end if;

  if p_enabled is null then
    raise exception 'A delivery choice is required.' using errcode = '22023';
  end if;

  if p_enabled and (
    v_policy.privacy_review_status <> 'approved'
    or v_policy.privacy_approved_at is null
  ) then
    raise exception 'External notification delivery requires approved privacy review.'
      using errcode = '22023';
  end if;

  if v_policy.notifications_enabled is distinct from p_enabled
    or v_policy.push_notifications_enabled is distinct from
      (p_enabled and v_policy.push_delivery_preference_enabled) then
    update public.guardian_notification_delivery_policies
    set notifications_enabled = p_enabled,
        push_notifications_enabled = case
          when p_enabled then v_policy.push_delivery_preference_enabled
          else false
        end
    where tenant_id = v_tenant_id;

    perform safebus_private.phase5_write_audit_event(
      auth.uid(),
      'security.config_changed',
      'tenant_notification_policy',
      v_tenant_id,
      'Tenant notification delivery',
      jsonb_build_object(
        'setting', 'external_delivery',
        'previous_enabled', v_policy.notifications_enabled,
        'enabled', p_enabled
      )
    );
  end if;

  return public.get_tenant_notification_settings();
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_tenant_push_notifications_enabled(p_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tenant_id uuid := safebus_private.current_tenant_id();
  v_policy public.guardian_notification_delivery_policies%rowtype;
begin
  if auth.uid() is null
    or safebus_private.current_user_role() is distinct from 'tenant_admin'::public.user_role
    or v_tenant_id is null then
    raise exception 'Tenant notification settings require an active tenant administrator.'
      using errcode = '42501';
  end if;

  select * into v_policy
  from public.guardian_notification_delivery_policies
  where tenant_id = v_tenant_id
  for update;

  if v_policy.tenant_id is null then
    raise exception 'Tenant notification policy is not configured.' using errcode = 'P0002';
  end if;

  if p_enabled is null then
    raise exception 'A push delivery choice is required.' using errcode = '22023';
  end if;

  if v_policy.privacy_review_status <> 'approved'
    or v_policy.privacy_approved_at is null
    or not v_policy.notifications_enabled then
    raise exception 'Android push can only change while approved external delivery is active.'
      using errcode = '22023';
  end if;

  if v_policy.push_notifications_enabled is distinct from p_enabled
    or v_policy.push_delivery_preference_enabled is distinct from p_enabled then
    update public.guardian_notification_delivery_policies
    set push_notifications_enabled = p_enabled,
        push_delivery_preference_enabled = p_enabled
    where tenant_id = v_tenant_id;

    perform safebus_private.phase5_write_audit_event(
      auth.uid(),
      'security.config_changed',
      'tenant_notification_policy',
      v_tenant_id,
      'Tenant Android push delivery',
      jsonb_build_object(
        'setting', 'android_push',
        'previous_enabled', v_policy.push_delivery_preference_enabled,
        'enabled', p_enabled
      )
    );
  end if;

  return public.get_tenant_notification_settings();
end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.enforce_guardian_notification_enqueue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_profile_id uuid;
begin
  if new.guardian_id is not null then
    select g.profile_id into v_profile_id
    from public.guardians g
    join public.profiles p on p.id = g.profile_id and p.status = 'active'
    join public.user_notification_settings s on s.profile_id = p.id and s.email_enabled
    join public.guardian_notification_delivery_policies policy
      on policy.tenant_id = g.tenant_id
     and policy.notifications_enabled
     and policy.privacy_review_status = 'approved'
     and policy.privacy_approved_at is not null
    where g.id = new.guardian_id
      and g.tenant_id = new.tenant_id
      and g.status = 'active';
    if v_profile_id is null then return null; end if;
    new.recipient_profile_id := v_profile_id;
    return new;
  end if;

  if new.recipient_profile_id is null

    or not exists (
      select 1
      from public.profiles p
      join public.drivers d
        on d.profile_id = p.id and d.tenant_id = p.tenant_id and d.status = 'active'
      join public.user_notification_settings s on s.profile_id = p.id and s.email_enabled
      join public.user_notification_category_preferences c
        on c.profile_id = p.id and c.email_enabled
      join public.guardian_notification_delivery_policies policy
        on policy.tenant_id = p.tenant_id
       and policy.notifications_enabled
       and policy.privacy_review_status = 'approved'
       and policy.privacy_approved_at is not null
      join public.user_notifications n
        on n.id = new.user_notification_id
       and n.recipient_profile_id = p.id
       and n.tenant_id = p.tenant_id
       and n.category = c.category and safebus_private.driver_notification_is_eligible(n)
       and n.event_type = new.notification_type
      where p.id = new.recipient_profile_id
        and p.tenant_id = new.tenant_id
        and p.role = 'driver'::public.user_role
        and p.status = 'active'
    ) then
    return null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.enqueue_driver_assignment_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.recipient_role = 'driver'
    and safebus_private.driver_notification_is_eligible(new)
    and exists (
      select 1
      from public.profiles p
      join public.drivers d on d.profile_id = p.id and d.tenant_id = p.tenant_id and d.status = 'active'
      join public.user_notification_settings s on s.profile_id = p.id and s.email_enabled
      join public.user_notification_category_preferences c
        on c.profile_id = p.id and c.category = new.category and c.email_enabled
      join public.guardian_notification_delivery_policies policy
        on policy.tenant_id = p.tenant_id
       and policy.notifications_enabled
       and policy.privacy_review_status = 'approved'
       and policy.privacy_approved_at is not null
      where p.id = new.recipient_profile_id and p.tenant_id = new.tenant_id
        and p.status = 'active'
    ) then
    insert into public.guardian_notification_outbox(
      tenant_id, recipient_profile_id, user_notification_id, notification_type
    ) values (new.tenant_id, new.recipient_profile_id, new.id, new.event_type)
    on conflict do nothing;
  end if;
  return new;
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
   and policy.notifications_enabled
   and policy.privacy_review_status = 'approved'
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
    and pol.push_notifications_enabled and pol.privacy_review_status = 'approved'
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

CREATE OR REPLACE FUNCTION safebus_private.guardian_email_outbox_is_eligible_legacy(p_outbox_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.guardian_notification_outbox o
    join public.guardians g
      on g.id = o.guardian_id and g.tenant_id = o.tenant_id and g.status = 'active'
    join public.profiles pr
      on pr.id = g.profile_id and pr.tenant_id = o.tenant_id
     and pr.role = 'guardian'::public.user_role and pr.status = 'active'
    join public.user_notification_settings settings
      on settings.profile_id = pr.id and settings.email_enabled
    join public.guardian_notification_delivery_policies policy
      on policy.tenant_id = o.tenant_id
     and policy.notifications_enabled
     and policy.privacy_review_status = 'approved'
     and policy.privacy_approved_at is not null
    left join public.user_notifications n on n.id = o.user_notification_id
    where o.id = p_outbox_id
      and (
        (
          o.user_notification_id is null
          and g.pickup_dropoff_email_enabled
          and g.email_preferences_set_at is not null
          and exists (
            select 1 from public.user_notification_category_preferences cp
            where cp.profile_id = pr.id and cp.category = 'pickup_dropoff' and cp.email_enabled
          )
          and exists (
            select 1
            from public.student_guardians sg
            join public.student_trip_events event
              on event.id = o.student_trip_event_id
             and event.tenant_id = o.tenant_id
             and event.student_id = o.student_id
            where sg.tenant_id = o.tenant_id
              and sg.guardian_id = o.guardian_id
              and sg.student_id = o.student_id
              and sg.status = 'active'
              and (sg.access_expires_at is null or sg.access_expires_at > now())
              and sg.notification_preferences_set_at is not null
              and sg.can_receive_notifications
              and ((o.notification_type = 'student_picked_up' and sg.notify_pickup and event.event_type = 'picked_up')
                or (o.notification_type = 'student_dropped_off' and sg.notify_dropoff and event.event_type = 'dropped_off'))
          )
        )
        or
        (
          o.user_notification_id is not null
          and n.tenant_id = o.tenant_id
          and n.recipient_profile_id = pr.id
          and n.recipient_role = 'guardian'::public.user_role
          and n.event_type = o.notification_type
          and n.category in ('trip_status', 'operations', 'service_changes')
          and exists (
            select 1 from public.user_notification_category_preferences cp
            where cp.profile_id = pr.id and cp.category = n.category and cp.email_enabled
          )
          and (n.student_id is null or exists (
            select 1 from public.student_guardians sg
            where sg.tenant_id = o.tenant_id
              and sg.guardian_id = o.guardian_id
              and sg.student_id = n.student_id
              and sg.status = 'active'
              and (sg.access_expires_at is null or sg.access_expires_at > now())
          ))
        )
      )
  );
$function$;

CREATE OR REPLACE FUNCTION safebus_private.notification_email_before_announcements(p_outbox_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and policy.notifications_enabled and policy.privacy_review_status = 'approved' and policy.privacy_approved_at is not null
    where o.id = p_outbox_id and o.guardian_id is null and safebus_private.driver_notification_is_eligible(n)
  );
$function$;
