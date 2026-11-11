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

  await t.test('order migration recovery restores the empty pre-publication schema', async () => {
    const { agreementOrderRecoverySql } = await import('../../scripts/lib/agreement-order-recovery.mjs');
    const { calculateSchemaFingerprint } = await import('../../scripts/lib/schema-fingerprint.mjs');
    const config=JSON.parse(await readFile('config/pending/agreement-order-snapshot.json','utf8'));
    const original=[];
    for(const f of config.functions){
      const r=await one('select pg_get_functiondef(oid) definition from pg_proc where oid=to_regprocedure($1)',[f.signature]);
      original.push({signature:f.signature,...r});
    }
    const fingerprint=await calculateSchemaFingerprint(db);
    await db.exec('begin');
    try {
      await db.exec(await readFile(config.migration,'utf8'));
      for(const f of config.functions){
        assert.equal((await one('select md5(pg_get_functiondef(oid)) md5 from pg_proc where oid=to_regprocedure($1)',[f.signature])).md5,f.after);
      }
      assert.notEqual(await calculateSchemaFingerprint(db),fingerprint);
      await db.exec(agreementOrderRecoverySql(original));
      assert.equal(await calculateSchemaFingerprint(db),fingerprint);
    } finally { await db.exec('rollback'); }
  });

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
  // Independently verify the forward-only participant agreement extension in
  // the same isolated PostgreSQL database, with no production accounts.
  const participantSql = await readFile(
    'supabase/migrations/pending/20261108130000_participant_terms_onboarding.sql', 'utf8',
  );
  await db.exec(participantSql);
  await asUser(IDS.guardian);
  assert.equal((await one('select public.get_my_participant_agreement() x')).x.required,false);

  const newDriver='00000000-0000-4000-8000-000000000005';
  await db.query('insert into auth.users(id) values ($1)',[newDriver]);
  await db.query("insert into public.profiles(id,tenant_id,role,full_name,email) values ($1,$2,'driver','New Driver','new-driver@example.test')",[
    newDriver,IDS.tenant1,
  ]);
  assert.equal((await one('select count(*)::int n from safebus_private.participant_agreement_requirements')).n,1);
  assert.equal((await one('select count(*)::int n from safebus_private.participant_agreement_acceptances')).n,0);
  await asUser(newDriver);
  const beforeTerms=(await one('select public.get_my_participant_agreement() x')).x;
  assert.equal(beforeTerms.required,true);
  assert.equal(beforeTerms.status,'not_published');

  assert.equal((await one("select has_function_privilege('anon','public.accept_my_participant_agreement(uuid,text,boolean,boolean)','EXECUTE') allowed")).allowed,false);
  await asUser(IDS.guardian);
  await assert.rejects(one('select public.platform_publish_participant_terms($1::uuid) x',[ids[0]]),/role cannot|cannot manage/i);

  await asUser(IDS.platform);
  const participantDoc=(await one("select id,sha256 from safebus_private.agreement_document_versions where kind='acceptable_use'")).id;
  const publish=(await one('select public.platform_publish_participant_terms($1::uuid) x',[participantDoc])).x;
  assert.equal(publish.published,true);
  await asUser(newDriver);
  const available=(await one('select public.get_my_participant_agreement() x')).x;
  assert.equal(available.required,true);
  assert.equal(available.status,'pending');
  assert.equal(available.terms.id,participantDoc);
  assert.equal(available.notice.url,'/privacy#drivers');

  const submit=(digest,terms,notice)=>one('select public.accept_my_participant_agreement($1::uuid,$2,$3::boolean,$4::boolean) x',[
    available.terms.id,digest,terms,notice,
  ]);
  await assert.rejects(submit(available.terms.sha256,true,false),/Review and affirm/i);
  await assert.rejects(submit('0'.repeat(64),true,true),/Terms changed/i);
  assert.equal((await submit(available.terms.sha256,true,true)).x.status,'accepted');
  assert.equal((await submit(available.terms.sha256,true,true)).x.replayed,true);
  const signed=(await one('select public.get_my_participant_agreement() x')).x;
  assert.equal(signed.status,'accepted');
  assert.equal((await one('select count(*)::int n from safebus_private.participant_agreement_acceptances')).n,1);
  await assert.rejects(db.query('update safebus_private.participant_agreement_acceptances set terms_snapshot=$1',[
    'tampered',
  ]),/immutable/i);

  // Changing a participant's role or school authority requires a new scoped receipt.
  await db.query("update public.profiles set role='guardian' where id=$1",[newDriver]);
  const asGuardian=(await one('select public.get_my_participant_agreement() x')).x;
  assert.equal(asGuardian.status,'pending');
  assert.equal(asGuardian.notice.url,'/privacy#guardians');
  assert.equal((await submit(asGuardian.terms.sha256,true,true)).x.status,'accepted');
  await db.query('update public.profiles set tenant_id=$1 where id=$2',[IDS.tenant2,newDriver]);
  const asOtherTenant=(await one('select public.get_my_participant_agreement() x')).x;
  assert.equal(asOtherTenant.status,'pending');
  assert.equal((await submit(asOtherTenant.terms.sha256,true,true)).x.status,'accepted');
  assert.equal((await one('select count(*)::int n from safebus_private.participant_agreement_acceptances')).n,3);

  await asUser(IDS.first);
  await assert.rejects(one('select public.get_my_participant_agreement() x'),/active driver or guardian/i);

  await t.test('supplier revisions require fresh acceptance and preserve historical receipts', async () => {
    const oldSupplier = receipt.document_snapshot.documents.find(d => d.kind === 'suppliers');
    await asUser(IDS.platform);
    for (const body of ['DRAFT '.repeat(30), '[CUSTOMER_LEGAL_NAME] '.repeat(12)]) {
      await assert.rejects(one('select public.platform_publish_agreement_document($1,$2,$3,$4) x', [
        'suppliers', 'Unfinished supplier appendix', 'unfinished', body,
      ]), /Only final, complete, reviewed/i);
    }
    const changedBody = 'Synthetic supplier revision with a newly disclosed processing country. '.repeat(4);
    const replacement = (await one('select public.platform_publish_agreement_document($1,$2,$3,$4) x', [
      'suppliers', 'Synthetic supplier appendix', '2026.2', changedBody,
    ])).x;
    const revisedIds = ids.filter(id => id !== oldSupplier.id).concat(replacement.id);
    const revised = (await one('select public.platform_publish_agreement_catalog($1::uuid[]) x', [
      '{' + revisedIds.join(',') + '}',
    ])).x;
    assert.equal(revised.revision, 2);

    await asUser(IDS.first);
    const pending = (await one('select public.get_my_district_agreement() x')).x;
    assert.equal(pending.status, 'issued');
    assert.notEqual(pending.bundle_sha256, pkg.bundle_sha256);
    assert.equal(pending.documents.find(d => d.kind === 'suppliers').body, changedBody);
    assert.equal((await one('select count(*)::int n from safebus_private.agreement_executed_artifacts')).n, 1);
    const historical = (await one('select public.get_my_district_agreement_receipt($1::uuid) x', [result.receipt_id])).x;
    assert.deepEqual(historical.document_snapshot, receipt.document_snapshot);
    // Retrying the old submission returns only the old receipt; it does not accept revision 2.
    assert.equal((await accept(true)).result.receipt_id, result.receipt_id);
    assert.equal((await one('select public.get_my_district_agreement() x')).x.status, 'issued');

    await asUser(IDS.second);
    await assert.rejects(one('select public.accept_my_district_agreement($1::uuid,$2,$3,$4,true,true,true) x', [
      other.id, other.bundle_sha256, 'Second Admin', 'Transportation Director',
    ]), /updated|current version/i);
    // Neither a wrong authority nor a guardian can approve the first authority's revision.
    await assert.rejects(one('select public.accept_my_district_agreement($1::uuid,$2,$3,$4,true,true,true) x', [
      pending.id, pending.bundle_sha256, 'Second Admin', 'Transportation Director',
    ]), /changed|reload/i);
    await asUser(IDS.guardian);
    await assert.rejects(one('select public.accept_my_district_agreement($1::uuid,$2,$3,$4,true,true,true) x', [
      pending.id, pending.bundle_sha256, 'Guardian', 'Guardian',
    ]), /role cannot|cannot manage/i);

    await asUser(IDS.first);
    const signedRevision = (await one('select public.accept_my_district_agreement($1::uuid,$2,$3,$4,true,true,true) x', [
      pending.id, pending.bundle_sha256, 'First Admin', 'Transportation Director',
    ])).x;
    assert.notEqual(signedRevision.receipt_id, result.receipt_id);
    const latest = (await one('select public.get_my_district_agreement_receipt($1::uuid) x', [signedRevision.receipt_id])).x;
    assert.equal(latest.document_snapshot.documents.find(d => d.kind === 'suppliers').body, changedBody);
    assert.equal(latest.document_snapshot.revision, 2);
    assert.equal((await one('select count(*)::int n from safebus_private.agreement_executed_artifacts')).n, 2);
  });

  await t.test('customer orders are scoped, priced by the server and frozen with acceptance', async () => {
    await db.exec(await readFile('supabase/migrations/pending/20261111230428_district_agreement_order_snapshot.sql','utf8'));
    await asUser(IDS.second);
    const unsigned=(await one('select public.get_my_district_agreement() x')).x;
    assert.equal(unsigned.order_required,true);
    const sign=async p=>(await one('select public.accept_my_district_agreement($1::uuid,$2,$3,$4,true,true,true) x',[
      p.id,p.bundle_sha256,'Second Admin','Director',
    ])).x;
    await assert.rejects(sign(unsigned),/Order Form/);
    const order={interval:'year',quantity:25,collection_method:'send_invoice',
      privacy_contact:'privacy@example.test',urgent_contact:'urgent@example.test'};
    const prepare=async (id,value)=>(await one('select public.prepare_my_district_agreement_order($1::uuid,$2::jsonb) x',[id,JSON.stringify(value)])).x;
    await assert.rejects(prepare(unsigned.id,{...order,unit_amount_cents:1}),/Unsupported/);
    await assert.rejects(prepare(unsigned.id,{...order,quantity:10001}),/10000/);
    await assert.rejects(prepare(unsigned.id,{...order,urgent_contact:''}),/contact/);
    await asUser(IDS.first);
    await assert.rejects(prepare(unsigned.id,order),/current agreement/);
    await asUser(IDS.guardian);
    await assert.rejects(prepare(unsigned.id,order),/role cannot/);
    await asUser(IDS.second);
    const prepared=await prepare(unsigned.id,order);
    assert.equal(prepared.order_details.unit_amount_cents,2029);
    assert.equal(prepared.order_details.customer,'Synthetic District Two');
    const form=prepared.documents.find(d=>d.kind==='order_form');
    assert.match(form.body,/privacy@example.test/);
    assert.equal(form.sha256,(await one("select encode(sha256(convert_to($1,'UTF8')),'hex') hash",[form.body])).hash);
    await assert.rejects(sign(unsigned),/changed/);
    const signed=await sign(prepared);
    const firstReceipt=(await one('select public.get_my_district_agreement_receipt($1::uuid) x',[signed.receipt_id])).x;
    assert.deepEqual(firstReceipt.document_snapshot.order_details,prepared.order_details);
    assert.deepEqual(firstReceipt.document_snapshot.documents,prepared.documents);
    const matches=async (interval,quantity,method)=>(await one('select public.district_agreement_order_matches($1::uuid,$2,$3,$4) x',[IDS.tenant2,interval,quantity,method])).x;
    assert.equal(await matches('year',25,'send_invoice'),true);
    assert.equal(await matches('month',25,'send_invoice'),false);
    assert.equal(await matches('year',26,'send_invoice'),false);
    assert.equal(await matches('year',25,'charge_automatically'),false);
    const amendment=await prepare(prepared.id,{...order,quantity:26});
    assert.notEqual(amendment.id,prepared.id);
    assert.equal(amendment.status,'issued');
    assert.equal(amendment.version,'2.2');
    assert.equal(await matches('year',26,'send_invoice'),false);
    await sign(amendment);
    assert.equal(await matches('year',26,'send_invoice'),true);
    assert.equal(await matches('year',25,'send_invoice'),false);
    const preserved=(await one('select public.get_my_district_agreement_receipt($1::uuid) x',[signed.receipt_id])).x;
    assert.deepEqual(preserved,firstReceipt);
    assert.equal((await one("select has_function_privilege('anon','public.prepare_my_district_agreement_order(uuid,jsonb)','EXECUTE') x")).x,false);
    assert.equal((await one("select has_function_privilege('authenticated','public.district_agreement_order_matches(uuid,text,integer,text)','EXECUTE') x")).x,false);
  });

});
