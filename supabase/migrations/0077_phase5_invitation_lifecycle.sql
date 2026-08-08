-- SafeBus Alberta - Phase 5 invitation lifecycle and delivery queue

alter table public.tenant_onboarding_invitations
  add column if not exists expires_at timestamptz default (now() + interval '7 days'),
  add column if not exists revoked_at timestamptz,
  add column if not exists delivery_status text default 'pending',
  add column if not exists delivered_at timestamptz,
  add column if not exists bulk_batch_id uuid references public.bulk_import_batches(id) on delete set null,
  add column if not exists source_row_number integer,
  add column if not exists delivery_attempts integer not null default 0,
  add column if not exists last_delivery_error text,
  add column if not exists delivery_claimed_at timestamptz;

update public.tenant_onboarding_invitations
set expires_at = coalesce(expires_at, created_at + interval '7 days'),
    delivery_status = case
      when status = 'failed' then 'failed'
      when status = 'activated' then 'delivered'
      when last_sent_at is not null then 'sent'
      else coalesce(delivery_status, 'pending')
    end;

alter table public.tenant_onboarding_invitations
  alter column expires_at set not null,
  alter column delivery_status set default 'pending',
  alter column delivery_status set not null;

alter table public.tenant_onboarding_invitations
  drop constraint if exists tenant_onboarding_role_check,
  drop constraint if exists tenant_onboarding_status_check,
  drop constraint if exists toi_delivery_status_check;
alter table public.tenant_onboarding_invitations
  add constraint tenant_onboarding_role_check check (
    role in ('tenant_admin', 'school_admin', 'transportation_admin', 'driver', 'guardian')
  ),
  add constraint tenant_onboarding_status_check check (
    status in (
      'queued', 'pending', 'resent', 'activated', 'cancelled',
      'failed', 'expired', 'revoked'
    )
  ),
  add constraint toi_delivery_status_check check (
    delivery_status in ('pending', 'processing', 'sent', 'delivered', 'bounced', 'opened', 'failed')
  ),
  add constraint toi_bulk_source_check check (
    (bulk_batch_id is null and source_row_number is null)
    or (bulk_batch_id is not null and source_row_number is not null and source_row_number > 0)
  );

create index if not exists tenant_onboarding_invitations_expires_idx
  on public.tenant_onboarding_invitations (expires_at)
  where status in ('queued', 'pending', 'resent');
create index if not exists tenant_onboarding_invitations_bulk_batch_idx
  on public.tenant_onboarding_invitations (bulk_batch_id, source_row_number)
  where bulk_batch_id is not null;
create unique index if not exists tenant_onboarding_invitations_bulk_source_unique
  on public.tenant_onboarding_invitations (bulk_batch_id, source_row_number)
  where bulk_batch_id is not null;
create unique index if not exists tenant_onboarding_invitations_bulk_active_email_unique
  on public.tenant_onboarding_invitations (tenant_id, lower(email))
  where bulk_batch_id is not null
    and status in ('queued', 'pending', 'resent');

drop policy if exists "tenant onboarding select platform admin" on public.tenant_onboarding_invitations;
drop policy if exists "tenant onboarding select tenant admin" on public.tenant_onboarding_invitations;
create policy "tenant onboarding select tenant admin"
  on public.tenant_onboarding_invitations for select to authenticated
  using (
    public.is_tenant_admin()
    and public.has_verified_mfa()
    and tenant_id = public.current_tenant_id()
  );

-- Scheduled/server-only expiry. Expired profiles are disabled in the same
-- transaction, so a still-live provider link cannot activate them later.
create or replace function public.expire_stale_invitations()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_expired_count integer;
begin
  with expired as (
    update public.tenant_onboarding_invitations
    set status = 'expired', delivery_status = 'failed',
        last_delivery_error = 'Invitation expired before activation.'
    where status in ('queued', 'pending', 'resent') and expires_at < now()
    returning invited_profile_id, bulk_batch_id, source_row_number
  ), disabled as (
    update public.profiles p
    set status = 'disabled'
    where p.id in (select invited_profile_id from expired where invited_profile_id is not null)
      and p.status = 'invited'
    returning p.id
  ), staging_expired as (
    update public.bulk_import_staging s
    set invitation_status = 'failed', invitation_error = 'Invitation expired before activation.'
    from expired e
    where s.batch_id = e.bulk_batch_id and s.row_number = e.source_row_number
    returning s.id
  )
  select count(*) into v_expired_count from expired;
  return jsonb_build_object('expired', v_expired_count);
