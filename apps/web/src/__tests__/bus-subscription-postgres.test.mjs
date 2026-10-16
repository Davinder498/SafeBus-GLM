// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Entire forward migration runs only in this in-memory PostgreSQL process.
// Minimal synthetic baseline; no network, hosted credentials, or notification triggers.
const tenant = '10000000-0000-4000-8000-000000000001';
const actor = '20000000-0000-4000-8000-000000000001';
const request = '30000000-0000-4000-8000-000000000001';
let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema safebus_private;
    create table public.tenants(id uuid primary key,name text,type text,status text,created_at timestamptz default now());
    create table public.profiles(id uuid primary key,tenant_id uuid,role text,status text,created_at timestamptz default now());
    create table public.buses(id uuid primary key default gen_random_uuid(),tenant_id uuid,status text,bus_number text);
    create table public.audit_events(action text);
    create table auth.sessions(id uuid primary key,user_id uuid);
    create table public.tenant_onboarding_invitations(id uuid primary key default gen_random_uuid(),tenant_id uuid,email text,full_name text,role text,status text,invited_profile_id uuid,invited_by_profile_id uuid,last_sent_at timestamptz,expires_at timestamptz,delivery_status text,created_at timestamptz default now());
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
    create function public.current_user_role() returns text language sql as $$ select current_setting('test.role',true); $$;
    create function public.current_tenant_id() returns uuid language sql as $$ select nullif(current_setting('test.tenant',true),'')::uuid; $$;
    create function public.is_platform_super_admin() returns boolean language sql as $$ select coalesce(public.current_user_role()='platform_super_admin',false); $$;
    create function public.has_verified_mfa() returns boolean language sql as $$ select coalesce(current_setting('test.mfa',true)='true',false); $$;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid; $$;
  `);
  const original = await readFile(
    resolve('../../supabase/migrations/0099_annual_per_bus_subscription_management.sql'),
    'utf8',
  );
  await db.exec(
    original.slice(original.indexOf('create table safebus_private.tenant_billing_accounts')),
  );
  await db.exec(`create function safebus_private.current_user_role() returns text language sql as $$ select public.current_user_role(); $$;
    create function safebus_private.current_tenant_id() returns uuid language sql as $$ select public.current_tenant_id(); $$;
    create function safebus_private.has_verified_mfa() returns boolean language sql as $$ select public.has_verified_mfa(); $$;
    create function safebus_private.is_platform_super_admin() returns boolean language sql as $$ select public.is_platform_super_admin(); $$;`);
  const migration = await readFile(
    resolve(
      '../../supabase/migrations/pending/20261016173613_tenant_self_service_subscriptions.sql',
    ),
    'utf8',
  );
  await db.exec(migration);
  await db.exec(
    `insert into public.tenants(id,name,type,status) values('${tenant}','Synthetic Transit','school','active'); insert into public.profiles(id,tenant_id,role,status) values('${actor}','${tenant}','tenant_admin','active')`,
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});

async function sql(statement, args = []) {
  return db.query(statement, args);
}
async function projection(status = 'active', quantity = 2) {
  await sql(
    `insert into safebus_private.tenant_billing_accounts(tenant_id,external_customer_id,billing_email) values($1,'cus_synthetic','billing@example.test') on conflict do nothing`,
    [tenant],
  );
  await sql(
    `insert into safebus_private.tenant_subscription_projections(tenant_id,external_subscription_id,external_price_id,product_name,status,licensed_bus_count,currency,unit_amount,current_period_end,provider_event_created_at,collection_method,has_payment_method,latest_invoice_status,paid_through)
    values($1,'sub_synthetic','price_synthetic','SafeBus',$2,$3,'cad',1000,now()+interval '1 month',now(),'charge_automatically',true,'paid',now()+interval '1 month')
    on conflict(tenant_id) do update set status=$2,licensed_bus_count=$3,pending_change=null,trial_end=now()+interval '14 days',current_period_end=now()+interval '1 month',latest_invoice_status='paid',has_payment_method=true,collection_method='charge_automatically',paid_through=now()+interval '1 month'`,
    [tenant, status, quantity],
  );
}
describe('bus subscription enforcement in PostgreSQL', () => {
  it('rejects all inserts without a subscription, including inactive buses', async () => {
    await expect(
      sql(`insert into public.buses(tenant_id,status) values($1,'inactive')`, [tenant]),
    ).rejects.toThrow('Start a subscription');
  });
  it('counts only active buses and protects multiple-row and parallel requests', async () => {
    await projection();
    await sql(`insert into public.buses(tenant_id,status) values($1,'active'),($1,'inactive')`, [
      tenant,
    ]);
    const results = await Promise.allSettled([
      sql(`insert into public.buses(tenant_id,status) values($1,'active')`, [tenant]),
      sql(`insert into public.buses(tenant_id,status) values($1,'active')`, [tenant]),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(
      sql(`update public.buses set status='active' where status='inactive'`),
    ).rejects.toThrow('allowance is full');
    await sql(`delete from public.buses`);
    await expect(
      sql(
        `insert into public.buses(tenant_id,status) values($1,'active'),($1,'active'),($1,'active')`,
        [tenant],
      ),
    ).rejects.toThrow('allowance is full');
    expect((await sql(`select count(*)::integer as count from public.buses`)).rows[0].count).toBe(
      0,
    );
  });
  it('keeps existing bus edits/deactivation possible when overdue; blocks creation/activation', async () => {
    await projection();
    await sql(`insert into public.buses(tenant_id,status) values($1,'active')`, [tenant]);
    await projection('past_due');
    await sql(`update public.buses set bus_number='Existing'`);
    await sql(`update public.buses set status='inactive'`);
    await expect(sql(`update public.buses set status='active'`)).rejects.toThrow(
      'Start a subscription',
    );
    await expect(
      sql(`insert into public.buses(tenant_id,status) values($1,'inactive')`, [tenant]),
    ).rejects.toThrow('Start a subscription');
  });
  it('requires payment confirmation or a dated trial with a payment method', async () => {
    await projection();
    await sql(
      `update safebus_private.tenant_subscription_projections set latest_invoice_status='open',paid_through=null`,
    );
    await expect(
      sql(`insert into public.buses(tenant_id,status) values($1,'active')`, [tenant]),
    ).rejects.toThrow('Start a subscription');
    await projection('trialing');
    await sql(`insert into public.buses(tenant_id,status) values($1,'active')`, [tenant]);
    await sql(
      `update safebus_private.tenant_subscription_projections set trial_end=now()-interval '1 second'`,
    );
    await expect(
      sql(`insert into public.buses(tenant_id,status) values($1,'inactive')`, [tenant]),
    ).rejects.toThrow('Start a subscription');
  });
  it('reserves scheduled reductions and disallows cross-tenant moves', async () => {
    await projection();
    await sql(`delete from public.buses`);
    await sql(`insert into public.buses(tenant_id,status) values($1,'active')`, [tenant]);
    await sql(
      `update safebus_private.tenant_subscription_projections set pending_change='{"quantity":1}'`,
    );
    await expect(
      sql(`insert into public.buses(tenant_id,status) values($1,'active')`, [tenant]),
    ).rejects.toThrow('allowance is full');
    await expect(sql(`update public.buses set tenant_id=gen_random_uuid()`)).rejects.toThrow(
      'cannot be transferred',
    );
  });
  it('preserves existing invoice trials without granting payment-free self-service trials', async () => {
    await projection('trialing');
    await sql(
      `update safebus_private.tenant_subscription_projections set has_payment_method=false`,
    );
    await expect(
      sql(`insert into public.buses(tenant_id,status) values($1,'inactive')`, [tenant]),
    ).rejects.toThrow('Start a subscription');
    await sql(
      `update safebus_private.tenant_subscription_projections set collection_method='send_invoice'`,
    );
    await sql(`insert into public.buses(tenant_id,status) values($1,'inactive')`, [tenant]);
    await projection();
    await sql(
      `update safebus_private.tenant_subscription_projections set pending_change='{"quantity":1}'`,
    );
  });
  it('denies anonymous and unrelated role access and private server RPCs', async () => {
    await expect(sql(`select public.get_bus_subscription_access()`)).rejects.toThrow(
      'Tenant bus administrator',
    );
    await sql(`set role authenticated`);
    await expect(sql(`select public.billing_find_customer('cus_synthetic')`)).rejects.toThrow(
      'permission denied',
    );
    await sql(`reset role`);
    await sql(
      `select set_config('test.role','tenant_admin',false),set_config('test.tenant',$1,false),set_config('test.mfa','true',false)`,
      [tenant],
    );
    expect(
      (await sql(`select public.get_bus_subscription_access() as access`)).rows[0].access.limit,
    ).toBe(1);
  });
  it('serializes billing operations, rejects changed retries, and replays completed results', async () => {
    await sql(`select public.billing_claim_operation($1,$2,$3,'checkout',repeat('a',64))`, [
      tenant,
      request,
      actor,
    ]);
    await expect(
      sql(
        `select public.billing_claim_operation($1,gen_random_uuid(),$2,'checkout',repeat('a',64))`,
        [tenant, actor],
      ),
    ).rejects.toThrow('billing_operation_busy');
    await expect(
      sql(`select public.billing_claim_operation($1,$2,$3,'checkout',repeat('b',64))`, [
        tenant,
        request,
        actor,
      ]),
    ).rejects.toThrow('billing_request_conflict');
    await sql(`select public.billing_finish_operation($1,$2,'{"ok":true}')`, [tenant, request]);
    expect(
      (
        await sql(
          `select public.billing_claim_operation($1,$2,$3,'checkout',repeat('a',64)) as result`,
          [tenant, request, actor],
        )
      ).rows[0].result,
    ).toEqual({ replayed: true, response: { ok: true } });
  });
  it('atomically syncs payment access and ignores older or superseded subscription events', async () => {
    await projection('active', 3);
    const observed = new Date(Date.now() + 10000).toISOString();
    const end = new Date(Date.now() + 86400000).toISOString();
    const state = {
      tenant_id: tenant,
      customer_id: 'cus_synthetic',
      subscription_id: 'sub_synthetic',
      price_id: 'price_month',
      product_name: 'SafeBus',
      price_nickname: null,
      status: 'active',
      quantity: 3,
      currency: 'cad',
      unit_amount: 1000,
      interval: 'month',
      collection_method: 'charge_automatically',
      period_start: new Date().toISOString(),
      period_end: end,
      trial_end: null,
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
      billing_email: 'billing@example.test',
      purchase_order: null,
      days_until_due: 30,
      invoice_status: 'paid',
      invoice_due_at: null,
      has_payment_method: true,
      pending_change: null,
      pending_payment: false,
      observed_at: observed,
      paid_period_end: end,
    };
    expect(
      (
        await sql(`select public.billing_sync_subscription($1::jsonb) as applied`, [
          JSON.stringify(state),
        ])
      ).rows[0].applied,
    ).toBe(true);
    const summary = (await sql(`select safebus_private.subscription_view($1) as summary`, [tenant]))
      .rows[0].summary;
    expect(summary).toMatchObject({
      billing_interval: 'month',
      period_total: 3000,
      bus_access: { eligible: true, limit: 3 },
    });
    expect(
      (
        await sql(`select public.billing_sync_subscription($1::jsonb) as applied`, [
          JSON.stringify({ ...state, quantity: 1, observed_at: '2000-01-01T00:00:00Z' }),
        ])
      ).rows[0].applied,
    ).toBe(false);
    expect(
      (
        await sql(`select public.billing_sync_subscription($1::jsonb) as applied`, [
          JSON.stringify({ ...state, subscription_id: 'sub_old', status: 'canceled' }),
        ])
      ).rows[0].applied,
    ).toBe(false);
    await expect(
      sql(`select public.billing_sync_subscription($1::jsonb)`, [
        JSON.stringify({ ...state, customer_id: 'cus_other' }),
      ]),
    ).rejects.toThrow('billing_tenant_mapping_missing');
    // An unpaid upgrade must not erase the previously purchased term/allowance.
    await sql(`select public.billing_sync_subscription($1::jsonb)`, [
      JSON.stringify({
        ...state,
        invoice_status: 'open',
        paid_period_end: null,
        pending_payment: true,
        observed_at: new Date(Date.now() + 20000).toISOString(),
      }),
    ]);
    expect(
      (await sql(`select safebus_private.bus_subscription_access($1) as access`, [tenant])).rows[0]
        .access.eligible,
    ).toBe(true);
    // A new unpaid term must not inherit an old paid invoice's future date.
    await sql(
      `update safebus_private.tenant_subscription_projections set paid_through=now()-interval '1 second'`,
    );
    await sql(`select public.billing_sync_subscription($1::jsonb)`, [
      JSON.stringify({
        ...state,
        paid_period_end: '2000-01-01T00:00:00Z',
        observed_at: new Date(Date.now() + 30000).toISOString(),
      }),
    ]);
    expect(
      (await sql(`select safebus_private.bus_subscription_access($1) as access`, [tenant])).rows[0]
        .access.eligible,
    ).toBe(false);
  });
  it('reissues only expired first-admin invitations, preserving history and revoking old sessions', async () => {
    const invited = '40000000-0000-4000-8000-000000000001';
    const invitation = '50000000-0000-4000-8000-000000000001';
    await db.exec(`create function public.platform_is_first_admin_invitation(p_id uuid) returns boolean language sql as $$ select safebus_private.is_platform_super_admin() and safebus_private.has_verified_mfa(); $$;
      create function safebus_private.enforce_recent_auth_for_sensitive_action() returns void language plpgsql as $$ begin if current_setting('test.recent',true) is distinct from 'true' then raise exception 'Recent auth required'; end if; end; $$;
      create function safebus_private.revoke_all_user_sessions(p_id uuid) returns integer language plpgsql as $$ begin delete from auth.sessions where user_id=p_id; return 1; end; $$;
      insert into public.profiles(id,tenant_id,role,status) values('${invited}','${tenant}','tenant_admin','disabled');
      insert into public.tenant_onboarding_invitations(id,tenant_id,email,full_name,role,status,invited_profile_id) values('${invitation}','${tenant}','first@example.test','First Admin','tenant_admin','expired','${invited}');
      insert into auth.sessions(id,user_id) values(gen_random_uuid(),'${invited}');`);
    await expect(
      sql(`select public.platform_prepare_first_admin_reissue($1)`, [invitation]),
    ).rejects.toThrow('First administrator');
    await sql(`select set_config('test.role','platform_super_admin',false)`);
    await expect(
      sql(`select public.platform_prepare_first_admin_reissue($1)`, [invitation]),
    ).rejects.toThrow('Recent auth');
    await sql(`select set_config('test.recent','true',false)`);
    await sql(`select public.platform_prepare_first_admin_reissue($1)`, [invitation]);
    expect(
      (
        await sql(`select count(*)::integer as count from auth.sessions where user_id=$1`, [
          invited,
        ])
      ).rows[0].count,
    ).toBe(0);
    await sql(`select public.platform_finalize_first_admin_reissue($1)`, [invitation]);
    expect(
      (await sql(`select status from public.profiles where id=$1`, [invited])).rows[0].status,
    ).toBe('invited');
    expect(
      (
        await sql(
          `select status from public.tenant_onboarding_invitations where invited_profile_id=$1 order by created_at,id`,
          [invited],
        )
      ).rows.map((r) => r.status),
    ).toEqual(['expired', 'pending']);
    await expect(
      sql(`select public.platform_finalize_first_admin_reissue($1)`, [invitation]),
    ).rejects.toThrow('Expired invitation changed');
  });
  it('enforces every reviewed pending RPC audience in PostgreSQL', async () => {
    const surface = JSON.parse(
      await readFile(
        resolve('../../config/pending/tenant-subscription-authorization.json'),
        'utf8',
      ),
    );
    for (const signature of [...surface.authenticated, ...surface.serviceRole]) {
      const audience = surface.authenticated.includes(signature) ? 'authenticated' : 'service_role';
      expect(
        (
          await sql(`select has_function_privilege($1,$2,'execute') as allowed`, [
            audience,
            `public.${signature}`,
          ])
        ).rows[0].allowed,
      ).toBe(true);
      expect(
        (
          await sql(`select has_function_privilege('anon',$1,'execute') as allowed`, [
            `public.${signature}`,
          ])
        ).rows[0].allowed,
      ).toBe(false);
      if (audience === 'service_role')
        expect(
          (
            await sql(`select has_function_privilege('authenticated',$1,'execute') as allowed`, [
              `public.${signature}`,
            ])
          ).rows[0].allowed,
        ).toBe(false);
    }
  });
});
