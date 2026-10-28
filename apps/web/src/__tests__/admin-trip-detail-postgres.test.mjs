// @vitest-environment node
import { beforeAll, afterAll, it, expect } from 'vitest';
import {
  tripDetailDb,
  tripDetailMigration,
  id,
} from '../../../../tests/release/fixtures/admin-trip-detail-db.mjs';

let db;
const result = async (sql, args = []) => (await db.query(sql, args)).rows[0].result;
const trip = async (n, status = 'active', date = '2026-10-28', pattern = 24, route = 22) =>
  db.query(
    `insert into driver_trips(id,tenant_id,driver_id,bus_id,route_id,route_trip_pattern_id,status,service_date,started_at,bus_number_snapshot,trip_name_snapshot)
  values($1,$2,$3,$4,$5,$6,$7,$8,now(),'Recorded bus','Recorded trip')`,
    [id(n), id(1), id(21), id(20), id(route), id(pattern), status, date],
  );
const isolated = async (run) => {
  await db.exec(
    `begin; select set_config('test.uid','${id(2)}',true),set_config('test.active','true',true),set_config('test.mfa','true',true);`,
  );
  try {
    await run();
  } finally {
    await db.exec('rollback');
  }
};
const list = (page = 1, status = null, from = null, to = null) =>
  result('select public.get_admin_trip_operations($1,$2,$3,$4,25) result', [
    from,
    to,
    status,
    page,
  ]);
const detail = (n) => result('select public.get_admin_trip_detail($1) result', [id(n)]);

beforeAll(async () => {
  db = await tripDetailDb();
  await db.exec(await tripDetailMigration());
}, 60_000);
afterAll(async () => db?.close());

it('orders ongoing trips first across dates, deduplicates by ID, and counts before pagination', () =>
  isolated(async () => {
    for (let n = 100; n < 127; n++) await trip(n, 'completed');
    await trip(128, 'active', '2025-01-01');
    await trip(129, 'paused', '2025-01-01');
    await db.exec('set local role authenticated');
    const first = await list();
    expect(first.totalCount).toBe(29);
    expect(first.rows).toHaveLength(25);
    expect(first.rows.slice(0, 2).map((r) => r.status)).toEqual(['active', 'paused']);
    const second = await list(2);
    expect(second.rows).toHaveLength(4);
    expect(new Set([...first.rows, ...second.rows].map((r) => r.trip_id)).size).toBe(29);
    expect((await list(1, 'ongoing')).totalCount).toBe(2);
    expect((await list(1, null, '2026-10-28', '2026-10-28')).totalCount).toBe(27);
    await expect(list(0)).rejects.toMatchObject({ code: '22023' });
  }));

it.each([2, 3, 4])(
  'permits authorized admin role %s with caller RLS and school boundaries',
  (role) =>
    isolated(async () => {
      await trip(100);
      await trip(101, 'active', '2026-10-28', 26, 23);
      await db.query("select set_config('test.uid',$1,true)", [id(role)]);
      await db.exec('set local role authenticated');
      expect((await list()).totalCount).toBe(role === 3 ? 1 : 2);
      expect((await detail(100)).trip.bus_label).toBe('Recorded bus');
      expect(await detail(101)).toEqual(role === 3 ? null : expect.any(Object));
    }),
);

it.each([5, 6, 7].flatMap((role) => ['list', 'detail'].map((endpoint) => [role, endpoint])))(
  'rejects driver/guardian/platform role %s on %s RPC',
  (role, endpoint) =>
    isolated(async () => {
      await db.query("select set_config('test.uid',$1,true)", [id(role)]);
      await db.exec('set local role authenticated');
      await expect(endpoint === 'list' ? list() : detail(100)).rejects.toMatchObject({
        code: '42501',
      });
    }),
);

it.each(['test.active', 'test.mfa'])('rejects missing session or MFA: %s', (setting) =>
  isolated(async () => {
    await db.query('select set_config($1,$2,true)', [setting, 'false']);
    await db.exec('set local role authenticated');
    await expect(detail(100)).rejects.toMatchObject({ code: '42501' });
  }),
);

