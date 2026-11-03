-- Pending forward correction. Install only through the protected operational workflow.
-- No data repairs, job changes, policy changes, external sends or migration replay.
DO $guard$
declare f record;
begin
  for f in select * from (values
    ('public.is_current_user_session_active()', '25e1e83b5d4dd9fa4b56a0ce37a53386'),
    ('safebus_private.has_completed_optional_mfa()', 'f2169c0652e9c6b9284c1b366f38611d'),
    ('public.bind_driver_tracking_device(text,uuid,text)', 'c7598236b9a5360c9675fc1762d60501'),
    ('public.end_driver_trip(uuid)', 'f5dd81be59a2cbc661c1c1c7a1971341'),
    ('public.ingest_driver_location_event(text,text,uuid,bigint,timestamp with time zone,double precision,double precision,double precision,double precision,double precision,integer,text)', '398c3dc6a9556a498b04458110104925'),
    ('public.pause_driver_trip(uuid)', 'd050fd4fd9112115a36a6eff50fc3ca1'),
    ('public.register_android_byod_tracking_device(uuid,text,text,text)', '26dd37678a2bc3110aff1192bb0ce675'),
    ('public.revoke_driver_tracking_devices(uuid)', '0aa847706bd4898ae2d00ce8c19ccfd6'),
    ('public.start_bus_tracking_from_qr(text,uuid)', 'a796796af9f49f1b5b517d1ad0af9077')
  ) as reviewed(signature, expected_md5) loop
    if coalesce(md5(replace(pg_get_functiondef(to_regprocedure(f.signature)),chr(13),'')), '') <> f.expected_md5 then
      raise exception 'Tracking queue dependency differs from reviewed hosted definition: %', f.signature;
    end if;
  end loop;
  if to_regprocedure('public.authorize_driver_tracking_queue(text,text)') is not null then
    raise exception 'Tracking queue authorization already exists; reconcile its definition before rollout.';
  end if;
end;
$guard$;

