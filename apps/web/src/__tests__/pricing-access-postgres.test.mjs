// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

// All identities and writes below are synthetic in-memory PostgreSQL fixtures.
// No hosted connection, credentials, email provider, or notification trigger.
const tenant = 'e19ab3b1-8346-4779-9fdb-46de90081a07';
const second = '49410f95-38da-4eed-aaef-c6b6b98e9a7c';
const ordinary = '10000000-0000-4000-8000-000000000001';
const actor = '20000000-0000-4000-8000-000000000001';
const otherActor = '20000000-0000-4000-8000-000000000002';
const request = '30000000-0000-4000-8000-000000000001';
const otherRequest = '30000000-0000-4000-8000-000000000002';
const hash = 'a'.repeat(64);
let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema safebus_private;
    create table public.tenants(id uuid primary key,name text,type text,status text,created_at timestamptz default now());
    create table public.profiles(id uuid primary key,tenant_id uuid,email text,role text,status text,created_at timestamptz default now());
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
    create table public.buses(id uuid primary key default gen_random_uuid(),tenant_id uuid,status text,bus_number text);
    create table public.audit_events(action text,detail jsonb);
    create table auth.sessions(id uuid primary key,user_id uuid);
    create table public.tenant_onboarding_invitations(id uuid primary key default gen_random_uuid(),tenant_id uuid,email text,full_name text,role text,status text,invited_profile_id uuid,invited_by_profile_id uuid,last_sent_at timestamptz,expires_at timestamptz,delivery_status text,created_at timestamptz default now());
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
    create function public.current_user_role() returns text language sql as $$ select current_setting('test.role',true); $$;
    create function public.current_tenant_id() returns uuid language sql as $$ select nullif(current_setting('test.tenant',true),'')::uuid; $$;
    create function public.is_platform_super_admin() returns boolean language sql as $$ select coalesce(public.current_user_role()='platform_super_admin',false); $$;
    create function public.has_verified_mfa() returns boolean language sql as $$ select coalesce(current_setting('test.mfa',true)='true',false); $$;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid; $$;
    create function public.write_server_audit_event(uuid,text,text,uuid,text,jsonb) returns uuid language plpgsql as $$
      begin insert into public.audit_events(action,detail) values($2,$6); return gen_random_uuid(); end; $$;
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
  await db.exec(
    await readFile(
      resolve(
        '../../supabase/migrations/pending/20261016173613_tenant_self_service_subscriptions.sql',
      ),
      'utf8',
    ),
  );
  await db.exec(`
    insert into public.tenants(id,name,type,status) values
      ('${tenant}','Synthetic test tenant one','school','active'),('${second}','Synthetic test tenant two','school','active'),('${ordinary}','Ordinary synthetic tenant','school','active');
    insert into public.profiles(id,tenant_id,email,role,status) values
      ('5ba7237a-7c29-4eb7-88d8-6e9a45189566','${tenant}','synthetic@example.test','tenant_admin','active'),
      ('6f1a03d0-034a-4aa4-9457-1c51138a8bea','${second}','synthetic@example.test','tenant_admin','active'),
      ('${actor}',null,'platform@example.test','platform_super_admin','active'),
      ('${otherActor}',null,'other-platform@example.test','platform_super_admin','active'),
      ('40000000-0000-4000-8000-000000000001','${ordinary}','synthetic@example.test','tenant_admin','active');
    insert into auth.users(id,email_confirmed_at) select id,now() from public.profiles;
  `);
  await db.exec(
    await readFile(
      resolve(
        '../../supabase/migrations/pending/20261016223500_pricing_catalog_and_test_tenants.sql',
      ),
      'utf8',
    ),
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec('delete from safebus_private.billing_catalog_operations;');
});
const sql = (statement, args = []) => db.query(statement, args);
async function asRole(role, statement, args = []) {
  await db.exec(`begin; set local role ${role};`);
  try {
    return await sql(statement, args);
  } finally {
    await db.exec('rollback;');
  }
}
const claim = (id = request, who = actor, digest = hash) =>
  sql('select public.billing_claim_catalog_operation($1,$2,$3,$4,$5) as result', [
    id,
    who,
    'create_price',
    digest,
    { action: 'create_price', unitAmount: 2500 },
  ]);
