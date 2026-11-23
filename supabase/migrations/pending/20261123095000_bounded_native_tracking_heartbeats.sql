-- Prepared forward-only optimization: keep driver/session authorization,
-- per-device ordering, duplicate safety, coordinates, trip status and RPC ACL.
-- Applies only through reviewed protected release, never via unguarded deploy.
set local lock_timeout = '2s';
set local statement_timeout = '10s';

do $guard$
declare source_text text;
begin
  if to_regprocedure('public.ingest_driver_location_event(text,text,uuid,bigint,timestamptz,double precision,double precision,double precision,double precision,double precision,integer,text)') is null then
    raise exception 'Native GPS ingest is absent.' using errcode='55000';
  end if;
  select p.prosrc into source_text from pg_proc p
    where p.oid='public.ingest_driver_location_event(text,text,uuid,bigint,timestamptz,double precision,double precision,double precision,double precision,double precision,integer,text)'::regprocedure;
  if position('UPDATE public.driver_tracking_devices SET last_seen_at=now() WHERE id=v_device.id' in source_text)=0
     or position('UPDATE public.bus_tracking_sessions SET last_seen_at=now() WHERE id=v_session.id' in source_text)=0
     or position('pg_advisory_xact_lock' in source_text)=0
     or position('driver_tracking_state' in source_text)=0 then
    raise exception 'Native tracking ingest baseline changed; review replacement.'
      using errcode='55000';
  end if;
end;
$guard$;

CREATE OR REPLACE FUNCTION public.ingest_driver_location_event(
  p_tracking_token text,p_device_credential text,p_event_id uuid,p_sequence bigint,
  p_recorded_at timestamptz,p_latitude double precision,p_longitude double precision,
  p_accuracy_m double precision DEFAULT NULL,p_heading_deg double precision DEFAULT NULL,
  p_speed_mps double precision DEFAULT NULL,p_battery_percent integer DEFAULT NULL,
  p_connectivity text DEFAULT 'unknown')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,safebus_private,auth,extensions,realtime,pg_temp
AS $function$
DECLARE
  v_session public.bus_tracking_sessions;
  v_device public.driver_tracking_devices;
  v_trip public.driver_trips;
  v_state safebus_private.driver_tracking_state;
  v_previous public.driver_trip_current_locations;
  v_hash bytea;
  v_cutoff timestamptz;
  v_stopped boolean;
  v_distance double precision;
  v_elapsed double precision;
