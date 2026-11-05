-- Forward change only. No records are deleted and no destructive control is enabled.
-- Requires reviewed recovery and protected deployment; never replay the migration chain.
DO $$ BEGIN
  IF (SELECT destructive_enabled FROM public.retention_execution_control WHERE id=1) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Retention installation requires destructive execution disabled' USING ERRCODE='55006';
  END IF;
END $$;

CREATE TABLE safebus_private.retention_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  driver_trip_id uuid NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  reason text NOT NULL CHECK(reason IN ('incident','dispute','access_request','decision','other')),
  reference text NOT NULL CHECK(reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
  decision_used_at timestamptz,
  minimum_until timestamptz NOT NULL,
  review_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  reviewed_at timestamptz,
  released_at timestamptz,
  released_by uuid,
  CHECK(window_end >= window_start)
);
CREATE INDEX retention_cases_trip_active ON safebus_private.retention_cases(driver_trip_id,window_start,window_end) WHERE released_at IS NULL;
CREATE INDEX retention_cases_authority ON safebus_private.retention_cases(tenant_id,created_at,id);
ALTER TABLE safebus_private.retention_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.retention_cases FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE safebus_private.retention_archive_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES safebus_private.retention_cases(id) ON DELETE RESTRICT,
  object_key text NOT NULL UNIQUE DEFAULT (gen_random_uuid()::text || '.bin'),
  gps_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  deleting_at timestamptz,
  removed_at timestamptz,
  last_removed_check timestamptz,
  lease_until timestamptz NOT NULL DEFAULT now()+interval '2 minutes',
  ciphertext_sha256 text CHECK(ciphertext_sha256 ~ '^[a-f0-9]{64}$'),
  key_id text CHECK(key_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  CHECK(cardinality(gps_ids) BETWEEN 1 AND 500 OR (removed_at IS NOT NULL AND cardinality(gps_ids)=0)),
  CHECK((verified_at IS NULL AND ciphertext_sha256 IS NULL AND key_id IS NULL)
    OR (verified_at IS NOT NULL AND ciphertext_sha256 IS NOT NULL AND key_id IS NOT NULL))
);
CREATE INDEX retention_chunks_case ON safebus_private.retention_archive_chunks(case_id,created_at,id);
ALTER TABLE safebus_private.retention_archive_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.retention_archive_chunks FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE safebus_private.retention_archive_coverage (
  case_id uuid NOT NULL REFERENCES safebus_private.retention_cases(id) ON DELETE RESTRICT,
  gps_id uuid NOT NULL,
  chunk_id uuid NOT NULL REFERENCES safebus_private.retention_archive_chunks(id) ON DELETE CASCADE,
  PRIMARY KEY(case_id,gps_id)
);
ALTER TABLE safebus_private.retention_archive_coverage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.retention_archive_coverage FROM PUBLIC,anon,authenticated,service_role;

-- Hourly aggregate evidence survives lost HTTP responses; no row IDs or payloads.
CREATE TABLE safebus_private.retention_lifecycle_totals (
  window_start timestamptz PRIMARY KEY,
  completed_at timestamptz NOT NULL,
  run_count bigint NOT NULL CHECK(run_count>0),
  counts jsonb NOT NULL CHECK(jsonb_typeof(counts)='object')
);
ALTER TABLE safebus_private.retention_lifecycle_totals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.retention_lifecycle_totals FROM PUBLIC,anon,authenticated,service_role;

-- Announcement copies are not evidence of resolution. Existing records remain unresolved.
ALTER TABLE safebus_private.authority_announcements ADD COLUMN resolved_at timestamptz;

CREATE FUNCTION safebus_private.retention_authority(p_recent boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'authenticated' OR NOT coalesce(public.is_current_user_session_active(),false) THEN
    RAISE EXCEPTION 'Active session required' USING ERRCODE='42501';
  END IF;
  SELECT p.tenant_id INTO v_tenant FROM public.profiles p JOIN public.tenants t ON t.id=p.tenant_id
    WHERE p.id=auth.uid() AND p.status='active' AND t.status='active'
    AND p.role IN ('tenant_admin','transportation_admin');
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Authority administrator required' USING ERRCODE='42501'; END IF;
  PERFORM safebus_private.enforce_mfa_if_required();
  IF p_recent THEN PERFORM safebus_private.enforce_recent_auth_for_sensitive_action(); END IF;
  RETURN v_tenant;
END $$;
REVOKE ALL ON FUNCTION safebus_private.retention_authority(boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.manage_retention_case(p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_tenant uuid; v_trip public.driver_trips%ROWTYPE; v_case safebus_private.retention_cases%ROWTYPE;
  v_min timestamptz; v_used timestamptz; v_now timestamptz:=now(); v_result jsonb;
BEGIN
  v_tenant:=safebus_private.retention_authority(p_action NOT IN ('list','announcements'));
  IF p_action='list' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC,c.id),'[]') INTO v_result FROM
      (SELECT id,driver_trip_id,window_start,window_end,reason,reference,minimum_until,review_at,
        created_at,reviewed_at,released_at,
        (SELECT count(*) FROM safebus_private.retention_archive_chunks a JOIN safebus_private.retention_cases original ON original.id=a.case_id WHERE original.tenant_id=h.tenant_id AND original.driver_trip_id=h.driver_trip_id AND a.verified_at IS NOT NULL AND a.deleting_at IS NULL) AS verified_chunks
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
  IF p_action='archives' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at,a.id),'[]') INTO v_result FROM (
      SELECT c.id,c.created_at,c.object_key,c.ciphertext_sha256,c.key_id,c.case_id AS source_case_id,h.window_start,h.window_end
      FROM safebus_private.retention_cases h JOIN safebus_private.retention_cases original ON original.tenant_id=h.tenant_id AND original.driver_trip_id=h.driver_trip_id
      JOIN safebus_private.retention_archive_chunks c ON c.case_id=original.id
      WHERE h.tenant_id=v_tenant AND h.id=(p_data->>'id')::uuid AND h.released_at IS NULL AND c.verified_at IS NOT NULL AND c.deleting_at IS NULL
        AND (p_data->>'before' IS NULL OR (c.created_at,c.id)<((p_data->>'before')::timestamptz,(p_data->>'beforeId')::uuid))
      ORDER BY c.created_at DESC,c.id DESC LIMIT 20) a;
    PERFORM safebus_private.write_audit_event_legacy('data.exported','retention_case',(p_data->>'id')::uuid,
      NULL,'success',jsonb_build_object('tenant_id',v_tenant,'operation','retention.archive_access'),NULL);
    RETURN v_result;
  END IF;
  -- All source triggers take the shared counterpart before evaluating expiry.
  PERFORM pg_advisory_xact_lock(864203711);
  IF p_action='create' THEN
    SELECT * INTO v_trip FROM public.driver_trips WHERE id=(p_data->>'tripId')::uuid AND tenant_id=v_tenant;
    IF NOT FOUND THEN RAISE EXCEPTION 'Trip unavailable' USING ERRCODE='42501'; END IF;
    IF EXISTS(SELECT 1 FROM safebus_private.retention_archive_chunks a JOIN safebus_private.retention_cases h ON h.id=a.case_id
      WHERE h.tenant_id=v_tenant AND h.driver_trip_id=v_trip.id AND a.deleting_at IS NOT NULL AND a.removed_at IS NULL) THEN
      RAISE EXCEPTION 'Archive disposal in progress' USING ERRCODE='55006'; END IF;
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
      NULL,'success',jsonb_build_object('tenant_id',v_tenant,'operation','retention.resolve_announcement'),NULL);
    RETURN jsonb_build_object('resolved',true);
  ELSE RAISE EXCEPTION 'Unknown preservation action' USING ERRCODE='22023';
  END IF;
  -- Identifier-only audit; no case reference, narrative, GPS or child identity.
  PERFORM safebus_private.write_audit_event_legacy('security.config_changed','retention_case',v_case.id,
    NULL,'success',jsonb_build_object('tenant_id',v_tenant,'operation','retention.'||p_action),NULL);
  RETURN jsonb_build_object('id',v_case.id,'minimumUntil',v_case.minimum_until,'releasedAt',v_case.released_at);
