create table safebus_private.authority_announcements (
  id uuid primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  sender_name text not null,
  audience text not null check (audience in ('all', 'guardians', 'drivers')),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 4000),
  guardian_count integer not null default 0 check (guardian_count >= 0),
  driver_count integer not null default 0 check (driver_count >= 0),
  created_at timestamptz not null default now()
);
alter table safebus_private.authority_announcements enable row level security;
revoke all on safebus_private.authority_announcements from public, anon, authenticated;
create index authority_announcements_history on safebus_private.authority_announcements(tenant_id, created_at desc, id desc);
create index authority_announcements_school on safebus_private.authority_announcements(school_id);
create index authority_announcements_sender on safebus_private.authority_announcements(sender_profile_id);

alter table public.user_notifications drop constraint user_notifications_event_type_check;
alter table public.user_notifications add constraint user_notifications_event_type_check CHECK ((event_type = ANY (ARRAY['student_picked_up'::text, 'student_dropped_off'::text, 'trip_started'::text, 'trip_completed'::text, 'trip_cancelled'::text, 'trip_late'::text, 'trip_missing'::text, 'traffic_disruption'::text, 'weather_disruption'::text, 'road_closure'::text, 'mechanical_disruption'::text, 'driver_assignment_created'::text, 'driver_assignment_changed'::text, 'driver_assignment_ended'::text, 'student_service_changed'::text, 'guardian_access_changed'::text, 'delivery_health_incident'::text, 'provider_configuration_incident'::text, 'authority_announcement'::text])));

alter table public.user_notifications drop constraint user_notifications_source_type_check;
alter table public.user_notifications add constraint user_notifications_source_type_check CHECK ((source_type = ANY (ARRAY['student_trip_event'::text, 'driver_trip'::text, 'trip_operational_status'::text, 'trip_exception'::text, 'driver_route_assignment'::text, 'student_bus_assignment'::text, 'student_guardian'::text, 'delivery_health'::text, 'platform_provider'::text, 'authority_announcement'::text])));

alter table public.guardian_notification_outbox drop constraint guardian_notification_outbox_type_check;
alter table public.guardian_notification_outbox add constraint guardian_notification_outbox_type_check CHECK ((notification_type = ANY (ARRAY['student_picked_up'::text, 'student_dropped_off'::text, 'trip_started'::text, 'trip_completed'::text, 'trip_cancelled'::text, 'trip_late'::text, 'trip_missing'::text, 'traffic_disruption'::text, 'weather_disruption'::text, 'road_closure'::text, 'mechanical_disruption'::text, 'student_service_changed'::text, 'guardian_access_changed'::text, 'driver_assignment_created'::text, 'driver_assignment_changed'::text, 'driver_assignment_ended'::text, 'authority_announcement'::text])));

create function safebus_private.require_announcement_admin()
returns public.profiles language plpgsql stable security definer set search_path = '' as $$
declare v_profile public.profiles;
begin
  if auth.uid() is null or not public.is_current_user_session_active() then
    raise exception 'Active sign-in required.' using errcode = '42501';
  end if;
  perform safebus_private.enforce_mfa_if_required();
  select p.* into v_profile from public.profiles p
  join public.tenants t on t.id = p.tenant_id and t.status = 'active'
  where p.id = auth.uid() and p.status = 'active'
    and p.role in ('tenant_admin', 'transportation_admin', 'school_admin');
  if not found or (v_profile.role = 'school_admin' and not exists (
    select 1 from public.schools s where s.id = v_profile.school_id
      and s.tenant_id = v_profile.tenant_id and s.status = 'active'
  )) then
    raise exception 'Active school authority administrator access required.' using errcode = '42501';
  end if;
  return v_profile;
end;
$$;

