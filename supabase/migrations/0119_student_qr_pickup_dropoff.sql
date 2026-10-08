-- Student QR pickup/drop-off milestone. Forward-only; preserves surviving credentials.
-- DO NOT apply to the sole production database outside protected adoption/release.
-- An isolated migration validation target is not currently approved.
-- Public RPCs authorize signed-in operational callers. Credential storage and
-- token helpers are private; raw random tokens are returned only at issuance.
-- Trusted search_path supports both the reconciled private-helper schema and
-- the surviving hosted schema; it excludes untrusted schemas before these.

create schema if not exists safebus_private;
revoke all on schema safebus_private from public, anon;
grant usage on schema safebus_private to authenticated;

create table if not exists public.student_qr_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  token_hash text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  replaced_by uuid references public.student_qr_credentials(id) on delete set null,
  constraint student_qr_credentials_status_check check (status in ('active', 'revoked')),
  constraint student_qr_credentials_revoked_check check (
    (status = 'active' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);
alter table public.student_qr_credentials enable row level security;
revoke all on public.student_qr_credentials from public, anon, authenticated, service_role;
-- No direct policies: only the narrowly authorized credential RPCs may access storage.
create unique index if not exists student_qr_credentials_token_hash_unique
  on public.student_qr_credentials(token_hash);
create unique index if not exists student_qr_credentials_one_active_per_student
  on public.student_qr_credentials(student_id) where status = 'active';
create index if not exists student_qr_credentials_tenant_student_idx
  on public.student_qr_credentials(tenant_id, student_id, status);

create or replace function safebus_private.student_qr_hash(p_token text)
returns text language sql immutable
set search_path = pg_catalog, extensions, public, pg_temp
as $$ select encode(digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex') $$;

create or replace function public.manage_student_qr_credential(p_student_id uuid, p_action text)
returns table(student_id uuid, credential_id uuid, status text, raw_token text, created_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, safebus_private, public, auth, extensions, pg_temp
as $$
declare
  v_student public.students%rowtype;
  v_old public.student_qr_credentials%rowtype;
  v_new public.student_qr_credentials%rowtype;
  v_token text;
begin
  if auth.uid() is null or current_user_role()::text not in ('tenant_admin','transportation_admin','school_admin')
    or current_user_role() is null then
    raise exception 'Student QR management is not authorized.' using errcode = '42501';
  end if;
  if p_student_id is null or p_action is null or p_action not in ('generate','rotate','revoke') then
    raise exception 'Invalid student QR request.' using errcode = '22023';
  end if;
  -- Student first, credential second everywhere. This serializes issuance,
  -- replacement, revocation, student deactivation, and QR event recording.
  select s.* into v_student from public.students s
  where s.id = p_student_id and can_write_student_roster(s.tenant_id, s.school_id)
    and exists(select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
  for update;
  if not found then
    raise exception 'Student QR management is not authorized.' using errcode = '42501';
  end if;
  if p_action <> 'revoke' and v_student.status <> 'active' then
    raise exception 'Reactivate the student before issuing a pass.' using errcode = '23514';
  end if;
  select c.* into v_old from public.student_qr_credentials c
  where c.student_id = v_student.id and c.tenant_id = v_student.tenant_id and c.status = 'active'
  for update;
  if p_action = 'generate' and v_old.id is not null then
    raise exception 'An active pass already exists. Replace it instead.' using errcode = '23505';
  end if;
  if p_action = 'rotate' and v_old.id is null then
    raise exception 'No active pass exists. Generate a pass instead.' using errcode = '23514';
  end if;
  if v_old.id is not null then
    update public.student_qr_credentials c
    set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
    where c.id = v_old.id;
  end if;
  if p_action = 'revoke' then
    return query select v_student.id, v_old.id, 'revoked'::text, null::text, now();
    return;
  end if;
  -- 256 bits of entropy. Preserve the existing token format for valid old passes.
  v_token := 'sbus_qr_v1_' || translate(replace(encode(gen_random_bytes(32), 'base64'), '=', ''), '+/', '-_');
  insert into public.student_qr_credentials(tenant_id, student_id, token_hash, created_by)
  values(v_student.tenant_id, v_student.id, safebus_private.student_qr_hash(v_token), auth.uid())
  returning * into v_new;
  if v_old.id is not null then
    update public.student_qr_credentials c set replaced_by = v_new.id where c.id = v_old.id;
  end if;
  return query select v_student.id, v_new.id, 'active'::text, v_token, v_new.created_at;
end $$;

create or replace function public.get_admin_student_qr_credential_status(p_student_id uuid)
returns table(student_id uuid, has_active_credential boolean, credential_status text, credential_created_at timestamptz)
language plpgsql stable security definer
set search_path = pg_catalog, safebus_private, public, auth, extensions, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.students s join public.profiles p on p.id = auth.uid() and p.status = 'active'
    where s.id = p_student_id and can_write_student_roster(s.tenant_id, s.school_id)
  ) then
    raise exception 'Student QR management is not authorized.' using errcode = '42501';
  end if;
  return query
  select s.id, (c.id is not null), c.status, c.created_at
  from public.students s
  left join lateral (
    select q.id, q.status, q.created_at from public.student_qr_credentials q
    where q.student_id = s.id and q.tenant_id = s.tenant_id and q.status = 'active'
    limit 1
  ) c on true
  where s.id = p_student_id and can_write_student_roster(s.tenant_id, s.school_id);
end $$;

-- Internal shared resolver uses exactly the current manifest authorization.
-- There is no fallback to legacy route-only assignments.
create or replace function safebus_private.student_qr_context(p_qr_token text, p_trip_id uuid)
returns table(active_trip_id uuid, student_id uuid, student_display_name text,
  pickup_stop_name text, dropoff_stop_name text, student_trip_status text)
language plpgsql stable security definer
set search_path = pg_catalog, safebus_private, public, auth, extensions, pg_temp
as $$
begin
  if auth.uid() is null or current_user_role()::text is distinct from 'driver'
    or p_qr_token is null or p_qr_token !~ '^sbus_qr_v1_[A-Za-z0-9_-]{40,80}$' then
    raise exception 'Pass could not be verified for this active trip.' using errcode = '42501';
  end if;
  return query
  select m.active_trip_id, m.student_id, m.student_display_name,
    m.pickup_stop_name, m.dropoff_stop_name, m.student_trip_status
  from public.get_driver_active_trip_student_manifest() m
  join public.student_qr_credentials c
    on c.student_id = m.student_id and c.tenant_id = current_tenant_id()
    and c.token_hash = safebus_private.student_qr_hash(p_qr_token) and c.status = 'active'
  join public.driver_trips dt on dt.id = m.active_trip_id and dt.tenant_id = c.tenant_id and dt.status = 'active'
  join public.drivers d on d.id = dt.driver_id and d.tenant_id = dt.tenant_id
    and d.profile_id = auth.uid() and d.status = 'active'
  join public.profiles p on p.id = d.profile_id and p.status = 'active'
    and p.tenant_id = dt.tenant_id and p.role::text = 'driver'
  join public.route_trip_patterns rtp on rtp.id = dt.route_trip_pattern_id
    and rtp.tenant_id = dt.tenant_id and rtp.route_id = dt.route_id and rtp.status = 'active'
  where p_trip_id is null or m.active_trip_id = p_trip_id;
  if not found then
    raise exception 'Pass could not be verified for this active trip.' using errcode = '42501';
  end if;
end $$;

create or replace function public.resolve_student_qr_for_active_trip(p_qr_token text)
returns table(student_id uuid, student_display_name text, pickup_stop_name text, dropoff_stop_name text,
  student_trip_status text, next_event_type text, message text)
language sql stable security definer
set search_path = pg_catalog, safebus_private, public, auth, extensions, pg_temp
as $$
  select c.student_id, c.student_display_name, c.pickup_stop_name, c.dropoff_stop_name, c.student_trip_status,
    case c.student_trip_status when 'not_picked_up' then 'picked_up' when 'picked_up' then 'dropped_off' end,
    'Select Pickup or Drop-off to record an event.'::text
  from safebus_private.student_qr_context(p_qr_token, null) c;
$$;

create or replace function public.record_student_qr_event_for_active_trip(
  p_qr_token text, p_event_type text, p_driver_trip_id uuid
)
returns table(student_id uuid, student_display_name text, pickup_stop_name text, dropoff_stop_name text,
  student_trip_status text, outcome text)
language plpgsql security definer
set search_path = pg_catalog, safebus_private, public, auth, extensions, pg_temp
as $$
declare
  v_trip public.driver_trips%rowtype;
  v_credential public.student_qr_credentials%rowtype;
  v_context record;
  v_outcome text;
begin
  if auth.uid() is null or current_user_role()::text is distinct from 'driver'
    or p_driver_trip_id is null or p_qr_token is null
    or p_qr_token !~ '^sbus_qr_v1_[A-Za-z0-9_-]{40,80}$'
    or p_event_type is null or p_event_type not in ('picked_up','dropped_off') then
    raise exception 'Pass could not be verified for this active trip.' using errcode = '42501';
  end if;

  -- Same first lock as the existing event recorder: concurrent manual/QR events
  -- serialize on this trip. Bind to the displayed trip, never a new replacement trip.
  select dt.* into v_trip from public.driver_trips dt
  where dt.id = p_driver_trip_id and dt.tenant_id = current_tenant_id()
    and dt.driver_id = current_driver_id() and dt.status = 'active'
  for update;
  if not found then
    raise exception 'Pass could not be verified for this active trip.' using errcode = '42501';
  end if;
  select c.* into v_credential from public.student_qr_credentials c
  where c.token_hash = safebus_private.student_qr_hash(p_qr_token)
    and c.tenant_id = v_trip.tenant_id and c.status = 'active';
  if not found then
    raise exception 'Pass could not be verified for this active trip.' using errcode = '42501';
  end if;
  perform 1 from public.students s
  where s.id = v_credential.student_id and s.tenant_id = v_trip.tenant_id and s.status = 'active'
  for update;
  if not found then
    raise exception 'Pass could not be verified for this active trip.' using errcode = '42501';
  end if;
  -- Recheck after acquiring the student's lock, in case a replacement/revocation won.
  perform 1 from public.student_qr_credentials c where c.id = v_credential.id and c.status = 'active' for update;
  if not found then
    raise exception 'Pass could not be verified for this active trip.' using errcode = '42501';
  end if;
  select * into v_context from safebus_private.student_qr_context(p_qr_token, v_trip.id);

  if v_context.student_trip_status = 'dropped_off' then
    v_outcome := case when p_event_type = 'dropped_off' then 'already_recorded' else 'complete' end;
  elsif p_event_type = 'picked_up' and v_context.student_trip_status = 'picked_up' then
    v_outcome := 'already_recorded';
  elsif p_event_type = 'dropped_off' and v_context.student_trip_status = 'not_picked_up' then
    v_outcome := 'pickup_required';
  else
    -- Reuse the existing recorder, including planned-stop validation, event
    -- timestamps and the established guardian notification/outbox triggers.
    perform record_student_trip_event_for_active_trip(v_context.student_id, p_event_type);
    v_outcome := 'recorded';
    v_context.student_trip_status := case p_event_type when 'picked_up' then 'picked_up' else 'dropped_off' end;
  end if;
  return query select v_context.student_id, v_context.student_display_name,
    v_context.pickup_stop_name, v_context.dropoff_stop_name, v_context.student_trip_status, v_outcome;
end $$;

-- These three legacy RPCs are formally promoted to authenticated app use.
revoke all on function public.manage_student_qr_credential(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_student_qr_credential_status(uuid) from public, anon, authenticated, service_role;
revoke all on function public.resolve_student_qr_for_active_trip(text) from public, anon, authenticated, service_role;
revoke all on function public.record_student_qr_event_for_active_trip(text, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.manage_student_qr_credential(uuid, text) to authenticated;
grant execute on function public.get_admin_student_qr_credential_status(uuid) to authenticated;
grant execute on function public.resolve_student_qr_for_active_trip(text) to authenticated;
grant execute on function public.record_student_qr_event_for_active_trip(text, text, uuid) to authenticated;
revoke all on function safebus_private.student_qr_hash(text) from public, anon, authenticated, service_role;
revoke all on function safebus_private.student_qr_context(text, uuid) from public, anon, authenticated, service_role;

-- Surviving legacy token helpers must not be exposed by the Data API.
-- No credential rows or hashes are rewritten.
do $$
declare v_function regprocedure;
begin
  for v_function in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('hash_student_qr_token','create_student_qr_token')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_function);
    execute format('alter function %s set schema safebus_private', v_function);
  end loop;
end $$;

comment on table public.student_qr_credentials is 'Opaque student pass hashes. Raw tokens are issued once, never stored. No direct browser access.';
comment on function public.record_student_qr_event_for_active_trip(text, text, uuid) is
  'Driver-only atomic QR event recorder, bound to the displayed active trip. Explicit event type; idempotent retries; current manifest authorization and existing notifications.';
