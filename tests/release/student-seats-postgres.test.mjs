import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const migrationPath =
  'supabase/migrations/pending/20261017154816_optional_student_seat_assignment.sql';
const migration = await fs.readFile(migrationPath, 'utf8');
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const tenant = id(1),
  otherTenant = id(2),
  bus = id(10),
  otherBus = id(11),
  route = id(20);
const forward = id(30),
  reverse = id(31),
  service = id(40),
  returnService = id(41);
const student = id(50),
  secondStudent = id(51),
  foreignStudent = id(52),
  driver = id(60),
  guardian = id(70);

async function fixture(t) {
  const db = new PGlite({ extensions: { btree_gist } });
  t.after(() => db.close());
  await db.exec(await fs.readFile('tests/release/fixtures/student-seats-baseline.sql', 'utf8'));
  // Retain the actual old RPC to prove older clients preserve seats.
  const old = (
    await fs.readFile(
      'supabase/migrations/0063_unified_direction_assignments_and_qr_selection.sql',
      'utf8',
    )
  )
    .match(/create or replace function public\.admin_set_student_bus_service\([\s\S]*?\$\$;/)[0]
    .replaceAll('public.current_tenant_id(', 'safebus_private.current_tenant_id(')
    .replaceAll(
      'public.is_transportation_write_admin(',
      'safebus_private.is_transportation_write_admin(',
    );
  await db.exec(old);
  await db.exec(migration);
  await db.query(`insert into profiles(id,tenant_id,role) values($1,$2,'tenant_admin')`, [
    id(90),
    tenant,
  ]);
  await db.query(
    `insert into buses(id,tenant_id,capacity,bus_number) values($1,$2,20,'B1'),($3,$2,null,'B2')`,
    [bus, tenant, otherBus],
  );
  await db.query(`insert into routes(id,tenant_id,route_name) values($1,$2,'Test route')`, [
    route,
    tenant,
  ]);
  await db.query(
    `insert into route_trip_patterns(id,tenant_id,route_id,direction,display_name)
    values($1,$3,$4,'forward','Outbound'),($2,$3,$4,'reverse','Return')`,
    [forward, reverse, tenant, route],
  );
  await db.query(
    `insert into bus_route_assignments(id,tenant_id,bus_id,route_id,route_trip_pattern_id)
    values($1,$3,$4,$5,$6),($2,$3,$4,$5,$7)`,
    [service, returnService, tenant, bus, route, forward, reverse],
  );
  await db.query(
    `insert into students(id,tenant_id,first_name,last_name) values
    ($1,$4,'Avery','Test'),($2,$4,'Blair','Test'),($3,$5,'Foreign','Test')`,
    [student, secondStudent, foreignStudent, tenant, otherTenant],
  );
  await db.query(`insert into drivers(id,tenant_id) values($1,$2)`, [driver, tenant]);
  await db.query(
    `insert into driver_trips(id,tenant_id,driver_id,bus_id,route_id,route_trip_pattern_id,trip_name_snapshot)
    values($1,$2,$3,$4,$5,$6,'Outbound')`,
    [id(80), tenant, driver, bus, route, forward],
  );
  await db.query(`insert into guardians(id,profile_id) values($1,$2)`, [guardian, id(71)]);
  await db.query(
    `insert into student_guardians(student_id,guardian_id,tenant_id) values($1,$2,$3)`,
    [student, guardian, tenant],
  );
  await db.exec(`create trigger student_bus_assignments_notify after insert or update on public.student_bus_assignments
    for each row execute function safebus_private.on_student_service_notification()`);
  await claims(db);
  return db;
}
async function claims(db, role = 'tenant_admin', tenantId = tenant, session = 'active') {
  await db.query(
    `select set_config('test.uid',$1,false),set_config('test.tenant',$2,false),
    set_config('test.role',$3,false),set_config('test.driver',$4,false),set_config('test.guardian',$5,false),set_config('test.session',$6,false)`,
    [id(90), tenantId, role, driver, guardian, session],
  );
}
async function assign(
  db,
  {
    seat = null,
    who = student,
    direction = 'both',
    from = '2090-01-01',
    to = null,
    existing = [],
  } = {},
) {
  return (
    await db.query(
      `select * from public.admin_set_student_bus_service_with_seat(
    p_student_id=>$1,p_bus_id=>$2,p_route_id=>$3,p_seat_number=>$4,p_direction_scope=>$5,
    p_effective_from=>$6,p_effective_to=>$7,p_existing_assignment_ids=>$8)`,
      [who, bus, route, seat, direction, from, to, existing],
    )
  ).rows;
}
const failure = (code) => (error) => error.code === code;

test('optional seats persist, change, clear, preserve old-client edits and suppress seat-only notifications', async (t) => {
  const db = await fixture(t);
  let rows = await assign(db);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.seat_number === null));
  const existing = rows.map((r) => r.id);
  rows = await assign(db, { seat: 12, existing });
  assert.ok(rows.every((r) => r.seat_number === 12));
  await db.exec('set role authenticated');
  const workspace = (await db.query('select get_admin_bus_workspace($1) as result', [bus])).rows[0]
    .result;
  assert.ok(workspace.studentAssignments.every((r) => r.seat_number === 12));
  await db.exec('reset role');
  const notifications = (await db.query('select count(*)::int as n from captured_notifications'))
    .rows[0].n;
  await assign(db, { seat: 15, existing });
  assert.equal(
    (await db.query('select count(*)::int as n from captured_notifications')).rows[0].n,
    notifications,
  );
  await db.query(
    `select * from public.admin_set_student_bus_service(p_student_id=>$1,p_bus_id=>$2,p_route_id=>$3,
    p_effective_from=>'2090-01-01',p_existing_assignment_ids=>$4)`,
    [student, bus, route, existing],
  );
  assert.ok(
    (await db.query('select seat_number from student_bus_assignments')).rows.every(
      (r) => r.seat_number === 15,
    ),
  );
  await assign(db, { seat: null, existing });
  assert.ok(
    (await db.query('select seat_number from student_bus_assignments')).rows.every(
      (r) => r.seat_number === null,
    ),
  );
});

