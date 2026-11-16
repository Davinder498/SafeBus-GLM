-- Prepared forward change. Install only through the protected operational release.
set local lock_timeout = '2s';
set local statement_timeout = '30s';

-- Shared hints have their own progress and retry state. No coordinates or recipients.
create table safebus_private.shared_tracking_queue (
  driver_trip_id uuid primary key references public.driver_trips(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  shard integer generated always as (strpos('0123456789abcdef', left(driver_trip_id::text, 1)) - 1) stored,
  generation bigint not null default 1 check (generation > 0),
  first_pending_at timestamptz not null default clock_timestamp(),
  available_at timestamptz not null default clock_timestamp(),
  latest_at timestamptz not null default clock_timestamp(),
  failures integer not null default 0,
  last_error_code text
);
alter table safebus_private.shared_tracking_queue enable row level security;
revoke all on safebus_private.shared_tracking_queue from public, anon, authenticated, service_role;
create index shared_tracking_queue_ready_idx on safebus_private.shared_tracking_queue(shard, available_at, driver_trip_id);

create or replace function safebus_private.notify_tracking_location_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into safebus_private.tracking_invalidation_queue as q (driver_trip_id, tenant_id)
  values (new.driver_trip_id, new.tenant_id)
  on conflict (driver_trip_id) do update
    set generation = q.generation + 1, latest_at = pg_catalog.clock_timestamp();
  insert into safebus_private.shared_tracking_queue as q (driver_trip_id, tenant_id)
  values (new.driver_trip_id, new.tenant_id)
  on conflict (driver_trip_id) do update
    set generation = q.generation + 1, latest_at = pg_catalog.clock_timestamp();
  return null;
end;
$$;
revoke all on function safebus_private.notify_tracking_location_change() from public, anon, authenticated, service_role;

create function safebus_private.dispatch_shared_tracking(p_shard integer, p_limit integer default 256)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ids uuid[];
  v_generations bigint[];
  v_messages integer := 0;
  v_failed integer := 0;
  v_started timestamptz := pg_catalog.clock_timestamp();
begin
  if p_shard is null or p_shard not between 0 and 15 or p_limit is null or p_limit not between 1 and 256 then
    raise exception 'Invalid shared tracking worker bounds.' using errcode = '22023';
  end if;
  -- Lock only the claimed bounded batch, skipping other workers. GPS may briefly
  -- wait for these rows; the cron transaction has a 750ms statement timeout.
  select array_agg(c.driver_trip_id order by c.driver_trip_id),
         array_agg(c.generation order by c.driver_trip_id)
  into v_ids, v_generations from (
    select q.driver_trip_id, q.generation from safebus_private.shared_tracking_queue q
    where q.shard = p_shard and q.available_at <= v_started
    order by q.available_at, q.driver_trip_id limit p_limit for update skip locked
  ) c;
  if v_ids is null then return jsonb_build_object('scopes',0,'messages',0,'failed_scopes',0); end if;
  begin
    -- One set-based insertion for the batch. Deduplicate tenant hints within it.
    -- Shared topics are still coordinate-free and authorized at subscription/read.
    with eligible as materialized (
      select dt.id, dt.tenant_id from public.driver_trips dt
      join safebus_private.shared_tracking_queue q on q.driver_trip_id=dt.id and q.tenant_id=dt.tenant_id
      join public.tenants t on t.id=dt.tenant_id and t.status='active'
      join public.drivers d on d.id=dt.driver_id and d.tenant_id=dt.tenant_id and d.status='active'
      join public.buses b on b.id=dt.bus_id and b.tenant_id=dt.tenant_id and b.status='active'
      join public.routes r on r.id=dt.route_id and r.tenant_id=dt.tenant_id and r.status='active'
      join public.route_trip_patterns rtp on rtp.id=dt.route_trip_pattern_id
        and rtp.tenant_id=dt.tenant_id and rtp.route_id=dt.route_id and rtp.status='active'
      where dt.id=any(v_ids) and dt.status in ('active','paused')
    ), topics as (
      select 'safebus:bus:' || pg_catalog.encode(pg_catalog.sha256(
        pg_catalog.convert_to(id::text || ':safebus:bus:v1', 'UTF8')), 'hex') as topic from eligible
      union
      select 'safebus:tenant:' || tenant_id::text from eligible
    ), messages as materialized (
      select pg_catalog.gen_random_uuid() as id, topic from topics
    )
    insert into realtime.messages(id,payload,event,topic,private,extension)
      select id,pg_catalog.jsonb_build_object('id',id,'reason','location',
        'occurred_at',pg_catalog.statement_timestamp()),'tracking_changed',topic,true,'broadcast'
      from messages;
    get diagnostics v_messages = row_count;
    -- Matching generation ACK only. A newer enqueue must always survive.
    delete from safebus_private.shared_tracking_queue q
      using unnest(v_ids,v_generations) as claimed(id,generation)
      where q.driver_trip_id=claimed.id and q.generation=claimed.generation;
    update safebus_private.shared_tracking_queue set
      available_at=pg_catalog.clock_timestamp(), first_pending_at=latest_at,
      failures=0,last_error_code=null where driver_trip_id=any(v_ids);
  exception when others then
    -- The insertion and ACK roll back together. Rotate the failed batch behind
    -- other ready work; retain only SQLSTATE, never payload or exception text.
    update safebus_private.shared_tracking_queue set
      failures=least(failures+1,1000000), last_error_code=sqlstate,
      available_at=pg_catalog.clock_timestamp()+make_interval(secs=>least(30,failures+1))
      where driver_trip_id=any(v_ids);
    v_messages := 0;
    v_failed := cardinality(v_ids);
  end;
  return pg_catalog.jsonb_build_object('scopes',cardinality(v_ids),'messages',v_messages,
    'failed_scopes',v_failed,'duration_ms',extract(epoch from (pg_catalog.clock_timestamp()-v_started))*1000);
end;
$$;
revoke all on function safebus_private.dispatch_shared_tracking(integer,integer) from public, anon, authenticated, service_role;

-- Internal observation only. Excludes identities and does not enqueue or send.
create function safebus_private.shared_tracking_queue_health()
returns jsonb language sql security definer set search_path = ''
as $$
  select pg_catalog.jsonb_build_object('pending',count(*),
    'oldest_pending_seconds',coalesce(greatest(0,extract(epoch from (pg_catalog.statement_timestamp()-min(first_pending_at)))),0),
    'retrying',count(*) filter(where failures>0), 'max_failures',coalesce(max(failures),0))
  from safebus_private.shared_tracking_queue;
$$;
revoke all on function safebus_private.shared_tracking_queue_health() from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION safebus_private.dispatch_tracking_invalidations(p_scope_limit integer DEFAULT 10, p_message_limit integer DEFAULT 250)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_candidate record;
  v_queue safebus_private.tracking_invalidation_queue%rowtype;
  v_trip public.driver_trips%rowtype;
  v_profile_ids uuid[];
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
      -- Legacy parent-only lane. admin_sent remains the existing pass marker;
      -- shared and tenant hints now advance independently of this cursor.
      v_page_limit := least(25, p_message_limit - v_messages - v_scope_messages);
      v_page_count := 0;
      -- Deduplicate sibling/service links and resolve eligibility on EVERY page.
      -- Never snapshot a recipient list at enqueue time. This is a refresh hint,
      -- not coordinate authorization; the data RPCs still validate the session.
      select coalesce(array_agg(a.profile_id order by a.profile_id), array[]::uuid[])
        into v_profile_ids from (
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
      ) a;
      v_page_count := cardinality(v_profile_ids);
      if v_page_count > 0 then
        -- One statement per bounded audience page. The private topic is carried
        -- explicitly in each row; no RLS decision or payload is shared between
        -- guardians. Unique IDs bind payloads to their message rows.
        with messages as materialized (
          select pg_catalog.gen_random_uuid() as id,
            'safebus:guardian:' || recipient::text as topic
          from unnest(v_profile_ids) as recipient
        )
        insert into realtime.messages(id, payload, event, topic, private, extension)
          select id, pg_catalog.jsonb_build_object(
            'id', id, 'reason', 'location', 'occurred_at', pg_catalog.statement_timestamp()),
            'tracking_changed', topic, true, 'broadcast'
          from messages;
        v_cursor := v_profile_ids[v_page_count];
        v_scope_messages := v_scope_messages + v_page_count;
      end if;

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
$function$

;

create or replace function safebus_private.prune_tracking_worker_history()
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_deleted integer;
  v_last bigint;
  v_end bigint;
  v_next bigint;
  v_cutoff timestamptz := pg_catalog.statement_timestamp() - interval '48 hours';
begin
  select last_runid, sweep_end into strict v_last, v_end
  from safebus_private.tracking_history_cursor where singleton for update;
  if v_last >= v_end then
    v_last := 0;
    select coalesce(max(runid), 0) into v_end from cron.job_run_details;
  end if;
  -- Materialize at most 5000 indexed rows BEFORE filtering job or age. Advance
  -- over unrelated history too, otherwise another job's old rows stall cleanup.
  with batch as materialized (
    select d.runid, d.jobid, d.end_time from cron.job_run_details d
    where d.runid > v_last and d.runid <= v_end
    order by d.runid limit 5000
  ), removed as (
    delete from cron.job_run_details d using batch b
    where d.runid = b.runid and d.jobid = b.jobid
      and d.end_time < v_cutoff and b.end_time < v_cutoff
      and b.jobid in (select jobid from cron.job where jobname in
        ('safebus-tracking-invalidation-dispatcher', 'safebus-tracking-invalidation-history',
        'safebus-shared-tracking-00', 'safebus-shared-tracking-01', 'safebus-shared-tracking-02', 'safebus-shared-tracking-03', 'safebus-shared-tracking-04', 'safebus-shared-tracking-05', 'safebus-shared-tracking-06', 'safebus-shared-tracking-07', 'safebus-shared-tracking-08', 'safebus-shared-tracking-09', 'safebus-shared-tracking-10', 'safebus-shared-tracking-11', 'safebus-shared-tracking-12', 'safebus-shared-tracking-13', 'safebus-shared-tracking-14', 'safebus-shared-tracking-15'))
    returning d.runid
  )
  select (select count(*)::integer from removed), coalesce(max(runid), v_end)
  into v_deleted, v_next from batch;
  update safebus_private.tracking_history_cursor
    set last_runid = v_next, sweep_end = v_end where singleton;
  return v_deleted;
end;
$$;
revoke all on function safebus_private.prune_tracking_worker_history()
  from public, anon, authenticated, service_role;

insert into safebus_private.shared_tracking_queue(driver_trip_id,tenant_id,first_pending_at,latest_at)
  select driver_trip_id,tenant_id,first_pending_at,latest_at from safebus_private.tracking_invalidation_queue;

select cron.schedule('safebus-shared-tracking-00', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(0, 256);
$job$);
select cron.schedule('safebus-shared-tracking-01', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(1, 256);
$job$);
select cron.schedule('safebus-shared-tracking-02', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(2, 256);
$job$);
select cron.schedule('safebus-shared-tracking-03', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(3, 256);
$job$);
select cron.schedule('safebus-shared-tracking-04', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(4, 256);
$job$);
select cron.schedule('safebus-shared-tracking-05', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(5, 256);
$job$);
select cron.schedule('safebus-shared-tracking-06', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(6, 256);
$job$);
select cron.schedule('safebus-shared-tracking-07', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(7, 256);
$job$);
select cron.schedule('safebus-shared-tracking-08', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(8, 256);
$job$);
select cron.schedule('safebus-shared-tracking-09', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(9, 256);
$job$);
select cron.schedule('safebus-shared-tracking-10', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(10, 256);
$job$);
select cron.schedule('safebus-shared-tracking-11', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(11, 256);
$job$);
select cron.schedule('safebus-shared-tracking-12', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(12, 256);
$job$);
select cron.schedule('safebus-shared-tracking-13', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(13, 256);
$job$);
select cron.schedule('safebus-shared-tracking-14', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(14, 256);
$job$);
select cron.schedule('safebus-shared-tracking-15', '1 second', $job$
  set local statement_timeout = '750ms';
  set local lock_timeout = '100ms';
  select safebus_private.dispatch_shared_tracking(15, 256);
$job$);
