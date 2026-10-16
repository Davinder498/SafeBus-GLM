-- Forward only. Prepare/reconcile/rehearse through the protected release workflow.
-- No existing identities, subscriptions, tenant statuses, or bus records are changed.
alter table safebus_private.tenant_subscription_projections
  add column billing_interval text not null default 'year' check (billing_interval in ('month', 'year')),
  add column collection_method text not null default 'send_invoice',
  add column has_payment_method boolean not null default false,
  add column paid_through timestamptz,
  add column pending_change jsonb,
  add column pending_payment boolean not null default false;

create table safebus_private.tenant_billing_control (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  trial_used_at timestamptz,
  operation_id uuid,
  operation_until timestamptz,
  reserved_bus_count integer check (reserved_bus_count between 1 and 10000)
);
alter table safebus_private.tenant_billing_control enable row level security;
revoke all on safebus_private.tenant_billing_control from public, anon, authenticated, service_role;
-- Existing contracts never acquire a second trial.
insert into safebus_private.tenant_billing_control(tenant_id, trial_used_at)
select tenant_id, now() from safebus_private.tenant_subscription_projections;

alter table safebus_private.billing_mutation_requests
  add column response jsonb,
  add column request_payload jsonb;
alter table safebus_private.billing_mutation_requests drop constraint billing_mutation_action_check;
alter table safebus_private.billing_mutation_requests add constraint billing_mutation_action_check
  check (action in ('create','update','schedule_cancel','resume','reconcile','checkout','change','cancel','keep','preview','unschedule'));

-- All capacity writes and billing projections lock the same tenant row first.
create function safebus_private.bus_subscription_access(p_tenant_id uuid)
returns jsonb language sql volatile security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
  select jsonb_build_object(
    'eligible', coalesce(t.status = 'active' and s.status in ('active','trialing')
      and case when s.status = 'trialing' then s.trial_end > now() and s.has_payment_method
        else s.current_period_end > now() and (s.collection_method = 'send_invoice' or s.paid_through > now()) end, false),
    'limit', least(s.licensed_bus_count, coalesce(c.reserved_bus_count,
      (s.pending_change->>'quantity')::integer, s.licensed_bus_count)),
    'active', (select count(*) from public.buses b where b.tenant_id = t.id and b.status = 'active')
  ) from public.tenants t
  left join safebus_private.tenant_subscription_projections s on s.tenant_id = t.id
  left join safebus_private.tenant_billing_control c on c.tenant_id = t.id
  where t.id = p_tenant_id;
$$;
revoke all on function safebus_private.bus_subscription_access(uuid) from public, anon, authenticated, service_role;

create function public.get_bus_subscription_access()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp as $$
begin
  if not coalesce(safebus_private.current_user_role() in ('tenant_admin','school_admin','transportation_admin'), false)
     or not safebus_private.has_verified_mfa() or safebus_private.current_tenant_id() is null then
    raise exception 'Tenant bus administrator required.' using errcode = '42501';
  end if;
  return safebus_private.bus_subscription_access(safebus_private.current_tenant_id());
end;
$$;
revoke all on function public.get_bus_subscription_access() from public, anon, authenticated;
grant execute on function public.get_bus_subscription_access() to authenticated;

create function safebus_private.enforce_bus_subscription()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
declare v_access jsonb;
begin
  if TG_OP = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id then
      raise exception 'A bus cannot be transferred between tenants.' using errcode = '42501';
    end if;
    -- Editing/deactivating existing buses remains possible even during delinquency.
    if old.status = 'active' or new.status <> 'active' then return new; end if;
  end if;
  perform 1 from public.tenants where id = new.tenant_id for update;
  v_access := safebus_private.bus_subscription_access(new.tenant_id);
  if not coalesce((v_access->>'eligible')::boolean, false) then
    raise exception 'Start a subscription or trial before configuring buses.' using errcode = 'P0001';
  end if;
  if new.status = 'active' and (v_access->>'active')::integer >= (v_access->>'limit')::integer then
    raise exception 'Your active-bus allowance is full. Increase your subscription or deactivate a bus.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function safebus_private.enforce_bus_subscription() from public, anon, authenticated, service_role;
