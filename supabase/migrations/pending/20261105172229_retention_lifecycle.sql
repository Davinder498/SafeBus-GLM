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
    PERFORM safebus_private.write_audit_event_legacy('retention.archive_access','retention_case',(p_data->>'id')::uuid,
      NULL,'success',jsonb_build_object('tenant_id',v_tenant),NULL);
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
    PERFORM safebus_private.write_audit_event_legacy('retention.resolve_announcement','authority_announcement',(p_data->>'id')::uuid,
      NULL,'success',jsonb_build_object('tenant_id',v_tenant),NULL);
    RETURN jsonb_build_object('resolved',true);
  ELSE RAISE EXCEPTION 'Unknown preservation action' USING ERRCODE='22023';
  END IF;
  -- Identifier-only audit; no case reference, narrative, GPS or child identity.
  PERFORM safebus_private.write_audit_event_legacy('retention.'||p_action,'retention_case',v_case.id,
    NULL,'success',jsonb_build_object('tenant_id',v_tenant),NULL);
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
  IF TG_TABLE_NAME='driver_trip_location_updates' THEN
    IF greatest(OLD.recorded_at,OLD.created_at)>now()-interval '30 days' OR EXISTS(
      SELECT 1 FROM safebus_private.retention_cases h WHERE h.driver_trip_id=OLD.driver_trip_id AND h.released_at IS NULL
        AND OLD.recorded_at BETWEEN h.window_start AND h.window_end AND NOT EXISTS(
          SELECT 1 FROM safebus_private.retention_archive_coverage c JOIN safebus_private.retention_archive_chunks a ON a.id=c.chunk_id
          WHERE c.case_id=h.id AND c.gps_id=OLD.id AND a.verified_at IS NOT NULL)) THEN
      RAISE EXCEPTION 'GPS retention or preservation active' USING ERRCODE='55006';
    END IF;
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
  FOREACH v_table IN ARRAY ARRAY['public.driver_trip_location_updates','public.driver_trips','public.student_trip_events',
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
DECLARE v_class text; v_table text; v_where text; v_order text; v_ids uuid[]; v_count integer; v_result jsonb:='{}';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
  IF p_dry_run IS NULL OR p_limit NOT BETWEEN 1 AND 500 OR p_limit IS NULL THEN
    RAISE EXCEPTION 'Invalid batch' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(864203711);
  IF NOT p_dry_run AND NOT EXISTS(SELECT 1 FROM public.retention_execution_control WHERE id=1 AND destructive_enabled
    AND approval_reference IS NOT NULL AND approved_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Destructive retention disabled' USING ERRCODE='55006'; END IF;
  FOREACH v_class IN ARRAY ARRAY['gps','student_events','exceptions','statuses','announcements','email','push','inbox','archive_manifests','cases'] LOOP
    v_order:='s.id';
    CASE v_class
    WHEN 'gps' THEN
      v_table:='public.driver_trip_location_updates'; v_order:='greatest(s.recorded_at,s.created_at),s.id';
      v_where:=$q$greatest(s.recorded_at,s.created_at)<now()-interval '30 days' AND NOT EXISTS(
        SELECT 1 FROM safebus_private.retention_cases h WHERE h.driver_trip_id=s.driver_trip_id AND h.released_at IS NULL
          AND s.recorded_at BETWEEN h.window_start AND h.window_end AND NOT EXISTS(
            SELECT 1 FROM safebus_private.retention_archive_coverage c JOIN safebus_private.retention_archive_chunks a ON a.id=c.chunk_id
            WHERE c.case_id=h.id AND c.gps_id=s.id AND a.verified_at IS NOT NULL))$q$;
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
    EXECUTE format('SELECT coalesce(array_agg(id),ARRAY[]::uuid[]) FROM (SELECT s.id FROM %s s WHERE %s ORDER BY %s LIMIT $1) eligible',v_table,v_where,v_order)
      INTO v_ids USING p_limit;
    v_count:=cardinality(v_ids);
    IF NOT p_dry_run THEN EXECUTE format('DELETE FROM %s WHERE id=ANY($1)',v_table) USING v_ids; GET DIAGNOSTICS v_count=ROW_COUNT; END IF;
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
