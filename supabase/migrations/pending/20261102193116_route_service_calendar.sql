-- Prepared from the inspected BusSafe catalog. Protected release only.
-- Date-specific service is independent of route kind. No historical trip rewrite.
DO $baseline$ DECLARE item record; BEGIN
 FOR item IN SELECT * FROM (VALUES
 ('safebus_private.prepare_bus_run(uuid)', '7770b553fa66738216ac8325b2379cb5'),
 ('safebus_private.get_admin_bus_ready_dispatch(uuid)', '4b5c708f4c4eac829b546bdcfe2f80b3'),
 ('start_bus_tracking_from_qr(text,uuid)', '28d0f3e1b7d4e2337cdebcd4b1b832d9'),
 ('admin_save_route_definition(jsonb,jsonb,jsonb)', '9687d306a9662671539cd4ecdf876894'),
 ('get_bus_qr_start_options(text)', 'a76c1a9f60ddc1cf389af6206b1a18e8')
 ) AS expected(signature,digest) LOOP
  IF md5(replace(pg_get_functiondef(to_regprocedure(item.signature)),chr(13),'')) IS DISTINCT FROM item.digest THEN
   RAISE EXCEPTION 'Route calendar baseline differs.' USING ERRCODE='55000';
  END IF;
 END LOOP;
END $baseline$;

ALTER TABLE public.routes
 ADD COLUMN service_schedule_mode text NOT NULL DEFAULT 'weekly',
 ADD COLUMN service_dates date[] NOT NULL DEFAULT '{}'::date[],
 ADD CONSTRAINT routes_service_schedule_check CHECK (
  service_schedule_mode IN ('weekly','dates') AND cardinality(service_dates)<=366
  AND (cardinality(service_dates)=0 OR array_ndims(service_dates)=1)
  AND array_position(service_dates,NULL) IS NULL
  AND (service_schedule_mode<>'dates' OR status<>'active' OR cardinality(service_dates)>0)
 );

-- Pinned IANA 2026f Edmonton rule. Historical conversion remains historical;
-- post-transition UTC-06 also works on the inspected pre-upgrade hosted tzdata.
CREATE FUNCTION safebus_private.route_calendar_date(p_at timestamptz)
RETURNS date LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog AS $function$
 SELECT CASE WHEN p_at >= timestamptz '2026-03-08 09:00:00+00'
  THEN (p_at AT TIME ZONE INTERVAL '-06:00')::date
  ELSE (p_at AT TIME ZONE 'America/Edmonton')::date END
$function$;
CREATE FUNCTION safebus_private.route_calendar_today()
RETURNS date LANGUAGE sql STABLE SET search_path=pg_catalog,safebus_private AS $function$
 SELECT safebus_private.route_calendar_date(now())
