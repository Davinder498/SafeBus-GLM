-- SafeBus Alberta - end-to-end durable in-app and Android push notifications
--
-- Additive, fail-closed notification milestone. Browser clients can read and
-- mutate only their own inbox/preferences through narrowly scoped RPCs. FCM
-- tokens and delivery queues are private and never receive browser grants.

create schema if not exists safebus_private;
revoke all on schema safebus_private from public, anon, authenticated;

alter table public.guardian_notification_delivery_policies
  add column if not exists push_notifications_enabled boolean not null default false,
  add column if not exists push_tenant_daily_limit integer not null default 500,
  add column if not exists push_tenant_per_minute_limit integer not null default 20,
  add constraint guardian_notification_policy_push_limits_check check (
    push_tenant_daily_limit between 1 and 100000
    and push_tenant_per_minute_limit between 1 and 1000
  );

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_role public.user_role not null,
  event_type text not null,
  category text not null,
  severity text not null default 'info',
  source_type text not null,
  source_id uuid,
  student_id uuid references public.students(id) on delete cascade,
  driver_trip_id uuid references public.driver_trips(id) on delete cascade,
  school_id uuid references public.schools(id) on delete cascade,
  deduplication_key text not null,
  occurred_at timestamptz not null default now(),
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_notifications_event_type_check check (event_type in (
    'student_picked_up', 'student_dropped_off',
    'trip_started', 'trip_completed', 'trip_cancelled',
    'trip_late', 'trip_missing',
    'traffic_disruption', 'weather_disruption', 'road_closure', 'mechanical_disruption',
    'driver_assignment_created', 'driver_assignment_changed', 'driver_assignment_ended',
    'student_service_changed', 'guardian_access_changed',
    'delivery_health_incident', 'provider_configuration_incident'
  )),
  constraint user_notifications_category_check check (category in (
    'pickup_dropoff', 'trip_status', 'service_changes', 'assignments', 'operations', 'delivery_health', 'platform'
  )),
  constraint user_notifications_severity_check check (severity in ('info', 'warning', 'urgent')),
  constraint user_notifications_source_type_check check (source_type in (
    'student_trip_event', 'driver_trip', 'trip_operational_status', 'trip_exception',
    'driver_route_assignment', 'student_bus_assignment', 'student_guardian', 'delivery_health', 'platform_provider'
  )),
  constraint user_notifications_platform_scope_check check (
    (recipient_role = 'platform_super_admin' and tenant_id is null and category = 'platform' and student_id is null and driver_trip_id is null and school_id is null)
    or (recipient_role <> 'platform_super_admin' and tenant_id is not null and category <> 'platform')
  ),
  constraint user_notifications_deduplication_key_check check (length(deduplication_key) between 1 and 240)
);

create unique index user_notifications_recipient_dedupe_unique
  on public.user_notifications(recipient_profile_id, deduplication_key);
create index user_notifications_recipient_inbox_idx
  on public.user_notifications(recipient_profile_id, created_at desc, id desc)
  where archived_at is null;
create index user_notifications_recipient_unread_idx
  on public.user_notifications(recipient_profile_id, created_at desc, id desc)
  where read_at is null and archived_at is null;
create index user_notifications_tenant_idx on public.user_notifications(tenant_id);
create index user_notifications_student_idx on public.user_notifications(student_id);
create index user_notifications_driver_trip_idx on public.user_notifications(driver_trip_id);
create index user_notifications_school_idx on public.user_notifications(school_id);

create table public.user_notification_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  push_enabled boolean not null default false,
  quiet_hours_enabled boolean not null default true,
  quiet_hours_start time not null default '21:00',
  quiet_hours_end time not null default '07:00',
  timezone_override text,
  urgent_bypass_quiet_hours boolean not null default true,
  preview_mode text not null default 'generic',
  updated_at timestamptz not null default now(),
  constraint user_notification_settings_preview_check check (preview_mode in ('generic', 'limited')),
  constraint user_notification_settings_timezone_check check (
    timezone_override is null or length(trim(timezone_override)) between 1 and 100
  )
);
create index user_notification_settings_tenant_idx on public.user_notification_settings(tenant_id);

create table public.user_notification_category_preferences (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (profile_id, category),
  constraint user_notification_category_preferences_category_check check (category in (
    'pickup_dropoff', 'trip_status', 'service_changes', 'assignments', 'operations', 'delivery_health'
  ))
);

create table public.guardian_student_push_preferences (
  student_guardian_id uuid not null references public.student_guardians(id) on delete cascade,
  category text not null,
  push_enabled boolean not null default false,
  preferences_set_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_guardian_id, category),
  constraint guardian_student_push_preferences_category_check check (
    category in ('pickup_dropoff', 'trip_status', 'service_changes')
  )
);

create table public.android_push_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  installation_id text not null,
  fcm_token text not null,
  token_hash text not null,
  device_model text,
  app_version text,
  permission_state text not null,
  status text not null default 'active',
  last_registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  invalidated_at timestamptz,
  last_failure_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint android_push_devices_installation_check check (length(installation_id) between 16 and 200),
  constraint android_push_devices_token_check check (length(fcm_token) between 20 and 4096),
  constraint android_push_devices_token_hash_check check (length(token_hash) = 64),
  constraint android_push_devices_permission_check check (permission_state in ('prompt', 'granted', 'denied', 'permanently_denied')),
  constraint android_push_devices_status_check check (status in ('active', 'revoked', 'invalid', 'stale'))
);
create unique index android_push_devices_active_installation_unique
  on public.android_push_devices(profile_id, installation_id) where status = 'active';
