-- C1 prepared forward migration. NOT in the active manifest; do not apply yet.
-- Recovery, security installation, honest adoption and protected release remain
-- prerequisites. Promote only after reviewing the 0124 installation-tip guard.
-- CLI-generated, renamed to the repository's four-digit canonical convention.
set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $$
begin
  if to_regprocedure('safebus_private.send_tracking_invalidation(text,text)') is null
     or to_regprocedure('safebus_private.send_guardian_tracking_invalidation(uuid,text)') is null
     or to_regprocedure('safebus_private.notify_tracking_location_change()') is null
     or to_regprocedure('public.notify_tracking_location_change()') is not null
     or to_regprocedure('public.is_current_user_session_active()') is null
     or to_regprocedure('cron.schedule(text,text,text)') is null
     or not exists (
       select 1 from pg_trigger t
       where t.tgrelid = to_regclass('public.driver_trip_current_locations')
         and t.tgname = 'notify_tracking_location_change' and not t.tgisinternal
         and t.tgenabled = 'O'
         and t.tgfoid = to_regprocedure('safebus_private.notify_tracking_location_change()')
     ) then
    raise exception 'Validate the reconciled security baseline before C1 activation.';
  end if;
end;
$$;

-- One durable dirty marker per trip, never one row per GPS point or child.
-- No coordinates, names, student IDs, JWTs or session IDs are stored here.
create table safebus_private.tracking_invalidation_queue (
  driver_trip_id uuid primary key references public.driver_trips(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  generation bigint not null default 1 check (generation > 0),
  pass_generation bigint,
  guardian_cursor uuid,
  admin_sent boolean not null default false,
  first_pending_at timestamptz not null default clock_timestamp(),
  available_at timestamptz not null default clock_timestamp(),
  latest_at timestamptz not null default clock_timestamp(),
  failures integer not null default 0,
  last_error_code text,
  check (pass_generation is null or pass_generation <= generation)
);
alter table safebus_private.tracking_invalidation_queue enable row level security;
revoke all on table safebus_private.tracking_invalidation_queue
  from public, anon, authenticated, service_role;
create index tracking_invalidation_queue_ready_idx
  on safebus_private.tracking_invalidation_queue(available_at, driver_trip_id);

-- Existing service/link indexes remain in use. This supports the bus/pattern
-- lookup without scanning every route's assignments in a tenant.
create index tracking_bus_service_active_idx
  on public.bus_route_assignments(tenant_id, bus_id, route_id, route_trip_pattern_id, id)
  where status = 'active';

-- Keep this function's OID: the existing trigger follows it. ONLY the location
-- path changes; trip and authorization triggers remain synchronous and intact.
create or replace function safebus_private.notify_tracking_location_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into safebus_private.tracking_invalidation_queue as q
    (driver_trip_id, tenant_id)
  values (new.driver_trip_id, new.tenant_id)
  on conflict (driver_trip_id) do update
    set generation = q.generation + 1, latest_at = pg_catalog.clock_timestamp();
  return null;
end;
$$;
revoke all on function safebus_private.notify_tracking_location_change()
  from public, anon, authenticated, service_role;

-- Strict internal adapter for the reviewed realtime.messages insertion contract.
-- The hosted realtime.send body (read-only verified 2026-10-14) catches OTHERS
-- and only warns: calling it cannot establish durable insertion for queue ACKs.
-- Preserve its columns, private flag, topic setting and generated payload ID,
-- but propagate insertion errors so the worker can roll back/retry the page.
-- This does not change provider schema, ownership, grants, policies or routines.
create function safebus_private.send_queued_tracking_invalidation(p_topic text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_message_id uuid := pg_catalog.gen_random_uuid();
begin
  if p_topic is null or p_topic !~ '^safebus:(guardian|tenant):[0-9a-f-]{36}$' then
    raise exception 'Invalid private tracking topic.' using errcode = '22023';
  end if;
  perform pg_catalog.set_config('realtime.topic', p_topic, true);
  insert into realtime.messages(id, payload, event, topic, private, extension)
    values (v_message_id, pg_catalog.jsonb_build_object(
      'id', v_message_id, 'reason', 'location', 'occurred_at', pg_catalog.statement_timestamp()),
      'tracking_changed', p_topic, true, 'broadcast');
end;
$$;
revoke all on function safebus_private.send_queued_tracking_invalidation(text)
  from public, anon, authenticated, service_role;

create function safebus_private.dispatch_tracking_invalidations(
  p_scope_limit integer default 10, p_message_limit integer default 250
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_candidate record;
  v_queue safebus_private.tracking_invalidation_queue%rowtype;
  v_trip public.driver_trips%rowtype;
  v_profile_id uuid;
  v_cursor uuid;
  v_pass_generation bigint;
  v_page_limit integer;
  v_page_count integer;
  v_scope_messages integer;
  v_messages integer := 0;
  v_scopes integer := 0;
  v_failed integer := 0;
  v_deleted integer;
  v_ready_at timestamptz := pg_catalog.clock_timestamp();
begin
  if p_scope_limit is null or p_scope_limit not between 1 and 50
     or p_message_limit is null or p_message_limit not between 1 and 1000 then
    raise exception 'Invalid tracking worker bounds.' using errcode = '22023';
  end if;

  for v_candidate in
    select q.driver_trip_id from safebus_private.tracking_invalidation_queue q
    where q.available_at <= v_ready_at
    order by q.available_at, q.driver_trip_id limit p_scope_limit
  loop
    exit when v_messages >= p_message_limit;
    -- Only workers take this advisory lock. Producers can still briefly contend
    -- on final queue progress writes, bounded by the outer job timeout.
    -- Hash collisions merely defer a scope; transaction rollback releases locks.
    if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended(
      'safebus:tracking-worker:' || v_candidate.driver_trip_id::text, 0)) then
      continue;
    end if;
    select * into v_queue from safebus_private.tracking_invalidation_queue q
      where q.driver_trip_id = v_candidate.driver_trip_id;
    if not found then continue; end if;
    v_scopes := v_scopes + 1;
    v_scope_messages := 0;
    begin
      select dt.* into v_trip from public.driver_trips dt
      join public.tenants t on t.id = dt.tenant_id and t.status = 'active'
      join public.drivers d on d.id = dt.driver_id and d.tenant_id = dt.tenant_id and d.status = 'active'
      join public.buses b on b.id = dt.bus_id and b.tenant_id = dt.tenant_id and b.status = 'active'
      join public.routes r on r.id = dt.route_id and r.tenant_id = dt.tenant_id and r.status = 'active'
      join public.route_trip_patterns rtp on rtp.id = dt.route_trip_pattern_id
        and rtp.tenant_id = dt.tenant_id and rtp.route_id = dt.route_id and rtp.status = 'active'
      where dt.id = v_queue.driver_trip_id and dt.tenant_id = v_queue.tenant_id
        and dt.status in ('active', 'paused');
      if not found then
        delete from safebus_private.tracking_invalidation_queue
          where driver_trip_id = v_queue.driver_trip_id and generation = v_queue.generation;
        continue;
      end if;
      v_pass_generation := coalesce(v_queue.pass_generation, v_queue.generation);
      v_cursor := v_queue.guardian_cursor;
      if not v_queue.admin_sent then
        perform safebus_private.send_queued_tracking_invalidation(
          'safebus:tenant:' || v_queue.tenant_id::text);
        v_scope_messages := 1;
      end if;
      v_page_limit := least(25, p_message_limit - v_messages - v_scope_messages);
      v_page_count := 0;
      -- Deduplicate sibling/service links and resolve eligibility on EVERY page.
      -- Never snapshot a recipient list at enqueue time. This is a refresh hint,
      -- not coordinate authorization; the data RPCs still validate the session.
      for v_profile_id in
        select distinct g.profile_id
        from public.bus_route_assignments bra
        join public.student_bus_assignments sba on sba.bus_route_assignment_id = bra.id
          and sba.tenant_id = bra.tenant_id and sba.route_trip_pattern_id = bra.route_trip_pattern_id
          and sba.status = 'active' and sba.effective_from <= current_date
          and (sba.effective_to is null or sba.effective_to >= current_date)
        join public.students s on s.id = sba.student_id and s.tenant_id = sba.tenant_id and s.status = 'active'
        join public.student_guardians sg on sg.student_id = s.id and sg.tenant_id = s.tenant_id
          and sg.status = 'active' and (sg.access_expires_at is null or sg.access_expires_at > pg_catalog.clock_timestamp())
        join public.guardians g on g.id = sg.guardian_id and g.tenant_id = sg.tenant_id and g.status = 'active'
        join public.profiles p on p.id = g.profile_id and p.tenant_id = g.tenant_id
          and p.status = 'active' and p.role = 'guardian'
        where bra.tenant_id = v_trip.tenant_id and bra.bus_id = v_trip.bus_id
          and bra.route_id = v_trip.route_id and bra.route_trip_pattern_id = v_trip.route_trip_pattern_id
          and bra.status = 'active' and (bra.effective_from is null or bra.effective_from <= current_date)
          and (bra.effective_to is null or bra.effective_to >= current_date)
          and (v_queue.guardian_cursor is null or g.profile_id > v_queue.guardian_cursor)
        order by g.profile_id limit v_page_limit
      loop
        perform safebus_private.send_queued_tracking_invalidation('safebus:guardian:' || v_profile_id::text);
        v_cursor := v_profile_id;
        v_page_count := v_page_count + 1;
        v_scope_messages := v_scope_messages + 1;
      end loop;

      -- Full pages continue at the next cursor. A zero-size page is budget
      -- exhaustion, NOT end-of-audience. A short page completes the pass.
      if v_page_limit > 0 and v_page_count < v_page_limit then
        delete from safebus_private.tracking_invalidation_queue q
          where q.driver_trip_id = v_queue.driver_trip_id and q.generation = v_pass_generation;
        get diagnostics v_deleted = row_count;
        if v_deleted = 0 then
          -- GPS arrived during this pass: retain another pass for earlier readers.
          update safebus_private.tracking_invalidation_queue set
            pass_generation = null, guardian_cursor = null, admin_sent = false,
            available_at = pg_catalog.clock_timestamp(), failures = 0, last_error_code = null
          where driver_trip_id = v_queue.driver_trip_id;
        end if;
      else
        update safebus_private.tracking_invalidation_queue set
          pass_generation = v_pass_generation, guardian_cursor = v_cursor, admin_sent = true,
          available_at = pg_catalog.clock_timestamp(), failures = 0, last_error_code = null
        where driver_trip_id = v_queue.driver_trip_id;
      end if;
      v_messages := v_messages + v_scope_messages;
    exception when others then
      -- A scope's messages/progress roll back together; other scopes can proceed.
      -- Store only the SQLSTATE, never an exception message or payload.
      update safebus_private.tracking_invalidation_queue set
        failures = least(failures + 1, 1000000), last_error_code = sqlstate,
        available_at = pg_catalog.clock_timestamp() + interval '1 second'
      where driver_trip_id = v_queue.driver_trip_id;
      v_failed := v_failed + 1;
    end;
  end loop;
  return pg_catalog.jsonb_build_object('scopes', v_scopes, 'messages', v_messages, 'failed_scopes', v_failed);
end;
$$;
-- This is database-internal, NOT a public RPC or service-role endpoint.
revoke all on function safebus_private.dispatch_tracking_invalidations(integer,integer)
  from public, anon, authenticated, service_role;

-- No Edge Function, network credentials or new public authorization surface.
-- pg_cron serializes runs of a named job; advisory locks also cover manual runs.
-- These outer SET LOCALs apply before the worker statement starts.
select cron.schedule('safebus-tracking-invalidation-dispatcher', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_tracking_invalidations(10, 250);
$job$);
