-- SafeBus Alberta - annual per-bus subscription management
--
-- Stripe remains the financial source of truth. These private tables contain
-- only the minimum provider mapping, a display projection, idempotency state,
-- and webhook receipt metadata. Payment methods and provider payloads are
-- never stored in SafeBus.

create schema if not exists safebus_private;
revoke all on schema safebus_private from public, anon, authenticated;
grant usage on schema safebus_private to service_role;

-- Extend the existing authenticated rate limiter with separate billing buckets.
alter table public.rate_limit_buckets
  drop constraint if exists rate_limit_buckets_action_check;
alter table public.rate_limit_buckets
  add constraint rate_limit_buckets_action_check check (
    action in (
      'login', 'invitation', 'password_reset', 'onboarding', 'audit_write',
      'bulk_import', 'bulk_invitation',
      'billing_read', 'billing_mutation', 'billing_portal'
    )
  );

create or replace function public.check_rate_limit(
  p_action text,
  p_actor_identifier text,
  p_max integer default 10,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $$
declare
  v_window_start timestamptz;
  v_actor_hash text;
  v_bucket text;
  v_count integer;
begin
  if p_action is null or p_action not in (
       'login', 'invitation', 'password_reset', 'onboarding', 'audit_write',
       'bulk_import', 'bulk_invitation',
       'billing_read', 'billing_mutation', 'billing_portal'
     )
     or nullif(btrim(p_actor_identifier), '') is null
     or p_max is null or p_max < 1 or p_max > 10000
     or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate-limit parameters.' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );
  v_actor_hash := md5(p_actor_identifier);
  v_bucket := p_action || ':' || left(v_actor_hash, 16) || ':'
    || extract(epoch from v_window_start)::bigint::text;

  insert into public.rate_limit_buckets (
    bucket_key, action, actor_identifier, window_start, count
  ) values (v_bucket, p_action, v_actor_hash, v_window_start, 1)
  on conflict (bucket_key, action, actor_identifier, window_start)
  do update set count = public.rate_limit_buckets.count + 1
  returning count into v_count;

  if v_count > p_max then
    begin
      if auth.uid() is not null then
        perform public.write_audit_event(
          'rate_limit.exceeded', null, null, null, 'denied',
          jsonb_build_object('action', p_action, 'count', v_count, 'max', p_max),
          null
        );
      end if;
    exception when others then null;
    end;
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, text, integer, integer)
  from public, anon;
grant execute on function public.check_rate_limit(text, text, integer, integer)
  to authenticated, service_role;

