-- SafeBus Alberta - QR-paired bus tracking sessions
--
-- An authenticated active driver scans a bus credential to claim one
-- administrator-prepared run. The server creates a short-lived tracking
-- session and derives tenant, driver, bus, route, and trip identity from that
-- session for every GPS write. The browser never chooses a bus or route id.

alter table public.driver_trips
  add column if not exists bus_number_snapshot text;

comment on column public.driver_trips.bus_number_snapshot is
  'Stable bus number captured when a QR-started trip begins.';

create or replace function public.protect_assigned_bus_number()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.bus_number is distinct from old.bus_number
    and exists (
      select 1 from public.bus_route_assignments bra where bra.bus_id = old.id
    ) then
    raise exception 'Bus number is permanent after the bus is assigned to a service.'
      using errcode = '55006';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_assigned_bus_number on public.buses;
create trigger protect_assigned_bus_number
before update of bus_number on public.buses
for each row execute function public.protect_assigned_bus_number();

alter table public.driver_trip_location_updates
  drop constraint if exists driver_trip_location_updates_source_check;
alter table public.driver_trip_location_updates
  add constraint driver_trip_location_updates_source_check
  check (source in ('browser', 'manual', 'bus_qr'));

alter table public.driver_trip_current_locations
  drop constraint if exists driver_trip_current_locations_source_check;
alter table public.driver_trip_current_locations
  add constraint driver_trip_current_locations_source_check
  check (source in ('browser', 'manual', 'bus_qr'));

create table if not exists public.bus_qr_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bus_id uuid not null references public.buses(id) on delete cascade,
  token_hash text not null,
  status text not null default 'active',
  created_by uuid not null references public.profiles(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete restrict,
  replaced_by uuid references public.bus_qr_credentials(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint bus_qr_credentials_status_check check (status in ('active', 'revoked')),
  constraint bus_qr_credentials_revoked_check check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

create unique index if not exists bus_qr_credentials_token_hash_unique
  on public.bus_qr_credentials(token_hash);
create unique index if not exists bus_qr_credentials_one_active_per_bus
  on public.bus_qr_credentials(bus_id)
  where status = 'active';
create index if not exists bus_qr_credentials_tenant_bus_idx
  on public.bus_qr_credentials(tenant_id, bus_id, status);

create table if not exists public.bus_run_dispatches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  bus_id uuid not null references public.buses(id) on delete restrict,
  bus_route_assignment_id uuid not null references public.bus_route_assignments(id) on delete restrict,
  route_id uuid not null references public.routes(id) on delete restrict,
  route_trip_pattern_id uuid not null references public.route_trip_patterns(id) on delete restrict,
  service_date date not null default current_date,
  status text not null default 'ready',
  prepared_by uuid not null references public.profiles(id) on delete restrict,
  claimed_by_driver_id uuid references public.drivers(id) on delete restrict,
  driver_trip_id uuid references public.driver_trips(id) on delete restrict,
  prepared_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint bus_run_dispatches_status_check
    check (status in ('ready', 'active', 'completed', 'cancelled'))
);

create unique index if not exists bus_run_dispatches_one_open_per_bus
  on public.bus_run_dispatches(bus_id)
  where status in ('ready', 'active');
create unique index if not exists bus_run_dispatches_driver_trip_unique
  on public.bus_run_dispatches(driver_trip_id)
  where driver_trip_id is not null;
create index if not exists bus_run_dispatches_tenant_date_idx
  on public.bus_run_dispatches(tenant_id, service_date, status);

create table if not exists public.bus_tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  driver_trip_id uuid not null references public.driver_trips(id) on delete cascade,
  driver_id uuid not null references public.drivers(id) on delete cascade,
  bus_id uuid not null references public.buses(id) on delete restrict,
  bus_qr_credential_id uuid not null references public.bus_qr_credentials(id) on delete restrict,
  session_token_hash text not null,
  status text not null default 'active',
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '18 hours'),
  last_seen_at timestamptz,
  ended_at timestamptz,
  constraint bus_tracking_sessions_status_check
    check (status in ('active', 'ended', 'revoked')),
  constraint bus_tracking_sessions_ended_check check (
    (status = 'active' and ended_at is null)
    or (status in ('ended', 'revoked') and ended_at is not null)
  )
);