create function safebus_private.announcement_recipients(p_tenant_id uuid, p_school_id uuid, p_audience text, p_recipient_id uuid default null)
returns table(profile_id uuid, role public.user_role) language sql stable security definer set search_path = '' as $$
  select p.id, p.role from public.profiles p
  join public.tenants t on t.id = p.tenant_id and t.status = 'active'
  where p.tenant_id = p_tenant_id and p.status = 'active' and (p_recipient_id is null or p.id = p_recipient_id) and (
    (p_audience in ('all', 'guardians') and p.role = 'guardian' and exists (
      select 1 from public.guardians g
      join public.student_guardians sg on sg.guardian_id = g.id and sg.tenant_id = g.tenant_id
        and sg.status = 'active' and (sg.access_expires_at is null or sg.access_expires_at > now())
      join public.students s on s.id = sg.student_id and s.tenant_id = sg.tenant_id and s.status = 'active'
      join public.schools school on school.id = s.school_id and school.tenant_id = s.tenant_id and school.status = 'active'
      where g.profile_id = p.id and g.tenant_id = p_tenant_id and g.status = 'active'
        and (p_school_id is null or s.school_id = p_school_id)
    )) or (p_audience in ('all', 'drivers') and p.role = 'driver' and exists (
      select 1 from public.drivers d where d.profile_id = p.id and d.tenant_id = p_tenant_id and d.status = 'active'
        and (p_school_id is null or exists (
          select 1 from public.driver_route_assignments a
          join public.routes r on r.id = a.route_id and r.tenant_id = a.tenant_id and r.status = 'active'
          join public.schools school on school.id = r.school_id and school.tenant_id = r.tenant_id and school.status = 'active'
          where a.driver_id = d.id and a.tenant_id = d.tenant_id and a.status = 'active'
            and (a.effective_from is null or a.effective_from <= current_date)
            and (a.effective_to is null or a.effective_to >= current_date)
            and r.school_id = p_school_id
        ))
    ))
  );
$$;

create function safebus_private.announcement_recipient_is_current(n public.user_notifications)
returns boolean language sql stable security definer set search_path = '' as $$
  select n.event_type = 'authority_announcement' and n.category = 'operations'
    and n.source_type = 'authority_announcement' and n.student_id is null and n.driver_trip_id is null
    and exists (
      select 1 from safebus_private.authority_announcements a
      cross join lateral safebus_private.announcement_recipients(a.tenant_id, a.school_id, a.audience, n.recipient_profile_id) r
      where a.id = n.source_id and a.tenant_id = n.tenant_id
        and a.school_id is not distinct from n.school_id
        and r.profile_id = n.recipient_profile_id and r.role = n.recipient_role
    );
$$;

create function public.get_announcement_audience(p_audience text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_admin public.profiles; v_counts jsonb;
begin
  v_admin := safebus_private.require_announcement_admin();
  if p_audience is null or p_audience not in ('all', 'guardians', 'drivers') then
    raise exception 'Choose a valid audience.' using errcode = '22023';
  end if;
  select jsonb_build_object('guardians', count(*) filter (where r.role = 'guardian'),
    'drivers', count(*) filter (where r.role = 'driver'), 'total', count(*)) into v_counts
  from safebus_private.announcement_recipients(v_admin.tenant_id,
    case when v_admin.role = 'school_admin' then v_admin.school_id end, p_audience) r;
  return v_counts;
end;
$$;

create function safebus_private.announcement_json(a safebus_private.authority_announcements)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'title', a.title, 'body', a.body, 'audience', a.audience,
    'senderName', a.sender_name, 'createdAt', a.created_at, 'guardianCount', a.guardian_count,
    'driverCount', a.driver_count, 'recipientCount', a.guardian_count + a.driver_count);
$$;