end;
$$;
revoke all on function public.expire_stale_invitations() from public, anon, authenticated;
grant execute on function public.expire_stale_invitations() to service_role;

-- Enforce expiry at activation time even if the scheduled expiry sweep has
-- not run yet. A provider link alone is never sufficient to activate a stale,
-- revoked, or cancelled SafeBus invitation.
create or replace function public.complete_invited_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_profile public.profiles%rowtype;
  v_password_hash text;
begin
  if auth.uid() is null then
    raise exception 'Sign in through a valid invitation before completing account setup.'
      using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = auth.uid() for update;
  if v_profile.id is null then
    raise exception 'The invited SafeBus profile was not found.' using errcode = 'P0002';
  end if;
  if v_profile.status = 'active' then
    return jsonb_build_object('profileId', v_profile.id, 'role', v_profile.role, 'status', 'active');
  end if;
  if v_profile.status <> 'invited' then
    raise exception 'This SafeBus account is not available for invitation setup.' using errcode = '22023';
  end if;
  if v_profile.role <> 'platform_super_admin' and not exists (
    select 1 from public.tenants t where t.id = v_profile.tenant_id and t.status = 'active'
  ) then
    raise exception 'This SafeBus organization is not active.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.tenant_onboarding_invitations i
    where i.invited_profile_id = auth.uid()
      and i.status in ('pending', 'resent')
      and i.expires_at > now()
  ) then
    raise exception 'This invitation is expired, revoked, cancelled, or no longer valid.'
      using errcode = '22023';
  end if;

  select u.encrypted_password into v_password_hash
  from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;
  if nullif(v_password_hash, '') is null then
    raise exception 'Create a password before completing account setup.' using errcode = '22023';
  end if;

  update public.profiles set status = 'active'
  where id = auth.uid() and status = 'invited';
  update public.tenant_onboarding_invitations
  set status = 'activated', cancelled_at = null,
      delivery_status = case when delivery_status in ('pending', 'processing') then 'sent' else delivery_status end
  where invited_profile_id = auth.uid()
    and status in ('pending', 'resent') and expires_at > now();

  return jsonb_build_object('profileId', v_profile.id, 'role', v_profile.role, 'status', 'active');
end;
$$;
revoke all on function public.complete_invited_account() from public, anon;
grant execute on function public.complete_invited_account() to authenticated;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_inv public.tenant_onboarding_invitations;
begin
  if auth.uid() is null or not public.is_tenant_admin() then
    raise exception 'Only a tenant administrator can revoke tenant invitations.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();

  select * into v_inv from public.tenant_onboarding_invitations
  where id = p_invitation_id for update;
  if v_inv.id is null or v_inv.tenant_id is distinct from public.current_tenant_id() then
    raise exception 'Invitation not found.' using errcode = 'P0002';
  end if;
  if v_inv.status not in ('queued', 'pending', 'resent', 'failed') then
    raise exception 'Only an open invitation can be revoked.' using errcode = '22023';
  end if;

  update public.tenant_onboarding_invitations
  set status = 'revoked', revoked_at = now(), delivery_status = 'failed',
      last_delivery_error = 'Revoked by tenant administrator.'
  where id = p_invitation_id;
  update public.profiles set status = 'disabled'
  where id = v_inv.invited_profile_id and status = 'invited';
  update public.bulk_import_staging
  set invitation_status = 'revoked', invitation_error = 'Invitation revoked.'
  where batch_id = v_inv.bulk_batch_id and row_number = v_inv.source_row_number;

  perform public.phase5_write_audit_event(
    auth.uid(), 'invitation.revoked', 'invitation', p_invitation_id, null,
    jsonb_build_object('tenant_id', v_inv.tenant_id, 'role', v_inv.role::text)
  );
  return jsonb_build_object('invitationId', p_invitation_id, 'status', 'revoked');
