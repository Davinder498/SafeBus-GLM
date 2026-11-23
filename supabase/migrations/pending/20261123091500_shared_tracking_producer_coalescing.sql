-- Forward-only GPS fan-out reduction. Publish through a protected operational release.
-- Current Android clients still verify GPS by RPC; older clients retain polling fallback.
-- This function is the existing AFTER INSERT/UPDATE trigger target: preserve OID and ACL.
set local lock_timeout = '2s';
set local statement_timeout = '10s';

do $guard$
begin
  if to_regprocedure('safebus_private.notify_tracking_location_change()') is null
     or to_regclass('safebus_private.shared_tracking_queue') is null
     or to_regclass('safebus_private.tracking_invalidation_queue') is null
     or not exists (
       select 1 from pg_trigger t
       where t.tgname='notify_tracking_location_change'
         and t.tgrelid='public.driver_trip_current_locations'::regclass
         and t.tgenabled='O'
         and t.tgfoid='safebus_private.notify_tracking_location_change()'::regprocedure
     ) then
    raise exception 'Shared tracking and location trigger must be installed first.'
      using errcode='55000';
  end if;
end;
$guard$;

create or replace function safebus_private.notify_tracking_location_change()
returns trigger language plpgsql security definer set search_path = ''
as $producer$
begin
  -- One bounded shared dirty marker per trip, not a row per student or guardian.
  -- Five-second *leading* coalescing: a new marker is due after five seconds;
  -- successive fixes cannot keep postponing its delivery.
  -- Retain generation increments so a GPS fix racing a worker ACK is never lost.
  insert into safebus_private.shared_tracking_queue as q
    (driver_trip_id, tenant_id, available_at)
  values (new.driver_trip_id, new.tenant_id,
          pg_catalog.clock_timestamp() + interval '5 seconds')
  on conflict (driver_trip_id) do update
    set generation = q.generation + 1, latest_at = pg_catalog.clock_timestamp();

  -- Location-only messages on personal guardian topics are discontinued.
  -- Personal topics remain available for control/revocation events; the old
  -- queue/worker stays installed to drain prior rows and support rollback.
  return null;
end;
$producer$;

revoke all on function safebus_private.notify_tracking_location_change()
  from public, anon, authenticated, service_role;