create function public.send_authority_announcement(p_id uuid, p_audience text, p_title text, p_body text, p_expected_recipient_count integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_admin public.profiles; v_school uuid; v_existing safebus_private.authority_announcements;
  v_ids uuid[]; v_guardians integer; v_drivers integer; v_id uuid;
begin
  v_admin := safebus_private.require_announcement_admin();
  v_school := case when v_admin.role = 'school_admin' then v_admin.school_id end;
  if p_id is null or p_audience is null or p_audience not in ('all', 'guardians', 'drivers')
    or p_title is null or length(btrim(p_title)) not between 1 and 160
    or p_body is null or length(btrim(p_body)) not between 1 and 4000
    or p_expected_recipient_count is null or p_expected_recipient_count <= 0 then
    raise exception 'A valid audience, title, message and recipient preview are required.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('authority-announcement:' || v_admin.tenant_id::text, 0));
  select * into v_existing from safebus_private.authority_announcements where id = p_id;
  if found then
    if v_existing.tenant_id = v_admin.tenant_id and v_existing.sender_profile_id = v_admin.id
      and v_existing.school_id is not distinct from v_school and v_existing.audience = p_audience
      and v_existing.title = btrim(p_title) and v_existing.body = btrim(p_body) then
      return safebus_private.announcement_json(v_existing);
    end if;
    raise exception 'This send identifier has already been used.' using errcode = '22023';
  end if;
  if (select count(*) from safebus_private.authority_announcements
      where tenant_id = v_admin.tenant_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Announcement limit reached. Try again later.' using errcode = '54000';
  end if;
  select array_agg(r.profile_id), count(*) filter (where r.role = 'guardian'), count(*) filter (where r.role = 'driver')
  into v_ids, v_guardians, v_drivers
  from safebus_private.announcement_recipients(v_admin.tenant_id, v_school, p_audience) r;
  if v_guardians + v_drivers <> p_expected_recipient_count then
    raise exception 'The audience has changed. Review the recipient count and try again.' using errcode = '22023';
  end if;
  insert into safebus_private.authority_announcements(id, tenant_id, school_id, sender_profile_id,
    sender_name, audience, title, body, guardian_count, driver_count)
  values (p_id, v_admin.tenant_id, v_school, v_admin.id, coalesce(nullif(btrim(v_admin.full_name), ''), 'School authority admin'),
    p_audience, btrim(p_title), btrim(p_body), v_guardians, v_drivers) returning * into v_existing;
  foreach v_id in array v_ids loop
    perform safebus_private.enqueue_user_notification(v_admin.tenant_id, v_id, 'authority_announcement',
      'operations', 'info', 'authority_announcement', p_id, 'announcement:' || p_id::text, now(), null, null, v_school);
  end loop;
  return safebus_private.announcement_json(v_existing);
end;
$$;

create function public.get_authority_announcements(p_before_created_at timestamptz default null, p_before_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_admin public.profiles; v_result jsonb;
begin
  v_admin := safebus_private.require_announcement_admin();
  if (p_before_created_at is null) <> (p_before_id is null) then
    raise exception 'Both history cursor fields are required.' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(safebus_private.announcement_json(a) order by a.created_at desc, a.id desc), '[]'::jsonb)
    into v_result from (
      select a.* from safebus_private.authority_announcements a
      where a.tenant_id = v_admin.tenant_id
        and (v_admin.role <> 'school_admin' or a.school_id = v_admin.school_id)
        and (p_before_created_at is null or (a.created_at, a.id) < (p_before_created_at, p_before_id))
      order by a.created_at desc, a.id desc limit 30
    ) a;
  return v_result;
end;
$$;

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

create or replace function safebus_private.notification_copy(n public.user_notifications)
returns table(title text, body text) language sql stable security invoker set search_path = '' as $$
  select a.title, a.body from safebus_private.authority_announcements a
  where n.event_type = 'authority_announcement' and n.source_type = 'authority_announcement'
    and a.id = n.source_id and a.tenant_id = n.tenant_id
  union all
  select c.title, c.body from safebus_private.notification_copy_before_announcements(n) c
  where n.event_type <> 'authority_announcement';
$$;

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

create or replace function safebus_private.notification_recipient_can_access(n public.user_notifications)
returns boolean language sql stable security definer set search_path = '' as $$
  select safebus_private.notification_access_before_announcements(n)
    and (n.event_type <> 'authority_announcement' or safebus_private.announcement_recipient_is_current(n));
$$;

create function safebus_private.driver_notification_is_eligible(n public.user_notifications)
returns boolean language sql stable security definer set search_path = '' as $$
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
$$;

create or replace function safebus_private.driver_can_access_notification(p_notification public.user_notifications)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_notification.recipient_profile_id = (select auth.uid())
    and safebus_private.driver_notification_is_eligible(p_notification);
$$;

create or replace function safebus_private.enforce_driver_assignment_only_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.recipient_role = 'driver' and not safebus_private.driver_notification_is_eligible(new) then return null; end if;
  return new;
end;
$$;

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

create function public.get_driver_delivery_preferences_v2()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_profile public.profiles; v_result jsonb;
begin
  select p.* into v_profile from public.profiles p
    join public.tenants t on t.id = p.tenant_id and t.status = 'active'
    where p.id = auth.uid() and p.role = 'driver' and p.status = 'active'
      and exists (select 1 from public.drivers d where d.profile_id = p.id and d.tenant_id = p.tenant_id and d.status = 'active');
  if not found or not public.is_current_user_session_active() then
    raise exception 'Active driver sign-in required.' using errcode = '42501';
  end if;
  if not safebus_private.has_completed_optional_mfa() then
    raise exception 'Complete multi-factor authentication to continue.' using errcode = '42501';
  end if;
  insert into public.user_notification_settings(profile_id, tenant_id, push_enabled, email_enabled)
    values(v_profile.id, v_profile.tenant_id, false, false) on conflict (profile_id) do nothing;
  insert into public.user_notification_category_preferences(profile_id, category, push_enabled, email_enabled)
    select v_profile.id, c, false, false from unnest(array['assignments', 'trip_status', 'operations']) c
    on conflict (profile_id, category) do nothing;
  select jsonb_build_object('in_app_enabled', s.in_app_enabled, 'push_enabled', s.push_enabled, 'email_enabled', s.email_enabled)
    into v_result from public.user_notification_settings s where s.profile_id = v_profile.id;
  return v_result || (
    select jsonb_object_agg(case c.category when 'assignments' then 'assignment_alerts'
      when 'trip_status' then 'trip_updates' else 'operational_alerts' end,
      jsonb_build_object('in_app', c.in_app_enabled, 'push', c.push_enabled, 'email', c.email_enabled))
    from public.user_notification_category_preferences c where c.profile_id = v_profile.id
      and c.category in ('assignments', 'trip_status', 'operations')
  );
end;
$$;

create function public.set_driver_delivery_preferences_v2(p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_group text; v_channel text; v_profile_id uuid := auth.uid();
begin
  perform public.get_driver_delivery_preferences_v2();
  if jsonb_typeof(p_preferences) is distinct from 'object' then
    raise exception 'A complete driver preference snapshot is required.' using errcode = '22023';
  end if;
  foreach v_channel in array array['in_app_enabled', 'push_enabled', 'email_enabled'] loop
    if jsonb_typeof(p_preferences -> v_channel) is distinct from 'boolean' then
      raise exception 'Channel choices must be booleans.' using errcode = '22023';
    end if;
  end loop;
  foreach v_group in array array['assignment_alerts', 'trip_updates', 'operational_alerts'] loop
    foreach v_channel in array array['in_app', 'push', 'email'] loop
      if jsonb_typeof(p_preferences #> array[v_group, v_channel]) is distinct from 'boolean' then
        raise exception 'Every alert channel choice must be a boolean.' using errcode = '22023';
      end if;
    end loop;
  end loop;
  perform 1 from public.user_notification_settings where profile_id = v_profile_id for update;
  update public.user_notification_settings set in_app_enabled = (p_preferences ->> 'in_app_enabled')::boolean,
    push_enabled = (p_preferences ->> 'push_enabled')::boolean, email_enabled = (p_preferences ->> 'email_enabled')::boolean,
    updated_at = now() where profile_id = v_profile_id;
  update public.user_notification_category_preferences c set
    in_app_enabled = (p_preferences #>> array[case c.category when 'assignments' then 'assignment_alerts' when 'trip_status' then 'trip_updates' else 'operational_alerts' end, 'in_app'])::boolean,
    push_enabled = (p_preferences #>> array[case c.category when 'assignments' then 'assignment_alerts' when 'trip_status' then 'trip_updates' else 'operational_alerts' end, 'push'])::boolean,
    email_enabled = (p_preferences #>> array[case c.category when 'assignments' then 'assignment_alerts' when 'trip_status' then 'trip_updates' else 'operational_alerts' end, 'email'])::boolean,
    updated_at = now() where c.profile_id = v_profile_id and c.category in ('assignments', 'trip_status', 'operations');
  return public.get_driver_delivery_preferences_v2();
end;
$$;

create or replace function public.set_driver_delivery_preferences(p_preferences jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_assignment jsonb := p_preferences -> 'assignment_alerts';
begin
  if jsonb_typeof(p_preferences) is distinct from 'object'
    or jsonb_typeof(p_preferences -> 'push_enabled') is distinct from 'boolean'
    or jsonb_typeof(p_preferences -> 'email_enabled') is distinct from 'boolean'
    or jsonb_typeof(v_assignment) is distinct from 'object'
    or jsonb_typeof(v_assignment -> 'push') is distinct from 'boolean'
    or jsonb_typeof(v_assignment -> 'email') is distinct from 'boolean' then
    raise exception 'Invalid driver delivery preferences' using errcode = '22023';
  end if;

  select * into v_profile
  from public.profiles
  where id = (select auth.uid()) and role = 'driver' and status = 'active';

  if not found or not exists (
    select 1 from public.drivers d
    where d.profile_id = v_profile.id and d.tenant_id = v_profile.tenant_id and d.status = 'active'
  ) then
    raise exception 'Active driver access required' using errcode = '42501';
  end if;

  insert into public.user_notification_settings(profile_id, tenant_id, push_enabled, email_enabled)
  values (
    v_profile.id,
    v_profile.tenant_id,
    (p_preferences ->> 'push_enabled')::boolean,
    (p_preferences ->> 'email_enabled')::boolean
  )
  on conflict (profile_id) do update set
    push_enabled = excluded.push_enabled,
    email_enabled = excluded.email_enabled,
    updated_at = now();

  insert into public.user_notification_category_preferences(
    profile_id, category, push_enabled, email_enabled
  ) values (
    v_profile.id,
    'assignments',
    (v_assignment ->> 'push')::boolean,
    (v_assignment ->> 'email')::boolean
  )
  on conflict (profile_id, category) do update set
    push_enabled = excluded.push_enabled,
    email_enabled = excluded.email_enabled,
    updated_at = now();

  update public.user_notification_category_preferences
  set push_enabled = false, email_enabled = false, updated_at = now()
  where profile_id = v_profile.id and category is distinct from 'assignments';

  return public.get_driver_delivery_preferences();
end;
$$;

create function public.get_admin_inbox_preferences()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_admin public.profiles;
begin
  v_admin := safebus_private.require_announcement_admin();
  insert into public.user_notification_settings(profile_id, tenant_id, push_enabled, email_enabled)
    values(v_admin.id, v_admin.tenant_id, false, false) on conflict (profile_id) do nothing;
  insert into public.user_notification_category_preferences(profile_id, category, push_enabled, email_enabled)
    select v_admin.id, c, false, false from unnest(array['trip_status', 'operations', 'service_changes', 'delivery_health']) c
    on conflict (profile_id, category) do nothing;
  return jsonb_build_object(
    'inAppEnabled', (select in_app_enabled from public.user_notification_settings where profile_id = v_admin.id),
    'tripUpdates', (select in_app_enabled from public.user_notification_category_preferences where profile_id = v_admin.id and category = 'trip_status'),
    'operationalAlerts', (select bool_and(in_app_enabled) from public.user_notification_category_preferences where profile_id = v_admin.id and category in ('operations', 'service_changes')),
    'deliveryHealth', (select in_app_enabled from public.user_notification_category_preferences where profile_id = v_admin.id and category = 'delivery_health')
  );
end;
$$;

create function public.set_admin_inbox_preferences(p_preferences jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_admin public.profiles; v_key text;
begin
  v_admin := safebus_private.require_announcement_admin();
  perform public.get_admin_inbox_preferences();
  foreach v_key in array array['inAppEnabled', 'tripUpdates', 'operationalAlerts', 'deliveryHealth'] loop
    if jsonb_typeof(p_preferences -> v_key) is distinct from 'boolean' then
      raise exception 'Inbox choices must be booleans.' using errcode = '22023';
    end if;
  end loop;
  perform 1 from public.user_notification_settings where profile_id = v_admin.id for update;
  update public.user_notification_settings set in_app_enabled = (p_preferences ->> 'inAppEnabled')::boolean,
    updated_at = now() where profile_id = v_admin.id;
  update public.user_notification_category_preferences set in_app_enabled = (p_preferences ->>
    case category when 'trip_status' then 'tripUpdates' when 'delivery_health' then 'deliveryHealth' else 'operationalAlerts' end)::boolean,
    updated_at = now() where profile_id = v_admin.id and category in ('trip_status', 'operations', 'service_changes', 'delivery_health');
  return public.get_admin_inbox_preferences();
end;
$$;

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

create or replace function safebus_private.notification_email_outbox_is_eligible(p_outbox_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
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
$$;

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

revoke all on function safebus_private.require_announcement_admin() from public, anon, authenticated;

revoke all on function safebus_private.announcement_recipients(uuid,uuid,text,uuid) from public, anon, authenticated;

revoke all on function safebus_private.announcement_recipient_is_current(public.user_notifications) from public, anon, authenticated;

revoke all on function safebus_private.announcement_json(safebus_private.authority_announcements) from public, anon, authenticated;

revoke all on function safebus_private.notification_copy_before_announcements(public.user_notifications) from public, anon, authenticated;

revoke all on function safebus_private.notification_copy(public.user_notifications) from public, anon, authenticated;

revoke all on function safebus_private.notification_access_before_announcements(public.user_notifications) from public, anon, authenticated;

revoke all on function safebus_private.driver_notification_is_eligible(public.user_notifications) from public, anon, authenticated;

revoke all on function safebus_private.driver_can_access_notification(public.user_notifications) from public, anon, authenticated;

revoke all on function safebus_private.enforce_driver_assignment_only_notification() from public, anon, authenticated;

revoke all on function safebus_private.capture_notification_inbox_visibility() from public, anon, authenticated;

revoke all on function safebus_private.notification_email_before_announcements(uuid) from public, anon, authenticated;

revoke all on function safebus_private.notification_email_outbox_is_eligible(uuid) from public, anon, authenticated;

revoke all on function safebus_private.enforce_guardian_notification_enqueue() from public, anon, authenticated;

revoke all on function safebus_private.enqueue_driver_assignment_email() from public, anon, authenticated;

revoke all on function safebus_private.enqueue_guardian_email_for_notification() from public, anon, authenticated;

revoke all on function safebus_private.enqueue_push_for_notification(uuid) from public, anon, authenticated;

revoke all on function safebus_private.notify_trip_audience(uuid,uuid,uuid,text,text,text,text,uuid,timestamptz) from public, anon, authenticated;

revoke all on function public.get_announcement_audience(text) from public, anon, authenticated;
grant execute on function public.get_announcement_audience(text) to authenticated;

revoke all on function public.send_authority_announcement(uuid,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.send_authority_announcement(uuid,text,text,text,integer) to authenticated;

revoke all on function public.get_authority_announcements(timestamptz,uuid) from public, anon, authenticated;
grant execute on function public.get_authority_announcements(timestamptz,uuid) to authenticated;

revoke all on function public.get_driver_delivery_preferences_v2() from public, anon, authenticated;
grant execute on function public.get_driver_delivery_preferences_v2() to authenticated;

revoke all on function public.set_driver_delivery_preferences_v2(jsonb) from public, anon, authenticated;
grant execute on function public.set_driver_delivery_preferences_v2(jsonb) to authenticated;

revoke all on function public.get_admin_inbox_preferences() from public, anon, authenticated;
grant execute on function public.get_admin_inbox_preferences() to authenticated;

revoke all on function public.set_admin_inbox_preferences(jsonb) from public, anon, authenticated;
grant execute on function public.set_admin_inbox_preferences(jsonb) to authenticated;