test('seat dates, directions, lifecycle and atomic grouped conflicts are enforced by PostgreSQL', async (t) => {
  const db = await fixture(t);
  await assign(db, { seat: 12, direction: 'reverse', to: '2090-01-31' });
  await assert.rejects(
    assign(db, { seat: 12, who: secondStudent, to: '2090-02-01' }),
    failure('23P01'),
  );
  assert.equal(
    (
      await db.query('select count(*)::int as n from student_bus_assignments where student_id=$1', [
        secondStudent,
      ])
    ).rows[0].n,
    0,
  );
  await assign(db, { seat: 12, who: secondStudent, direction: 'forward', to: '2090-01-31' });
  await assert.rejects(
    assign(db, { seat: 12, direction: 'forward', from: '2090-01-31', to: '2090-02-01' }),
    failure('23P01'),
  );
  const next = await assign(db, { seat: 12, direction: 'forward', from: '2090-02-01' });
  await db.query("update student_bus_assignments set status='inactive' where id=$1", [next[0].id]);
  await assign(db, { seat: 12, who: secondStudent, direction: 'forward', from: '2090-02-01' });
  await assert.rejects(
    db.query("update student_bus_assignments set status='active' where id=$1", [next[0].id]),
    failure('23P01'),
  );
  await db.query("update student_bus_assignments set status='archived' where student_id=$1", [
    secondStudent,
  ]);
  await db.query("update student_bus_assignments set status='active' where id=$1", [next[0].id]);
});

test('positive integer and capacity rules cover direct writes, unknown capacity and service reactivation', async (t) => {
  const db = await fixture(t);
  for (const seat of [0, -1, 21]) await assert.rejects(assign(db, { seat }), failure('23514'));
  await assert.rejects(assign(db, { seat: 2147483648 }), failure('22003'));
  const rows = await assign(db, { seat: 20 });
  await assert.rejects(
    db.query('update student_bus_assignments set seat_number=21 where id=$1', [rows[0].id]),
    failure('23514'),
  );
  await assert.rejects(
    db.query('update buses set capacity=19 where id=$1', [bus]),
    failure('23514'),
  );
  await db.query('update buses set capacity=null where id=$1', [bus]);
  await assign(db, { seat: 2147483647, existing: rows.map((r) => r.id) });
  await assert.rejects(
    db.query('update buses set capacity=20 where id=$1', [bus]),
    failure('23514'),
  );
  await db.exec("update bus_route_assignments set status='inactive'");
  await db.query('update buses set capacity=20 where id=$1', [bus]);
  await assert.rejects(
    db.exec("update bus_route_assignments set status='active'"),
    failure('23514'),
  );
});

