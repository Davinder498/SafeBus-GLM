-- Prepared, unapplied. Requires 20261016173613_tenant_self_service_subscriptions.sql.
-- Release only through the protected reconciliation/recovery/approval workflow.
-- The two identity pairs were verified read-only against the hosted project.
create table safebus_private.tenant_subscription_exemptions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  approved_profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason = 'owner_testing'),
  approved_at timestamptz not null default now()
);
alter table safebus_private.tenant_subscription_exemptions enable row level security;
revoke all on safebus_private.tenant_subscription_exemptions from public, anon, authenticated, service_role;

insert into safebus_private.tenant_subscription_exemptions(tenant_id, approved_profile_id, reason)
select p.tenant_id, p.id, 'owner_testing'
from (values
  ('e19ab3b1-8346-4779-9fdb-46de90081a07'::uuid, '5ba7237a-7c29-4eb7-88d8-6e9a45189566'::uuid),
  ('49410f95-38da-4eed-aaef-c6b6b98e9a7c'::uuid, '6f1a03d0-034a-4aa4-9457-1c51138a8bea'::uuid)
) approved(tenant_id, profile_id)
join public.profiles p on p.id = approved.profile_id and p.tenant_id = approved.tenant_id
join auth.users u on u.id = p.id
where p.role = 'tenant_admin' and p.status = 'active' and u.email_confirmed_at is not null;
do $$ begin
  if (select count(*) from safebus_private.tenant_subscription_exemptions) <> 2 then
    raise exception 'Reconcile the two approved test tenant identities before releasing this migration.';
  end if;
end; $$;

-- Replace in place so already prepared callers retain the current access guard.
create or replace function safebus_private.bus_subscription_access(p_tenant_id uuid)
returns jsonb language sql volatile security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
  select jsonb_build_object(
    'exempt', e.tenant_id is not null,
    'eligible', coalesce(t.status = 'active' and (e.tenant_id is not null or (
      s.status in ('active','trialing') and case when s.status = 'trialing'
        then s.trial_end > now() and (s.collection_method = 'send_invoice' or s.has_payment_method)
        else s.current_period_end > now() and (s.collection_method = 'send_invoice' or s.paid_through > now()) end
    )),false),
    'limit', case when e.tenant_id is not null then null else least(s.licensed_bus_count,
      coalesce(c.reserved_bus_count,(s.pending_change->>'quantity')::integer,s.licensed_bus_count)) end,
    'active', (select count(*) from public.buses b where b.tenant_id=t.id and b.status='active')
  ) from public.tenants t
  left join safebus_private.tenant_subscription_projections s on s.tenant_id=t.id
  left join safebus_private.tenant_billing_control c on c.tenant_id=t.id
  left join safebus_private.tenant_subscription_exemptions e on e.tenant_id=t.id
  where t.id = p_tenant_id;
$$;
revoke all on function safebus_private.bus_subscription_access(uuid) from public, anon, authenticated, service_role;

