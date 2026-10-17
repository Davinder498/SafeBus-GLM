import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const migrationPath = 'supabase/migrations/pending/20261017161907_stable_qr_reprints.sql';
const sql = await fs.readFile(migrationPath, 'utf8');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const tenant = id(1),
  student = id(10),
  bus = id(20),
  user = id(90);
function fn(source, name) {
  return source.match(
    new RegExp(
      'create or replace function (?:public|safebus_private)\\.' + name + '\\([\\s\\S]*?\\$\\$;',
      'i',
    ),
  )[0];
}
async function fixture(t) {
  const db = new PGlite({ extensions: { pgcrypto } });
  t.after(() => db.close());
  await db.exec(await fs.readFile('tests/release/fixtures/student-seats-baseline.sql', 'utf8'));
  // Vault itself is hosted-only. This test adapter protects its synthetic key
  // using real pgcrypto; application encryption and decryption are unmodified.
  await db.exec(`create extension pgcrypto with schema extensions;
    create schema vault; create table vault.secrets(id uuid primary key default gen_random_uuid(),name text unique,secret bytea);
    create view vault.decrypted_secrets as select id,name,extensions.pgp_sym_decrypt(secret,'local-fixture-only') as decrypted_secret from vault.secrets;
    create function vault.create_secret(text,text,text) returns uuid language sql as $$
      insert into vault.secrets(secret,name) values(extensions.pgp_sym_encrypt($1,'local-fixture-only'),$2) returning id;
    $$;
    create table tenants(id uuid primary key);
    alter table students add column school_id uuid;
    create function safebus_private.can_write_student_roster(uuid,uuid) returns boolean language sql as $$
      select $1=safebus_private.current_tenant_id() and safebus_private.is_transportation_write_admin();
    $$;
    create function safebus_private.current_school_id() returns uuid language sql as $$ select null::uuid $$;
    create table bus_tracking_sessions(bus_qr_credential_id uuid,status text,ended_at timestamptz);
  `);
  const students = await fs.readFile(
    'supabase/migrations/0119_student_qr_pickup_dropoff.sql',
    'utf8',
  );
  const buses = await fs.readFile('supabase/migrations/0059_bus_qr_tracking_sessions.sql', 'utf8');
  await db.exec(
    students.match(/create table if not exists public\.student_qr_credentials \([\s\S]*?\n\);/)[0],
  );
  await db.exec(
    buses.match(/create table if not exists public\.bus_qr_credentials \([\s\S]*?\n\);/)[0],
  );
  await db.exec(fn(students, 'student_qr_hash'));
  for (const name of ['create_bus_qr_token', 'hash_bus_tracking_token']) {
    await db.exec(fn(buses, name).replace('function public.', 'function safebus_private.'));
  }
  await db.exec(fn(students, 'manage_student_qr_credential'));
  await db.exec(
    fn(buses, 'manage_bus_qr_credential')
      .replaceAll('public.current_tenant_id(', 'safebus_private.current_tenant_id(')
      .replaceAll(
        'public.is_transportation_write_admin(',
        'safebus_private.is_transportation_write_admin(',
      )
      .replaceAll('public.create_bus_qr_token(', 'safebus_private.create_bus_qr_token(')
      .replaceAll('public.hash_bus_tracking_token(', 'safebus_private.hash_bus_tracking_token('),
  );
  // The fixture has no Vault extension, but uses the exact remaining migration.
  await db.exec(
    sql.replace('create extension if not exists supabase_vault with schema vault;', ''),
  );
  await db.query('insert into tenants values($1),($2)', [tenant, id(2)]);
  await db.query("insert into profiles(id,tenant_id,role) values($1,$2,'tenant_admin')", [
    user,
    tenant,
  ]);
  await db.query(
    "insert into students(id,tenant_id,first_name,last_name) values($1,$2,'Avery','Test')",
    [student, tenant],
  );
  await db.query("insert into buses(id,tenant_id,bus_number) values($1,$2,'B1')", [bus, tenant]);
  await claims(db);
  return db;
}
async function claims(db, role = 'tenant_admin', whichTenant = tenant, session = 'active') {
  await db.query(
    `select set_config('test.uid',$1,false),set_config('test.role',$2,false),set_config('test.tenant',$3,false),set_config('test.session',$4,false)`,
    [user, role, whichTenant, session],
  );
}
async function get(db, kind, issue = false, original = null) {
  return (
    await db.query('select * from admin_get_printable_qr($1,$2,$3,$4)', [
      kind,
      kind === 'student' ? student : bus,
      issue,
      original,
    ])
  ).rows[0];
}

