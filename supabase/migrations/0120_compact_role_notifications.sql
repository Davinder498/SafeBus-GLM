-- Generated with the Supabase CLI and normalized to the canonical sequential name.
-- Forward-only: preserve history and external consent; never replay on production.

alter table public.user_notification_settings
  add column in_app_enabled boolean not null default true;
alter table public.user_notification_category_preferences
  add column in_app_enabled boolean not null default true;
alter table public.user_notifications
  add column in_app_visible boolean not null default true;

comment on column public.user_notifications.in_app_visible is
  'Inbox visibility captured at creation. Independent of external delivery; never recomputed from current preferences.';

-- Guard every insertion path, without hiding or rewriting historical notifications.
-- The existing enforce_driver_assignment_only_notification trigger is unchanged.
create function safebus_private.capture_notification_inbox_visibility()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.recipient_role in ('tenant_admin', 'transportation_admin', 'school_admin')
    and new.event_type not in (
      'trip_cancelled', 'trip_late', 'trip_missing', 'traffic_disruption',
      'weather_disruption', 'road_closure', 'mechanical_disruption', 'delivery_health_incident'
    ) then
    return null;
  end if;
  if new.recipient_role = 'guardian' then
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
$$;

create trigger zz_capture_notification_inbox_visibility
before insert on public.user_notifications
for each row execute function safebus_private.capture_notification_inbox_visibility();

-- Use the run's actual service and service date, not every student on its route.
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
    select distinct g.profile_id, student.id as student_id
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
      p_source_type || ':' || p_source_id::text || ':' || p_event_type || ':student:' || v_recipient.student_id::text,
      p_occurred_at, v_recipient.student_id, p_trip_id, v_school_id);
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

create function public.get_guardian_delivery_preferences_v3()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb; v_profile_id uuid := (select auth.uid());
begin
  -- v2 verifies the active guardian/tenant and initializes existing defaults.
  v_result := public.get_guardian_delivery_preferences_v2();
  return v_result || jsonb_build_object(
    'in_app_enabled', (select s.in_app_enabled from public.user_notification_settings s where s.profile_id = v_profile_id),
    'pickup_dropoff', (v_result -> 'pickup_dropoff') || jsonb_build_object('in_app', (
      select c.in_app_enabled from public.user_notification_category_preferences c where c.profile_id = v_profile_id and c.category = 'pickup_dropoff')),
    'trip_updates', (v_result -> 'trip_updates') || jsonb_build_object('in_app', (
      select c.in_app_enabled from public.user_notification_category_preferences c where c.profile_id = v_profile_id and c.category = 'trip_status')),
    'operational_alerts', (v_result -> 'operational_alerts') || jsonb_build_object('in_app', (
      select bool_and(c.in_app_enabled) from public.user_notification_category_preferences c
      where c.profile_id = v_profile_id and c.category in ('operations', 'service_changes')))
  );
end;
$$;

create function public.set_guardian_delivery_preferences_v3(p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_group text; v_channel text;
begin
  if jsonb_typeof(p_preferences) is distinct from 'object' then
    raise exception 'A complete guardian preference snapshot is required.' using errcode = '22023';
  end if;
  foreach v_channel in array array['in_app_enabled', 'push_enabled', 'email_enabled'] loop
    if jsonb_typeof(p_preferences -> v_channel) is distinct from 'boolean' then
      raise exception 'Channel master choices must be booleans.' using errcode = '22023';
    end if;
  end loop;
  foreach v_group in array array['pickup_dropoff', 'trip_updates', 'operational_alerts'] loop
    foreach v_channel in array array['in_app', 'push', 'email'] loop
      if jsonb_typeof(p_preferences #> array[v_group, v_channel]) is distinct from 'boolean' then
        raise exception 'Every event channel choice must be a boolean.' using errcode = '22023';
      end if;
    end loop;
  end loop;
  -- Preserve v2's guardian lock, consent synchronization, and external queue cancellation.
  -- All changes commit atomically; older clients leave the new selections untouched.
  perform public.set_guardian_delivery_preferences_v2(p_preferences);
  update public.user_notification_settings
    set in_app_enabled = (p_preferences ->> 'in_app_enabled')::boolean, updated_at = now()
    where profile_id = (select auth.uid());
  update public.user_notification_category_preferences
    set in_app_enabled = case category
      when 'pickup_dropoff' then (p_preferences #>> '{pickup_dropoff,in_app}')::boolean
      when 'trip_status' then (p_preferences #>> '{trip_updates,in_app}')::boolean
      else (p_preferences #>> '{operational_alerts,in_app}')::boolean end,
      updated_at = now()
    where profile_id = (select auth.uid()) and category in ('pickup_dropoff', 'trip_status', 'operations', 'service_changes');
  return public.get_guardian_delivery_preferences_v3();
end;
$$;

-- A single authorization predicate for the inbox, push links, and every action.
-- Preferences never substitute for authorization or hide historical rows.
create function safebus_private.notification_recipient_can_access(n public.user_notifications)
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
              and (n.student_id is null or exists (
                select 1 from public.student_guardians sg
                where sg.guardian_id = g.id and sg.tenant_id = g.tenant_id and sg.student_id = n.student_id
                  and sg.status = 'active' and (sg.access_expires_at is null or sg.access_expires_at > now())
              ))
          ))
        ))
      )
  );
