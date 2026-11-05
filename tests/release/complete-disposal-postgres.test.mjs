import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './fixtures/complete-disposal-schema.mjs';
const tenant = '22222222-2222-4222-8222-222222222222';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const call = async (db, action, data = {}) =>
  (await db.query('select public.manage_disposal($1,$2) value', [action, JSON.stringify(data)]))
    .rows[0].value;
const batch = async (db, dry = true) =>
  (await db.query('select public.run_retention_lifecycle($1,500) value', [dry])).rows[0].value;
const enable = async (db) =>
  db.exec(
    "update public.retention_execution_control set destructive_enabled=true,approval_reference='fixture-only',approved_at=now();set test.role='service_role'",
  );
const student = async (db, days = 500) =>
  db.query(
    "insert into public.students(id,tenant_id,status,first_name,created_at,updated_at) values($1,$2,'inactive','Synthetic',now()-$3*interval '1 day',now()-$3*interval '1 day')",
    [id, tenant, days],
  );

test('complete worker: bounded dry runs, terminal state and dependency-safe execution', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await student(db);
  await db.query('insert into public.student_bus_assignments(student_id) values($1)', [id]);
  await db.exec(
    "insert into public.rate_limit_buckets(window_start) values(now()-interval '3 days'),(now());",
  );
  const dry = await batch(db);
  assert.equal(dry.counts.student_records, 1);
  assert.equal(dry.counts.rate_limit_buckets, 1);
  await assert.rejects(batch(db, false), (e) => e.code === '55006');
  await enable(db);
  const out = await batch(db, false);
  assert.equal(out.counts.student_records, 1);
  assert.equal(out.counts.rate_limit_buckets, 1);
  assert.equal(
    (await db.query('select count(*) n from public.student_bus_assignments')).rows[0].n,
    0,
  );
  assert.equal((await batch(db, false)).counts.student_records, 0);
  assert.equal(
    (
      await db.query(
        "select sum(affected_rows) n from safebus_private.disposal_runs where policy_key='student_records'",
      )
    ).rows[0].n,
    '1',
  );
});

test('holds, one-calendar-year floor, explicit release, extensions and export isolation', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await student(db);
  await db.exec("set test.role='authenticated'");
  const result = await call(db, 'preserve', {
    policy: 'student_records',
    recordId: id,
    reference: 'CASE-1',
    decisionUsedAt: new Date().toISOString(),
    reviewAt: '2030-01-01T00:00:00Z',
  });
  assert.equal(result.confirmed, true);
  const holds = await call(db, 'holds');
  assert.equal(holds.length, 1);
  await assert.rejects(
    call(db, 'release', { id: holds[0].id, confirm: 'release' }),
    (e) => e.code === '22023',
  );
  await db.exec("update safebus_private.disposal_holds set review_at=now()-interval '1 day'");
  await enable(db);
  assert.equal((await batch(db)).counts.student_records, 0);
  await assert.rejects(
    db.query('delete from public.students where id=$1', [id]),
    (e) => e.code === '55006',
  );
  await db.exec("set test.role='authenticated'");
  assert.equal(
    (await call(db, 'export', { policy: 'student_records', recordId: id })).first_name,
    'Synthetic',
  );
  await db.exec(
    "update public.profiles set tenant_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';insert into public.tenants values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','active')",
  );
  await assert.rejects(
    call(db, 'export', { policy: 'student_records', recordId: id }),
    (e) => e.code === '42501',
  );
  assert.equal((await call(db, 'holds')).length, 0);
});

test('role, MFA, current session and recent sign-in denial; platform aggregate-only', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await student(db);
  await db.exec("set test.role='authenticated'");
  for (const role of ['guardian', 'driver', 'school_admin']) {
    await db.query('update public.profiles set role=$1', [role]);
    await assert.rejects(call(db, 'status'), (e) => e.code === '42501');
  }
  await db.exec("update public.profiles set role='platform_super_admin'");
  assert.equal(typeof (await call(db, 'status')).activeHolds, 'number');
  await assert.rejects(call(db, 'holds'), (e) => e.code === '42501');
  await db.exec("update public.profiles set role='transportation_admin'");
  await assert.rejects(
    call(db, 'export', { policy: 'student_records', recordId: id }),
    (e) => e.code === '42501',
  );
  await db.exec("update public.profiles set role='tenant_admin';set test.mfa='false'");
  await assert.rejects(call(db, 'status'), (e) => e.code === '42501');
  await db.exec("set test.mfa='true';set test.session='false'");
  await assert.rejects(call(db, 'status'), (e) => e.code === '42501');
  await db.exec("set test.session='true';set test.recent='false'");
  await assert.rejects(
    call(db, 'preserve', { policy: 'student_records', recordId: id }),
    (e) => e.code === '42501',
  );
  await db.exec("set test.role='service_role'");
  await assert.rejects(call(db, 'status'), (e) => e.code === '42501');
});

