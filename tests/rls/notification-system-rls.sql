-- SafeBus Alberta notification authorization acceptance fixture.
-- Execute only against an explicitly approved isolated Supabase database after
-- migration 0092. Never run this fixture against the sole production project.
begin;

do $$
declare v_claim text; v_inbox text;
begin
  if to_regclass('public.user_notifications') is null
    or to_regclass('public.android_push_devices') is null
    or to_regclass('public.push_notification_outbox') is null then
    raise exception 'TEST FAILED: notification tables are missing';
  end if;
  if has_table_privilege('authenticated','public.android_push_devices','select')
    or has_table_privilege('authenticated','public.push_notification_outbox','select') then
    raise exception 'TEST FAILED: browser can read token or delivery queue data';
  end if;
  if not has_function_privilege('authenticated','public.get_user_notifications(integer,timestamp with time zone,uuid,boolean,text)','execute')
    or has_function_privilege('anon','public.get_user_notifications(integer,timestamp with time zone,uuid,boolean,text)','execute') then
    raise exception 'TEST FAILED: inbox RPC grants are incorrect';
  end if;
  if has_function_privilege('authenticated','public.claim_push_notification_deliveries(text,integer,integer)','execute') then
    raise exception 'TEST FAILED: browser can claim push queue work';
  end if;
  select lower(pg_get_functiondef('public.claim_push_notification_deliveries(text,integer,integer)'::regprocedure)) into v_claim;
  if position('skip locked' in v_claim)=0 or position('access_expires_at' in v_claim)=0
    or position('privacy_review_status' in v_claim)=0 or position('last_seen_at' in v_claim)=0 then
    raise exception 'TEST FAILED: push delivery-time rechecks are incomplete';
  end if;
  select lower(pg_get_functiondef('public.get_user_notifications(integer,timestamp with time zone,uuid,boolean,text)'::regprocedure)) into v_inbox;
  if position('auth.uid()' in v_inbox)=0 or position('access_expires_at' in v_inbox)=0 then
    raise exception 'TEST FAILED: inbox does not recheck exact recipient and guardian expiry';
  end if;
end $$;

set local role anon;
do $$ begin
  begin perform public.get_notification_preferences(); raise exception 'TEST FAILED: anon read settings';
  exception when insufficient_privilege then null; end;
end $$;

set local role authenticated;
do $$ begin
  begin perform public.claim_push_notification_deliveries('browser',1,120); raise exception 'TEST FAILED: browser claimed queue';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
