-- Requires the reviewed retention_lifecycle release first. Installation never enables deletion.
DO $$ BEGIN
 IF to_regprocedure('public.run_retention_lifecycle(boolean,integer)') IS NULL
 OR (SELECT destructive_enabled FROM public.retention_execution_control WHERE id=1) IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Install lifecycle first with deletion disabled' USING ERRCODE='55006'; END IF;
END $$;

CREATE TABLE safebus_private.disposal_holds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
 policy_key text NOT NULL, record_id uuid NOT NULL,
 reference text NOT NULL CHECK(reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
 minimum_until timestamptz NOT NULL, review_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
 released_at timestamptz, released_by uuid
);
CREATE INDEX disposal_holds_record ON safebus_private.disposal_holds(policy_key,record_id) WHERE released_at IS NULL;
CREATE INDEX disposal_holds_authority ON safebus_private.disposal_holds(tenant_id,created_at,id);
CREATE TABLE safebus_private.disposal_extensions (
 tenant_id uuid NOT NULL, policy_key text NOT NULL, minimum_days integer NOT NULL CHECK(minimum_days BETWEEN 1 AND 3650),
 reference text NOT NULL CHECK(reference ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
 updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid NOT NULL,
 PRIMARY KEY(tenant_id,policy_key)
);
CREATE TABLE safebus_private.disposal_runs (
 window_start timestamptz NOT NULL, tenant_id uuid NOT NULL, policy_key text NOT NULL,
 completed_at timestamptz NOT NULL, affected_rows bigint NOT NULL CHECK(affected_rows>=0),
 PRIMARY KEY(window_start,tenant_id,policy_key)
);
ALTER TABLE safebus_private.disposal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebus_private.disposal_extensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE safebus_private.disposal_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.disposal_holds,safebus_private.disposal_extensions,safebus_private.disposal_runs FROM PUBLIC,anon,authenticated,service_role;

-- Fixed mapping: no caller-supplied identifiers are ever used as SQL identifiers.
CREATE FUNCTION safebus_private.disposal_relation(p_key text) RETURNS regclass
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
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
 WHEN 'gps' THEN 'public.driver_trip_location_updates'
 WHEN 'student_events' THEN 'public.student_trip_events'
 WHEN 'exceptions' THEN 'public.trip_exceptions'
 WHEN 'statuses' THEN 'public.trip_operational_statuses'
 WHEN 'announcements' THEN 'safebus_private.authority_announcements'
 WHEN 'email' THEN 'public.guardian_notification_outbox'
 WHEN 'push' THEN 'public.push_notification_outbox'
 WHEN 'inbox' THEN 'public.user_notifications'
 WHEN 'audience_failures' THEN 'safebus_private.notification_audience_queue'
 WHEN 'push_devices' THEN 'public.android_push_devices' END::regclass
$$;
REVOKE ALL ON FUNCTION safebus_private.disposal_relation(text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION safebus_private.disposal_held(p_key text,p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM safebus_private.disposal_holds WHERE policy_key=p_key AND record_id=p_id AND released_at IS NULL)
$$;
REVOKE ALL ON FUNCTION safebus_private.disposal_held(text,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Inspect every FK, including future dependencies: unfamiliar children block disposal.
-- Only subordinate student setup is allowed to cascade; events, inbox and links expire independently.
CREATE FUNCTION safebus_private.disposal_children_clear(p_table regclass,p_id uuid,p_allowed text[] DEFAULT ARRAY[]::text[]) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE f record; v_join text; v_exists boolean;
BEGIN
 FOR f IN SELECT oid,conrelid,conkey,confkey FROM pg_constraint WHERE contype='f' AND confrelid=p_table LOOP
  IF f.conrelid::regclass::text=ANY(p_allowed) THEN CONTINUE; END IF;
  SELECT string_agg(format('c.%I=p.%I',a.attname,b.attname),' AND ' ORDER BY k.n) INTO v_join
  FROM unnest(f.conkey,f.confkey) WITH ORDINALITY k(c,p,n)
  JOIN pg_attribute a ON a.attrelid=f.conrelid AND a.attnum=k.c
  JOIN pg_attribute b ON b.attrelid=p_table AND b.attnum=k.p;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s c JOIN %s p ON %s WHERE p.id=$1)',f.conrelid::regclass,p_table,v_join) INTO v_exists USING p_id;
  IF v_exists THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION safebus_private.disposal_children_clear(regclass,uuid,text[]) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION safebus_private.disposal_allowed(p_key text,p_row jsonb) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_id uuid:=(p_row->>'id')::uuid; v_tenant uuid:=(p_row->>'tenant_id')::uuid;
 v_trip uuid:=(p_row->>'driver_trip_id')::uuid; v_student uuid:=(p_row->>'student_id')::uuid;
 v_floor timestamptz; v_days integer; v_status text:=p_row->>'status'; v_table regclass;
BEGIN
 v_table:=safebus_private.disposal_relation(p_key);
 IF v_table IS NULL OR safebus_private.disposal_held(p_key,v_id) THEN RETURN false; END IF;
 IF p_key='trip_records' THEN v_trip:=v_id; END IF;
 IF v_trip IS NOT NULL AND (safebus_private.disposal_held('trip_records',v_trip) OR (p_key<>'gps' AND safebus_private.retention_trip_held(v_trip))) THEN RETURN false; END IF;
 IF v_student IS NOT NULL AND safebus_private.disposal_held('student_records',v_student) THEN RETURN false; END IF;
 IF p_key='guardian_relationships' AND safebus_private.disposal_held('guardian_records',(p_row->>'guardian_id')::uuid) THEN RETURN false; END IF;
 IF v_tenant IS NULL AND v_trip IS NOT NULL THEN SELECT tenant_id INTO v_tenant FROM public.driver_trips WHERE id=v_trip; END IF;
 v_floor:=greatest((p_row->>'created_at')::timestamptz,(p_row->>'updated_at')::timestamptz);
 v_days:=CASE WHEN p_key IN ('invitations','user_sessions','email','push','inbox','audience_failures','push_devices') THEN 90
 WHEN p_key IN ('bus_tracking_sessions','gps') THEN 30 WHEN p_key='rate_limit_buckets' THEN 2
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
 WHEN 'gps' THEN v_floor:=greatest(v_floor,(p_row->>'recorded_at')::timestamptz);
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
END $$;
REVOKE ALL ON FUNCTION safebus_private.disposal_allowed(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION safebus_private.disposal_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock_shared(864203711);
 IF TG_OP='UPDATE' AND TG_ARGV[0]='audit_records' AND to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) AND NOT safebus_private.disposal_allowed('audit_records',to_jsonb(OLD)) THEN RAISE EXCEPTION 'Audit preservation or minimum retention active' USING ERRCODE='55006'; END IF;
 IF TG_OP='DELETE' AND NOT safebus_private.disposal_allowed(TG_ARGV[0],to_jsonb(OLD)) THEN
  RAISE EXCEPTION 'Retention, preservation or dependent records prevent disposal' USING ERRCODE='55006'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION safebus_private.disposal_guard() FROM PUBLIC,anon,authenticated,service_role;

DO $$ DECLARE k text; BEGIN
 FOREACH k IN ARRAY ARRAY['invitations','student_records','guardian_relationships','driver_records','guardian_records','bus_tracking_sessions','bus_run_dispatches','trip_records','audit_records','rate_limit_buckets','user_sessions','gps','student_events','exceptions','statuses','announcements','email','push','inbox','push_devices'] LOOP
  EXECUTE format('CREATE TRIGGER complete_disposal_guard BEFORE INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION safebus_private.disposal_guard(%L)',safebus_private.disposal_relation(k),k);
 END LOOP;
END $$;

CREATE FUNCTION public.manage_disposal(p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
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
   IF v_days NOT BETWEEN 395 AND 3650 OR v_key IN ('gps','email','push','inbox') THEN RAISE EXCEPTION 'Use scoped preservation for short-lived data' USING ERRCODE='22023'; END IF;
   INSERT INTO safebus_private.disposal_extensions(tenant_id,policy_key,minimum_days,reference,updated_by) VALUES(v_tenant,v_key,v_days,p_data->>'reference',auth.uid())
   ON CONFLICT(tenant_id,policy_key) DO UPDATE SET minimum_days=greatest(disposal_extensions.minimum_days,excluded.minimum_days),reference=excluded.reference,updated_at=now(),updated_by=auth.uid();
  ELSE
   v_id:=(p_data->>'recordId')::uuid;
   EXECUTE format('SELECT to_jsonb(s) FROM %s s WHERE id=$1',safebus_private.disposal_relation(v_key)) INTO v_row USING v_id;
   IF v_row IS NULL OR (v_row->>'tenant_id')::uuid IS DISTINCT FROM v_tenant THEN RAISE EXCEPTION 'Record unavailable' USING ERRCODE='42501'; END IF;
   IF v_key='accounts' AND EXISTS(SELECT 1 FROM safebus_private.disposal_accounts WHERE profile_id=v_id AND state<>'pending') THEN RAISE EXCEPTION 'Account disposal in progress' USING ERRCODE='55006'; END IF;
   IF p_action='export' THEN
    IF v_key IN ('gps','email','push','inbox','bus_tracking_sessions','accounts') THEN RAISE EXCEPTION 'Use scoped trip archive' USING ERRCODE='42501'; END IF;
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
END $$;
REVOKE ALL ON FUNCTION public.manage_disposal(text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.manage_disposal(text,jsonb) TO authenticated;

-- Auth removal uses the provider Admin API, never direct mutation of auth.users.
CREATE TABLE safebus_private.disposal_accounts (
 profile_id uuid PRIMARY KEY, tenant_id uuid NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','deleting','completed')),
 created_at timestamptz NOT NULL DEFAULT now(), retention_started_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, completed_at timestamptz
);
ALTER TABLE safebus_private.disposal_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON safebus_private.disposal_accounts FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION safebus_private.disposal_account_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE col text; v_id uuid;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(864203711);
 FOREACH col IN ARRAY TG_ARGV LOOP
  v_id:=(to_jsonb(NEW)->>col)::uuid;
  IF TG_TABLE_NAME='profiles' AND TG_OP='UPDATE' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
   DELETE FROM safebus_private.disposal_accounts WHERE profile_id=v_id AND state='pending';
  END IF;
  IF EXISTS(SELECT 1 FROM safebus_private.disposal_accounts WHERE profile_id=v_id AND state IN ('deleting','completed')) THEN
   RAISE EXCEPTION 'Account disposal is in progress or complete' USING ERRCODE='55006'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION safebus_private.disposal_account_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER complete_disposal_guard BEFORE DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION safebus_private.disposal_guard('accounts');
CREATE TRIGGER disposal_account_guard BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION safebus_private.disposal_account_guard('id');
DO $$ DECLARE t record; BEGIN
 FOR t IN SELECT conrelid,string_agg(quote_literal(a.attname),',' ORDER BY a.attnum) cols FROM pg_constraint c
 CROSS JOIN LATERAL unnest(conkey) k(n) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n
 WHERE contype='f' AND confrelid='public.profiles'::regclass GROUP BY conrelid LOOP
  EXECUTE format('CREATE TRIGGER disposal_account_guard BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION safebus_private.disposal_account_guard(%s)',t.conrelid::regclass,t.cols);
 END LOOP;
END $$;

CREATE FUNCTION public.disposal_account_work(p_action text,p_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_id uuid; v_tenant uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service only' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(864203711);
 IF p_action='state' THEN RETURN jsonb_build_object('enabled',EXISTS(SELECT 1 FROM public.retention_execution_control WHERE id=1 AND destructive_enabled AND approval_reference IS NOT NULL AND approved_at IS NOT NULL)); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.retention_execution_control WHERE id=1 AND destructive_enabled AND approval_reference IS NOT NULL AND approved_at IS NOT NULL) THEN RAISE EXCEPTION 'Destructive retention disabled' USING ERRCODE='55006'; END IF;
 IF p_action='next' THEN
  -- A lost Admin-API response is reconciled from both authoritative stores.
  SELECT q.profile_id INTO v_id FROM safebus_private.disposal_accounts q WHERE q.state='deleting'
   AND NOT EXISTS(SELECT 1 FROM auth.users a WHERE a.id=q.profile_id)
   AND NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=q.profile_id) ORDER BY q.created_at LIMIT 1;
  IF v_id IS NOT NULL THEN PERFORM public.disposal_account_work('completed',v_id); END IF;
  SELECT q.profile_id,q.tenant_id INTO v_id,v_tenant FROM safebus_private.disposal_accounts q JOIN public.profiles p ON p.id=q.profile_id
  WHERE q.state IN ('pending','deleting') AND (q.lease_until IS NULL OR q.lease_until<now())
   AND q.retention_started_at<now()-make_interval(days=>greatest(395,coalesce((SELECT minimum_days FROM safebus_private.disposal_extensions WHERE tenant_id=q.tenant_id AND policy_key='accounts'),395)))
   AND p.tenant_id=q.tenant_id AND p.status='disabled' AND p.role IN ('driver','guardian')
   AND NOT safebus_private.disposal_held('accounts',p.id)
   AND NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.owner_id=p.id::text OR o.owner=p.id)
   AND safebus_private.disposal_children_clear('public.profiles',p.id,ARRAY['public.user_notification_settings','public.user_notification_category_preferences'])
  ORDER BY q.created_at,q.profile_id LIMIT 1 FOR UPDATE OF p,q;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  UPDATE safebus_private.disposal_accounts SET state='deleting',lease_until=now()+interval '2 minutes' WHERE profile_id=v_id;
  RETURN jsonb_build_object('id',v_id);
 ELSIF p_action='completed' THEN
  IF EXISTS(SELECT 1 FROM safebus_private.disposal_accounts WHERE profile_id=p_id AND state='completed') THEN RETURN jsonb_build_object('completed',true); END IF;
  IF EXISTS(SELECT 1 FROM auth.users WHERE id=p_id) OR EXISTS(SELECT 1 FROM public.profiles WHERE id=p_id) THEN RAISE EXCEPTION 'Account removal not verified' USING ERRCODE='55006'; END IF;
  UPDATE safebus_private.disposal_accounts SET state='completed',completed_at=now(),lease_until=NULL WHERE profile_id=p_id AND state='deleting' RETURNING tenant_id INTO v_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account task unavailable' USING ERRCODE='55006'; END IF;
  INSERT INTO safebus_private.disposal_runs(window_start,tenant_id,policy_key,completed_at,affected_rows) VALUES(date_trunc('hour',now()),v_tenant,'accounts',now(),1)
  ON CONFLICT(window_start,tenant_id,policy_key) DO UPDATE SET affected_rows=disposal_runs.affected_rows+1,completed_at=now();
  RETURN jsonb_build_object('completed',true);
 ELSE RAISE EXCEPTION 'Unknown account action' USING ERRCODE='22023'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.disposal_account_work(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.disposal_account_work(text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.run_retention_lifecycle(p_dry_run boolean DEFAULT true,p_limit integer DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE v_class text; v_table text; v_where text; v_order text; v_ids uuid[]; v_count integer; v_result jsonb:='{}'; v_row jsonb; v_profile uuid; v_tenant uuid; v_profile_floor timestamptz;
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
  FOREACH v_class IN ARRAY ARRAY['gps','student_events','exceptions','statuses','announcements','email','push','inbox','archive_manifests','cases','audience_failures','push_devices','invitations','guardian_relationships','student_records','bus_tracking_sessions','bus_run_dispatches','trip_records','driver_records','guardian_records','audit_records','rate_limit_buckets','user_sessions'] LOOP
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
    IF v_class NOT IN ('archive_manifests','cases') THEN v_where:=v_where||format(' AND safebus_private.disposal_allowed(%L,to_jsonb(s))',v_class); END IF;
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
END $$;
REVOKE ALL ON FUNCTION public.run_retention_lifecycle(boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_retention_lifecycle(boolean,integer) TO service_role;


CREATE FUNCTION safebus_private.disposal_setup_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$ BEGIN
 PERFORM pg_advisory_xact_lock_shared(864203711); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION safebus_private.disposal_setup_lock() FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['public.student_route_assignments','public.student_bus_assignments','public.student_qr_credentials','public.driver_route_assignments','public.driver_tracking_devices','safebus_private.notification_audience_queue'] LOOP
  EXECUTE format('CREATE TRIGGER disposal_setup_lock BEFORE INSERT OR UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION safebus_private.disposal_setup_lock()',t);
 END LOOP;
END $$;
CREATE INDEX disposal_students_expiry ON public.students(updated_at,id) WHERE status IN ('inactive','transferred','archived');
CREATE INDEX disposal_links_expiry ON public.student_guardians(updated_at,id);
CREATE INDEX disposal_driver_expiry ON public.drivers(updated_at,id) WHERE status IN ('inactive','suspended','archived');
CREATE INDEX disposal_guardian_expiry ON public.guardians(updated_at,id) WHERE status<>'active';
CREATE INDEX disposal_audit_expiry ON public.audit_events(created_at,id);
CREATE INDEX disposal_sessions_expiry ON public.user_sessions(greatest(revoked_at,last_active_at),id);

-- Reuse the hosted audit allowlist; the initial lifecycle names are not accepted by BusSafe.
CREATE OR REPLACE FUNCTION public.manage_retention_case(p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
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
      NULL,'success',jsonb_build_object('tenant_id',v_tenant,'operation',p_action),NULL);
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
      NULL,'success',jsonb_build_object('tenant_id',v_tenant,'operation',p_action),NULL);
    RETURN jsonb_build_object('resolved',true);
  ELSE RAISE EXCEPTION 'Unknown preservation action' USING ERRCODE='22023';
  END IF;
  -- Identifier-only audit; no case reference, narrative, GPS or child identity.
  PERFORM safebus_private.write_audit_event_legacy('security.config_changed','retention_case',v_case.id,
    NULL,'success',jsonb_build_object('tenant_id',v_tenant,'operation',p_action),NULL);
  RETURN jsonb_build_object('id',v_case.id,'minimumUntil',v_case.minimum_until,'releasedAt',v_case.released_at);
END $$;
REVOKE ALL ON FUNCTION public.manage_retention_case(text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.manage_retention_case(text,jsonb) TO authenticated;
