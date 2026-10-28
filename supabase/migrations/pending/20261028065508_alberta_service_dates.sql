-- Reconciled with BusSafe, 2026-10-28. Exact function/policy/default allowlist.
-- Only operational calendar dates change; session, MFA and scope checks remain.
DO $baseline$
DECLARE item record; definition text;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('public.admin_end_bus_route_service(uuid[])', '6a6651465ef5930d5372544240be8e27'),
    ('public.admin_renew_bus_route_assignment(uuid, date, date)', '8ad5a953193f2aa4c74070c8f6f79629'),
    ('public.admin_set_bus_route_service(uuid, uuid, text, date, date, uuid[])', 'b6f7dbc3aaa20a3fb3519ab10d877037'),
    ('public.admin_set_driver_bus_assignment(uuid, uuid, date, date, uuid)', 'ab6bbad95b22e053480faa2f0f3c9faf'),
    ('public.admin_set_student_bus_service(uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, date, date, uuid[])', '089f271335d3ea960be1d644a2a3880f'),
    ('public.admin_set_student_bus_service_status(uuid[], text, boolean)', '3b08a862ccf949da3618bd8d22c1bd2c'),
    ('public.admin_set_student_bus_service_with_seat(uuid, uuid, uuid, integer, text, uuid, uuid, uuid, uuid, date, date, uuid[])', 'b4e1bc1a75ccdcb2ab80fc82b910fbfe'),
    ('public.get_admin_students_page(integer, integer, text, text, uuid)', '2fbb65200c8a4544052490d58ffd9cab'),
    ('public.get_bus_qr_start_options(text)', '84fa22f14f1c26ed87f4824ad45ad912'),
    ('public.get_guardian_bus_service_lines(text)', '1b3d57b64a10bbdf92a15a947bc11dea'),
    ('public.get_guardian_student_stops()', '604a2d9cd81acdde82581e622d7019c5'),
    ('public.get_guardian_student_stops_v2()', '751407842eae877f9b49387b40948e5a'),
    ('public.replace_bus(uuid, uuid)', 'a4c9150a50b8cf64ea5862bbfc86b056'),
    ('public.start_bus_tracking_from_qr(text, uuid)', 'b0dd847e9ae46e032e5f42c0131d18f4'),
    ('public.substitute_driver(uuid, uuid)', '50f13a0a1c39ece3d5baf4be2a5b69fc'),
    ('safebus_private.admin_create_student_onboarding_base(jsonb)', '711e4f3013cd6f65b76c415074793a74'),
    ('safebus_private.broadcast_route_tracking_invalidation(uuid, uuid, text)', 'cf9ec224c91468a097ae7458d134070d'),
    ('safebus_private.driver_can_read_assigned_route(uuid, uuid)', 'f93b8ab5d88421ac1abf96a2d0aba847'),
    ('safebus_private.get_current_driver_trip_assignments()', 'a35db752b2549dfed1912c52c64566b7'),
    ('safebus_private.get_guardian_bus_visibility()', 'f1a479809bd9af4b9d78d82461992c28'),
    ('safebus_private.get_guardian_live_trip_visibility()', '93fa46285088df6987e4dbd54c137eae'),
    ('safebus_private.get_guardian_student_live_bus_location_state()', '2178591789b01b14ff886e1dd14a7d0a'),
    ('safebus_private.prepare_bus_run(uuid)', 'd74dbc9fef46f2942d897a9b896f76e1'),
    ('safebus_private.start_driver_trip_from_assignment(uuid)', '4eaba39afec37909cf75ef074d8b07df'),
    ('safebus_private.start_driver_trip_from_bus(uuid)', '3e6380091f972bb6cc97178ac2e0ba82'),
    ('safebus_private.validate_bus_capacity_reservations()', 'f92bd504feeeea0cee4d5cbd52aa91de'),
    ('safebus_private.validate_bus_service_seat_capacity()', '206dfa374369a82e5c3d4e7d1780d278'),
    ('safebus_private.validate_student_seat_capacity()', '3f08eb8a9e12ac4f4a0192196780bdaa')
  ) expected(signature, digest) LOOP
    IF to_regprocedure(item.signature) IS NULL OR md5(replace(pg_get_functiondef(to_regprocedure(item.signature)),chr(13),'')) <> item.digest THEN
      RAISE EXCEPTION 'Operational service-date baseline differs.' USING ERRCODE='55000';
    END IF;
    definition := replace(pg_get_functiondef(to_regprocedure(item.signature)),chr(13),'');
    EXECUTE regexp_replace(definition, '\mcurrent_date\M', '((now() AT TIME ZONE ''America/Edmonton'')::date)', 'gi');
  END LOOP;
  IF md5(replace(pg_get_functiondef(to_regprocedure('public.search_admin_trips(date, date, text, integer, integer)')),chr(13),'')) IS DISTINCT FROM '6db1660583a142b05ba226391cc58d4b' THEN
    RAISE EXCEPTION 'Ongoing trip search baseline differs.' USING ERRCODE='55000';
  END IF;
  definition := replace(pg_get_functiondef(to_regprocedure('public.search_admin_trips(date, date, text, integer, integer)')),chr(13),'');
  definition := replace(definition, 'p_status not in (''active'', ''paused'', ''completed'', ''cancelled'')', 'p_status not in (''active'', ''paused'', ''completed'', ''cancelled'', ''ongoing'')');
  definition := replace(definition, '(p_status is null or dt.status = p_status)', '(p_status is null or dt.status = p_status or (p_status = ''ongoing'' and dt.status in (''active'', ''paused'')))');
  EXECUTE definition;