CREATE OR REPLACE FUNCTION public.start_bus_tracking_from_qr(p_qr_token text, p_bus_route_assignment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare
  v_tenant_id uuid := safebus_private.current_tenant_id();
  v_driver_id uuid := safebus_private.current_driver_id();
  v_hash text;
  v_credential public.bus_qr_credentials;
  v_bus public.buses;
  v_assignment public.bus_route_assignments;
  v_pattern public.route_trip_patterns;
  v_trip public.driver_trips;
  v_existing_trip public.driver_trips;
  v_session_token text;
  v_session_hash text;
begin
  if auth.uid() is null or safebus_private.current_user_role() <> 'driver'
    or v_tenant_id is null or v_driver_id is null then
    raise exception 'Only an active driver can scan a bus.' using errcode = '42501';
  end if;
  if p_qr_token is null or p_qr_token !~ '^sbus_bus_v1_[A-Za-z0-9_-]{40,80}$'
    or p_bus_route_assignment_id is null then
    raise exception 'Bus QR and route choice could not be verified.' using errcode = '22023';
  end if;

  perform 1 from public.drivers d
  where d.id = v_driver_id and d.tenant_id = v_tenant_id and d.status = 'active'
  for update;
  if not found then
    raise exception 'An active driver identity is required.' using errcode = '42501';
  end if;

  v_hash := safebus_private.hash_bus_tracking_token(p_qr_token);
  select c.* into v_credential
  from public.bus_qr_credentials c
  where c.token_hash = v_hash and c.status = 'active'
  for update;
  if not found or v_credential.tenant_id <> v_tenant_id then
    raise exception 'Bus QR could not be verified.' using errcode = 'P0002';
  end if;

  select b.* into v_bus
  from public.buses b
  where b.id = v_credential.bus_id and b.tenant_id = v_tenant_id and b.status = 'active'
  for update;
  if not found then
    raise exception 'This bus is not active.' using errcode = '55006';
  end if;

  select bra.* into v_assignment
  from public.bus_route_assignments bra
  join public.routes r
    on r.id = bra.route_id and r.tenant_id = bra.tenant_id
    and r.status = 'active' and r.definition_status = 'ready'
  join public.route_trip_patterns rtp
    on rtp.id = bra.route_trip_pattern_id and rtp.route_id = bra.route_id
    and rtp.tenant_id = bra.tenant_id and rtp.status = 'active'
    and not rtp.schedule_review_required
  where bra.id = p_bus_route_assignment_id
    and bra.bus_id = v_bus.id
    and bra.tenant_id = v_tenant_id
  for update of bra;
  if not found then
    raise exception 'The selected route direction is not assigned to this bus.' using errcode = 'P0002';
  end if;

  select rtp.* into v_pattern
  from public.route_trip_patterns rtp
  where rtp.id = v_assignment.route_trip_pattern_id
    and rtp.tenant_id = v_tenant_id;

  select dt.* into v_existing_trip
  from public.driver_trips dt
  where dt.driver_id = v_driver_id and dt.tenant_id = v_tenant_id and dt.status = 'active'
  for update;

  if found then
    if v_existing_trip.bus_id <> v_bus.id then
      raise exception 'End your active trip before scanning another bus.' using errcode = '55006';
    end if;
    if v_existing_trip.route_id <> v_assignment.route_id
      or v_existing_trip.route_trip_pattern_id <> v_assignment.route_trip_pattern_id then
      raise exception 'The active bus run direction cannot be changed while resuming.'
        using errcode = '55006';
    end if;
    v_trip := v_existing_trip;
  else
    PERFORM 1 FROM public.routes WHERE id=v_assignment.route_id AND tenant_id=v_tenant_id FOR SHARE;
    IF NOT safebus_private.route_operates_on(v_assignment.route_id,v_tenant_id,safebus_private.route_calendar_today()) THEN
     RAISE EXCEPTION 'This route is closed for new trips today.' USING ERRCODE='55006';
    END IF;
    if v_assignment.status <> 'active'
      or (v_assignment.effective_from is not null and v_assignment.effective_from > safebus_private.route_calendar_today())
      or (v_assignment.effective_to is not null and v_assignment.effective_to < safebus_private.route_calendar_today()) then
      raise exception 'The selected route direction is not active today.' using errcode = '55006';
    end if;
    if exists (
      select 1 from public.driver_trips dt
      where dt.bus_id = v_bus.id and dt.tenant_id = v_tenant_id and dt.status = 'active'
    ) then
      raise exception 'This bus already has an active trip.' using errcode = '55006';
    end if;

    begin
      insert into public.driver_trips (
        tenant_id, driver_id, bus_id, route_id, route_trip_pattern_id,
        driver_route_assignment_id, route_shape_id, bus_number_snapshot,
        trip_name_snapshot, trip_type, status, service_date, started_at
      ) values (
        v_tenant_id, v_driver_id, v_bus.id, v_assignment.route_id,
        v_assignment.route_trip_pattern_id, null,
        safebus_private.current_route_shape_id_for_route(v_assignment.route_id, v_tenant_id),
        v_bus.bus_number, v_pattern.display_name,
        case when v_pattern.direction = 'reverse' then 'evening' else 'morning' end,
        'active', safebus_private.route_calendar_today(), now()
      ) returning * into v_trip;
    exception when unique_violation then
      raise exception 'This driver or bus already has an active trip.' using errcode = '55006';
    end;
  end if;

  update public.bus_tracking_sessions
  set status = 'ended', ended_at = now()
  where status = 'active'
    and (driver_trip_id = v_trip.id or driver_id = v_driver_id or bus_id = v_bus.id);

  loop
    v_session_token := safebus_private.create_bus_tracking_session_token();
    v_session_hash := safebus_private.hash_bus_tracking_token(v_session_token);
    exit when not exists (
      select 1 from public.bus_tracking_sessions where session_token_hash = v_session_hash
    );
  end loop;

  insert into public.bus_tracking_sessions (
    tenant_id, driver_trip_id, driver_id, bus_id, bus_qr_credential_id,
    session_token_hash
  ) values (
    v_tenant_id, v_trip.id, v_driver_id, v_bus.id, v_credential.id,
    v_session_hash
  );

  return jsonb_build_object(
    'trip', to_jsonb(v_trip),
    'trackingToken', v_session_token,
    'busNumber', v_bus.bus_number,
    'resumed', v_existing_trip.id is not null
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.ingest_driver_location_event(p_tracking_token text, p_device_credential text, p_event_id uuid, p_sequence bigint, p_recorded_at timestamp with time zone, p_latitude double precision, p_longitude double precision, p_accuracy_m double precision DEFAULT NULL::double precision, p_heading_deg double precision DEFAULT NULL::double precision, p_speed_mps double precision DEFAULT NULL::double precision, p_battery_percent integer DEFAULT NULL::integer, p_connectivity text DEFAULT 'unknown'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
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
  v_session_stopped boolean;
begin
  if auth.uid() is null or safebus_private.current_user_role() <> 'driver' then
    raise exception 'Only an authenticated driver can report bus location.' using errcode = '42501';
  end if;
  if p_tracking_token is null or p_tracking_token !~ '^sbus_track_v1_[A-Za-z0-9_-]{40,80}$'
    or p_device_credential is null or p_device_credential !~ '^sbus_device_v1_[A-Za-z0-9_-]{40,80}$'
    or p_event_id is null or p_sequence is null or p_sequence < 1 then
    raise exception 'Tracking event credentials are not valid.' using errcode = '42501';
  end if;

  select d.* into v_device
  from public.driver_tracking_devices d
  where d.credential_hash = safebus_private.hash_driver_device_credential(p_device_credential)
    and d.status = 'active';
  if not found
    or v_device.tenant_id is distinct from safebus_private.current_tenant_id()
    or v_device.driver_id is distinct from safebus_private.current_driver_id()
    or v_device.profile_id is distinct from auth.uid() then
    raise exception 'Tracking device is not valid for this driver.' using errcode = '42501';
  end if;

  select s.* into v_session
  from public.bus_tracking_sessions s
  where s.session_token_hash = safebus_private.hash_bus_tracking_token(p_tracking_token)
    and s.device_id = v_device.id
    and s.status in ('active', 'ended')
    and s.expires_at > now() - interval '24 hours'
  for update;
  if not found
    or v_session.tenant_id is distinct from v_device.tenant_id
    or v_session.driver_id is distinct from v_device.driver_id then
    raise exception 'Tracking session is not valid for this device.' using errcode = '42501';
  end if;

  v_session_stopped := v_session.status <> 'active' or v_session.expires_at <= now();

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
      'stopTracking', v_session_stopped or coalesce(v_duplicate_trip_status, 'invalid') <> 'active',
      'tripState', coalesce(v_duplicate_trip_status, 'invalid'),
      'recordedAt', v_duplicate.recorded_at, 'nextPingInMs', 3000
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
    or p_recorded_at > v_session.expires_at
    or (v_session.status = 'ended' and
        (v_session.ended_at is null or p_recorded_at > v_session.ended_at))
    or p_recorded_at > v_cutoff + interval '30 seconds' then
    return jsonb_build_object('accepted', false, 'duplicate', false,
      'stopTracking', v_session_stopped or v_trip.status <> 'active', 'tripState', v_trip.status,
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
      'stopTracking', v_session_stopped or v_trip.status <> 'active', 'tripState', v_trip.status,
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
        'stopTracking', v_session_stopped or v_trip.status <> 'active', 'tripState', v_trip.status,
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
        'stopTracking', v_session_stopped or v_trip.status <> 'active', 'tripState', v_trip.status,
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

  v_next_ms := 3000;
  return jsonb_build_object(
    'accepted', true, 'duplicate', false,
    'stopTracking', v_session_stopped or v_trip.status <> 'active',
    'tripState', v_trip.status,
    'recordedAt', p_recorded_at,
    'nextPingInMs', v_next_ms
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.authorize_driver_tracking_queue(p_tracking_token text, p_device_credential text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_device public.driver_tracking_devices;
begin
  if auth.uid() is null or public.is_current_user_session_active() is not true
    or safebus_private.current_user_role() is distinct from 'driver' then
    raise exception 'An active driver session is required.' using errcode = '42501';
  end if;
  if safebus_private.has_completed_optional_mfa() is not true then
    raise exception 'MFA required for this enrolled account.' using errcode = '42501';
  end if;
  if p_device_credential is null or p_device_credential !~ '^sbus_device_v1_[A-Za-z0-9_-]{40,80}$' then
    raise exception 'Tracking device credentials are not valid.' using errcode = '42501';
  end if;
  select d.* into v_device
  from public.driver_tracking_devices d
  where d.credential_hash = safebus_private.hash_driver_device_credential(p_device_credential)
    and d.status = 'active';
  if not found
    or v_device.profile_id is distinct from auth.uid()
    or v_device.driver_id is distinct from safebus_private.current_driver_id()
    or v_device.tenant_id is distinct from safebus_private.current_tenant_id() then
    raise exception 'Tracking device is not valid for this driver.' using errcode = '42501';
  end if;
  -- A denied old session reveals no owner, trip, bus or location metadata.
  return jsonb_build_object('protocolVersion', 1, 'authorized',
    p_tracking_token is not null and
    p_tracking_token ~ '^sbus_track_v1_[A-Za-z0-9_-]{40,80}$' and exists (
      select 1 from public.bus_tracking_sessions s
      join public.driver_trips t on t.id = s.driver_trip_id
        and t.tenant_id = s.tenant_id and t.driver_id = s.driver_id and t.bus_id = s.bus_id
      where s.session_token_hash = safebus_private.hash_bus_tracking_token(p_tracking_token)
        and s.device_id = v_device.id
        and s.driver_id = v_device.driver_id and s.tenant_id = v_device.tenant_id
        and s.status in ('active', 'ended')
        and (s.status = 'active' or s.ended_at is not null)
        and s.expires_at > now() - interval '24 hours'
        and t.status in ('active', 'paused', 'completed', 'cancelled')
    ));
end;
$function$;
REVOKE ALL ON FUNCTION public.authorize_driver_tracking_queue(text,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.authorize_driver_tracking_queue(text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