create unique index android_push_devices_active_token_unique
  on public.android_push_devices(token_hash) where status = 'active';
create index android_push_devices_profile_idx on public.android_push_devices(profile_id);
create index android_push_devices_tenant_idx on public.android_push_devices(tenant_id);
create index android_push_devices_active_freshness_idx
  on public.android_push_devices(profile_id, last_seen_at desc) where status = 'active';

create table public.push_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  notification_id uuid not null references public.user_notifications(id) on delete cascade,
  device_id uuid not null references public.android_push_devices(id) on delete cascade,
  status text not null default 'pending',
  available_after timestamptz not null default now(),
  attempt_count integer not null default 0,
  lease_owner text,
  lease_expires_at timestamptz,
  provider_message_id text,
  provider_retry_after_seconds integer,
  failure_category text,
  failure_code text,
  last_error_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_notification_outbox_unique unique (notification_id, device_id),
  constraint push_notification_outbox_status_check check (status in (
    'pending', 'processing', 'retry', 'delivered', 'failed', 'cancelled'
  )),
  constraint push_notification_outbox_attempt_check check (attempt_count between 0 and 5),
  constraint push_notification_outbox_retry_after_check check (
    provider_retry_after_seconds is null or provider_retry_after_seconds between 0 and 86400
  )
);
create index push_notification_outbox_tenant_idx on public.push_notification_outbox(tenant_id);
create index push_notification_outbox_notification_idx on public.push_notification_outbox(notification_id);
create index push_notification_outbox_device_idx on public.push_notification_outbox(device_id);
create index push_notification_outbox_claim_idx
  on public.push_notification_outbox(available_after, created_at, id)
  where status in ('pending', 'retry');
create index push_notification_outbox_processing_lease_idx
  on public.push_notification_outbox(lease_expires_at)
  where status = 'processing';

alter table public.user_notifications enable row level security;
alter table public.user_notification_settings enable row level security;
alter table public.user_notification_category_preferences enable row level security;
alter table public.guardian_student_push_preferences enable row level security;
alter table public.android_push_devices enable row level security;
alter table public.push_notification_outbox enable row level security;

revoke all on public.user_notifications, public.user_notification_settings,
  public.user_notification_category_preferences, public.guardian_student_push_preferences,
  public.android_push_devices, public.push_notification_outbox
  from public, anon, authenticated;

create policy "user notifications select own authorized"
  on public.user_notifications for select to authenticated
  using (
    recipient_profile_id = (select auth.uid())
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active' and p.role = recipient_role)
    and (
      student_id is null
      or exists (
        select 1 from public.student_guardians sg
        join public.guardians g on g.id = sg.guardian_id and g.tenant_id = sg.tenant_id
        where g.profile_id = (select auth.uid()) and sg.student_id = user_notifications.student_id
          and sg.status = 'active' and g.status = 'active'
          and (sg.access_expires_at is null or sg.access_expires_at > now())
      )
    )
  );

grant select on public.user_notifications to authenticated;

create trigger set_updated_at_user_notification_settings before update on public.user_notification_settings
  for each row execute function public.set_updated_at();
create trigger set_updated_at_user_notification_category_preferences before update on public.user_notification_category_preferences
  for each row execute function public.set_updated_at();
create trigger set_updated_at_guardian_student_push_preferences before update on public.guardian_student_push_preferences
  for each row execute function public.set_updated_at();
create trigger set_updated_at_android_push_devices before update on public.android_push_devices
  for each row execute function public.set_updated_at();
create trigger set_updated_at_push_notification_outbox before update on public.push_notification_outbox
  for each row execute function public.set_updated_at();

comment on table public.user_notifications is 'Authoritative code-only notification inbox. No rendered student names or arbitrary source text.';
comment on table public.android_push_devices is 'Private Android FCM registrations. Direct browser access is prohibited.';
comment on table public.push_notification_outbox is 'Private leased, retryable Android push delivery queue.';

-- Exact-user private Realtime authorization. Payloads contain only an opaque
-- notification identifier and clients refetch through secured APIs.
drop policy if exists "safebus notification broadcast receive" on realtime.messages;
create policy "safebus notification broadcast receive"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and realtime.topic() = 'safebus:notifications:' || (select auth.uid())::text
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'active')
  );

create or replace function safebus_private.send_notification_invalidation(p_profile_id uuid, p_notification_id uuid)
returns void language plpgsql security definer set search_path = public, realtime, pg_temp as $$
begin
  if p_profile_id is null or p_notification_id is null then return; end if;
  perform realtime.send(jsonb_build_object('id', p_notification_id), 'notification_changed',
    'safebus:notifications:' || p_profile_id::text, true);
end;
$$;
revoke all on function safebus_private.send_notification_invalidation(uuid, uuid) from public, anon, authenticated;

create or replace function safebus_private.notification_is_urgent(p_event_type text)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select p_event_type in ('trip_cancelled', 'trip_missing', 'mechanical_disruption', 'road_closure');
$$;

create or replace function safebus_private.next_push_availability(
  p_tenant_id uuid, p_profile_id uuid, p_event_type text, p_reference timestamptz default now()
) returns timestamptz language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_settings public.user_notification_settings;
  v_timezone text;
  v_local timestamp;
  v_date date;
  v_candidate timestamp;
