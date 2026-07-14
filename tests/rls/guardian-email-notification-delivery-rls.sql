-- SafeBus Alberta - Phase 15A guardian email notification delivery RLS/privilege checks
-- Execute manually against hosted Supabase DEV after applying migration 0038.

begin;

-- Browser roles must not be able to execute privileged worker RPCs.
set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claims = '{"sub":"9a120000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$
begin
  begin
    perform public.claim_guardian_notification_email_batch(1, 120, 5);
    raise exception 'TEST 15A-1 FAILED: authenticated role claimed outbox rows';
  exception when insufficient_privilege then null; end;
  begin
    perform public.resolve_guardian_notification_email_payload('00000000-0000-0000-0000-000000000000');
    raise exception 'TEST 15A-2 FAILED: authenticated role resolved delivery payload';
  exception when insufficient_privilege then null; end;
  begin
    perform public.complete_guardian_notification_email('00000000-0000-0000-0000-000000000000', null);
    raise exception 'TEST 15A-3 FAILED: authenticated role completed delivery';
  exception when insufficient_privilege then null; end;
  raise notice 'TEST 15A-1..3 PASSED: browser roles cannot execute dispatcher RPCs';
end $$;
rollback;

-- Structural assertions for lifecycle fields and function presence.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='guardian_notification_outbox' and column_name='claim_expires_at') then
    raise exception 'TEST 15A-4 FAILED: claim_expires_at missing';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='claim_guardian_notification_email_batch') then
    raise exception 'TEST 15A-5 FAILED: claim function missing';
  end if;
  raise notice 'TEST 15A-4..5 PASSED: Phase 15A structural delivery foundation exists';
end $$;