test('unexpected future FK, preserved children and active Auth sessions block parent deletion', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await student(db);
  await db.exec(
    'create table public.new_dependency(student_id uuid references public.students(id) on delete cascade)',
  );
  await db.query('insert into public.new_dependency values($1)', [id]);
  assert.equal((await batch(db)).counts.student_records, 0);
  await db.exec(
    "insert into public.user_sessions(id,revoked_at,last_active_at) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc',now()-interval '100 days',now()-interval '100 days');insert into auth.sessions values('cccccccc-cccc-4ccc-8ccc-cccccccccccc')",
  );
  assert.equal((await batch(db)).counts.user_sessions, 0);
});

test('terminal credential, dispatch, invitation and audit triggers use safe dates', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await db.exec(
    "insert into public.bus_tracking_sessions(status,expires_at,ended_at,created_at,last_seen_at) values('revoked',now()-interval '40 days',now()-interval '40 days',now()-interval '60 days',now()-interval '1 day');insert into public.tenant_onboarding_invitations(status,delivery_status,created_at,updated_at,expires_at) values('activated','queued',now()-interval '100 days',now()-interval '100 days',now()-interval '100 days');insert into public.audit_events(tenant_id,actor_email,actor_role,target_type,created_at) values('22222222-2222-4222-8222-222222222222','synthetic@example.invalid','driver','student',now()-interval '800 days')",
  );
  const out = await batch(db);
  assert.equal(out.counts.bus_tracking_sessions, 0);
  assert.equal(out.counts.invitations, 0);
  assert.equal(out.counts.audit_records, 1);
  await enable(db);
  await batch(db, false);
  assert.deepEqual(
    (await db.query('select tenant_id,actor_email,actor_role,target_type from public.audit_events'))
      .rows,
    [{ tenant_id: null, actor_email: null, actor_role: null, target_type: null }],
  );
  assert.equal((await batch(db)).counts.audit_records, 0);
});

test('Auth reservation prevents reactivation, reconciles lost responses and never selects admins', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await db.query('insert into auth.users values($1)', [id]);
  await db.query(
    "insert into public.profiles(id,tenant_id,role,status,updated_at) values($1,$2,'guardian','disabled',now()-interval '500 days')",
    [id, tenant],
  );
  await enable(db);
  await batch(db, false);
  const work = async (action) =>
    (
      await db.query('select public.disposal_account_work($1,$2) value', [
        action,
        action === 'completed' ? id : null,
      ])
    ).rows[0].value;
  assert.equal((await work('next')).id, id);
  await assert.rejects(
    db.query("update public.profiles set status='active' where id=$1", [id]),
    (e) => e.code === '55006',
  );
  await assert.rejects(work('completed'), (e) => e.code === '55006');
  await db.query('delete from auth.users where id=$1', [id]);
  assert.equal(await work('next'), null);
  assert.equal((await work('completed')).completed, true);
  assert.equal(
    (
      await db.query(
        "select sum(affected_rows) n from safebus_private.disposal_runs where policy_key='accounts'",
      )
    ).rows[0].n,
    '1',
  );
  assert.equal((await db.query('select count(*) n from public.profiles')).rows[0].n, 1);
});

test('original trip preservation writes an allowed hosted audit event after the forward repair', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await db.query(
    "insert into public.driver_trips(id,tenant_id,started_at,ended_at,status) values($1,$2,now()-interval '2 days',now()-interval '1 day','completed')",
    [id, tenant],
  );
  await db.exec("set test.role='authenticated'");
  const request = {
    tripId: id,
    reason: 'incident',
    reference: 'CASE-TRIP',
    reviewAt: '2030-01-01T00:00:00Z',
  };
  const r = await db.query("select public.manage_retention_case('create',$1) value", [
    JSON.stringify(request),
  ]);
  assert.ok(r.rows[0].value.id);
  assert.equal(
    (
      await db.query(
        "select count(*) n from public.audit_events where action='security.config_changed' and detail->>'operation'='create'",
      )
    ).rows[0].n,
    1,
  );
});