create unique index if not exists bus_tracking_sessions_token_hash_unique
  on public.bus_tracking_sessions(session_token_hash);
create unique index if not exists bus_tracking_sessions_one_active_per_trip
  on public.bus_tracking_sessions(driver_trip_id)
  where status = 'active';
create unique index if not exists bus_tracking_sessions_one_active_per_driver
  on public.bus_tracking_sessions(driver_id)
  where status = 'active';
create unique index if not exists bus_tracking_sessions_one_active_per_bus
  on public.bus_tracking_sessions(bus_id)
  where status = 'active';
create index if not exists bus_tracking_sessions_tenant_trip_idx
  on public.bus_tracking_sessions(tenant_id, driver_trip_id, status);

alter table public.bus_qr_credentials enable row level security;
alter table public.bus_run_dispatches enable row level security;
alter table public.bus_tracking_sessions enable row level security;

revoke all on public.bus_qr_credentials from public, anon, authenticated;
revoke all on public.bus_run_dispatches from public, anon, authenticated;
revoke all on public.bus_tracking_sessions from public, anon, authenticated;

create or replace function public.hash_bus_tracking_token(p_token text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select encode(digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
$$;

create or replace function public.create_bus_qr_token()
returns text
language sql
volatile
set search_path = public, extensions, pg_temp
as $$
  select 'sbus_bus_v1_' || translate(replace(encode(gen_random_bytes(32), 'base64'), '=', ''), '+/', '-_')
$$;

create or replace function public.create_bus_tracking_session_token()
returns text
language sql
volatile
set search_path = public, extensions, pg_temp
as $$
  select 'sbus_track_v1_' || translate(replace(encode(gen_random_bytes(32), 'base64'), '=', ''), '+/', '-_')
$$;

create or replace function public.manage_bus_qr_credential(p_bus_id uuid, p_action text)
returns table (
  bus_id uuid,
  credential_id uuid,
  status text,
  raw_token text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_token text;
  v_hash text;
  v_new_id uuid;
  v_old_ids uuid[];
begin
  if auth.uid() is null
    or v_tenant_id is null
    or not public.is_transportation_write_admin() then
    raise exception 'Bus QR credential management requires a tenant operational admin.'
      using errcode = '42501';
  end if;
  if p_bus_id is null or p_action not in ('generate', 'rotate', 'revoke') then
    raise exception 'Invalid bus QR credential request.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.buses b
    where b.id = p_bus_id and b.tenant_id = v_tenant_id and b.status <> 'retired'
  ) then
    raise exception 'Bus is not eligible for a QR credential.' using errcode = 'P0002';
  end if;

  perform 1 from public.buses b where b.id = p_bus_id for update;
  select coalesce(array_agg(id), '{}') into v_old_ids
  from public.bus_qr_credentials
  where tenant_id = v_tenant_id and bus_qr_credentials.bus_id = p_bus_id and status = 'active';

  if p_action = 'revoke' then
    update public.bus_qr_credentials
    set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
    where tenant_id = v_tenant_id and bus_qr_credentials.bus_id = p_bus_id and status = 'active';
    update public.bus_tracking_sessions
    set status = 'revoked', ended_at = now()
    where bus_qr_credential_id = any(v_old_ids) and status = 'active';
    return query select p_bus_id, null::uuid, 'revoked'::text, null::text, now();
    return;
  end if;

  if p_action = 'generate' and coalesce(array_length(v_old_ids, 1), 0) > 0 then
    raise exception 'Bus already has an active QR credential.' using errcode = '23505';
  end if;

  loop
    v_token := public.create_bus_qr_token();
    v_hash := public.hash_bus_tracking_token(v_token);
    exit when not exists (select 1 from public.bus_qr_credentials where token_hash = v_hash);
  end loop;

  update public.bus_qr_credentials
  set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
  where tenant_id = v_tenant_id and bus_qr_credentials.bus_id = p_bus_id and status = 'active';

  update public.bus_tracking_sessions
  set status = 'revoked', ended_at = now()
  where bus_qr_credential_id = any(v_old_ids) and status = 'active';

  insert into public.bus_qr_credentials(tenant_id, bus_id, token_hash, created_by)
  values (v_tenant_id, p_bus_id, v_hash, auth.uid())
  returning id into v_new_id;

  update public.bus_qr_credentials set replaced_by = v_new_id where id = any(v_old_ids);
  return query select p_bus_id, v_new_id, 'active'::text, v_token, now();
end;
$$;

create or replace function public.get_admin_bus_qr_credential_status(p_bus_id uuid)
returns table (
  bus_id uuid,
  has_active_credential boolean,
  credential_status text,
  credential_created_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select b.id, (credential.id is not null), credential.status, credential.created_at
  from public.buses b
  left join lateral (
    select c.id, c.status, c.created_at
    from public.bus_qr_credentials c
    where c.bus_id = b.id and c.tenant_id = b.tenant_id and c.status = 'active'
    order by c.created_at desc
    limit 1
  ) credential on true
  where auth.uid() is not null
    and public.is_transportation_write_admin()
    and b.tenant_id = public.current_tenant_id()
    and b.id = p_bus_id
$$;

create or replace function public.prepare_bus_run(p_bus_route_assignment_id uuid)
returns public.bus_run_dispatches
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_service public.bus_route_assignments;
  v_dispatch public.bus_run_dispatches;
begin
  if auth.uid() is null
    or v_tenant_id is null
    or not public.is_transportation_write_admin() then
    raise exception 'Preparing a bus run requires a tenant operational admin.'
      using errcode = '42501';
  end if;

  select bra.* into v_service
  from public.bus_route_assignments bra
  join public.buses b
    on b.id = bra.bus_id and b.tenant_id = bra.tenant_id and b.status = 'active'
  join public.routes r
    on r.id = bra.route_id and r.tenant_id = bra.tenant_id
    and r.status = 'active' and r.definition_status = 'ready'
  join public.route_trip_patterns rtp
    on rtp.id = bra.route_trip_pattern_id and rtp.route_id = bra.route_id
    and rtp.tenant_id = bra.tenant_id and rtp.status = 'active'
    and not rtp.schedule_review_required
  where bra.id = p_bus_route_assignment_id
    and bra.tenant_id = v_tenant_id
    and bra.status = 'active'
    and (bra.effective_from is null or bra.effective_from <= current_date)
    and (bra.effective_to is null or bra.effective_to >= current_date)
  for update of bra;

  if not found then
    raise exception 'This bus run is not ready today.' using errcode = '55006';
  end if;

  perform 1 from public.buses b where b.id = v_service.bus_id for update;
  if exists (
    select 1 from public.driver_trips dt
    where dt.bus_id = v_service.bus_id and dt.tenant_id = v_tenant_id and dt.status = 'active'
  ) then
    raise exception 'End the active trip before preparing another run.' using errcode = '55006';
  end if;

  update public.bus_run_dispatches
  set status = 'cancelled', cancelled_at = now()
  where tenant_id = v_tenant_id and bus_id = v_service.bus_id and status = 'ready';

  insert into public.bus_run_dispatches(
    tenant_id, bus_id, bus_route_assignment_id, route_id,
    route_trip_pattern_id, service_date, prepared_by
  ) values (
    v_service.tenant_id, v_service.bus_id, v_service.id, v_service.route_id,
    v_service.route_trip_pattern_id, current_date, auth.uid()
  ) returning * into v_dispatch;

  return v_dispatch;
end;
$$;

create or replace function public.get_admin_bus_ready_dispatch(p_bus_id uuid)
returns table (
  dispatch_id uuid,
  bus_id uuid,
  bus_route_assignment_id uuid,
  service_date date,
  status text,
  route_name text,
  route_code text,
  trip_name text,
  prepared_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select d.id, d.bus_id, d.bus_route_assignment_id, d.service_date, d.status,
    r.route_name, r.route_code, rtp.display_name, d.prepared_at
  from public.bus_run_dispatches d
  join public.routes r on r.id = d.route_id and r.tenant_id = d.tenant_id
  join public.route_trip_patterns rtp
    on rtp.id = d.route_trip_pattern_id and rtp.tenant_id = d.tenant_id
  where auth.uid() is not null
    and public.is_transportation_write_admin()
    and d.tenant_id = public.current_tenant_id()
    and d.bus_id = p_bus_id
    and d.status = 'ready'
  order by d.prepared_at desc
  limit 1
$$;

create or replace function public.start_bus_tracking_from_qr(p_qr_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant_id uuid := public.current_tenant_id();
  v_driver_id uuid := public.current_driver_id();
  v_hash text;
  v_credential public.bus_qr_credentials;
  v_bus public.buses;
  v_dispatch public.bus_run_dispatches;
  v_pattern public.route_trip_patterns;
  v_trip public.driver_trips;
  v_existing_trip public.driver_trips;
  v_session_token text;
  v_session_hash text;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver' then
    raise exception 'Only an active driver can scan a bus.' using errcode = '42501';
  end if;
  if v_tenant_id is null or v_driver_id is null then
    raise exception 'An active driver identity is required.' using errcode = '42501';
  end if;
  if p_qr_token is null or p_qr_token !~ '^sbus_bus_v1_[A-Za-z0-9_-]{40,80}$' then
    raise exception 'Bus QR could not be verified.' using errcode = '22023';
  end if;

  perform 1 from public.drivers d
  where d.id = v_driver_id and d.tenant_id = v_tenant_id and d.status = 'active'
  for update;
  if not found then
    raise exception 'An active driver identity is required.' using errcode = '42501';
  end if;

  v_hash := public.hash_bus_tracking_token(p_qr_token);
  select c.* into v_credential
  from public.bus_qr_credentials c
  where c.token_hash = v_hash and c.status = 'active'
  for update;
  if not found or v_credential.tenant_id <> v_tenant_id then
    raise exception 'Bus QR could not be verified.' using errcode = 'P0002';
  end if;

  select b.* into v_bus from public.buses b
  where b.id = v_credential.bus_id and b.tenant_id = v_tenant_id and b.status = 'active'
  for update;
  if not found then
    raise exception 'This bus is not active.' using errcode = '55006';
  end if;

  select dt.* into v_existing_trip
  from public.driver_trips dt
  where dt.driver_id = v_driver_id and dt.tenant_id = v_tenant_id and dt.status = 'active'
  for update;

  if found then
    if v_existing_trip.bus_id <> v_bus.id then
      raise exception 'End your active trip before scanning another bus.' using errcode = '55006';
    end if;
    v_trip := v_existing_trip;
  else
    select d.* into v_dispatch
    from public.bus_run_dispatches d
    where d.bus_id = v_bus.id
      and d.tenant_id = v_tenant_id
      and d.service_date = current_date
      and d.status = 'ready'
    for update;
    if not found then
      raise exception 'This bus has no run ready to start.' using errcode = 'P0002';
    end if;

    if exists (
      select 1 from public.driver_trips dt
      where dt.bus_id = v_bus.id and dt.tenant_id = v_tenant_id and dt.status = 'active'
    ) then
      raise exception 'This bus already has an active trip.' using errcode = '55006';
    end if;

    select rtp.* into v_pattern
    from public.bus_route_assignments bra
    join public.routes r
      on r.id = bra.route_id and r.tenant_id = bra.tenant_id
      and r.status = 'active' and r.definition_status = 'ready'
    join public.route_trip_patterns rtp
      on rtp.id = bra.route_trip_pattern_id and rtp.route_id = bra.route_id
      and rtp.tenant_id = bra.tenant_id and rtp.status = 'active'
      and not rtp.schedule_review_required
    where bra.id = v_dispatch.bus_route_assignment_id
      and bra.bus_id = v_bus.id
      and bra.route_id = v_dispatch.route_id
      and bra.route_trip_pattern_id = v_dispatch.route_trip_pattern_id
      and bra.tenant_id = v_tenant_id
      and bra.status = 'active'
      and (bra.effective_from is null or bra.effective_from <= current_date)
      and (bra.effective_to is null or bra.effective_to >= current_date);
    if not found then
      raise exception 'The prepared bus run is no longer available.' using errcode = '55006';
    end if;

    begin
      insert into public.driver_trips(
        tenant_id, driver_id, bus_id, route_id, route_trip_pattern_id,
        driver_route_assignment_id, route_shape_id, bus_number_snapshot,
        trip_name_snapshot, trip_type, status, service_date, started_at
      ) values (
        v_tenant_id, v_driver_id, v_bus.id, v_dispatch.route_id,
        v_dispatch.route_trip_pattern_id, null,
        public.current_route_shape_id_for_route(v_dispatch.route_id, v_tenant_id),
        v_bus.bus_number, v_pattern.display_name,
        case when v_pattern.direction = 'reverse' then 'evening' else 'morning' end,
        'active', current_date, now()
      ) returning * into v_trip;
    exception when unique_violation then
      raise exception 'This driver or bus already has an active trip.' using errcode = '55006';
    end;

    update public.bus_run_dispatches
    set status = 'active', claimed_by_driver_id = v_driver_id,
      driver_trip_id = v_trip.id, claimed_at = now()
    where id = v_dispatch.id;
  end if;

  update public.bus_tracking_sessions
  set status = 'revoked', ended_at = now()
  where status = 'active'
    and (driver_trip_id = v_trip.id or driver_id = v_driver_id or bus_id = v_bus.id);

  loop
    v_session_token := public.create_bus_tracking_session_token();
    v_session_hash := public.hash_bus_tracking_token(v_session_token);
    exit when not exists (
      select 1 from public.bus_tracking_sessions where session_token_hash = v_session_hash
    );
  end loop;

  insert into public.bus_tracking_sessions(
    tenant_id, driver_trip_id, driver_id, bus_id, bus_qr_credential_id,
    session_token_hash
  ) values (
    v_tenant_id, v_trip.id, v_driver_id, v_bus.id, v_credential.id,
    v_session_hash
  );

  return jsonb_build_object(
    'trip', to_jsonb(v_trip),
    'trackingToken', v_session_token,
    'busNumber', v_bus.bus_number,
    'resumed', v_existing_trip.id is not null
  );
end;
$$;

create or replace function public.update_bus_tracking_location(
  p_tracking_token text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision default null,
  p_heading_deg double precision default null,
  p_speed_mps double precision default null
)
returns public.driver_trip_current_locations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hash text;
  v_session public.bus_tracking_sessions;
  v_trip public.driver_trips;
  v_current public.driver_trip_current_locations;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver' then
    raise exception 'Only an active driver can update bus location.' using errcode = '42501';
  end if;
  if p_tracking_token is null or p_tracking_token !~ '^sbus_track_v1_[A-Za-z0-9_-]{40,80}$' then
    raise exception 'Tracking session is not valid.' using errcode = '42501';
  end if;
  if p_latitude is null or p_longitude is null
    or p_latitude <> p_latitude or p_longitude <> p_longitude
    or p_latitude < -90 or p_latitude > 90
    or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Invalid coordinates.' using errcode = '22023';
  end if;
  if p_accuracy_m is not null and (p_accuracy_m <> p_accuracy_m or p_accuracy_m < 0) then
    raise exception 'Invalid location accuracy.' using errcode = '22023';
  end if;
  if p_heading_deg is not null
    and (p_heading_deg <> p_heading_deg or p_heading_deg < 0 or p_heading_deg > 360) then
    raise exception 'Invalid heading.' using errcode = '22023';
  end if;
  if p_speed_mps is not null and (p_speed_mps <> p_speed_mps or p_speed_mps < 0) then
    raise exception 'Invalid speed.' using errcode = '22023';
  end if;

  v_hash := public.hash_bus_tracking_token(p_tracking_token);
  select s.* into v_session
  from public.bus_tracking_sessions s
  where s.session_token_hash = v_hash and s.status = 'active'
  for update;
  if not found
    or v_session.tenant_id is distinct from public.current_tenant_id()
    or v_session.driver_id is distinct from public.current_driver_id()
    or v_session.expires_at <= now() then
    raise exception 'Tracking session is not valid.' using errcode = '42501';
  end if;

  select dt.* into v_trip
  from public.driver_trips dt
  where dt.id = v_session.driver_trip_id
    and dt.tenant_id = v_session.tenant_id
    and dt.driver_id = v_session.driver_id
    and dt.bus_id = v_session.bus_id
    and dt.status = 'active'
  for update;
  if not found then
    raise exception 'Tracking session is no longer active.' using errcode = '55006';
  end if;

  insert into public.driver_trip_location_updates(
    tenant_id, driver_trip_id, driver_id, bus_id, route_id,
    latitude, longitude, accuracy_m, heading_deg, speed_mps, source, recorded_at
  ) values (
    v_trip.tenant_id, v_trip.id, v_trip.driver_id, v_trip.bus_id, v_trip.route_id,
    p_latitude, p_longitude, p_accuracy_m, p_heading_deg, p_speed_mps, 'bus_qr', now()
  );

  insert into public.driver_trip_current_locations(
    driver_trip_id, tenant_id, driver_id, bus_id, route_id,
    latitude, longitude, accuracy_m, heading_deg, speed_mps,
    source, recorded_at, updated_at
  ) values (
    v_trip.id, v_trip.tenant_id, v_trip.driver_id, v_trip.bus_id, v_trip.route_id,
    p_latitude, p_longitude, p_accuracy_m, p_heading_deg, p_speed_mps,
    'bus_qr', now(), now()
  )
  on conflict (driver_trip_id) do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m,
    heading_deg = excluded.heading_deg,
    speed_mps = excluded.speed_mps,
    source = excluded.source,
    recorded_at = excluded.recorded_at,
    updated_at = now()
  returning * into v_current;

  update public.bus_tracking_sessions
  set last_seen_at = v_current.recorded_at
  where id = v_session.id;

  return v_current;
end;
$$;

create or replace function public.end_driver_trip(p_trip_id uuid)
returns public.driver_trips
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.driver_trips;
begin
  if public.current_user_role() <> 'driver' then
    raise exception 'Only a driver can end a trip.' using errcode = '42501';
  end if;
  select * into v_row from public.driver_trips where id = p_trip_id for update;
  if not found
    or v_row.tenant_id is distinct from public.current_tenant_id()
    or v_row.driver_id is distinct from public.current_driver_id() then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;
  if v_row.status <> 'active' then
    raise exception 'This trip is not active.' using errcode = '55006';
  end if;

  update public.driver_trips
  set status = 'completed', ended_at = now()
  where id = p_trip_id
  returning * into v_row;

  update public.bus_tracking_sessions
  set status = 'ended', ended_at = now()
  where driver_trip_id = p_trip_id and status = 'active';

  update public.bus_run_dispatches
  set status = 'completed', completed_at = now()
  where driver_trip_id = p_trip_id and status = 'active';

  return v_row;
end;
$$;

revoke all on function public.hash_bus_tracking_token(text) from public, anon, authenticated;
revoke all on function public.create_bus_qr_token() from public, anon, authenticated;
revoke all on function public.create_bus_tracking_session_token() from public, anon, authenticated;
revoke all on function public.protect_assigned_bus_number() from public, anon, authenticated;

revoke all on function public.manage_bus_qr_credential(uuid, text) from public, anon;
revoke all on function public.get_admin_bus_qr_credential_status(uuid) from public, anon;
revoke all on function public.prepare_bus_run(uuid) from public, anon;
revoke all on function public.get_admin_bus_ready_dispatch(uuid) from public, anon;
revoke all on function public.start_bus_tracking_from_qr(text) from public, anon;
revoke all on function public.update_bus_tracking_location(
  text, double precision, double precision, double precision,
  double precision, double precision
) from public, anon;

grant execute on function public.manage_bus_qr_credential(uuid, text) to authenticated;
grant execute on function public.get_admin_bus_qr_credential_status(uuid) to authenticated;
grant execute on function public.prepare_bus_run(uuid) to authenticated;
grant execute on function public.get_admin_bus_ready_dispatch(uuid) to authenticated;
grant execute on function public.start_bus_tracking_from_qr(text) to authenticated;
grant execute on function public.update_bus_tracking_location(
  text, double precision, double precision, double precision,
  double precision, double precision
) to authenticated;

comment on table public.bus_qr_credentials is
  'Hashed, revocable QR credentials used to identify an operational bus after an active driver scans it.';
comment on table public.bus_run_dispatches is
  'Administrator-prepared bus runs that any authenticated active tenant driver may claim by scanning the bus QR.';
comment on table public.bus_tracking_sessions is
  'Short-lived server binding between one authenticated driver phone, active trip, and bus.';
comment on function public.start_bus_tracking_from_qr(text) is
  'Driver scan-to-start entrypoint. Resolves the bus from a hashed QR token, claims its one ready run, and returns a short-lived GPS session token.';
comment on function public.update_bus_tracking_location(
  text, double precision, double precision, double precision,
  double precision, double precision
) is
  'Session-bound bus GPS update. Derives driver, trip, bus, and route server-side and never accepts their identifiers from the phone.';
