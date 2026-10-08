-- Student QR executable authorization and event regression.
-- PENDING EXECUTION: approved isolated test target only, after migration 0119.
-- All fixture IDs are random; no existing records are changed, no security
-- controls are disabled, no QA notification is delivered. One final ROLLBACK.
-- Use psql -v ON_ERROR_STOP=1; disconnect/rollback immediately on any failure.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '2s';
set local search_path = pg_catalog, safebus_private, public, auth, extensions, pg_temp;

create temporary table sqr_ids(name text primary key, id uuid not null default gen_random_uuid()) on commit drop;
insert into sqr_ids(name) select unnest(array[
  'tenant_a','tenant_b','school_a','school_other','school_b',
  'admin','school_admin','transport_admin','guardian','platform','driver','other_driver','inactive_driver',
  'driver_row','other_driver_row','inactive_driver_row','bus','route','forward','reverse',
  'service_forward','service_reverse','pickup','dropoff','trip','stale_trip',
  'student','other_school_student','cross_tenant_student','inactive_student','reverse_student',
  'missing_stop_student','expired_student','unassigned_student'
]);
create function pg_temp.sqr_id(p_name text) returns uuid language sql as
$$ select id from pg_temp.sqr_ids where name = p_name $$;
create function pg_temp.sqr_assert(p_ok boolean, p_name text) returns void language plpgsql as $$
begin if p_ok is distinct from true then raise exception 'FAIL: %', p_name; end if; end $$;
create function pg_temp.sqr_denied(p_query text, p_state text default '42501') returns void language plpgsql as $$
begin
  begin execute p_query;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise;
  end;
  raise exception 'FAIL: expected denial';
end $$;
grant select on sqr_ids to authenticated;
create temporary table sqr_tokens(name text primary key, token text not null) on commit drop;
grant select, insert, update on sqr_tokens to authenticated;

-- New synthetic tenant boundary. External delivery is unconfigured/disabled.
insert into public.tenants(id,name,type,status)
values(pg_temp.sqr_id('tenant_a'),'SQR rollback A','school','active'),
      (pg_temp.sqr_id('tenant_b'),'SQR rollback B','school','active');
insert into public.schools(id,tenant_id,name,province,status)
values(pg_temp.sqr_id('school_a'),pg_temp.sqr_id('tenant_a'),'SQR school A','AB','active'),
      (pg_temp.sqr_id('school_other'),pg_temp.sqr_id('tenant_a'),'SQR other school','AB','active'),
      (pg_temp.sqr_id('school_b'),pg_temp.sqr_id('tenant_b'),'SQR school B','AB','active');