for (const kind of ['student', 'bus']) {
  test(`${kind} reprints keep the identical credential, ciphertext and scanner hash`, async (t) => {
    const db = await fixture(t);
    assert.equal((await get(db, kind)).print_status, 'missing');
    const first = await get(db, kind, true);
    assert.equal(first.print_status, 'ready');
    const next = await get(db, kind, true);
    assert.equal(first.raw_token, next.raw_token);
    assert.equal(first.credential_id, next.credential_id);
    const saved = (
      await db.query(
        `select token_cipher from safebus_private.${kind}_qr_prints where credential_id=$1`,
        [first.credential_id],
      )
    ).rows[0].token_cipher;
    assert.ok(!Buffer.from(saved).includes(Buffer.from(first.raw_token)));
    const hashed = (
      await db.query(`select token_hash,status from ${kind}_qr_credentials where id=$1`, [
        first.credential_id,
      ])
    ).rows[0];
    assert.equal(hashed.status, 'active');
    assert.equal(
      hashed.token_hash,
      (
        await db.query(
          "select encode(extensions.digest(convert_to($1,'UTF8'),'sha256'),'hex') as hash",
          [first.raw_token],
        )
      ).rows[0].hash,
    );
    assert.equal(
      (await db.query(`select count(*)::int as n from ${kind}_qr_credentials`)).rows[0].n,
      1,
    );
  });
  test(`${kind} legacy originals are recovered without replacement and wrong originals cannot be saved`, async (t) => {
    const db = await fixture(t);
    const first = await get(db, kind, true);
    await db.query(`delete from safebus_private.${kind}_qr_prints where credential_id=$1`, [
      first.credential_id,
    ]);
    assert.equal((await get(db, kind, true)).print_status, 'needs_original');
    await assert.rejects(
      get(db, kind, false, 'sbus_qr_v1_' + 'B'.repeat(43)),
      (error) => error.code === '23514',
    );
    const recovered = await get(db, kind, false, first.raw_token);
    assert.equal(recovered.credential_id, first.credential_id);
    assert.equal(recovered.raw_token, first.raw_token);
    assert.equal((await get(db, kind)).raw_token, first.raw_token);
    assert.equal(
      (await db.query(`select count(*)::int as n from ${kind}_qr_credentials`)).rows[0].n,
      1,
    );
  });
  test(`${kind} old issuer signatures retain new reprints, while explicit revocation clears them`, async (t) => {
    const db = await fixture(t);
    const r = (
      await db.query(`select * from manage_${kind}_qr_credential($1,'generate')`, [
        kind === 'student' ? student : bus,
      ])
    ).rows[0];
    assert.equal((await get(db, kind)).raw_token, r.raw_token);
    await db.query(`select * from manage_${kind}_qr_credential($1,'revoke')`, [
      kind === 'student' ? student : bus,
    ]);
    assert.equal(
      (await db.query(`select count(*)::int as n from safebus_private.${kind}_qr_prints`)).rows[0]
        .n,
      0,
    );
    assert.equal((await get(db, kind)).print_status, 'missing');
  });
}
test('printing is tenant/session restricted and plaintext storage is never directly granted', async (t) => {
  const db = await fixture(t);
  await get(db, 'student', true);
  for (const [role, whichTenant, session] of [
    ['guardian', tenant, 'active'],
    ['driver', tenant, 'active'],
    ['tenant_admin', id(2), 'active'],
    ['tenant_admin', tenant, 'revoked'],
  ]) {
    await claims(db, role, whichTenant, session);
    await assert.rejects(get(db, 'student'), (error) => error.code === '42501');
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    for (const name of ['student_qr_prints', 'bus_qr_prints']) {
      assert.equal(
        (
          await db.query("select has_table_privilege($1,$2,'SELECT') as allowed", [
            role,
            'safebus_private.' + name,
          ])
        ).rows[0].allowed,
        false,
      );
    }
  }
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('anon','admin_get_printable_qr(text,uuid,boolean,text)','EXECUTE') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated','safebus_private.store_qr_print(text,uuid,text)','EXECUTE') as allowed",
      )
    ).rows[0].allowed,
    false,
  );
});
test('a missing encryption key rolls back issuance instead of losing the printable original', async (t) => {
  const db = await fixture(t);
  await db.exec('delete from vault.secrets');
  await assert.rejects(get(db, 'student', true));
  assert.equal(
    (await db.query('select count(*)::int as n from student_qr_credentials')).rows[0].n,
    0,
  );
});