it('rejects suspended accounts and hides another authority or missing trip', () =>
  isolated(async () => {
    await trip(100);
    await db.query("select set_config('test.uid',$1,true)", [id(8)]);
    await db.exec('set local role authenticated');
    expect(await detail(100)).toBeNull();
    expect((await list()).totalCount).toBe(0);
    await db.exec('reset role');
    await db.query("update profiles set status='inactive' where id=$1", [id(2)]);
    await db.query("select set_config('test.uid',$1,true)", [id(2)]);
    await db.exec('set local role authenticated');
    await expect(list()).rejects.toMatchObject({ code: '42501' });
  }));

it('retains event-only students, separates assignment/travel, and filters another school', () =>
  isolated(async () => {
    await trip(100, 'completed');
    for (const n of [41, 42])
      await db.query('insert into student_trip_events values($1,$2,$3,$4,now(),$5)', [
        id(1),
        id(100),
        id(n),
        'picked_up',
        id(30),
      ]);
    await db.exec('set local role authenticated');
    const all = await detail(100);
    expect(all.students).toHaveLength(3);
    expect(all.students.find((s) => s.id === id(41))).toMatchObject({
      hasAssignment: false,
      pickedUpAt: expect.any(String),
      seat: null,
    });
    expect(all.students.find((s) => s.id === id(40))).toMatchObject({
      hasAssignment: true,
      pickedUpAt: null,
      seat: 4,
    });
    await db.exec('reset role');
    await db.query("select set_config('test.uid',$1,true)", [id(3)]);
    await db.exec('set local role authenticated');
    expect((await detail(100)).students.map((s) => s.id).sort()).toEqual([id(40), id(41)]);
    expect(
      (await db.query('select student_id from student_trip_events')).rows.map((s) => s.student_id),
    ).toEqual([id(41)]);
  }));

it('uses travel order and stored shape; completed trips never return current location', () =>
  isolated(async () => {
    await trip(100);
    await trip(101, 'completed', '2026-10-28', 25);
    await db.query('insert into route_shapes values($1,$2,$3,$4,1,$5)', [
      id(50),
      id(1),
      id(22),
      JSON.stringify({
        type: 'LineString',
        coordinates: [
          [-113, 53],
          [-113, 53.01],
        ],
      }),
      'archived',
    ]);
    await db.query('update driver_trips set route_shape_id=$1 where id=$2', [id(50), id(101)]);
    for (const n of [100, 101])
      await db.query(
        'insert into driver_trip_current_locations values($1,$2,$3,$4,$5,53,-113,now(),10,5)',
        [id(n), id(1), id(21), id(20), id(22)],
      );
    await db.exec('set local role authenticated');
    expect((await detail(100)).stops.map((s) => s.name)).toEqual(['Start', 'School']);
    expect((await detail(100)).location.state).toBe('live');
    const past = await detail(101);
    expect(past.stops.map((s) => s.name)).toEqual(['School', 'Start']);
    expect(past.shape.basis).toBe('trip');
    expect(past.location).toBeNull();
    expect((await list()).rows.find((r) => r.trip_id === id(101)).location_status).toBe(
      'not_applicable',
    );
  }));

it('enforces anonymous ACLs and preserves missing/stale GPS trips', () =>
  isolated(async () => {
    await trip(100);
    await trip(101);
    await db.query(
      "insert into driver_trip_current_locations values($1,$2,$3,$4,$5,53,-113,now()-interval '3 minutes',10,5)",
      [id(101), id(1), id(21), id(20), id(22)],
    );
    await db.exec('set local role authenticated');
    expect((await list()).rows.map((r) => r.location_status).sort()).toEqual(['missing', 'stale']);
    expect((await list()).rows.every((r) => r.eta_label === null)).toBe(true);
    await db.exec('reset role; set local role anon');
    await expect(detail(100)).rejects.toMatchObject({ code: '42501' });
  }));