BEGIN
  IF auth.uid() IS NULL OR public.is_current_user_session_active() IS NOT TRUE
    OR safebus_private.current_user_role() IS DISTINCT FROM 'driver' THEN
    RAISE EXCEPTION 'Only an authenticated driver can report bus location.' USING ERRCODE='42501';
  END IF;
  IF safebus_private.has_completed_optional_mfa() IS NOT TRUE THEN
    RAISE EXCEPTION 'MFA required for this enrolled account.' USING ERRCODE='42501';
  END IF;
  IF p_tracking_token IS NULL OR p_tracking_token !~ '^sbus_track_v1_[A-Za-z0-9_-]{40,80}$'
    OR p_device_credential IS NULL OR p_device_credential !~ '^sbus_device_v1_[A-Za-z0-9_-]{40,80}$'
    OR p_event_id IS NULL OR p_sequence IS NULL OR p_sequence<1 THEN
    RAISE EXCEPTION 'Tracking event credentials are not valid.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_device FROM public.driver_tracking_devices
    WHERE credential_hash=safebus_private.hash_driver_device_credential(p_device_credential) AND status='active';
  IF NOT FOUND OR v_device.tenant_id IS DISTINCT FROM safebus_private.current_tenant_id()
    OR v_device.driver_id IS DISTINCT FROM safebus_private.current_driver_id()
    OR v_device.profile_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Tracking device is not valid for this driver.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_session FROM public.bus_tracking_sessions
    WHERE session_token_hash=safebus_private.hash_bus_tracking_token(p_tracking_token)
      AND device_id=v_device.id AND status IN ('active','ended')
      AND expires_at>now()-interval '24 hours' FOR UPDATE;
  IF NOT FOUND OR v_session.tenant_id IS DISTINCT FROM v_device.tenant_id
    OR v_session.driver_id IS DISTINCT FROM v_device.driver_id THEN
    RAISE EXCEPTION 'Tracking session is not valid for this device.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_trip FROM public.driver_trips WHERE id=v_session.driver_trip_id
    AND tenant_id=v_session.tenant_id AND driver_id=v_session.driver_id AND bus_id=v_session.bus_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tracking trip is not valid.' USING ERRCODE='42501'; END IF;
  v_stopped:=v_session.status<>'active' OR v_session.expires_at<=now() OR v_trip.status<>'active';

  -- Uniqueness + row lock serialize even two different sessions bound to one device.
  INSERT INTO safebus_private.driver_tracking_state(device_id) VALUES(v_device.id) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT v_state FROM safebus_private.driver_tracking_state WHERE device_id=v_device.id FOR UPDATE;
  v_hash:=sha256(convert_to(jsonb_build_array(v_trip.id,p_event_id,p_sequence,extract(epoch FROM p_recorded_at),
    p_latitude,p_longitude,p_accuracy_m,p_heading_deg,p_speed_mps,p_battery_percent,p_connectivity)::text,'UTF8'));
  IF p_sequence=v_state.last_sequence THEN
    IF v_state.last_trip_id IS DISTINCT FROM v_trip.id OR v_state.last_event_id IS DISTINCT FROM p_event_id
      OR v_state.payload_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'Tracking event identity has already been used.' USING ERRCODE='42501';
    END IF;
    RETURN jsonb_build_object('accepted',true,'duplicate',true,'stopTracking',v_stopped,
      'tripState',v_trip.status,'recordedAt',v_state.recorded_at,'nextPingInMs',3000);
  END IF;
  IF p_sequence<v_state.last_sequence THEN
    RETURN jsonb_build_object('accepted',false,'duplicate',false,'stopTracking',v_stopped,
      'tripState',v_trip.status,'rejectionReason','out_of_order');
  END IF;
  IF p_event_id=v_state.last_event_id THEN
    RAISE EXCEPTION 'Tracking event identity has already been used.' USING ERRCODE='42501';
  END IF;
  IF v_trip.status NOT IN ('active','paused','completed','cancelled') THEN
    RETURN jsonb_build_object('accepted',false,'duplicate',false,'stopTracking',true,
      'tripState',v_trip.status,'rejectionReason','trip_not_active');
  END IF;
  v_cutoff:=CASE WHEN v_trip.status IN ('completed','cancelled') THEN v_trip.ended_at
    WHEN v_trip.status='paused' THEN v_trip.updated_at ELSE now() END;
  IF p_recorded_at IS NULL OR p_recorded_at<v_session.started_at-interval '2 minutes'
    OR p_recorded_at<now()-interval '24 hours' OR p_recorded_at>now()+interval '2 minutes'
    OR p_recorded_at>v_session.expires_at
    OR (v_session.status='ended' AND (v_session.ended_at IS NULL OR p_recorded_at>v_session.ended_at))
    OR p_recorded_at>v_cutoff+interval '30 seconds' THEN
    RETURN jsonb_build_object('accepted',false,'duplicate',false,'stopTracking',v_stopped,
      'tripState',v_trip.status,'rejectionReason','stale_fix');
  END IF;
  IF p_latitude IS NULL OR p_longitude IS NULL OR p_latitude NOT BETWEEN -90 AND 90
    OR p_longitude NOT BETWEEN -180 AND 180
    OR (p_accuracy_m IS NOT NULL AND (p_accuracy_m<0 OR p_accuracy_m>250))
    OR (p_heading_deg IS NOT NULL AND p_heading_deg NOT BETWEEN 0 AND 360)
    OR (p_speed_mps IS NOT NULL AND (p_speed_mps<0 OR p_speed_mps>80))
    OR (p_battery_percent IS NOT NULL AND p_battery_percent NOT BETWEEN 0 AND 100)
    OR p_connectivity IS NULL OR p_connectivity NOT IN ('wifi','cellular','offline','unknown') THEN
    RETURN jsonb_build_object('accepted',false,'duplicate',false,'stopTracking',v_stopped,
      'tripState',v_trip.status,'rejectionReason','invalid_fix');
  END IF;
  -- Device changes and delayed uploads from a retired session must not reset
  -- movement validation. Serialize first fixes as well as updates for this trip.
  PERFORM pg_advisory_xact_lock(hashtextextended('safebus-live-trip:'||v_trip.id::text,0));
  SELECT * INTO v_previous FROM public.driver_trip_current_locations
    WHERE driver_trip_id=v_trip.id FOR UPDATE;
  IF FOUND THEN
    IF p_recorded_at<=v_previous.recorded_at THEN
      RETURN jsonb_build_object('accepted',false,'duplicate',false,'stopTracking',v_stopped,
        'tripState',v_trip.status,'rejectionReason','out_of_order');
    END IF;
    IF v_previous.latitude IS NOT NULL THEN
      v_elapsed:=extract(epoch FROM p_recorded_at-v_previous.recorded_at);
      v_distance:=6371000*2*asin(least(1.0,sqrt(
        power(sin(radians(p_latitude-v_previous.latitude)/2),2)
        +cos(radians(v_previous.latitude))*cos(radians(p_latitude))
        *power(sin(radians(p_longitude-v_previous.longitude)/2),2))));
      IF v_distance>greatest(500.0,coalesce(p_accuracy_m,0)+coalesce(v_previous.accuracy_m,0))
        AND v_distance/greatest(v_elapsed,0.001)>70 THEN
        RETURN jsonb_build_object('accepted',false,'duplicate',false,'stopTracking',v_stopped,
          'tripState',v_trip.status,'rejectionReason','impossible_jump');
      END IF;
    END IF;
  END IF;

  UPDATE safebus_private.driver_tracking_state SET last_sequence=p_sequence,last_event_id=p_event_id,
    last_trip_id=v_trip.id,recorded_at=p_recorded_at,payload_hash=v_hash
  WHERE device_id=v_device.id;

  -- Backlog from stopped sessions is acknowledged, never published as a live bus.
  IF NOT v_stopped THEN
    INSERT INTO public.driver_trip_current_locations(driver_trip_id,tenant_id,driver_id,bus_id,route_id,
      latitude,longitude,accuracy_m,heading_deg,speed_mps,source,recorded_at,updated_at)
    VALUES(v_trip.id,v_trip.tenant_id,v_trip.driver_id,v_trip.bus_id,v_trip.route_id,
      p_latitude,p_longitude,p_accuracy_m,p_heading_deg,p_speed_mps,'android_native',p_recorded_at,now())
    ON CONFLICT(driver_trip_id) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,
      accuracy_m=excluded.accuracy_m,heading_deg=excluded.heading_deg,speed_mps=excluded.speed_mps,
      source=excluded.source,recorded_at=excluded.recorded_at,updated_at=now()
    WHERE driver_trip_current_locations.recorded_at<excluded.recorded_at;
  END IF;
  -- Heartbeat fields are not the authoritative live position. Preserve their
  -- freshness at a bounded cadence rather than writing two extra rows per GPS fix.
  -- For a three-second GPS stream, reduce up to 20 updates per 30-second window.
  UPDATE public.driver_tracking_devices SET last_seen_at=now()
    WHERE id=v_device.id AND (last_seen_at IS NULL OR last_seen_at<now()-interval '30 seconds');
  UPDATE public.bus_tracking_sessions SET last_seen_at=now()
    WHERE id=v_session.id AND (last_seen_at IS NULL OR last_seen_at<now()-interval '30 seconds');
  RETURN jsonb_build_object('accepted',true,'duplicate',false,'stopTracking',v_stopped,
    'tripState',v_trip.status,'recordedAt',p_recorded_at,'nextPingInMs',3000);
END $function$;
