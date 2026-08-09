-- SafeBus Alberta - Phase 7 production Android driver tracking
--
-- Adds a device-bound, ordered, idempotent ingestion path for the native
-- Android foreground service. Browser callers retain the existing QR-session
-- RPC, but cannot use this path without a registered device credential.

create table public.driver_tracking_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  installation_id uuid not null,
  credential_hash text not null,
  platform text not null,
  ownership text not null,
  device_model text,
  app_version text not null,
  status text not null default 'active',
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  constraint driver_tracking_devices_platform_check check (platform = 'android'),
  constraint driver_tracking_devices_ownership_check check (ownership = 'company_owned'),
  constraint driver_tracking_devices_status_check check (status in ('active', 'revoked')),
  constraint driver_tracking_devices_status_dates_check check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  ),
  constraint driver_tracking_devices_installation_unique unique (installation_id),
  constraint driver_tracking_devices_credential_unique unique (credential_hash)
);

create index driver_tracking_devices_driver_status_idx
  on public.driver_tracking_devices(tenant_id, driver_id, status);

alter table public.driver_tracking_devices enable row level security;
revoke all on public.driver_tracking_devices from public, anon, authenticated;

alter table public.bus_tracking_sessions
  add column device_id uuid references public.driver_tracking_devices(id) on delete restrict;

create index bus_tracking_sessions_device_status_idx
  on public.bus_tracking_sessions(device_id, status);

alter table public.driver_trip_location_updates
  add column tracking_event_id uuid,
  add column tracking_device_id uuid references public.driver_tracking_devices(id) on delete restrict,
  add column device_sequence bigint,
  add column battery_percent smallint,
  add column connectivity text;

alter table public.driver_trip_location_updates
  drop constraint if exists driver_trip_location_updates_source_check;
alter table public.driver_trip_location_updates
  add constraint driver_trip_location_updates_source_check
  check (source in ('browser', 'manual', 'bus_qr', 'android_native'));
alter table public.driver_trip_location_updates
  add constraint driver_trip_location_updates_battery_check
  check (battery_percent is null or battery_percent between 0 and 100);
alter table public.driver_trip_location_updates
  add constraint driver_trip_location_updates_connectivity_check
  check (connectivity is null or connectivity in ('wifi', 'cellular', 'offline', 'unknown'));

create unique index driver_trip_location_updates_tracking_event_unique
  on public.driver_trip_location_updates(tracking_event_id)
  where tracking_event_id is not null;
create unique index driver_trip_location_updates_device_sequence_unique
  on public.driver_trip_location_updates(tracking_device_id, device_sequence)
  where tracking_device_id is not null and device_sequence is not null;

alter table public.driver_trip_current_locations
  drop constraint if exists driver_trip_current_locations_source_check;
alter table public.driver_trip_current_locations
  add constraint driver_trip_current_locations_source_check
  check (source in ('browser', 'manual', 'bus_qr', 'android_native'));

-- Once a QR session is device-bound, the legacy browser RPC may no longer
-- insert for it. This closes the alternate path around event ids, sequencing,
-- device credentials, client timestamps, and impossible-jump validation while
-- retaining the legacy web path for sessions that were never native-bound.
create or replace function public.enforce_native_ingestion_for_bound_session()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.source = 'bus_qr' and exists (
    select 1 from public.bus_tracking_sessions s
    where s.driver_trip_id = new.driver_trip_id
      and s.driver_id = new.driver_id
      and s.bus_id = new.bus_id
      and s.device_id is not null
      and s.status = 'active'
  ) then
    raise exception 'Device-bound tracking sessions must use native ingestion.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger enforce_native_ingestion_for_bound_session
  before insert on public.driver_trip_location_updates
  for each row execute function public.enforce_native_ingestion_for_bound_session();

revoke all on function public.enforce_native_ingestion_for_bound_session()
  from public, anon, authenticated;

