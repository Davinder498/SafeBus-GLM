import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const pending = 'supabase/migrations/pending/20261015212746_fix_retention_column_qualification.sql';
const fixture = 'tests/release/fixtures/retention-installed-function.sql';
const policies = [
  ['invitations', 'tenant_onboarding_invitations', 'activated', 'pending'],
  ['student_records', 'students', 'inactive', 'active'],
  ['guardian_relationships', 'student_guardians', 'inactive', 'active'],
  ['driver_records', 'drivers', 'inactive', 'active'],
  ['bus_tracking_sessions', 'bus_tracking_sessions', 'ended', 'active'],
  ['bus_run_dispatches', 'bus_run_dispatches', 'completed', 'prepared'],
  ['trip_records', 'driver_trips', 'completed', 'active'],
  ['notifications', 'guardian_notification_outbox', 'delivered', 'pending'],
];

test('pending retention correction fixes observed failures without enabling deletion', async (t) => {
  // Owned in-memory PostgreSQL only. Minimal synthetic schema, no hosted calls,
  // real identities, notifications or production fixture execution.
  // This verifies qualification/guards, not full production FK/hold/trigger safety.
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create schema auth; create schema safebus_private;
    create role anon; create role authenticated; create role service_role;
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create function auth.role() returns text language sql as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'service_role')$$;
    create function safebus_private.is_platform_super_admin() returns boolean language sql as $$
      select coalesce(current_setting('test.platform_admin', true), '') = 'true'$$;
    create function safebus_private.enforce_mfa_if_required() returns void language plpgsql as $$
      begin if coalesce(current_setting('test.aal2', true), '') <> 'true' then
        raise exception 'MFA required' using errcode='42501'; end if; end $$;
    create function safebus_private.enforce_recent_auth_for_sensitive_action() returns void language plpgsql as $$
      begin if coalesce(current_setting('test.recent_auth', true), '') <> 'true' then
        raise exception 'Recent auth required' using errcode='42501'; end if; end $$;
    create table public.retention_policies (
      policy_key text primary key, retention_days int, expiry_action text, active boolean);
    create table public.retention_execution_control (id int primary key, destructive_enabled boolean);
    insert into public.retention_execution_control values (1, false);
    create table public.retention_deletion_runs (
      id uuid primary key default gen_random_uuid(), policy_key text, actor_profile_id uuid,
      dry_run boolean, affected_rows bigint default 0, status text default 'running',
      completed_at timestamptz, error_code text);
    create table public.audit_events (
      id uuid primary key default gen_random_uuid(), created_at timestamptz default now(),
      action text, outcome text, detail jsonb default '{}', actor_profile_id uuid,
      actor_email text, target_id uuid, target_label text, ip_address inet);
    create function safebus_private.write_audit_event_legacy(text,text,uuid,text,text,jsonb,text)
      returns void language sql as $$insert into public.audit_events(action,outcome,detail) values ($1,$5,$6)$$;
    create table public.profiles (id uuid primary key, first_name text, last_name text,
      full_name text, email text, status text);
    create table public.driver_trips (id uuid primary key, status text, ended_at timestamptz);
    create table public.bus_run_dispatches (id uuid primary key, status text,
      completed_at timestamptz, cancelled_at timestamptz, prepared_at timestamptz, driver_trip_id uuid);
    create table public.bus_tracking_sessions (id uuid primary key, status text,
      ended_at timestamptz, expires_at timestamptz);
    create table public.guardian_notification_outbox (id uuid primary key, status text,
      delivered_at timestamptz, failed_at timestamptz, updated_at timestamptz, created_at timestamptz);
    create table public.drivers (id uuid primary key, profile_id uuid, status text,
      updated_at timestamptz, employee_number text, phone text, license_number text,
      license_issue_date date, license_expiry_date date, license_class text,
      address_line1 text, address_line2 text, city text, province text, postal_code text);
    create table public.tenant_onboarding_invitations (id uuid primary key, status text, updated_at timestamptz);
    create table public.students (id uuid primary key, status text, updated_at timestamptz);
    create table public.student_guardians (id uuid primary key, status text, updated_at timestamptz);
  `);
  const expiredId = '11111111-1111-1111-1111-111111111111';
  const recentId = '22222222-2222-2222-2222-222222222222';
  const activeId = '33333333-3333-3333-3333-333333333333';
  for (const [key, table, terminal, active] of policies) {
    await db.query('insert into public.retention_policies values ($1,30,$2,true)', [
      key,
      key === 'driver_records' ? 'anonymize' : 'delete',
    ]);
    for (const [id, status, old] of [
      [expiredId, terminal, true],
      [recentId, terminal, false],
      [activeId, active, true],
    ]) {
      await db.query(`insert into public.${table}(id,status) values ($1,$2)`, [id, status]);
      const columns = {
        bus_run_dispatches: ['completed_at', 'prepared_at'],
        bus_tracking_sessions: ['ended_at', 'expires_at'],
        driver_trips: ['ended_at'],
        guardian_notification_outbox: ['delivered_at', 'updated_at', 'created_at'],
      }[table] ?? ['updated_at'];
      // Table/column names are fixed fixture constants, never user input.
      await db.query(
        `update public.${table} set ${columns.map((c) => `${c} = now() - interval '${old ? 60 : 1} days'`).join(',')} where id = $1`,
        [id],
      );
      if (table === 'drivers') {
        await db.query('insert into public.profiles values ($1,$2,$3,$4,$5,$6)', [
          id,
          'Fixture',
          'Driver',
          'Fixture Driver',
          'fixture@example.test',
          'active',
        ]);
        await db.query('update public.drivers set profile_id=id, phone=$1 where id=$2', [
          'synthetic',
          id,
        ]);
      }
    }
  }
  await db.exec(await fs.readFile(fixture, 'utf8'));
  await db.exec(
    'revoke all on function safebus_private.run_retention_deletion(text,boolean) from public; grant execute on function safebus_private.run_retention_deletion(text,boolean) to service_role',
  );
  const run = async (key, dry = true) =>
    (await db.query('select * from safebus_private.run_retention_deletion($1,$2)', [key, dry]))
      .rows[0];
  const migration = await fs.readFile(pending, 'utf8');
  const definition = async () =>
    (
      await db.query(
        "select pg_get_functiondef('safebus_private.run_retention_deletion(text,boolean)'::regprocedure) as value",
      )
    ).rows[0].value;
  const metadata = async () =>
    (
      await db.query(
        "select proowner, proacl::text, proconfig, prosecdef from pg_proc where oid='safebus_private.run_retention_deletion(text,boolean)'::regprocedure",
      )
    ).rows[0];
  const originalMetadata = await metadata();

  await t.test('reproduces all eight observed 42702 dry-run failures', async () => {
    for (const [key] of policies) {
      const result = await run(key);
      assert.equal(result.status, 'failed', key);
      assert.equal(result.error_code, '42702', key);
    }
  });
  await t.test('refuses installation if deletion has been enabled', async () => {
    await db.exec('begin; update public.retention_execution_control set destructive_enabled=true');
    await assert.rejects(db.exec(migration), /requires destructive execution to remain disabled/);
    await db.exec('rollback');
  });
  await t.test(
    'corrected dry runs count only expired terminal records and retain data',
    async () => {
      await db.exec(migration);
      assert.deepEqual(await metadata(), originalMetadata);
      for (const [key, table] of policies) {
        const result = await run(key);
        assert.equal(result.status, 'completed', key);
        assert.equal(result.error_code, null, key);
        assert.equal(Number(result.affected_rows), 1, key);
        assert.equal(
          (await db.query(`select count(*)::int as count from public.${table}`)).rows[0].count,
          3,
          key,
        );
      }
      assert.equal(
        (await db.query('select destructive_enabled from public.retention_execution_control'))
          .rows[0].destructive_enabled,
        false,
      );
      assert.deepEqual(
        (
          await db.query(
            "select has_function_privilege('anon','safebus_private.run_retention_deletion(text,boolean)','EXECUTE') as anon, has_function_privilege('service_role','safebus_private.run_retention_deletion(text,boolean)','EXECUTE') as service",
          )
        ).rows,
        [{ anon: false, service: true }],
      );
    },
  );
  await t.test(
    'preserves destructive, admin, MFA, recent-auth and inactive-policy guards',
    async () => {
      await assert.rejects(run('invitations', false), (e) => e.code === '55006');
      await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
      await assert.rejects(run('invitations'), (e) => e.code === '42501');
      await db.exec("select set_config('test.platform_admin','true',false)");
      await assert.rejects(run('invitations'), /MFA required/);
      await db.exec("select set_config('test.aal2','true',false)");
      await assert.rejects(run('invitations'), /Recent auth required/);
      await db.exec("select set_config('test.recent_auth','true',false)");
      assert.equal((await run('invitations')).status, 'completed');
      await db.exec(
        "select set_config('request.jwt.claim.role','service_role',false); update public.retention_policies set active=false where policy_key='invitations'",
      );
      await assert.rejects(run('invitations'), (e) => e.code === '22023');
      await db.exec(
        "update public.retention_policies set active=true where policy_key='invitations'",
      );
    },
  );
  await t.test('refuses to overwrite a changed routine', async () => {
    const before = await definition();
    await assert.rejects(db.exec(migration), /differs from the reviewed observed definition/);
    assert.equal(await definition(), before);
  });
  await t.test(
    'owned-fixture execution removes only expired terminal rows and anonymizes the driver',
    async () => {
      // Fixture-only enabling is explicitly isolated in a transaction and rolled
      // back. This is not authority to enable the production control or proves holds.
      await db.exec(
        'begin; update public.retention_execution_control set destructive_enabled=true',
      );
      for (const [key, table] of policies) {
        assert.equal((await run(key, false)).status, 'completed', key);
        const remaining = (await db.query(`select id,status from public.${table} order by id`))
          .rows;
        assert.equal(remaining.length, key === 'driver_records' ? 3 : 2, key);
        assert.ok(
          remaining.some((r) => r.id === recentId),
          key,
        );
        assert.ok(
          remaining.some((r) => r.id === activeId),
          key,
        );
      }
      assert.equal(
        (await db.query('select phone from public.drivers where id=$1', [expiredId])).rows[0].phone,
        null,
      );
      assert.equal(
        (await db.query('select full_name,status from public.profiles where id=$1', [expiredId]))
          .rows[0].full_name,
        'Deleted Driver',
      );
      assert.equal(
        (await db.query('select phone from public.drivers where id=$1', [recentId])).rows[0].phone,
        'synthetic',
      );
      await db.exec('rollback');
      assert.equal(
        (await db.query('select destructive_enabled from public.retention_execution_control'))
          .rows[0].destructive_enabled,
        false,
      );
      assert.equal(
        (await db.query('select count(*)::int as count from public.students')).rows[0].count,
        3,
      );
    },
  );
});
