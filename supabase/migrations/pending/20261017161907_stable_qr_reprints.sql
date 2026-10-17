-- Prepared, unapplied. Preserve existing credentials; release only after protected
-- reconciliation, recovery evidence and a bounded rollback-only rehearsal.
create extension if not exists supabase_vault with schema vault;
create extension if not exists pgcrypto with schema extensions;

do $$ begin
  if has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT')
    or has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT') then
    raise exception 'Reconcile Vault read privileges before enabling QR reprints.';
  end if;
  if not exists(select 1 from vault.decrypted_secrets where name = 'safebus_qr_print_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
      'safebus_qr_print_key', 'Encryption key for private SafeBus QR reprints');
  end if;
end $$;

create table safebus_private.student_qr_prints (
  credential_id uuid primary key references public.student_qr_credentials(id) on delete cascade,
  token_cipher bytea not null
);
create table safebus_private.bus_qr_prints (
  credential_id uuid primary key references public.bus_qr_credentials(id) on delete cascade,
  token_cipher bytea not null
);
alter table safebus_private.student_qr_prints enable row level security;
alter table safebus_private.bus_qr_prints enable row level security;
revoke all on safebus_private.student_qr_prints, safebus_private.bus_qr_prints from public, anon, authenticated, service_role;

create function safebus_private.store_qr_print(p_kind text, p_credential_id uuid, p_token text)
returns void language plpgsql security definer
set search_path = pg_catalog, safebus_private, public, extensions, vault, pg_temp as $$
declare v_key text; v_cipher bytea;
begin
  select decrypted_secret into strict v_key from vault.decrypted_secrets where name = 'safebus_qr_print_key';
  v_cipher := extensions.pgp_sym_encrypt(p_token, v_key, 'cipher-algo=aes256,compress-algo=0');
  if p_kind = 'student' then
    insert into safebus_private.student_qr_prints values(p_credential_id, v_cipher) on conflict do nothing;
  elsif p_kind = 'bus' then
    insert into safebus_private.bus_qr_prints values(p_credential_id, v_cipher) on conflict do nothing;
  else raise exception 'Invalid QR kind.' using errcode = '22023'; end if;
end $$;
revoke all on function safebus_private.store_qr_print(text,uuid,text) from public, anon, authenticated, service_role;

-- Retain all existing issuer authorization, locking, revocation and scanner rules.
-- Old clients also retain encrypted reprints when they call these same signatures.
alter function public.manage_student_qr_credential(uuid,text) set schema safebus_private;
alter function safebus_private.manage_student_qr_credential(uuid,text) rename to manage_student_qr_before_prints;
revoke all on function safebus_private.manage_student_qr_before_prints(uuid,text) from public, anon, authenticated, service_role;
alter function public.manage_bus_qr_credential(uuid,text) set schema safebus_private;
alter function safebus_private.manage_bus_qr_credential(uuid,text) rename to manage_bus_qr_before_prints;
revoke all on function safebus_private.manage_bus_qr_before_prints(uuid,text) from public, anon, authenticated, service_role;

