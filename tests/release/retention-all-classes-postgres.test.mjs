import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/retention-lifecycle-schema.mjs';

const authority = '22222222-2222-4222-8222-222222222222';
const administrator = '11111111-1111-4111-8111-111111111111';
const platform = '33333333-3333-4333-8333-333333333333';
const other = '44444444-4444-4444-8444-444444444444';
const otherAdmin = '55555555-5555-4555-8555-555555555555';
const query = async (db, sql, values = []) => (await db.query(sql, values)).rows[0]?.result;
const act = (db, action, data = {}) =>
  query(db, 'select public.manage_records_retention($1,$2) result', [action, JSON.stringify(data)]);
const work = (db, action, data = {}) =>
  query(db, 'select public.retention_export_work($1,$2) result', [action, JSON.stringify(data)]);
const batch = (db) => query(db, 'select public.run_retention_lifecycle(false,500) result');
const service = (db) => db.exec("set test.role='service_role'");
async function actor(db, id) {
  await db.query(
    "select set_config('test.role','authenticated',false),set_config('test.uid',$1,false)",
    [id],
  );
}
async function users(db) {
  await db.query("insert into public.tenants values ($1,'active')", [other]);
  await db.query(
    "insert into public.profiles(id,tenant_id,role,status) values ($1,null,'platform_super_admin','active'),($2,$3,'tenant_admin','active')",
    [platform, otherAdmin, other],
  );
}
const enable = (db) =>
  db.exec(
    "update public.retention_execution_control set destructive_enabled=true,approved_at=now(),approval_reference='fixture'",
  );

test('disposal honors parent holds, invitation and counter age, and canonical Auth', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  const student = await query(
    db,
    "insert into public.students(tenant_id,first_name,status,updated_at) values($1,'Fixture','inactive',now()-interval '400 days') returning id result",
    [authority],
  );
  await db.query(
    "insert into public.student_guardians(tenant_id,student_id,status,updated_at) values($1,$2,'active',now()-interval '400 days')",
    [authority, student],
  );
  await db.query(
    "insert into public.tenant_onboarding_invitations(tenant_id,status,updated_at,expires_at) values($1,'activated',now()-interval '100 days',now()-interval '95 days'),($1,'pending',now()-interval '100 days',now()+interval '1 day')",
    [authority],
  );
  await db.exec(
    "insert into public.rate_limit_buckets(window_start) values(now()-interval '3 days'),(now()-interval '1 day')",
  );
  const live = await query(
    db,
    "insert into public.user_sessions(tenant_id,last_active_at,revoked_at) values($1,now()-interval '120 days',now()-interval '110 days') returning id result",
    [authority],
  );
  await db.query('insert into auth.sessions(id) values($1)', [live]);
  await db.query(
    "insert into public.user_sessions(tenant_id,last_active_at) values($1,now()-interval '110 days')",
    [authority],
  );
  await actor(db, administrator);
  const hold = await act(db, 'hold_create', {
    dataClass: 'student_records',
    recordId: student,
    reference: 'STUDENT-1',
    reason: 'incident',
    reviewAt: '2030-01-01',
  });
  await service(db);
  await enable(db);
  const result = await batch(db);
  assert.equal(result.counts.student_records, 0);
  assert.equal(result.counts.guardian_relationships, 0);
  assert.equal(result.counts.invitations, 1);
  assert.equal(result.counts.rate_limit_buckets, 1);
  assert.equal(result.counts.user_sessions, 1);
  assert.equal(
    await query(db, 'select count(*)::int result from public.user_sessions where id=$1', [live]),
    1,
  );
  await actor(db, administrator);
  await act(db, 'hold_release', { id: hold.id, confirm: 'release' });
  await service(db);
  const released = await batch(db);
  assert.equal(released.counts.guardian_relationships, 1);
  assert.equal(released.counts.student_records, 1);
  await db.query('delete from auth.sessions where id=$1', [live]);
  assert.equal((await batch(db)).counts.user_sessions, 1);
});