create or replace function safebus_private.subscription_view(p_tenant_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
  select safebus_private.subscription_view_before_self_service(p_tenant_id) || jsonb_build_object(
    'billing_interval',s.billing_interval,'period_total',s.unit_amount*s.licensed_bus_count,
    'collection_method',s.collection_method,
    'trial_eligible',e.tenant_id is null and c.trial_used_at is null and s.tenant_id is null,
    'pending_change',s.pending_change,'pending_payment',coalesce(s.pending_payment,false),
    'bus_access',safebus_private.bus_subscription_access(p_tenant_id),
    'subscription_exempt',e.tenant_id is not null) ||
    case when e.tenant_id is not null then jsonb_build_object('trial_eligible', false, 'billing_warning', false)
      else '{}'::jsonb end
  from public.tenants t
  left join safebus_private.tenant_subscription_projections s on s.tenant_id=t.id
  left join safebus_private.tenant_billing_control c on c.tenant_id=t.id
  left join safebus_private.tenant_subscription_exemptions e on e.tenant_id=t.id
  where t.id = p_tenant_id;
$$;
revoke all on function safebus_private.subscription_view(uuid) from public, anon, authenticated, service_role;

-- The existing bus trigger still locks the tenant row, enforces eligibility,
-- preserves RLS and rejects tenant transfers. A null allowance is unlimited only
-- for these private exemptions; no synthetic subscription or new trial is created.

create table safebus_private.billing_catalog_operations (
  request_id uuid primary key,
  actor_profile_id uuid not null references public.profiles(id),
  action text not null check (action in ('create_price','set_price_active','create_discount','set_discount_active')),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  request_payload jsonb not null,
  status text not null default 'processing' check (status in ('processing','completed')),
  lease_until timestamptz not null,
  response jsonb,
  created_at timestamptz not null default now()
);
alter table safebus_private.billing_catalog_operations enable row level security;
revoke all on safebus_private.billing_catalog_operations from public, anon, authenticated, service_role;

create function public.billing_claim_catalog_operation(p_request_id uuid, p_actor_id uuid, p_action text, p_hash text, p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
declare r safebus_private.billing_catalog_operations; v_new boolean;
begin
  if not exists(select 1 from public.profiles where id = p_actor_id and role = 'platform_super_admin' and status = 'active') then
    raise exception 'billing_catalog_forbidden' using errcode = '42501';
  end if;
  perform 1 from public.profiles where id=p_actor_id for update;
  if exists(select 1 from safebus_private.billing_catalog_operations
    where actor_profile_id=p_actor_id and status='processing' and request_id<>p_request_id) then
    raise exception 'billing_pending_operation';
  end if;
  insert into safebus_private.billing_catalog_operations(request_id, actor_profile_id, action, request_hash, request_payload, lease_until)
    values(p_request_id,p_actor_id,p_action,p_hash,p_payload,now()+interval '2 minutes') on conflict do nothing;
  v_new := found;
  select * into r from safebus_private.billing_catalog_operations where request_id = p_request_id for update;
  if r.actor_profile_id <> p_actor_id or r.action <> p_action or r.request_hash <> p_hash then
    raise exception 'billing_request_conflict';
  end if;
  if r.status = 'completed' then return jsonb_build_object('replayed', true, 'response', r.response); end if;
  if not v_new and r.lease_until > now() then raise exception 'billing_operation_busy'; end if;
  update safebus_private.billing_catalog_operations set lease_until = now()+interval '2 minutes' where request_id=p_request_id;
  return jsonb_build_object('replayed', false);
end;
$$;
revoke all on function public.billing_claim_catalog_operation(uuid,uuid,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.billing_claim_catalog_operation(uuid,uuid,text,text,jsonb) to service_role;

create function public.billing_get_pending_catalog_operation(p_actor_id uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
  select jsonb_build_object('requestId',r.request_id,'body',r.request_payload)
  from safebus_private.billing_catalog_operations r join public.profiles p on p.id=r.actor_profile_id
  where r.actor_profile_id=p_actor_id and r.status='processing' and p.role='platform_super_admin' and p.status='active'
  order by r.created_at desc limit 1;
$$;
revoke all on function public.billing_get_pending_catalog_operation(uuid) from public, anon, authenticated;
grant execute on function public.billing_get_pending_catalog_operation(uuid) to service_role;

create function public.billing_finish_catalog_operation(p_request_id uuid, p_actor_id uuid, p_response jsonb)
returns void language plpgsql security definer
set search_path = pg_catalog, public, safebus_private, pg_temp as $$
declare r safebus_private.billing_catalog_operations;
begin
  if not exists(select 1 from public.profiles where id = p_actor_id and role = 'platform_super_admin' and status = 'active') then
    raise exception 'billing_catalog_forbidden' using errcode = '42501';
  end if;
  select * into r from safebus_private.billing_catalog_operations where request_id=p_request_id for update;
  if r.request_id is null or r.actor_profile_id <> p_actor_id then raise exception 'billing_request_conflict'; end if;
  if r.status = 'completed' then return; end if;
  perform public.write_server_audit_event(p_actor_id, 'security.config_changed', 'billing_catalog', null,
    case when p_response ? 'error' then 'failure' else 'success' end,
    jsonb_build_object('operation',r.action,'request_id',r.request_id,'resource_id',p_response->>'id'));
  update safebus_private.billing_catalog_operations set status='completed',response=p_response where request_id=p_request_id;
end;
$$;
revoke all on function public.billing_finish_catalog_operation(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.billing_finish_catalog_operation(uuid,uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
