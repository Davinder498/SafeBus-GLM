-- Forward-only removal of continuous GPS history. Protected release + verified recovery required.
-- Existing operational records and their preservation rules are not removed.
-- Serialize with legacy session writers before locking/removing their history relation.
LOCK TABLE public.bus_tracking_sessions IN EXCLUSIVE MODE;
LOCK TABLE public.driver_trip_location_updates IN ACCESS EXCLUSIVE MODE;
SELECT pg_advisory_xact_lock(864203711);

DO $guard$
DECLARE f record;
BEGIN
  FOR f IN SELECT * FROM (VALUES
    ('public.ingest_driver_location_event(text,text,uuid,bigint,timestamp with time zone,double precision,double precision,double precision,double precision,double precision,integer,text)', 'c2f8f6b1d08b713a684f4aaacd46b12c'),
    ('public.manage_retention_case(text,jsonb)', '1dcb26152c4d9c260c29fc82cd5daacd'),
    ('public.retention_archive_work(text,jsonb)', '6fc64a7e4098fb1cf63ac67f5960a99b'),
    ('public.run_all_retention_deletions(boolean)', 'e26a4ace8e91669ea0fc0fd86c6f7c9e'),
    ('public.run_retention_lifecycle(boolean,integer)', '58f9951d70f648cb808d12b8e80fabb5'),
    ('safebus_private.disposal_allowed(text,jsonb)', '3c754bcaaffe7699265e3ef39e6f14cd'),
    ('safebus_private.disposal_relation(text)', '6405433dfb53a2d48acc1f68632d331d'),
    ('safebus_private.retention_source_guard()', '399d85d692e8b282a68e100bc4b8b730'),
    ('safebus_private.run_retention_deletion(text,boolean)', 'e58413d6721792746d4133c8067d1729'),
    ('public.update_bus_tracking_location(text,double precision,double precision,double precision,double precision,double precision)', 'c3c22b770373e9381191df3946162ca1')
,
    ('public.manage_disposal(text,jsonb)', '40783fc402d6eba281211effdbe66bab'),
    ('safebus_private.guard_new_tenant_operations()', '3e87d289b46252346347571ec381fe17')
  ) reviewed(signature, expected_md5) LOOP
    IF coalesce(md5(replace(pg_get_functiondef(to_regprocedure(f.signature)),chr(13),'')),'') <> f.expected_md5 THEN
      RAISE EXCEPTION 'Live-only tracking dependency differs from reviewed hosted definition: %', f.signature;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM safebus_private.retention_cases WHERE released_at IS NULL)
    OR EXISTS(SELECT 1 FROM safebus_private.disposal_holds WHERE policy_key='gps' AND released_at IS NULL)
    OR EXISTS(SELECT 1 FROM safebus_private.retention_archive_chunks)
    OR EXISTS(SELECT 1 FROM safebus_private.retention_archive_coverage)
    OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='retention-evidence') THEN
    RAISE EXCEPTION 'GPS preservation or archive evidence requires separate reconciliation before removal' USING ERRCODE='55006';
  END IF;
  IF (SELECT count(*) FROM (SELECT 1 FROM public.driver_trip_location_updates LIMIT 100001) bounded)>100000 THEN
    RAISE EXCEPTION 'GPS history removal exceeds the reviewed 100000-row recovery bound' USING ERRCODE='55006';
  END IF;
  IF to_regclass('safebus_private.driver_tracking_state') IS NOT NULL THEN
    RAISE EXCEPTION 'Tracking state already exists; reconcile before rollout';
  END IF;
END $guard$;

-- Exactly one mutable cursor per device. No per-fix receipt or coordinate ledger.
-- Coordinates stay only in the expiring live-position table.
CREATE TABLE safebus_private.driver_tracking_state (
  device_id uuid PRIMARY KEY REFERENCES public.driver_tracking_devices(id) ON DELETE CASCADE,
  last_sequence bigint NOT NULL DEFAULT 0 CHECK(last_sequence>=0),
  last_event_id uuid,
  last_trip_id uuid,
  recorded_at timestamptz,
  payload_hash bytea,
  CHECK((last_sequence=0 AND last_event_id IS NULL) OR
    (last_sequence>0 AND last_event_id IS NOT NULL AND last_trip_id IS NOT NULL AND recorded_at IS NOT NULL AND payload_hash IS NOT NULL))
);
ALTER TABLE safebus_private.driver_tracking_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.driver_tracking_state FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the last accepted device identity at cutover, never all prior samples.
INSERT INTO safebus_private.driver_tracking_state(
  device_id,last_sequence,last_event_id,last_trip_id,recorded_at,payload_hash)
SELECT d.id,u.device_sequence,u.tracking_event_id,u.driver_trip_id,u.recorded_at,
  sha256(convert_to(jsonb_build_array(u.driver_trip_id,u.tracking_event_id,u.device_sequence,
    extract(epoch FROM u.recorded_at),u.latitude,u.longitude,u.accuracy_m,u.heading_deg,
    u.speed_mps,u.battery_percent,u.connectivity)::text,'UTF8'))
FROM public.driver_tracking_devices d
CROSS JOIN LATERAL (
  SELECT h.* FROM public.driver_trip_location_updates h
  WHERE h.tracking_device_id=d.id AND h.device_sequence IS NOT NULL AND h.tracking_event_id IS NOT NULL
  ORDER BY h.device_sequence DESC LIMIT 1
) u;

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
  UPDATE public.driver_tracking_devices SET last_seen_at=now() WHERE id=v_device.id;
  UPDATE public.bus_tracking_sessions SET last_seen_at=now() WHERE id=v_session.id;
  RETURN jsonb_build_object('accepted',true,'duplicate',false,'stopTracking',v_stopped,
    'tripState',v_trip.status,'recordedAt',p_recorded_at,'nextPingInMs',3000);