create trigger enforce_bus_subscription before insert or update on public.buses
for each row execute function safebus_private.enforce_bus_subscription();

create function public.billing_claim_operation(p_tenant_id uuid, p_request_id uuid,
  p_actor_id uuid, p_action text, p_hash text, p_payload jsonb default null)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
declare c safebus_private.tenant_billing_control; r safebus_private.billing_mutation_requests; v_retry boolean;
begin
  perform 1 from public.tenants where id = p_tenant_id and status = 'active' for update;
  if not found then raise exception 'billing_tenant_unavailable'; end if;
  if not exists(select 1 from public.profiles where id = p_actor_id and tenant_id = p_tenant_id and role = 'tenant_admin' and status = 'active') then
    raise exception 'billing_actor_not_authorized';
  end if;
  insert into safebus_private.tenant_billing_control(tenant_id) values (p_tenant_id) on conflict do nothing;
  select * into c from safebus_private.tenant_billing_control where tenant_id = p_tenant_id for update;
  select * into r from safebus_private.billing_mutation_requests where request_id = p_request_id;
  v_retry := found;
  if found then
    if r.tenant_id <> p_tenant_id or r.actor_profile_id <> p_actor_id or r.action <> p_action or r.request_hash <> p_hash then
      raise exception 'billing_request_conflict';
    end if;
    if r.status = 'completed' then return jsonb_build_object('replayed', true, 'response', r.response); end if;
  end if;
  if c.operation_until > clock_timestamp() then raise exception 'billing_operation_busy'; end if;
  -- An uncertain provider outcome must be retried with the original idempotency key.
  if c.operation_id is not null and c.operation_id <> p_request_id then raise exception 'billing_retry_original_request'; end if;
  insert into safebus_private.billing_mutation_requests(request_id, actor_profile_id, tenant_id, action, request_hash, request_payload)
  values(p_request_id, p_actor_id, p_tenant_id, p_action, p_hash, p_payload) on conflict do nothing;
  -- A simultaneous request in a different tenant can collide on the global key.
  -- Recheck after ON CONFLICT's wait before granting an operation lease.
  select * into r from safebus_private.billing_mutation_requests where request_id = p_request_id;
  if r.tenant_id <> p_tenant_id or r.actor_profile_id <> p_actor_id or r.action <> p_action or r.request_hash <> p_hash then
    raise exception 'billing_request_conflict';
  end if;
  update safebus_private.tenant_billing_control set operation_id = p_request_id,
    operation_until = clock_timestamp() + interval '2 minutes' where tenant_id = p_tenant_id;
  return jsonb_build_object('replayed', false, 'retry', v_retry);
end;
$$;

create function public.billing_finish_operation(p_tenant_id uuid, p_request_id uuid, p_response jsonb)
returns void language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
begin
  perform 1 from public.tenants where id = p_tenant_id for update;
  if not exists(select 1 from safebus_private.tenant_billing_control
    where tenant_id = p_tenant_id and operation_id = p_request_id) then raise exception 'billing_operation_lost'; end if;
  update safebus_private.billing_mutation_requests set status = 'completed', response = p_response where request_id = p_request_id;
  update safebus_private.tenant_billing_control set operation_id = null, operation_until = null
    where tenant_id = p_tenant_id;
end;
$$;