create function public.manage_student_qr_credential(p_student_id uuid, p_action text)
returns table(student_id uuid,credential_id uuid,status text,raw_token text,created_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, safebus_private, public, auth, pg_temp as $$
declare r record;
begin
  for r in select * from safebus_private.manage_student_qr_before_prints(p_student_id,p_action) loop
    if r.raw_token is not null then perform safebus_private.store_qr_print('student',r.credential_id,r.raw_token); end if;
    return query select r.student_id,r.credential_id,r.status,r.raw_token,r.created_at;
  end loop;
end $$;

create function public.manage_bus_qr_credential(p_bus_id uuid, p_action text)
returns table(bus_id uuid,credential_id uuid,status text,raw_token text,created_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, safebus_private, public, auth, pg_temp as $$
declare r record;
begin
  if p_action is null or p_action not in ('generate','rotate','revoke') then
    raise exception 'Invalid bus QR credential request.' using errcode = '22023';
  end if;
  for r in select * from safebus_private.manage_bus_qr_before_prints(p_bus_id,p_action) loop
    if r.raw_token is not null then perform safebus_private.store_qr_print('bus',r.credential_id,r.raw_token); end if;
    return query select r.bus_id,r.credential_id,r.status,r.raw_token,r.created_at;
  end loop;
end $$;
revoke all on function public.manage_student_qr_credential(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.manage_bus_qr_credential(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.manage_student_qr_credential(uuid,text) to authenticated;
grant execute on function public.manage_bus_qr_credential(uuid,text) to authenticated;

create function safebus_private.remove_revoked_qr_print()
returns trigger language plpgsql security definer
set search_path = pg_catalog, safebus_private, public, pg_temp as $$
begin
  if new.status = 'revoked' then
    if tg_table_name = 'student_qr_credentials' then
      delete from safebus_private.student_qr_prints where credential_id = new.id;
    else delete from safebus_private.bus_qr_prints where credential_id = new.id; end if;
  end if;
  return new;
end $$;
revoke all on function safebus_private.remove_revoked_qr_print() from public, anon, authenticated, service_role;
create trigger remove_revoked_student_qr_print after update of status on public.student_qr_credentials
  for each row execute function safebus_private.remove_revoked_qr_print();
create trigger remove_revoked_bus_qr_print after update of status on public.bus_qr_credentials
  for each row execute function safebus_private.remove_revoked_qr_print();

-- Returns the SAME active credential. Never rotates. Issuing missing credentials
-- is explicit; legacy hash-only credentials require a matching original once.
create function public.admin_get_printable_qr(
  p_kind text, p_entity_id uuid, p_issue_missing boolean default false, p_original_token text default null
)
returns table(credential_id uuid, raw_token text, print_status text)
language plpgsql security definer
set search_path = pg_catalog, safebus_private, public, auth, extensions, vault, pg_temp as $$
declare v_tenant uuid := safebus_private.current_tenant_id();
  v_id uuid; v_hash text; v_cipher bytea; v_key text; v_token text;
begin
  if auth.uid() is null or v_tenant is null
    or not safebus_private.is_transportation_write_admin() then
    raise exception 'QR printing is not authorized.' using errcode = '42501';
  end if;
  if p_kind = 'student' then
    perform 1 from public.students s where s.id = p_entity_id and s.tenant_id = v_tenant
      and s.status = 'active' and safebus_private.can_write_student_roster(s.tenant_id,s.school_id) for update;
  elsif p_kind = 'bus' then
    perform 1 from public.buses b where b.id = p_entity_id and b.tenant_id = v_tenant and b.status <> 'retired'
      and (safebus_private.current_user_role()::text <> 'school_admin' or b.school_id = safebus_private.current_school_id()) for update;
  else raise exception 'Invalid QR kind.' using errcode = '22023'; end if;
  if not found then raise exception 'QR printing is not authorized.' using errcode = '42501'; end if;
  if p_kind = 'student' then
    select c.id,c.token_hash into v_id,v_hash from public.student_qr_credentials c
      where c.student_id=p_entity_id and c.tenant_id=v_tenant and c.status='active' for update;
    select token_cipher into v_cipher from safebus_private.student_qr_prints where student_qr_prints.credential_id=v_id;
  else
    select c.id,c.token_hash into v_id,v_hash from public.bus_qr_credentials c
      where c.bus_id=p_entity_id and c.tenant_id=v_tenant and c.status='active' for update;
    select token_cipher into v_cipher from safebus_private.bus_qr_prints where bus_qr_prints.credential_id=v_id;
  end if;
  if v_id is null then
    if p_original_token is not null then raise exception 'The original QR could not be verified.' using errcode='23514'; end if;
    if coalesce(p_issue_missing,false) then
      if p_kind='student' then
        select r.credential_id,r.raw_token into v_id,v_token from public.manage_student_qr_credential(p_entity_id,'generate') r;
      else
        select r.credential_id,r.raw_token into v_id,v_token from public.manage_bus_qr_credential(p_entity_id,'generate') r;
      end if;
      return query select v_id,v_token,'ready'::text;
    else return query select null::uuid,null::text,'missing'::text; end if;
    return;
  end if;
  if p_original_token is not null then
    if (p_kind='student' and p_original_token !~ '^sbus_qr_v1_[A-Za-z0-9_-]{40,80}$')
      or (p_kind='bus' and p_original_token !~ '^sbus_bus_v1_[A-Za-z0-9_-]{40,80}$')
      or encode(extensions.digest(convert_to(p_original_token,'UTF8'),'sha256'),'hex') <> v_hash then
      raise exception 'The original QR could not be verified.' using errcode='23514';
    end if;
    perform safebus_private.store_qr_print(p_kind,v_id,p_original_token);
    v_token := p_original_token;
  elsif v_cipher is not null then
    select decrypted_secret into strict v_key from vault.decrypted_secrets where name='safebus_qr_print_key';
    v_token := extensions.pgp_sym_decrypt(v_cipher,v_key);
  end if;
  if v_token is null then return query select v_id,null::text,'needs_original'::text; return; end if;
  -- Fail closed on corruption or a mismatched stored copy.
  if encode(extensions.digest(convert_to(v_token,'UTF8'),'sha256'),'hex') <> v_hash then
    raise exception 'The printable QR could not be verified.' using errcode='23514';
  end if;
  return query select v_id,v_token,'ready'::text;
end $$;
revoke all on function public.admin_get_printable_qr(text,uuid,boolean,text) from public, anon, authenticated, service_role;
grant execute on function public.admin_get_printable_qr(text,uuid,boolean,text) to authenticated;

comment on table public.student_qr_credentials is
  'Opaque pass hashes for scanning. Authorized encrypted reprints are held privately; old hashes remain valid.';
comment on table public.bus_qr_credentials is
  'Opaque bus QR hashes for scanning. Authorized encrypted reprints are held privately; old hashes remain valid.';