END $function$;
REVOKE ALL ON FUNCTION public.ingest_driver_location_event(text,text,uuid,bigint,timestamptz,double precision,double precision,double precision,double precision,double precision,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ingest_driver_location_event(text,text,uuid,bigint,timestamptz,double precision,double precision,double precision,double precision,double precision,integer,text) TO authenticated,service_role;

-- Transient location state expiry is independent of operational/legal record disposal approval.
CREATE FUNCTION safebus_private.expire_driver_tracking_positions() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $function$
BEGIN
  DELETE FROM public.driver_trip_current_locations WHERE driver_trip_id IN
    (SELECT driver_trip_id FROM public.driver_trip_current_locations WHERE recorded_at<now()-interval '24 hours' LIMIT 1000 FOR UPDATE SKIP LOCKED);
END $function$;
REVOKE ALL ON FUNCTION safebus_private.expire_driver_tracking_positions() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION safebus_private.guard_new_tenant_operations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'pg_temp'
AS $function$
declare v_tenant uuid;
begin
  -- Expiring a transient live point must not depend on an authority's contract state.
  -- RLS and DELETE grants still apply; all fresh points and other operations keep their gate.
  if tg_op='DELETE' and tg_table_schema='public' and tg_table_name='driver_trip_current_locations' then
    if (to_jsonb(old)->>'recorded_at')::timestamptz < now()-interval '24 hours' then
      return old;
    end if;
  end if;
  v_tenant:=case when tg_op='DELETE' then old.tenant_id else new.tenant_id end;
  if not public.district_agreement_billing_allowed(v_tenant) then
    raise exception 'Accept the SafeBus MSA and DPA before creating transportation data.'
      using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_bus_tracking_location(p_tracking_token text, p_latitude double precision, p_longitude double precision, p_accuracy_m double precision DEFAULT NULL::double precision, p_heading_deg double precision DEFAULT NULL::double precision, p_speed_mps double precision DEFAULT NULL::double precision)
 RETURNS driver_trip_current_locations
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare
  v_hash text;
  v_session public.bus_tracking_sessions;
  v_trip public.driver_trips;
  v_current public.driver_trip_current_locations;
begin
  if auth.uid() is null or safebus_private.current_user_role() <> 'driver' then
    raise exception 'Only an active driver can update bus location.' using errcode = '42501';
  end if;
  if p_tracking_token is null or p_tracking_token !~ '^sbus_track_v1_[A-Za-z0-9_-]{40,80}$' then
    raise exception 'Tracking session is not valid.' using errcode = '42501';
  end if;
  if p_latitude is null or p_longitude is null
    or p_latitude <> p_latitude or p_longitude <> p_longitude
    or p_latitude < -90 or p_latitude > 90
    or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Invalid coordinates.' using errcode = '22023';
  end if;
  if p_accuracy_m is not null and (p_accuracy_m <> p_accuracy_m or p_accuracy_m < 0) then
    raise exception 'Invalid location accuracy.' using errcode = '22023';
  end if;
  if p_heading_deg is not null
    and (p_heading_deg <> p_heading_deg or p_heading_deg < 0 or p_heading_deg > 360) then
    raise exception 'Invalid heading.' using errcode = '22023';
  end if;
  if p_speed_mps is not null and (p_speed_mps <> p_speed_mps or p_speed_mps < 0) then
    raise exception 'Invalid speed.' using errcode = '22023';
  end if;

  v_hash := safebus_private.hash_bus_tracking_token(p_tracking_token);
  select s.* into v_session
  from public.bus_tracking_sessions s
  where s.session_token_hash = v_hash and s.status = 'active'
  for update;
  if not found
    or v_session.tenant_id is distinct from safebus_private.current_tenant_id()
    or v_session.driver_id is distinct from safebus_private.current_driver_id()
    or v_session.expires_at <= now() then
    raise exception 'Tracking session is not valid.' using errcode = '42501';
  end if;

  -- This check formerly lived on the removed history table's INSERT trigger.
  if exists (select 1 from public.bus_tracking_sessions s
    where s.driver_trip_id=v_session.driver_trip_id and s.driver_id=v_session.driver_id
      and s.bus_id=v_session.bus_id and s.device_id is not null and s.status='active') then
    raise exception 'Device-bound tracking sessions must use native ingestion.' using errcode='42501';
  end if;

  select dt.* into v_trip
  from public.driver_trips dt
  where dt.id = v_session.driver_trip_id
    and dt.tenant_id = v_session.tenant_id
    and dt.driver_id = v_session.driver_id
    and dt.bus_id = v_session.bus_id
    and dt.status = 'active'
  for update;
  if not found then
    raise exception 'Tracking session is no longer active.' using errcode = '55006';
  end if;

  insert into public.driver_trip_current_locations(
    driver_trip_id, tenant_id, driver_id, bus_id, route_id,
    latitude, longitude, accuracy_m, heading_deg, speed_mps,
    source, recorded_at, updated_at
  ) values (
    v_trip.id, v_trip.tenant_id, v_trip.driver_id, v_trip.bus_id, v_trip.route_id,
    p_latitude, p_longitude, p_accuracy_m, p_heading_deg, p_speed_mps,
    'bus_qr', now(), now()
  )
  on conflict (driver_trip_id) do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m,
    heading_deg = excluded.heading_deg,
    speed_mps = excluded.speed_mps,
    source = excluded.source,
    recorded_at = excluded.recorded_at,
    updated_at = now()
  returning * into v_current;

  update public.bus_tracking_sessions
  set last_seen_at = v_current.recorded_at
  where id = v_session.id;

  return v_current;
end;
$function$;

CREATE OR REPLACE FUNCTION public.manage_retention_case(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_tenant uuid; v_trip public.driver_trips%ROWTYPE; v_case safebus_private.retention_cases%ROWTYPE;
  v_min timestamptz; v_used timestamptz; v_now timestamptz:=now(); v_result jsonb;
BEGIN
  v_tenant:=safebus_private.retention_authority(p_action NOT IN ('list','announcements'));
  IF p_action='list' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC,c.id),'[]') INTO v_result FROM
      (SELECT id,driver_trip_id,window_start,window_end,reason,reference,minimum_until,review_at,
        created_at,reviewed_at,released_at,
        -- Retirement marker keeps cached clients' operational preservation usable.
        0::bigint AS verified_chunks
       FROM safebus_private.retention_cases h WHERE tenant_id=v_tenant
         AND (p_data->>'tripId' IS NULL OR driver_trip_id=(p_data->>'tripId')::uuid)
         AND (p_data->>'before' IS NULL OR (created_at,id)<((p_data->>'before')::timestamptz,(p_data->>'beforeId')::uuid))
       ORDER BY created_at DESC,id DESC LIMIT 50) c;
    RETURN v_result;
  END IF;
  IF p_action='announcements' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC,a.id DESC),'[]') INTO v_result FROM (
      SELECT id,title,created_at,resolved_at FROM safebus_private.authority_announcements
      WHERE tenant_id=v_tenant AND (p_data->>'before' IS NULL OR (created_at,id)<((p_data->>'before')::timestamptz,(p_data->>'beforeId')::uuid))
      ORDER BY created_at DESC,id DESC LIMIT 50) a;
    RETURN v_result;
  END IF;
  -- All source triggers take the shared counterpart before evaluating expiry.
  PERFORM pg_advisory_xact_lock(864203711);
  IF p_action='create' THEN
    SELECT * INTO v_trip FROM public.driver_trips WHERE id=(p_data->>'tripId')::uuid AND tenant_id=v_tenant;
    IF NOT FOUND THEN RAISE EXCEPTION 'Trip unavailable' USING ERRCODE='42501'; END IF;
    v_used:=nullif(p_data->>'decisionUsedAt','')::timestamptz;
    IF v_used>v_now THEN RAISE EXCEPTION 'Decision use cannot be in the future' USING ERRCODE='22023'; END IF;
    v_min:=greatest(v_now,(p_data->>'minimumUntil')::timestamptz,
      ((v_used AT TIME ZONE 'America/Edmonton')+interval '1 year') AT TIME ZONE 'America/Edmonton');
    INSERT INTO safebus_private.retention_cases(tenant_id,driver_trip_id,window_start,window_end,reason,reference,
      decision_used_at,minimum_until,review_at,created_by)
    VALUES(v_tenant,v_trip.id,coalesce((p_data->>'windowStart')::timestamptz,v_trip.started_at),
      coalesce((p_data->>'windowEnd')::timestamptz,v_trip.ended_at,v_now),p_data->>'reason',p_data->>'reference',
      v_used,v_min,(p_data->>'reviewAt')::timestamptz,auth.uid()) RETURNING * INTO v_case;
    IF v_case.review_at<=v_now OR v_case.window_start<v_trip.started_at OR v_case.window_end>coalesce(v_trip.ended_at,v_now)
      OR (v_case.reason='decision' AND v_used IS NULL) THEN
      RAISE EXCEPTION 'Review time, window or decision use invalid' USING ERRCODE='22023';
    END IF;
  ELSIF p_action IN ('review','release') THEN
    SELECT * INTO v_case FROM safebus_private.retention_cases WHERE id=(p_data->>'id')::uuid AND tenant_id=v_tenant FOR UPDATE;
    IF NOT FOUND OR v_case.released_at IS NOT NULL THEN RAISE EXCEPTION 'Active preservation unavailable' USING ERRCODE='42501'; END IF;
    IF p_action='release' THEN
      IF v_case.minimum_until>v_now OR p_data->>'confirm' IS DISTINCT FROM 'release' THEN
        RAISE EXCEPTION 'Minimum retention or confirmation required' USING ERRCODE='22023'; END IF;
      UPDATE safebus_private.retention_cases SET released_at=v_now,released_by=auth.uid() WHERE id=v_case.id RETURNING * INTO v_case;
    ELSE
      v_used:=coalesce(nullif(p_data->>'decisionUsedAt','')::timestamptz,v_case.decision_used_at);
      IF v_used>v_now OR (p_data->>'reviewAt')::timestamptz<=v_now THEN
        RAISE EXCEPTION 'Review time or decision use invalid' USING ERRCODE='22023'; END IF;
      UPDATE safebus_private.retention_cases SET reviewed_at=v_now,review_at=(p_data->>'reviewAt')::timestamptz,
        decision_used_at=v_used,minimum_until=greatest(minimum_until,(p_data->>'minimumUntil')::timestamptz,
        ((v_used AT TIME ZONE 'America/Edmonton')+interval '1 year') AT TIME ZONE 'America/Edmonton')
      WHERE id=v_case.id RETURNING * INTO v_case;
    END IF;
  ELSIF p_action='resolve_announcement' THEN
    UPDATE safebus_private.authority_announcements SET resolved_at=coalesce(resolved_at,v_now)
      WHERE id=(p_data->>'id')::uuid AND tenant_id=v_tenant;
    IF NOT FOUND THEN RAISE EXCEPTION 'Announcement unavailable' USING ERRCODE='42501'; END IF;
    PERFORM safebus_private.write_audit_event_legacy('security.config_changed','authority_announcement',(p_data->>'id')::uuid,
      NULL,'success',jsonb_build_object('tenant_id',v_tenant,'operation',p_action),NULL);
    RETURN jsonb_build_object('resolved',true);
  ELSE RAISE EXCEPTION 'Unknown preservation action' USING ERRCODE='22023';
  END IF;
  -- Identifier-only audit; no case reference, narrative, GPS or child identity.
  PERFORM safebus_private.write_audit_event_legacy('security.config_changed','retention_case',v_case.id,
    NULL,'success',jsonb_build_object('tenant_id',v_tenant,'operation',p_action),NULL);
  RETURN jsonb_build_object('id',v_case.id,'minimumUntil',v_case.minimum_until,'releasedAt',v_case.released_at);
