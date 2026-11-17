import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const path = 'supabase/migrations/pending/20261117210433_recovery_runtime_security.sql';
test('recovery migration fails closed before DDL for a production identity', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    "create schema safebus_release; create table safebus_release.environment_identity(singleton boolean,environment text,project_ref_hash text); insert into safebus_release.environment_identity values(true,'production','not-recovery');begin;",
  );
  await assert.rejects(db.exec(await fs.readFile(path, 'utf8')), /Recovery identity required/);
  await db.exec('rollback;');
});
test('reviewed policy SQL parses exactly and enforces restrictive gates and private notification topics', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  // Isolated policy-shape fixture. Session/role helpers here are stubs; actual
  // hosted helper and API-hook behavior is checked by the rollback rehearsal.
  await db.exec(`create role authenticated; create schema auth; create schema realtime; create schema safebus_private;
 create type public.user_role as enum ('tenant_admin','school_admin','transportation_admin','guardian');
 create type public.profile_status as enum ('active');
 create table public.profiles(id uuid,status public.profile_status);
 create table public.guardians(profile_id uuid,tenant_id uuid,status text);
 create table realtime.messages(extension text);
 alter table realtime.messages enable row level security;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('fixture.uid',true),'')::uuid$$;
 create function realtime.topic() returns text language sql as $$select current_setting('fixture.topic',true)$$;
 create function safebus_private.current_user_role() returns public.user_role language sql as $$select 'guardian'::public.user_role$$;
 create function safebus_private.current_tenant_id() returns uuid language sql as $$select null::uuid$$;
 create function safebus_private.can_receive_bus_tracking(text) returns boolean language sql as $$select false$$;
 create function public.is_current_user_session_active() returns boolean language sql as $$select current_setting('fixture.active',true)='yes'$$;
 create function safebus_private.has_completed_optional_mfa() returns boolean language sql as $$select current_setting('fixture.mfa',true)='yes'$$;
 grant usage on schema public,auth,realtime,safebus_private to authenticated;
 grant select on public.profiles,public.guardians to authenticated;
 grant all on realtime.messages to authenticated;
 insert into public.profiles values('ca100000-0000-4000-8000-000000000001','active');
 insert into realtime.messages values('broadcast');`);
  const sql = await fs.readFile(path, 'utf8');
  await db.exec(sql.slice(sql.indexOf('create policy'), sql.indexOf('alter role authenticator')));
  await db.exec('set search_path=pg_catalog');
  const actual = (
    await db.query(
      "select policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='realtime' and tablename='messages' order by policyname",
    )
  ).rows;
  assert.deepEqual(
    actual,
    JSON.parse(await fs.readFile('tests/capacity/recovery-runtime-policies.json', 'utf8')),
  );
  await db.exec(
    `set fixture.uid='ca100000-0000-4000-8000-000000000001';set fixture.topic='safebus:notifications:ca100000-0000-4000-8000-000000000001';set fixture.active='yes';set fixture.mfa='yes';set role authenticated;`,
  );
  assert.equal((await db.query('select count(*)::int as n from realtime.messages')).rows[0].n, 1);
  await db.exec("set fixture.topic='safebus:notifications:ca100000-0000-4000-8000-000000000002'");
  assert.equal((await db.query('select count(*)::int as n from realtime.messages')).rows[0].n, 0);
  await db.exec(
    "set fixture.topic='safebus:notifications:ca100000-0000-4000-8000-000000000001';set fixture.active='no'",
  );
  assert.equal((await db.query('select count(*)::int as n from realtime.messages')).rows[0].n, 0);
  await db.exec("set fixture.active='yes';set fixture.mfa='no'");
  assert.equal((await db.query('select count(*)::int as n from realtime.messages')).rows[0].n, 0);
  await db.exec("set fixture.mfa='yes'");
  await assert.rejects(
    db.exec("insert into realtime.messages values('broadcast')"),
    /row-level security/,
  );
});