END $$;
REVOKE ALL ON FUNCTION public.manage_retention_case(text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.manage_retention_case(text,jsonb) TO authenticated;

CREATE FUNCTION safebus_private.retention_trip_held(p_trip uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT EXISTS(SELECT 1 FROM safebus_private.retention_cases WHERE driver_trip_id=p_trip AND released_at IS NULL)
$$;
REVOKE ALL ON FUNCTION safebus_private.retention_trip_held(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION safebus_private.retention_source_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
    IF TG_TABLE_NAME='driver_trip_location_updates' AND to_jsonb(NEW) IS DISTINCT FROM v_data THEN
      RAISE EXCEPTION 'GPS samples are append-only' USING ERRCODE='55006';
    END IF;
    RETURN NEW;
  END IF;
  IF safebus_private.retention_source_held(TG_TABLE_NAME,v_data) THEN RAISE EXCEPTION 'Records preservation or export active' USING ERRCODE='55006'; END IF;
  IF TG_TABLE_NAME='driver_trip_location_updates' THEN
    IF greatest(OLD.recorded_at,OLD.created_at)>now()-interval '30 days' OR EXISTS(
      SELECT 1 FROM safebus_private.retention_cases h WHERE h.driver_trip_id=OLD.driver_trip_id AND h.released_at IS NULL
        AND OLD.recorded_at BETWEEN h.window_start AND h.window_end AND NOT EXISTS(
          SELECT 1 FROM safebus_private.retention_archive_coverage c JOIN safebus_private.retention_archive_chunks a ON a.id=c.chunk_id
          WHERE c.case_id=h.id AND c.gps_id=OLD.id AND a.verified_at IS NOT NULL)) THEN
      RAISE EXCEPTION 'GPS retention or preservation active' USING ERRCODE='55006';
    END IF;
  ELSIF TG_TABLE_NAME='driver_trip_current_locations' THEN
    IF greatest(OLD.recorded_at,OLD.updated_at)>now()-interval '30 days' OR EXISTS(SELECT 1 FROM safebus_private.retention_cases h WHERE h.driver_trip_id=OLD.driver_trip_id AND h.released_at IS NULL AND OLD.recorded_at BETWEEN h.window_start AND h.window_end) THEN RAISE EXCEPTION 'Current location retention active' USING ERRCODE='55006'; END IF;
  ELSIF TG_TABLE_NAME IN ('driver_trips','student_trip_events','trip_exceptions','trip_operational_statuses') THEN
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
END $$;
REVOKE ALL ON FUNCTION safebus_private.retention_source_guard() FROM PUBLIC,anon,authenticated,service_role;

DO $$ DECLARE v_table text; BEGIN
  FOREACH v_table IN ARRAY ARRAY['public.driver_trip_location_updates','public.driver_trip_current_locations','public.driver_trips','public.student_trip_events',
    'public.trip_exceptions','public.trip_operational_statuses','public.user_notifications','public.guardian_notification_outbox',
    'public.push_notification_outbox','safebus_private.authority_announcements'] LOOP
    EXECUTE format('CREATE TRIGGER retention_source_guard BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION safebus_private.retention_source_guard()',v_table);
  END LOOP;
END $$;

-- Preserve routine identities and dry-run contracts; close both legacy destructive paths.
DO $guard$ DECLARE v_signature text; v_definition text; BEGIN
  FOREACH v_signature IN ARRAY ARRAY['safebus_private.run_retention_deletion(text,boolean)','public.apply_notification_retention(boolean)'] LOOP
    v_definition:=pg_get_functiondef(v_signature::regprocedure);
    IF md5(replace(v_definition,chr(13),'')) IS DISTINCT FROM (CASE v_signature
      WHEN 'safebus_private.run_retention_deletion(text,boolean)' THEN '0bd79a388362468846db861d3bf86e92'
      ELSE '42e79ab63ad88f51d1f995cc1300fe55' END) THEN
      RAISE EXCEPTION 'Legacy retention baseline drift' USING ERRCODE='55006'; END IF;
    v_definition:=regexp_replace(v_definition,'\mbegin\M',
      E'begin\n  IF p_dry_run IS DISTINCT FROM true THEN RAISE EXCEPTION \'Legacy retention is observation only\' USING ERRCODE=\'55006\'; END IF;', 'i');
    EXECUTE v_definition;
  END LOOP;
END $guard$;

CREATE FUNCTION public.run_retention_lifecycle(p_dry_run boolean DEFAULT true,p_limit integer DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_class text; v_table text; v_where text; v_order text; v_pk text; v_ids uuid[]; v_count integer; v_result jsonb:='{}';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
  IF p_dry_run IS NULL OR p_limit NOT BETWEEN 1 AND 500 OR p_limit IS NULL THEN
    RAISE EXCEPTION 'Invalid batch' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(864203711);
  IF NOT p_dry_run AND NOT EXISTS(SELECT 1 FROM public.retention_execution_control WHERE id=1 AND destructive_enabled
    AND approval_reference IS NOT NULL AND approved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Destructive retention disabled' USING ERRCODE='55006'; END IF;
  FOREACH v_class IN ARRAY ARRAY['email','push','inbox','gps','current_cache','student_events','exceptions','statuses','announcements','bus_tracking_sessions','bus_run_dispatches','trip_records','guardian_relationships','student_records','driver_records','invitations','audit_records','rate_limit_buckets','user_sessions','export_manifests','export_jobs','business_metadata','archive_manifests','cases','record_holds'] LOOP
    v_pk:='id'; v_order:='s.id';
    CASE v_class
    WHEN 'gps' THEN
      v_table:='public.driver_trip_location_updates'; v_order:='greatest(s.recorded_at,s.created_at),s.id';
      v_where:=$q$greatest(s.recorded_at,s.created_at)<now()-interval '30 days' AND NOT EXISTS(
        SELECT 1 FROM safebus_private.retention_cases h WHERE h.driver_trip_id=s.driver_trip_id AND h.released_at IS NULL
          AND s.recorded_at BETWEEN h.window_start AND h.window_end AND NOT EXISTS(
            SELECT 1 FROM safebus_private.retention_archive_coverage c JOIN safebus_private.retention_archive_chunks a ON a.id=c.chunk_id
            WHERE c.case_id=h.id AND c.gps_id=s.id AND a.verified_at IS NOT NULL))$q$;
    WHEN 'current_cache' THEN
      v_table:='public.driver_trip_current_locations';v_pk:='driver_trip_id';v_order:='greatest(s.recorded_at,s.updated_at),s.driver_trip_id';
      v_where:=$q$greatest(s.recorded_at,s.updated_at)<now()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM safebus_private.retention_cases h WHERE h.driver_trip_id=s.driver_trip_id AND h.released_at IS NULL AND s.recorded_at BETWEEN h.window_start AND h.window_end)$q$;
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
    WHEN 'bus_tracking_sessions' THEN
      v_table:='public.bus_tracking_sessions';
      v_where:=$q$(s.status IN ('ended','revoked') OR s.expires_at<now()) AND greatest(s.ended_at,s.expires_at)<now()-interval '30 days'$q$;
    WHEN 'bus_run_dispatches' THEN
      v_table:='public.bus_run_dispatches';
      v_where:=$q$s.status IN ('completed','cancelled') AND greatest(s.completed_at,s.cancelled_at,s.prepared_at)<now()-interval '395 days'
        AND (s.driver_trip_id IS NULL OR NOT safebus_private.retention_trip_held(s.driver_trip_id))$q$;
    WHEN 'trip_records' THEN
      v_table:='public.driver_trips';
      v_where:=$q$s.status IN ('completed','cancelled') AND s.ended_at<now()-interval '395 days' AND greatest(s.created_at,s.updated_at,s.ended_at)<now()-interval '395 days'
        AND NOT safebus_private.retention_trip_held(s.id)
        AND NOT EXISTS(SELECT 1 FROM public.bus_run_dispatches a WHERE a.driver_trip_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM public.bus_tracking_sessions a WHERE a.driver_trip_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM public.driver_trip_location_updates a WHERE a.driver_trip_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM public.driver_trip_current_locations a WHERE a.driver_trip_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM public.student_trip_events a WHERE a.driver_trip_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM public.trip_exceptions a WHERE a.driver_trip_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM public.trip_operational_statuses a WHERE a.driver_trip_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM public.user_notifications a WHERE a.driver_trip_id=s.id)$q$;
    WHEN 'guardian_relationships' THEN
      v_table:='public.student_guardians';
      v_where:=$q$(CASE WHEN s.status IN ('inactive','archived') THEN s.updated_at WHEN s.revoked_at IS NOT NULL THEN greatest(s.updated_at,s.revoked_at)
        WHEN s.access_expires_at<=now() THEN greatest(s.updated_at,s.access_expires_at)
        ELSE (SELECT greatest(s.updated_at,p.updated_at) FROM public.students p WHERE p.id=s.student_id AND p.status IN ('inactive','transferred','archived')) END)<now()-interval '395 days'$q$;
    WHEN 'student_records' THEN
      v_table:='public.students';
      v_where:=$q$s.status IN ('inactive','transferred','archived') AND s.updated_at<now()-interval '395 days'
        AND NOT EXISTS(SELECT 1 FROM public.student_guardians a WHERE a.student_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM public.student_trip_events a WHERE a.student_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM public.guardian_notification_outbox a WHERE a.student_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM public.user_notifications a WHERE a.student_id=s.id)$q$;
    WHEN 'driver_records' THEN
      v_table:='public.drivers';
      v_where:=$q$s.status IN ('inactive','suspended','archived') AND s.retention_redacted_at IS NULL AND s.updated_at<now()-interval '395 days'
        AND NOT EXISTS(SELECT 1 FROM public.driver_trips a WHERE a.driver_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM public.bus_run_dispatches a WHERE a.claimed_by_driver_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM public.bus_tracking_sessions a WHERE a.driver_id=s.id)$q$;
    WHEN 'invitations' THEN
      v_table:='public.tenant_onboarding_invitations';
      v_where:=$q$(s.status IN ('activated','cancelled','failed','expired','revoked') OR s.expires_at<now())
        AND greatest(s.updated_at,s.cancelled_at,s.revoked_at,s.expires_at)<now()-interval '90 days'$q$;
    WHEN 'audit_records' THEN
      v_table:='public.audit_events';
      v_where:=$q$s.created_at<now()-interval '730 days' AND s.retention_redacted_at IS NULL
        AND (s.actor_profile_id IS NOT NULL OR s.actor_email IS NOT NULL OR s.target_id IS NOT NULL OR s.target_label IS NOT NULL OR s.ip_address IS NOT NULL OR s.detail<>'{}'::jsonb)$q$;
    WHEN 'rate_limit_buckets' THEN
      v_table:='public.rate_limit_buckets';v_where:=$q$s.window_start<now()-interval '2 days'$q$;
    WHEN 'user_sessions' THEN
      v_table:='public.user_sessions';v_where:=$q$coalesce(s.revoked_at,s.last_active_at)<now()-interval '90 days'
        AND NOT EXISTS(SELECT 1 FROM auth.sessions a WHERE a.id=s.id AND (a.not_after IS NULL OR a.not_after>now()))$q$;
    WHEN 'record_holds' THEN
      v_table:='safebus_private.retention_record_holds';v_where:=$q$s.state='released' AND s.released_at<now()-interval '395 days'$q$;
    WHEN 'export_manifests' THEN
      v_table:='safebus_private.retention_export_chunks';v_where:=$q$s.removed_at<now()-interval '395 days' AND s.last_removed_check>now()-interval '1 day'$q$;
    WHEN 'export_jobs' THEN
      v_table:='safebus_private.retention_export_jobs';v_where:=$q$s.state IN ('expired','cancelled') AND s.expires_at<now()-interval '395 days' AND NOT EXISTS(SELECT 1 FROM safebus_private.retention_export_chunks a WHERE a.export_id=s.id)$q$;
    WHEN 'business_metadata' THEN
      v_table:='safebus_private.retention_business_records';v_where:=$q$s.disposal_state='disposed' AND s.disposed_at<now()-interval '395 days'$q$;
    WHEN 'archive_manifests' THEN
      v_table:='safebus_private.retention_archive_chunks';
      v_where:=$q$s.removed_at<now()-interval '395 days' AND s.last_removed_check>now()-interval '1 day'$q$;
    WHEN 'cases' THEN
      v_table:='safebus_private.retention_cases';
      v_where:=$q$s.released_at<now()-interval '395 days' AND s.minimum_until<now()
        AND NOT EXISTS(SELECT 1 FROM safebus_private.retention_archive_chunks a WHERE a.case_id=s.id)$q$;
    WHEN 'inbox' THEN
      v_table:='public.user_notifications';
      v_where:=$q$s.created_at<now()-interval '90 days'
        AND NOT EXISTS(SELECT 1 FROM public.guardian_notification_outbox o WHERE o.user_notification_id=s.id)
        AND NOT EXISTS(SELECT 1 FROM public.push_notification_outbox o WHERE o.notification_id=s.id)$q$;
    END CASE;
    IF v_class NOT IN ('export_manifests','export_jobs','archive_manifests','cases','record_holds') THEN v_where:=v_where||format(' AND NOT safebus_private.retention_source_held(%L,to_jsonb(s))',split_part(v_table,'.',2)); END IF;
    EXECUTE format('SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) FROM (SELECT s.%I AS id FROM %s s WHERE %s ORDER BY %s LIMIT $1) eligible',v_pk,v_table,v_where,v_order)
      INTO v_ids USING p_limit;
    v_count:=cardinality(v_ids);
    IF NOT p_dry_run THEN
      PERFORM set_config('safebus.retention_run','on',true);
      IF v_class='driver_records' THEN
        UPDATE public.drivers SET employee_number=NULL,phone=NULL,license_number=NULL,license_issue_date=NULL,license_expiry_date=NULL,license_class=NULL,
          address_line1=NULL,address_line2=NULL,city=NULL,province=NULL,postal_code=NULL,status='archived',retention_redacted_at=now() WHERE id=ANY(v_ids);
        GET DIAGNOSTICS v_count=ROW_COUNT;
        UPDATE public.profiles p SET first_name='Deleted',last_name='Driver',full_name='Deleted Driver',email='deleted+'||replace(p.id::text,'-','')||'@invalid.safebus.local',status='disabled'
          WHERE p.id IN (SELECT d.profile_id FROM public.drivers d WHERE d.id=ANY(v_ids)) AND p.role='driver';
      ELSIF v_class='audit_records' THEN
        UPDATE public.audit_events SET actor_profile_id=NULL,actor_email=NULL,target_id=NULL,target_label=NULL,detail='{}'::jsonb,ip_address=NULL,retention_redacted_at=now() WHERE id=ANY(v_ids);
        GET DIAGNOSTICS v_count=ROW_COUNT;
      ELSE EXECUTE format('DELETE FROM %s WHERE %I=ANY($1)',v_table,v_pk) USING v_ids; GET DIAGNOSTICS v_count=ROW_COUNT;
      END IF;
    END IF;
    v_result:=v_result||jsonb_build_object(v_class,v_count);
  END LOOP;
  IF NOT p_dry_run THEN
    INSERT INTO safebus_private.retention_lifecycle_totals AS totals(window_start,completed_at,run_count,counts)
      VALUES(date_trunc('hour',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',now(),1,v_result)
    ON CONFLICT(window_start) DO UPDATE SET completed_at=excluded.completed_at,run_count=totals.run_count+1,
      counts=(SELECT jsonb_object_agg(key,(value::bigint+coalesce((totals.counts->>key)::bigint,0)))
        FROM jsonb_each_text(excluded.counts));
    DELETE FROM safebus_private.retention_lifecycle_totals WHERE window_start<now()-interval '395 days';
  END IF;
  RETURN jsonb_build_object('version',1,'dryRun',p_dry_run,'limit',p_limit,'counts',v_result);
END $$;
REVOKE ALL ON FUNCTION public.run_retention_lifecycle(boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_retention_lifecycle(boolean,integer) TO service_role;

CREATE FUNCTION public.retention_archive_work(p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_case safebus_private.retention_cases%ROWTYPE; v_chunk safebus_private.retention_archive_chunks%ROWTYPE;
  v_ids uuid[]; v_payload jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(864203711);
  IF p_action='status' THEN
    SELECT jsonb_build_object('windowStart',window_start,'completedAt',completed_at,'runCount',run_count,'counts',counts)
      INTO v_payload FROM safebus_private.retention_lifecycle_totals ORDER BY window_start DESC LIMIT 1;
    RETURN v_payload;
  END IF;
  IF p_action='next' THEN
    -- Retry a pending chunk first. A released case is cleaned instead of archived.
    SELECT a.* INTO v_chunk FROM safebus_private.retention_archive_chunks a JOIN safebus_private.retention_cases h ON h.id=a.case_id
      WHERE a.verified_at IS NULL AND h.released_at IS NULL ORDER BY a.created_at,a.id LIMIT 1;
    IF NOT FOUND THEN
      SELECT h.* INTO v_case FROM safebus_private.retention_cases h WHERE h.released_at IS NULL AND EXISTS(
        SELECT 1 FROM public.driver_trip_location_updates g WHERE g.driver_trip_id=h.driver_trip_id
          AND g.recorded_at BETWEEN h.window_start AND h.window_end AND NOT EXISTS(
            SELECT 1 FROM safebus_private.retention_archive_coverage c WHERE c.case_id=h.id AND c.gps_id=g.id))
        ORDER BY h.created_at,h.id LIMIT 1;
      IF NOT FOUND THEN RETURN NULL; END IF;
      SELECT array_agg(g.id ORDER BY g.recorded_at,g.id) INTO v_ids FROM (SELECT s.id,s.recorded_at FROM public.driver_trip_location_updates s
        WHERE s.driver_trip_id=v_case.driver_trip_id AND s.recorded_at BETWEEN v_case.window_start AND v_case.window_end
          AND NOT EXISTS(SELECT 1 FROM safebus_private.retention_archive_coverage c WHERE c.case_id=v_case.id AND c.gps_id=s.id)
        ORDER BY s.recorded_at,s.id LIMIT 500) g;
      INSERT INTO safebus_private.retention_archive_chunks(case_id,gps_ids) VALUES(v_case.id,v_ids) RETURNING * INTO v_chunk;
      INSERT INTO safebus_private.retention_archive_coverage(case_id,gps_id,chunk_id) SELECT v_case.id,unnest(v_ids),v_chunk.id;
    END IF;
    UPDATE safebus_private.retention_archive_chunks SET lease_until=now()+interval '2 minutes' WHERE id=v_chunk.id;
    SELECT jsonb_build_object('version',1,'chunkId',v_chunk.id,'caseId',v_chunk.case_id,'samples',jsonb_agg(to_jsonb(g) ORDER BY g.recorded_at,g.id))
      INTO v_payload FROM public.driver_trip_location_updates g WHERE g.id=ANY(v_chunk.gps_ids);
    IF jsonb_array_length(v_payload->'samples')<>cardinality(v_chunk.gps_ids) THEN
      RAISE EXCEPTION 'Archive source incomplete' USING ERRCODE='55006'; END IF;
    RETURN jsonb_build_object('id',v_chunk.id,'objectKey',v_chunk.object_key,'payload',v_payload);
  ELSIF p_action='verify' THEN
    UPDATE safebus_private.retention_archive_chunks SET verified_at=now(),ciphertext_sha256=p_data->>'sha256',key_id=p_data->>'keyId'
      WHERE id=(p_data->>'id')::uuid AND verified_at IS NULL
        AND EXISTS(SELECT 1 FROM safebus_private.retention_cases h WHERE h.id=case_id AND h.released_at IS NULL);
    RETURN jsonb_build_object('verified',FOUND);
  ELSIF p_action='cleanup' THEN
    SELECT a.* INTO v_chunk FROM safebus_private.retention_archive_chunks a JOIN safebus_private.retention_cases h ON h.id=a.case_id
      WHERE h.released_at<now()-interval '5 minutes' AND a.lease_until<now()
        AND (a.last_removed_check IS NULL OR a.last_removed_check<now()-interval '1 day')
        AND (a.removed_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM safebus_private.retention_cases active_hold WHERE active_hold.tenant_id=h.tenant_id AND active_hold.driver_trip_id=h.driver_trip_id AND active_hold.released_at IS NULL)) ORDER BY a.created_at,a.id LIMIT 1;
    IF NOT FOUND THEN RETURN NULL; END IF;
    UPDATE safebus_private.retention_archive_chunks SET deleting_at=coalesce(deleting_at,now()) WHERE id=v_chunk.id;
    RETURN jsonb_build_object('id',v_chunk.id,'objectKey',v_chunk.object_key);
  ELSIF p_action='removed' THEN
    SELECT a.* INTO v_chunk FROM safebus_private.retention_archive_chunks a WHERE a.id=(p_data->>'id')::uuid AND a.deleting_at IS NOT NULL
      AND EXISTS(SELECT 1 FROM safebus_private.retention_cases h WHERE h.id=a.case_id AND h.released_at IS NOT NULL);
    IF NOT FOUND THEN RETURN jsonb_build_object('removed',false); END IF;
    DELETE FROM safebus_private.retention_archive_coverage WHERE chunk_id=v_chunk.id;
    UPDATE safebus_private.retention_archive_chunks SET removed_at=coalesce(removed_at,now()),last_removed_check=now(),gps_ids=ARRAY[]::uuid[] WHERE id=v_chunk.id;
    RETURN jsonb_build_object('removed',true);
  ELSE RAISE EXCEPTION 'Unknown archive action' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.retention_archive_work(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retention_archive_work(text,jsonb) TO service_role;

-- Application encryption is additional to private Storage authorization.
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='retention-evidence') THEN
    RAISE EXCEPTION 'Archive bucket baseline differs from reviewed absence' USING ERRCODE='55006';
  END IF;
END $$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('retention-evidence','retention-evidence',false,2000000,ARRAY['application/octet-stream']);
CREATE POLICY retention_evidence_client_denial ON storage.objects AS RESTRICTIVE FOR ALL TO anon,authenticated
  USING(bucket_id<>'retention-evidence') WITH CHECK(bucket_id<>'retention-evidence');

CREATE INDEX retention_gps_expiry ON public.driver_trip_location_updates(greatest(recorded_at,created_at),id);

-- Owner-approved expansion: class registry, scoped requests and controlled exports.
CREATE TABLE safebus_private.retention_class_rules (
  data_class text PRIMARY KEY,label text NOT NULL,scope text NOT NULL CHECK(scope IN ('authority','security','business','shared')),
  days integer CHECK(days>0),method text NOT NULL CHECK(method IN ('delete','redact','calendar','case_specific','provider')),
  trigger_description text NOT NULL
);
INSERT INTO safebus_private.retention_class_rules VALUES
 ('invitations','Invitations','authority',90,'delete','After activation, cancellation, revocation or expiry activity'),
 ('student_records','Student transport records','authority',395,'delete','After inactivity and dependent records qualify'),
 ('guardian_relationships','Guardian relationships','authority',395,'delete','After relationship or student inactivity, revocation or access expiry'),
 ('driver_records','Driver operational details','authority',395,'redact','After inactivity and required trip/hold dependencies'),
 ('bus_tracking_sessions','Ended tracking credentials','authority',30,'delete','After end, revocation or expiry; credential hashes are never exported'),
 ('bus_run_dispatches','Completed dispatches','authority',395,'delete','After completion or cancellation'),
 ('trip_records','Completed trips','authority',395,'delete','After trip end and dependent records qualify'),
 ('raw_location_history','Bus GPS samples','authority',30,'delete','After both recording and receipt'),
 ('student_events','Pickup and drop-off events','authority',395,'delete','After trip end or later receipt'),
 ('exceptions','Trip exceptions','authority',395,'delete','After trip end or later receipt'),
 ('statuses','Operational trip statuses','authority',395,'delete','After trip end or later update'),
 ('announcements','Service announcements','authority',395,'delete','After explicit resolution'),
 ('email','Email delivery records','authority',90,'delete','After terminal delivery outcome'),
 ('push','Push delivery records','authority',90,'delete','After terminal delivery outcome'),
 ('inbox','Inbox copies','authority',90,'delete','After creation and dependent delivery expiry'),
 ('audit_records','Identifying audit details','shared',730,'redact','After creation; remaining action and time data may still be identifying'),
 ('rate_limit_buckets','Abuse counters','security',2,'delete','After counter window'),
 ('user_sessions','Revoked session mirrors','shared',90,'delete','After revocation, only once canonical Auth is absent or expired'),
 ('inquiries','Resolved business inquiries','business',90,'delete','After resolution without a continuing relationship'),
 ('support_records','Ordinary resolved support','business',365,'delete','After resolution; privacy and incidents use case-specific retention'),
 ('financial_records','Finance and tax records','business',NULL,'calendar','Six years after fiscal year end, extended for late filing and legal exceptions'),
 ('personnel_records','Personnel and privacy training','business',NULL,'case_specific','Documented minimum and review; no universal period is inferred'),
 ('privacy_case_records','Privacy, incident and legal cases','business',NULL,'case_specific','Documented case-specific minimum, review and explicit closure'),
 ('supplier_logs','Supplier-held copies and logs','business',NULL,'provider','Verified supplier window and actual disposal or expiry confirmation'),
 ('recovery_copies','Owner-controlled recovery copies','business',30,'delete','After creation, excluding active preservation and required key custody');
ALTER TABLE safebus_private.retention_class_rules ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.retention_class_rules FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE safebus_private.retention_record_holds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,data_class text NOT NULL REFERENCES safebus_private.retention_class_rules(data_class),
 record_id uuid,window_start timestamptz,window_end timestamptz,
 reference text NOT NULL CHECK(reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
 reason text NOT NULL CHECK(reason IN ('incident','dispute','access_request','decision','other')),
 minimum_until timestamptz NOT NULL,review_at timestamptz NOT NULL,decision_used_at timestamptz,
 state text NOT NULL CHECK(state IN ('requested','active','released')),
 requested_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,released_at timestamptz,released_by uuid,
 CHECK(window_start IS NULL OR window_end>=window_start)
);
CREATE INDEX retention_record_holds_scope ON safebus_private.retention_record_holds(tenant_id,data_class,record_id) WHERE state<>'released';
ALTER TABLE safebus_private.retention_record_holds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.retention_record_holds FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE safebus_private.retention_export_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,data_class text NOT NULL REFERENCES safebus_private.retention_class_rules(data_class),
 record_id uuid,window_start timestamptz,window_end timestamptz,requested_by uuid NOT NULL,requester_role text NOT NULL,approved_by uuid,
 reference text NOT NULL CHECK(reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
 state text NOT NULL CHECK(state IN ('requested','approved','running','ready','cancelled','expired')),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 cursor_id uuid,finished_at timestamptz,row_count bigint NOT NULL DEFAULT 0,error_code text,
 CHECK(window_start IS NULL OR window_end>=window_start)
);
CREATE INDEX retention_export_jobs_work ON safebus_private.retention_export_jobs(created_at,id) WHERE state IN ('approved','running');
CREATE INDEX retention_export_jobs_authority ON safebus_private.retention_export_jobs(tenant_id,created_at,id);
ALTER TABLE safebus_private.retention_export_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.retention_export_jobs FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE safebus_private.retention_export_chunks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),export_id uuid NOT NULL REFERENCES safebus_private.retention_export_jobs(id) ON DELETE RESTRICT,
 object_key text NOT NULL UNIQUE,payload jsonb,row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 200),last_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz NOT NULL DEFAULT now()+interval '2 minutes',
 verified_at timestamptz,key_id text,ciphertext_sha256 text,removing_at timestamptz,removed_at timestamptz,last_removed_check timestamptz,
 CHECK(ciphertext_sha256 IS NULL OR ciphertext_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE INDEX retention_export_chunks_job ON safebus_private.retention_export_chunks(export_id,created_at,id);
ALTER TABLE safebus_private.retention_export_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.retention_export_chunks FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE safebus_private.retention_business_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),data_class text NOT NULL REFERENCES safebus_private.retention_class_rules(data_class),
 reference text NOT NULL CHECK(reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
 source_type text NOT NULL CHECK(source_type IN ('managed_file','external_mail','provider_record','metadata_only')),
 provider text,source_reference jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,
 fiscal_year_end date,late_filed_at date,minimum_until timestamptz,review_at timestamptz,
 classification text NOT NULL CHECK(classification IN ('ordinary','historical_corporate','long_term_property','objection','personnel','privacy_case','supplier_window','key_custody')),
 continuing_relationship boolean NOT NULL DEFAULT false,
 object_key text,key_id text,ciphertext_sha256 text,
 disposal_state text NOT NULL DEFAULT 'retained' CHECK(disposal_state IN ('retained','due','removing','provider_pending','disposed')),
 disposal_started_at timestamptz,disposed_at timestamptz,provider_confirmed_at timestamptz,provider_evidence_reference text,
 created_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX retention_business_records_due ON safebus_private.retention_business_records(disposal_state,created_at,id);
ALTER TABLE safebus_private.retention_business_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.retention_business_records FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION safebus_private.retention_operator(p_recent boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE p public.profiles%ROWTYPE;
BEGIN
 IF auth.role() IS DISTINCT FROM 'authenticated' OR NOT coalesce(public.is_current_user_session_active(),false) THEN RAISE EXCEPTION 'Active session required' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN ('tenant_admin','transportation_admin','platform_super_admin');
 IF NOT FOUND OR (p.role<>'platform_super_admin' AND NOT EXISTS(SELECT 1 FROM public.tenants t WHERE t.id=p.tenant_id AND t.status='active')) THEN RAISE EXCEPTION 'Authorized administrator required' USING ERRCODE='42501'; END IF;
 PERFORM safebus_private.enforce_mfa_if_required();
 IF p_recent THEN PERFORM safebus_private.enforce_recent_auth_for_sensitive_action(); END IF;
 RETURN jsonb_build_object('id',p.id,'tenantId',p.tenant_id,'role',p.role);
END $$;
REVOKE ALL ON FUNCTION safebus_private.retention_operator(boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION safebus_private.retention_time(p_data jsonb,p_key text) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE v timestamptz;
BEGIN
 v:=nullif(p_data->>p_key,'')::timestamptz;
 IF v IS NOT NULL AND NOT isfinite(v) THEN RAISE EXCEPTION 'Finite date required' USING ERRCODE='22023'; END IF;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION safebus_private.retention_time(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

-- Fixed table mapping and credential exclusion; no caller SQL or table name is accepted.
CREATE FUNCTION safebus_private.retention_dataset(p_class text,p_tenant uuid,p_after uuid DEFAULT NULL,p_record uuid DEFAULT NULL,p_from timestamptz DEFAULT NULL,p_until timestamptz DEFAULT NULL,p_created_before timestamptz DEFAULT NULL,p_limit integer DEFAULT 200,p_search text DEFAULT NULL)
RETURNS TABLE(id uuid,tenant_id uuid,scope_at timestamptz,record_created_at timestamptz,payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_table text;v_tenant text:='s.tenant_id';v_scope text:='s.created_at';v_created text:='s.created_at';v_payload text;
BEGIN
 IF p_limit NOT BETWEEN 1 AND 200 OR p_limit IS NULL OR length(coalesce(p_search,''))>100 THEN RAISE EXCEPTION 'Invalid record page' USING ERRCODE='22023'; END IF;
 v_table:=CASE p_class WHEN 'invitations' THEN 'public.tenant_onboarding_invitations' WHEN 'student_records' THEN 'public.students'
 WHEN 'guardian_relationships' THEN 'public.student_guardians' WHEN 'driver_records' THEN 'public.drivers'
 WHEN 'bus_tracking_sessions' THEN 'public.bus_tracking_sessions' WHEN 'bus_run_dispatches' THEN 'public.bus_run_dispatches'
 WHEN 'trip_records' THEN 'public.driver_trips' WHEN 'raw_location_history' THEN 'public.driver_trip_location_updates'
 WHEN 'student_events' THEN 'public.student_trip_events' WHEN 'exceptions' THEN 'public.trip_exceptions'
 WHEN 'statuses' THEN 'public.trip_operational_statuses' WHEN 'announcements' THEN 'safebus_private.authority_announcements'
 WHEN 'email' THEN 'public.guardian_notification_outbox' WHEN 'push' THEN 'public.push_notification_outbox'
 WHEN 'inbox' THEN 'public.user_notifications' WHEN 'audit_records' THEN 'public.audit_events'
 WHEN 'rate_limit_buckets' THEN 'public.rate_limit_buckets' WHEN 'user_sessions' THEN 'public.user_sessions' ELSE NULL END;
 IF v_table IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM safebus_private.retention_class_rules WHERE data_class=p_class AND scope='business') THEN RAISE EXCEPTION 'Unknown class' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT s.id,NULL::uuid,s.created_at,s.created_at,to_jsonb(s)-ARRAY['object_key','key_id','ciphertext_sha256','source_reference']
   FROM safebus_private.retention_business_records s WHERE p_tenant IS NULL AND s.data_class=p_class AND s.disposal_state NOT IN ('disposed','removing')
    AND (p_after IS NULL OR s.id>p_after) AND (p_record IS NULL OR s.id=p_record) AND (p_from IS NULL OR s.created_at>=p_from) AND (p_until IS NULL OR s.created_at<=p_until)
    AND (p_created_before IS NULL OR s.created_at<=p_created_before) AND (p_search IS NULL OR s.reference ILIKE '%'||p_search||'%') ORDER BY s.id LIMIT p_limit;RETURN;
 END IF;
 IF p_class='rate_limit_buckets' THEN v_tenant:='NULL::uuid';v_scope:='s.window_start';v_created:=v_scope;
 ELSIF p_class='bus_run_dispatches' THEN v_scope:='s.prepared_at';v_created:=v_scope;
 ELSIF p_class='bus_tracking_sessions' THEN v_scope:='s.started_at';v_created:=v_scope;
 ELSIF p_class='statuses' THEN v_scope:='s.set_at';v_created:=v_scope;
 ELSIF p_class='raw_location_history' THEN v_scope:='s.recorded_at';
 ELSIF p_class='student_events' THEN v_scope:='s.event_time'; END IF;
 v_payload:='(SELECT coalesce(jsonb_object_agg(k,v),''{}''::jsonb) FROM jsonb_each(to_jsonb(s)) e(k,v) WHERE k !~* ''(token|secret|password|credential|ciphertext)'' AND k NOT IN (''last_delivery_error'',''failure_reason''))';
 RETURN QUERY EXECUTE format('SELECT s.id,%1$s,%2$s,%3$s,%4$s FROM %5$s s WHERE %1$s IS NOT DISTINCT FROM $1
  AND ($2 IS NULL OR s.id>$2) AND ($3 IS NULL OR s.id=$3) AND ($4 IS NULL OR %2$s>=$4) AND ($5 IS NULL OR %2$s<=$5)
  AND ($6 IS NULL OR %3$s<=$6) AND ($8 IS NULL OR (%4$s)::text ILIKE ''%%''||$8||''%%'') ORDER BY s.id LIMIT $7',v_tenant,v_scope,v_created,v_payload,v_table)
 USING p_tenant,p_after,p_record,p_from,p_until,p_created_before,p_limit,p_search;
END $$;
REVOKE ALL ON FUNCTION safebus_private.retention_dataset(text,uuid,uuid,uuid,timestamptz,timestamptz,timestamptz,integer,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION safebus_private.retention_record_held(p_tenant uuid,p_class text,p_id uuid,p_at timestamptz) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM safebus_private.retention_record_holds h WHERE h.tenant_id IS NOT DISTINCT FROM p_tenant AND h.data_class=p_class AND h.state<>'released'
  AND (h.record_id IS NULL OR h.record_id=p_id) AND (h.window_start IS NULL OR p_at>=h.window_start) AND (h.window_end IS NULL OR p_at<=h.window_end))
 OR EXISTS(SELECT 1 FROM safebus_private.retention_export_jobs e WHERE e.tenant_id IS NOT DISTINCT FROM p_tenant AND e.data_class=p_class
  AND e.state IN ('requested','approved','running','ready') AND e.expires_at>now() AND p_at<=e.created_at
  AND (e.record_id IS NULL OR e.record_id=p_id) AND (e.window_start IS NULL OR p_at>=e.window_start) AND (e.window_end IS NULL OR p_at<=e.window_end));
$$;
REVOKE ALL ON FUNCTION safebus_private.retention_record_held(uuid,text,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION safebus_private.retention_business_due(p_record safebus_private.retention_business_records) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE v_due timestamptz;v_days integer;
BEGIN
 IF p_record.disposal_state='disposed' OR p_record.classification IN ('historical_corporate','long_term_property','objection','key_custody') THEN RETURN NULL; END IF;
 SELECT days INTO v_days FROM safebus_private.retention_class_rules WHERE data_class=p_record.data_class;
 IF p_record.data_class='inquiries' THEN
   IF p_record.continuing_relationship OR p_record.resolved_at IS NULL THEN RETURN NULL; END IF;
   v_due:=p_record.resolved_at+interval '90 days';
 ELSIF p_record.data_class='support_records' THEN
   IF p_record.resolved_at IS NULL OR p_record.classification<>'ordinary' THEN RETURN NULL; END IF;
   v_due:=p_record.resolved_at+interval '365 days';
 ELSIF p_record.data_class='financial_records' THEN
   IF p_record.fiscal_year_end IS NULL THEN RETURN NULL; END IF;
   v_due:=((p_record.fiscal_year_end+interval '6 years 1 day') AT TIME ZONE 'America/Edmonton');
   IF p_record.late_filed_at IS NOT NULL THEN v_due:=greatest(v_due,((p_record.late_filed_at+interval '6 years 1 day') AT TIME ZONE 'America/Edmonton')); END IF;
 ELSIF p_record.data_class='recovery_copies' THEN v_due:=p_record.created_at+interval '30 days';
 ELSE
   IF p_record.minimum_until IS NULL OR p_record.resolved_at IS NULL THEN RETURN NULL; END IF;
   v_due:=p_record.minimum_until;
 END IF;
 RETURN greatest(v_due,p_record.minimum_until);
END $$;
REVOKE ALL ON FUNCTION safebus_private.retention_business_due(safebus_private.retention_business_records) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.manage_records_retention(p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE c jsonb;v_role text;v_tenant uuid;v_target uuid;v_class text;v_scope text;v_id uuid;v_from timestamptz;v_until timestamptz;v_used timestamptz;
 v_min timestamptz;v_review timestamptz;v_result jsonb;h safebus_private.retention_record_holds%ROWTYPE;e safebus_private.retention_export_jobs%ROWTYPE;b safebus_private.retention_business_records%ROWTYPE;
BEGIN
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>8192 THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 c:=safebus_private.retention_operator(p_action NOT IN ('overview','records','business_records'));
 v_role:=c->>'role';v_tenant:=(c->>'tenantId')::uuid;
 IF p_action='overview' THEN
  RETURN jsonb_build_object(
   'rules',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.label),'[]') FROM safebus_private.retention_class_rules r WHERE v_role='platform_super_admin' OR (r.scope IN ('authority','shared') AND (v_role='tenant_admin' OR r.data_class NOT IN ('audit_records','user_sessions','invitations')))),
   'holds',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC),'[]') FROM (SELECT * FROM safebus_private.retention_record_holds WHERE ((tenant_id=v_tenant AND v_role<>'platform_super_admin' AND (v_role='tenant_admin' OR data_class NOT IN ('audit_records','user_sessions','invitations'))) OR (requested_by=auth.uid() AND v_role='platform_super_admin')) AND (p_data->>'holdBefore' IS NULL OR (created_at,id)<((p_data->>'holdBefore')::timestamptz,(p_data->>'holdBeforeId')::uuid)) ORDER BY created_at DESC,id DESC LIMIT 50) s),
   'exports',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC),'[]') FROM (SELECT * FROM safebus_private.retention_export_jobs WHERE ((v_role='platform_super_admin' AND requested_by=auth.uid()) OR (tenant_id=v_tenant AND (v_role='tenant_admin' OR (requested_by=auth.uid() AND data_class NOT IN ('audit_records','user_sessions','invitations'))))) AND (p_data->>'exportBefore' IS NULL OR (created_at,id)<((p_data->>'exportBefore')::timestamptz,(p_data->>'exportBeforeId')::uuid)) ORDER BY created_at DESC,id DESC LIMIT 50) s),
   'execution',CASE WHEN v_role='platform_super_admin' THEN (SELECT jsonb_build_object('completedAt',completed_at,'runCount',run_count,'counts',counts) FROM safebus_private.retention_lifecycle_totals ORDER BY window_start DESC LIMIT 1) ELSE NULL END,
   'automaticDisposalEnabled',(SELECT destructive_enabled FROM public.retention_execution_control WHERE id=1));
 END IF;
 IF p_action='records' THEN
  v_class:=p_data->>'dataClass';SELECT scope INTO v_scope FROM safebus_private.retention_class_rules WHERE data_class=v_class;
  IF v_scope IS NULL OR (v_role='platform_super_admin' AND v_scope='authority') OR (v_role<>'platform_super_admin' AND v_scope NOT IN ('authority','shared'))
    OR (v_role='transportation_admin' AND v_class IN ('audit_records','user_sessions','invitations')) THEN RAISE EXCEPTION 'Record access denied' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'recordedAt',s.scope_at,'label',coalesce(nullif(concat_ws(' ',s.payload->>'first_name',s.payload->>'last_name'),''),s.payload->>'full_name',s.payload->>'reference',s.payload->>'employee_number',s.payload->>'email',s.payload->>'title',s.payload->>'status',s.id::text))),'[]') INTO v_result FROM (
   SELECT * FROM safebus_private.retention_dataset(v_class,CASE WHEN v_role='platform_super_admin' THEN NULL ELSE v_tenant END,p_after=>nullif(p_data->>'afterId','')::uuid,p_limit=>100,p_search=>nullif(p_data->>'search','')) ORDER BY id) s;
  RETURN v_result;
 END IF;
 IF p_action IN ('hold_create','export_create') THEN
  v_class:=p_data->>'dataClass';SELECT scope INTO v_scope FROM safebus_private.retention_class_rules WHERE data_class=v_class;
  IF v_scope IS NULL OR (v_role<>'platform_super_admin' AND v_scope NOT IN ('authority','shared')) OR (v_role='transportation_admin' AND v_class IN ('audit_records','user_sessions','invitations')) THEN RAISE EXCEPTION 'Class access denied' USING ERRCODE='42501'; END IF;
  v_target:=CASE WHEN v_role='platform_super_admin' AND (v_scope='authority' OR (v_scope='shared' AND p_data->>'tenantId' IS NOT NULL)) THEN (p_data->>'tenantId')::uuid WHEN v_role='platform_super_admin' THEN NULL ELSE v_tenant END;
  IF v_scope='authority' AND NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=v_target AND status='active') THEN RAISE EXCEPTION 'Authority unavailable' USING ERRCODE='42501'; END IF;
  v_id:=nullif(p_data->>'recordId','')::uuid;
  v_from:=safebus_private.retention_time(p_data,'windowStart');v_until:=safebus_private.retention_time(p_data,'windowEnd');
  IF (v_from IS NULL)<>(v_until IS NULL) OR v_until<v_from OR v_until>now()+interval '1 minute' THEN RAISE EXCEPTION 'Invalid scope dates' USING ERRCODE='22023'; END IF;
  IF v_id IS NULL AND v_from IS NULL AND p_data->>'confirmAll' IS DISTINCT FROM 'all_records' THEN RAISE EXCEPTION 'Record, time scope or explicit whole-class confirmation required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(864203711);
  IF v_scope='business' AND EXISTS(SELECT 1 FROM safebus_private.retention_business_records r WHERE r.data_class=v_class AND r.disposal_state='removing' AND (v_id IS NULL OR r.id=v_id) AND (v_from IS NULL OR r.created_at>=v_from) AND (v_until IS NULL OR r.created_at<=v_until)) THEN RAISE EXCEPTION 'Disposal already reserved; no request created' USING ERRCODE='55006'; END IF;
  IF v_id IS NOT NULL AND NOT(v_role='platform_super_admin' AND v_scope='authority') AND NOT EXISTS(SELECT 1 FROM safebus_private.retention_dataset(v_class,v_target,p_record=>v_id) WHERE id=v_id) THEN RAISE EXCEPTION 'Record unavailable' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(864203711);
  IF p_action='hold_create' THEN
   v_used:=safebus_private.retention_time(p_data,'decisionUsedAt');v_review:=safebus_private.retention_time(p_data,'reviewAt');
   v_min:=greatest(now(),safebus_private.retention_time(p_data,'minimumUntil'),((v_used AT TIME ZONE 'America/Edmonton')+interval '1 year') AT TIME ZONE 'America/Edmonton');
   IF v_review IS NULL OR v_review<=now() OR v_used>now() OR (p_data->>'reason'='decision' AND v_used IS NULL) THEN RAISE EXCEPTION 'Review or decision date invalid' USING ERRCODE='22023'; END IF;
   INSERT INTO safebus_private.retention_record_holds(tenant_id,data_class,record_id,window_start,window_end,reference,reason,minimum_until,review_at,decision_used_at,state,requested_by)
    VALUES(v_target,v_class,v_id,v_from,v_until,p_data->>'reference',p_data->>'reason',v_min,v_review,v_used,CASE WHEN v_role='platform_super_admin' AND v_target IS NOT NULL THEN 'requested' ELSE 'active' END,auth.uid()) RETURNING id INTO v_id;
  ELSE
   INSERT INTO safebus_private.retention_export_jobs(tenant_id,data_class,record_id,window_start,window_end,requested_by,requester_role,approved_by,reference,state)
    VALUES(v_target,v_class,v_id,v_from,v_until,auth.uid(),v_role,CASE WHEN v_role='platform_super_admin' AND v_target IS NOT NULL THEN NULL ELSE auth.uid() END,p_data->>'reference',CASE WHEN v_role='platform_super_admin' AND v_target IS NOT NULL THEN 'requested' ELSE 'approved' END) RETURNING id INTO v_id;
  END IF;
  PERFORM safebus_private.write_audit_event_legacy('security.config_changed','retention_request',v_id,NULL,'success',jsonb_build_object('operation',p_action,'data_class',v_class),NULL);
  RETURN jsonb_build_object('id',v_id,'state',CASE WHEN v_role='platform_super_admin' AND v_target IS NOT NULL THEN 'requested' ELSE CASE WHEN p_action='hold_create' THEN 'active' ELSE 'approved' END END);
 END IF;
 IF p_action IN ('hold_review','hold_approve','hold_release') THEN
  PERFORM pg_advisory_xact_lock(864203711);
  SELECT * INTO h FROM safebus_private.retention_record_holds WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR h.state='released' OR NOT((v_role='platform_super_admin' AND h.requested_by=auth.uid()) OR (v_role<>'platform_super_admin' AND h.tenant_id=v_tenant AND (v_role='tenant_admin' OR h.data_class NOT IN ('audit_records','user_sessions','invitations')))) THEN RAISE EXCEPTION 'Hold unavailable' USING ERRCODE='42501'; END IF;
  IF p_action='hold_approve' THEN
   IF v_role<>'tenant_admin' OR h.tenant_id<>v_tenant THEN RAISE EXCEPTION 'Authority approval required' USING ERRCODE='42501'; END IF;
   UPDATE safebus_private.retention_record_holds SET state='active',reviewed_at=now() WHERE id=h.id;
  ELSIF p_action='hold_release' THEN
   IF h.minimum_until>now() OR p_data->>'confirm' IS DISTINCT FROM 'release' THEN RAISE EXCEPTION 'Minimum or confirmation required' USING ERRCODE='22023'; END IF;
   UPDATE safebus_private.retention_record_holds SET state='released',released_at=now(),released_by=auth.uid() WHERE id=h.id;
  ELSE
   v_review:=safebus_private.retention_time(p_data,'reviewAt');v_used:=coalesce(safebus_private.retention_time(p_data,'decisionUsedAt'),h.decision_used_at);
   IF v_review IS NULL OR v_review<=now() OR v_used>now() THEN RAISE EXCEPTION 'Review date invalid' USING ERRCODE='22023'; END IF;
   UPDATE safebus_private.retention_record_holds SET review_at=v_review,reviewed_at=now(),decision_used_at=v_used,
    minimum_until=greatest(minimum_until,safebus_private.retention_time(p_data,'minimumUntil'),((v_used AT TIME ZONE 'America/Edmonton')+interval '1 year') AT TIME ZONE 'America/Edmonton') WHERE id=h.id;
  END IF;
  PERFORM safebus_private.write_audit_event_legacy('security.config_changed','retention_request',h.id,NULL,'success',jsonb_build_object('operation',p_action,'data_class',h.data_class),NULL);
  RETURN jsonb_build_object('saved',true);
 END IF;
 IF p_action IN ('export_approve','export_cancel','export_chunks','export_access') THEN
  PERFORM pg_advisory_xact_lock(864203711);
  SELECT * INTO e FROM safebus_private.retention_export_jobs WHERE id=(p_data->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR e.expires_at<=now() OR NOT((v_role='platform_super_admin' AND e.requested_by=auth.uid()) OR (e.tenant_id=v_tenant AND (v_role='tenant_admin' OR (e.requested_by=auth.uid() AND e.data_class NOT IN ('audit_records','user_sessions','invitations'))))) THEN RAISE EXCEPTION 'Export unavailable' USING ERRCODE='42501'; END IF;
  IF p_action='export_approve' THEN
   IF v_role<>'tenant_admin' OR e.tenant_id<>v_tenant OR e.state<>'requested' OR p_data->>'confirm' IS DISTINCT FROM 'approve_export' THEN RAISE EXCEPTION 'Authority approval required' USING ERRCODE='42501'; END IF;
   UPDATE safebus_private.retention_export_jobs SET approved_by=auth.uid(),state='approved',expires_at=now()+interval '30 days' WHERE id=e.id;
  ELSIF p_action='export_cancel' THEN
   IF p_data->>'confirm' IS DISTINCT FROM 'cancel_export' THEN RAISE EXCEPTION 'Cancellation confirmation required' USING ERRCODE='22023'; END IF;
   UPDATE safebus_private.retention_export_jobs SET state='cancelled' WHERE id=e.id;
  ELSE
   IF e.approved_by IS NULL OR e.state NOT IN ('running','ready') THEN RAISE EXCEPTION 'Export is not approved and available' USING ERRCODE='42501'; END IF;
   SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at,a.id),'[]') INTO v_result FROM (
    SELECT id,object_key,created_at,key_id,ciphertext_sha256,row_count FROM safebus_private.retention_export_chunks
    WHERE export_id=e.id AND verified_at IS NOT NULL AND removing_at IS NULL
     AND (p_data->>'chunkId' IS NULL OR id=(p_data->>'chunkId')::uuid)
     AND (p_data->>'after' IS NULL OR (created_at,id)>((p_data->>'after')::timestamptz,(p_data->>'afterId')::uuid)) ORDER BY created_at,id LIMIT 50) a;
   PERFORM safebus_private.write_audit_event_legacy('data.exported','retention_export',e.id,NULL,'success',jsonb_build_object('operation',p_action,'data_class',e.data_class),NULL);
   RETURN jsonb_build_object('id',e.id,'dataClass',e.data_class,'chunks',v_result,'expiresAt',e.expires_at,'state',e.state,'rowCount',e.row_count);
  END IF;
  PERFORM safebus_private.write_audit_event_legacy('security.config_changed','retention_export',e.id,NULL,'success',jsonb_build_object('operation',p_action,'data_class',e.data_class),NULL);
  RETURN jsonb_build_object('saved',true);
 END IF;
 IF p_action IN ('business_records','business_create','business_update','business_provider_confirm','business_access') THEN
  IF v_role<>'platform_super_admin' THEN RAISE EXCEPTION 'Platform business records only' USING ERRCODE='42501'; END IF;
  IF p_action='business_records' THEN
   SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC,a.id DESC),'[]') INTO v_result FROM (
    SELECT b.*,safebus_private.retention_business_due(b) AS eligible_at FROM safebus_private.retention_business_records b
    WHERE p_data->>'before' IS NULL OR (b.created_at,b.id)<((p_data->>'before')::timestamptz,(p_data->>'beforeId')::uuid) ORDER BY b.created_at DESC,b.id DESC LIMIT 50) a;
   RETURN v_result;
  END IF;
  PERFORM pg_advisory_xact_lock(864203711);
  IF p_action='business_access' THEN
   SELECT * INTO b FROM safebus_private.retention_business_records WHERE id=(p_data->>'id')::uuid AND disposal_state NOT IN ('removing','disposed');
   IF NOT FOUND THEN RAISE EXCEPTION 'Business record unavailable' USING ERRCODE='42501'; END IF;
   PERFORM safebus_private.write_audit_event_legacy('data.exported','business_record',b.id,NULL,'success',jsonb_build_object('operation',p_action,'data_class',b.data_class),NULL);
   RETURN to_jsonb(b);
  END IF;
  IF p_action='business_create' THEN
   v_class:=p_data->>'dataClass';
   IF NOT EXISTS(SELECT 1 FROM safebus_private.retention_class_rules WHERE data_class=v_class AND scope='business') THEN RAISE EXCEPTION 'Business class required' USING ERRCODE='22023'; END IF;
   INSERT INTO safebus_private.retention_business_records(data_class,reference,source_type,provider,source_reference,resolved_at,fiscal_year_end,late_filed_at,minimum_until,review_at,classification,continuing_relationship,created_by)
    VALUES(v_class,p_data->>'reference',p_data->>'sourceType',nullif(p_data->>'provider',''),coalesce(p_data->'sourceReference','{}'),safebus_private.retention_time(p_data,'resolvedAt'),nullif(p_data->>'fiscalYearEnd','')::date,nullif(p_data->>'lateFiledAt','')::date,safebus_private.retention_time(p_data,'minimumUntil'),safebus_private.retention_time(p_data,'reviewAt'),p_data->>'classification',coalesce((p_data->>'continuingRelationship')::boolean,false),auth.uid()) RETURNING * INTO b;
  ELSE
   SELECT * INTO b FROM safebus_private.retention_business_records WHERE id=(p_data->>'id')::uuid FOR UPDATE;
   IF NOT FOUND OR b.disposal_state IN ('removing','disposed') THEN RAISE EXCEPTION 'Record unavailable or disposal has started' USING ERRCODE='55006'; END IF;
   IF p_action='business_provider_confirm' THEN
    IF coalesce(p_data->>'evidenceReference','') !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$' OR p_data->>'confirm' IS DISTINCT FROM 'provider_disposed' OR safebus_private.retention_business_due(b) IS NULL OR safebus_private.retention_business_due(b)>now() OR safebus_private.retention_source_held('retention_business_records',to_jsonb(b)) THEN RAISE EXCEPTION 'Evidence reference required' USING ERRCODE='22023'; END IF;
    UPDATE safebus_private.retention_business_records SET provider_confirmed_at=now(),provider_evidence_reference=p_data->>'evidenceReference',updated_at=now() WHERE id=b.id RETURNING * INTO b;
   ELSE
    IF p_data->>'dataClass' IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM safebus_private.retention_class_rules WHERE data_class=p_data->>'dataClass' AND scope='business') OR safebus_private.retention_source_held('retention_business_records',to_jsonb(b))) THEN RAISE EXCEPTION 'Reclassification is not allowed while preserved' USING ERRCODE='55006'; END IF;
    IF b.classification IN ('historical_corporate','long_term_property','objection','key_custody') AND p_data->>'classification' IS NOT NULL AND p_data->>'classification'<>b.classification AND p_data->>'confirm' IS DISTINCT FROM 'reclassify' THEN RAISE EXCEPTION 'Mandatory exception review confirmation required' USING ERRCODE='22023'; END IF;
    v_min:=safebus_private.retention_business_due(b);
    UPDATE safebus_private.retention_business_records SET data_class=coalesce(p_data->>'dataClass',data_class),resolved_at=CASE WHEN p_data->>'reopen'='true' THEN NULL ELSE coalesce(safebus_private.retention_time(p_data,'resolvedAt'),resolved_at) END,
     fiscal_year_end=coalesce(nullif(p_data->>'fiscalYearEnd','')::date,fiscal_year_end),late_filed_at=coalesce(nullif(p_data->>'lateFiledAt','')::date,late_filed_at),
     minimum_until=greatest(minimum_until,v_min,safebus_private.retention_time(p_data,'minimumUntil')),
     review_at=coalesce(safebus_private.retention_time(p_data,'reviewAt'),review_at),classification=coalesce(p_data->>'classification',classification),
     continuing_relationship=coalesce((p_data->>'continuingRelationship')::boolean,continuing_relationship),disposal_state='retained',updated_at=now() WHERE id=b.id RETURNING * INTO b;
   END IF;
  END IF;
  IF (b.data_class='financial_records' AND b.classification NOT IN ('historical_corporate','long_term_property','objection','key_custody') AND b.fiscal_year_end IS NULL) THEN RAISE EXCEPTION 'Actual relevant fiscal year end required' USING ERRCODE='22023'; END IF;
  IF b.resolved_at>now() OR (b.data_class IN ('personnel_records','privacy_case_records','supplier_logs') AND b.minimum_until IS NULL AND b.classification NOT IN ('historical_corporate','long_term_property','objection','key_custody')) THEN RAISE EXCEPTION 'Documented minimum required; resolution cannot be in the future' USING ERRCODE='22023'; END IF;
  PERFORM safebus_private.write_audit_event_legacy('security.config_changed','business_record',b.id,NULL,'success',jsonb_build_object('operation',p_action,'data_class',b.data_class),NULL);
  RETURN jsonb_build_object('id',b.id,'eligibleAt',safebus_private.retention_business_due(b),'state',b.disposal_state);
 END IF;
 RAISE EXCEPTION 'Unknown records action' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION public.manage_records_retention(text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.manage_records_retention(text,jsonb) TO authenticated;

CREATE FUNCTION safebus_private.retention_source_held(p_table text,p_row jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_class text;v_tenant uuid:=(p_row->>'tenant_id')::uuid;v_time timestamptz;v_trip public.driver_trips%ROWTYPE;v_student public.students%ROWTYPE;
BEGIN
 v_class:=CASE p_table WHEN 'driver_trip_location_updates' THEN 'raw_location_history' WHEN 'driver_trip_current_locations' THEN 'raw_location_history' WHEN 'student_trip_events' THEN 'student_events'
 WHEN 'trip_exceptions' THEN 'exceptions' WHEN 'trip_operational_statuses' THEN 'statuses' WHEN 'authority_announcements' THEN 'announcements'
 WHEN 'user_notifications' THEN 'inbox' WHEN 'guardian_notification_outbox' THEN 'email' WHEN 'push_notification_outbox' THEN 'push'
 WHEN 'students' THEN 'student_records' WHEN 'student_guardians' THEN 'guardian_relationships' WHEN 'drivers' THEN 'driver_records'
 WHEN 'driver_trips' THEN 'trip_records' WHEN 'bus_run_dispatches' THEN 'bus_run_dispatches' WHEN 'bus_tracking_sessions' THEN 'bus_tracking_sessions'
 WHEN 'tenant_onboarding_invitations' THEN 'invitations' WHEN 'audit_events' THEN 'audit_records' WHEN 'user_sessions' THEN 'user_sessions'
 WHEN 'rate_limit_buckets' THEN 'rate_limit_buckets' ELSE p_row->>'data_class' END;
 v_time:=CASE v_class WHEN 'raw_location_history' THEN (p_row->>'recorded_at')::timestamptz WHEN 'student_events' THEN (p_row->>'event_time')::timestamptz
 WHEN 'statuses' THEN (p_row->>'set_at')::timestamptz WHEN 'bus_run_dispatches' THEN (p_row->>'prepared_at')::timestamptz WHEN 'bus_tracking_sessions' THEN (p_row->>'started_at')::timestamptz
 WHEN 'rate_limit_buckets' THEN (p_row->>'window_start')::timestamptz ELSE (p_row->>'created_at')::timestamptz END;
 IF safebus_private.retention_record_held(v_tenant,v_class,coalesce(p_row->>'id',p_row->>'driver_trip_id')::uuid,v_time) THEN RETURN true; END IF;
 IF p_row->>'driver_trip_id' IS NOT NULL THEN
  SELECT * INTO v_trip FROM public.driver_trips WHERE id=(p_row->>'driver_trip_id')::uuid;
  IF FOUND AND safebus_private.retention_record_held(v_trip.tenant_id,'trip_records',v_trip.id,v_trip.started_at) THEN RETURN true; END IF;
 END IF;
 IF p_table IN ('student_guardians','student_trip_events') AND p_row->>'student_id' IS NOT NULL THEN
  SELECT * INTO v_student FROM public.students WHERE id=(p_row->>'student_id')::uuid;
  IF FOUND AND safebus_private.retention_record_held(v_student.tenant_id,'student_records',v_student.id,v_student.created_at) THEN RETURN true; END IF;
 END IF;
 RETURN false;
END $$;
REVOKE ALL ON FUNCTION safebus_private.retention_source_held(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.drivers ADD COLUMN retention_redacted_at timestamptz;
ALTER TABLE public.audit_events ADD COLUMN retention_redacted_at timestamptz;

CREATE FUNCTION safebus_private.retention_extended_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r jsonb:=to_jsonb(OLD);v_floor timestamptz;v_parent public.students%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(864203711);
 IF TG_OP='INSERT' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME<>'audit_events' AND NOT(TG_TABLE_NAME='drivers' AND (to_jsonb(NEW)->>'retention_redacted_at') IS DISTINCT FROM (r->>'retention_redacted_at')) THEN
  IF (to_jsonb(NEW)->>'tenant_id') IS DISTINCT FROM (r->>'tenant_id') OR (to_jsonb(NEW)->>'created_at') IS DISTINCT FROM (r->>'created_at') THEN RAISE EXCEPTION 'Record identity is immutable' USING ERRCODE='55006'; END IF;
  RETURN NEW;
 END IF;
 IF safebus_private.retention_source_held(TG_TABLE_NAME,r) THEN RAISE EXCEPTION 'Records preservation or export active' USING ERRCODE='55006'; END IF;
 CASE TG_TABLE_NAME
 WHEN 'students' THEN
  IF OLD.status NOT IN ('inactive','transferred','archived') OR OLD.updated_at>now()-interval '395 days' THEN RAISE EXCEPTION 'Student retention active' USING ERRCODE='55006'; END IF;
 WHEN 'student_guardians' THEN
  SELECT * INTO v_parent FROM public.students WHERE id=OLD.student_id;
  v_floor:=CASE WHEN OLD.status IN ('inactive','archived') THEN OLD.updated_at WHEN OLD.revoked_at IS NOT NULL THEN greatest(OLD.revoked_at,OLD.updated_at)
   WHEN OLD.access_expires_at<=now() THEN greatest(OLD.access_expires_at,OLD.updated_at) WHEN v_parent.status IN ('inactive','transferred','archived') THEN greatest(v_parent.updated_at,OLD.updated_at) ELSE NULL END;
  IF v_floor IS NULL OR v_floor>now()-interval '395 days' THEN RAISE EXCEPTION 'Relationship retention active' USING ERRCODE='55006'; END IF;
 WHEN 'drivers' THEN
  IF OLD.status NOT IN ('inactive','suspended','archived') OR OLD.updated_at>now()-interval '395 days' THEN RAISE EXCEPTION 'Driver retention active' USING ERRCODE='55006'; END IF;
 WHEN 'bus_tracking_sessions' THEN
  IF greatest(OLD.ended_at,OLD.expires_at)>now()-interval '30 days' OR (OLD.status NOT IN ('ended','revoked') AND OLD.expires_at>now()) THEN RAISE EXCEPTION 'Tracking retention active' USING ERRCODE='55006'; END IF;
 WHEN 'bus_run_dispatches' THEN
  IF OLD.status NOT IN ('completed','cancelled') OR greatest(OLD.completed_at,OLD.cancelled_at,OLD.prepared_at)>now()-interval '395 days' THEN RAISE EXCEPTION 'Dispatch retention active' USING ERRCODE='55006'; END IF;
 WHEN 'tenant_onboarding_invitations' THEN
  IF (OLD.status NOT IN ('activated','cancelled','failed','expired','revoked') AND OLD.expires_at>now()) OR greatest(OLD.updated_at,OLD.cancelled_at,OLD.revoked_at,OLD.expires_at)>now()-interval '90 days' THEN RAISE EXCEPTION 'Invitation retention active' USING ERRCODE='55006'; END IF;
 WHEN 'audit_events' THEN
  IF OLD.created_at>now()-interval '730 days' THEN RAISE EXCEPTION 'Audit retention active' USING ERRCODE='55006'; END IF;
 WHEN 'rate_limit_buckets' THEN
  IF OLD.window_start>now()-interval '2 days' THEN RAISE EXCEPTION 'Counter retention active' USING ERRCODE='55006'; END IF;
 WHEN 'user_sessions' THEN
  IF coalesce(OLD.revoked_at,OLD.last_active_at)>now()-interval '90 days' OR EXISTS(SELECT 1 FROM auth.sessions a WHERE a.id=OLD.id AND (a.not_after IS NULL OR a.not_after>now())) THEN RAISE EXCEPTION 'Session mirror remains required' USING ERRCODE='55006'; END IF;
 END CASE;
 IF TG_OP='UPDATE' THEN RETURN NEW; END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION safebus_private.retention_extended_guard() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['students','student_guardians','drivers','bus_tracking_sessions','bus_run_dispatches','tenant_onboarding_invitations','audit_events','rate_limit_buckets','user_sessions'] LOOP
  EXECUTE format('CREATE TRIGGER retention_extended_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION safebus_private.retention_extended_guard()',t);
 END LOOP;
END $$;

CREATE FUNCTION public.retention_export_work(p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE e safebus_private.retention_export_jobs%ROWTYPE;a safebus_private.retention_export_chunks%ROWTYPE;b safebus_private.retention_business_records%ROWTYPE;
 v_payload jsonb;v_last uuid;v_count integer;v_id uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(864203711);
 IF p_action='next' THEN
  UPDATE safebus_private.retention_export_jobs SET state='expired' WHERE expires_at<=now() AND state NOT IN ('cancelled','expired');
  SELECT c.* INTO a FROM safebus_private.retention_export_chunks c JOIN safebus_private.retention_export_jobs j ON j.id=c.export_id
    WHERE c.verified_at IS NULL AND c.removing_at IS NULL AND j.state IN ('approved','running') AND j.expires_at>now() ORDER BY c.created_at,c.id LIMIT 1;
  IF FOUND THEN
   UPDATE safebus_private.retention_export_chunks SET lease_until=now()+interval '2 minutes' WHERE id=a.id;
   RETURN jsonb_build_object('id',a.id,'objectKey',a.object_key,'payload',a.payload);
  END IF;
  SELECT * INTO e FROM safebus_private.retention_export_jobs WHERE state IN ('approved','running') AND approved_by IS NOT NULL AND expires_at>now() ORDER BY created_at,id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT jsonb_agg(s.payload ORDER BY s.id),count(*)::integer,(array_agg(s.id ORDER BY s.id DESC))[1] INTO v_payload,v_count,v_last FROM (
   SELECT * FROM safebus_private.retention_dataset(e.data_class,e.tenant_id,e.cursor_id,e.record_id,e.window_start,e.window_end,e.created_at,200)
    WHERE (e.requester_role<>'transportation_admin' OR e.data_class<>'invitations' OR payload->>'role' IN ('guardian','driver')) ORDER BY id LIMIT 200) s;
  IF v_count=0 THEN UPDATE safebus_private.retention_export_jobs SET state='ready',finished_at=now(),error_code=NULL WHERE id=e.id;RETURN jsonb_build_object('finished',true); END IF;
  v_id:=gen_random_uuid();
  INSERT INTO safebus_private.retention_export_chunks(id,export_id,object_key,payload,row_count,last_id)
   VALUES(v_id,e.id,'exports/'||e.id::text||'/'||v_id::text||'.bin',jsonb_build_object('version',1,'exportId',e.id,'chunkId',v_id,'dataClass',e.data_class,'capturedAt',now(),'rows',v_payload),v_count,v_last) RETURNING * INTO a;
  UPDATE safebus_private.retention_export_jobs SET state='running',error_code=NULL WHERE id=e.id;
  RETURN jsonb_build_object('id',a.id,'objectKey',a.object_key,'payload',a.payload);
 ELSIF p_action='verify' THEN
  SELECT * INTO a FROM safebus_private.retention_export_chunks WHERE id=(p_data->>'id')::uuid AND verified_at IS NULL AND removing_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('verified',false); END IF;
  UPDATE safebus_private.retention_export_jobs SET cursor_id=a.last_id,row_count=row_count+a.row_count WHERE id=a.export_id AND state IN ('approved','running') AND expires_at>now();
  IF NOT FOUND THEN RETURN jsonb_build_object('verified',false); END IF;
  UPDATE safebus_private.retention_export_chunks SET verified_at=now(),payload=NULL,key_id=p_data->>'keyId',ciphertext_sha256=p_data->>'sha256' WHERE id=a.id;
  RETURN jsonb_build_object('verified',true);
 ELSIF p_action='cleanup' THEN
  UPDATE safebus_private.retention_export_jobs SET state='expired' WHERE expires_at<=now() AND state NOT IN ('cancelled','expired');
  SELECT c.* INTO a FROM safebus_private.retention_export_chunks c JOIN safebus_private.retention_export_jobs j ON j.id=c.export_id
   WHERE j.state IN ('cancelled','expired') AND c.lease_until<now() AND (c.last_removed_check IS NULL OR c.last_removed_check<now()-interval '1 day') ORDER BY c.created_at,c.id LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE safebus_private.retention_export_chunks SET removing_at=coalesce(removing_at,now()),payload=NULL WHERE id=a.id;
  RETURN jsonb_build_object('id',a.id,'objectKey',a.object_key);
 ELSIF p_action='removed' THEN
  UPDATE safebus_private.retention_export_chunks SET removed_at=coalesce(removed_at,now()),last_removed_check=now(),payload=NULL WHERE id=(p_data->>'id')::uuid AND removing_at IS NOT NULL;
  RETURN jsonb_build_object('removed',FOUND);
 ELSIF p_action='business_due' THEN
  SELECT * INTO b FROM safebus_private.retention_business_records r WHERE r.disposal_state IN ('retained','due','removing','provider_pending')
   AND (r.source_type<>'managed_file' OR r.object_key IS NOT NULL) AND (r.disposal_state<>'provider_pending' OR r.provider_confirmed_at IS NOT NULL) AND safebus_private.retention_business_due(r)<=now() AND NOT safebus_private.retention_source_held('retention_business_records',to_jsonb(r)) ORDER BY r.created_at,r.id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF b.source_type IN ('external_mail','provider_record') AND b.provider_confirmed_at IS NULL THEN
   UPDATE safebus_private.retention_business_records SET disposal_state='provider_pending' WHERE id=b.id;
   RETURN jsonb_build_object('id',b.id,'providerPending',true,'provider',b.provider,'sourceReference',b.source_reference);
  END IF;
  IF b.source_type='managed_file' AND b.object_key IS NULL THEN RETURN jsonb_build_object('id',b.id,'awaitingUpload',true); END IF;
  UPDATE safebus_private.retention_business_records SET disposal_state='removing',disposal_started_at=coalesce(disposal_started_at,now()) WHERE id=b.id;
  RETURN jsonb_build_object('id',b.id,'objectKey',b.object_key,'metadataOnly',b.object_key IS NULL);
 ELSIF p_action='business_removed' THEN
  UPDATE safebus_private.retention_business_records SET disposal_state='disposed',disposed_at=now(),source_reference='{}',object_key=NULL,key_id=NULL,ciphertext_sha256=NULL
   WHERE id=(p_data->>'id')::uuid AND disposal_state='removing';
  RETURN jsonb_build_object('removed',FOUND);
 ELSIF p_action='business_attach' THEN
  UPDATE safebus_private.retention_business_records SET object_key=p_data->>'objectKey',key_id=p_data->>'keyId',ciphertext_sha256=p_data->>'sha256',updated_at=now()
   WHERE id=(p_data->>'id')::uuid AND source_type='managed_file' AND disposal_state='retained' AND object_key IS NULL;
  RETURN jsonb_build_object('attached',FOUND);
 ELSE RAISE EXCEPTION 'Unknown export work action' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.retention_export_work(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retention_export_work(text,jsonb) TO service_role;

CREATE TABLE safebus_private.retention_worker_control(id integer PRIMARY KEY CHECK(id=1),owner uuid,lease_until timestamptz);
INSERT INTO safebus_private.retention_worker_control(id) VALUES(1);
ALTER TABLE safebus_private.retention_worker_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.retention_worker_control FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.retention_worker_lease(p_action text,p_owner uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_owner IS NULL THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
 IF p_action='claim' THEN
  UPDATE safebus_private.retention_worker_control SET owner=p_owner,lease_until=now()+interval '16 minutes' WHERE id=1 AND (lease_until IS NULL OR lease_until<=now());RETURN FOUND;
 ELSIF p_action='release' THEN UPDATE safebus_private.retention_worker_control SET owner=NULL,lease_until=NULL WHERE id=1 AND owner=p_owner;RETURN FOUND;
 ELSIF p_action='enabled' THEN RETURN EXISTS(SELECT 1 FROM public.retention_execution_control WHERE id=1 AND destructive_enabled AND approval_reference IS NOT NULL AND approved_at IS NOT NULL);
 END IF;
 RAISE EXCEPTION 'Unknown lease action' USING ERRCODE='22023';
END $$;
REVOKE ALL ON FUNCTION public.retention_worker_lease(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retention_worker_lease(text,uuid) TO service_role;

-- Temporary unregistered uploads have their own explicit 30-day disposal scope.
CREATE FUNCTION public.retention_orphan_upload() RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT CASE WHEN auth.role()='service_role' THEN (
  SELECT o.name FROM storage.objects o WHERE o.bucket_id='retention-evidence'
   AND o.name ~ '^staging/business/[0-9a-f-]{36}/[0-9a-f-]{36}\.bin$' AND o.created_at<now()-interval '30 days'
   AND NOT EXISTS(SELECT 1 FROM safebus_private.retention_business_records b WHERE b.object_key=o.name)
   ORDER BY o.created_at,o.id LIMIT 1) ELSE NULL END
$$;
REVOKE ALL ON FUNCTION public.retention_orphan_upload() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retention_orphan_upload() TO service_role;