test('clearing releases a seat, separate services can reuse it, and missing directions cannot partly save', async (t) => {
  const db = await fixture(t);
  const rows = await assign(db, { seat: 12 });
  await assign(db, { seat: null, existing: rows.map((r) => r.id) });
  await assign(db, { seat: 12, who: secondStudent });
  await db.query(
    `insert into bus_route_assignments(id,tenant_id,bus_id,route_id,route_trip_pattern_id)
    values($1,$2,$3,$4,$5)`,
    [id(42), tenant, otherBus, route, forward],
  );
  await db.query(
    `insert into student_bus_assignments(tenant_id,student_id,bus_route_assignment_id,route_trip_pattern_id,seat_number)
    values($1,$2,$3,$4,12)`,
    [tenant, student, id(42), forward],
  );
  await db.query("update route_trip_patterns set status='inactive' where id=$1", [reverse]);
  await assert.rejects(assign(db, { seat: 5, from: '2095-01-01' }), failure('23514'));
  assert.equal(
    (await db.query('select count(*)::int as n from student_bus_assignments where seat_number=5'))
      .rows[0].n,
    0,
  );
});

test('authorized driver and linked guardian reads expose only scoped seats, including expired links and revoked sessions', async (t) => {
  const db = await fixture(t);
  await assign(db, { seat: 12, from: '2000-01-01' });
  await assign(db, { seat: 14, who: secondStudent, from: '2000-01-01' });
  await claims(db, 'driver');
  await db.exec('set role authenticated');
  assert.equal(
    (await db.query('select * from get_driver_active_trip_student_manifest_v2()')).rows.length,
    2,
  );
  await claims(db, 'guardian');
  const linked = (await db.query('select * from get_guardian_student_stops_v2()')).rows;
  assert.equal(linked.length, 2);
  assert.ok(linked.every((r) => r.student_id === student && r.seat_number === 12));
  await assert.rejects(assign(db, { seat: 1 }), failure('42501'));
  assert.deepEqual(
    (await db.query('update student_bus_assignments set seat_number=1 returning *')).rows,
    [],
  );
  await claims(db, 'driver', otherTenant);
  assert.deepEqual(
    (await db.query('select * from get_driver_active_trip_student_manifest_v2()')).rows,
    [],
  );
  await claims(db, 'guardian', tenant, 'revoked');
  await assert.rejects(db.query('select * from get_guardian_student_stops_v2()'), failure('42501'));
  await db.exec('reset role');
  await db.exec("update student_guardians set access_expires_at=now()-interval '1 day'");
  await claims(db, 'guardian');
  assert.deepEqual((await db.query('select * from get_guardian_student_stops_v2()')).rows, []);
  await claims(db);
  await assert.rejects(assign(db, { seat: 1, who: foreignStudent }), failure('23514'));
});

test('prepared migration grants only its reviewed API and rejects competing reservations', async (t) => {
  const db = await fixture(t);
  const surface = JSON.parse(
    await fs.readFile('config/pending/student-seat-authorization.json', 'utf8'),
  );
  for (const signature of surface.authenticated) {
    const result = (
      await db.query(
        `select has_function_privilege('anon',$1,'EXECUTE') as anon,
      has_function_privilege('authenticated',$1,'EXECUTE') as allowed`,
        ['public.' + signature],
      )
    ).rows[0];
    assert.equal(result.anon, false);
    assert.equal(result.allowed, true);
  }
  const results = await Promise.allSettled([
    assign(db, { seat: 5, direction: 'forward' }),
    assign(db, { seat: 5, direction: 'forward', who: secondStudent }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.find((r) => r.status === 'rejected').reason.code, '23P01');
  await db.exec('begin isolation level repeatable read');
  await assert.rejects(
    db.query('update buses set capacity=19 where id=$1', [bus]),
    failure('0A000'),
  );
  await db.exec('rollback');
});