test('platform customer exports require the owning authority and release a verified scoped chunk only', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await users(db);
  await db.query(
    "insert into public.students(tenant_id,first_name,status) values($1,'Permitted','active'),($2,'Excluded','active')",
    [authority, other],
  );
  await actor(db, platform);
  const job = await act(db, 'export_create', {
    dataClass: 'student_records',
    tenantId: authority,
    reference: 'EXPORT-1',
    confirmAll: 'all_records',
  });
  assert.equal(job.state, 'requested');
  await assert.rejects(act(db, 'records', { dataClass: 'student_records' }), { code: '42501' });
  await assert.rejects(act(db, 'export_approve', { id: job.id, confirm: 'approve_export' }), {
    code: '42501',
  });
  await actor(db, otherAdmin);
  assert.equal((await act(db, 'overview')).exports.length, 0);
  await assert.rejects(act(db, 'export_approve', { id: job.id, confirm: 'approve_export' }), {
    code: '42501',
  });
  await actor(db, administrator);
  assert.equal((await act(db, 'overview')).exports[0].id, job.id);
  await act(db, 'export_approve', { id: job.id, confirm: 'approve_export' });
  await service(db);
  const chunk = await work(db, 'next');
  assert.deepEqual(
    chunk.payload.rows.map((r) => r.first_name),
    ['Permitted'],
  );
  assert.equal(
    (await work(db, 'verify', { id: chunk.id, keyId: 'fixture', sha256: 'a'.repeat(64) })).verified,
    true,
  );
  assert.deepEqual(await work(db, 'next'), { finished: true });
  await actor(db, platform);
  assert.equal(
    (await act(db, 'export_access', { id: job.id, chunkId: chunk.id })).chunks[0].id,
    chunk.id,
  );
  await actor(db, administrator);
  await act(db, 'export_cancel', { id: job.id, confirm: 'cancel_export' });
  await actor(db, platform);
  await assert.rejects(act(db, 'export_access', { id: job.id, chunkId: chunk.id }), {
    code: '42501',
  });
});

test('finance uses documented fiscal dates and provider confirmation requires evidence', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await users(db);
  await actor(db, platform);
  const finance = {
    dataClass: 'financial_records',
    reference: 'FIN-1',
    sourceType: 'metadata_only',
    classification: 'ordinary',
  };
  await assert.rejects(act(db, 'business_create', finance), { code: '22023' });
  const normal = await act(db, 'business_create', { ...finance, fiscalYearEnd: '2019-03-31' });
  assert.match(normal.eligibleAt, /^2025-04-01/);
  const late = await act(db, 'business_create', {
    ...finance,
    reference: 'FIN-LATE',
    fiscalYearEnd: '2019-03-31',
    lateFiledAt: '2025-01-01',
  });
  assert.match(late.eligibleAt, /^2031-01-02/);
  const historical = await act(db, 'business_create', {
    ...finance,
    reference: 'FIN-HIST',
    classification: 'historical_corporate',
  });
  assert.equal(historical.eligibleAt, null);
  const support = await act(db, 'business_create', {
    dataClass: 'support_records',
    reference: 'SUP-1',
    sourceType: 'external_mail',
    provider: 'zoho',
    sourceReference: { accountId: 'acct', messageId: 'msg' },
    classification: 'ordinary',
    resolvedAt: '2023-01-01',
  });
  await assert.rejects(
    act(db, 'business_provider_confirm', { id: support.id, confirm: 'provider_disposed' }),
    { code: '22023' },
  );
  await service(db);
  assert.equal((await work(db, 'business_due')).id, normal.id);
  assert.equal((await work(db, 'business_removed', { id: normal.id })).removed, true);
  assert.equal((await work(db, 'business_due')).providerPending, true);
  assert.equal(await work(db, 'business_due'), null);
  await actor(db, platform);
  await act(db, 'business_provider_confirm', {
    id: support.id,
    confirm: 'provider_disposed',
    evidenceReference: 'RECEIPT-1',
  });
  await service(db);
  assert.equal((await work(db, 'business_due')).id, support.id);
});