begin
  select * into v_settings from public.user_notification_settings where profile_id = p_profile_id;
  if not found or not v_settings.quiet_hours_enabled then return p_reference; end if;
  if v_settings.urgent_bypass_quiet_hours and safebus_private.notification_is_urgent(p_event_type) then return p_reference; end if;
  select coalesce(nullif(trim(v_settings.timezone_override), ''), nullif(trim(t.timezone), ''), 'America/Edmonton')
    into v_timezone from public.tenants t where t.id = p_tenant_id;
  begin perform now() at time zone v_timezone; exception when invalid_parameter_value then v_timezone := 'America/Edmonton'; end;
  v_local := p_reference at time zone v_timezone;
  if v_settings.quiet_hours_start < v_settings.quiet_hours_end then
    if v_local::time >= v_settings.quiet_hours_start and v_local::time < v_settings.quiet_hours_end then
      v_candidate := v_local::date + v_settings.quiet_hours_end;
      return v_candidate at time zone v_timezone;
    end if;
  elsif v_local::time >= v_settings.quiet_hours_start or v_local::time < v_settings.quiet_hours_end then
    v_date := case when v_local::time >= v_settings.quiet_hours_start then v_local::date + 1 else v_local::date end;
    v_candidate := v_date + v_settings.quiet_hours_end;
    return v_candidate at time zone v_timezone;
  end if;
  return p_reference;
end;
$$;