create function public.billing_reserve_capacity(p_tenant_id uuid, p_request_id uuid, p_quantity integer)
returns void language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
begin
  perform 1 from public.tenants where id = p_tenant_id for update;
  if not exists(select 1 from safebus_private.tenant_billing_control
    where tenant_id = p_tenant_id and operation_id = p_request_id and operation_until > clock_timestamp()) then
    raise exception 'billing_operation_lost';
  end if;
  if p_quantity < (select count(*) from public.buses where tenant_id = p_tenant_id and status = 'active') then
    raise exception 'billing_quantity_below_usage';
  end if;
  update safebus_private.tenant_billing_control set reserved_bus_count = p_quantity where tenant_id = p_tenant_id;
end;
$$;

create function public.billing_find_customer(p_customer_id text)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
  select jsonb_build_object('tenant_id', a.tenant_id, 'trial_used', c.trial_used_at is not null)
  from safebus_private.tenant_billing_accounts a
  left join safebus_private.tenant_billing_control c using(tenant_id)
  where a.external_customer_id = p_customer_id;
$$;

-- One atomic projection update; no entitlement is inferred from browser redirects or metadata.
create function public.billing_sync_subscription(p_state jsonb, p_operation_id uuid default null)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
declare v_tenant uuid := (p_state->>'tenant_id')::uuid;
  c safebus_private.tenant_billing_control; s safebus_private.tenant_subscription_projections;
begin
  perform 1 from public.tenants where id = v_tenant for update;
  insert into safebus_private.tenant_billing_control(tenant_id) values(v_tenant) on conflict do nothing;
  select * into c from safebus_private.tenant_billing_control where tenant_id = v_tenant for update;
  if c.operation_until > clock_timestamp() and c.operation_id is distinct from p_operation_id then
    raise exception 'billing_operation_busy';
  end if;
  if p_operation_id is not null and c.operation_id is distinct from p_operation_id then raise exception 'billing_operation_lost'; end if;
  if not exists(select 1 from safebus_private.tenant_billing_accounts
    where tenant_id = v_tenant and external_customer_id = p_state->>'customer_id') then raise exception 'billing_tenant_mapping_missing'; end if;
  select * into s from safebus_private.tenant_subscription_projections where tenant_id = v_tenant;
  if s.external_subscription_id is not null and s.external_subscription_id <> p_state->>'subscription_id'
    and (s.status not in ('canceled','incomplete_expired') or p_state->>'status' in ('canceled','incomplete_expired')) then
    return false;
  end if;
  if s.provider_event_created_at > (p_state->>'observed_at')::timestamptz then return false; end if;
  perform public.billing_upsert_projection(v_tenant, p_state->>'customer_id', p_state->>'subscription_id',
    p_state->>'price_id', p_state->>'product_name', p_state->>'price_nickname', p_state->>'status',
    (p_state->>'quantity')::integer, p_state->>'currency', (p_state->>'unit_amount')::bigint,
    (p_state->>'period_start')::timestamptz, (p_state->>'period_end')::timestamptz,
    (p_state->>'trial_end')::timestamptz, (p_state->>'cancel_at_period_end')::boolean,
    (p_state->>'cancel_at')::timestamptz, (p_state->>'canceled_at')::timestamptz,
    p_state->>'billing_email', p_state->>'purchase_order', coalesce((p_state->>'days_until_due')::integer,30),
    p_state->>'invoice_status', (p_state->>'invoice_due_at')::timestamptz, (p_state->>'observed_at')::timestamptz);
  update safebus_private.tenant_subscription_projections set
    billing_interval = p_state->>'interval', collection_method = p_state->>'collection_method',
    has_payment_method = (p_state->>'has_payment_method')::boolean,
    pending_change = nullif(p_state->'pending_change', 'null'::jsonb),
    paid_through = greatest(
      case when p_state->>'status' = 'active' and p_state->>'invoice_status' = 'paid' and p_state->>'paid_period_end' is not null
        then least((p_state->>'paid_period_end')::timestamptz, (p_state->>'period_end')::timestamptz) end,
      case when s.external_subscription_id = p_state->>'subscription_id' then s.paid_through end),
    pending_payment = coalesce((p_state->>'pending_payment')::boolean, false)
  where tenant_id = v_tenant;
  update safebus_private.tenant_billing_control set
    trial_used_at = case when p_state->>'trial_end' is not null then coalesce(trial_used_at, now()) else trial_used_at end,
    reserved_bus_count = null where tenant_id = v_tenant;
  return true;
