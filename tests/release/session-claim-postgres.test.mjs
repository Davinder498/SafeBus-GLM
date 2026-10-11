import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import {
  SECURITY_FILE,
  SESSION_VALIDATION_FILE,
} from '../../scripts/lib/existing-security-rehearsal.mjs';

test('actual PostgreSQL reproduces 0122 and validates the forward session correction', async (t) => {
  // An in-memory test process with no network or hosted credentials. No Docker,
  // extra Supabase project, existing identities, or customer records are used.
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(await fs.readFile('tests/release/fixtures/session-auth-baseline.sql', 'utf8'));
  const oldSql = await fs.readFile(SECURITY_FILE, 'utf8');
  const sessionFunction = oldSql.match(
    /create or replace function public\.is_current_user_session_active\(\)[\s\S]*?\$\$;/,
  )?.[0];
  assert.ok(sessionFunction);
  await db.exec(sessionFunction);
  const user = '00000000-0000-0000-0000-000000000001';
  const otherUser = '00000000-0000-0000-0000-000000000002';
  const sessions = Array.from(
    { length: 5 },
    (_, i) => '00000000-0000-0000-0000-00000000010' + (i + 1),
  );
  await db.query(
    `insert into auth.sessions(id,user_id,not_after) values
    ($1,$6,null), ($2,$6,now()+interval '1 hour'),
    ($3,$6,now()-interval '1 hour'), ($4,$6,null), ($5,$7,null)`,
    [...sessions, user, otherUser],
  );
  await db.query(
    'insert into public.user_sessions(id,user_id,revoked_at) values ($1,$3,null), ($2,$3,now())',
    [sessions[1], sessions[3], user],
  );

  async function withClaims(claims, check, role = 'authenticated', legacy = '') {
    await db.exec('begin');
    try {
      await db.query(
        `select set_config('request.jwt.claim.sub','',true),
        set_config('request.jwt.claim.role','authenticated',true),
        set_config('request.jwt.claim',$2,true), set_config('request.jwt.claims',$1,true)`,
        [typeof claims === 'string' ? claims : JSON.stringify(claims), legacy],
      );
      assert.ok(['authenticated', 'anon'].includes(role));
      await db.exec('set local role ' + role);
      return await check();
    } finally {
      await db.exec('rollback');
    }
  }
  const active = async () =>
    (await db.query('select public.is_current_user_session_active() as active')).rows[0].active;
  const malformed = { sub: user, role: 'authenticated', session_id: 'invalid' };
  await assert.rejects(withClaims(malformed, active), (error) => error.code === '22P02');

  await db.exec('begin');
  await db.exec(await fs.readFile(SESSION_VALIDATION_FILE, 'utf8'));
  await db.exec('commit');
  const hook = oldSql.match(
    /create or replace function safebus_private\.enforce_active_api_session\(\)[\s\S]*?grant execute[^;]+;/,
  )?.[0];
  assert.ok(hook);
  await db.exec(hook);

  for (const [name, claims] of [
    ['missing subject', { role: 'authenticated', session_id: sessions[0] }],
    ['missing session', { sub: user, role: 'authenticated' }],
    ['malformed subject', { sub: 'invalid', role: 'authenticated', session_id: sessions[0] }],
    ['malformed JSON', '{invalid-json'],
    ...['invalid', '', ' ', null, 123, {}, [], '00000000-0000-0000-0000-00000000000g'].map(
      (value) => [
        'session ' + JSON.stringify(value),
        { sub: user, role: 'authenticated', session_id: value },
      ],
    ),
  ]) {
    await t.test(name, async () => assert.equal(await withClaims(claims, active), false));
  }
  for (const [name, session, expected] of [
    ['active session without mirror', sessions[0], true],
    ['active session with non-revoked mirror and future expiry', sessions[1], true],
    ['expired Auth session', sessions[2], false],
    ['revoked mirror', sessions[3], false],
    ['another user owns the session', sessions[4], false],
    ['missing/deleted Auth session', '00000000-0000-0000-0000-000000000999', false],
  ]) {
    await t.test(name, async () =>
      assert.equal(
        await withClaims({ sub: user, role: 'authenticated', session_id: session }, active),
        expected,
      ),
    );
  }
  await t.test('legacy JWT input is validated too', async () => {
    assert.equal(
      await withClaims(
        { sub: user, session_id: sessions[0] },
        active,
        'authenticated',
        JSON.stringify(malformed),
      ),
      false,
    );
    assert.equal(
      await withClaims(
        { sub: user, session_id: sessions[0] },
        active,
        'authenticated',
        '{invalid-json',
      ),
      false,
    );
  });
  await t.test('anonymous execution remains denied', async () => {
    await assert.rejects(withClaims(malformed, active, 'anon'), (error) => error.code === '42501');
  });
  await t.test(
    'API hook denies malformed sessions while allowing the boolean status RPC',
    async () => {
      await assert.rejects(
        withClaims(malformed, async () => {
          await db.exec(
            "select set_config('request.path','/rpc/get_admin_student_guardian_links',true), set_config('request.method','POST',true)",
          );
          await db.query('select safebus_private.enforce_active_api_session()');
        }),
        (error) => error.code === '42501',
      );
      await withClaims(malformed, async () => {
        await db.exec(
          "select set_config('request.path','/rpc/is_current_user_session_active',true), set_config('request.method','POST',true)",
        );
        await db.query('select safebus_private.enforce_active_api_session()');
        assert.equal(await active(), false);
      });
    },
  );
});