create table safebus_private.tenant_billing_accounts (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  provider text not null default 'stripe',
  external_customer_id text not null unique,
  billing_email text not null,
  purchase_order_reference text,
  days_until_due integer not null default 30,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_billing_provider_check check (provider = 'stripe'),
  constraint tenant_billing_customer_id_check check (
    length(external_customer_id) between 3 and 255
  ),
  constraint tenant_billing_email_check check (
    length(billing_email) between 3 and 320
    and billing_email = lower(btrim(billing_email))
    and billing_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  constraint tenant_billing_po_check check (
    purchase_order_reference is null
    or length(purchase_order_reference) between 1 and 100
  ),
  constraint tenant_billing_due_days_check check (days_until_due between 1 and 90)
);

create table safebus_private.tenant_subscription_projections (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  external_subscription_id text not null unique,
  external_price_id text not null,
  product_name text not null,
  price_nickname text,
  status text not null,
  licensed_bus_count integer not null,
  currency text not null,
  unit_amount bigint not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_at timestamptz,
  canceled_at timestamptz,
  latest_invoice_status text,
  latest_invoice_due_at timestamptz,
  provider_event_created_at timestamptz not null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_subscription_id_check check (
    length(external_subscription_id) between 3 and 255
  ),
  constraint tenant_subscription_price_id_check check (
    length(external_price_id) between 3 and 255
  ),
  constraint tenant_subscription_product_name_check check (
    length(product_name) between 1 and 200
  ),
  constraint tenant_subscription_nickname_check check (
    price_nickname is null or length(price_nickname) between 1 and 100
  ),
  constraint tenant_subscription_status_check check (
    status in (
      'incomplete', 'incomplete_expired', 'trialing', 'active',
      'past_due', 'canceled', 'unpaid', 'paused'
    )
  ),
  constraint tenant_subscription_quantity_check check (licensed_bus_count >= 0),
  constraint tenant_subscription_currency_check check (
    currency = lower(currency) and currency ~ '^[a-z]{3}$'
  ),
  constraint tenant_subscription_unit_amount_check check (unit_amount >= 0),
  constraint tenant_subscription_invoice_status_check check (
    latest_invoice_status is null
    or latest_invoice_status in ('draft', 'open', 'paid', 'uncollectible', 'void')
  )
);

create table safebus_private.billing_mutation_requests (
  request_id uuid primary key,
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  action text not null,
  request_hash text not null,
  status text not null default 'processing',
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_mutation_action_check check (
    action in ('create', 'update', 'schedule_cancel', 'resume', 'reconcile')
  ),
  constraint billing_mutation_hash_check check (request_hash ~ '^[0-9a-f]{64}$'),
  constraint billing_mutation_status_check check (
    status in ('processing', 'completed', 'failed')
  ),
  constraint billing_mutation_error_check check (
    error_code is null or length(error_code) between 1 and 80
  )
);

create table safebus_private.stripe_webhook_receipts (
  event_id text primary key,
  event_type text not null,
  object_id text,
  event_created_at timestamptz not null,
  status text not null default 'processing',
  attempts integer not null default 1,
  last_error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint stripe_webhook_event_id_check check (length(event_id) between 3 and 255),
  constraint stripe_webhook_event_type_check check (length(event_type) between 3 and 120),
  constraint stripe_webhook_object_id_check check (
    object_id is null or length(object_id) between 3 and 255
  ),
  constraint stripe_webhook_status_check check (
    status in ('processing', 'completed', 'ignored', 'failed')
  ),
  constraint stripe_webhook_attempts_check check (attempts > 0),
  constraint stripe_webhook_error_check check (
    last_error_code is null or length(last_error_code) between 1 and 80
  )
);

create index tenant_subscription_status_idx
  on safebus_private.tenant_subscription_projections(status, current_period_end);
create index billing_mutation_tenant_created_idx
  on safebus_private.billing_mutation_requests(tenant_id, created_at desc);
create index stripe_webhook_status_received_idx
  on safebus_private.stripe_webhook_receipts(status, received_at);

alter table safebus_private.tenant_billing_accounts enable row level security;
alter table safebus_private.tenant_subscription_projections enable row level security;
alter table safebus_private.billing_mutation_requests enable row level security;
alter table safebus_private.stripe_webhook_receipts enable row level security;

revoke all on all tables in schema safebus_private from public, anon, authenticated, service_role;

create trigger set_updated_at_tenant_billing_accounts
  before update on safebus_private.tenant_billing_accounts
  for each row execute function public.set_updated_at();

create trigger set_updated_at_tenant_subscription_projections
  before update on safebus_private.tenant_subscription_projections
  for each row execute function public.set_updated_at();

create trigger set_updated_at_billing_mutation_requests
  before update on safebus_private.billing_mutation_requests
  for each row execute function public.set_updated_at();

create trigger set_updated_at_stripe_webhook_receipts
  before update on safebus_private.stripe_webhook_receipts
  for each row execute function public.set_updated_at();

create or replace function safebus_private.subscription_view(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, safebus_private, pg_temp
as $$
  with usage as (
    select count(*)::integer as active_bus_count
    from public.buses b
    where b.tenant_id = p_tenant_id and b.status = 'active'
  )
  select jsonb_build_object(
    'configured', projection.tenant_id is not null,
    'tenant_id', tenant.id,
    'tenant_name', tenant.name,
    'tenant_type', tenant.type,
    'tenant_status', tenant.status,
    'product_name', projection.product_name,
    'price_nickname', projection.price_nickname,
    'subscription_status', projection.status,
    'licensed_bus_count', projection.licensed_bus_count,
    'active_bus_count', usage.active_bus_count,
    'usage_exceeds_allowance', coalesce(usage.active_bus_count > projection.licensed_bus_count, false),
    'currency', projection.currency,
    'unit_amount', projection.unit_amount,
    'annual_total', projection.unit_amount * projection.licensed_bus_count,
    'current_period_start', projection.current_period_start,
    'current_period_end', projection.current_period_end,
    'trial_end', projection.trial_end,
    'cancel_at_period_end', coalesce(projection.cancel_at_period_end, false),
    'cancel_at', projection.cancel_at,
    'canceled_at', projection.canceled_at,
    'billing_email', account.billing_email,
    'purchase_order_reference', account.purchase_order_reference,
    'days_until_due', account.days_until_due,
    'latest_invoice_status', projection.latest_invoice_status,
    'latest_invoice_due_at', projection.latest_invoice_due_at,
    'last_synced_at', projection.last_synced_at,
    'billing_warning', coalesce(
      projection.status in ('incomplete', 'incomplete_expired', 'past_due', 'unpaid', 'canceled', 'paused')
      or usage.active_bus_count > projection.licensed_bus_count,
      false
    )
  )
  from public.tenants tenant
  cross join usage
  left join safebus_private.tenant_billing_accounts account on account.tenant_id = tenant.id
  left join safebus_private.tenant_subscription_projections projection on projection.tenant_id = tenant.id
  where tenant.id = p_tenant_id;
$$;

revoke all on function safebus_private.subscription_view(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.get_tenant_subscription()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp
as $$
declare
  v_tenant_id uuid;
begin
  if auth.uid() is null
    or public.current_user_role() <> 'tenant_admin'
    or not public.has_verified_mfa() then
    raise exception 'Only a verified tenant administrator can view billing.'
      using errcode = '42501';
  end if;

  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'Tenant assignment required.' using errcode = '42501';
  end if;

  return safebus_private.subscription_view(v_tenant_id);
end;
$$;

revoke all on function public.get_tenant_subscription() from public, anon, authenticated;
grant execute on function public.get_tenant_subscription() to authenticated;

create or replace function public.get_platform_tenant_billing_detail(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp
as $$
begin
  if auth.uid() is null
    or not public.is_platform_super_admin()
    or not public.has_verified_mfa() then
    raise exception 'Only a verified platform administrator can view tenant billing.'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'Tenant not found.' using errcode = 'P0002';
  end if;

  return safebus_private.subscription_view(p_tenant_id) || jsonb_build_object(
    'price_id', (
      select projection.external_price_id
      from safebus_private.tenant_subscription_projections projection
      where projection.tenant_id = p_tenant_id
    )
  );
end;
$$;

revoke all on function public.get_platform_tenant_billing_detail(uuid)
  from public, anon, authenticated;
grant execute on function public.get_platform_tenant_billing_detail(uuid)
  to authenticated;

create or replace function public.get_platform_tenant_billing_summaries()
returns table (
  tenant_id uuid,
  subscription_configured boolean,
  subscription_status text,
  licensed_bus_count integer,
  active_bus_count integer,
  current_period_end timestamptz,
  billing_warning boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, safebus_private, auth, pg_temp
as $$
begin
  if auth.uid() is null
    or not public.is_platform_super_admin()
    or not public.has_verified_mfa() then
    raise exception 'Only a verified platform administrator can view tenant billing.'
      using errcode = '42501';
  end if;

  return query
    select
      tenant.id,
      projection.tenant_id is not null,
      projection.status,
      projection.licensed_bus_count,
      count(bus.id) filter (where bus.status = 'active')::integer,
      projection.current_period_end,
      coalesce(
        projection.status in ('incomplete', 'incomplete_expired', 'past_due', 'unpaid', 'canceled', 'paused')
        or count(bus.id) filter (where bus.status = 'active') > projection.licensed_bus_count,
        false
      )
    from public.tenants tenant
    left join public.buses bus on bus.tenant_id = tenant.id
    left join safebus_private.tenant_subscription_projections projection
      on projection.tenant_id = tenant.id
    group by tenant.id, projection.tenant_id, projection.status,
      projection.licensed_bus_count, projection.current_period_end
    order by tenant.created_at desc;
end;
$$;

revoke all on function public.get_platform_tenant_billing_summaries()
  from public, anon, authenticated;
grant execute on function public.get_platform_tenant_billing_summaries()
  to authenticated;

create or replace function public.billing_get_internal_state(p_tenant_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, safebus_private, pg_temp
as $$
  select jsonb_build_object(
    'tenant_id', tenant.id,
    'tenant_name', tenant.name,
    'tenant_status', tenant.status,
    'active_bus_count', count(bus.id) filter (where bus.status = 'active'),
    'external_customer_id', account.external_customer_id,
    'external_subscription_id', projection.external_subscription_id,
    'external_price_id', projection.external_price_id,
    'licensed_bus_count', projection.licensed_bus_count,
    'billing_email', account.billing_email,
    'purchase_order_reference', account.purchase_order_reference,
    'days_until_due', account.days_until_due
  )
  from public.tenants tenant
  left join public.buses bus on bus.tenant_id = tenant.id
  left join safebus_private.tenant_billing_accounts account on account.tenant_id = tenant.id
  left join safebus_private.tenant_subscription_projections projection on projection.tenant_id = tenant.id
  where tenant.id = p_tenant_id
  group by tenant.id, account.tenant_id, account.external_customer_id,
    account.billing_email, account.purchase_order_reference, account.days_until_due,
    projection.tenant_id, projection.external_subscription_id,
    projection.external_price_id, projection.licensed_bus_count;
$$;

revoke all on function public.billing_get_internal_state(uuid)
  from public, anon, authenticated;
grant execute on function public.billing_get_internal_state(uuid) to service_role;

create or replace function public.billing_upsert_customer_mapping(
  p_tenant_id uuid,
  p_customer_id text,
  p_billing_email text,
  p_purchase_order_reference text,
  p_days_until_due integer
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, safebus_private, pg_temp
as $$
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'Tenant not found.' using errcode = 'P0002';
  end if;

  insert into safebus_private.tenant_billing_accounts (
    tenant_id, external_customer_id, billing_email,
    purchase_order_reference, days_until_due
  ) values (
    p_tenant_id, btrim(p_customer_id), lower(btrim(p_billing_email)),
    nullif(btrim(p_purchase_order_reference), ''), p_days_until_due
  )
  on conflict (tenant_id) do update set
    external_customer_id = excluded.external_customer_id,
    billing_email = excluded.billing_email,
    purchase_order_reference = excluded.purchase_order_reference,
    days_until_due = excluded.days_until_due;
end;
$$;

revoke all on function public.billing_upsert_customer_mapping(uuid, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.billing_upsert_customer_mapping(uuid, text, text, text, integer)
  to service_role;

create or replace function public.billing_upsert_projection(
  p_tenant_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_price_id text,
  p_product_name text,
  p_price_nickname text,
  p_status text,
  p_licensed_bus_count integer,
  p_currency text,
  p_unit_amount bigint,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_trial_end timestamptz,
  p_cancel_at_period_end boolean,
  p_cancel_at timestamptz,
  p_canceled_at timestamptz,
  p_billing_email text,
  p_purchase_order_reference text,
  p_days_until_due integer,
  p_latest_invoice_status text,
  p_latest_invoice_due_at timestamptz,
  p_event_created_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, safebus_private, pg_temp
as $$
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'Tenant not found.' using errcode = 'P0002';
  end if;

  insert into safebus_private.tenant_billing_accounts (
    tenant_id, external_customer_id, billing_email,
    purchase_order_reference, days_until_due
  ) values (
    p_tenant_id, btrim(p_customer_id), lower(btrim(p_billing_email)),
    nullif(btrim(p_purchase_order_reference), ''), p_days_until_due
  )
  on conflict (tenant_id) do update set
    external_customer_id = excluded.external_customer_id,
    billing_email = excluded.billing_email,
    purchase_order_reference = excluded.purchase_order_reference,
    days_until_due = excluded.days_until_due;

  insert into safebus_private.tenant_subscription_projections (
    tenant_id, external_subscription_id, external_price_id,
    product_name, price_nickname, status, licensed_bus_count,
    currency, unit_amount, current_period_start, current_period_end,
    trial_end, cancel_at_period_end, cancel_at, canceled_at,
    latest_invoice_status, latest_invoice_due_at,
    provider_event_created_at, last_synced_at
  ) values (
    p_tenant_id, btrim(p_subscription_id), btrim(p_price_id),
    btrim(p_product_name), nullif(btrim(p_price_nickname), ''), p_status,
    p_licensed_bus_count, lower(btrim(p_currency)), p_unit_amount,
    p_period_start, p_period_end, p_trial_end,
    coalesce(p_cancel_at_period_end, false), p_cancel_at, p_canceled_at,
    p_latest_invoice_status, p_latest_invoice_due_at,
    p_event_created_at, now()
  )
  on conflict (tenant_id) do update set
    external_subscription_id = excluded.external_subscription_id,
    external_price_id = excluded.external_price_id,
    product_name = excluded.product_name,
    price_nickname = excluded.price_nickname,
    status = excluded.status,
    licensed_bus_count = excluded.licensed_bus_count,
    currency = excluded.currency,
    unit_amount = excluded.unit_amount,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    trial_end = excluded.trial_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    cancel_at = excluded.cancel_at,
    canceled_at = excluded.canceled_at,
    latest_invoice_status = excluded.latest_invoice_status,
    latest_invoice_due_at = excluded.latest_invoice_due_at,
    provider_event_created_at = excluded.provider_event_created_at,
    last_synced_at = now()
  where excluded.provider_event_created_at >=
    safebus_private.tenant_subscription_projections.provider_event_created_at;

  return found;
end;
$$;

revoke all on function public.billing_upsert_projection(
  uuid, text, text, text, text, text, text, integer, text, bigint,
  timestamptz, timestamptz, timestamptz, boolean, timestamptz, timestamptz,
  text, text, integer, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.billing_upsert_projection(
  uuid, text, text, text, text, text, text, integer, text, bigint,
  timestamptz, timestamptz, timestamptz, boolean, timestamptz, timestamptz,
  text, text, integer, text, timestamptz, timestamptz
) to service_role;

create or replace function public.billing_begin_mutation(
  p_request_id uuid,
  p_actor_profile_id uuid,
  p_tenant_id uuid,
  p_action text,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, safebus_private, pg_temp
as $$
declare
  v_existing safebus_private.billing_mutation_requests;
begin
  insert into safebus_private.billing_mutation_requests (
    request_id, actor_profile_id, tenant_id, action, request_hash
  ) values (
    p_request_id, p_actor_profile_id, p_tenant_id, p_action, lower(p_request_hash)
  )
  on conflict (request_id) do nothing;

  select * into v_existing
  from safebus_private.billing_mutation_requests
  where request_id = p_request_id;

  if v_existing.actor_profile_id <> p_actor_profile_id
    or v_existing.tenant_id <> p_tenant_id
    or v_existing.action <> p_action
    or v_existing.request_hash <> lower(p_request_hash) then
    raise exception 'Request id was already used for a different operation.'
      using errcode = '23505';
  end if;

  return jsonb_build_object(
    'status', v_existing.status,
    'should_process', v_existing.status <> 'completed'
  );
end;
$$;

revoke all on function public.billing_begin_mutation(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.billing_begin_mutation(uuid, uuid, uuid, text, text)
  to service_role;

create or replace function public.billing_complete_mutation(
  p_request_id uuid,
  p_status text,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, safebus_private, pg_temp
as $$
begin
  if p_status not in ('completed', 'failed') then
    raise exception 'Unsupported mutation status.' using errcode = '22023';
  end if;

  update safebus_private.billing_mutation_requests
  set status = p_status,
      error_code = nullif(btrim(p_error_code), '')
  where request_id = p_request_id;

  if not found then
    raise exception 'Billing mutation request not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.billing_complete_mutation(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.billing_complete_mutation(uuid, text, text)
  to service_role;

create or replace function public.billing_begin_webhook_event(
  p_event_id text,
  p_event_type text,
  p_object_id text,
  p_event_created_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, safebus_private, pg_temp
as $$
begin
  insert into safebus_private.stripe_webhook_receipts (
    event_id, event_type, object_id, event_created_at
  ) values (
    btrim(p_event_id), btrim(p_event_type), nullif(btrim(p_object_id), ''),
    p_event_created_at
  )
  on conflict (event_id) do nothing;

  if found then
    return true;
  end if;

  update safebus_private.stripe_webhook_receipts
  set attempts = attempts + 1
  where event_id = p_event_id and status = 'failed';

  return found;
end;
$$;

revoke all on function public.billing_begin_webhook_event(text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.billing_begin_webhook_event(text, text, text, timestamptz)
  to service_role;

create or replace function public.billing_complete_webhook_event(
  p_event_id text,
  p_status text,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, safebus_private, pg_temp
as $$
begin
  if p_status not in ('completed', 'ignored', 'failed') then
    raise exception 'Unsupported webhook status.' using errcode = '22023';
  end if;

  update safebus_private.stripe_webhook_receipts
  set status = p_status,
      last_error_code = nullif(btrim(p_error_code), ''),
      processed_at = case when p_status in ('completed', 'ignored') then now() else null end
  where event_id = p_event_id;

  if not found then
    raise exception 'Webhook receipt not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.billing_complete_webhook_event(text, text, text)
  from public, anon, authenticated;
grant execute on function public.billing_complete_webhook_event(text, text, text)
  to service_role;

-- Preserve the existing append-only audit allowlist and add billing actions.
alter table public.audit_events drop constraint if exists audit_events_action_check;
alter table public.audit_events add constraint audit_events_action_check check (
  action in (
    'auth.login', 'auth.logout', 'auth.password_reset_requested',
    'auth.password_reset_completed', 'auth.password_changed',
    'auth.mfa_enrolled', 'auth.mfa_removed', 'auth.mfa_challenge_failed',
    'auth.account_recovery', 'auth.recent_auth_required',
    'invitation.created', 'invitation.resent', 'invitation.cancelled',
    'invitation.accepted', 'invitation.password_activated', 'invitation.redirect_blocked',
    'invitation.revoked', 'invitation.expired',
    'role.changed', 'role.escalation_blocked',
    'guardian.student_link_created', 'guardian.student_link_removed',
    'driver.assignment_created', 'driver.assignment_removed',
    'student.record_accessed', 'data.exported',
    'tenant.suspended', 'tenant.reactivated', 'tenant.lifecycle_changed',
    'account.revoked', 'account.suspended', 'account.restored',
    'security.config_changed', 'rate_limit.exceeded', 'retention.deletion_run',
    'admin.invited', 'admin.activated', 'admin.deactivated',
    'admin.transferred', 'admin.recovered', 'admin.departed', 'admin.role_changed',
    'bulk_import.created', 'bulk_import.validated', 'bulk_import.committed',
    'bulk_import.rolled_back', 'bulk_import.invitations_queued', 'audit.searched',
    'billing.subscription_created', 'billing.subscription_updated',
    'billing.quantity_changed',
    'billing.cancellation_scheduled', 'billing.renewal_resumed',
    'billing.subscription_reconciled', 'billing.portal_opened'
  )
);

do $$
begin
  if to_regclass('safebus_private.tenant_subscription_projections') is null then
    raise exception 'Subscription projection table was not created.';
  end if;
  if to_regprocedure('public.get_tenant_subscription()') is null
    or to_regprocedure('public.get_platform_tenant_billing_detail(uuid)') is null
    or to_regprocedure('public.billing_upsert_customer_mapping(uuid,text,text,text,integer)') is null
    or to_regprocedure('public.billing_upsert_projection(uuid,text,text,text,text,text,text,integer,text,bigint,timestamp with time zone,timestamp with time zone,timestamp with time zone,boolean,timestamp with time zone,timestamp with time zone,text,text,integer,text,timestamp with time zone,timestamp with time zone)') is null then
    raise exception 'Subscription RPC surface is incomplete.';
  end if;
end
$$;

comment on table safebus_private.tenant_billing_accounts is
  'Server-only Stripe customer mapping and invoice contact metadata. Contains no payment methods.';
comment on table safebus_private.tenant_subscription_projections is
  'Server-maintained Stripe subscription projection for role-filtered SafeBus billing views.';
comment on function public.get_tenant_subscription() is
  'Returns the current tenant subscription projection only to an MFA-verified tenant administrator.';
comment on function public.get_platform_tenant_billing_detail(uuid) is
  'Returns one tenant billing projection only to an MFA-verified platform super administrator.';
