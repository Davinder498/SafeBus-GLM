// @vitest-environment node
// Embedded PostgreSQL only: no hosted credentials, fixtures, mail, or push.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { authorityImportSql } from '../../../../scripts/lib/authority-directory.mjs';

const read = (file) => readFile(resolve('../../', file), 'utf8');
const platform = '10000000-0000-4000-8000-000000000001';
const admin = '10000000-0000-4000-8000-000000000002';
const guardian = '10000000-0000-4000-8000-000000000003';
const driver = '10000000-0000-4000-8000-000000000004';
const otherAdmin = '10000000-0000-4000-8000-000000000005';
const tenant = '20000000-0000-4000-8000-000000000001';
const otherTenant = '20000000-0000-4000-8000-000000000002';
const contact = {
  displayName: 'Transportation office',
  email: 'transport@example.test',
  phone: '403-555-0100',
  websiteUrl: 'https://example.test',
  supportHours: null,
  instructions: null,
  address: '123 School Road\nCalgary AB T1A 1A1',
};
let db, originalFinalizer;

async function actor(id = platform, aal = 'aal2', recent = 'true', active = 'true') {
  await db.query(
    "select set_config('test.actor',$1,false),set_config('test.aal',$2,false),set_config('test.recent',$3,false),set_config('test.active',$4,false)",
    [id, aal, recent, active],
  );
}
async function asAuthenticated(sql, args = []) {
  await db.exec('set role authenticated');
  try {
    return await db.query(sql, args);
  } finally {
    await db.exec('reset role');
  }
}
async function search(query) {
  return (
    await asAuthenticated('select public.search_authority_reference_directory($1) as result', [
      query,
    ])
  ).rows[0].result;
}
async function finalize(code = '0009', support = contact, confirmed = true) {
  const id = crypto.randomUUID();
  await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${id}@example.test`]);
  return (
    await asAuthenticated(
      'select public.platform_finalize_tenant_invitation_v2($1,$2,$3,$4,$5,$6,$7,$8) as result',
      [
        id,
        'User-supplied alias',
        'school_group',
        'Explicitly chosen admin',
        `${id}@example.test`,
        code,
        support,
        confirmed,
      ],
    )
  ).rows[0].result;
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema safebus_private;
    create type public.user_role as enum('platform_super_admin','tenant_admin','school_admin','transportation_admin','guardian','driver');
    create table auth.users(id uuid primary key,email text);
    create table public.tenants(id uuid primary key default gen_random_uuid(),name text not null,type text default 'school_group',status text default 'active');
    create table public.profiles(id uuid primary key,tenant_id uuid references public.tenants,school_id uuid,full_name text,email text,role public.user_role,status text);
    create table public.tenant_onboarding_invitations(id uuid default gen_random_uuid(),tenant_id uuid,email text,full_name text,role public.user_role,status text,invited_profile_id uuid,invited_by_profile_id uuid,last_sent_at timestamptz);
    create table public.tenant_support_contacts(tenant_id uuid primary key references public.tenants,display_name text not null,email text not null,phone text,website_url text,support_hours text,instructions text,updated_by uuid,updated_at timestamptz default now());
    create table public.platform_support_contacts(id boolean primary key,display_name text,email text,phone text,website_url text,support_hours text,instructions text,updated_at timestamptz default now());
    alter table public.tenant_support_contacts enable row level security;
    create table public.audit_events(actor uuid,action text,entity_id uuid,detail jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    create function safebus_private.current_user_role() returns public.user_role language sql stable as $$ select p.role from public.profiles p left join public.tenants t on t.id=p.tenant_id where p.id=auth.uid() and p.status='active' and (p.tenant_id is null or t.status='active') $$;
    create function safebus_private.current_tenant_id() returns uuid language sql stable as $$ select tenant_id from public.profiles where id=auth.uid() and status='active' $$;
    create function safebus_private.is_platform_super_admin() returns boolean language sql stable as $$ select safebus_private.current_user_role()='platform_super_admin' $$;
    create function public.is_current_user_session_active() returns boolean language sql stable as $$ select current_setting('test.active',true)='true' $$;
    create function safebus_private.enforce_mfa_if_required() returns void language plpgsql as $$ begin if current_setting('test.aal',true) is distinct from 'aal2' then raise exception 'MFA required' using errcode='55006'; end if; end $$;
    create function safebus_private.enforce_recent_auth_for_sensitive_action() returns void language plpgsql as $$ begin if current_setting('test.recent',true) is distinct from 'true' then raise exception 'Recent authentication required' using errcode='55006'; end if; end $$;
    create function safebus_private.phase5_write_audit_event(uuid,text,text,uuid,text,jsonb) returns void language sql as $$ insert into public.audit_events values($1,$2,$4,$6) $$;
    insert into public.tenants(id,name) values('${tenant}','Existing authority'),('${otherTenant}','Other authority');
    insert into public.profiles(id,tenant_id,email,role,status) values
      ('${platform}',null,'platform@example.test','platform_super_admin','active'),
      ('${admin}','${tenant}','admin@example.test','tenant_admin','active'),
      ('${guardian}','${tenant}','guardian@example.test','guardian','active'),
      ('${driver}','${tenant}','driver@example.test','driver','active'),
      ('${otherAdmin}','${otherTenant}','other@example.test','tenant_admin','active');
    insert into public.platform_support_contacts(id,display_name,email) values(true,'Platform fallback','platform@example.test');
    insert into public.tenant_support_contacts(tenant_id,display_name,email) values('${tenant}','Existing office','existing@example.test');
  `);
  const snapshot = JSON.parse(
    await read('docs/qa/authority-directory-hosted-schema-2026-10-25.json'),
  );
  for (const fn of snapshot.functions) await db.exec(fn.definition);
  originalFinalizer = (
    await db.query(
      "select pg_get_functiondef('public.platform_finalize_tenant_invitation(uuid,text,text,text,text,text,text)'::regprocedure) as definition",
    )
  ).rows[0].definition;
  const migration = await read(
    'supabase/migrations/pending/20261025155815_authority_reference_directory.sql',
  );
  const initialImport = await read(
    'supabase/migrations/pending/20261025160733_alberta_authority_reference_import.sql',
  );
  // Bounded rehearsal of the real prepared DDL and all 445 reference records.
  await db.exec('begin');
  await db.exec(migration);
  await db.exec(initialImport);
  expect(
    (
      await db.query(
        'select count(*)::int as count from safebus_private.authority_reference_directory',
      )
    ).rows[0].count,
  ).toBe(445);
  await db.exec('rollback');
  expect(
    (
      await db.query(
        "select to_regclass('safebus_private.authority_reference_directory') as relation",
      )
    ).rows[0].relation,
  ).toBeNull();
  expect((await db.query('select count(*)::int as count from public.tenants')).rows[0].count).toBe(
    2,
  );
  await db.exec('begin');
  await db.exec(migration);
  await db.exec(initialImport);
  await db.exec('commit');
  await actor();
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe('authority directory and support in PostgreSQL', () => {
  it('preserves the existing finalizer and keeps reference data separate from accounts', async () => {
    expect(
      (
        await db.query(
          "select pg_get_functiondef('public.platform_finalize_tenant_invitation(uuid,text,text,text,text,text,text)'::regprocedure) as definition",
        )
      ).rows[0].definition,
    ).toBe(originalFinalizer);
    expect(
      (await db.query('select count(*)::int as count from public.tenants')).rows[0].count,
    ).toBe(2);
    expect((await search('0009'))[0].authorityCode).toBe('0009');
    expect((await search('calgary')).length).toBeGreaterThan(0);
    expect((await search('FOUNDATIONS'))[0].officialName).toContain('Foundations for the Future');
    expect(await search('%_')).toEqual([]);
  });
  it.each([admin, guardian, driver, otherAdmin])(
    'rejects search by a non-platform actor %s',
    async (id) => {
      await actor(id);
      await expect(search('school')).rejects.toMatchObject({ code: '42501' });
      await actor();
    },
  );
  it('rejects anonymous/table access and expired, unverified or inactive platform sessions', async () => {
    await expect(
      asAuthenticated('select * from safebus_private.authority_reference_directory'),
    ).rejects.toMatchObject({ code: '42501' });
    await db.exec('set role anon');
    await expect(
      db.query("select public.search_authority_reference_directory('school')"),
    ).rejects.toMatchObject({ code: '42501' });
    await db.exec('reset role');
    await db.exec('set role service_role');
    await expect(
      db.query("select public.search_authority_reference_directory('school')"),
    ).rejects.toMatchObject({ code: '42501' });
    await db.exec('reset role');
    await actor(platform, 'aal1');
    await expect(search('school')).rejects.toMatchObject({ code: '55006' });
    await actor(platform, 'aal2', 'true', 'false');
    await expect(search('school')).rejects.toMatchObject({ code: '42501' });
    await db.query("update public.profiles set status='suspended' where id=$1", [platform]);
    await actor();
    await expect(search('school')).rejects.toMatchObject({ code: '42501' });
    await db.query("update public.profiles set status='active' where id=$1", [platform]);
    await actor();
  });
  it('requires confirmation and recent authentication before accepting support details', async () => {
    await expect(finalize(null, contact, false)).rejects.toMatchObject({ code: '22023' });
    await actor(platform, 'aal2', 'false');
    await expect(finalize()).rejects.toMatchObject({ code: '55006' });
    await actor();
    await expect(finalize(null, { ...contact, email: 'bad-address' })).rejects.toMatchObject({
      code: '22023',
    });
    await expect(
      finalize(null, { ...contact, websiteUrl: 'javascript:bad' }),
    ).rejects.toMatchObject({ code: '22023' });
  });
  it('atomically provisions the association and reviewed support, with a separately chosen admin', async () => {
    const result = await finalize();
    const id = result.tenant.id;
    expect(result.tenant.name).toBe(
      'Foundations for the Future Charter Academy Charter School Society',
    );
    const row = (
      await db.query(
        'select t.authority_code,s.email,s.address,p.email as admin_email from public.tenants t join public.tenant_support_contacts s on s.tenant_id=t.id join public.profiles p on p.tenant_id=t.id where t.id=$1',
        [id],
      )
    ).rows[0];
    expect(row).toMatchObject({
      authority_code: '0009',
      email: contact.email,
      address: contact.address,
    });
    expect(row.admin_email).not.toBe(row.email);
    expect((await search('0009'))[0].alreadyLinked).toBe(true);
    await expect(finalize()).rejects.toMatchObject({ code: '23505' });
    await expect(
      db.query("insert into public.tenants(name,authority_code) values('Duplicate','0009')"),
    ).rejects.toMatchObject({ code: '23505' });
  });
  it('rolls back the tenant, profile and invitation when support persistence fails', async () => {
    const before = (await db.query('select count(*)::int as count from public.tenants')).rows[0]
      .count;
    await db.exec(`create function safebus_private.fail_support_fixture() returns trigger language plpgsql as $$ begin if new.display_name='Fail transaction' then raise exception 'Synthetic persistence failure'; end if; return new; end $$;
      create trigger fail_support_fixture before insert on public.tenant_support_contacts for each row execute function safebus_private.fail_support_fixture();`);
    await expect(finalize('0010', { ...contact, displayName: 'Fail transaction' })).rejects.toThrow(
      'Synthetic persistence failure',
    );
    expect(
      (await db.query('select count(*)::int as count from public.tenants')).rows[0].count,
    ).toBe(before);
    expect(
      (
        await db.query(
          "select count(*)::int as count from public.profiles where full_name='Explicitly chosen admin'",
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (await db.query('select count(*)::int as count from public.tenant_onboarding_invitations'))
        .rows[0].count,
    ).toBe(1);
  });
  it('keeps support reads scoped, supports address editing, and preserves addresses for legacy writers', async () => {
    await actor(admin);
    await asAuthenticated('select public.update_tenant_support_contact_v2($1,$2,$3,$4,$5,$6,$7)', [
      contact.displayName,
      contact.email,
      null,
      null,
      null,
      null,
      contact.address,
    ]);
    await asAuthenticated('select public.update_tenant_support_contact($1,$2,$3,$4,$5,$6)', [
      'Updated office',
      contact.email,
      null,
      null,
      null,
      null,
    ]);
    for (const id of [admin, guardian, driver]) {
      await actor(id);
      expect(
        (await asAuthenticated('select public.get_support_directory_v2() as result')).rows[0].result
          .tenant,
      ).toMatchObject({ displayName: 'Updated office', address: contact.address });
    }
    await expect(
      asAuthenticated('select public.update_tenant_support_contact_v2($1,$2,$3,$4,$5,$6,$7)', [
        contact.displayName,
        contact.email,
        null,
        null,
        null,
        null,
        'Wrong scope',
      ]),
    ).rejects.toMatchObject({ code: '42501' });
    await actor(otherAdmin);
    expect(
      (await asAuthenticated('select public.get_support_directory_v2() as result')).rows[0].result
        .tenant,
    ).toBeNull();
    await actor(platform);
    expect(
      (await asAuthenticated('select public.get_support_directory_v2() as result')).rows[0].result
        .tenant,
    ).toBeNull();
    const fallbackGuardian = '10000000-0000-4000-8000-000000000006';
    await db.query(
      "insert into public.profiles(id,tenant_id,role,status) values($1,$2,'guardian','active')",
      [fallbackGuardian, otherTenant],
    );
    await actor(fallbackGuardian);
    expect(
      (await asAuthenticated('select public.get_support_directory_v2() as result')).rows[0].result
        .tenant,
    ).toMatchObject({ displayName: 'Platform fallback', address: null });
    await actor(admin);
    await asAuthenticated('select public.update_tenant_support_contact_v2($1,$2,$3,$4,$5,$6,$7)', [
      contact.displayName,
      contact.email,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(
      (await asAuthenticated('select public.get_support_directory_v2() as result')).rows[0].result
        .tenant.address,
    ).toBeNull();
    await actor();
  });
  it('allows manually entered authorities without creating a reference association', async () => {
    await actor();
    const result = await finalize(null);
    expect(
      (await db.query('select authority_code from public.tenants where id=$1', [result.tenant.id]))
        .rows[0].authority_code,
    ).toBeNull();
    expect(
      (
        await db.query('select address from public.tenant_support_contacts where tenant_id=$1', [
          result.tenant.id,
        ])
      ).rows[0].address,
    ).toBe(contact.address);
  });
  it('refreshes only reference data, retains withdrawn records and rejects a stale import baseline', async () => {
    const state = (
      await db.query('select source_sha256 from safebus_private.authority_directory_import_state')
    ).rows[0];
    const row = (
      await db.query(
        "select * from safebus_private.authority_reference_directory where authority_code='0010'",
      )
    ).rows[0];
    row.source_extract_date = new Date(row.source_extract_date).toISOString().slice(0, 10);
    delete row.imported_at;
    row.official_name = 'Updated reference name';
    await db.exec('begin');
    const sql = authorityImportSql({
      records: [row],
      sourceSha256: 'a'.repeat(64),
      previousSha256: state.source_sha256,
    });
    await db.exec(sql);
    await db.exec('commit');
    expect(
      (
        await db.query(
          "select available from safebus_private.authority_reference_directory where authority_code='0009'",
        )
      ).rows[0].available,
    ).toBe(false);
    expect(
      (await db.query("select name from public.tenants where authority_code='0009'")).rows[0].name,
    ).toContain('Foundations for the Future');
    expect(
      (
        await db.query(
          "select email from public.tenant_support_contacts where tenant_id=(select id from public.tenants where authority_code='0009')",
        )
      ).rows[0].email,
    ).toBe(contact.email);
    await expect(finalize('0009')).rejects.toMatchObject({ code: '22023' });
    await expect(db.exec(sql)).rejects.toThrow('Directory baseline changed');
  });
});
