CREATE OR REPLACE FUNCTION safebus_private.guardian_email_outbox_is_eligible(p_outbox_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select safebus_private.notification_email_outbox_is_eligible(p_outbox_id);
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
     and policy.privacy_review_status = 'approved' and exists (select 1 from public.tenants notification_authority where notification_authority.id=policy.tenant_id and notification_authority.status='active')
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

CREATE OR REPLACE FUNCTION safebus_private.record_student_trip_event_for_active_trip(p_student_id uuid, p_event_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare
  v_trip public.driver_trips;
  v_stop_id uuid;
  v_has_pickup boolean;
  v_has_dropoff boolean;
  v_event_id uuid;
  v_notification_type text;
begin
  if auth.uid() is null or safebus_private.current_user_role() <> 'driver' then
    raise exception 'Only a driver can record student trip events.' using errcode = '42501';
  end if;
  if p_student_id is null or p_event_type not in ('picked_up', 'dropped_off') then
    raise exception 'Invalid student trip event.' using errcode = '22023';
  end if;

  select dt.* into v_trip
  from public.driver_trips dt
  where dt.tenant_id = safebus_private.current_tenant_id()
    and dt.driver_id = safebus_private.current_driver_id()
    and dt.status = 'active'
  order by dt.started_at desc
  limit 1
  for update;
  if not found then
    raise exception 'Active trip not found.' using errcode = 'P0002';
  end if;

  select
    case when p_event_type = 'picked_up' then sba.pickup_stop_id else sba.dropoff_stop_id end
  into v_stop_id
  from public.student_bus_assignments sba
  join public.bus_route_assignments bra
    on bra.id = sba.bus_route_assignment_id
    and bra.tenant_id = v_trip.tenant_id
    and bra.bus_id = v_trip.bus_id
    and bra.route_id = v_trip.route_id
    and bra.route_trip_pattern_id = v_trip.route_trip_pattern_id
    and bra.status = 'active'
    and (bra.effective_from is null or bra.effective_from <= v_trip.service_date)
    and (bra.effective_to is null or bra.effective_to >= v_trip.service_date)
  where sba.student_id = p_student_id
    and sba.tenant_id = v_trip.tenant_id
    and sba.route_trip_pattern_id = v_trip.route_trip_pattern_id
    and sba.status = 'active'
    and sba.effective_from <= v_trip.service_date
    and (sba.effective_to is null or sba.effective_to >= v_trip.service_date)
  order by sba.effective_from desc
  limit 1;

  if not found then
    raise exception 'Student is not assigned to this active trip.' using errcode = 'P0002';
  end if;
  if v_stop_id is null then
    raise exception 'The planned stop must be assigned before recording this event.'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.route_stops rs
    where rs.id = v_stop_id
      and rs.tenant_id = v_trip.tenant_id
      and rs.route_id = v_trip.route_id
      and rs.status = 'active'
  ) then
    raise exception 'The planned stop is not available on this route.' using errcode = '23514';
  end if;

  select
    exists (
      select 1 from public.student_trip_events
      where driver_trip_id = v_trip.id
        and student_id = p_student_id
        and event_type = 'picked_up'
    ),
    exists (
      select 1 from public.student_trip_events
      where driver_trip_id = v_trip.id
        and student_id = p_student_id
        and event_type = 'dropped_off'
    )
  into v_has_pickup, v_has_dropoff;

  if v_has_dropoff then
    raise exception 'Student trip is already complete.' using errcode = '23505';
  end if;
  if p_event_type = 'picked_up' and v_has_pickup then
    raise exception 'Student is already picked up.' using errcode = '23505';
  end if;
  if p_event_type = 'dropped_off' and not v_has_pickup then
    raise exception 'Student must be picked up first.' using errcode = '23514';
  end if;

  insert into public.student_trip_events (
    tenant_id,
    driver_trip_id,
    student_id,
    route_stop_id,
    event_type,
    created_by
  ) values (
    v_trip.tenant_id,
    v_trip.id,
    p_student_id,
    v_stop_id,
    p_event_type,
    auth.uid()
  )
  returning id into v_event_id;

  v_notification_type := case p_event_type
    when 'picked_up' then 'student_picked_up'
    when 'dropped_off' then 'student_dropped_off'
  end;

  insert into public.guardian_notification_outbox (
    tenant_id,
    guardian_id,
    student_id,
    student_trip_event_id,
    notification_type
  )
  select
    v_trip.tenant_id,
    sg.guardian_id,
    p_student_id,
    v_event_id,
    v_notification_type
  from public.student_guardians sg
  join public.guardians g
    on g.id = sg.guardian_id
    and g.tenant_id = sg.tenant_id
    and g.status = 'active'
  where sg.tenant_id = v_trip.tenant_id
    and sg.student_id = p_student_id
    and sg.status = 'active'
    and sg.can_receive_notifications = true
  on conflict (tenant_id, guardian_id, student_trip_event_id, notification_type)
  do nothing;
exception
  when unique_violation then
    raise exception 'Student trip event already recorded.' using errcode = '23505';
end;
$function$;