END;
$baseline$;

DO $policy$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='buses' AND policyname='buses select assigned driver' AND qual='((safebus_private.current_user_role() = ''driver''::user_role) AND (tenant_id = safebus_private.current_tenant_id()) AND ((EXISTS ( SELECT 1
   FROM driver_route_assignments dra
  WHERE ((dra.bus_id = buses.id) AND (dra.tenant_id = buses.tenant_id) AND (dra.driver_id = safebus_private.current_driver_id()) AND (dra.status = ''active''::text) AND ((dra.effective_from IS NULL) OR (dra.effective_from <= CURRENT_DATE)) AND ((dra.effective_to IS NULL) OR (dra.effective_to >= CURRENT_DATE))))) OR (EXISTS ( SELECT 1
   FROM driver_trips dt
  WHERE ((dt.bus_id = buses.id) AND (dt.tenant_id = buses.tenant_id) AND (dt.driver_id = safebus_private.current_driver_id()) AND (dt.status = ''active''::text))))))' AND with_check IS NULL AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[]) THEN
    RAISE EXCEPTION 'Assigned driver date policy differs.' USING ERRCODE='55000';
  END IF;
END; $policy$;
ALTER POLICY "buses select assigned driver" ON public.buses USING (((safebus_private.current_user_role() = 'driver'::user_role) AND (tenant_id = safebus_private.current_tenant_id()) AND ((EXISTS ( SELECT 1
   FROM driver_route_assignments dra
  WHERE ((dra.bus_id = buses.id) AND (dra.tenant_id = buses.tenant_id) AND (dra.driver_id = safebus_private.current_driver_id()) AND (dra.status = 'active'::text) AND ((dra.effective_from IS NULL) OR (dra.effective_from <= ((now() AT TIME ZONE 'America/Edmonton')::date))) AND ((dra.effective_to IS NULL) OR (dra.effective_to >= ((now() AT TIME ZONE 'America/Edmonton')::date)))))) OR (EXISTS ( SELECT 1
   FROM driver_trips dt
  WHERE ((dt.bus_id = buses.id) AND (dt.tenant_id = buses.tenant_id) AND (dt.driver_id = safebus_private.current_driver_id()) AND (dt.status = 'active'::text)))))));

DO $default$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bus_run_dispatches' AND column_name='service_date' AND column_default='CURRENT_DATE') THEN
    RAISE EXCEPTION 'Operational date default differs.' USING ERRCODE='55000';
  END IF;
END; $default$;
ALTER TABLE public.bus_run_dispatches ALTER COLUMN service_date SET DEFAULT ((now() AT TIME ZONE 'America/Edmonton')::date);

DO $default$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='driver_trips' AND column_name='service_date' AND column_default='CURRENT_DATE') THEN
    RAISE EXCEPTION 'Operational date default differs.' USING ERRCODE='55000';
  END IF;
END; $default$;
ALTER TABLE public.driver_trips ALTER COLUMN service_date SET DEFAULT ((now() AT TIME ZONE 'America/Edmonton')::date);

DO $default$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_bus_assignments' AND column_name='effective_from' AND column_default='CURRENT_DATE') THEN
    RAISE EXCEPTION 'Operational date default differs.' USING ERRCODE='55000';
  END IF;
END; $default$;
ALTER TABLE public.student_bus_assignments ALTER COLUMN effective_from SET DEFAULT ((now() AT TIME ZONE 'America/Edmonton')::date);

DO $default$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='student_route_assignments' AND column_name='effective_from' AND column_default='CURRENT_DATE') THEN
    RAISE EXCEPTION 'Operational date default differs.' USING ERRCODE='55000';
  END IF;
END; $default$;
ALTER TABLE public.student_route_assignments ALTER COLUMN effective_from SET DEFAULT ((now() AT TIME ZONE 'America/Edmonton')::date);

-- One confirmed incorrect service date. No historical sweep or status change.
-- The status notification trigger is not fired by an update of service_date.
UPDATE public.driver_trips SET service_date = date '2026-10-27'
WHERE id='15e88783-5c23-4f58-99f5-60e6f06dfb74'
  AND tenant_id='e19ab3b1-8346-4779-9fdb-46de90081a07'
  AND started_at=timestamptz '2026-10-28T00:39:47.930271Z'
  AND service_date=date '2026-10-28';
