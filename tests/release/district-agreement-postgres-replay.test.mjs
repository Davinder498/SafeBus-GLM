import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// All work is performed on embedded, isolated Postgres. Never connects to production.
const IDS = {
  platform: '00000000-0000-4000-8000-000000000001',
  first: '00000000-0000-4000-8000-000000000002',
  second: '00000000-0000-4000-8000-000000000003',
  guardian: '00000000-0000-4000-8000-000000000004',
  legacy: '00000000-0000-4000-8000-000000000101',
  tenant1: '00000000-0000-4000-8000-000000000102',
  tenant2: '00000000-0000-4000-8000-000000000103',
};
const kinds = ['msa','dpa','order_form','security','sla','acceptable_use','data_return','suppliers'];

test('district MSA/DPA migration: isolated Postgres replay, clickwrap, scoped receipts and legacy preservation', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const one = async (q, p=[]) => (await db.query(q,p)).rows[0];
  const asUser = async (id) => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    await db.query("select set_config('request.jwt.claims',$1,false)",[
      JSON.stringify({sub:id,aal:'aal2',session_id:'00000000-0000-4000-8000-000000001111'}),
    ]);
  };

  await db.exec([
    'create role anon;',
    'create role authenticated;',
    'create role service_role;',
    'create schema auth;',
    'create schema safebus_private;',
    'create table auth.users(id uuid primary key);',
    "create table public.tenants(id uuid primary key, name text not null, status text not null default 'active');",
    "create table public.profiles(id uuid primary key references auth.users(id), tenant_id uuid references public.tenants(id), role text not null, status text not null default 'active', full_name text not null,email text not null);",
    'create table public.buses(id uuid primary key,tenant_id uuid not null references public.tenants(id));',
    'create table public.students(id uuid primary key,tenant_id uuid not null references public.tenants(id));',
    "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
    "create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;",
    "create function public.is_current_user_session_active() returns boolean language sql stable as $$select auth.uid() is not null$$;",
    "insert into auth.users(id) values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004');",
    "insert into public.tenants(id,name) values ('00000000-0000-4000-8000-000000000101','Pre-existing school district');",
    "insert into public.profiles(id,tenant_id,role,full_name,email) values ('00000000-0000-4000-8000-000000000001',null,'platform_super_admin','Owner','owner@example.test');",
  ].join('\n'));
  const sql = await readFile('supabase/migrations/pending/20261107121500_district_agreement_workflow.sql','utf8');
  assert.match(sql,/create function public.accept_my_district_agreement/);
  await db.exec(sql);

  assert.equal((await one('select count(*)::int n from safebus_private.agreement_document_versions')).n,0);
  assert.equal((await one('select count(*)::int n from safebus_private.tenant_agreement_requirement')).n,0);
  assert.equal((await one('select public.district_agreement_billing_allowed($1::uuid) allowed',[IDS.legacy])).allowed,true);
  assert.equal((await one("select has_function_privilege('anon','public.accept_my_district_agreement(uuid,text,text,text,boolean,boolean,boolean)','EXECUTE') allowed")).allowed,false);

  await db.query('insert into public.tenants(id,name) values ($1,$2),($3,$4)',[
    IDS.tenant1,'Synthetic District One',IDS.tenant2,'Synthetic District Two',
  ]);
  await db.query("insert into public.profiles(id,tenant_id,role,full_name,email) values ($1,$2,'tenant_admin','First Admin','one@example.test'),($3,$4,'tenant_admin','Second Admin','two@example.test'),($5,$6,'guardian','Guardian','guardian@example.test')",[
    IDS.first,IDS.tenant1,IDS.second,IDS.tenant2,IDS.guardian,IDS.tenant1,
  ]);
  assert.equal((await one('select count(*)::int n from safebus_private.tenant_agreement_requirement')).n,2);
  assert.equal((await one('select public.district_agreement_billing_allowed($1::uuid) allowed',[IDS.tenant1])).allowed,false);
  await assert.rejects(db.query('insert into public.buses(id,tenant_id) values ($1,$2)',[
    '00000000-0000-4000-8000-000000000201',IDS.tenant1,
  ]),/Accept the SafeBus MSA/i);
  await db.query('insert into public.buses(id,tenant_id) values ($1,$2)',[
    '00000000-0000-4000-8000-000000000202',IDS.legacy,
  ]);

  await asUser(IDS.platform);
  for(const kind of kinds){
    const result=await one('select public.platform_publish_agreement_document($1,$2,$3,$4) doc',[
      kind,'Synthetic '+kind+' version','2026.1',
      'Synthetic isolated test contract. Not offered to a real district. '.repeat(4),
    ]);
    assert.equal(result.doc.kind,kind);
  }
  const ids=(await db.query('select id from safebus_private.agreement_document_versions order by kind')).rows.map(r=>r.id);
  const catalog=await one('select public.platform_publish_agreement_catalog($1::uuid[]) result',[
    '{'+ids.join(',')+'}',
  ]);
  assert.equal(catalog.result.revision,1);

  await asUser(IDS.first);
  const pkg=(await one('select public.get_my_district_agreement() a')).a;
  assert.equal(pkg.status,'issued');
  assert.equal(pkg.documents.length,8);
  await asUser(IDS.guardian);
  await assert.rejects(one('select public.get_my_district_agreement() a'),/role cannot|cannot manage/i);

  await asUser(IDS.first);
  const accept=(attest)=>one('select public.accept_my_district_agreement($1::uuid,$2,$3,$4,$5::boolean,$6::boolean,$7::boolean) result',[
    pkg.id,pkg.bundle_sha256,'First Admin','Transportation Director',true,attest,true,
  ]);
  await assert.rejects(accept(false),/authority|consent/i);
  const result=(await accept(true)).result;
  assert.equal(result.status,'executed');
  assert.ok(result.receipt_id);
  assert.equal((await accept(true)).result.replayed,true);
  assert.equal((await one('select public.district_agreement_billing_allowed($1::uuid) allowed',[IDS.tenant1])).allowed,true);
  const receipt=(await one('select public.get_my_district_agreement_receipt($1::uuid) result',[result.receipt_id])).result;
  assert.equal(receipt.document_snapshot.documents.length,8);
  assert.equal(receipt.document_snapshot.customer,'Synthetic District One');
  await db.query('insert into public.students(id,tenant_id) values ($1,$2)',[
    '00000000-0000-4000-8000-000000000301',IDS.tenant1,
  ]);

  await asUser(IDS.second);
  await assert.rejects(one('select public.get_my_district_agreement_receipt($1::uuid) result',[result.receipt_id]),/not found/i);
  assert.equal((await one('select public.district_agreement_billing_allowed($1::uuid) allowed',[IDS.tenant2])).allowed,false);
  const other=(await one('select public.get_my_district_agreement() a')).a;
  assert.equal(other.status,'issued');
  assert.notEqual(other.bundle_sha256,pkg.bundle_sha256);
});