end;
$$;

-- All server entry points are explicitly service-only.
revoke all on function public.billing_claim_operation(uuid,uuid,uuid,text,text,jsonb),
  public.billing_finish_operation(uuid,uuid,jsonb), public.billing_reserve_capacity(uuid,uuid,integer),
  public.billing_find_customer(text), public.billing_sync_subscription(jsonb,uuid) from public, anon, authenticated;
grant execute on function public.billing_claim_operation(uuid,uuid,uuid,text,text,jsonb),
  public.billing_finish_operation(uuid,uuid,jsonb), public.billing_reserve_capacity(uuid,uuid,integer),
  public.billing_find_customer(text), public.billing_sync_subscription(jsonb,uuid) to service_role;

create function public.billing_get_pending_request(p_tenant_id uuid, p_actor_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
  select jsonb_build_object('requestId', r.request_id, 'body', r.request_payload)
    from safebus_private.tenant_billing_control c
    join safebus_private.billing_mutation_requests r on r.request_id = c.operation_id
    where c.tenant_id = p_tenant_id and r.actor_profile_id = p_actor_id and r.status <> 'completed';
$$;
revoke all on function public.billing_get_pending_request(uuid,uuid) from public, anon, authenticated;
grant execute on function public.billing_get_pending_request(uuid,uuid) to service_role;

alter function public.billing_get_internal_state(uuid) set schema safebus_private;
alter function safebus_private.billing_get_internal_state(uuid) rename to billing_get_internal_state_before_self_service;
revoke all on function safebus_private.billing_get_internal_state_before_self_service(uuid) from public, anon, authenticated, service_role;
create function public.billing_get_internal_state(p_tenant_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
  select safebus_private.billing_get_internal_state_before_self_service(p_tenant_id) ||
    jsonb_build_object('bus_access', safebus_private.bus_subscription_access(p_tenant_id));
$$;
revoke all on function public.billing_get_internal_state(uuid) from public, anon, authenticated;
grant execute on function public.billing_get_internal_state(uuid) to service_role;

-- A crashed webhook delivery can be retried; a fresh in-flight duplicate cannot
-- concurrently project a second snapshot.
create or replace function public.billing_begin_webhook_event(
  p_event_id text, p_event_type text, p_object_id text, p_event_created_at timestamptz)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
begin
  insert into safebus_private.stripe_webhook_receipts(event_id,event_type,object_id,event_created_at)
    values(p_event_id,p_event_type,p_object_id,p_event_created_at) on conflict do nothing;
  if found then return true; end if;
  update safebus_private.stripe_webhook_receipts set attempts=attempts+1,status='processing'
    where event_id=p_event_id and (status='failed' or (status='processing' and updated_at < now()-interval '2 minutes'));
  return found;
end;
$$;

alter function safebus_private.subscription_view(uuid) rename to subscription_view_before_self_service;
create function safebus_private.subscription_view(p_tenant_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
  select safebus_private.subscription_view_before_self_service(p_tenant_id) || jsonb_build_object(
    'billing_interval', s.billing_interval, 'period_total', s.unit_amount * s.licensed_bus_count,
    'collection_method', s.collection_method, 'trial_eligible', c.trial_used_at is null and s.tenant_id is null,
    'pending_change', s.pending_change, 'pending_payment', coalesce(s.pending_payment,false),
    'bus_access', safebus_private.bus_subscription_access(p_tenant_id)
  ) from public.tenants t
  left join safebus_private.tenant_subscription_projections s on s.tenant_id = t.id
  left join safebus_private.tenant_billing_control c on c.tenant_id = t.id where t.id = p_tenant_id;
$$;
revoke all on function safebus_private.subscription_view(uuid) from public, anon, authenticated, service_role;
-- JSON keeps the public function signature and existing generated contract stable.
create function public.get_platform_subscription_summaries()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
begin
  if not safebus_private.is_platform_super_admin() or not safebus_private.has_verified_mfa() then raise exception 'Platform administrator required.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(safebus_private.subscription_view(t.id)) from public.tenants t),'[]'::jsonb);
end;
$$;
revoke all on function public.get_platform_subscription_summaries() from public, anon, authenticated;
grant execute on function public.get_platform_subscription_summaries() to authenticated;
notify pgrst, 'reload schema';

create function public.platform_prepare_first_admin_reissue(p_invitation_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp as $$
declare i public.tenant_onboarding_invitations;
begin
  if not coalesce(public.platform_is_first_admin_invitation(p_invitation_id), false) then
    raise exception 'First administrator invitation required.' using errcode = '42501';
  end if;
  perform safebus_private.enforce_recent_auth_for_sensitive_action();
  select * into i from public.tenant_onboarding_invitations where id = p_invitation_id for update;
  if i.status <> 'expired' or not exists(select 1 from public.profiles p where p.id = i.invited_profile_id and p.status = 'disabled')
    or exists(select 1 from public.tenant_onboarding_invitations n where n.invited_profile_id = i.invited_profile_id and n.created_at > i.created_at) then
    raise exception 'Only the latest expired, unactivated invitation can be reissued.';
  end if;
  perform safebus_private.revoke_all_user_sessions(i.invited_profile_id);
end;
$$;
revoke all on function public.platform_prepare_first_admin_reissue(uuid) from public, anon, authenticated;
grant execute on function public.platform_prepare_first_admin_reissue(uuid) to authenticated;

create function public.platform_finalize_first_admin_reissue(p_invitation_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
declare i public.tenant_onboarding_invitations;
begin
  select * into i from public.tenant_onboarding_invitations where id = p_invitation_id for update;
  if i.status <> 'expired' or not exists(select 1 from public.profiles p where p.id = i.invited_profile_id and p.status = 'disabled') then
    raise exception 'Expired invitation changed; reload onboarding.';
  end if;
  insert into public.tenant_onboarding_invitations(tenant_id,email,full_name,role,invited_profile_id,invited_by_profile_id,status,last_sent_at,expires_at,delivery_status)
  values(i.tenant_id,i.email,i.full_name,i.role,i.invited_profile_id,i.invited_by_profile_id,'pending',now(),now()+interval '7 days','sent');
  update public.profiles set status = 'invited' where id = i.invited_profile_id and status = 'disabled';
end;
$$;
revoke all on function public.platform_finalize_first_admin_reissue(uuid) from public, anon, authenticated;
grant execute on function public.platform_finalize_first_admin_reissue(uuid) to service_role;

create or replace function public.get_platform_first_admin_invitation_status()
returns table(invitation_id uuid,tenant_id uuid,invited_profile_id uuid,status text,last_sent_at timestamptz,expires_at timestamptz,delivery_status text)
language sql stable security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
  with first_admin as (
    select distinct on (p.tenant_id) p.tenant_id,p.id from public.profiles p
    where p.role = 'tenant_admin' order by p.tenant_id,p.created_at,p.id
  ) select i.id,i.tenant_id,i.invited_profile_id,i.status,i.last_sent_at,i.expires_at,i.delivery_status
    from first_admin f join public.tenant_onboarding_invitations i
      on i.tenant_id=f.tenant_id and i.invited_profile_id=f.id and i.role='tenant_admin'
    where safebus_private.is_platform_super_admin() and safebus_private.has_verified_mfa()
    order by i.created_at desc,i.id desc;
$$;
notify pgrst, 'reload schema';