END $function$;

CREATE OR REPLACE FUNCTION safebus_private.disposal_relation(p_key text)
 RETURNS regclass
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT CASE p_key
 WHEN 'invitations' THEN 'public.tenant_onboarding_invitations'
 WHEN 'student_records' THEN 'public.students'
 WHEN 'guardian_relationships' THEN 'public.student_guardians'
 WHEN 'driver_records' THEN 'public.drivers'
 WHEN 'guardian_records' THEN 'public.guardians'
 WHEN 'bus_tracking_sessions' THEN 'public.bus_tracking_sessions'
 WHEN 'bus_run_dispatches' THEN 'public.bus_run_dispatches'
 WHEN 'trip_records' THEN 'public.driver_trips'
 WHEN 'audit_records' THEN 'public.audit_events'
 WHEN 'rate_limit_buckets' THEN 'public.rate_limit_buckets'
 WHEN 'user_sessions' THEN 'public.user_sessions'
 WHEN 'accounts' THEN 'public.profiles'
 WHEN 'student_events' THEN 'public.student_trip_events'
 WHEN 'exceptions' THEN 'public.trip_exceptions'
 WHEN 'statuses' THEN 'public.trip_operational_statuses'
 WHEN 'announcements' THEN 'safebus_private.authority_announcements'
 WHEN 'email' THEN 'public.guardian_notification_outbox'
 WHEN 'push' THEN 'public.push_notification_outbox'
 WHEN 'inbox' THEN 'public.user_notifications'
 WHEN 'audience_failures' THEN 'safebus_private.notification_audience_queue'
 WHEN 'push_devices' THEN 'public.android_push_devices' END::regclass
$function$;