$function$;
CREATE FUNCTION safebus_private.route_operates_on(p_route_id uuid,p_tenant_id uuid,p_date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $function$
 SELECT coalesce((SELECT CASE WHEN r.service_schedule_mode='dates' THEN p_date=ANY(r.service_dates)
  ELSE NOT EXISTS(SELECT 1 FROM public.route_service_days d WHERE d.route_id=r.id AND d.tenant_id=r.tenant_id)
   OR EXISTS(SELECT 1 FROM public.route_service_days d WHERE d.route_id=r.id AND d.tenant_id=r.tenant_id
    AND d.day_of_week=extract(dow FROM p_date)::integer AND d.status='active') END
 FROM public.routes r WHERE r.id=p_route_id AND r.tenant_id=p_tenant_id),false)
$function$;
REVOKE ALL ON FUNCTION safebus_private.route_calendar_date(timestamptz),safebus_private.route_calendar_today(),safebus_private.route_operates_on(uuid,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION safebus_private.route_calendar_date(timestamptz),safebus_private.route_calendar_today(),safebus_private.route_operates_on(uuid,uuid,date) TO authenticated,service_role;

CREATE FUNCTION safebus_private.enforce_new_trip_calendar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,safebus_private,auth AS $function$
BEGIN
 IF NEW.status IN ('active','paused') THEN
  IF auth.uid() IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM safebus_private.current_tenant_id() THEN
   RAISE EXCEPTION 'Trip is not available for this account.' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.routes WHERE id=NEW.route_id AND tenant_id=NEW.tenant_id FOR SHARE;
  IF NOT FOUND OR NOT safebus_private.route_operates_on(NEW.route_id,NEW.tenant_id,safebus_private.route_calendar_today()) THEN
   RAISE EXCEPTION 'This route is closed for new trips today.' USING ERRCODE='55006';
  END IF;
  NEW.service_date := safebus_private.route_calendar_today();
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION safebus_private.enforce_new_trip_calendar() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER enforce_new_trip_calendar BEFORE INSERT ON public.driver_trips FOR EACH ROW EXECUTE FUNCTION safebus_private.enforce_new_trip_calendar();

CREATE OR REPLACE FUNCTION safebus_private.prepare_bus_run(p_bus_route_assignment_id uuid)
 RETURNS bus_run_dispatches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare
  v_tenant_id uuid := safebus_private.current_tenant_id();
  v_service public.bus_route_assignments;
  v_dispatch public.bus_run_dispatches;
begin
  if auth.uid() is null
    or v_tenant_id is null
    or not safebus_private.is_transportation_write_admin() then
    raise exception 'Preparing a bus run requires a tenant operational admin.'
      using errcode = '42501';
  end if;

  select bra.* into v_service
  from public.bus_route_assignments bra
  join public.buses b
    on b.id = bra.bus_id and b.tenant_id = bra.tenant_id and b.status = 'active'
  join public.routes r
    on r.id = bra.route_id and r.tenant_id = bra.tenant_id
    and r.status = 'active' and r.definition_status = 'ready'
  join public.route_trip_patterns rtp
    on rtp.id = bra.route_trip_pattern_id and rtp.route_id = bra.route_id
    and rtp.tenant_id = bra.tenant_id and rtp.status = 'active'
    and not rtp.schedule_review_required
  where bra.id = p_bus_route_assignment_id
    and bra.tenant_id = v_tenant_id
    and bra.status = 'active'
    and safebus_private.route_operates_on(bra.route_id,bra.tenant_id,safebus_private.route_calendar_today())
    and (bra.effective_from is null or bra.effective_from <= safebus_private.route_calendar_today())
    and (bra.effective_to is null or bra.effective_to >= safebus_private.route_calendar_today())
  for update of bra;

  if not found then
    raise exception 'This bus run is not ready today.' using errcode = '55006';
  end if;

  perform 1 from public.buses b where b.id = v_service.bus_id for update;
  if exists (
    select 1 from public.driver_trips dt
    where dt.bus_id = v_service.bus_id and dt.tenant_id = v_tenant_id and dt.status = 'active'
  ) then
    raise exception 'End the active trip before preparing another run.' using errcode = '55006';
  end if;

  update public.bus_run_dispatches
  set status = 'cancelled', cancelled_at = now()
  where tenant_id = v_tenant_id and bus_id = v_service.bus_id and status = 'ready';

  insert into public.bus_run_dispatches(
    tenant_id, bus_id, bus_route_assignment_id, route_id,
    route_trip_pattern_id, service_date, prepared_by
  ) values (
    v_service.tenant_id, v_service.bus_id, v_service.id, v_service.route_id,
    v_service.route_trip_pattern_id, safebus_private.route_calendar_today(), auth.uid()
  ) returning * into v_dispatch;

  return v_dispatch;
end;
$function$;

CREATE OR REPLACE FUNCTION safebus_private.get_admin_bus_ready_dispatch(p_bus_id uuid)
 RETURNS TABLE(dispatch_id uuid, bus_id uuid, bus_route_assignment_id uuid, service_date date, status text, route_name text, route_code text, trip_name text, prepared_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
  select d.id, d.bus_id, d.bus_route_assignment_id, d.service_date, d.status,
    r.route_name, r.route_code, rtp.display_name, d.prepared_at
  from public.bus_run_dispatches d
  join public.routes r on r.id = d.route_id and r.tenant_id = d.tenant_id
  join public.route_trip_patterns rtp
    on rtp.id = d.route_trip_pattern_id and rtp.tenant_id = d.tenant_id
  where auth.uid() is not null
    and safebus_private.is_transportation_write_admin()
    and d.tenant_id = safebus_private.current_tenant_id()
    and d.bus_id = p_bus_id
    and d.status = 'ready'
  order by d.prepared_at desc
  limit 1
$function$;

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
  set status = 'revoked', ended_at = now()
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

CREATE OR REPLACE FUNCTION public.admin_save_route_definition(p_route jsonb, p_stops jsonb, p_trip_patterns jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare
  v_tenant_id uuid := safebus_private.current_tenant_id();
  v_route_id uuid;
  v_school_id uuid;
  v_route_name text;
  v_route_code text;
  v_route_kind text;
  v_map_color text;
  v_status text;
  v_ready boolean;
  v_stop jsonb;
  v_pattern jsonb;
  v_stop_id uuid;
  v_pattern_id uuid;
  v_client_key text;
  v_stop_ids jsonb := '{}'::jsonb;
  v_active_count integer;
  v_mode text;
  v_days smallint[];
  v_dates date[];
begin
  if auth.uid() is null
    or safebus_private.current_user_role() <> 'tenant_admin'
    or v_tenant_id is null then
    raise exception 'Only an active tenant administrator can save route definitions.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_route) <> 'object'
    or jsonb_typeof(p_stops) <> 'array'
    or jsonb_typeof(p_trip_patterns) <> 'array' then
    raise exception 'Route, stops, and trip patterns must use the documented JSON shape.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_route) key
    where key not in (
      'id', 'schoolId', 'routeName', 'routeCode', 'routeKind', 'mapColor', 'status', 'serviceMode', 'serviceDays', 'serviceDates'
    )
  ) then
    raise exception 'Route contains an unsupported field.' using errcode = '22023';
  end if;

  v_route_id := nullif(p_route->>'id', '')::uuid;
  v_school_id := nullif(p_route->>'schoolId', '')::uuid;
  v_route_name := btrim(coalesce(p_route->>'routeName', ''));
  v_route_code := btrim(coalesce(p_route->>'routeCode', ''));
  v_route_kind := coalesce(nullif(p_route->>'routeKind', ''), 'regular');
  v_map_color := upper(coalesce(nullif(p_route->>'mapColor', ''), '#2563EB'));
  v_status := coalesce(nullif(p_route->>'status', ''), 'inactive');
  v_mode := coalesce(p_route->>'serviceMode',case when v_route_id IS NOT NULL then
   (select service_schedule_mode from public.routes where id=v_route_id and tenant_id=v_tenant_id)
   when v_route_kind='field_trip' then 'dates' else 'weekly' end);
  IF v_mode NOT IN ('weekly','dates') OR (p_route ? 'serviceDays' AND jsonb_typeof(p_route->'serviceDays')<>'array')
   OR (p_route ? 'serviceDates' AND jsonb_typeof(p_route->'serviceDates')<>'array') THEN
   RAISE EXCEPTION 'Choose a valid service calendar.' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(coalesce(p_route->'serviceDays','[]'::jsonb))>7 OR jsonb_array_length(coalesce(p_route->'serviceDates','[]'::jsonb))>366 THEN
   RAISE EXCEPTION 'Service calendar is too large.' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT value::smallint ORDER BY value::smallint),'{}'::smallint[]) INTO v_days
   FROM jsonb_array_elements_text(coalesce(p_route->'serviceDays','[1,2,3,4,5]'::jsonb));
  IF EXISTS(SELECT 1 FROM unnest(v_days) d WHERE d NOT BETWEEN 0 AND 6) OR array_position(v_days,NULL) IS NOT NULL THEN
   RAISE EXCEPTION 'Choose valid weekdays.' USING ERRCODE='22023';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(p_route->'serviceDates','[]'::jsonb)) WHERE value IS NULL OR value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN
   RAISE EXCEPTION 'Choose valid calendar dates.' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT value::date ORDER BY value::date),'{}'::date[]) INTO v_dates
   FROM jsonb_array_elements_text(coalesce(p_route->'serviceDates',
    (select to_jsonb(service_dates) from public.routes where id=v_route_id and tenant_id=v_tenant_id),'[]'::jsonb));
  IF array_position(v_dates,NULL) IS NOT NULL OR (v_mode='dates' AND v_status='active' AND cardinality(v_dates)=0) THEN
   RAISE EXCEPTION 'Select at least one service date for an active date-specific route.' USING ERRCODE='22023';
  END IF;

  if char_length(v_route_name) not between 1 and 100
    or char_length(v_route_code) not between 1 and 40 then
    raise exception 'Route name must be 1-100 characters and route code 1-40 characters.'
      using errcode = '22023';
  end if;
  if v_route_kind not in ('regular', 'field_trip')
    or v_status not in ('active', 'inactive', 'archived')
    or v_map_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Route kind, status, or map color is invalid.' using errcode = '22023';
  end if;
  if v_school_id is not null and not exists (
    select 1 from public.schools s
    where s.id = v_school_id and s.tenant_id = v_tenant_id and s.status = 'active'
  ) then
    raise exception 'Primary school must be active and belong to your tenant.'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.routes r
    where r.tenant_id = v_tenant_id
      and lower(r.route_code) = lower(v_route_code)
      and r.id is distinct from v_route_id
  ) then
    raise exception 'A route with this code already exists in your tenant.'
      using errcode = '23505';
  end if;
  if exists (
    select 1 from public.routes r
    where r.tenant_id = v_tenant_id
      and v_status = 'active'
      and r.status = 'active'
      and upper(r.map_color) = v_map_color
      and r.id is distinct from v_route_id
  ) then
    raise exception 'Choose a different color from the other active routes.'
      using errcode = '23505';
  end if;

  if v_route_id is null then
    insert into public.routes (
      tenant_id, school_id, route_name, route_code, route_type,
      route_kind, map_color, definition_status, status
    ) values (
      v_tenant_id, v_school_id, v_route_name, v_route_code,
      case when v_route_kind = 'field_trip' then 'field_trip' else 'special' end,
      v_route_kind, v_map_color, 'incomplete', 'inactive'
    )
    returning id into v_route_id;
  else
    if not exists (
      select 1 from public.routes r
      where r.id = v_route_id and r.tenant_id = v_tenant_id
    ) then
      raise exception 'Route not found in your tenant.' using errcode = 'P0002';
    end if;
    update public.routes
    set
      school_id = v_school_id,
      route_name = v_route_name,
      route_code = v_route_code,
      route_type = case when v_route_kind = 'field_trip' then 'field_trip' else 'special' end,
      route_kind = v_route_kind,
      map_color = v_map_color,
      status = 'inactive'
    where id = v_route_id and tenant_id = v_tenant_id;
  end if;

  update public.routes set service_schedule_mode=v_mode,service_dates=v_dates where id=v_route_id and tenant_id=v_tenant_id;
  IF p_route ? 'serviceDays' OR NOT EXISTS(SELECT 1 FROM public.route_service_days WHERE route_id=v_route_id) THEN
   INSERT INTO public.route_service_days(tenant_id,route_id,day_of_week,status)
    SELECT v_tenant_id,v_route_id,n,case when n=ANY(v_days) then 'active' else 'inactive' end FROM generate_series(0,6) n
    ON CONFLICT(route_id,day_of_week) DO UPDATE SET status=excluded.status;
  END IF;

  if jsonb_array_length(p_stops) > 500 then
    raise exception 'A route cannot contain more than 500 stops.' using errcode = '22023';
  end if;

  -- Move existing orders out of the requested range so swaps/reordering do not
  -- trip the existing route/order unique constraint mid-transaction.
  update public.route_stops
  set stop_order = stop_order + 10000
  where route_id = v_route_id
    and tenant_id = v_tenant_id;

  for v_stop in select value from jsonb_array_elements(p_stops)
  loop
    if jsonb_typeof(v_stop) <> 'object'
      or exists (
        select 1 from jsonb_object_keys(v_stop) key
        where key not in (
          'id', 'clientKey', 'schoolId', 'stopName', 'stopOrder',
          'latitude', 'longitude', 'status'
        )
      ) then
      raise exception 'A stop contains an unsupported field.' using errcode = '22023';
    end if;

    v_client_key := btrim(coalesce(v_stop->>'clientKey', ''));
    if v_client_key = '' or char_length(v_client_key) > 100 then
      raise exception 'Every stop needs a stable client key.' using errcode = '22023';
    end if;
    if v_stop_ids ? v_client_key then
      raise exception 'Stop client keys must be unique.' using errcode = '22023';
    end if;
    if char_length(btrim(coalesce(v_stop->>'stopName', ''))) not between 1 and 120
      or coalesce((v_stop->>'stopOrder')::integer, 0) <= 0
      or coalesce(v_stop->>'status', 'active') not in ('active', 'inactive') then
      raise exception 'Each stop needs a valid name, order, and status.'
        using errcode = '22023';
    end if;
    if nullif(v_stop->>'latitude', '') is not null
      and (v_stop->>'latitude')::numeric not between -90 and 90 then
      raise exception 'Stop latitude must be between -90 and 90.' using errcode = '22023';
    end if;
    if nullif(v_stop->>'longitude', '') is not null
      and (v_stop->>'longitude')::numeric not between -180 and 180 then
      raise exception 'Stop longitude must be between -180 and 180.' using errcode = '22023';
    end if;
    v_school_id := nullif(v_stop->>'schoolId', '')::uuid;
    if v_school_id is not null and not exists (
      select 1 from public.schools s
      where s.id = v_school_id and s.tenant_id = v_tenant_id and s.status = 'active'
    ) then
      raise exception 'A stop school is outside your tenant or inactive.'
        using errcode = '23514';
    end if;

    v_stop_id := nullif(v_stop->>'id', '')::uuid;
    if v_stop_id is null then
      insert into public.route_stops (
        tenant_id, route_id, school_id, stop_name, stop_order,
        planned_arrival_time, latitude, longitude, status
      ) values (
        v_tenant_id, v_route_id, v_school_id, btrim(v_stop->>'stopName'),
        (v_stop->>'stopOrder')::integer, null,
        nullif(v_stop->>'latitude', '')::numeric,
        nullif(v_stop->>'longitude', '')::numeric,
        coalesce(v_stop->>'status', 'active')
      )
      returning id into v_stop_id;
    else
      update public.route_stops
      set
        school_id = v_school_id,
        stop_name = btrim(v_stop->>'stopName'),
        stop_order = (v_stop->>'stopOrder')::integer,
        latitude = nullif(v_stop->>'latitude', '')::numeric,
        longitude = nullif(v_stop->>'longitude', '')::numeric,
        status = coalesce(v_stop->>'status', 'active')
      where id = v_stop_id
        and route_id = v_route_id
        and tenant_id = v_tenant_id;
      if not found then
        raise exception 'A stop does not belong to this route.' using errcode = '23514';
      end if;
    end if;
    v_stop_ids := v_stop_ids || jsonb_build_object(v_client_key, v_stop_id);
  end loop;

  update public.route_stops
  set status = 'archived'
  where route_id = v_route_id
    and tenant_id = v_tenant_id
    and status <> 'archived'
    and not (id = any (
      select value::text::uuid
      from jsonb_each_text(v_stop_ids)
    ));

  if jsonb_array_length(p_trip_patterns) <> 2
    or (
      select count(distinct value->>'direction')
      from jsonb_array_elements(p_trip_patterns)
    ) <> 2
    or exists (
      select 1 from jsonb_array_elements(p_trip_patterns)
      where value->>'direction' not in ('forward', 'reverse')
    ) then
    raise exception 'Provide exactly one forward and one reverse trip.'
      using errcode = '22023';
  end if;

  for v_pattern in select value from jsonb_array_elements(p_trip_patterns)
  loop
    if jsonb_typeof(v_pattern) <> 'object'
      or exists (
        select 1 from jsonb_object_keys(v_pattern) key
        where key not in (
          'id', 'direction', 'displayName', 'status', 'stopTimes'
        )
      ) then
      raise exception 'A trip pattern contains an unsupported field.'
        using errcode = '22023';
    end if;
    if char_length(btrim(coalesce(v_pattern->>'displayName', ''))) not between 1 and 100
      or coalesce(v_pattern->>'status', 'active') not in ('active', 'inactive')
      or jsonb_typeof(coalesce(v_pattern->'stopTimes', '{}'::jsonb)) <> 'object' then
      raise exception 'Trip name, status, or stop times are invalid.'
        using errcode = '22023';
    end if;
    if exists (
      select 1
      from jsonb_object_keys(coalesce(v_pattern->'stopTimes', '{}'::jsonb)) key
      where not (v_stop_ids ? key)
    ) then
      raise exception 'A trip time references a stop outside this route.'
        using errcode = '23514';
    end if;

    select id into v_pattern_id
    from public.route_trip_patterns
    where route_id = v_route_id
      and tenant_id = v_tenant_id
      and direction = v_pattern->>'direction'
    for update;

    if not found then
      insert into public.route_trip_patterns (
        tenant_id, route_id, direction, display_name, status,
        schedule_review_required
      ) values (
        v_tenant_id, v_route_id, v_pattern->>'direction',
        btrim(v_pattern->>'displayName'), coalesce(v_pattern->>'status', 'active'),
        false
      )
      returning id into v_pattern_id;
    else
      update public.route_trip_patterns
      set
        display_name = btrim(v_pattern->>'displayName'),
        status = coalesce(v_pattern->>'status', 'active'),
        schedule_review_required = false
      where id = v_pattern_id;
    end if;

    insert into public.route_trip_stop_schedules (
      tenant_id, route_id, route_trip_pattern_id, route_stop_id,
      planned_arrival_time
    )
    select
      v_tenant_id,
      v_route_id,
      v_pattern_id,
      (entry.value #>> '{}')::uuid,
      nullif(v_pattern->'stopTimes'->>entry.key, '')::time
    from jsonb_each(v_stop_ids) entry
    on conflict (route_trip_pattern_id, route_stop_id)
    do update set planned_arrival_time = excluded.planned_arrival_time;

    delete from public.route_trip_stop_schedules schedule
    where schedule.route_trip_pattern_id = v_pattern_id
      and not (schedule.route_stop_id = any (
        select value::text::uuid
        from jsonb_each_text(v_stop_ids)
      ));
  end loop;

  select count(*) into v_active_count
  from public.route_stops
  where route_id = v_route_id and status = 'active';

  v_ready := safebus_private.route_definition_is_ready(v_route_id);
  if v_status = 'active' and not v_ready then
    raise exception 'An active route requires at least two ordered stops with valid coordinates.'
      using errcode = '23514';
  end if;

  update public.routes
  set
    definition_status = case when v_ready then 'ready' else 'incomplete' end,
    status = case when v_status = 'active' and v_ready then 'active' else v_status end
  where id = v_route_id and tenant_id = v_tenant_id;

  return jsonb_build_object(
    'routeId', v_route_id,
    'definitionStatus', case when v_ready then 'ready' else 'incomplete' end,
    'activeStopCount', v_active_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_bus_qr_start_options(p_qr_token text)
 RETURNS TABLE(bus_route_assignment_id uuid, bus_number text, route_code text, route_name text, trip_name text, direction text, resumed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'safebus_private', 'auth', 'extensions', 'realtime', 'pg_temp'
AS $function$
declare
  v_tenant_id uuid := safebus_private.current_tenant_id();
  v_driver_id uuid := safebus_private.current_driver_id();
  v_hash text;
  v_bus public.buses;
  v_existing_trip public.driver_trips;
begin
  if auth.uid() is null or safebus_private.current_user_role() <> 'driver'
    or v_tenant_id is null or v_driver_id is null then
    raise exception 'Only an active driver can scan a bus.' using errcode = '42501';
  end if;
  if p_qr_token is null or p_qr_token !~ '^sbus_bus_v1_[A-Za-z0-9_-]{40,80}$' then
    raise exception 'Bus QR could not be verified.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.drivers d
    where d.id = v_driver_id and d.tenant_id = v_tenant_id and d.status = 'active'
  ) then
    raise exception 'An active driver identity is required.' using errcode = '42501';
  end if;

  v_hash := safebus_private.hash_bus_tracking_token(p_qr_token);
  select b.* into v_bus
  from public.bus_qr_credentials c
  join public.buses b on b.id = c.bus_id and b.tenant_id = c.tenant_id
  where c.token_hash = v_hash
    and c.status = 'active'
    and c.tenant_id = v_tenant_id
    and b.status = 'active';
  if not found then
    raise exception 'Bus QR could not be verified.' using errcode = 'P0002';
  end if;

  select dt.* into v_existing_trip
  from public.driver_trips dt
  where dt.driver_id = v_driver_id and dt.tenant_id = v_tenant_id and dt.status = 'active';
  if found and v_existing_trip.bus_id <> v_bus.id then
    raise exception 'End your active trip before scanning another bus.' using errcode = '55006';
  end if;

  return query
  select bra.id, v_bus.bus_number, r.route_code, r.route_name,
    rtp.display_name, rtp.direction, v_existing_trip.id is not null
  from public.bus_route_assignments bra
  join public.routes r
    on r.id = bra.route_id and r.tenant_id = bra.tenant_id
    and r.status = 'active' and r.definition_status = 'ready'
  join public.route_trip_patterns rtp
    on rtp.id = bra.route_trip_pattern_id and rtp.route_id = bra.route_id
    and rtp.tenant_id = bra.tenant_id and rtp.status = 'active'
    and not rtp.schedule_review_required
  where bra.tenant_id = v_tenant_id
    and bra.bus_id = v_bus.id
    and (
      (v_existing_trip.id is null
        and safebus_private.route_operates_on(r.id,r.tenant_id,safebus_private.route_calendar_today())
        and bra.status = 'active'
        and (bra.effective_from is null or bra.effective_from <= safebus_private.route_calendar_today())
        and (bra.effective_to is null or bra.effective_to >= safebus_private.route_calendar_today()))
      or
      (v_existing_trip.id is not null
        and bra.route_id = v_existing_trip.route_id
        and bra.route_trip_pattern_id = v_existing_trip.route_trip_pattern_id)
    )
  order by r.route_code, rtp.direction;
end;
$function$;

NOTIFY pgrst, 'reload schema';