insert into auth.users(id,email,role,aud,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id, 'sqr-' || id::text || '@example.test','authenticated','authenticated','{}','{}',now(),now()
from sqr_ids where name in ('admin','school_admin','transport_admin','guardian','platform','driver','other_driver','inactive_driver');
insert into public.profiles(id,tenant_id,school_id,full_name,email,role,status)
select id, case when name = 'platform' then null else pg_temp.sqr_id('tenant_a') end,
  case when name = 'school_admin' then pg_temp.sqr_id('school_a') end,
  'SQR synthetic', 'sqr-' || id::text || '@example.test',
  (case name when 'admin' then 'tenant_admin' when 'school_admin' then 'school_admin'
    when 'transport_admin' then 'transportation_admin' when 'guardian' then 'guardian'
    when 'platform' then 'platform_super_admin' else 'driver' end)::public.user_role, 'active'
from sqr_ids where name in ('admin','school_admin','transport_admin','guardian','platform','driver','other_driver','inactive_driver');
insert into public.drivers(id,tenant_id,profile_id,status)
values(pg_temp.sqr_id('driver_row'),pg_temp.sqr_id('tenant_a'),pg_temp.sqr_id('driver'),'active'),
      (pg_temp.sqr_id('other_driver_row'),pg_temp.sqr_id('tenant_a'),pg_temp.sqr_id('other_driver'),'active'),
      (pg_temp.sqr_id('inactive_driver_row'),pg_temp.sqr_id('tenant_a'),pg_temp.sqr_id('inactive_driver'),'inactive');
insert into public.buses(id,tenant_id,bus_number,status)
values(pg_temp.sqr_id('bus'),pg_temp.sqr_id('tenant_a'),'SQR synthetic','active');
insert into public.routes(id,tenant_id,school_id,route_name,route_code,route_type,status)
values(pg_temp.sqr_id('route'),pg_temp.sqr_id('tenant_a'),pg_temp.sqr_id('school_a'),'SQR synthetic','SQR','morning','active');
insert into public.route_trip_patterns(id,tenant_id,route_id,direction,display_name,status,schedule_review_required)
values(pg_temp.sqr_id('forward'),pg_temp.sqr_id('tenant_a'),pg_temp.sqr_id('route'),'forward','SQR outbound','active',false),
      (pg_temp.sqr_id('reverse'),pg_temp.sqr_id('tenant_a'),pg_temp.sqr_id('route'),'reverse','SQR return','active',false);
insert into public.route_stops(id,tenant_id,route_id,stop_name,stop_order,latitude,longitude,status)
values(pg_temp.sqr_id('pickup'),pg_temp.sqr_id('tenant_a'),pg_temp.sqr_id('route'),'SQR pickup',1,53.54,-113.49,'active'),
      (pg_temp.sqr_id('dropoff'),pg_temp.sqr_id('tenant_a'),pg_temp.sqr_id('route'),'SQR drop-off',2,53.55,-113.48,'active');
update public.routes set definition_status='ready' where id=pg_temp.sqr_id('route');
insert into public.bus_route_assignments(id,tenant_id,bus_id,route_id,route_trip_pattern_id,trip_type,effective_from,status)
values(pg_temp.sqr_id('service_forward'),pg_temp.sqr_id('tenant_a'),pg_temp.sqr_id('bus'),pg_temp.sqr_id('route'),pg_temp.sqr_id('forward'),'morning',current_date,'active'),
      (pg_temp.sqr_id('service_reverse'),pg_temp.sqr_id('tenant_a'),pg_temp.sqr_id('bus'),pg_temp.sqr_id('route'),pg_temp.sqr_id('reverse'),'evening',current_date,'active');
insert into public.students(id,tenant_id,school_id,first_name,last_name,status)
select id, case when name='cross_tenant_student' then pg_temp.sqr_id('tenant_b') else pg_temp.sqr_id('tenant_a') end,
  case name when 'cross_tenant_student' then pg_temp.sqr_id('school_b')
    when 'other_school_student' then pg_temp.sqr_id('school_other')
    when 'unassigned_student' then null else pg_temp.sqr_id('school_a') end,
  'SQR',name,case when name='inactive_student' then 'inactive' else 'active' end
from sqr_ids where name in ('student','other_school_student','cross_tenant_student','inactive_student',
  'reverse_student','missing_stop_student','expired_student','unassigned_student');
insert into public.student_bus_assignments(tenant_id,student_id,bus_route_assignment_id,route_trip_pattern_id,
  pickup_stop_id,dropoff_stop_id,effective_from,effective_to,status)
select pg_temp.sqr_id('tenant_a'), id,
  case when name='reverse_student' then pg_temp.sqr_id('service_reverse') else pg_temp.sqr_id('service_forward') end,
  case when name='reverse_student' then pg_temp.sqr_id('reverse') else pg_temp.sqr_id('forward') end,
  case name when 'reverse_student' then pg_temp.sqr_id('dropoff') when 'missing_stop_student' then null else pg_temp.sqr_id('pickup') end,
  case when name='reverse_student' then pg_temp.sqr_id('pickup') else pg_temp.sqr_id('dropoff') end,
  current_date-10,case when name='expired_student' then current_date-1 end,'active'
from sqr_ids where name in ('student','reverse_student','missing_stop_student','expired_student');
insert into public.driver_trips(id,tenant_id,driver_id,bus_id,route_id,route_trip_pattern_id,trip_name_snapshot,trip_type,status,service_date,started_at)
values(pg_temp.sqr_id('trip'),pg_temp.sqr_id('tenant_a'),pg_temp.sqr_id('driver_row'),pg_temp.sqr_id('bus'),pg_temp.sqr_id('route'),pg_temp.sqr_id('forward'),'SQR outbound','morning','active',current_date,now());
insert into public.guardians(id,tenant_id,profile_id,full_name,email,status)
values(gen_random_uuid(),pg_temp.sqr_id('tenant_a'),pg_temp.sqr_id('guardian'),'SQR guardian','sqr-guardian@example.test','active');
insert into public.student_guardians(tenant_id,student_id,guardian_id,relationship,status)
select pg_temp.sqr_id('tenant_a'),pg_temp.sqr_id('student'),g.id,'guardian','active'
from public.guardians g where g.profile_id=pg_temp.sqr_id('guardian');

-- Credential storage and private routines must never be reachable directly.
select pg_temp.sqr_assert(not has_table_privilege('authenticated','public.student_qr_credentials','SELECT'), 'credential SELECT denied');
select pg_temp.sqr_assert(not has_table_privilege('authenticated','public.student_qr_credentials','INSERT'), 'credential INSERT denied');
select pg_temp.sqr_assert(not has_function_privilege('authenticated','safebus_private.student_qr_context(text,uuid)','EXECUTE'), 'private resolver denied');
select pg_temp.sqr_assert(not has_function_privilege('service_role','public.record_student_qr_event_for_active_trip(text,text,uuid)','EXECUTE'), 'no service-role QR event API');
select pg_temp.sqr_assert(not has_function_privilege('anon','public.manage_student_qr_credential(uuid,text)','EXECUTE'), 'no anonymous issuing');

-- Role claims are transaction-local. Test helpers never return fixture tokens.
select set_config('request.jwt.claim.sub', pg_temp.sqr_id('admin')::text,true);
select set_config('request.jwt.claims', jsonb_build_object('sub',pg_temp.sqr_id('admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
insert into sqr_tokens select 'student',raw_token from public.manage_student_qr_credential(pg_temp.sqr_id('student'),'generate');
insert into sqr_tokens select 'other_school_student',raw_token from public.manage_student_qr_credential(pg_temp.sqr_id('other_school_student'),'generate');
insert into sqr_tokens select 'reverse_student',raw_token from public.manage_student_qr_credential(pg_temp.sqr_id('reverse_student'),'generate');
insert into sqr_tokens select 'missing_stop_student',raw_token from public.manage_student_qr_credential(pg_temp.sqr_id('missing_stop_student'),'generate');
insert into sqr_tokens select 'expired_student',raw_token from public.manage_student_qr_credential(pg_temp.sqr_id('expired_student'),'generate');
select pg_temp.sqr_denied($q$select public.manage_student_qr_credential(pg_temp.sqr_id('student'),'generate')$q$,'23505');
select pg_temp.sqr_denied($q$select public.manage_student_qr_credential(pg_temp.sqr_id('inactive_student'),'generate')$q$,'23514');
select pg_temp.sqr_denied($q$select public.manage_student_qr_credential(pg_temp.sqr_id('cross_tenant_student'),'generate')$q$);
reset role;
select pg_temp.sqr_assert((select count(*)=1 from public.student_qr_credentials where student_id=pg_temp.sqr_id('student') and status='active'), 'one active pass');
select pg_temp.sqr_assert(not exists(select 1 from public.student_qr_credentials c join sqr_tokens t on c.token_hash=t.token), 'no raw token storage');

select set_config('request.jwt.claim.sub',pg_temp.sqr_id('school_admin')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.sqr_id('school_admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
select pg_temp.sqr_assert((select has_active_credential from public.get_admin_student_qr_credential_status(pg_temp.sqr_id('student'))), 'own school status');
select pg_temp.sqr_denied($q$select public.get_admin_student_qr_credential_status(pg_temp.sqr_id('other_school_student'))$q$);
select pg_temp.sqr_denied($q$select public.manage_student_qr_credential(pg_temp.sqr_id('other_school_student'),'rotate')$q$);
select pg_temp.sqr_denied($q$select public.manage_student_qr_credential(pg_temp.sqr_id('unassigned_student'),'generate')$q$);
reset role;

select set_config('request.jwt.claim.sub',pg_temp.sqr_id('transport_admin')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.sqr_id('transport_admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
insert into sqr_tokens select 'unassigned_student',raw_token from public.manage_student_qr_credential(pg_temp.sqr_id('unassigned_student'),'generate');
reset role;

-- Non-admin management denial and driver-only scanning.
do $$
declare who text;
begin
  foreach who in array array['guardian','platform','driver','inactive_driver','other_driver'] loop
    perform set_config('request.jwt.claim.sub',pg_temp.sqr_id(who)::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.sqr_id(who),'role','authenticated')::text,true);
    set local role authenticated;
    perform pg_temp.sqr_denied($q$select public.manage_student_qr_credential(pg_temp.sqr_id('student'),'rotate')$q$);
    if who <> 'driver' then
      perform pg_temp.sqr_denied($q$select public.record_student_qr_event_for_active_trip((select token from sqr_tokens where name='student'),'picked_up',pg_temp.sqr_id('trip'))$q$);
    end if;
    reset role;
  end loop;
end $$;

select set_config('request.jwt.claim.sub',pg_temp.sqr_id('driver')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.sqr_id('driver'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.sqr_denied($q$select public.record_student_qr_event_for_active_trip('malformed','picked_up',pg_temp.sqr_id('trip'))$q$);
select pg_temp.sqr_denied($q$select public.record_student_qr_event_for_active_trip((select token from sqr_tokens where name='student'),'picked_up',pg_temp.sqr_id('stale_trip'))$q$);
select pg_temp.sqr_denied($q$select public.resolve_student_qr_for_active_trip((select token from sqr_tokens where name='reverse_student'))$q$);
select pg_temp.sqr_denied($q$select public.record_student_qr_event_for_active_trip((select token from sqr_tokens where name='expired_student'),'picked_up',pg_temp.sqr_id('trip'))$q$);
select pg_temp.sqr_denied($q$select public.record_student_qr_event_for_active_trip((select token from sqr_tokens where name='missing_stop_student'),'picked_up',pg_temp.sqr_id('trip'))$q$,'23514');
select pg_temp.sqr_assert((select outcome='pickup_required' from public.record_student_qr_event_for_active_trip((select token from sqr_tokens where name='student'),'dropped_off',pg_temp.sqr_id('trip'))), 'drop-off ordering');
select pg_temp.sqr_assert((select outcome='recorded' from public.record_student_qr_event_for_active_trip((select token from sqr_tokens where name='student'),'picked_up',pg_temp.sqr_id('trip'))), 'pickup recorded');
select pg_temp.sqr_assert((select outcome='already_recorded' from public.record_student_qr_event_for_active_trip((select token from sqr_tokens where name='student'),'picked_up',pg_temp.sqr_id('trip'))), 'pickup retry does not drop off');
select pg_temp.sqr_assert((select outcome='recorded' from public.record_student_qr_event_for_active_trip((select token from sqr_tokens where name='student'),'dropped_off',pg_temp.sqr_id('trip'))), 'drop-off recorded');
select pg_temp.sqr_assert((select outcome='already_recorded' from public.record_student_qr_event_for_active_trip((select token from sqr_tokens where name='student'),'dropped_off',pg_temp.sqr_id('trip'))), 'drop-off retry');
select pg_temp.sqr_assert((select outcome='complete' from public.record_student_qr_event_for_active_trip((select token from sqr_tokens where name='student'),'picked_up',pg_temp.sqr_id('trip'))), 'completed trip has no new pickup');
reset role;
select pg_temp.sqr_assert((select count(*)=2 from public.student_trip_events where driver_trip_id=pg_temp.sqr_id('trip') and student_id=pg_temp.sqr_id('student')), 'exactly one event of each type');
select pg_temp.sqr_assert((select count(*)=2 from public.user_notifications
  where recipient_profile_id=pg_temp.sqr_id('guardian') and source_type='student_trip_event' and student_id=pg_temp.sqr_id('student')), 'one linked guardian notification per event');

-- A revoked assignment cannot authorize a scan even with a previously valid pass.
update public.student_bus_assignments set status='inactive'
where tenant_id=pg_temp.sqr_id('tenant_a') and student_id=pg_temp.sqr_id('student');
set local role authenticated;
select pg_temp.sqr_denied($q$select public.record_student_qr_event_for_active_trip((select token from sqr_tokens where name='student'),'picked_up',pg_temp.sqr_id('trip'))$q$);
reset role;
update public.student_bus_assignments set status='active'
where tenant_id=pg_temp.sqr_id('tenant_a') and student_id=pg_temp.sqr_id('student');

-- Rotate and revoke, then check the hardened resolver rejects both old tokens.
select set_config('request.jwt.claim.sub',pg_temp.sqr_id('admin')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.sqr_id('admin'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
insert into sqr_tokens select 'replacement',raw_token from public.manage_student_qr_credential(pg_temp.sqr_id('student'),'rotate');
reset role;
update public.students set status='inactive' where id=pg_temp.sqr_id('student');
set local role authenticated;
select * from public.manage_student_qr_credential(pg_temp.sqr_id('student'),'revoke');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.sqr_id('driver')::text,true);
select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.sqr_id('driver'),'role','authenticated')::text,true);
set local role authenticated;
select pg_temp.sqr_denied($q$select public.resolve_student_qr_for_active_trip((select token from sqr_tokens where name='student'))$q$);
select pg_temp.sqr_denied($q$select public.resolve_student_qr_for_active_trip((select token from sqr_tokens where name='replacement'))$q$);
reset role;

select 'PASS: student QR authorization, explicit events, retry safety and lifecycle' as result;
rollback;