CREATE OR REPLACE FUNCTION safebus_private.disposal_allowed(p_key text, p_row jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_id uuid:=(p_row->>'id')::uuid; v_tenant uuid:=(p_row->>'tenant_id')::uuid;
 v_trip uuid:=(p_row->>'driver_trip_id')::uuid; v_student uuid:=(p_row->>'student_id')::uuid;
 v_floor timestamptz; v_days integer; v_status text:=p_row->>'status'; v_table regclass;
BEGIN
 v_table:=safebus_private.disposal_relation(p_key);
 IF v_table IS NULL OR safebus_private.disposal_held(p_key,v_id) THEN RETURN false; END IF;
 IF p_key='trip_records' THEN v_trip:=v_id; END IF;
 IF v_trip IS NOT NULL AND (safebus_private.disposal_held('trip_records',v_trip) OR safebus_private.retention_trip_held(v_trip)) THEN RETURN false; END IF;
 IF v_student IS NOT NULL AND safebus_private.disposal_held('student_records',v_student) THEN RETURN false; END IF;
 IF p_key='guardian_relationships' AND safebus_private.disposal_held('guardian_records',(p_row->>'guardian_id')::uuid) THEN RETURN false; END IF;
 IF v_tenant IS NULL AND v_trip IS NOT NULL THEN SELECT tenant_id INTO v_tenant FROM public.driver_trips WHERE id=v_trip; END IF;
 v_floor:=greatest((p_row->>'created_at')::timestamptz,(p_row->>'updated_at')::timestamptz);
 v_days:=CASE WHEN p_key IN ('invitations','user_sessions','email','push','inbox','audience_failures','push_devices') THEN 90
 WHEN p_key IN ('bus_tracking_sessions') THEN 30 WHEN p_key='rate_limit_buckets' THEN 2
 WHEN p_key='audit_records' THEN 730 ELSE 395 END;
 CASE p_key
 WHEN 'invitations' THEN
  IF v_status NOT IN ('activated','cancelled','failed','expired','revoked') AND coalesce((p_row->>'expires_at')::timestamptz, 'infinity'::timestamptz)>=now() THEN RETURN false; END IF;
  v_floor:=greatest(v_floor,(p_row->>'expires_at')::timestamptz,(p_row->>'delivered_at')::timestamptz,(p_row->>'last_sent_at')::timestamptz);
  IF p_row->>'delivery_status' IN ('pending','processing','sending','queued') THEN RETURN false; END IF;
 WHEN 'student_records' THEN
  IF v_status NOT IN ('inactive','transferred','archived') OR NOT safebus_private.disposal_children_clear(v_table,v_id,ARRAY['public.student_route_assignments','public.student_bus_assignments','public.student_qr_credentials']) THEN RETURN false; END IF;
 WHEN 'guardian_relationships' THEN
  IF v_status NOT IN ('inactive','archived') AND NOT EXISTS(SELECT 1 FROM public.students s WHERE s.id=v_student AND s.status IN ('inactive','transferred','archived') AND s.updated_at<now()-interval '395 days') THEN RETURN false; END IF;
 WHEN 'driver_records','guardian_records' THEN
  IF safebus_private.disposal_held('accounts',(p_row->>'profile_id')::uuid) THEN RETURN false; END IF;
  IF v_status NOT IN ('inactive','suspended','archived','disabled') THEN RETURN false; END IF;
  IF NOT safebus_private.disposal_children_clear(v_table,v_id,CASE WHEN p_key='driver_records' THEN ARRAY['public.driver_route_assignments','public.driver_tracking_devices'] ELSE ARRAY[]::text[] END) THEN RETURN false; END IF;
 WHEN 'bus_tracking_sessions' THEN
  IF v_status NOT IN ('ended','revoked') THEN RETURN false; END IF;
  v_floor:=greatest(v_floor,(p_row->>'ended_at')::timestamptz,(p_row->>'expires_at')::timestamptz,(p_row->>'last_seen_at')::timestamptz);
 WHEN 'bus_run_dispatches' THEN
  IF v_status NOT IN ('completed','cancelled') THEN RETURN false; END IF;
  v_floor:=greatest(v_floor,(p_row->>'completed_at')::timestamptz,(p_row->>'cancelled_at')::timestamptz,(p_row->>'prepared_at')::timestamptz,(p_row->>'claimed_at')::timestamptz);
 WHEN 'trip_records' THEN
  IF v_status NOT IN ('completed','cancelled') OR p_row->>'ended_at' IS NULL OR NOT safebus_private.disposal_children_clear(v_table,v_id,ARRAY['public.driver_trip_current_locations','public.pre_trip_confirmations']) THEN RETURN false; END IF;
  v_floor:=greatest(v_floor,(p_row->>'ended_at')::timestamptz);
 WHEN 'accounts' THEN RETURN v_status='disabled' AND p_row->>'role' IN ('driver','guardian') AND safebus_private.disposal_children_clear('public.profiles',v_id,ARRAY['public.user_notification_settings','public.user_notification_category_preferences']) AND EXISTS(SELECT 1 FROM safebus_private.disposal_accounts WHERE profile_id=v_id AND state='deleting');
 WHEN 'audit_records' THEN
  IF safebus_private.disposal_held('accounts',(p_row->>'actor_profile_id')::uuid) THEN RETURN false; END IF;
  v_floor:=(p_row->>'created_at')::timestamptz;
 WHEN 'rate_limit_buckets' THEN v_floor:=(p_row->>'window_start')::timestamptz;
 WHEN 'user_sessions' THEN
  IF EXISTS(SELECT 1 FROM auth.sessions a WHERE a.id=v_id) THEN RETURN false; END IF;
  v_floor:=greatest((p_row->>'revoked_at')::timestamptz,(p_row->>'last_active_at')::timestamptz);
 WHEN 'student_events','exceptions','statuses' THEN
  SELECT greatest(v_floor,ended_at,(p_row->>'set_at')::timestamptz) INTO v_floor FROM public.driver_trips WHERE id=v_trip AND ended_at IS NOT NULL;
 WHEN 'announcements' THEN
  IF p_row->>'resolved_at' IS NULL THEN RETURN false; END IF;
  v_floor:=greatest(v_floor,(p_row->>'resolved_at')::timestamptz);
 WHEN 'email','push' THEN
  IF v_status NOT IN ('delivered','sent','failed','cancelled','dead_lettered') THEN RETURN false; END IF;
  v_floor:=greatest(v_floor,(p_row->>'delivered_at')::timestamptz,(p_row->>'failed_at')::timestamptz,(p_row->>'cancelled_at')::timestamptz,(p_row->>'dead_lettered_at')::timestamptz);
 WHEN 'inbox' THEN NULL;
 WHEN 'audience_failures' THEN
  IF p_row->>'failed_at' IS NULL THEN RETURN false; END IF;
  v_floor:=greatest((p_row->>'failed_at')::timestamptz,(p_row->>'occurred_at')::timestamptz);
 WHEN 'push_devices' THEN
  IF v_status NOT IN ('active','revoked','invalid','stale') OR safebus_private.disposal_held('accounts',(p_row->>'profile_id')::uuid)
   OR NOT safebus_private.disposal_children_clear(v_table,v_id) THEN RETURN false; END IF;
  v_floor:=greatest(v_floor,(p_row->>'last_seen_at')::timestamptz,(p_row->>'last_registered_at')::timestamptz,
   (p_row->>'revoked_at')::timestamptz,(p_row->>'invalidated_at')::timestamptz);
 ELSE RETURN false;
 END CASE;
 SELECT greatest(v_days,minimum_days) INTO v_days FROM (SELECT coalesce((SELECT minimum_days FROM safebus_private.disposal_extensions WHERE tenant_id=v_tenant AND policy_key=p_key),v_days) minimum_days) x;
 RETURN coalesce(v_floor<now()-make_interval(days=>v_days),false);
END $function$;

CREATE OR REPLACE FUNCTION public.manage_disposal(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_tenant uuid; v_platform boolean:=false; v_limited boolean:=false; v_row jsonb; v_result jsonb; v_key text:=p_data->>'policy';
 v_id uuid; v_hold safebus_private.disposal_holds%ROWTYPE; v_used timestamptz; v_min timestamptz; v_days integer;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR NOT coalesce(public.is_current_user_session_active(),false) THEN RAISE EXCEPTION 'Active session required' USING ERRCODE='42501'; END IF;
 SELECT role='platform_super_admin' INTO v_platform FROM public.profiles WHERE id=auth.uid() AND status='active';
 IF v_platform THEN
  PERFORM safebus_private.enforce_mfa_if_required();
  IF p_action<>'status' THEN RAISE EXCEPTION 'Aggregate operations only' USING ERRCODE='42501'; END IF;
 ELSE v_tenant:=safebus_private.retention_authority(p_action NOT IN ('status','holds','candidates'));
 SELECT role='transportation_admin' INTO v_limited FROM public.profiles WHERE id=auth.uid(); END IF;
 IF p_action='status' THEN
  RETURN jsonb_build_object('enabled',(SELECT destructive_enabled FROM public.retention_execution_control WHERE id=1),
   'lastRun',(SELECT max(completed_at) FROM safebus_private.disposal_runs WHERE v_platform OR tenant_id=v_tenant),
   'activeHolds',(SELECT count(*) FROM safebus_private.disposal_holds WHERE released_at IS NULL AND (v_platform OR tenant_id=v_tenant)),
   'pendingAccounts',(SELECT count(*) FROM safebus_private.disposal_accounts WHERE state<>'completed' AND (v_platform OR tenant_id=v_tenant)),
   'reviewDue',(SELECT count(*) FROM safebus_private.disposal_holds WHERE released_at IS NULL AND review_at<now() AND (v_platform OR tenant_id=v_tenant)),
   'totals',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM (SELECT policy_key,sum(affected_rows) AS disposed FROM safebus_private.disposal_runs WHERE (v_platform OR tenant_id=v_tenant) AND window_start>now()-interval '30 days' GROUP BY policy_key ORDER BY policy_key) r),
   'extensions',(SELECT coalesce(jsonb_agg(jsonb_build_object('policy',policy_key,'days',minimum_days)),'[]') FROM safebus_private.disposal_extensions WHERE tenant_id=v_tenant));
 END IF;
 IF p_action='holds' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC,h.id DESC),'[]') INTO v_result FROM
   (SELECT id,policy_key,record_id,reference,minimum_until,review_at,released_at,created_at FROM safebus_private.disposal_holds WHERE tenant_id=v_tenant AND (NOT v_limited OR policy_key IN ('trip_records','bus_run_dispatches','bus_tracking_sessions','announcements'))
     AND (p_data->>'before' IS NULL OR (created_at,id)<((p_data->>'before')::timestamptz,(p_data->>'beforeId')::uuid)) ORDER BY created_at DESC,id DESC LIMIT 50) h;
  RETURN v_result;
 END IF;
 PERFORM pg_advisory_xact_lock(864203711);
 IF v_limited AND (v_key IS NOT NULL AND v_key NOT IN ('trip_records','bus_run_dispatches','bus_tracking_sessions','announcements')) THEN RAISE EXCEPTION 'Record class not available' USING ERRCODE='42501'; END IF;
 IF p_action IN ('review','release') THEN
  SELECT * INTO v_hold FROM safebus_private.disposal_holds WHERE id=(p_data->>'id')::uuid AND tenant_id=v_tenant AND released_at IS NULL AND (NOT v_limited OR policy_key IN ('trip_records','bus_run_dispatches','bus_tracking_sessions','announcements')) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preservation unavailable' USING ERRCODE='42501'; END IF;
  IF p_action='release' THEN
   IF v_hold.minimum_until>now() OR p_data->>'confirm' IS DISTINCT FROM 'release' THEN RAISE EXCEPTION 'Minimum or confirmation' USING ERRCODE='22023'; END IF;
   UPDATE safebus_private.disposal_holds SET released_at=now(),released_by=auth.uid() WHERE id=v_hold.id;
  ELSE
   IF (p_data->>'reviewAt')::timestamptz<=now() OR p_data->>'reviewAt' IS NULL THEN RAISE EXCEPTION 'Review date required' USING ERRCODE='22023'; END IF;
   v_used:=(p_data->>'decisionUsedAt')::timestamptz;
   IF v_used>now() THEN RAISE EXCEPTION 'Future decision' USING ERRCODE='22023'; END IF;
   UPDATE safebus_private.disposal_holds SET review_at=(p_data->>'reviewAt')::timestamptz,
    minimum_until=greatest(minimum_until,(p_data->>'minimumUntil')::timestamptz,((v_used AT TIME ZONE 'America/Edmonton')+interval '1 year') AT TIME ZONE 'America/Edmonton') WHERE id=v_hold.id;
  END IF;
  v_id:=v_hold.id;
 ELSE
  IF safebus_private.disposal_relation(v_key) IS NULL OR v_key IN ('audit_records','rate_limit_buckets','user_sessions','push_devices','audience_failures') THEN RAISE EXCEPTION 'Policy not available to authority' USING ERRCODE='42501'; END IF;
  IF p_action='candidates' THEN
   EXECUTE format('SELECT coalesce(jsonb_agg(r),''[]'') FROM (SELECT s.id, coalesce(to_jsonb(s)->>''full_name'',nullif(concat_ws('' '',to_jsonb(s)->>''first_name'',to_jsonb(s)->>''last_name''),''''),to_jsonb(s)->>''title'',to_jsonb(s)->>''trip_name_snapshot'',to_jsonb(s)->>''status'',''Record'') AS label, to_jsonb(s)->>''status'' AS status FROM %s s WHERE s.tenant_id=$1 AND ($2::uuid IS NULL OR s.id>$2) ORDER BY s.id LIMIT 50) r',safebus_private.disposal_relation(v_key)) INTO v_result USING v_tenant,(p_data->>'afterId')::uuid;
   RETURN v_result;
  ELSIF p_action='extend' THEN
   v_days:=(p_data->>'days')::integer;
   IF v_days NOT BETWEEN 395 AND 3650 OR v_key IN ('email','push','inbox') THEN RAISE EXCEPTION 'Use scoped preservation for short-lived data' USING ERRCODE='22023'; END IF;
   INSERT INTO safebus_private.disposal_extensions(tenant_id,policy_key,minimum_days,reference,updated_by) VALUES(v_tenant,v_key,v_days,p_data->>'reference',auth.uid())
   ON CONFLICT(tenant_id,policy_key) DO UPDATE SET minimum_days=greatest(disposal_extensions.minimum_days,excluded.minimum_days),reference=excluded.reference,updated_at=now(),updated_by=auth.uid();
  ELSE
   v_id:=(p_data->>'recordId')::uuid;
   EXECUTE format('SELECT to_jsonb(s) FROM %s s WHERE id=$1',safebus_private.disposal_relation(v_key)) INTO v_row USING v_id;
   IF v_row IS NULL OR (v_row->>'tenant_id')::uuid IS DISTINCT FROM v_tenant THEN RAISE EXCEPTION 'Record unavailable' USING ERRCODE='42501'; END IF;
   IF v_key='accounts' AND EXISTS(SELECT 1 FROM safebus_private.disposal_accounts WHERE profile_id=v_id AND state<>'pending') THEN RAISE EXCEPTION 'Account disposal in progress' USING ERRCODE='55006'; END IF;
   IF p_action='export' THEN
    IF v_key IN ('email','push','inbox','bus_tracking_sessions','accounts') THEN RAISE EXCEPTION 'This record cannot be exported' USING ERRCODE='42501'; END IF;
    -- Never return credential/token hashes or provider content through generic exports.
    PERFORM safebus_private.write_audit_event_legacy('data.exported','retention_record',v_id,NULL,'success',jsonb_build_object('policy',v_key),NULL);
    RETURN v_row-ARRAY['session_token_hash','token','token_hash','last_delivery_error'];
   ELSIF p_action='preserve' THEN
    v_used:=(p_data->>'decisionUsedAt')::timestamptz;
    IF v_used>now() OR (p_data->>'reviewAt')::timestamptz<=now() OR p_data->>'reviewAt' IS NULL THEN RAISE EXCEPTION 'Invalid dates' USING ERRCODE='22023'; END IF;
    v_min:=greatest(now(),(p_data->>'minimumUntil')::timestamptz,((v_used AT TIME ZONE 'America/Edmonton')+interval '1 year') AT TIME ZONE 'America/Edmonton');
    INSERT INTO safebus_private.disposal_holds(tenant_id,policy_key,record_id,reference,minimum_until,review_at,created_by) VALUES(v_tenant,v_key,v_id,p_data->>'reference',v_min,(p_data->>'reviewAt')::timestamptz,auth.uid()) RETURNING id INTO v_id;
   ELSE RAISE EXCEPTION 'Unknown disposal action' USING ERRCODE='22023'; END IF;
  END IF;
 END IF;
 PERFORM safebus_private.write_audit_event_legacy('security.config_changed','retention_record',v_id,NULL,'success',jsonb_build_object('policy',v_key,'operation',p_action),NULL);
 RETURN jsonb_build_object('confirmed',true);
END $function$;


CREATE OR REPLACE FUNCTION safebus_private.retention_source_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_trip uuid; v_end timestamptz; v_floor timestamptz; v_data jsonb:=to_jsonb(OLD);
BEGIN
  PERFORM pg_advisory_xact_lock_shared(864203711);
  IF TG_OP='INSERT' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF (v_data->>'tenant_id') IS DISTINCT FROM (to_jsonb(NEW)->>'tenant_id')
      OR (v_data->>'driver_trip_id') IS DISTINCT FROM (to_jsonb(NEW)->>'driver_trip_id')
      OR (v_data->>'created_at') IS DISTINCT FROM (to_jsonb(NEW)->>'created_at') THEN
      RAISE EXCEPTION 'Retention source identity is immutable' USING ERRCODE='55006';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME IN ('driver_trips','student_trip_events','trip_exceptions','trip_operational_statuses') THEN
    v_trip:=CASE WHEN TG_TABLE_NAME='driver_trips' THEN OLD.id ELSE (v_data->>'driver_trip_id')::uuid END;
    IF TG_TABLE_NAME='driver_trips' THEN v_end:=OLD.ended_at;
    ELSE SELECT ended_at INTO v_end FROM public.driver_trips WHERE id=v_trip; END IF;
    v_floor:=greatest(v_end,(v_data->>'created_at')::timestamptz,(v_data->>'set_at')::timestamptz,(v_data->>'updated_at')::timestamptz);
    IF v_end IS NULL OR v_floor>now()-interval '395 days' OR safebus_private.retention_trip_held(v_trip) THEN
      RAISE EXCEPTION 'Operational retention or preservation active' USING ERRCODE='55006'; END IF;
  ELSIF TG_TABLE_NAME='authority_announcements' THEN
    IF OLD.resolved_at IS NULL OR greatest(OLD.resolved_at,OLD.created_at)>now()-interval '395 days' THEN
      RAISE EXCEPTION 'Unresolved announcement or retention active' USING ERRCODE='55006'; END IF;
  ELSIF TG_TABLE_NAME='user_notifications' THEN
    IF OLD.created_at>now()-interval '90 days'
      OR EXISTS(SELECT 1 FROM public.guardian_notification_outbox WHERE user_notification_id=OLD.id)
      OR EXISTS(SELECT 1 FROM public.push_notification_outbox WHERE notification_id=OLD.id) THEN
      RAISE EXCEPTION 'Inbox or delivery retention active' USING ERRCODE='55006'; END IF;
  ELSIF TG_TABLE_NAME IN ('guardian_notification_outbox','push_notification_outbox') THEN
    v_floor:=greatest((v_data->>'delivered_at')::timestamptz,(v_data->>'failed_at')::timestamptz,
      (v_data->>'cancelled_at')::timestamptz,(v_data->>'dead_lettered_at')::timestamptz);
    IF OLD.status NOT IN ('delivered','failed','cancelled','dead_lettered','sent') OR v_floor IS NULL
      OR greatest(v_floor,OLD.created_at)>now()-interval '90 days' THEN
      RAISE EXCEPTION 'Delivery retention active' USING ERRCODE='55006'; END IF;
  END IF;
  RETURN OLD;
END $function$;

CREATE OR REPLACE FUNCTION safebus_private.run_retention_deletion(p_key text, p_dry_run boolean DEFAULT true)
 RETURNS TABLE(run_id uuid, policy_key text, expiry_action text, affected_rows bigint, dry_run boolean, completed_at timestamp with time zone, status text, error_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare
  v_policy public.retention_policies;
  v_run_id uuid;
  v_affected bigint := 0;
  v_cutoff timestamptz;
  v_actor uuid := auth.uid();
  v_is_service boolean := auth.role() = 'service_role';
  v_error_code text;
begin
  IF p_dry_run IS DISTINCT FROM true THEN RAISE EXCEPTION 'Legacy retention is observation only' USING ERRCODE='55006'; END IF;
  if not v_is_service then
    if not safebus_private.is_platform_super_admin() then
      raise exception 'Only a platform super administrator can run retention.' using errcode = '42501';
    end if;
    perform safebus_private.enforce_mfa_if_required();
    perform safebus_private.enforce_recent_auth_for_sensitive_action();
  end if;

  select * into v_policy
  from public.retention_policies
  where retention_policies.policy_key = p_key and active;
  if v_policy.policy_key is null then
    raise exception 'Unknown or inactive retention policy.' using errcode = '22023';
  end if;

  if not p_dry_run and not exists (
    select 1 from public.retention_execution_control
    where id = 1 and destructive_enabled
  ) then
    raise exception 'Destructive retention is disabled pending recorded approval.'
      using errcode = '55006';
  end if;

  if not pg_try_advisory_xact_lock(hashtext('safebus-retention:' || p_key)) then
    raise exception 'A retention run for this policy is already active.' using errcode = '55P03';
  end if;

  v_cutoff := now() - make_interval(days => v_policy.retention_days);
  insert into public.retention_deletion_runs(policy_key, actor_profile_id, dry_run)
  values (p_key, case when v_is_service then null else v_actor end, p_dry_run)
  returning id into v_run_id;

  -- Suppress per-row security-audit triggers during a retention batch. The
  -- batch emits one aggregate event with counts and no personal data.
  perform set_config('safebus.retention_run', 'on', true);

  begin
    case p_key
      when 'invitations' then
        if p_dry_run then
          select count(*) into v_affected from public.tenant_onboarding_invitations
          where tenant_onboarding_invitations.status in ('activated', 'cancelled', 'failed') and updated_at < v_cutoff;
        else
          delete from public.tenant_onboarding_invitations
          where tenant_onboarding_invitations.status in ('activated', 'cancelled', 'failed') and updated_at < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'student_records' then
        if p_dry_run then
          select count(*) into v_affected from public.students
          where students.status in ('inactive', 'transferred', 'archived') and updated_at < v_cutoff;
        else
          delete from public.students
          where students.status in ('inactive', 'transferred', 'archived') and updated_at < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'guardian_relationships' then
        if p_dry_run then
          select count(*) into v_affected from public.student_guardians
          where student_guardians.status in ('inactive', 'archived') and updated_at < v_cutoff;
        else
          delete from public.student_guardians
          where student_guardians.status in ('inactive', 'archived') and updated_at < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'driver_records' then
        select count(*) into v_affected from public.drivers
        where drivers.status in ('inactive', 'suspended', 'archived') and updated_at < v_cutoff;
        if not p_dry_run then
          with candidates as (
            select id, profile_id from public.drivers
            where drivers.status in ('inactive', 'suspended', 'archived') and updated_at < v_cutoff
          ), anonymized_drivers as (
            update public.drivers d
            set employee_number = null,
                phone = null,
                license_number = null,
                license_issue_date = null,
                license_expiry_date = null,
                license_class = null,
                address_line1 = null,
                address_line2 = null,
                city = null,
                province = null,
                postal_code = null,
                status = 'archived'
            from candidates c where d.id = c.id
            returning c.profile_id
          )
          update public.profiles p
          set first_name = 'Deleted',
              last_name = 'Driver',
              full_name = 'Deleted Driver',
              email = 'deleted+' || replace(p.id::text, '-', '') || '@invalid.safebus.local',
              status = 'disabled'
          where p.id in (select profile_id from anonymized_drivers);
        end if;

      when 'bus_tracking_sessions' then
        if p_dry_run then
          select count(*) into v_affected from public.bus_tracking_sessions
          where bus_tracking_sessions.status in ('ended', 'revoked') and coalesce(ended_at, expires_at) < v_cutoff;
        else
          delete from public.bus_tracking_sessions
          where bus_tracking_sessions.status in ('ended', 'revoked') and coalesce(ended_at, expires_at) < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'bus_run_dispatches' then
        if p_dry_run then
          select count(*) into v_affected from public.bus_run_dispatches
          where bus_run_dispatches.status in ('completed', 'cancelled')
            and coalesce(bus_run_dispatches.completed_at, bus_run_dispatches.cancelled_at, bus_run_dispatches.prepared_at) < v_cutoff;
        else
          delete from public.bus_run_dispatches
          where bus_run_dispatches.status in ('completed', 'cancelled')
            and coalesce(bus_run_dispatches.completed_at, bus_run_dispatches.cancelled_at, bus_run_dispatches.prepared_at) < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'trip_records' then
        if p_dry_run then
          select count(*) into v_affected from public.driver_trips
          where driver_trips.status in ('completed', 'cancelled') and ended_at < v_cutoff
            and not exists (
              select 1 from public.bus_run_dispatches d
              where d.driver_trip_id = driver_trips.id
            );
        else
          delete from public.driver_trips
          where driver_trips.status in ('completed', 'cancelled') and ended_at < v_cutoff
            and not exists (
              select 1 from public.bus_run_dispatches d
              where d.driver_trip_id = driver_trips.id
            );
          get diagnostics v_affected = row_count;
        end if;

      when 'notifications' then
        if p_dry_run then
          select count(*) into v_affected from public.guardian_notification_outbox
          where guardian_notification_outbox.status in ('delivered', 'failed', 'cancelled')
            and coalesce(delivered_at, failed_at, updated_at, created_at) < v_cutoff;
        else
          delete from public.guardian_notification_outbox
          where guardian_notification_outbox.status in ('delivered', 'failed', 'cancelled')
            and coalesce(delivered_at, failed_at, updated_at, created_at) < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'audit_records' then
        select count(*) into v_affected from public.audit_events
        where created_at < v_cutoff
          and (actor_profile_id is not null or actor_email is not null or target_id is not null
               or target_label is not null or detail <> '{}'::jsonb or ip_address is not null);
        if not p_dry_run then
          update public.audit_events
          set actor_profile_id = null,
              actor_email = null,
              target_id = null,
              target_label = null,
              detail = '{}'::jsonb,
              ip_address = null
          where created_at < v_cutoff
            and (actor_profile_id is not null or actor_email is not null or target_id is not null
                 or target_label is not null or detail <> '{}'::jsonb or ip_address is not null);
        end if;

      when 'rate_limit_buckets' then
        if p_dry_run then
          select count(*) into v_affected from public.rate_limit_buckets where window_start < v_cutoff;
        else
          delete from public.rate_limit_buckets where window_start < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;

      when 'user_sessions' then
        if p_dry_run then
          select count(*) into v_affected from public.user_sessions
          where coalesce(revoked_at, last_active_at) < v_cutoff;
        else
          delete from public.user_sessions where coalesce(revoked_at, last_active_at) < v_cutoff;
          get diagnostics v_affected = row_count;
        end if;
      else
        raise exception 'Retention policy has no implementation.' using errcode = '0A000';
    end case;

    update public.retention_deletion_runs
    set affected_rows = v_affected, status = 'completed', completed_at = now()
    where id = v_run_id;

    if v_is_service then
      insert into public.audit_events(action, outcome, detail)
      values (
        'retention.deletion_run', 'success',
        jsonb_build_object('policy_key', p_key, 'affected_rows', v_affected, 'dry_run', p_dry_run)
      );
    else
      perform safebus_private.write_audit_event_legacy(
        'retention.deletion_run', 'retention_policy', null, null, 'success',
        jsonb_build_object('policy_key', p_key, 'affected_rows', v_affected, 'dry_run', p_dry_run), null
      );
    end if;
  exception when others then
    v_error_code := sqlstate;
    update public.retention_deletion_runs
    set status = 'failed', completed_at = now(), error_code = v_error_code
    where id = v_run_id;

    if v_is_service then
      insert into public.audit_events(action, outcome, detail)
      values (
        'retention.deletion_run', 'error',
        jsonb_build_object('policy_key', p_key, 'dry_run', p_dry_run, 'error_code', v_error_code)
      );
    else
      perform safebus_private.write_audit_event_legacy(
        'retention.deletion_run', 'retention_policy', null, null, 'error',
        jsonb_build_object('policy_key', p_key, 'dry_run', p_dry_run, 'error_code', v_error_code), null
      );
    end if;

    return query
      select v_run_id, p_key, v_policy.expiry_action, 0::bigint, p_dry_run,
             now(), 'failed'::text, v_error_code;
    return;
  end;

  return query
    select v_run_id, p_key, v_policy.expiry_action, v_affected, p_dry_run,
           now(), 'completed'::text, null::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.run_all_retention_deletions(p_dry_run boolean DEFAULT true)
 RETURNS TABLE(run_id uuid, policy_key text, expiry_action text, affected_rows bigint, dry_run boolean, completed_at timestamp with time zone, status text, error_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare
  v_key text;
begin
  -- Dependency order matters: token sessions and dispatches must be removed
  -- before their parent trips; notifications/links may cascade with students.
  foreach v_key in array array[
    'invitations', 'notifications', 'guardian_relationships', 'student_records',
    'bus_tracking_sessions', 'bus_run_dispatches',
    'trip_records', 'driver_records', 'audit_records', 'rate_limit_buckets', 'user_sessions'
  ]
  loop
    return query select * from safebus_private.run_retention_deletion(v_key, p_dry_run);
  end loop;
  -- Read-only retirement marker for clients deployed before the database cutover.
  -- This does not run the retired policy or create a deletion/audit record.
  return query select null::uuid,'raw_location_history'::text,'retired'::text,0::bigint,
    true,now(),'completed'::text,null::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.run_retention_lifecycle(p_dry_run boolean DEFAULT true, p_limit integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE v_class text; v_table text; v_where text; v_order text; v_ids uuid[]; v_count integer;
  -- Preserve aggregate response keys for older workers; neither retired class executes.
  v_result jsonb:=jsonb_build_object('gps',0,'archive_manifests',0);
  v_row jsonb; v_profile uuid; v_tenant uuid; v_profile_floor timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
  IF p_dry_run IS NULL OR p_limit NOT BETWEEN 1 AND 500 OR p_limit IS NULL THEN
    RAISE EXCEPTION 'Invalid batch' USING ERRCODE='22023'; END IF;
  PERFORM set_config('lock_timeout','1s',true);
  PERFORM pg_advisory_xact_lock(864203711);
  IF NOT p_dry_run AND NOT EXISTS(SELECT 1 FROM public.retention_execution_control WHERE id=1 AND destructive_enabled
    AND approval_reference IS NOT NULL AND approved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Destructive retention disabled' USING ERRCODE='55006'; END IF;
  IF NOT p_dry_run THEN PERFORM set_config('safebus.retention_run','on',true); END IF;
  FOREACH v_class IN ARRAY ARRAY['student_events','exceptions','statuses','announcements','email','push','inbox','cases','audience_failures','push_devices','invitations','guardian_relationships','student_records','bus_tracking_sessions','bus_run_dispatches','trip_records','driver_records','guardian_records','audit_records','rate_limit_buckets','user_sessions'] LOOP
    v_order:='s.id';
    CASE v_class
    WHEN 'student_events','exceptions','statuses' THEN
      v_table:=CASE v_class WHEN 'student_events' THEN 'public.student_trip_events'
        WHEN 'exceptions' THEN 'public.trip_exceptions' ELSE 'public.trip_operational_statuses' END;
      v_where:=$q$EXISTS(SELECT 1 FROM public.driver_trips t WHERE t.id=s.driver_trip_id AND t.ended_at IS NOT NULL
        AND greatest(t.ended_at,(to_jsonb(s)->>'created_at')::timestamptz,(to_jsonb(s)->>'set_at')::timestamptz,
          (to_jsonb(s)->>'updated_at')::timestamptz)<now()-interval '395 days')
        AND NOT safebus_private.retention_trip_held(s.driver_trip_id)$q$;
      IF v_class='student_events' THEN v_where:=v_where||' AND NOT EXISTS(SELECT 1 FROM public.guardian_notification_outbox o WHERE o.student_trip_event_id=s.id)'; END IF;
    WHEN 'announcements' THEN
      v_table:='safebus_private.authority_announcements';
      v_where:=$q$s.resolved_at IS NOT NULL AND greatest(s.resolved_at,s.created_at)<now()-interval '395 days'$q$;
    WHEN 'email','push' THEN
      v_table:=CASE v_class WHEN 'email' THEN 'public.guardian_notification_outbox' ELSE 'public.push_notification_outbox' END;
      v_where:=$q$s.status IN ('delivered','sent','failed','cancelled','dead_lettered')
        AND greatest((to_jsonb(s)->>'delivered_at')::timestamptz,(to_jsonb(s)->>'failed_at')::timestamptz,
          (to_jsonb(s)->>'cancelled_at')::timestamptz,(to_jsonb(s)->>'dead_lettered_at')::timestamptz) IS NOT NULL
        AND greatest(s.created_at,(to_jsonb(s)->>'delivered_at')::timestamptz,(to_jsonb(s)->>'failed_at')::timestamptz,
          (to_jsonb(s)->>'cancelled_at')::timestamptz,(to_jsonb(s)->>'dead_lettered_at')::timestamptz)<now()-interval '90 days'$q$;
    WHEN 'cases' THEN
      v_table:='safebus_private.retention_cases';
      v_where:=$q$s.released_at<now()-interval '395 days' AND s.minimum_until<now()$q$;
    WHEN 'invitations','guardian_relationships','student_records','bus_tracking_sessions','bus_run_dispatches','trip_records','driver_records','guardian_records','audit_records','rate_limit_buckets','user_sessions' THEN
      v_table:=safebus_private.disposal_relation(v_class)::text;
      v_where:=CASE v_class
       WHEN 'rate_limit_buckets' THEN $q$s.window_start<now()-interval '2 days'$q$
       WHEN 'audit_records' THEN $q$s.created_at<now()-interval '730 days'$q$
       WHEN 'user_sessions' THEN $q$greatest(s.revoked_at,s.last_active_at)<now()-interval '90 days'$q$
       WHEN 'bus_tracking_sessions' THEN $q$s.status IN ('ended','revoked') AND s.expires_at<now()-interval '30 days'$q$
       WHEN 'bus_run_dispatches' THEN $q$s.status IN ('completed','cancelled') AND greatest(s.completed_at,s.cancelled_at,s.prepared_at)<now()-interval '395 days'$q$
       WHEN 'trip_records' THEN $q$s.ended_at<now()-interval '395 days'$q$
       ELSE $q$s.updated_at<now()-interval '90 days'$q$ END;
      IF v_class='audit_records' THEN v_where:=v_where||$q$ AND (s.actor_profile_id IS NOT NULL OR s.actor_email IS NOT NULL OR s.target_id IS NOT NULL OR s.target_label IS NOT NULL OR s.detail<>'{}'::jsonb OR s.ip_address IS NOT NULL OR s.tenant_id IS NOT NULL OR s.actor_role IS NOT NULL OR s.target_type IS NOT NULL)$q$; END IF;
    WHEN 'audience_failures' THEN
      v_table:='safebus_private.notification_audience_queue';
      v_where:=$q$s.failed_at<now()-interval '90 days'$q$;
    WHEN 'push_devices' THEN
      v_table:='public.android_push_devices';
      v_where:=$q$s.updated_at<now()-interval '90 days' AND s.last_seen_at<now()-interval '90 days'$q$;
    WHEN 'inbox' THEN
      v_table:='public.user_notifications';
      v_where:=$q$s.created_at<now()-interval '90 days'
        AND NOT EXISTS(SELECT 1 FROM public.guardian_notification_outbox o WHERE o.user_notification_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM public.push_notification_outbox o WHERE o.notification_id=s.id)$q$;
    END CASE;
    IF v_class<>'cases' THEN v_where:=v_where||format(' AND safebus_private.disposal_allowed(%L,to_jsonb(s))',v_class); END IF;
    EXECUTE format('SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) FROM (SELECT s.id FROM %s s WHERE %s ORDER BY %s LIMIT $1) eligible',v_table,v_where,v_order)
      INTO v_ids USING p_limit;
    v_count:=cardinality(v_ids);
    IF NOT p_dry_run THEN
      -- Per-authority aggregate evidence is committed with each removal, without source identifiers.
      FOR v_row IN EXECUTE format('SELECT to_jsonb(s) FROM %s s WHERE id=ANY($1)',v_table) USING v_ids LOOP
        v_tenant:=(v_row->>'tenant_id')::uuid;
        IF v_tenant IS NULL AND v_row->>'driver_trip_id' IS NOT NULL THEN SELECT tenant_id INTO v_tenant FROM public.driver_trips WHERE id=(v_row->>'driver_trip_id')::uuid; END IF;
        IF v_tenant IS NULL THEN v_tenant:='00000000-0000-0000-0000-000000000000'; END IF;
        INSERT INTO safebus_private.disposal_runs AS runs(window_start,tenant_id,policy_key,completed_at,affected_rows) VALUES(date_trunc('hour',now()),v_tenant,v_class,now(),1)
        ON CONFLICT(window_start,tenant_id,policy_key) DO UPDATE SET affected_rows=runs.affected_rows+1,completed_at=now();
        IF v_class IN ('driver_records','guardian_records') THEN
          v_profile:=(v_row->>'profile_id')::uuid;
          -- Only recipient identities. Never disable or erase an administrator.
          SELECT greatest(updated_at,(v_row->>'updated_at')::timestamptz) INTO v_profile_floor FROM public.profiles
            WHERE id=v_profile AND tenant_id=v_tenant AND role::text=CASE WHEN v_class='driver_records' THEN 'driver' ELSE 'guardian' END
              AND NOT EXISTS(SELECT 1 FROM public.drivers d WHERE d.profile_id=v_profile AND d.id<>(v_row->>'id')::uuid AND d.status='active')
              AND NOT EXISTS(SELECT 1 FROM public.guardians g WHERE g.profile_id=v_profile AND g.id<>(v_row->>'id')::uuid AND g.status='active');
          IF v_profile_floor IS NOT NULL THEN
            UPDATE public.profiles SET status='disabled',first_name='Deleted',last_name='Recipient',full_name='Deleted Recipient',email='deleted+'||replace(id::text,'-','')||'@invalid.safebus.local' WHERE id=v_profile;
            INSERT INTO safebus_private.disposal_accounts(profile_id,tenant_id,retention_started_at) VALUES(v_profile,v_tenant,v_profile_floor) ON CONFLICT DO NOTHING;
          END IF;
        END IF;
      END LOOP;
      IF v_class='audit_records' THEN
        UPDATE public.audit_events SET tenant_id=NULL,actor_profile_id=NULL,actor_email=NULL,actor_role=NULL,target_type=NULL,target_id=NULL,target_label=NULL,detail='{}',ip_address=NULL WHERE id=ANY(v_ids);
      ELSE EXECUTE format('DELETE FROM %s WHERE id=ANY($1)',v_table) USING v_ids; END IF;
      GET DIAGNOSTICS v_count=ROW_COUNT;
    END IF;
    v_result:=v_result||jsonb_build_object(v_class,v_count);
  END LOOP;
  IF NOT p_dry_run THEN
    INSERT INTO safebus_private.disposal_accounts(profile_id,tenant_id,retention_started_at)
      SELECT p.id,p.tenant_id,p.updated_at FROM public.profiles p WHERE p.status='disabled' AND p.role IN ('driver','guardian') AND p.tenant_id IS NOT NULL AND p.updated_at<now()-interval '395 days' AND NOT EXISTS(SELECT 1 FROM safebus_private.disposal_accounts q WHERE q.profile_id=p.id) ORDER BY p.updated_at,p.id LIMIT p_limit ON CONFLICT DO NOTHING;
    DELETE FROM safebus_private.disposal_runs WHERE (window_start,tenant_id,policy_key) IN (SELECT window_start,tenant_id,policy_key FROM safebus_private.disposal_runs WHERE window_start<now()-interval '395 days' ORDER BY window_start LIMIT p_limit);
    DELETE FROM safebus_private.disposal_holds WHERE id IN (SELECT id FROM safebus_private.disposal_holds WHERE released_at<now()-interval '395 days' ORDER BY released_at,id LIMIT p_limit);
    DELETE FROM safebus_private.disposal_accounts WHERE profile_id IN (SELECT profile_id FROM safebus_private.disposal_accounts WHERE state='completed' AND completed_at<now()-interval '395 days' ORDER BY completed_at,profile_id LIMIT p_limit);
    INSERT INTO safebus_private.retention_lifecycle_totals AS totals(window_start,completed_at,run_count,counts)
      VALUES(date_trunc('hour',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',now(),1,v_result)
    ON CONFLICT(window_start) DO UPDATE SET completed_at=excluded.completed_at,run_count=totals.run_count+1,
      counts=(SELECT jsonb_object_agg(key,(value::bigint+coalesce((totals.counts->>key)::bigint,0)))
        FROM jsonb_each_text(excluded.counts));
    DELETE FROM safebus_private.retention_lifecycle_totals WHERE window_start<now()-interval '395 days';
  END IF;
  RETURN jsonb_build_object('version',1,'dryRun',p_dry_run,'limit',p_limit,'counts',v_result);
END $function$;

-- The history table is removed without CASCADE: an unexpected SQL dependency blocks release.
DROP FUNCTION public.retention_archive_work(text,jsonb);
DROP TABLE safebus_private.retention_archive_coverage;
DROP TABLE safebus_private.retention_archive_chunks;
DROP TABLE public.driver_trip_location_updates;
DROP FUNCTION IF EXISTS safebus_private.enforce_native_ingestion_for_bound_session();
-- Historical aggregate deletion-run audit records reference this policy key.
-- Keep their inactive reference record, not a runnable history-retention policy.
UPDATE public.retention_policies SET active=false,description='Retired: continuous GPS history is no longer collected.'
  WHERE policy_key='raw_location_history';
UPDATE public.retention_policies SET description='Completed or cancelled trip lifecycle and operational events.'
  WHERE policy_key='trip_records';

-- Assert no live function still names a removed relation or its former retention policy.
DO $assert$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','safebus_private') AND p.prokind='f'
      AND (p.prosrc ~ 'driver_trip_location_updates|retention_archive_(chunks|coverage)'
        OR (p.prosrc ~ 'raw_location_history' AND p.oid<>'public.run_all_retention_deletions(boolean)'::regprocedure))) THEN
    RAISE EXCEPTION 'GPS history dependencies remain' USING ERRCODE='55006';
  END IF;
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='safebus-expire-tracking-positions') THEN
    RAISE EXCEPTION 'Tracking expiry job already exists; reconcile before rollout';
  END IF;
END $assert$;
SELECT cron.schedule('safebus-expire-tracking-positions','* * * * *',
  'SELECT safebus_private.expire_driver_tracking_positions()');
NOTIFY pgrst,'reload schema';