end;
$$;
revoke all on function public.revoke_invitation(uuid) from public, anon, authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;

create or replace function public.update_invitation_delivery_status(
  p_invitation_id uuid,
  p_delivery_status text,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_delivery_status is null
     or p_delivery_status not in ('pending', 'processing', 'sent', 'delivered', 'bounced', 'opened', 'failed')
     or (p_status is not null and p_status not in ('queued', 'pending', 'resent', 'activated', 'cancelled', 'failed', 'expired', 'revoked')) then
    raise exception 'Invalid invitation delivery state.' using errcode = '22023';
  end if;
  update public.tenant_onboarding_invitations
  set delivery_status = p_delivery_status,
      delivered_at = case when p_delivery_status in ('delivered', 'opened') then coalesce(delivered_at, now()) else delivered_at end,
      status = coalesce(p_status, status)
  where id = p_invitation_id;
  if not found then raise exception 'Invitation not found.' using errcode = 'P0002'; end if;
  return jsonb_build_object('invitationId', p_invitation_id, 'deliveryStatus', p_delivery_status);
end;
$$;
revoke all on function public.update_invitation_delivery_status(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.update_invitation_delivery_status(uuid, text, text) to service_role;

create or replace function public.get_bulk_invitation_delivery_summary(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_summary jsonb;
begin
  if auth.uid() is null or not public.is_tenant_admin() then
    raise exception 'Only a tenant administrator can view delivery summaries.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  if not exists (
    select 1 from public.bulk_import_batches b
    where b.id = p_batch_id and b.tenant_id = public.current_tenant_id()
  ) then
    raise exception 'Batch not found.' using errcode = 'P0002';
  end if;
  select jsonb_build_object(
    'total', count(*),
    'queued', count(*) filter (where i.status = 'queued'),
    'processing', count(*) filter (where i.delivery_status = 'processing'),
    'sent', count(*) filter (where i.delivery_status in ('sent', 'delivered', 'opened')),
    'failed', count(*) filter (where i.delivery_status in ('failed', 'bounced')),
    'revoked', count(*) filter (where i.status = 'revoked')
  ) into v_summary
  from public.tenant_onboarding_invitations i
  where i.bulk_batch_id = p_batch_id;
  return coalesce(v_summary, jsonb_build_object(
    'total', 0, 'queued', 0, 'processing', 0, 'sent', 0, 'failed', 0, 'revoked', 0
  ));
end;
$$;
revoke all on function public.get_bulk_invitation_delivery_summary(uuid)
  from public, anon, authenticated;
grant execute on function public.get_bulk_invitation_delivery_summary(uuid) to authenticated;

-- Claims a small provider-safe delivery chunk. Stale processing claims are
-- reclaimable after 15 minutes, making server interruption recoverable.
create or replace function public.claim_bulk_invitation_rows(
  p_batch_id uuid,
  p_limit integer default 10
)
returns table (
  invitation_id uuid,
  staging_id uuid,
  source_row_number integer,
  role text,
  email text,
  full_name text,
  row_data jsonb
)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_tenant_admin() then
    raise exception 'Only a tenant administrator can dispatch bulk invitations.' using errcode = '42501';
  end if;
  perform public.enforce_mfa_if_required();
  perform public.enforce_recent_auth_for_sensitive_action();
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception 'Bulk invitation chunks must contain 1 to 25 rows.' using errcode = '22023';
  end if;
  if not public.check_rate_limit('bulk_invitation', auth.uid()::text, 12, 60) then
    raise exception 'Bulk invitation dispatch is temporarily rate limited.' using errcode = '42901';
  end if;
  if not exists (
    select 1 from public.bulk_import_batches b
    where b.id = p_batch_id and b.tenant_id = public.current_tenant_id()
      and b.status = 'committed' and b.record_type in ('guardian', 'driver')
  ) then
    raise exception 'Committed guardian or driver batch not found.' using errcode = 'P0002';
  end if;

  return query
  with claimable as (
    select i.id
    from public.tenant_onboarding_invitations i
    where i.bulk_batch_id = p_batch_id
      and i.tenant_id = public.current_tenant_id()
      and i.status in ('queued', 'failed')
      and (
        i.delivery_status <> 'processing'
        or i.delivery_claimed_at < now() - interval '15 minutes'
      )
      and i.expires_at > now()
    order by i.source_row_number
    limit p_limit
    for update skip locked
  ), claimed as (
    update public.tenant_onboarding_invitations i
    set delivery_status = 'processing', delivery_claimed_at = now(),
        delivery_attempts = delivery_attempts + 1, last_delivery_error = null
    from claimable c
    where i.id = c.id
    returning i.*
  )
  select c.id, s.id, c.source_row_number, c.role::text, c.email, c.full_name, s.row_data
  from claimed c
  join public.bulk_import_staging s
    on s.batch_id = c.bulk_batch_id and s.row_number = c.source_row_number
  order by c.source_row_number;
end;
$$;
revoke all on function public.claim_bulk_invitation_rows(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_bulk_invitation_rows(uuid, integer) to authenticated;

-- Server-only reconciliation after the provider call and existing atomic
-- member-finalization RPC. It collapses the queue placeholder and finalized
-- invitation into one canonical history row.
create or replace function public.reconcile_bulk_invitation_delivery(
  p_queue_invitation_id uuid,
  p_profile_id uuid default null,
  p_error text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_queue public.tenant_onboarding_invitations;
  v_final public.tenant_onboarding_invitations;
begin
  select * into v_queue from public.tenant_onboarding_invitations
  where id = p_queue_invitation_id for update;
  if v_queue.id is null or v_queue.bulk_batch_id is null then
    raise exception 'Bulk invitation queue row not found.' using errcode = 'P0002';
  end if;

  if p_profile_id is null then
    update public.tenant_onboarding_invitations
    set status = 'failed', delivery_status = 'failed',
        last_delivery_error = left(coalesce(nullif(trim(p_error), ''), 'Invitation delivery failed.'), 500),
        delivery_claimed_at = null
    where id = v_queue.id;
    update public.bulk_import_staging
    set invitation_status = 'failed',
        invitation_error = left(coalesce(nullif(trim(p_error), ''), 'Invitation delivery failed.'), 500)
    where batch_id = v_queue.bulk_batch_id and row_number = v_queue.source_row_number;
    return jsonb_build_object('invitationId', v_queue.id, 'status', 'failed');
  end if;

  select * into v_final
  from public.tenant_onboarding_invitations i
  where i.invited_profile_id = p_profile_id and i.id <> v_queue.id
  order by i.created_at desc, i.id desc
  limit 1
  for update;
  if v_final.id is null then
    raise exception 'Finalized member invitation not found.' using errcode = 'P0002';
  end if;
  if v_final.tenant_id is distinct from v_queue.tenant_id
     or lower(v_final.email) <> lower(v_queue.email)
     or v_final.role <> v_queue.role
     or v_final.status not in ('pending', 'resent') then
    raise exception 'Finalized invitation does not match the claimed bulk recipient.'
      using errcode = '22023';
  end if;

  delete from public.tenant_onboarding_invitations where id = v_queue.id;
  update public.tenant_onboarding_invitations
  set bulk_batch_id = v_queue.bulk_batch_id,
      source_row_number = v_queue.source_row_number,
      delivery_status = 'sent',
      delivery_attempts = v_queue.delivery_attempts,
      delivery_claimed_at = null,
      last_delivery_error = null,
      expires_at = greatest(expires_at, now() + interval '7 days')
  where id = v_final.id;
  update public.bulk_import_staging
  set live_record_id = p_profile_id, invitation_status = 'sent', invitation_error = null
  where batch_id = v_queue.bulk_batch_id and row_number = v_queue.source_row_number;
  return jsonb_build_object('invitationId', v_final.id, 'profileId', p_profile_id, 'status', 'sent');
end;
$$;
revoke all on function public.reconcile_bulk_invitation_delivery(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_bulk_invitation_delivery(uuid, uuid, text) to service_role;

-- Narrow platform view: first-admin invitation lifecycle identifiers/status
-- only. It deliberately omits routine tenant invitation recipients and rows.
create or replace function public.get_platform_first_admin_invitation_status()
returns table (
  invitation_id uuid,
  tenant_id uuid,
  invited_profile_id uuid,
  status text,
  last_sent_at timestamptz,
  expires_at timestamptz,
  delivery_status text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with first_admin as (
    select distinct on (p.tenant_id) p.tenant_id, p.id
    from public.profiles p
    where p.role = 'tenant_admin'
    order by p.tenant_id, p.created_at, p.id
  )
  select i.id, i.tenant_id, i.invited_profile_id, i.status,
         i.last_sent_at, i.expires_at, i.delivery_status
  from first_admin f
  join lateral (
    select invitation.*
    from public.tenant_onboarding_invitations invitation
    where invitation.tenant_id = f.tenant_id
      and invitation.invited_profile_id = f.id
      and invitation.role = 'tenant_admin'
    order by invitation.created_at desc, invitation.id desc
    limit 1
  ) i on true
  where public.is_platform_super_admin() and public.has_verified_mfa();
$$;
revoke all on function public.get_platform_first_admin_invitation_status()
  from public, anon, authenticated;
grant execute on function public.get_platform_first_admin_invitation_status() to authenticated;

create or replace function public.platform_is_first_admin_invitation(p_invitation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_platform_super_admin()
    and public.has_verified_mfa()
    and exists (
      select 1
      from public.tenant_onboarding_invitations i
      where i.id = p_invitation_id
        and i.role = 'tenant_admin'
        and i.invited_profile_id = (
          select p.id
          from public.profiles p
          where p.tenant_id = i.tenant_id and p.role = 'tenant_admin'
          order by p.created_at, p.id
          limit 1
        )
    );
$$;
revoke all on function public.platform_is_first_admin_invitation(uuid)
  from public, anon, authenticated;
grant execute on function public.platform_is_first_admin_invitation(uuid) to authenticated;

create or replace function public.platform_cancel_first_admin_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_inv public.tenant_onboarding_invitations;
begin
  if not public.platform_is_first_admin_invitation(p_invitation_id) then
    raise exception 'Platform personnel can cancel only the first tenant administrator invitation.'
      using errcode = '42501';
  end if;
  perform public.enforce_recent_auth_for_sensitive_action();

  select * into v_inv from public.tenant_onboarding_invitations
  where id = p_invitation_id for update;
  if v_inv.status not in ('pending', 'resent', 'failed') then
    raise exception 'Only a pending invitation can be cancelled.' using errcode = '22023';
  end if;

  update public.tenant_onboarding_invitations
  set status = 'cancelled', cancelled_at = now(), delivery_status = 'failed',
      last_delivery_error = 'Cancelled by platform onboarding administrator.'
  where id = p_invitation_id;
  update public.profiles set status = 'disabled'
  where id = v_inv.invited_profile_id and status = 'invited';

  perform public.phase5_write_audit_event(
    auth.uid(), 'invitation.cancelled', 'invitation', p_invitation_id, null,
    jsonb_build_object('tenant_id', v_inv.tenant_id, 'first_tenant_admin', true)
  );
  return jsonb_build_object(
    'invitationId', p_invitation_id,
    'profileId', v_inv.invited_profile_id,
    'status', 'cancelled'
  );
end;
$$;
revoke all on function public.platform_cancel_first_admin_invitation(uuid)
  from public, anon, authenticated;
grant execute on function public.platform_cancel_first_admin_invitation(uuid) to authenticated;