$$;

-- Private presentation builder: called only after recipient authorization.
create function safebus_private.notification_copy(n public.user_notifications)
returns table(title text, body text) language sql stable security invoker set search_path = '' as $$
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
$$;

create or replace function public.get_user_notifications(
  p_limit integer default 30, p_before_created_at timestamptz default null,
  p_before_id uuid default null, p_unread_only boolean default false, p_category text default null
) returns table(
  id uuid, event_type text, category text, severity text, title text, body text,
  occurred_at timestamptz, created_at timestamptz, read_at timestamptz,
  archived_at timestamptz, destination_path text
) language plpgsql security definer set search_path = '' as $$
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
    and (p_category is null or n.category = p_category)
    and (p_before_created_at is null or (n.created_at, n.id) < (p_before_created_at, p_before_id))
  order by n.created_at desc, n.id desc limit p_limit;
end;
$$;

create function public.get_user_notification_detail(p_id uuid)
returns table(
  id uuid, event_type text, category text, severity text, title text, body text,
  occurred_at timestamptz, created_at timestamptz, read_at timestamptz,
  archived_at timestamptz, destination_path text
) language sql stable security definer set search_path = '' as $$
  select n.id, n.event_type, n.category, n.severity, copy.title, copy.body,
    n.occurred_at, n.created_at, n.read_at, n.archived_at, '/notifications?notification=' || n.id::text
  from public.user_notifications n cross join lateral safebus_private.notification_copy(n) copy
  where n.id = p_id and n.recipient_profile_id = (select auth.uid()) and n.archived_at is null
    and safebus_private.notification_recipient_can_access(n);
$$;

create or replace function public.get_user_notification_unread_count()
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.user_notifications n
  where n.recipient_profile_id = (select auth.uid()) and n.read_at is null and n.archived_at is null
    and n.in_app_visible and safebus_private.notification_recipient_can_access(n);
$$;

create or replace function public.mark_user_notifications_read(p_ids uuid[], p_read boolean default true)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if (select auth.uid()) is null or cardinality(coalesce(p_ids, '{}'::uuid[])) > 100 then
    raise exception 'Invalid notification selection.' using errcode = '22023';
  end if;
  update public.user_notifications n set read_at = case when coalesce(p_read, true) then coalesce(n.read_at, now()) else null end
  where n.id = any(coalesce(p_ids, '{}'::uuid[])) and n.recipient_profile_id = (select auth.uid())
    and safebus_private.notification_recipient_can_access(n);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.mark_all_user_notifications_read()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  update public.user_notifications n set read_at = now()
  where n.recipient_profile_id = (select auth.uid()) and n.read_at is null and n.archived_at is null
    and n.in_app_visible and safebus_private.notification_recipient_can_access(n);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.archive_user_notifications(p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if (select auth.uid()) is null or cardinality(coalesce(p_ids, '{}'::uuid[])) > 100 then
    raise exception 'Invalid notification selection.' using errcode = '22023';
  end if;
  update public.user_notifications n set archived_at = coalesce(n.archived_at, now())
  where n.id = any(coalesce(p_ids, '{}'::uuid[])) and n.recipient_profile_id = (select auth.uid())
    and safebus_private.notification_recipient_can_access(n);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

drop policy user_notifications_recipient_select on public.user_notifications;
create policy user_notifications_recipient_select on public.user_notifications for select to authenticated
using (recipient_profile_id = (select auth.uid()) and in_app_visible
  and safebus_private.notification_recipient_can_access(user_notifications));

revoke all on function safebus_private.capture_notification_inbox_visibility(),
  safebus_private.notify_trip_audience(uuid,uuid,uuid,text,text,text,text,uuid,timestamptz),
  safebus_private.notification_recipient_can_access(public.user_notifications),
  safebus_private.notification_copy(public.user_notifications) from public, anon, authenticated;
-- Policies call this predicate under the caller's role. The private schema
-- remains inaccessible through the Data API; no table privileges are expanded.
grant execute on function safebus_private.notification_recipient_can_access(public.user_notifications) to authenticated;
revoke all on function public.get_guardian_delivery_preferences_v3(),
  public.set_guardian_delivery_preferences_v3(jsonb), public.get_user_notification_detail(uuid)
  from public, anon, authenticated;
grant execute on function public.get_guardian_delivery_preferences_v3() to authenticated;
grant execute on function public.set_guardian_delivery_preferences_v3(jsonb) to authenticated;
grant execute on function public.get_user_notification_detail(uuid) to authenticated;

-- CREATE OR REPLACE retains the existing authenticated-only grants on inbox/action RPCs.