create or replace function public.hash_driver_device_credential(p_token text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select encode(digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
$$;

create or replace function public.create_driver_device_credential()
returns text
language sql
volatile
set search_path = public, extensions, pg_temp
as $$
  select 'sbus_device_v1_' || translate(replace(encode(gen_random_bytes(32), 'base64'), '=', ''), '+/', '-_')
$$;

create or replace function public.register_android_tracking_device(
  p_installation_id uuid,
  p_device_model text,
  p_app_version text,
  p_ownership text default 'company_owned'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_driver_id uuid := public.current_driver_id();
  v_device public.driver_tracking_devices;
  v_credential text;
  v_hash text;
  v_existing boolean := false;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver'
    or v_tenant_id is null or v_driver_id is null then
    raise exception 'Only an active driver can register a tracking device.' using errcode = '42501';
  end if;
  if p_installation_id is null or p_ownership <> 'company_owned' then
    raise exception 'Phase 7 tracking requires a company-owned Android device.' using errcode = '42501';
  end if;
  if p_app_version is null or char_length(trim(p_app_version)) not between 1 and 40
    or p_device_model is not null and char_length(p_device_model) > 120 then
    raise exception 'Invalid tracking device metadata.' using errcode = '22023';
  end if;

  select d.* into v_device
  from public.driver_tracking_devices d
  where d.installation_id = p_installation_id
  for update;
  v_existing := found;

  if v_existing and (
    v_device.tenant_id is distinct from v_tenant_id
    or v_device.driver_id is distinct from v_driver_id
    or v_device.profile_id is distinct from auth.uid()
  ) then
    raise exception 'This device is registered to another driver.' using errcode = '42501';
  end if;

  loop
    v_credential := public.create_driver_device_credential();
    v_hash := public.hash_driver_device_credential(v_credential);
    exit when not exists (
      select 1 from public.driver_tracking_devices where credential_hash = v_hash
    );
  end loop;

  if v_existing then
    update public.driver_tracking_devices
    set credential_hash = v_hash,
        platform = 'android',
        ownership = 'company_owned',
        device_model = nullif(trim(p_device_model), ''),
        app_version = trim(p_app_version),
        status = 'active',
        revoked_at = null,
        registered_at = now()
    where id = v_device.id
    returning * into v_device;
  else
    insert into public.driver_tracking_devices(
      tenant_id, driver_id, profile_id, installation_id, credential_hash,
      platform, ownership, device_model, app_version
    ) values (
      v_tenant_id, v_driver_id, auth.uid(), p_installation_id, v_hash,
      'android', 'company_owned', nullif(trim(p_device_model), ''), trim(p_app_version)
    ) returning * into v_device;
  end if;

  return jsonb_build_object(
    'deviceId', v_device.id,
    'installationId', v_device.installation_id,
    'deviceCredential', v_credential
  );
end;
$$;

create or replace function public.bind_driver_tracking_device(
  p_tracking_token text,
  p_installation_id uuid,
  p_device_credential text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.bus_tracking_sessions;
  v_device public.driver_tracking_devices;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver' then
    raise exception 'Only an active driver can bind a tracking device.' using errcode = '42501';
  end if;
  if p_tracking_token is null or p_tracking_token !~ '^sbus_track_v1_[A-Za-z0-9_-]{40,80}$'
    or p_device_credential is null or p_device_credential !~ '^sbus_device_v1_[A-Za-z0-9_-]{40,80}$' then
    raise exception 'Tracking credentials are not valid.' using errcode = '42501';
  end if;

  select d.* into v_device
  from public.driver_tracking_devices d
  where d.installation_id = p_installation_id
    and d.credential_hash = public.hash_driver_device_credential(p_device_credential)
    and d.status = 'active';
  if not found
    or v_device.tenant_id is distinct from public.current_tenant_id()
    or v_device.driver_id is distinct from public.current_driver_id()
    or v_device.profile_id is distinct from auth.uid() then
    raise exception 'Tracking device is not valid for this driver.' using errcode = '42501';
  end if;

  select s.* into v_session
  from public.bus_tracking_sessions s
  where s.session_token_hash = public.hash_bus_tracking_token(p_tracking_token)
    and s.status = 'active'
  for update;
  if not found
    or v_session.tenant_id is distinct from v_device.tenant_id
    or v_session.driver_id is distinct from v_device.driver_id
    or v_session.expires_at <= now()
    or v_session.device_id is not null and v_session.device_id is distinct from v_device.id then
    raise exception 'Tracking session is not valid for this device.' using errcode = '42501';
  end if;

  update public.bus_tracking_sessions set device_id = v_device.id where id = v_session.id;
  return true;
end;
$$;

create or replace function public.ingest_driver_location_event(
  p_tracking_token text,
  p_device_credential text,
  p_event_id uuid,
  p_sequence bigint,
  p_recorded_at timestamptz,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision default null,
  p_heading_deg double precision default null,
  p_speed_mps double precision default null,
  p_battery_percent integer default null,
  p_connectivity text default 'unknown'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.bus_tracking_sessions;
  v_device public.driver_tracking_devices;
  v_trip public.driver_trips;
  v_previous public.driver_trip_location_updates;
  v_current public.driver_trip_current_locations;
  v_duplicate public.driver_trip_location_updates;
  v_distance_m double precision;
  v_elapsed_s double precision;
  v_implied_speed_mps double precision;
  v_cutoff timestamptz;
  v_next_ms integer;
  v_duplicate_trip_status text;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver' then
    raise exception 'Only an authenticated driver can report bus location.' using errcode = '42501';
  end if;
  if p_tracking_token is null or p_tracking_token !~ '^sbus_track_v1_[A-Za-z0-9_-]{40,80}$'
    or p_device_credential is null or p_device_credential !~ '^sbus_device_v1_[A-Za-z0-9_-]{40,80}$'
    or p_event_id is null or p_sequence is null or p_sequence < 1 then
    raise exception 'Tracking event credentials are not valid.' using errcode = '42501';
  end if;

  select d.* into v_device
  from public.driver_tracking_devices d
  where d.credential_hash = public.hash_driver_device_credential(p_device_credential)
    and d.status = 'active';
  if not found
    or v_device.tenant_id is distinct from public.current_tenant_id()
    or v_device.driver_id is distinct from public.current_driver_id()
    or v_device.profile_id is distinct from auth.uid() then
    raise exception 'Tracking device is not valid for this driver.' using errcode = '42501';
  end if;

  select s.* into v_session
  from public.bus_tracking_sessions s
  where s.session_token_hash = public.hash_bus_tracking_token(p_tracking_token)
    and s.device_id = v_device.id
    and s.status in ('active', 'ended')
    and s.expires_at > now() - interval '24 hours'
  for update;
  if not found
    or v_session.tenant_id is distinct from v_device.tenant_id
    or v_session.driver_id is distinct from v_device.driver_id then
    raise exception 'Tracking session is not valid for this device.' using errcode = '42501';
  end if;

  select u.* into v_duplicate
  from public.driver_trip_location_updates u
  where u.tracking_event_id = p_event_id
     or (u.tracking_device_id = v_device.id and u.device_sequence = p_sequence)
  limit 1;
  if found then
    if v_duplicate.driver_trip_id is distinct from v_session.driver_trip_id then
      raise exception 'Tracking event identity has already been used.' using errcode = '42501';
    end if;
    select t.status into v_duplicate_trip_status
    from public.driver_trips t where t.id = v_duplicate.driver_trip_id;
    return jsonb_build_object(
      'accepted', true, 'duplicate', true,
      'stopTracking', coalesce(v_duplicate_trip_status, 'invalid') <> 'active',
      'tripState', coalesce(v_duplicate_trip_status, 'invalid'),
      'recordedAt', v_duplicate.recorded_at, 'nextPingInMs', 30000
    );
  end if;

  select t.* into v_trip from public.driver_trips t
  where t.id = v_session.driver_trip_id
    and t.tenant_id = v_session.tenant_id
    and t.driver_id = v_session.driver_id
    and t.bus_id = v_session.bus_id;
  if not found then
    raise exception 'Tracking trip is not valid.' using errcode = '42501';
  end if;

  v_cutoff := case
    when v_trip.status in ('completed', 'cancelled') then v_trip.ended_at
    when v_trip.status = 'paused' then v_trip.updated_at
    else now()
  end;
  if v_trip.status not in ('active', 'paused', 'completed', 'cancelled') then
    return jsonb_build_object('accepted', false, 'duplicate', false,
      'stopTracking', true, 'tripState', v_trip.status,
      'rejectionReason', 'trip_not_active');
  end if;
  if p_recorded_at is null
    or p_recorded_at < v_session.started_at - interval '2 minutes'
    or p_recorded_at < now() - interval '24 hours'
    or p_recorded_at > now() + interval '2 minutes'
    or p_recorded_at > v_cutoff + interval '30 seconds' then
    return jsonb_build_object('accepted', false, 'duplicate', false,
      'stopTracking', v_trip.status <> 'active', 'tripState', v_trip.status,
      'rejectionReason', 'stale_fix');
  end if;
  if p_latitude is null or p_longitude is null
    or p_latitude <> p_latitude or p_longitude <> p_longitude
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
    or p_accuracy_m is not null and (p_accuracy_m <> p_accuracy_m or p_accuracy_m < 0 or p_accuracy_m > 250)
    or p_heading_deg is not null and (p_heading_deg <> p_heading_deg or p_heading_deg not between 0 and 360)
    or p_speed_mps is not null and (p_speed_mps <> p_speed_mps or p_speed_mps < 0 or p_speed_mps > 80)
    or p_battery_percent is not null and p_battery_percent not between 0 and 100
    or p_connectivity not in ('wifi', 'cellular', 'offline', 'unknown') then
    return jsonb_build_object('accepted', false, 'duplicate', false,
      'stopTracking', false, 'tripState', v_trip.status,
      'rejectionReason', 'invalid_fix');
  end if;

  select u.* into v_previous
  from public.driver_trip_location_updates u
  where u.tracking_device_id = v_device.id
    and u.driver_trip_id = v_trip.id
  order by u.device_sequence desc
  limit 1;
  if found then
    if p_sequence <= v_previous.device_sequence or p_recorded_at <= v_previous.recorded_at then
      return jsonb_build_object('accepted', false, 'duplicate', false,
        'stopTracking', false, 'tripState', v_trip.status,
        'rejectionReason', 'out_of_order');
    end if;
    v_elapsed_s := extract(epoch from (p_recorded_at - v_previous.recorded_at));
    v_distance_m := 6371000 * 2 * asin(sqrt(
      power(sin(radians(p_latitude - v_previous.latitude) / 2), 2)
      + cos(radians(v_previous.latitude)) * cos(radians(p_latitude))
      * power(sin(radians(p_longitude - v_previous.longitude) / 2), 2)
    ));
    v_implied_speed_mps := v_distance_m / greatest(v_elapsed_s, 0.001);
    if v_distance_m > greatest(500.0, coalesce(p_accuracy_m, 0) + coalesce(v_previous.accuracy_m, 0))
      and v_implied_speed_mps > 70 then
      return jsonb_build_object('accepted', false, 'duplicate', false,
        'stopTracking', false, 'tripState', v_trip.status,
        'rejectionReason', 'impossible_jump');
    end if;
  end if;

  insert into public.driver_trip_location_updates(
    tenant_id, driver_trip_id, driver_id, bus_id, route_id,
    latitude, longitude, accuracy_m, heading_deg, speed_mps, source, recorded_at,
    tracking_event_id, tracking_device_id, device_sequence, battery_percent, connectivity
  ) values (
    v_trip.tenant_id, v_trip.id, v_trip.driver_id, v_trip.bus_id, v_trip.route_id,
    p_latitude, p_longitude, p_accuracy_m, p_heading_deg, p_speed_mps,
    'android_native', p_recorded_at, p_event_id, v_device.id, p_sequence,
    p_battery_percent, p_connectivity
  );

  insert into public.driver_trip_current_locations(
    driver_trip_id, tenant_id, driver_id, bus_id, route_id,
    latitude, longitude, accuracy_m, heading_deg, speed_mps,
    source, recorded_at, updated_at
  ) values (
    v_trip.id, v_trip.tenant_id, v_trip.driver_id, v_trip.bus_id, v_trip.route_id,
    p_latitude, p_longitude, p_accuracy_m, p_heading_deg, p_speed_mps,
    'android_native', p_recorded_at, now()
  ) on conflict (driver_trip_id) do update set
    latitude = excluded.latitude, longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m, heading_deg = excluded.heading_deg,
    speed_mps = excluded.speed_mps, source = excluded.source,
    recorded_at = excluded.recorded_at, updated_at = now()
  where driver_trip_current_locations.recorded_at < excluded.recorded_at
  returning * into v_current;

  update public.driver_tracking_devices set last_seen_at = now() where id = v_device.id;
  update public.bus_tracking_sessions set last_seen_at = now() where id = v_session.id;

  v_next_ms := case
    when coalesce(p_battery_percent, 100) <= 10 then 120000
    when coalesce(p_battery_percent, 100) <= 20 then 60000
    when coalesce(p_speed_mps, 0) >= 2 then 5000
    else 30000
  end;
  return jsonb_build_object(
    'accepted', true, 'duplicate', false,
    'stopTracking', v_trip.status <> 'active',
    'tripState', v_trip.status,
    'recordedAt', p_recorded_at,
    'nextPingInMs', v_next_ms
  );
end;
$$;

revoke all on function public.hash_driver_device_credential(text) from public, anon, authenticated;
revoke all on function public.create_driver_device_credential() from public, anon, authenticated;
revoke all on function public.register_android_tracking_device(uuid, text, text, text) from public, anon;
revoke all on function public.bind_driver_tracking_device(text, uuid, text) from public, anon;
revoke all on function public.ingest_driver_location_event(
  text, text, uuid, bigint, timestamptz, double precision, double precision,
  double precision, double precision, double precision, integer, text
) from public, anon;

grant execute on function public.register_android_tracking_device(uuid, text, text, text) to authenticated;
grant execute on function public.bind_driver_tracking_device(text, uuid, text) to authenticated;
grant execute on function public.ingest_driver_location_event(
  text, text, uuid, bigint, timestamptz, double precision, double precision,
  double precision, double precision, double precision, integer, text
) to authenticated;

comment on table public.driver_tracking_devices is
  'Company-owned Android installations authorized for native driver trip tracking. Raw device credentials are never stored.';
comment on function public.ingest_driver_location_event(
  text, text, uuid, bigint, timestamptz, double precision, double precision,
  double precision, double precision, double precision, integer, text
) is
  'Device- and QR-session-bound ordered GPS ingestion. Derives driver, trip, bus, route, and tenant server-side; rejects forged, duplicate, stale, inaccurate, and physically impossible events.';
