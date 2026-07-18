-- SafeBus Alberta - Phase 16A secure student QR boarding foundation
-- Opaque reusable badge credentials identify active students only after server-side
-- driver active-trip authorization. Raw tokens are returned once and never stored.

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
  constraint student_qr_credentials_revoked_check check ((status = 'active' and revoked_at is null) or (status = 'revoked' and revoked_at is not null))
);

alter table public.student_qr_credentials enable row level security;

create unique index if not exists student_qr_credentials_token_hash_unique on public.student_qr_credentials(token_hash);
create unique index if not exists student_qr_credentials_one_active_per_student on public.student_qr_credentials(student_id) where status = 'active';
create index if not exists student_qr_credentials_tenant_student_idx on public.student_qr_credentials(tenant_id, student_id, status);

revoke all on public.student_qr_credentials from public, anon, authenticated;

drop function if exists public.hash_student_qr_token(text);
create function public.hash_student_qr_token(p_token text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select encode(digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex')
$$;

create or replace function public.create_student_qr_token()
returns text language sql volatile set search_path = public, pg_temp as $$
  select 'sbus_qr_v1_' || translate(replace(encode(gen_random_bytes(32), 'base64'), '=', ''), '+/', '-_')
$$;

create or replace function public.manage_student_qr_credential(p_student_id uuid, p_action text)
returns table(student_id uuid, credential_id uuid, status text, raw_token text, created_at timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role text := public.current_user_role();
  v_token text;
  v_hash text;
  v_new_id uuid;
  v_old_ids uuid[];
begin
  if auth.uid() is null or v_tenant is null or v_role not in ('tenant_admin','school_admin','transportation_admin') then
    raise exception 'QR credential management requires a tenant operational admin.' using errcode = '42501';
  end if;
  if p_action not in ('generate','rotate','revoke') or p_student_id is null then
    raise exception 'Invalid QR credential request.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.students s where s.id = p_student_id and s.tenant_id = v_tenant and s.status = 'active') then
    raise exception 'Student is not eligible for QR credentials.' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(id), '{}') into v_old_ids from public.student_qr_credentials
  where tenant_id = v_tenant and student_id = p_student_id and status = 'active';

  if p_action = 'revoke' then
    update public.student_qr_credentials set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
    where tenant_id = v_tenant and student_id = p_student_id and status = 'active';
    return query select p_student_id, null::uuid, 'revoked'::text, null::text, now();
    return;
  end if;

  if p_action = 'generate' and coalesce(array_length(v_old_ids, 1), 0) > 0 then
    raise exception 'Student already has an active QR credential.' using errcode = '23505';
  end if;

  loop
    v_token := public.create_student_qr_token();
    v_hash := public.hash_student_qr_token(v_token);
    exit when not exists (select 1 from public.student_qr_credentials where token_hash = v_hash);
  end loop;

  update public.student_qr_credentials set status = 'revoked', revoked_at = now(), revoked_by = auth.uid()
  where tenant_id = v_tenant and student_id = p_student_id and status = 'active';

  insert into public.student_qr_credentials(tenant_id, student_id, token_hash, status, created_by)
  values (v_tenant, p_student_id, v_hash, 'active', auth.uid()) returning id into v_new_id;

  update public.student_qr_credentials set replaced_by = v_new_id where id = any(v_old_ids);

  return query select p_student_id, v_new_id, 'active'::text, v_token, now();
end $$;

create or replace function public.get_admin_student_qr_credential_status(p_student_id uuid)
returns table(student_id uuid, has_active_credential boolean, credential_status text, credential_created_at timestamptz)
language sql security definer set search_path = public, pg_temp as $$
  select s.id, (c.id is not null), c.status, c.created_at
  from public.students s
  left join lateral (
    select id, status, created_at from public.student_qr_credentials c
    where c.student_id = s.id and c.tenant_id = s.tenant_id and c.status = 'active'
    order by c.created_at desc limit 1
  ) c on true
  where auth.uid() is not null
    and public.current_user_role() in ('tenant_admin','school_admin','transportation_admin')
    and s.tenant_id = public.current_tenant_id()
    and s.id = p_student_id
$$;

create or replace function public.resolve_student_qr_for_active_trip(p_qr_token text)
returns table(student_id uuid, student_display_name text, pickup_stop_name text, dropoff_stop_name text, student_trip_status text, next_event_type text, message text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_trip public.driver_trips;
  v_hash text;
  v_student public.students;
  v_pick timestamptz;
  v_drop timestamptz;
  v_pick_stop text;
  v_drop_stop text;
begin
  if auth.uid() is null or public.current_user_role() <> 'driver' then raise exception 'Invalid badge.' using errcode = '42501'; end if;
  if p_qr_token is null or p_qr_token !~ '^sbus_qr_v1_[A-Za-z0-9_-]{40,80}$' then raise exception 'Invalid badge.' using errcode = '22023'; end if;

  select * into v_trip from public.driver_trips dt
  where dt.tenant_id = public.current_tenant_id() and dt.driver_id = public.current_driver_id() and dt.status = 'active'
  order by dt.started_at desc limit 1;
  if not found then raise exception 'Active trip required.' using errcode = 'P0002'; end if;

  v_hash := public.hash_student_qr_token(p_qr_token);
  select s.* into v_student
  from public.student_qr_credentials c join public.students s on s.id = c.student_id and s.tenant_id = c.tenant_id and s.status = 'active'
  where c.token_hash = v_hash and c.status = 'active' and c.tenant_id = v_trip.tenant_id;
  if not found then raise exception 'Invalid badge.' using errcode = 'P0002'; end if;

  select ps.stop_name, ds.stop_name into v_pick_stop, v_drop_stop
  from public.student_bus_assignments sba
  join public.bus_route_assignments bra on bra.id = sba.bus_route_assignment_id and bra.status = 'active'
  left join public.route_stops ps on ps.id = sba.pickup_stop_id and ps.status = 'active'
  left join public.route_stops ds on ds.id = sba.dropoff_stop_id and ds.status = 'active'
  where sba.student_id = v_student.id and sba.tenant_id = v_trip.tenant_id and sba.status = 'active'
    and bra.bus_id = v_trip.bus_id and bra.route_id = v_trip.route_id
    and sba.effective_from <= v_trip.service_date and (sba.effective_to is null or sba.effective_to >= v_trip.service_date)
  order by sba.effective_from desc limit 1;
  if not found then
    select ps.stop_name, ds.stop_name into v_pick_stop, v_drop_stop
    from public.student_route_assignments sra
    left join public.route_stops ps on ps.id = sra.pickup_stop_id and ps.status = 'active'
    left join public.route_stops ds on ds.id = sra.dropoff_stop_id and ds.status = 'active'
    where sra.student_id = v_student.id and sra.tenant_id = v_trip.tenant_id and sra.route_id = v_trip.route_id and sra.status = 'active'
      and sra.effective_from <= v_trip.service_date and (sra.effective_to is null or sra.effective_to >= v_trip.service_date)
    order by sra.effective_from desc limit 1;
    if not found then raise exception 'Invalid badge.' using errcode = 'P0002'; end if;
  end if;

  select max(event_time) filter (where event_type = 'picked_up'), max(event_time) filter (where event_type = 'dropped_off')
  into v_pick, v_drop from public.student_trip_events where driver_trip_id = v_trip.id and student_id = v_student.id and tenant_id = v_trip.tenant_id;

  return query select v_student.id, concat_ws(' ', v_student.first_name, v_student.last_name), v_pick_stop, v_drop_stop,
    case when v_drop is not null then 'dropped_off' when v_pick is not null then 'picked_up' else 'not_picked_up' end,
    case when v_drop is not null then null when v_pick is not null then 'dropped_off' else 'picked_up' end,
    case when v_drop is not null then 'Student trip events are complete.' when v_pick is not null then 'Ready to confirm drop-off.' else 'Ready to confirm pickup.' end;
end $$;

revoke all on function public.hash_student_qr_token(text) from public, anon, authenticated;
revoke all on function public.create_student_qr_token() from public, anon, authenticated;
revoke all on function public.manage_student_qr_credential(uuid, text) from public, anon;
revoke all on function public.get_admin_student_qr_credential_status(uuid) from public, anon;
revoke all on function public.resolve_student_qr_for_active_trip(text) from public, anon;
grant execute on function public.manage_student_qr_credential(uuid, text) to authenticated;
grant execute on function public.get_admin_student_qr_credential_status(uuid) to authenticated;
grant execute on function public.resolve_student_qr_for_active_trip(text) to authenticated;

comment on table public.student_qr_credentials is 'Hashed opaque student QR credentials. Raw tokens are returned once by management RPC and are never stored.';
comment on function public.resolve_student_qr_for_active_trip(text) is 'Driver-only QR resolver that requires an authenticated active trip and same-tenant active route assignment before returning manifest-level student context.';