create or replace function safebus_private.enqueue_push_for_notification(p_notification_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
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
      v_notification.recipient_role <> 'guardian' or v_notification.student_id is null or exists (
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

create or replace function safebus_private.enqueue_user_notification(
  p_tenant_id uuid, p_recipient_profile_id uuid, p_event_type text, p_category text,
  p_severity text, p_source_type text, p_source_id uuid, p_deduplication_key text,
  p_occurred_at timestamptz, p_student_id uuid default null, p_driver_trip_id uuid default null,
  p_school_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, realtime, pg_temp as $$
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
$$;

revoke all on all functions in schema safebus_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Event fan-out. Every trigger maps controlled source codes only; exception
-- detail and other arbitrary text are deliberately ignored.
-- ---------------------------------------------------------------------------
create or replace function safebus_private.notify_trip_audience(
  p_tenant_id uuid, p_trip_id uuid, p_route_id uuid, p_event_type text,
  p_category text, p_severity text, p_source_type text, p_source_id uuid,
  p_occurred_at timestamptz
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_recipient record; v_school_id uuid;
begin
  select school_id into v_school_id from public.routes where id = p_route_id and tenant_id = p_tenant_id;

  for v_recipient in
    select distinct g.profile_id, s.id as student_id
    from public.student_bus_assignments sba
    join public.bus_route_assignments bra on bra.id=sba.bus_route_assignment_id and bra.tenant_id=sba.tenant_id and bra.route_id=p_route_id and bra.status='active'
    join public.students s on s.id = sba.student_id and s.tenant_id = sba.tenant_id and s.status = 'active'
    join public.student_guardians sg on sg.student_id = s.id and sg.tenant_id = s.tenant_id
      and sg.status = 'active' and (sg.access_expires_at is null or sg.access_expires_at > now())
    join public.guardians g on g.id = sg.guardian_id and g.tenant_id = sg.tenant_id and g.status = 'active'
    where sba.tenant_id = p_tenant_id and sba.status = 'active'
      and sba.effective_from <= current_date and (sba.effective_to is null or sba.effective_to >= current_date)
  loop
    perform safebus_private.enqueue_user_notification(p_tenant_id, v_recipient.profile_id,
      p_event_type, p_category, p_severity, p_source_type, p_source_id,
      p_source_type || ':' || p_source_id::text || ':' || p_event_type || ':student:' || v_recipient.student_id::text,
      p_occurred_at, v_recipient.student_id, p_trip_id, v_school_id);
  end loop;

  for v_recipient in
    select p.id as profile_id
    from public.profiles p
    where p.tenant_id = p_tenant_id and p.status = 'active'
      and (p.role in ('tenant_admin', 'transportation_admin')
        or (p.role = 'school_admin' and p.school_id = v_school_id))
  loop
    perform safebus_private.enqueue_user_notification(p_tenant_id, v_recipient.profile_id,
      p_event_type, case when p_category = 'pickup_dropoff' then 'operations' else p_category end,
      p_severity, p_source_type, p_source_id,
      p_source_type || ':' || p_source_id::text || ':' || p_event_type || ':admin',
      p_occurred_at, null, p_trip_id, v_school_id);
  end loop;
end;
$$;

create or replace function safebus_private.on_student_trip_event_notification()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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
$$;
create trigger student_trip_events_notify after insert on public.student_trip_events
  for each row execute function safebus_private.on_student_trip_event_notification();

create or replace function safebus_private.on_driver_trip_notification()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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
$$;
create trigger driver_trips_notify after insert or update of status on public.driver_trips
  for each row execute function safebus_private.on_driver_trip_notification();

create or replace function safebus_private.on_trip_operational_status_notification()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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
$$;
create trigger trip_operational_statuses_notify after insert or update of operational_status, reason_code on public.trip_operational_statuses
  for each row execute function safebus_private.on_trip_operational_status_notification();

create or replace function safebus_private.on_trip_exception_notification()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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
$$;
create trigger trip_exceptions_notify after insert on public.trip_exceptions
  for each row execute function safebus_private.on_trip_exception_notification();

create or replace function safebus_private.on_driver_assignment_notification()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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
$$;
create trigger driver_route_assignments_notify after insert or update on public.driver_route_assignments
  for each row execute function safebus_private.on_driver_assignment_notification();

create or replace function safebus_private.on_student_service_notification()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_recipient record; v_school uuid;
begin
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
$$;
create trigger student_bus_assignments_notify after insert or update on public.student_bus_assignments
  for each row execute function safebus_private.on_student_service_notification();

create or replace function safebus_private.on_guardian_access_notification()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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
$$;
create trigger student_guardians_notify after insert or update of status, access_expires_at, can_receive_notifications on public.student_guardians
  for each row execute function safebus_private.on_guardian_access_notification();

revoke all on all functions in schema safebus_private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Authenticated inbox and preference contracts.
-- ---------------------------------------------------------------------------
create or replace function public.get_user_notifications(
  p_limit integer default 30, p_before_created_at timestamptz default null,
  p_before_id uuid default null, p_unread_only boolean default false, p_category text default null
) returns table(
  id uuid, event_type text, category text, severity text, title text, body text,
  occurred_at timestamptz, created_at timestamptz, read_at timestamptz,
  archived_at timestamptz, destination_path text
) language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active') then
    raise exception 'Active authentication is required.' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 then raise exception 'Limit must be between 1 and 100.' using errcode = '22023'; end if;
  if (p_before_created_at is null) <> (p_before_id is null) then raise exception 'Both cursor fields are required.' using errcode = '22023'; end if;
  if p_category is not null and p_category not in ('pickup_dropoff','trip_status','service_changes','assignments','operations','delivery_health','platform') then
    raise exception 'Invalid category.' using errcode = '22023';
  end if;
  return query
  select n.id, n.event_type, n.category, n.severity,
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
      else 'Notification provider incident' end,
    case n.category
      when 'pickup_dropoff' then 'A linked student trip event was recorded.'
      when 'trip_status' then 'Bus service status has changed.'
      when 'service_changes' then 'Your authorized bus-service access has changed.'
      when 'assignments' then 'Your planned work assignment has changed.'
      when 'operations' then 'An operational bus-service update is available.'
      when 'delivery_health' then 'Notification delivery needs attention.'
      else 'Notification configuration needs attention.' end,
    n.occurred_at, n.created_at, n.read_at, n.archived_at,
    '/notifications?notification=' || n.id::text
  from public.user_notifications n
  where n.recipient_profile_id = auth.uid() and n.archived_at is null
    and (not coalesce(p_unread_only, false) or n.read_at is null)
    and (p_category is null or n.category = p_category)
    and (p_before_created_at is null or (n.created_at, n.id) < (p_before_created_at, p_before_id))
    and (n.student_id is null or exists (
      select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
      where g.profile_id = auth.uid() and sg.student_id = n.student_id and sg.status = 'active' and g.status = 'active'
        and (sg.access_expires_at is null or sg.access_expires_at > now())))
  order by n.created_at desc, n.id desc limit p_limit;
end;
$$;

create or replace function public.get_user_notification_unread_count()
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::integer from public.user_notifications n where n.recipient_profile_id = auth.uid()
    and n.read_at is null and n.archived_at is null
    and (n.student_id is null or exists (
      select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
      where g.profile_id = auth.uid() and sg.student_id = n.student_id and sg.status = 'active' and g.status = 'active'
        and (sg.access_expires_at is null or sg.access_expires_at > now())));
$$;

create or replace function public.mark_user_notifications_read(p_ids uuid[], p_read boolean default true)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if auth.uid() is null or cardinality(coalesce(p_ids, '{}'::uuid[])) > 100 then raise exception 'Invalid notification selection.' using errcode = '22023'; end if;
  update public.user_notifications set read_at = case when coalesce(p_read, true) then coalesce(read_at, now()) else null end
  where recipient_profile_id = auth.uid() and id = any(coalesce(p_ids, '{}'::uuid[]));
  get diagnostics v_count = row_count; return v_count;
end;
$$;

create or replace function public.mark_all_user_notifications_read()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  update public.user_notifications set read_at = now() where recipient_profile_id = auth.uid() and read_at is null and archived_at is null;
  get diagnostics v_count = row_count; return v_count;
end;
$$;

create or replace function public.archive_user_notifications(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_count integer;
begin
  if auth.uid() is null or cardinality(coalesce(p_ids, '{}'::uuid[])) > 100 then raise exception 'Invalid notification selection.' using errcode = '22023'; end if;
  update public.user_notifications set archived_at = coalesce(archived_at, now())
  where recipient_profile_id = auth.uid() and id = any(coalesce(p_ids, '{}'::uuid[]));
  get diagnostics v_count = row_count; return v_count;
end;
$$;

create or replace function public.get_notification_preferences()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_profile public.profiles; v_settings public.user_notification_settings;
begin
  select * into v_profile from public.profiles where id = auth.uid() and status = 'active';
  if not found then raise exception 'Active authentication is required.' using errcode = '42501'; end if;
  insert into public.user_notification_settings(profile_id, tenant_id) values (v_profile.id, v_profile.tenant_id)
    on conflict (profile_id) do nothing;
  select * into v_settings from public.user_notification_settings where profile_id = v_profile.id;
  return jsonb_build_object('pushEnabled', v_settings.push_enabled, 'quietHoursEnabled', v_settings.quiet_hours_enabled,
    'quietHoursStart', to_char(v_settings.quiet_hours_start, 'HH24:MI'), 'quietHoursEnd', to_char(v_settings.quiet_hours_end, 'HH24:MI'),
    'timezone', coalesce(v_settings.timezone_override, (select timezone from public.tenants where id = v_profile.tenant_id), 'America/Edmonton'),
    'timezoneOverride', v_settings.timezone_override, 'urgentBypassQuietHours', v_settings.urgent_bypass_quiet_hours,
    'previewMode', v_settings.preview_mode,
    'categories', coalesce((select jsonb_object_agg(category, push_enabled) from public.user_notification_category_preferences where profile_id = v_profile.id), '{}'::jsonb));
end;
$$;

create or replace function public.set_notification_preferences(
  p_push_enabled boolean, p_quiet_hours_enabled boolean, p_quiet_hours_start time,
  p_quiet_hours_end time, p_timezone_override text, p_urgent_bypass_quiet_hours boolean,
  p_preview_mode text, p_categories jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_profile public.profiles; v_category text; v_value jsonb;
begin
  select * into v_profile from public.profiles where id = auth.uid() and status = 'active';
  if not found then raise exception 'Active authentication is required.' using errcode = '42501'; end if;
  if v_profile.role in ('tenant_admin','school_admin','transportation_admin','platform_super_admin') and coalesce(p_push_enabled, false) then
    raise exception 'Administrator push is not available.' using errcode = '22023';
  end if;
  if p_preview_mode not in ('generic','limited') then raise exception 'Invalid preview mode.' using errcode = '22023'; end if;
  if p_timezone_override is not null and not exists (select 1 from pg_timezone_names where name = trim(p_timezone_override)) then
    raise exception 'Invalid timezone.' using errcode = '22023'; end if;
  insert into public.user_notification_settings(profile_id, tenant_id, push_enabled, quiet_hours_enabled,
    quiet_hours_start, quiet_hours_end, timezone_override, urgent_bypass_quiet_hours, preview_mode)
  values (v_profile.id, v_profile.tenant_id, coalesce(p_push_enabled,false), coalesce(p_quiet_hours_enabled,true),
    coalesce(p_quiet_hours_start,'21:00'), coalesce(p_quiet_hours_end,'07:00'), nullif(trim(p_timezone_override),''),
    coalesce(p_urgent_bypass_quiet_hours,true), p_preview_mode)
  on conflict (profile_id) do update set push_enabled = excluded.push_enabled,
    quiet_hours_enabled = excluded.quiet_hours_enabled, quiet_hours_start = excluded.quiet_hours_start,
    quiet_hours_end = excluded.quiet_hours_end, timezone_override = excluded.timezone_override,
    urgent_bypass_quiet_hours = excluded.urgent_bypass_quiet_hours, preview_mode = excluded.preview_mode, updated_at = now();
  for v_category, v_value in select key, value from jsonb_each(coalesce(p_categories,'{}'::jsonb)) loop
    if v_category not in ('pickup_dropoff','trip_status','service_changes','assignments','operations','delivery_health')
      or jsonb_typeof(v_value) <> 'boolean' then raise exception 'Invalid category preference.' using errcode = '22023'; end if;
    insert into public.user_notification_category_preferences(profile_id, category, push_enabled)
      values (v_profile.id, v_category, (v_value#>>'{}')::boolean)
      on conflict (profile_id,category) do update set push_enabled=excluded.push_enabled, updated_at=now();
  end loop;
  return public.get_notification_preferences();
end;
$$;

revoke all on function public.get_user_notifications(integer,timestamptz,uuid,boolean,text),
  public.get_user_notification_unread_count(), public.mark_user_notifications_read(uuid[],boolean),
  public.mark_all_user_notifications_read(), public.archive_user_notifications(uuid[]),
  public.get_notification_preferences(),
  public.set_notification_preferences(boolean,boolean,time,time,text,boolean,text,jsonb)
  from public, anon;
grant execute on function public.get_user_notifications(integer,timestamptz,uuid,boolean,text),
  public.get_user_notification_unread_count(), public.mark_user_notifications_read(uuid[],boolean),
  public.mark_all_user_notifications_read(), public.archive_user_notifications(uuid[]),
  public.get_notification_preferences(),
  public.set_notification_preferences(boolean,boolean,time,time,text,boolean,text,jsonb)
  to authenticated;

-- Guardian push choices are separate from, and do not weaken, the existing
-- pickup/drop-off email consent RPC.
create or replace function public.get_guardian_notification_preferences_v2()
returns table(
  student_id uuid, student_name text, email_enabled boolean, email_pickup boolean,
  email_dropoff boolean, push_pickup_dropoff boolean, push_trip_status boolean,
  push_service_changes boolean, preferences_set_at timestamptz, access_expires_at timestamptz
) language plpgsql security definer set search_path = public, pg_temp as $$
declare v_guardian uuid := public.current_guardian_id();
begin
  if auth.uid() is null or public.current_user_role() is distinct from 'guardian'::public.user_role or v_guardian is null then
    raise exception 'Guardian notification preferences require an active guardian login.' using errcode = '42501';
  end if;
  return query select s.id, concat_ws(' ',s.first_name,s.last_name),
    sg.can_receive_notifications and sg.notification_preferences_set_at is not null,
    sg.notify_pickup, sg.notify_dropoff,
    coalesce((select gp.push_enabled from public.guardian_student_push_preferences gp where gp.student_guardian_id=sg.id and gp.category='pickup_dropoff'),false),
    coalesce((select gp.push_enabled from public.guardian_student_push_preferences gp where gp.student_guardian_id=sg.id and gp.category='trip_status'),false),
    coalesce((select gp.push_enabled from public.guardian_student_push_preferences gp where gp.student_guardian_id=sg.id and gp.category='service_changes'),false),
    sg.notification_preferences_set_at, sg.access_expires_at
  from public.student_guardians sg join public.students s on s.id=sg.student_id and s.status='active'
  where sg.guardian_id=v_guardian and sg.tenant_id=public.current_tenant_id() and sg.status='active'
    and (sg.access_expires_at is null or sg.access_expires_at>now())
  order by s.first_name,s.last_name,s.id;
end;
$$;

create or replace function public.set_guardian_notification_preferences_v2(
  p_student_id uuid, p_email_enabled boolean, p_email_pickup boolean, p_email_dropoff boolean,
  p_push_pickup_dropoff boolean, p_push_trip_status boolean, p_push_service_changes boolean
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_link public.student_guardians;
begin
  perform public.set_guardian_notification_preferences(p_student_id,p_email_enabled,p_email_pickup,p_email_dropoff);
  select sg.* into v_link from public.student_guardians sg
  where sg.guardian_id=public.current_guardian_id() and sg.tenant_id=public.current_tenant_id()
    and sg.student_id=p_student_id and sg.status='active'
    and (sg.access_expires_at is null or sg.access_expires_at>now());
  if not found then raise exception 'Authorized student link not found.' using errcode='P0002'; end if;
  insert into public.guardian_student_push_preferences(student_guardian_id,category,push_enabled)
  values (v_link.id,'pickup_dropoff',coalesce(p_push_pickup_dropoff,false)),
    (v_link.id,'trip_status',coalesce(p_push_trip_status,false)),
    (v_link.id,'service_changes',coalesce(p_push_service_changes,false))
  on conflict (student_guardian_id,category) do update set push_enabled=excluded.push_enabled,
    preferences_set_at=now(),updated_at=now();
end;
$$;

create or replace function public.register_android_push_device(
  p_installation_id text, p_fcm_token text, p_device_model text,
  p_app_version text, p_permission_state text
) returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v_profile public.profiles; v_hash text; v_id uuid;
begin
  select * into v_profile from public.profiles where id=auth.uid() and status='active';
  if not found or v_profile.role not in ('guardian','driver') then raise exception 'Android push registration is unavailable.' using errcode='42501'; end if;
  if length(trim(coalesce(p_installation_id,''))) not between 16 and 200
    or length(trim(coalesce(p_fcm_token,''))) not between 20 and 4096
    or p_permission_state not in ('prompt','granted','denied','permanently_denied') then
    raise exception 'Invalid push registration.' using errcode='22023';
  end if;
  v_hash := encode(digest(trim(p_fcm_token),'sha256'),'hex');
  update public.android_push_devices set status='revoked',revoked_at=now()
    where status='active' and (token_hash=v_hash or (profile_id=auth.uid() and installation_id=trim(p_installation_id)));
  insert into public.android_push_devices(tenant_id,profile_id,installation_id,fcm_token,token_hash,
    device_model,app_version,permission_state,status,last_registered_at,last_seen_at)
  values(v_profile.tenant_id,v_profile.id,trim(p_installation_id),trim(p_fcm_token),v_hash,
    nullif(trim(p_device_model),''),nullif(trim(p_app_version),''),p_permission_state,'active',now(),now())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.list_own_push_devices()
returns table(id uuid,installation_id text,device_model text,app_version text,permission_state text,status text,
  last_registered_at timestamptz,last_seen_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select d.id,d.installation_id,d.device_model,d.app_version,d.permission_state,d.status,d.last_registered_at,d.last_seen_at
  from public.android_push_devices d where d.profile_id=auth.uid() order by d.last_seen_at desc,d.id;
$$;

create or replace function public.revoke_own_push_device(p_device_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.android_push_devices set status='revoked',revoked_at=now()
    where id=p_device_id and profile_id=auth.uid() and status='active';
  if found then
    update public.push_notification_outbox set status='cancelled',cancelled_at=now(),lease_owner=null,lease_expires_at=null
      where device_id=p_device_id and status in ('pending','retry','processing');
    return true;
  end if;
  return false;
end;
$$;

revoke all on function public.get_guardian_notification_preferences_v2(),
  public.set_guardian_notification_preferences_v2(uuid,boolean,boolean,boolean,boolean,boolean,boolean),
  public.register_android_push_device(text,text,text,text,text), public.list_own_push_devices(),
  public.revoke_own_push_device(uuid) from public,anon;
grant execute on function public.get_guardian_notification_preferences_v2(),
  public.set_guardian_notification_preferences_v2(uuid,boolean,boolean,boolean,boolean,boolean,boolean),
  public.register_android_push_device(text,text,text,text,text), public.list_own_push_devices(),
  public.revoke_own_push_device(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Service-role delivery contracts. Claim revalidates recipient, consent,
-- tenant approval, device freshness and guardian authorization immediately
-- before exposing an FCM token to the dispatcher.
-- ---------------------------------------------------------------------------
create or replace function public.claim_push_notification_deliveries(
  p_worker_id text, p_limit integer default 50, p_lease_seconds integer default 120
) returns table(
  outbox_id uuid, tenant_id uuid, notification_id uuid, device_id uuid, fcm_token text,
  event_type text, category text, severity text, preview_mode text, android_channel text,
  collapse_key text, title text, body text, attempt_count integer
) language plpgsql security definer set search_path=public,pg_temp as $$
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
        and (p.role<>'guardian' or n.student_id is null or exists(
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

create or replace function public.complete_push_notification_delivery(p_outbox_id uuid,p_worker_id text,p_provider_message_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  update public.push_notification_outbox set status='delivered',provider_message_id=nullif(trim(p_provider_message_id),''),
    delivered_at=now(),lease_owner=null,lease_expires_at=null,updated_at=now()
  where id=p_outbox_id and status='processing' and lease_owner=p_worker_id;
  return found;
end;
$$;

create or replace function public.resolve_push_notification_delivery(p_outbox_id uuid,p_worker_id text)
returns table(
  outbox_id uuid,tenant_id uuid,notification_id uuid,device_id uuid,fcm_token text,
  event_type text,category text,severity text,preview_mode text,android_channel text,
  collapse_key text,title text,body text,attempt_count integer
) language plpgsql security definer set search_path=public,pg_temp as $$
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
      and (p.role<>'guardian' or n.student_id is null or exists(
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

create or replace function public.retry_push_notification_delivery(
  p_outbox_id uuid,p_worker_id text,p_failure_category text,p_failure_code text,
  p_available_after timestamptz,p_retry_after_seconds integer default null
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  update public.push_notification_outbox set status=case when attempt_count>=5 then 'failed' else 'retry' end,
    available_after=greatest(coalesce(p_available_after,now()),now()), failure_category=left(p_failure_category,80),
    failure_code=left(p_failure_code,160),provider_retry_after_seconds=p_retry_after_seconds,last_error_at=now(),
    failed_at=case when attempt_count>=5 then now() else null end,lease_owner=null,lease_expires_at=null,updated_at=now()
  where id=p_outbox_id and status='processing' and lease_owner=p_worker_id;
  return found;
end;
$$;

create or replace function public.fail_push_notification_delivery(
  p_outbox_id uuid,p_worker_id text,p_failure_category text,p_failure_code text,p_invalidate_device boolean default false
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
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
$$;

create or replace function public.cancel_push_notification_delivery(p_outbox_id uuid,p_reason text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  update public.push_notification_outbox set status='cancelled',failure_category=left(p_reason,80),cancelled_at=now(),lease_owner=null,lease_expires_at=null
    where id=p_outbox_id and status in('pending','retry','processing'); return found;
end;
$$;

create or replace function public.cleanup_stale_android_push_devices()
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  update public.android_push_devices set status='stale',revoked_at=now() where status='active' and last_seen_at<=now()-interval '90 days';
  get diagnostics v_count=row_count;
  update public.push_notification_outbox o set status='cancelled',cancelled_at=now()
    from public.android_push_devices d where d.id=o.device_id and d.status='stale' and o.status in('pending','retry','processing');
  return v_count;
end;
$$;

create or replace function public.record_notification_delivery_incident(p_tenant_id uuid,p_incident_code text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
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
$$;

revoke all on function public.claim_push_notification_deliveries(text,integer,integer),
  public.complete_push_notification_delivery(uuid,text,text),
  public.resolve_push_notification_delivery(uuid,text),
  public.retry_push_notification_delivery(uuid,text,text,text,timestamptz,integer),
  public.fail_push_notification_delivery(uuid,text,text,text,boolean),
  public.cancel_push_notification_delivery(uuid,text),public.cleanup_stale_android_push_devices(),
  public.record_notification_delivery_incident(uuid,text)
  from public,anon,authenticated;
grant execute on function public.claim_push_notification_deliveries(text,integer,integer),
  public.complete_push_notification_delivery(uuid,text,text),
  public.resolve_push_notification_delivery(uuid,text),
  public.retry_push_notification_delivery(uuid,text,text,text,timestamptz,integer),
  public.fail_push_notification_delivery(uuid,text,text,text,boolean),
  public.cancel_push_notification_delivery(uuid,text),public.cleanup_stale_android_push_devices(),
  public.record_notification_delivery_incident(uuid,text)
  to service_role;

create or replace function public.get_notification_delivery_health_v2()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_tenant uuid:=public.current_tenant_id();
begin
  if auth.uid() is null or not public.is_transportation_write_admin() or v_tenant is null then
    raise exception 'Tenant administrator access required.' using errcode='42501'; end if;
  return jsonb_build_object(
    'email',jsonb_build_object(
      'pending',(select count(*) from public.guardian_notification_outbox where tenant_id=v_tenant and status='pending'),
      'retrying',(select count(*) from public.guardian_notification_outbox where tenant_id=v_tenant and status='retry'),
      'failed',(select count(*) from public.guardian_notification_outbox where tenant_id=v_tenant and status in('failed','dead_lettered')),
      'oldestPendingAt',(select min(created_at) from public.guardian_notification_outbox where tenant_id=v_tenant and status in('pending','retry'))),
    'push',jsonb_build_object(
      'pending',(select count(*) from public.push_notification_outbox where tenant_id=v_tenant and status='pending'),
      'retrying',(select count(*) from public.push_notification_outbox where tenant_id=v_tenant and status='retry'),
      'failed',(select count(*) from public.push_notification_outbox where tenant_id=v_tenant and status='failed'),
      'oldestPendingAt',(select min(created_at) from public.push_notification_outbox where tenant_id=v_tenant and status in('pending','retry')),
      'invalidDevices',(select count(*) from public.android_push_devices where tenant_id=v_tenant and status in('invalid','stale')),
      'recentFailureCategories',coalesce((select jsonb_agg(x) from (select failure_category as category,count(*) as count
        from public.push_notification_outbox where tenant_id=v_tenant and last_error_at>now()-interval '7 days' and failure_category is not null
        group by failure_category order by count(*) desc limit 10)x),'[]'::jsonb)));
end;
$$;
revoke all on function public.get_notification_delivery_health_v2() from public,anon;
grant execute on function public.get_notification_delivery_health_v2() to authenticated;

-- Extend the existing 90-day terminal retention policy without deleting
-- currently-authorized active inbox records early.
create or replace function public.apply_notification_retention(p_dry_run boolean default true)
returns table(email_deleted bigint,inbox_deleted bigint,push_deleted bigint,devices_staled bigint)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_email bigint;v_inbox bigint;v_push bigint;v_devices bigint;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required.' using errcode='42501'; end if;
  if not coalesce(p_dry_run,true) and not exists(select 1 from public.retention_execution_control where id=1 and destructive_enabled) then
    raise exception 'Destructive retention is disabled pending recorded approval.' using errcode='55006';
  end if;
  if coalesce(p_dry_run,true) then
    select count(*) into v_email from public.guardian_notification_outbox where created_at<now()-interval '90 days' and status in('sent','cancelled','failed','dead_lettered');
    select count(*) into v_push from public.push_notification_outbox where created_at<now()-interval '90 days' and status in('delivered','cancelled','failed');
    select count(*) into v_inbox from public.user_notifications where created_at<now()-interval '90 days';
    select count(*) into v_devices from public.android_push_devices where status='active' and last_seen_at<=now()-interval '90 days';
  else
    delete from public.guardian_notification_outbox where created_at<now()-interval '90 days' and status in('sent','cancelled','failed','dead_lettered'); get diagnostics v_email=row_count;
    delete from public.push_notification_outbox where created_at<now()-interval '90 days' and status in('delivered','cancelled','failed'); get diagnostics v_push=row_count;
    delete from public.user_notifications where created_at<now()-interval '90 days'; get diagnostics v_inbox=row_count;
    update public.android_push_devices set status='stale',revoked_at=coalesce(revoked_at,now()) where status='active' and last_seen_at<=now()-interval '90 days'; get diagnostics v_devices=row_count;
    update public.push_notification_outbox o set status='cancelled',cancelled_at=now(),lease_owner=null,lease_expires_at=null
      from public.android_push_devices d where d.id=o.device_id and d.status='stale' and o.status in('pending','retry','processing');
  end if;
  return query select v_email,v_inbox,v_push,v_devices;
end;
$$;
revoke all on function public.apply_notification_retention(boolean) from public,anon,authenticated;
grant execute on function public.apply_notification_retention(boolean) to service_role;

comment on function public.get_user_notifications(integer,timestamptz,uuid,boolean,text) is
  'Cursor-paginated authoritative inbox. Rendering and guardian authorization are resolved at read time.';
comment on function public.claim_push_notification_deliveries(text,integer,integer) is
  'Service-only leased push claim using SKIP LOCKED, tenant quotas, and immediate authorization/consent rechecks.';

-- Machine-readable addition to the reviewed authorization surface. This
-- transaction-local table lets release checks reconcile forward migrations
-- without creating a persistent metadata or browser-readable object.
create temporary table safebus_notification_rpc_allowlist(
  function_name text primary key,
  audience text not null check(audience in('authenticated','service_role'))
) on commit drop;
insert into safebus_notification_rpc_allowlist(function_name,audience) values
  ('apply_notification_retention','service_role'),
  ('archive_user_notifications','authenticated'),
  ('cancel_push_notification_delivery','service_role'),
  ('claim_push_notification_deliveries','service_role'),
  ('cleanup_stale_android_push_devices','service_role'),
  ('complete_push_notification_delivery','service_role'),
  ('fail_push_notification_delivery','service_role'),
  ('get_guardian_notification_preferences_v2','authenticated'),
  ('get_notification_delivery_health_v2','authenticated'),
  ('get_notification_preferences','authenticated'),
  ('get_user_notification_unread_count','authenticated'),
  ('get_user_notifications','authenticated'),
  ('list_own_push_devices','authenticated'),
  ('mark_all_user_notifications_read','authenticated'),
  ('mark_user_notifications_read','authenticated'),
  ('record_notification_delivery_incident','service_role'),
  ('register_android_push_device','authenticated'),
  ('resolve_push_notification_delivery','service_role'),
  ('retry_push_notification_delivery','service_role'),
  ('revoke_own_push_device','authenticated'),
  ('set_guardian_notification_preferences_v2','authenticated'),
  ('set_notification_preferences','authenticated');
