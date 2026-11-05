import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  rehearseOperational,
  operationalSnapshot,
  verifyOperationalSnapshot,
} from '../../scripts/lib/operational-rollout.mjs';
import { createHash } from 'node:crypto';

test('another device sign-in cannot renew an old session; refresh, revocation and malformed claims deny', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create schema auth;create schema safebus_private;create schema extensions;create schema realtime;
    create role authenticated;create role service_role;
    create table auth.users(id uuid primary key,last_sign_in_at timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz,not_after timestamptz,refreshed_at timestamptz);
    create table public.user_sessions(id uuid,user_id uuid,revoked_at timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
    create function safebus_private.recent_auth_window_seconds() returns integer language sql stable as $$select 900$$;
    insert into auth.users values('11111111-1111-4111-8111-111111111111',now());
    insert into auth.sessions values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111',now()-interval '1 hour',null,now()),
      ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',now()-interval '1 minute',null,now());`);
  const fixture = JSON.parse(
    await fs.readFile('tests/release/fixtures/recent-auth-hosted-20261105.json', 'utf8'),
  );
  for (const row of fixture) await db.exec(row.definition);
  for (const row of fixture)
    await db.exec(
      `revoke all on function ${row.signature} from public;grant execute on function ${row.signature} to authenticated,service_role;`,
    );
  await db.exec(`create table public.user_notification_settings(profile_id uuid);
    create table public.user_notification_category_preferences(profile_id uuid,category text);
    create table public.guardian_student_push_preferences(student_guardian_id uuid,category text);
    create table public.user_notifications(id uuid);create table public.push_notification_outbox(id uuid);
    create table public.guardian_notification_outbox(id uuid,worker_id text);`);
  const config = JSON.parse(await fs.readFile('config/pending/recent-auth-session.json', 'utf8'));
  const sql = await fs.readFile(config.migration, 'utf8');
  assert.equal(createHash('sha256').update(sql).digest('hex'), config.migrationSha256);
  const client = {
    query: async (sql, args) =>
      args ? db.query(sql, args) : ((await db.exec(sql)).at(-1) ?? { rows: [] }),
  };
  await rehearseOperational(client, sql, config);
  verifyOperationalSnapshot(await operationalSnapshot(client, config), config, 'before');
  const setSession = async (id, user = '11111111-1111-4111-8111-111111111111') =>
    db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({ sub: user, session_id: id, role: 'authenticated', iat: Date.now() / 1000 }),
    ]);
  const recent = async () =>
    (await db.query('select safebus_private.has_recent_authentication() as recent')).rows[0].recent;
  await setSession('22222222-2222-4222-8222-222222222222');
  assert.equal(await recent(), true, 'reproduce hosted account-wide freshness bug');
  await db.exec(sql);
  verifyOperationalSnapshot(await operationalSnapshot(client, config), config, 'after');
  assert.equal(
    await recent(),
    false,
    'old session remains old despite another device sign-in and recent token refresh',
  );
  await setSession('33333333-3333-4333-8333-333333333333');
  assert.equal(await recent(), true);
  for (const id of ['malformed', null, '44444444-4444-4444-8444-444444444444']) {
    await setSession(id);
    assert.equal(await recent(), false);
  }
  await setSession('33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555');
  assert.equal(await recent(), false);
  await setSession('33333333-3333-4333-8333-333333333333');
  await db.exec(
    "update auth.sessions set not_after=now()-interval '1 second' where id='33333333-3333-4333-8333-333333333333'",
  );
  assert.equal(await recent(), false);
  await db.exec(
    "update auth.sessions set not_after=null;insert into public.user_sessions values('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',now())",
  );
  assert.equal(await recent(), false);
  await db.exec(
    "delete from public.user_sessions;update auth.sessions set created_at=now()+interval '1 minute'",
  );
  assert.equal(await recent(), false);
  await db.exec('update auth.sessions set created_at=null');
  assert.equal(await recent(), false);
});