test('authority extensions and overlapping holds block execution independently', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  await student(db);
  await db.exec("set test.role='authenticated'");
  await call(db, 'extend', { policy: 'student_records', days: '600', reference: 'SCHEDULE-600' });
  await call(db, 'extend', { policy: 'student_records', days: '395', reference: 'NO-SHORTEN' });
  const data = {
    policy: 'student_records',
    recordId: id,
    reference: 'CASE-1',
    reviewAt: '2030-01-01T00:00:00Z',
  };
  await call(db, 'preserve', data);
  await call(db, 'preserve', { ...data, reference: 'CASE-2' });
  const [first] = await call(db, 'holds');
  await call(db, 'release', { id: first.id, confirm: 'release' });
  assert.equal((await call(db, 'status')).activeHolds, 1);
  assert.equal((await call(db, 'status')).extensions[0].days, 600);
  await enable(db);
  assert.equal((await batch(db, false)).counts.student_records, 0);
});

test('protected manifest rehearses exactly and rollback is blocked after actual disposal', async (t) => {
  const db = await fixture(false);
  t.after(() => db.close());
  const { migrationPath } = await import('./fixtures/complete-disposal-schema.mjs');
  const fs = await import('node:fs/promises');
  const { rehearseOperational, operationalSnapshot, operationalRestoreSql } =
    await import('../../scripts/lib/operational-rollout.mjs');
  const spec = JSON.parse(await fs.readFile('config/pending/complete-disposal.json', 'utf8'));
  const sql = await fs.readFile(migrationPath, 'utf8');
  const client = {
    query: (sql, params) =>
      !params && sql.includes(';')
        ? db.exec(sql).then((rows) => rows.at(-1) ?? { rows: [] })
        : db.query(sql, params),
  };
  const before = await operationalSnapshot(client, spec);
  await rehearseOperational(client, sql, spec);
  await db.exec(sql);
  await student(db);
  await enable(db);
  await batch(db, false);
  await assert.rejects(db.exec(operationalRestoreSql(before, spec)), (e) =>
    /Retained feature data/.test(e.message),
  );
});

test('former authority directory expiry never disables an identity now assigned elsewhere', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  const newAuthority = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  await db.query('insert into auth.users values($1)', [id]);
  await db.query(
    "insert into public.profiles(id,tenant_id,role,status,full_name) values($1,$2,'driver','active','Synthetic Driver')",
    [id, newAuthority],
  );
  await db.query(
    "insert into public.drivers(tenant_id,profile_id,status,created_at,updated_at) values($1,$2,'inactive',now()-interval '500 days',now()-interval '500 days')",
    [tenant, id],
  );
  await enable(db);
  assert.equal((await batch(db, false)).counts.driver_records, 1);
  assert.equal(
    (await db.query('select status from public.profiles where id=$1', [id])).rows[0].status,
    'active',
  );
  assert.equal(
    (await db.query('select count(*) n from safebus_private.disposal_accounts')).rows[0].n,
    0,
  );
});

test('terminal notification cleanup unblocks old trips while pending fan-out and delivery survive', async (t) => {
  const db = await fixture();
  t.after(() => db.close());
  const pending = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  await db.query(
    "insert into public.driver_trips(id,tenant_id,started_at,ended_at,status,created_at,updated_at) select x,$1,now()-interval '501 days',now()-interval '500 days','completed',now()-interval '501 days',now()-interval '500 days' from unnest($2::uuid[]) x",
    [tenant, [id, pending]],
  );
  await db.query(
    "insert into safebus_private.notification_audience_queue(tenant_id,driver_trip_id,occurred_at,failed_at) values($1,$2,now()-interval '500 days',now()-interval '100 days'),($1,$3,now()-interval '500 days',null)",
    [tenant, id, pending],
  );
  await db.query(
    "insert into public.android_push_devices(id,tenant_id,status,updated_at,last_seen_at) values($1,$2,'stale',now()-interval '100 days',now()-interval '100 days'),($3,$2,'revoked',now()-interval '100 days',now()-interval '100 days')",
    [id, tenant, pending],
  );
  await db.query(
    "insert into public.push_notification_outbox(device_id,status,created_at) values($1,'pending',now()-interval '500 days')",
    [pending],
  );
  await enable(db);
  const r = await batch(db, false);
  assert.equal(r.counts.audience_failures, 1);
  assert.equal(r.counts.push_devices, 1);
  assert.equal(r.counts.trip_records, 1);
  assert.deepEqual((await db.query('select id from public.driver_trips')).rows, [{ id: pending }]);
  assert.equal(
    (await db.query('select count(*) n from public.push_notification_outbox')).rows[0].n,
    1,
  );
});