describe('approved test tenant access', () => {
  it('seeds exactly the two verified tenant identities, without subscriptions or repeated trials', async () => {
    expect(
      (
        await sql(
          'select tenant_id from safebus_private.tenant_subscription_exemptions order by tenant_id',
        )
      ).rows.map((r) => r.tenant_id),
    ).toEqual([second, tenant]);
    for (const id of [tenant, second]) {
      const access = (
        await sql('select safebus_private.bus_subscription_access($1) as access', [id])
      ).rows[0].access;
      expect(access).toMatchObject({ eligible: true, exempt: true, limit: null });
      await sql(
        "insert into public.buses(tenant_id,status) select $1,'active' from generate_series(1,12)",
        [id],
      );
      await sql("insert into public.buses(tenant_id,status) values($1,'inactive')", [id]);
      await sql("update public.buses set status='active' where tenant_id=$1", [id]);
      const view = (await sql('select safebus_private.subscription_view($1) as view', [id])).rows[0]
        .view;
      expect(view).toMatchObject({
        configured: false,
        subscription_exempt: true,
        trial_eligible: false,
        billing_warning: false,
      });
    }
    expect(
      (
        await sql(
          'select count(*)::integer as count from safebus_private.tenant_subscription_projections',
        )
      ).rows[0].count,
    ).toBe(0);
  });
  it('does not grant exemptions to another tenant with a copied profile email', async () => {
    expect(
      (await sql('select safebus_private.bus_subscription_access($1) as access', [ordinary]))
        .rows[0].access,
    ).toMatchObject({ eligible: false, exempt: false });
    await expect(
      sql("insert into public.buses(tenant_id,status) values($1,'inactive')", [ordinary]),
    ).rejects.toThrow('Start a subscription');
  });
  it('keeps suspension and tenant-transfer protection in force', async () => {
    await sql("update public.tenants set status='disabled' where id=$1", [tenant]);
    await expect(
      sql("insert into public.buses(tenant_id,status) values($1,'active')", [tenant]),
    ).rejects.toThrow('Start a subscription');
    await sql("update public.tenants set status='active' where id=$1", [tenant]);
    await expect(
      sql('update public.buses set tenant_id=$1 where tenant_id=$2', [ordinary, tenant]),
    ).rejects.toThrow('cannot be transferred');
  });
  it('retains paid capacity and overdue restrictions for ordinary tenants', async () => {
    await sql(`insert into safebus_private.tenant_billing_accounts(tenant_id,external_customer_id,billing_email)
      values($1,'cus_normal','billing@example.test')`,[ordinary]);
    await sql(`insert into safebus_private.tenant_subscription_projections(tenant_id,external_subscription_id,external_price_id,product_name,status,licensed_bus_count,currency,unit_amount,current_period_end,provider_event_created_at,collection_method,has_payment_method,paid_through)
      values($1,'sub_normal','price_normal','SafeBus','active',1,'cad',2500,now()+interval '1 month',now(),'charge_automatically',true,now()+interval '1 month')`,[ordinary]);
    await sql("insert into public.buses(tenant_id,status) values($1,'active'),($1,'inactive')",[ordinary]);
    await expect(sql("update public.buses set status='active' where tenant_id=$1 and status='inactive'",[ordinary])).rejects.toThrow('allowance is full');
    await sql("update safebus_private.tenant_subscription_projections set status='past_due' where tenant_id=$1",[ordinary]);
    await sql("update public.buses set bus_number='Maintenance allowed' where tenant_id=$1",[ordinary]);
    await expect(sql("insert into public.buses(tenant_id,status) values($1,'inactive')",[ordinary])).rejects.toThrow('Start a subscription');
  });
  it('keeps private exemptions and catalog records unavailable to clients, including service-role table writes', async () => {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      await expect(
        asRole(role, 'select * from safebus_private.tenant_subscription_exemptions'),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asRole(role, 'select * from safebus_private.billing_catalog_operations'),
      ).rejects.toThrow(/permission denied/);
    }
    for (const role of ['anon', 'authenticated'])
      await expect(
        asRole(role, 'select public.billing_get_pending_catalog_operation($1)', [actor]),
      ).rejects.toThrow(/permission denied/);
  });
});
describe('durable catalog mutation ledger', () => {
  it('rejects tenant actors and changed ownership or request payloads', async () => {
    await expect(claim(request, '40000000-0000-4000-8000-000000000001')).rejects.toThrow(
      'billing_catalog_forbidden',
    );
    await claim();
    await expect(claim(request, otherActor)).rejects.toThrow('billing_request_conflict');
    await expect(claim(request, actor, 'b'.repeat(64))).rejects.toThrow('billing_request_conflict');
  });
  it('serializes concurrent claims and recovers only the original actor request', async () => {
    const results = await Promise.allSettled([claim(), claim(otherRequest)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const pending = (
      await sql('select public.billing_get_pending_catalog_operation($1) as pending', [actor])
    ).rows[0].pending;
    expect(pending).toMatchObject({
      requestId: request,
      body: { action: 'create_price', unitAmount: 2500 },
    });
    expect(
      (
        await sql('select public.billing_get_pending_catalog_operation($1) as pending', [
          otherActor,
        ])
      ).rows[0].pending,
    ).toBeNull();
    await expect(claim()).rejects.toThrow('billing_operation_busy');
    await sql(
      "update safebus_private.billing_catalog_operations set lease_until=now()-interval '1 second'",
    );
    expect((await claim()).rows[0].result.replayed).toBe(false);
  });
  it('atomically audits and replays completion exactly once', async () => {
    await claim();
    const countBefore = (
      await sql(
        "select count(*)::integer as count from public.audit_events where action='security.config_changed'",
      )
    ).rows[0].count;
    const finish = () =>
      sql('select public.billing_finish_catalog_operation($1,$2,$3)', [
        request,
        actor,
        { id: 'price_synthetic' },
      ]);
    await finish();
    await finish();
    expect((await claim()).rows[0].result).toEqual({
      replayed: true,
      response: { id: 'price_synthetic' },
    });
    expect(
      (
        await sql(
          "select count(*)::integer as count from public.audit_events where action='security.config_changed'",
        )
      ).rows[0].count,
    ).toBe(countBefore + 1);
    expect(
      (await sql('select public.billing_get_pending_catalog_operation($1) as pending', [actor]))
        .rows[0].pending,
    ).toBeNull();
  });
});
